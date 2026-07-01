import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFoundError } from '../../lib/errors.js';
import { assertBarberScope, isElevated } from '../../lib/authz.js';

const updateBarberSchema = z.object({
  displayName: z.string().min(1).optional(),
  bio: z.string().optional(),
  active: z.boolean().optional(),
  bufferMinutesOverride: z.number().int().min(0).nullable().optional(),
});

const workingHoursSchema = z.object({
  hours: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1440),
        endMinute: z.number().int().min(0).max(1440),
        isOff: z.boolean(),
      }),
    )
    .length(7),
});

const barberServicesSchema = z.object({
  services: z.array(
    z.object({
      serviceId: z.string(),
      active: z.boolean(),
      priceOverride: z.number().nonnegative().nullable().optional(),
    }),
  ),
});

export const barbersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const query = z.object({ active: z.coerce.boolean().optional() }).parse(request.query);
    return fastify.prisma.barber.findMany({
      where: query.active === undefined ? {} : { active: query.active },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { displayName: 'asc' },
    });
  });

  fastify.get('/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const barber = await fastify.prisma.barber.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true } },
        workingHours: { orderBy: { dayOfWeek: 'asc' } },
        services: { include: { service: true } },
      },
    });
    if (!barber) throw new NotFoundError('Barber not found');
    return barber;
  });

  fastify.patch(
    '/:id',
    { preHandler: fastify.requireRole('OWNER', 'ADMIN') },
    async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const body = updateBarberSchema.parse(request.body);
      return fastify.prisma.barber.update({ where: { id }, data: body });
    },
  );

  fastify.put('/:id/working-hours', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    if (!isElevated(request)) assertBarberScope(request, id);
    const body = workingHoursSchema.parse(request.body);

    await fastify.prisma.$transaction(
      body.hours.map((h) =>
        fastify.prisma.barberWorkingHours.upsert({
          where: { barberId_dayOfWeek: { barberId: id, dayOfWeek: h.dayOfWeek } },
          create: { barberId: id, ...h },
          update: h,
        }),
      ),
    );
    reply.send({ ok: true });
  });

  fastify.put(
    '/:id/services',
    { preHandler: fastify.requireRole('OWNER', 'ADMIN') },
    async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const body = barberServicesSchema.parse(request.body);

      await fastify.prisma.$transaction(
        body.services.map((s) =>
          fastify.prisma.barberService.upsert({
            where: { barberId_serviceId: { barberId: id, serviceId: s.serviceId } },
            create: { barberId: id, serviceId: s.serviceId, active: s.active, priceOverride: s.priceOverride },
            update: { active: s.active, priceOverride: s.priceOverride },
          }),
        ),
      );
      reply.send({ ok: true });
    },
  );
};
