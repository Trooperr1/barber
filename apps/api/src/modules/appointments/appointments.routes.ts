import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { addMinutes } from 'date-fns';
import { NotFoundError, SlotConflictError, BadRequestError } from '../../lib/errors.js';
import { assertBarberScope, isElevated } from '../../lib/authz.js';
import {
  effectiveBufferMinutes,
  findFirstAvailableSlot,
  getBarberAvailability,
  isSlotFree,
} from '../../lib/availability.js';
import { toCsv } from '../../lib/csv.js';

const APPOINTMENT_SOURCES = ['ONLINE', 'WALK_IN', 'PHONE'] as const;
const APPOINTMENT_STATUSES = ['BOOKED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

const availabilityQuerySchema = z.object({
  serviceId: z.string(),
  barberId: z.string().optional(), // omitted or "any" => first available across all barbers offering the service
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const newClientSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(3),
  email: z.string().email().optional(),
});

const createAppointmentSchema = z.object({
  clientId: z.string().optional(),
  newClient: newClientSchema.optional(),
  barberId: z.string().optional(), // omitted/"any" resolves via findFirstAvailableSlot
  serviceId: z.string(),
  startTime: z.coerce.date().optional(), // required unless barberId is "any"/omitted
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // required when resolving "any"
  source: z.enum(APPOINTMENT_SOURCES),
  notes: z.string().optional(),
});

const updateAppointmentSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  notes: z.string().optional(),
  priceCharged: z.number().nonnegative().optional(),
});

const rescheduleSchema = z.object({
  startTime: z.coerce.date(),
});

async function getShopTimezone(prisma: PrismaClient): Promise<string> {
  const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });
  return settings?.timezone ?? 'America/New_York';
}

export const appointmentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/availability', async (request) => {
    const query = availabilityQuerySchema.parse(request.query);
    const timezone = await getShopTimezone(fastify.prisma);

    if (query.barberId && query.barberId !== 'any') {
      const slots = await getBarberAvailability({
        prisma: fastify.prisma,
        barberId: query.barberId,
        serviceId: query.serviceId,
        dateStr: query.date,
        timezone,
      });
      return { slots: slots.map((s) => ({ barberId: query.barberId, start: s.start, end: s.end })) };
    }

    const barberServices = await fastify.prisma.barberService.findMany({
      where: { serviceId: query.serviceId, active: true, barber: { active: true } },
      select: { barberId: true },
    });
    const results = await Promise.all(
      barberServices.map(async ({ barberId }) => {
        const slots = await getBarberAvailability({
          prisma: fastify.prisma,
          barberId,
          serviceId: query.serviceId,
          dateStr: query.date,
          timezone,
        });
        return slots.map((s) => ({ barberId, start: s.start, end: s.end }));
      }),
    );
    const flattened = results.flat().sort((a, b) => a.start.getTime() - b.start.getTime());
    return { slots: flattened };
  });

  fastify.get('/', async (request) => {
    const query = z
      .object({
        barberId: z.string().optional(),
        clientId: z.string().optional(),
        status: z.enum(APPOINTMENT_STATUSES).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
      .parse(request.query);

    const barberId = request.user.role === 'BARBER' ? request.user.barberId : query.barberId;

    return fastify.prisma.appointment.findMany({
      where: {
        ...(barberId ? { barberId } : {}),
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.from ? { endTime: { gt: query.from } } : {}),
        ...(query.to ? { startTime: { lt: query.to } } : {}),
      },
      include: {
        client: { select: { id: true, name: true, phone: true, noShowCount: true, cancellationCount: true } },
        barber: { select: { id: true, displayName: true } },
        service: { select: { id: true, name: true, durationMinutes: true } },
      },
      orderBy: { startTime: 'asc' },
    });
  });

  fastify.get(
    '/export.csv',
    { preHandler: fastify.requireRole('OWNER', 'ADMIN') },
    async (request, reply) => {
      const query = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(
        request.query,
      );
      const appointments = await fastify.prisma.appointment.findMany({
        where: {
          ...(query.from ? { startTime: { gte: query.from } } : {}),
          ...(query.to ? { startTime: { lte: query.to } } : {}),
        },
        include: { client: true, barber: true, service: true },
        orderBy: { startTime: 'asc' },
      });
      const rows = appointments.map((a) => ({
        id: a.id,
        date: a.startTime.toISOString(),
        client: a.client.name,
        phone: a.client.phone,
        barber: a.barber.displayName,
        service: a.service.name,
        status: a.status,
        source: a.source,
        priceCharged: a.priceCharged?.toString() ?? '',
      }));
      const csv = toCsv(rows, [
        'id',
        'date',
        'client',
        'phone',
        'barber',
        'service',
        'status',
        'source',
        'priceCharged',
      ]);
      reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', 'attachment; filename="appointments.csv"');
      return csv;
    },
  );

  fastify.get('/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const appointment = await fastify.prisma.appointment.findUnique({
      where: { id },
      include: { client: true, barber: true, service: true },
    });
    if (!appointment) throw new NotFoundError('Appointment not found');
    if (!isElevated(request)) assertBarberScope(request, appointment.barberId);
    return appointment;
  });

  fastify.post('/', async (request, reply) => {
    const body = createAppointmentSchema.parse(request.body);

    if (!body.clientId && !body.newClient) {
      throw new BadRequestError('Either clientId or newClient must be provided');
    }

    const service = await fastify.prisma.service.findUnique({ where: { id: body.serviceId } });
    if (!service || !service.active) throw new NotFoundError('Service not found');

    const timezone = await getShopTimezone(fastify.prisma);

    let barberId = body.barberId;
    let startTime = body.startTime;

    if (!barberId || barberId === 'any') {
      if (!body.date) throw new BadRequestError('date is required to resolve "any" barber');
      const barberServices = await fastify.prisma.barberService.findMany({
        where: { serviceId: body.serviceId, active: true, barber: { active: true } },
        select: { barberId: true },
      });
      const resolved = await findFirstAvailableSlot({
        prisma: fastify.prisma,
        barberIds: barberServices.map((b) => b.barberId),
        serviceId: body.serviceId,
        dateStr: body.date,
        timezone,
      });
      if (!resolved) throw new SlotConflictError('No barbers are available for that day');
      barberId = resolved.barberId;
      startTime = resolved.start;
    }

    if (!startTime) throw new BadRequestError('startTime is required');
    if (!isElevated(request)) assertBarberScope(request, barberId);

    const [barber, shopSettings, barberService] = await Promise.all([
      fastify.prisma.barber.findUnique({ where: { id: barberId } }),
      fastify.prisma.shopSettings.findUnique({ where: { id: 1 } }),
      fastify.prisma.barberService.findUnique({
        where: { barberId_serviceId: { barberId, serviceId: body.serviceId } },
      }),
    ]);
    if (!barber || !barber.active) throw new NotFoundError('Barber not found');
    if (!barberService || !barberService.active) {
      throw new BadRequestError('This barber does not offer the selected service');
    }
    if (!shopSettings) throw new Error('ShopSettings singleton row is missing');

    const endTime = addMinutes(startTime, service.durationMinutes);
    const bufferMinutes = effectiveBufferMinutes(barber, shopSettings);

    const free = await isSlotFree({ prisma: fastify.prisma, barberId, startTime, endTime, bufferMinutes });
    if (!free) throw new SlotConflictError('That time slot is no longer available');

    let clientId = body.clientId;
    if (!clientId && body.newClient) {
      const client = await fastify.prisma.client.upsert({
        where: { phone: body.newClient.phone },
        create: body.newClient,
        update: { name: body.newClient.name, email: body.newClient.email },
      });
      clientId = client.id;
    }

    const priceCharged = barberService.priceOverride ?? service.basePrice;

    const appointment = await fastify.prisma.appointment.create({
      data: {
        clientId: clientId!,
        barberId,
        serviceId: body.serviceId,
        startTime,
        endTime,
        source: body.source,
        notes: body.notes,
        priceCharged,
        createdById: request.user.sub,
      },
      include: { client: true, barber: true, service: true },
    });
    reply.code(201).send(appointment);
  });

  fastify.patch('/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = updateAppointmentSchema.parse(request.body);

    const appointment = await fastify.prisma.appointment.findUnique({ where: { id } });
    if (!appointment) throw new NotFoundError('Appointment not found');
    if (!isElevated(request)) assertBarberScope(request, appointment.barberId);

    if (body.status && body.status !== appointment.status && appointment.status !== 'BOOKED') {
      return reply.code(409).send({ error: 'Only booked appointments can change status' });
    }

    const data: Record<string, unknown> = {};
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.priceCharged !== undefined) data.priceCharged = body.priceCharged;

    if (body.status && body.status !== appointment.status) {
      data.status = body.status;
      if (body.status === 'COMPLETED') data.completedAt = new Date();
      if (body.status === 'CANCELLED') data.cancelledAt = new Date();

      if (body.status === 'NO_SHOW') {
        await fastify.prisma.client.update({
          where: { id: appointment.clientId },
          data: { noShowCount: { increment: 1 } },
        });
      }
      if (body.status === 'CANCELLED') {
        await fastify.prisma.client.update({
          where: { id: appointment.clientId },
          data: { cancellationCount: { increment: 1 } },
        });
      }
    }

    const updated = await fastify.prisma.appointment.update({
      where: { id },
      data,
      include: { client: true, barber: true, service: true },
    });
    return updated;
  });

  fastify.post('/:id/reschedule', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = rescheduleSchema.parse(request.body);

    const appointment = await fastify.prisma.appointment.findUnique({
      where: { id },
      include: { service: true, barber: true },
    });
    if (!appointment) throw new NotFoundError('Appointment not found');
    if (!isElevated(request)) assertBarberScope(request, appointment.barberId);
    if (appointment.status !== 'BOOKED') {
      throw new BadRequestError('Only booked appointments can be rescheduled');
    }

    const shopSettings = await fastify.prisma.shopSettings.findUnique({ where: { id: 1 } });
    if (!shopSettings) throw new Error('ShopSettings singleton row is missing');

    const endTime = addMinutes(body.startTime, appointment.service.durationMinutes);
    const bufferMinutes = effectiveBufferMinutes(appointment.barber, shopSettings);

    const free = await isSlotFree({
      prisma: fastify.prisma,
      barberId: appointment.barberId,
      startTime: body.startTime,
      endTime,
      bufferMinutes,
      excludeAppointmentId: appointment.id,
    });
    if (!free) throw new SlotConflictError('That time slot is no longer available');

    return fastify.prisma.appointment.update({
      where: { id },
      data: { startTime: body.startTime, endTime },
      include: { client: true, barber: true, service: true },
    });
  });
};
