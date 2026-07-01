import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addDays } from 'date-fns';

const rangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', fastify.requireRole('OWNER', 'ADMIN'));

  fastify.get('/summary', async (request) => {
    const { from, to } = rangeSchema.parse(request.query);

    const appointments = await fastify.prisma.appointment.findMany({
      where: { startTime: { gte: from, lt: to } },
      include: {
        barber: { select: { id: true, displayName: true } },
        service: { select: { id: true, name: true } },
      },
    });

    const completed = appointments.filter((a) => a.status === 'COMPLETED');
    const totalRevenue = completed.reduce((sum, a) => sum + Number(a.priceCharged ?? 0), 0);

    const byBarberMap = new Map<string, { barberId: string; name: string; revenue: number; count: number }>();
    const byServiceMap = new Map<string, { serviceId: string; name: string; revenue: number; count: number }>();

    for (const a of completed) {
      const price = Number(a.priceCharged ?? 0);

      const barberEntry = byBarberMap.get(a.barberId) ?? {
        barberId: a.barberId,
        name: a.barber.displayName,
        revenue: 0,
        count: 0,
      };
      barberEntry.revenue += price;
      barberEntry.count += 1;
      byBarberMap.set(a.barberId, barberEntry);

      const serviceEntry = byServiceMap.get(a.serviceId) ?? {
        serviceId: a.serviceId,
        name: a.service.name,
        revenue: 0,
        count: 0,
      };
      serviceEntry.revenue += price;
      serviceEntry.count += 1;
      byServiceMap.set(a.serviceId, serviceEntry);
    }

    const statusBreakdown = {
      BOOKED: appointments.filter((a) => a.status === 'BOOKED').length,
      COMPLETED: completed.length,
      CANCELLED: appointments.filter((a) => a.status === 'CANCELLED').length,
      NO_SHOW: appointments.filter((a) => a.status === 'NO_SHOW').length,
    };

    return {
      totalRevenue,
      totalAppointments: appointments.length,
      statusBreakdown,
      byBarber: Array.from(byBarberMap.values()).sort((a, b) => b.revenue - a.revenue),
      byService: Array.from(byServiceMap.values()).sort((a, b) => b.revenue - a.revenue),
    };
  });

  fastify.get('/barber-performance', async (request) => {
    const query = rangeSchema
      .extend({ barberId: z.string().optional(), weeks: z.coerce.number().int().positive().default(6) })
      .parse(request.query);

    const barbers = await fastify.prisma.barber.findMany({
      where: { active: true, ...(query.barberId ? { id: query.barberId } : {}) },
    });

    const results = await Promise.all(
      barbers.map(async (barber) => {
        const allCompleted = await fastify.prisma.appointment.findMany({
          where: { barberId: barber.id, status: 'COMPLETED' },
          orderBy: { startTime: 'asc' },
          select: { clientId: true, startTime: true, priceCharged: true },
        });

        const inRange = allCompleted.filter((a) => a.startTime >= query.from && a.startTime < query.to);
        const revenue = inRange.reduce((sum, a) => sum + Number(a.priceCharged ?? 0), 0);

        const visitsByClient = new Map<string, Date[]>();
        for (const a of allCompleted) {
          const list = visitsByClient.get(a.clientId) ?? [];
          list.push(a.startTime);
          visitsByClient.set(a.clientId, list);
        }

        const clientsServed = new Set(inRange.map((a) => a.clientId));
        let rebookedCount = 0;
        for (const clientId of clientsServed) {
          const visits = visitsByClient.get(clientId) ?? [];
          const firstInRange = inRange
            .filter((a) => a.clientId === clientId)
            .map((a) => a.startTime)
            .sort((a, b) => a.getTime() - b.getTime())[0];
          const windowEnd = addDays(firstInRange, query.weeks * 7);
          const rebooked = visits.some((v) => v > firstInRange && v <= windowEnd);
          if (rebooked) rebookedCount += 1;
        }

        return {
          barberId: barber.id,
          displayName: barber.displayName,
          clientsServed: clientsServed.size,
          revenue,
          appointmentsCompleted: inRange.length,
          rebookingRate: clientsServed.size > 0 ? rebookedCount / clientsServed.size : 0,
        };
      }),
    );

    return results;
  });
};
