import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotFoundError } from '../../lib/errors.js';
import { isElevated } from '../../lib/authz.js';
import { toCsv } from '../../lib/csv.js';

const createClientSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(3),
  email: z.string().email().optional(),
  generalNotes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const updateClientSchema = createClientSchema.partial();

const barberNoteSchema = z.object({
  barberId: z.string().optional(),
  note: z.string(),
});

export const clientsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const query = z
      .object({
        search: z.string().optional(),
        tag: z.string().optional(),
        lastVisitBefore: z.coerce.date().optional(),
        lastVisitAfter: z.coerce.date().optional(),
        limit: z.coerce.number().int().positive().max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);

    const clients = await fastify.prisma.client.findMany({
      where: {
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { phone: { contains: query.search } },
              ],
            }
          : {}),
        ...(query.tag ? { tags: { has: query.tag } } : {}),
      },
      include: { appointments: { orderBy: { startTime: 'desc' }, take: 1 } },
      orderBy: { name: 'asc' },
    });

    let withLastVisit = clients.map((c) => ({
      ...c,
      appointments: undefined,
      lastVisit: c.appointments[0]?.startTime ?? null,
    }));

    if (query.lastVisitBefore) {
      withLastVisit = withLastVisit.filter((c) => c.lastVisit && c.lastVisit < query.lastVisitBefore!);
    }
    if (query.lastVisitAfter) {
      withLastVisit = withLastVisit.filter((c) => c.lastVisit && c.lastVisit > query.lastVisitAfter!);
    }

    const total = withLastVisit.length;
    const page = withLastVisit.slice(query.offset, query.offset + query.limit);
    return { total, clients: page };
  });

  fastify.get(
    '/export.csv',
    { preHandler: fastify.requireRole('OWNER', 'ADMIN') },
    async (_request, reply) => {
      const clients = await fastify.prisma.client.findMany({
        include: { appointments: { orderBy: { startTime: 'desc' }, take: 1 } },
        orderBy: { name: 'asc' },
      });
      const rows = clients.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email ?? '',
        tags: c.tags.join('|'),
        noShowCount: c.noShowCount,
        cancellationCount: c.cancellationCount,
        lastVisit: c.appointments[0]?.startTime.toISOString() ?? '',
        createdAt: c.createdAt.toISOString(),
      }));
      const csv = toCsv(rows, [
        'id',
        'name',
        'phone',
        'email',
        'tags',
        'noShowCount',
        'cancellationCount',
        'lastVisit',
        'createdAt',
      ]);
      reply.header('Content-Type', 'text/csv').header('Content-Disposition', 'attachment; filename="clients.csv"');
      return csv;
    },
  );

  fastify.get('/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const client = await fastify.prisma.client.findUnique({
      where: { id },
      include: {
        appointments: {
          orderBy: { startTime: 'desc' },
          include: { barber: { select: { displayName: true } }, service: { select: { name: true } } },
        },
        barberNotes: {
          include: { barber: { select: { displayName: true } } },
          ...(request.user.role === 'BARBER' ? { where: { barberId: request.user.barberId } } : {}),
        },
      },
    });
    if (!client) throw new NotFoundError('Client not found');
    return client;
  });

  fastify.post('/', async (request, reply) => {
    const body = createClientSchema.parse(request.body);
    const client = await fastify.prisma.client.create({ data: { ...body, tags: body.tags ?? [] } });
    reply.code(201).send(client);
  });

  fastify.patch('/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = updateClientSchema.parse(request.body);
    return fastify.prisma.client.update({ where: { id }, data: body });
  });

  fastify.put('/:id/barber-notes', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = barberNoteSchema.parse(request.body);

    const barberId = request.user.role === 'BARBER' ? request.user.barberId : body.barberId;
    if (!barberId) {
      return reply.code(400).send({ error: 'barberId is required' });
    }
    if (request.user.role === 'BARBER' && barberId !== request.user.barberId) {
      return reply.code(403).send({ error: 'Barbers may only edit their own notes' });
    }

    const note = await fastify.prisma.clientBarberNote.upsert({
      where: { clientId_barberId: { clientId: id, barberId } },
      create: { clientId: id, barberId, note: body.note },
      update: { note: body.note },
    });
    reply.send(note);
  });
};
