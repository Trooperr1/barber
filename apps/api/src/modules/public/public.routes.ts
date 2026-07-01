import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addMinutes } from 'date-fns';
import { env } from '../../config/env.js';
import { NotFoundError, SlotConflictError, BadRequestError } from '../../lib/errors.js';
import { effectiveBufferMinutes, findFirstAvailableSlot, getBarberAvailability, isSlotFree } from '../../lib/availability.js';
import { notifications } from '../../lib/notifications.js';

const availabilityQuerySchema = z.object({
  serviceId: z.string(),
  barberId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const bookSchema = z.object({
  serviceId: z.string(),
  barberId: z.string(),
  startTime: z.coerce.date(),
  client: z.object({
    name: z.string().min(1),
    phone: z.string().min(3),
    email: z.string().email().optional(),
  }),
});

const contactSchema = z.object({ contact: z.string().min(1) });
const rescheduleSchema = contactSchema.extend({ startTime: z.coerce.date() });

function normalizeContact(value: string): string {
  return value.trim().toLowerCase();
}

function contactMatches(client: { phone: string; email: string | null }, contact: string): boolean {
  const normalized = normalizeContact(contact);
  return (
    normalizeContact(client.phone) === normalized || (!!client.email && normalizeContact(client.email) === normalized)
  );
}

function manageLink(cancelToken: string): string {
  return `${env.WEB_BASE_URL}/manage/${cancelToken}`;
}

export const publicRoutes: FastifyPluginAsync = async (fastify) => {
  async function shopTimezone(): Promise<string> {
    const settings = await fastify.prisma.shopSettings.findUnique({ where: { id: 1 } });
    return settings?.timezone ?? 'America/New_York';
  }

  fastify.get('/services', async () => {
    return fastify.prisma.service.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  });

  fastify.get('/barbers', async () => {
    const barbers = await fastify.prisma.barber.findMany({
      where: { active: true },
      select: {
        id: true,
        displayName: true,
        bio: true,
        services: { where: { active: true }, select: { serviceId: true, priceOverride: true } },
      },
      orderBy: { displayName: 'asc' },
    });
    return barbers;
  });

  fastify.get('/availability', async (request) => {
    const query = availabilityQuerySchema.parse(request.query);
    const timezone = await shopTimezone();

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
    return { slots: results.flat().sort((a, b) => a.start.getTime() - b.start.getTime()) };
  });

  fastify.post('/appointments', async (request, reply) => {
    const body = bookSchema.parse(request.body);

    const [service, barber, shopSettings, barberService] = await Promise.all([
      fastify.prisma.service.findUnique({ where: { id: body.serviceId } }),
      fastify.prisma.barber.findUnique({ where: { id: body.barberId } }),
      fastify.prisma.shopSettings.findUnique({ where: { id: 1 } }),
      fastify.prisma.barberService.findUnique({
        where: { barberId_serviceId: { barberId: body.barberId, serviceId: body.serviceId } },
      }),
    ]);
    if (!service || !service.active) throw new NotFoundError('Service not found');
    if (!barber || !barber.active) throw new NotFoundError('Barber not found');
    if (!barberService || !barberService.active) {
      throw new BadRequestError('This barber does not offer the selected service');
    }
    if (!shopSettings) throw new Error('ShopSettings singleton row is missing');

    const endTime = addMinutes(body.startTime, service.durationMinutes);
    const bufferMinutes = effectiveBufferMinutes(barber, shopSettings);

    const free = await isSlotFree({
      prisma: fastify.prisma,
      barberId: body.barberId,
      startTime: body.startTime,
      endTime,
      bufferMinutes,
    });
    if (!free) throw new SlotConflictError('That time slot is no longer available');

    const client = await fastify.prisma.client.upsert({
      where: { phone: body.client.phone },
      create: body.client,
      update: { name: body.client.name, email: body.client.email },
    });

    const priceCharged = barberService.priceOverride ?? service.basePrice;

    const appointment = await fastify.prisma.appointment.create({
      data: {
        clientId: client.id,
        barberId: body.barberId,
        serviceId: body.serviceId,
        startTime: body.startTime,
        endTime,
        source: 'ONLINE',
        priceCharged,
      },
      include: { barber: true, service: true },
    });

    const link = manageLink(appointment.cancelToken);
    const when = appointment.startTime.toLocaleString();
    const message = `You're booked with ${appointment.barber.displayName} for ${appointment.service.name} on ${when}. Manage your appointment: ${link}`;
    if (client.email) {
      await notifications.send({ to: client.email, channel: 'email', subject: 'Appointment confirmed', message });
    }
    await notifications.send({ to: client.phone, channel: 'sms', message });

    reply.code(201).send({
      id: appointment.id,
      cancelToken: appointment.cancelToken,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      manageLink: link,
    });
  });

  fastify.get('/appointments/:token', async (request) => {
    const { token } = z.object({ token: z.string() }).parse(request.params);
    const { contact } = contactSchema.parse(request.query);

    const appointment = await fastify.prisma.appointment.findUnique({
      where: { cancelToken: token },
      include: { client: true, barber: true, service: true },
    });
    if (!appointment || !contactMatches(appointment.client, contact)) {
      throw new NotFoundError('Appointment not found');
    }
    return appointment;
  });

  fastify.post('/appointments/:token/cancel', async (request) => {
    const { token } = z.object({ token: z.string() }).parse(request.params);
    const body = contactSchema.parse(request.body);

    const appointment = await fastify.prisma.appointment.findUnique({
      where: { cancelToken: token },
      include: { client: true },
    });
    if (!appointment || !contactMatches(appointment.client, body.contact)) {
      throw new NotFoundError('Appointment not found');
    }
    if (appointment.status !== 'BOOKED') {
      throw new BadRequestError('Only booked appointments can be cancelled');
    }

    const [updated] = await fastify.prisma.$transaction([
      fastify.prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      }),
      fastify.prisma.client.update({
        where: { id: appointment.clientId },
        data: { cancellationCount: { increment: 1 } },
      }),
    ]);
    return updated;
  });

  fastify.post('/appointments/:token/reschedule', async (request) => {
    const { token } = z.object({ token: z.string() }).parse(request.params);
    const body = rescheduleSchema.parse(request.body);

    const appointment = await fastify.prisma.appointment.findUnique({
      where: { cancelToken: token },
      include: { client: true, barber: true, service: true },
    });
    if (!appointment || !contactMatches(appointment.client, body.contact)) {
      throw new NotFoundError('Appointment not found');
    }
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
      where: { id: appointment.id },
      data: { startTime: body.startTime, endTime, reminderSentAt: null },
    });
  });
};
