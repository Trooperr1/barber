import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import { ForbiddenError } from './lib/authz.js';
import { NotFoundError, SlotConflictError, BadRequestError } from './lib/errors.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { barbersRoutes } from './modules/barbers/barbers.routes.js';
import { servicesRoutes } from './modules/services/services.routes.js';
import { clientsRoutes } from './modules/clients/clients.routes.js';
import { appointmentsRoutes } from './modules/appointments/appointments.routes.js';
import { timeBlocksRoutes } from './modules/timeblocks/timeblocks.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { publicRoutes } from './modules/public/public.routes.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(sensible);
  await app.register(cors, { origin: true });
  await app.register(prismaPlugin);
  await app.register(authPlugin);

  app.get('/health', async () => ({ status: 'ok' }));

  // Registered before the route plugins: Fastify's encapsulation means a
  // handler set after a plugin is registered would not apply to that
  // plugin's context, so this must come first to cover every route below.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'ValidationError', issues: error.issues });
    }
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return reply.code(403).send({ error: error.message });
    }
    if (error instanceof SlotConflictError) {
      return reply.code(409).send({ error: error.message });
    }
    if (error instanceof BadRequestError) {
      return reply.code(400).send({ error: error.message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return reply.code(404).send({ error: 'Not found' });
      if (error.code === 'P2002') return reply.code(409).send({ error: 'Conflict: duplicate value' });
    }

    request.log.error(error);
    return reply.code(500).send({ error: 'Internal server error' });
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(barbersRoutes, { prefix: '/api/barbers' });
  await app.register(servicesRoutes, { prefix: '/api/services' });
  await app.register(clientsRoutes, { prefix: '/api/clients' });
  await app.register(appointmentsRoutes, { prefix: '/api/appointments' });
  await app.register(timeBlocksRoutes, { prefix: '/api/time-blocks' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await app.register(publicRoutes, { prefix: '/api/public' });

  return app;
}
