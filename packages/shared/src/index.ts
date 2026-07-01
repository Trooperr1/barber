// Mirrors the enums defined in apps/api/prisma/schema.prisma.
// Kept as plain string unions (not re-exported from @prisma/client) so the
// web app never needs @prisma/client as a dependency.

export type Role = 'OWNER' | 'ADMIN' | 'BARBER' | 'FRONT_DESK';

export type AppointmentStatus = 'BOOKED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export type AppointmentSource = 'ONLINE' | 'WALK_IN' | 'PHONE';

export type TimeBlockReason = 'LUNCH' | 'PERSONAL' | 'NO_SHOW_RESCHEDULE' | 'OTHER';

export interface ServiceDTO {
  id: string;
  name: string;
  durationMinutes: number;
  basePrice: string;
  active: boolean;
  description: string | null;
}

export interface BarberDTO {
  id: string;
  displayName: string;
  bio: string | null;
  active: boolean;
  userId: string;
}

export interface ClientDTO {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  generalNotes: string | null;
  tags: string[];
  noShowCount: number;
  cancellationCount: number;
  createdAt: string;
}

export interface AppointmentDTO {
  id: string;
  clientId: string;
  barberId: string;
  serviceId: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes: string | null;
  priceCharged: string | null;
}

export interface AvailableSlot {
  barberId: string;
  startTime: string;
  endTime: string;
}

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'BOOKED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

export const ROLES: Role[] = ['OWNER', 'ADMIN', 'BARBER', 'FRONT_DESK'];
