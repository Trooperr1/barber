import { addHours } from 'date-fns';
import type { PrismaClient } from '@prisma/client';
import { notifications } from '../lib/notifications.js';
import { env } from '../config/env.js';

const REMINDER_LEAD_HOURS = 24;
// Sweep runs periodically rather than exactly on the hour mark, so we look
// for appointments whose 24hr-before mark falls within this window.
const SWEEP_WINDOW_HOURS = 1;

/**
 * The "automated reminder" hook: finds BOOKED appointments starting ~24h
 * from now that haven't been reminded yet, and sends (mocked, by default)
 * a reminder. Swap the notification provider via NOTIFICATION_PROVIDER to
 * go live with real SMS/email later — this hook itself doesn't change.
 */
export async function runReminderSweep(prisma: PrismaClient): Promise<number> {
  const now = new Date();
  const windowStart = addHours(now, REMINDER_LEAD_HOURS);
  const windowEnd = addHours(now, REMINDER_LEAD_HOURS + SWEEP_WINDOW_HOURS);

  const due = await prisma.appointment.findMany({
    where: {
      status: 'BOOKED',
      reminderSentAt: null,
      startTime: { gte: windowStart, lt: windowEnd },
    },
    include: { client: true, barber: true, service: true },
  });

  for (const appointment of due) {
    const link = `${env.WEB_BASE_URL}/manage/${appointment.cancelToken}`;
    const when = appointment.startTime.toLocaleString();
    const message = `Reminder: you have an appointment with ${appointment.barber.displayName} for ${appointment.service.name} on ${when}. Manage: ${link}`;

    if (appointment.client.email) {
      await notifications.send({ to: appointment.client.email, channel: 'email', subject: 'Appointment reminder', message });
    }
    await notifications.send({ to: appointment.client.phone, channel: 'sms', message });

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { reminderSentAt: new Date() },
    });
  }

  return due.length;
}
