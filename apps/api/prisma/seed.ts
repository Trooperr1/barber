import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { addDays, format, subDays } from 'date-fns';
import { hashPassword } from '../src/lib/password.js';
import { seedDefaultWorkingHours } from '../src/modules/barbers/barbers.service.js';
import { localMinuteToUtcDate } from '../src/lib/availability.js';

const prisma = new PrismaClient();

const TIMEZONE = 'America/New_York';
const SEED_PASSWORD = 'password123';

const SERVICES = [
  { name: 'Haircut', durationMinutes: 30, basePrice: 35 },
  { name: 'Haircut + Beard', durationMinutes: 45, basePrice: 50 },
  { name: 'Beard Trim', durationMinutes: 15, basePrice: 20 },
  { name: 'Kids Cut', durationMinutes: 20, basePrice: 25 },
  { name: 'Buzz Cut', durationMinutes: 15, basePrice: 22 },
  { name: 'Skin Fade', durationMinutes: 40, basePrice: 45 },
  { name: 'Hot Towel Shave', durationMinutes: 30, basePrice: 35 },
  { name: 'Line Up', durationMinutes: 15, basePrice: 15 },
  { name: 'The Works (Cut + Beard + Line Up)', durationMinutes: 60, basePrice: 65 },
  { name: 'Senior Cut', durationMinutes: 30, basePrice: 28 },
];

const BARBER_NAMES = [
  'Mike Rodriguez',
  'Jamal Carter',
  'Sofia Delgado',
  'Tommy Nguyen',
  'Chris Okafor',
];

const CLIENT_TAG_POOL = ['regular', 'VIP', 'referral'];

const CUT_NOTE_SAMPLES = [
  'Fades on the sides, no scissor on top.',
  'Allergic to certain aftershaves — check before applying.',
  'Prefers clippers only, no razor on the neckline.',
  'Likes it short on the sides, longer on top, textured.',
  'Sensitive scalp — go easy with the trimmer.',
  'Regular skin fade, 1 guard on top blend.',
  'Always asks for a beard line-up too.',
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function weightedStatus(): 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' {
  const roll = Math.random();
  if (roll < 0.85) return 'COMPLETED';
  if (roll < 0.93) return 'CANCELLED';
  return 'NO_SHOW';
}

async function main() {
  console.log('Seeding database...');

  await prisma.appointment.deleteMany();
  await prisma.timeBlock.deleteMany();
  await prisma.clientBarberNote.deleteMany();
  await prisma.client.deleteMany();
  await prisma.barberService.deleteMany();
  await prisma.barberWorkingHours.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.barber.deleteMany();
  await prisma.service.deleteMany();
  await prisma.user.deleteMany();
  await prisma.shopSettings.deleteMany();

  const shopSettings = await prisma.shopSettings.create({
    data: {
      id: 1,
      name: 'Fade & Fortune Barbershop',
      timezone: TIMEZONE,
      defaultOpenMinute: 9 * 60,
      defaultCloseMinute: 19 * 60,
      defaultBufferMinutes: 10,
      defaultOpenDays: [1, 2, 3, 4, 5, 6], // closed Sundays
    },
  });

  const passwordHash = await hashPassword(SEED_PASSWORD);

  await prisma.user.create({
    data: { email: 'owner@shop.test', name: 'Alex Owner', role: 'OWNER', passwordHash },
  });
  await prisma.user.create({
    data: { email: 'admin@shop.test', name: 'Jordan Admin', role: 'ADMIN', passwordHash },
  });
  await prisma.user.create({
    data: { email: 'frontdesk@shop.test', name: 'Riley FrontDesk', role: 'FRONT_DESK', passwordHash },
  });

  const services = await Promise.all(
    SERVICES.map((s) => prisma.service.create({ data: s })),
  );

  const barbers = [];
  for (let i = 0; i < BARBER_NAMES.length; i++) {
    const name = BARBER_NAMES[i];
    const email = `barber${i + 1}@shop.test`;
    const user = await prisma.user.create({
      data: { email, name, role: 'BARBER', passwordHash },
    });
    const barber = await prisma.barber.create({
      data: {
        userId: user.id,
        displayName: name,
        bio: faker.lorem.sentence(),
        // vary buffer for one barber to demonstrate the per-barber override
        bufferMinutesOverride: i === 0 ? 15 : null,
      },
    });
    await seedDefaultWorkingHours(prisma, barber.id);
    barbers.push(barber);
  }

  // Give the last barber a day off mid-week to show non-uniform schedules
  const lastBarber = barbers[barbers.length - 1];
  await prisma.barberWorkingHours.update({
    where: { barberId_dayOfWeek: { barberId: lastBarber.id, dayOfWeek: 3 } },
    data: { isOff: true },
  });

  // Each barber offers most services; occasionally override price
  for (const barber of barbers) {
    const offeredServices = faker.helpers.arrayElements(services, { min: 6, max: services.length });
    for (const service of offeredServices) {
      const hasOverride = Math.random() < 0.25;
      await prisma.barberService.create({
        data: {
          barberId: barber.id,
          serviceId: service.id,
          active: true,
          priceOverride: hasOverride ? Number(service.basePrice) + randomInt(3, 10) : null,
        },
      });
    }
  }

  const usedPhones = new Set<string>();
  function uniquePhone(): string {
    let phone = faker.phone.number({ style: 'national' }).replace(/\D/g, '');
    while (usedPhones.has(phone)) {
      phone = faker.string.numeric(10);
    }
    usedPhones.add(phone);
    return phone;
  }

  const clients = [];
  const CLIENT_COUNT = 55;
  for (let i = 0; i < CLIENT_COUNT; i++) {
    const hasEmail = Math.random() < 0.8;
    const tags = Math.random() < 0.5 ? faker.helpers.arrayElements(CLIENT_TAG_POOL, { min: 1, max: 2 }) : [];
    const hasNote = Math.random() < 0.1;
    const client = await prisma.client.create({
      data: {
        name: faker.person.fullName(),
        phone: uniquePhone(),
        email: hasEmail ? faker.internet.email().toLowerCase() : null,
        tags,
        generalNotes: hasNote ? 'Allergy warning: sensitive to certain hair products.' : null,
      },
    });
    clients.push(client);
  }

  // Per-barber cut preference notes for a handful of regulars
  for (let i = 0; i < 15; i++) {
    const client = pick(clients);
    const barber = pick(barbers);
    await prisma.clientBarberNote.upsert({
      where: { clientId_barberId: { clientId: client.id, barberId: barber.id } },
      create: { clientId: client.id, barberId: barber.id, note: pick(CUT_NOTE_SAMPLES) },
      update: {},
    });
  }

  // ---- Appointment history: past 28 days + upcoming 7 days ----
  const today = new Date();
  const noShowCounts = new Map<string, number>();
  const cancellationCounts = new Map<string, number>();

  async function barberServicesFor(barberId: string) {
    return prisma.barberService.findMany({ where: { barberId, active: true }, include: { service: true } });
  }

  async function generateDayAppointments(barber: (typeof barbers)[number], dateStr: string, isFuture: boolean) {
    const dayOfWeek = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    const hours = await prisma.barberWorkingHours.findUnique({
      where: { barberId_dayOfWeek: { barberId: barber.id, dayOfWeek } },
    });
    if (!hours || hours.isOff) return;

    const offerings = await barberServicesFor(barber.id);
    if (offerings.length === 0) return;

    const bufferMinutes = barber.bufferMinutesOverride ?? shopSettings.defaultBufferMinutes;
    const appointmentCount = isFuture ? randomInt(2, 4) : randomInt(3, 6);

    let cursorMinute = hours.startMinute + randomInt(0, 30);
    for (let i = 0; i < appointmentCount; i++) {
      const offering = pick(offerings);
      const duration = offering.service.durationMinutes;
      if (cursorMinute + duration > hours.endMinute) break;

      const startTime = localMinuteToUtcDate(dateStr, cursorMinute, TIMEZONE);
      const endTime = new Date(startTime.getTime() + duration * 60_000);
      const client = pick(clients);
      const price = offering.priceOverride ?? offering.service.basePrice;

      if (isFuture) {
        await prisma.appointment.create({
          data: {
            clientId: client.id,
            barberId: barber.id,
            serviceId: offering.serviceId,
            startTime,
            endTime,
            status: 'BOOKED',
            source: pick(['ONLINE', 'WALK_IN', 'PHONE'] as const),
            priceCharged: price,
          },
        });
      } else {
        const status = weightedStatus();
        await prisma.appointment.create({
          data: {
            clientId: client.id,
            barberId: barber.id,
            serviceId: offering.serviceId,
            startTime,
            endTime,
            status,
            source: pick(['ONLINE', 'WALK_IN', 'PHONE'] as const),
            priceCharged: status === 'COMPLETED' ? price : null,
            notes: status === 'COMPLETED' && Math.random() < 0.3 ? 'Great cut, client happy — usual style.' : null,
            completedAt: status === 'COMPLETED' ? endTime : null,
            cancelledAt: status === 'CANCELLED' ? startTime : null,
          },
        });
        if (status === 'NO_SHOW') {
          noShowCounts.set(client.id, (noShowCounts.get(client.id) ?? 0) + 1);
        }
        if (status === 'CANCELLED') {
          cancellationCounts.set(client.id, (cancellationCounts.get(client.id) ?? 0) + 1);
        }
      }

      cursorMinute += duration + bufferMinutes + randomInt(0, 20);
    }
  }

  for (let dayOffset = 28; dayOffset >= 1; dayOffset--) {
    const dateStr = format(subDays(today, dayOffset), 'yyyy-MM-dd');
    for (const barber of barbers) {
      await generateDayAppointments(barber, dateStr, false);
    }
  }

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const dateStr = format(addDays(today, dayOffset), 'yyyy-MM-dd');
    for (const barber of barbers) {
      await generateDayAppointments(barber, dateStr, true);
    }
  }

  for (const [clientId, count] of noShowCounts) {
    await prisma.client.update({ where: { id: clientId }, data: { noShowCount: count } });
  }
  for (const [clientId, count] of cancellationCounts) {
    await prisma.client.update({ where: { id: clientId }, data: { cancellationCount: count } });
  }

  // A recurring lunch block for each barber over the upcoming week
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const dateStr = format(addDays(today, dayOffset), 'yyyy-MM-dd');
    for (const barber of barbers) {
      const start = localMinuteToUtcDate(dateStr, 13 * 60, TIMEZONE);
      const end = localMinuteToUtcDate(dateStr, 13 * 60 + 30, TIMEZONE);
      await prisma.timeBlock.create({
        data: { barberId: barber.id, startTime: start, endTime: end, reason: 'LUNCH' },
      });
    }
  }

  console.log('Seed complete.');
  console.log('');
  console.log('Login credentials (all use the same password):');
  console.log(`  Password: ${SEED_PASSWORD}`);
  console.log(`  Owner:      owner@shop.test`);
  console.log(`  Admin:      admin@shop.test`);
  console.log(`  Front desk: frontdesk@shop.test`);
  barbers.forEach((b, i) => console.log(`  Barber (${b.displayName}): barber${i + 1}@shop.test`));
  console.log('');
  console.log(`Seeded ${barbers.length} barbers, ${services.length} services, ${clients.length} clients.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
