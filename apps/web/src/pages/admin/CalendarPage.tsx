import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { api } from '../../api/client';
import type { AppointmentWithNames, Barber, TimeBlock } from '../../api/types';
import { addDays, endOfLocalDay, formatDateLong, formatTime, startOfLocalDay } from '../../lib/date';
import { Button } from '../../components/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { AddAppointmentModal } from '../../components/AddAppointmentModal';
import { Spinner } from '../../components/Spinner';

export function CalendarPage() {
  const [date, setDate] = useState(new Date());
  const [barberFilter, setBarberFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);

  const from = startOfLocalDay(date).toISOString();
  const to = endOfLocalDay(date).toISOString();

  const { data: barbers } = useFetch<Barber[]>(() => api.get('/barbers?active=true'), []);

  const {
    data: appointments,
    loading,
    refetch: refetchAppts,
  } = useFetch<AppointmentWithNames[]>(() => api.get(`/appointments?from=${from}&to=${to}`), [from, to]);

  const { data: blocks, refetch: refetchBlocks } = useFetch<TimeBlock[]>(
    () => api.get(`/time-blocks?from=${from}&to=${to}`),
    [from, to],
  );

  function refetch() {
    refetchAppts();
    refetchBlocks();
  }

  const visibleBarbers = (barbers ?? []).filter((b) => barberFilter === 'all' || b.id === barberFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <div className="flex items-center gap-3">
          <select
            value={barberFilter}
            onChange={(e) => setBarberFilter(e.target.value)}
            className="rounded-xl border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="all">All barbers</option>
            {(barbers ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.displayName}
              </option>
            ))}
          </select>
          <Button onClick={() => setShowAdd(true)}>+ Add appointment</Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setDate((d) => addDays(d, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100"
        >
          ‹
        </button>
        <div className="font-semibold">{formatDateLong(date)}</div>
        <button
          onClick={() => setDate((d) => addDays(d, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100"
        >
          ›
        </button>
        <button className="text-sm text-zinc-500 underline" onClick={() => setDate(new Date())}>
          Today
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {visibleBarbers.map((barber) => {
            type Item =
              | { kind: 'appt'; time: string; data: AppointmentWithNames }
              | { kind: 'block'; time: string; data: TimeBlock };
            const items: Item[] = [
              ...(appointments ?? [])
                .filter((a) => a.barberId === barber.id)
                .map((a): Item => ({ kind: 'appt', time: a.startTime, data: a })),
              ...(blocks ?? [])
                .filter((b) => b.barberId === barber.id)
                .map((b): Item => ({ kind: 'block', time: b.startTime, data: b })),
            ].sort((a, b) => a.time.localeCompare(b.time));

            return (
              <div key={barber.id} className="rounded-2xl border border-zinc-200 bg-white p-3">
                <h2 className="mb-2 font-semibold">{barber.displayName}</h2>
                <div className="space-y-2">
                  {items.length === 0 && <p className="text-sm text-zinc-400">No bookings.</p>}
                  {items.map((item) =>
                    item.kind === 'appt' ? (
                      <MiniAppointment key={item.data.id} appointment={item.data} onChanged={refetch} />
                    ) : (
                      <div key={item.data.id} className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-2 text-xs text-zinc-500">
                        {formatTime(item.data.startTime)}–{formatTime(item.data.endTime)} · {item.data.reason.replace('_', ' ')}
                      </div>
                    ),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && <AddAppointmentModal defaultDate={date} onClose={() => setShowAdd(false)} onCreated={refetch} />}
    </div>
  );
}

function MiniAppointment({ appointment, onChanged }: { appointment: AppointmentWithNames; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function setStatus(status: 'COMPLETED' | 'CANCELLED' | 'NO_SHOW') {
    setBusy(true);
    try {
      await api.patch(`/appointments/${appointment.id}`, { status });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">{formatTime(appointment.startTime)}</span>
        <StatusBadge status={appointment.status} />
      </div>
      <div>{appointment.client?.name}</div>
      <div className="text-xs text-zinc-500">{appointment.service?.name}</div>
      {appointment.status === 'BOOKED' && (
        <div className="mt-1 flex gap-1">
          <button disabled={busy} onClick={() => setStatus('COMPLETED')} className="text-xs text-green-700 underline">
            Complete
          </button>
          <button disabled={busy} onClick={() => setStatus('NO_SHOW')} className="text-xs text-red-700 underline">
            No-show
          </button>
          <button disabled={busy} onClick={() => setStatus('CANCELLED')} className="text-xs text-zinc-500 underline">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
