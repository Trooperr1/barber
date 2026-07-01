import type { FastifyRequest } from 'fastify';

export class ForbiddenError extends Error {}

/**
 * BARBER accounts may only touch their own calendar/clients-of-visit;
 * OWNER/ADMIN/FRONT_DESK can act shop-wide.
 */
export function assertBarberScope(request: FastifyRequest, barberId: string): void {
  const user = request.user;
  if (user.role === 'BARBER' && user.barberId !== barberId) {
    throw new ForbiddenError('Barbers may only access their own schedule');
  }
}

export function isElevated(request: FastifyRequest): boolean {
  return request.user.role === 'OWNER' || request.user.role === 'ADMIN';
}
