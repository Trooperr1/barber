import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@barbershop/shared';
import { env } from '../config/env.js';

export interface AuthTokenPayload {
  sub: string;
  role: Role;
  barberId?: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthTokenPayload;
    user: AuthTokenPayload;
  }

  // The "refresh" namespace registered below exposes a second sign/verify/
  // decode surface at fastify.jwt.refresh, which the upstream types don't
  // model for namespaced registrations — extend it explicitly here.
  interface JWT {
    refresh: fastifyJwt.JWT;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      ...roles: Role[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (fastify) => {
  await fastify.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_EXPIRES_IN },
  });

  await fastify.register(fastifyJwt, {
    secret: env.JWT_REFRESH_SECRET,
    namespace: 'refresh',
    sign: { expiresIn: env.JWT_REFRESH_EXPIRES_IN },
  });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  fastify.decorate('requireRole', (...roles: Role[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user || !roles.includes(request.user.role)) {
        reply.code(403).send({ error: 'Forbidden' });
      }
    };
  });
});
