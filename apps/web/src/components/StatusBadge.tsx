import type { AppointmentStatus } from '@barbershop/shared';

const STATUS_CLASSES: Record<AppointmentStatus, string> = {
  BOOKED: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-zinc-200 text-zinc-600',
  NO_SHOW: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
