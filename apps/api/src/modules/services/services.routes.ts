import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFoundError } from '../../lib/errors.js';

const createServiceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive(),
  basePrice: z.number().nonnegative(),
});

const updateServiceSchema = createServiceSchema.partial().extend({
  active: z.boolean().optional(),
});

export const servicesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const query = z.object({ active: z.coerce.boolean().optional() }).parse(request.query);
    return fastify.prisma.service.findMany({
      where: query.active === undefined ? {} : { active: query.active },
      orderBy: { name: 'asc' },
    });
  });

  fastify.get('/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const service = await fastify.prisma.service.findUnique({
      where: { id },
      include: { barberServices: { include: { barber: true } } },
    });
    if (!service) throw new NotFoundError('Service not found');
    return service;
  });

  fastify.post(
    '/',
    { preHandler: fastify.requireRole('OWNER', 'ADMIN') },
    async (request, reply) => {
      const body = createServiceSchema.parse(request.body);
      const service = await fastify.prisma.service.create({ data: body });
      reply.code(201).send(service);
    },
  );

  fastify.patch(
    '/:id',
    { preHandler: fastify.requireRole('OWNER', 'ADMIN') },
    async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const body = updateServiceSchema.parse(request.body);
      return fastify.prisma.service.update({ where: { id }, data: body });
    },
  );
};
