import type { PrismaClient } from '@prisma/client';

/**
 * Copies ShopSettings' default hours onto a newly-created barber for every
 * day of the week (per-barber rows the barber/admin can then diverge from).
 */
export async function seedDefaultWorkingHours(prisma: PrismaClient, barberId: string): Promise<void> {
  const shopSettings = await prisma.shopSettings.findUnique({ where: { id: 1 } });
  if (!shopSettings) throw new Error('ShopSettings singleton row is missing');

  const openDays = new Set(shopSettings.defaultOpenDays);
  await prisma.barberWorkingHours.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      barberId,
      dayOfWeek,
      startMinute: shopSettings.defaultOpenMinute,
      endMinute: shopSettings.defaultCloseMinute,
      isOff: !openDays.has(dayOfWeek),
    })),
  });
}
