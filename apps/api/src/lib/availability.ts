import { addMinutes, isAfter, isBefore } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { PrismaClient } from '@prisma/client';

const SLOT_STEP_MINUTES = 5;

export interface SlotWindow {
  start: Date;
  end: Date;
}

export function localMinuteToUtcDate(dateStr: string, minuteOfDay: number, timezone: string): Date {
  const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
  const mm = String(minuteOfDay % 60).padStart(2, '0');
  return fromZonedTime(`${dateStr}T${hh}:${mm}:00`, timezone);
}

// Anchored at noon to sidestep DST edge cases when deriving the weekday
// a given shop-local calendar date falls on.
export function dayOfWeekInTimezone(dateStr: string, timezone: string): number {
  const noonUtc = fromZonedTime(`${dateStr}T12:00:00`, timezone);
  return toZonedTime(noonUtc, timezone).getDay();
}

export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return isBefore(aStart, bEnd) && isBefore(bStart, aEnd);
}

export function effectiveBufferMinutes(
  barber: { bufferMinutesOverride: number | null },
  shopSettings: { defaultBufferMinutes: number },
): number {
  return barber.bufferMinutesOverride ?? shopSettings.defaultBufferMinutes;
}

/**
 * Computes bookable slot start/end times for a single barber on a single
 * shop-local calendar date, honoring working hours, days off, existing
 * appointments, manual time blocks, and the barber's buffer window.
 */
export async function getBarberAvailability(params: {
  prisma: PrismaClient;
  barberId: string;
  serviceId: string;
  dateStr: string;
  timezone: string;
}): Promise<SlotWindow[]> {
  const { prisma, barberId, serviceId, dateStr, timezone } = params;

  const [barber, service, shopSettings] = await Promise.all([
    prisma.barber.findUnique({ where: { id: barberId } }),
    prisma.service.findUnique({ where: { id: serviceId } }),
    prisma.shopSettings.findUnique({ where: { id: 1 } }),
  ]);
  if (!barber || !barber.active || !service || !service.active || !shopSettings) return [];

  const barberService = await prisma.barberService.findUnique({
    where: { barberId_serviceId: { barberId, serviceId } },
  });
  if (!barberService || !barberService.active) return [];

  const dayOfWeek = dayOfWeekInTimezone(dateStr, timezone);
  const hours = await prisma.barberWorkingHours.findUnique({
    where: { barberId_dayOfWeek: { barberId, dayOfWeek } },
  });
  if (!hours || hours.isOff) return [];

  const bufferMinutes = effectiveBufferMinutes(barber, shopSettings);
  const duration = service.durationMinutes;

  const dayStartUtc = localMinuteToUtcDate(dateStr, hours.startMinute, timezone);
  const dayEndUtc = localMinuteToUtcDate(dateStr, hours.endMinute, timezone);

  const [appointments, timeBlocks] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        barberId,
        status: 'BOOKED',
        startTime: { lt: dayEndUtc },
        endTime: { gt: dayStartUtc },
      },
      select: { startTime: true, endTime: true },
    }),
    prisma.timeBlock.findMany({
      where: {
        barberId,
        startTime: { lt: dayEndUtc },
        endTime: { gt: dayStartUtc },
      },
      select: { startTime: true, endTime: true },
    }),
  ]);

  const busy: SlotWindow[] = [...appointments, ...timeBlocks].map((b) => ({
    start: addMinutes(b.startTime, -bufferMinutes),
    end: addMinutes(b.endTime, bufferMinutes),
  }));

  const now = new Date();
  const slots: SlotWindow[] = [];
  let cursor = dayStartUtc;
  while (true) {
    const candidateEnd = addMinutes(cursor, duration);
    if (isAfter(candidateEnd, dayEndUtc)) break;
    const conflict = busy.some((b) => intervalsOverlap(cursor, candidateEnd, b.start, b.end));
    if (!conflict && isAfter(cursor, now)) {
      slots.push({ start: cursor, end: candidateEnd });
    }
    cursor = addMinutes(cursor, SLOT_STEP_MINUTES);
  }
  return slots;
}

/**
 * "Any available" booking: returns the barber (among those offering the
 * service) whose earliest open slot on the given date comes first.
 */
export async function findFirstAvailableSlot(params: {
  prisma: PrismaClient;
  barberIds: string[];
  serviceId: string;
  dateStr: string;
  timezone: string;
}): Promise<{ barberId: string; start: Date; end: Date } | null> {
  const { prisma, barberIds, serviceId, dateStr, timezone } = params;
  const results = await Promise.all(
    barberIds.map(async (barberId) => {
      const slots = await getBarberAvailability({ prisma, barberId, serviceId, dateStr, timezone });
      return slots[0] ? { barberId, start: slots[0].start, end: slots[0].end } : null;
    }),
  );
  const available = results.filter((r): r is { barberId: string; start: Date; end: Date } => r !== null);
  if (available.length === 0) return null;
  available.sort((a, b) => a.start.getTime() - b.start.getTime());
  return available[0];
}

/**
 * Re-validates a specific slot immediately before booking/rescheduling, to
 * close the race window between availability lookup and creation.
 */
export async function isSlotFree(params: {
  prisma: PrismaClient;
  barberId: string;
  startTime: Date;
  endTime: Date;
  bufferMinutes: number;
  excludeAppointmentId?: string;
}): Promise<boolean> {
  const { prisma, barberId, startTime, endTime, bufferMinutes, excludeAppointmentId } = params;
  const bufferedStart = addMinutes(startTime, -bufferMinutes);
  const bufferedEnd = addMinutes(endTime, bufferMinutes);

  const [conflictingAppt, conflictingBlock] = await Promise.all([
    prisma.appointment.findFirst({
      where: {
        barberId,
        status: 'BOOKED',
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        startTime: { lt: bufferedEnd },
        endTime: { gt: bufferedStart },
      },
      select: { id: true },
    }),
    prisma.timeBlock.findFirst({
      where: {
        barberId,
        startTime: { lt: bufferedEnd },
        endTime: { gt: bufferedStart },
      },
      select: { id: true },
    }),
  ]);
  return !conflictingAppt && !conflictingBlock;
}
