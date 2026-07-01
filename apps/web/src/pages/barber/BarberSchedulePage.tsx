import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useFetch';
import { api } from '../../api/client';
import type { AppointmentWithNames, TimeBlock } from '../../api/types';
import { addDays, endOfLocalDay, formatDateLong, formatTime, startOfLocalDay } from '../../lib/date';
import { Button } from '../../components/Button';
import { AppointmentCard } from './AppointmentCard';
import { AddAppointmentModal } from '../../components/AddAppointmentModal';
import { TimeBlockModal } from '../../components/TimeBlockModal';
import { Spinner } from '../../components/Spinner';

type ScheduleItem =
  | { kind: 'appointment'; time: string; data: AppointmentWithNames }
  | { kind: 'block'; time: string; data: TimeBlock };

export function BarberSchedulePage() {
  const { user, logout } = useAuth();
  const [date, setDate] = useState(new Date());
  const [showAddWalkIn, setShowAddWalkIn] = useState(false);
  const [showTimeBlock, setShowTimeBlock] = useState(false);

  const barberId = user!.barberId!;
  const from = startOfLocalDay(date).toISOString();
  const to = endOfLocalDay(date).toISOString();

  const {
    data: appointments,
    loading: loadingAppts,
    refetch: refetchAppts,
  } = useFetch<AppointmentWithNames[]>(
    () => api.get(`/appointments?barberId=${barberId}&from=${from}&to=${to}`),
    [barberId, from, to],
  );

  const {
    data: blocks,
    loading: loadingBlocks,
    refetch: refetchBlocks,
  } = useFetch<TimeBlock[]>(() => api.get(`/time-blocks?barberId=${barberId}&from=${from}&to=${to}`), [
    barberId,
    from,
    to,
  ]);

  const items: ScheduleItem[] = [
    ...(appointments ?? []).map((a): ScheduleItem => ({ kind: 'appointment', time: a.startTime, data: a })),
    ...(blocks ?? []).map((b): ScheduleItem => ({ kind: 'block', time: b.startTime, data: b })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  const loading = loadingAppts || loadingBlocks;

  function refetch() {
    refetchAppts();
    refetchBlocks();
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg pb-28">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-500">Welcome back</div>
            <div className="text-lg font-bold">{user?.name}</div>
          </div>
          <button onClick={logout} className="text-sm font-medium text-zinc-500 underline">
            Sign out
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => setDate((d) => addDays(d, -1))}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-lg"
            aria-label="Previous day"
          >
            ‹
          </button>
          <div className="text-center">
            <div className="font-semibold">{formatDateLong(date)}</div>
            <button className="text-xs text-zinc-500 underline" onClick={() => setDate(new Date())}>
              Jump to today
            </button>
          </div>
          <button
            onClick={() => setDate((d) => addDays(d, 1))}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-lg"
            aria-label="Next day"
          >
            ›
          </button>
        </div>
      </header>

      <main className="space-y-3 px-4 py-4">
        {loading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="py-10 text-center text-zinc-500">No appointments scheduled for this day.</p>
        )}
        {items.map((item) =>
          item.kind === 'appointment' ? (
            <AppointmentCard key={item.data.id} appointment={item.data} onChanged={refetch} />
          ) : (
            <div key={item.data.id} className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4">
              <div className="font-semibold text-zinc-600">
                {formatTime(item.data.startTime)} – {formatTime(item.data.endTime)} · {item.data.reason.replace('_', ' ')}
              </div>
              {item.data.notes && <div className="text-sm text-zinc-500">{item.data.notes}</div>}
            </div>
          ),
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 mx-auto flex max-w-lg gap-3 border-t border-zinc-200 bg-white p-4">
        <Button variant="secondary" className="flex-1" onClick={() => setShowTimeBlock(true)}>
          Block time
        </Button>
        <Button className="flex-1" onClick={() => setShowAddWalkIn(true)}>
          + Add walk-in
        </Button>
      </div>

      {showAddWalkIn && (
        <AddAppointmentModal
          fixedBarberId={barberId}
          defaultDate={date}
          onClose={() => setShowAddWalkIn(false)}
          onCreated={refetch}
        />
      )}
      {showTimeBlock && (
        <TimeBlockModal
          barberId={barberId}
          defaultDate={date}
          onClose={() => setShowTimeBlock(false)}
          onCreated={refetch}
        />
      )}
    </div>
  );
}
