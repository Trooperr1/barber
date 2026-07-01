import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFoundError } from '../../lib/errors.js';
import { assertBarberScope, isElevated } from '../../lib/authz.js';

const TIME_BLOCK_REASONS = ['LUNCH', 'PERSONAL', 'NO_SHOW_RESCHEDULE', 'OTHER'] as const;

const createTimeBlockSchema = z.object({
  barberId: z.string(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  reason: z.enum(TIME_BLOCK_REASONS),
  notes: z.string().optional(),
});

export const timeBlocksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const query = z
      .object({
        barberId: z.string().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
      .parse(request.query);

    const barberId = request.user.role === 'BARBER' ? request.user.barberId : query.barberId;

    return fastify.prisma.timeBlock.findMany({
      where: {
        ...(barberId ? { barberId } : {}),
        ...(query.from ? { endTime: { gt: query.from } } : {}),
        ...(query.to ? { startTime: { lt: query.to } } : {}),
      },
      orderBy: { startTime: 'asc' },
    });
  });

  fastify.post('/', async (request, reply) => {
    const body = createTimeBlockSchema.parse(request.body);
    if (!isElevated(request)) assertBarberScope(request, body.barberId);

    if (body.endTime <= body.startTime) {
      return reply.code(400).send({ error: 'endTime must be after startTime' });
    }

    const block = await fastify.prisma.timeBlock.create({ data: body });
    reply.code(201).send(block);
  });

  fastify.delete('/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const block = await fastify.prisma.timeBlock.findUnique({ where: { id } });
    if (!block) throw new NotFoundError('Time block not found');
    if (!isElevated(request)) assertBarberScope(request, block.barberId);

    await fastify.prisma.timeBlock.delete({ where: { id } });
    reply.code(204).send();
  });
};
