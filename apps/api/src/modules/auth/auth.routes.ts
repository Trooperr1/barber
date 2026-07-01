import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Barber, User } from '@prisma/client';
import { ROLES } from '@barbershop/shared';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { hashToken } from '../../lib/tokens.js';
import type { AuthTokenPayload } from '../../plugins/auth.js';
import { seedDefaultWorkingHours } from '../barbers/barbers.service.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(ROLES as [string, ...string[]]),
  displayName: z.string().min(1).optional(),
});

type UserWithBarber = User & { barber: Barber | null };

function publicUser(user: UserWithBarber) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    barberId: user.barber?.id ?? null,
  };
}

async function issueTokenPair(fastify: FastifyInstance, user: UserWithBarber) {
  const payload: AuthTokenPayload = {
    sub: user.id,
    role: user.role as AuthTokenPayload['role'],
    barberId: user.barber?.id,
  };
  const accessToken = fastify.jwt.sign(payload);
  const refreshToken = fastify.jwt.refresh.sign(payload);
  const decoded = fastify.jwt.refresh.decode<{ exp: number }>(refreshToken);
  if (!decoded?.exp) throw new Error('Refresh token missing expiry claim');

  await fastify.prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(decoded.exp * 1000),
    },
  });

  return { accessToken, refreshToken };
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await fastify.prisma.user.findUnique({
      where: { email: body.email },
      include: { barber: true },
    });
    if (!user || !user.active || !(await verifyPassword(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }
    const tokens = await issueTokenPair(fastify, user);
    return { ...tokens, user: publicUser(user) };
  });

  fastify.post('/refresh', async (request, reply) => {
    const body = refreshSchema.parse(request.body);

    let payload: AuthTokenPayload;
    try {
      payload = fastify.jwt.refresh.verify(body.refreshToken);
    } catch {
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }

    const tokenHash = hashToken(body.refreshToken);
    const stored = await fastify.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return reply.code(401).send({ error: 'Refresh token is no longer valid' });
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { barber: true },
    });
    if (!user || !user.active) {
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }

    await fastify.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await issueTokenPair(fastify, user);
    return tokens;
  });

  fastify.post('/logout', async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    const tokenHash = hashToken(body.refreshToken);
    await fastify.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return reply.code(204).send();
  });

  fastify.get('/me', { preHandler: fastify.authenticate }, async (request, reply) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.sub },
      include: { barber: true },
    });
    if (!user) return reply.code(404).send({ error: 'User not found' });
    return publicUser(user);
  });

  // Staff account provisioning — owners/admins onboard barbers & front desk
  // through this rather than public self-registration.
  fastify.post(
    '/users',
    { preHandler: [fastify.authenticate, fastify.requireRole('OWNER', 'ADMIN')] },
    async (request, reply) => {
      const body = createUserSchema.parse(request.body);
      const passwordHash = await hashPassword(body.password);

      const user = await fastify.prisma.user.create({
        data: {
          email: body.email,
          name: body.name,
          role: body.role as AuthTokenPayload['role'],
          passwordHash,
        },
      });

      if (body.role === 'BARBER') {
        const barber = await fastify.prisma.barber.create({
          data: { userId: user.id, displayName: body.displayName ?? body.name },
        });
        await seedDefaultWorkingHours(fastify.prisma, barber.id);
      }

      const full = await fastify.prisma.user.findUnique({
        where: { id: user.id },
        include: { barber: true },
      });
      reply.code(201).send(publicUser(full!));
    },
  );
};
