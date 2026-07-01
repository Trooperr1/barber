import type { AppointmentSource, AppointmentStatus, Role, TimeBlockReason } from '@barbershop/shared';

export interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  basePrice: string;
  active: boolean;
}

export interface Barber {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  active: boolean;
  bufferMinutesOverride: number | null;
  user?: { name: string; email: string };
  workingHours?: BarberWorkingHours[];
  services?: { serviceId: string; active: boolean; priceOverride: string | null; service: Service }[];
}

export interface BarberWorkingHours {
  id: string;
  barberId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  isOff: boolean;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  generalNotes: string | null;
  tags: string[];
  noShowCount: number;
  cancellationCount: number;
  createdAt: string;
  lastVisit?: string | null;
  appointments?: AppointmentWithNames[];
  barberNotes?: { id: string; barberId: string; note: string; barber: { displayName: string } }[];
}

export interface AppointmentWithNames {
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
  client?: { id: string; name: string; phone: string; noShowCount: number; cancellationCount: number };
  barber?: { id: string; displayName: string };
  service?: { id: string; name: string; durationMinutes: number };
}

export interface TimeBlock {
  id: string;
  barberId: string;
  startTime: string;
  endTime: string;
  reason: TimeBlockReason;
  notes: string | null;
}

export interface Slot {
  barberId: string;
  start: string;
  end: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  barberId: string | null;
}

export interface DashboardSummary {
  totalRevenue: number;
  totalAppointments: number;
  statusBreakdown: Record<AppointmentStatus, number>;
  byBarber: { barberId: string; name: string; revenue: number; count: number }[];
  byService: { serviceId: string; name: string; revenue: number; count: number }[];
}

export interface BarberPerformance {
  barberId: string;
  displayName: string;
  clientsServed: number;
  revenue: number;
  appointmentsCompleted: number;
  rebookingRate: number;
}
