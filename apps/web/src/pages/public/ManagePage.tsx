import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { Button } from '../../components/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { Spinner } from '../../components/Spinner';
import { formatDateKey, formatMoney, formatTime } from '../../lib/date';

interface ManagedAppointment {
  id: string;
  startTime: string;
  endTime: string;
  status: 'BOOKED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  priceCharged: string | null;
  barber: { id: string; displayName: string };
  service: { id: string; name: string; durationMinutes: number };
}

interface Slot {
  barberId: string;
  start: string;
  end: string;
}

export function ManagePage() {
  const { token } = useParams<{ token: string }>();
  const [contact, setContact] = useState('');
  const [appointment, setAppointment] = useState<ManagedAppointment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'reschedule'>('view');
  const [date, setDate] = useState(formatDateKey(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ManagedAppointment>(`/public/appointments/${token}?contact=${encodeURIComponent(contact)}`);
      setAppointment(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'We could not find that appointment');
    } finally {
      setLoading(false);
    }
  }

  async function loadSlots(forDate: string) {
    if (!appointment) return;
    const res = await api.get<{ slots: Slot[] }>(
      `/public/availability?serviceId=${appointment.service.id}&barberId=${appointment.barber.id}&date=${forDate}`,
    );
    setSlots(res.slots);
  }

  async function cancel() {
    if (!confirm('Cancel this appointment?')) return;
    setBusy(true);
    try {
      const res = await api.post<ManagedAppointment>(`/public/appointments/${token}/cancel`, { contact });
      setAppointment(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel');
    } finally {
      setBusy(false);
    }
  }

  async function confirmReschedule() {
    if (!selectedSlot) return;
    setBusy(true);
    try {
      const res = await api.post<ManagedAppointment>(`/public/appointments/${token}/reschedule`, {
        contact,
        startTime: selectedSlot.start,
      });
      setAppointment(res);
      setMode('view');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reschedule');
    } finally {
      setBusy(false);
    }
  }

  if (!appointment) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
        <h1 className="mb-1 text-xl font-bold">Manage your appointment</h1>
        <p className="mb-6 text-sm text-zinc-500">Enter the phone or email you booked with to continue.</p>
        <form onSubmit={lookup} className="space-y-3">
          <input
            placeholder="Phone or email"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Looking up…' : 'Continue'}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-sm px-4 py-8">
      <h1 className="mb-4 text-xl font-bold">Your appointment</h1>
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="mb-2 flex items-center justify-between">
          <StatusBadge status={appointment.status} />
          <span className="font-semibold">{formatMoney(appointment.priceCharged)}</span>
        </div>
        <div className="text-lg font-bold">{appointment.service.name}</div>
        <div className="text-zinc-600">with {appointment.barber.displayName}</div>
        <div className="mt-2 text-zinc-600">
          {new Date(appointment.startTime).toLocaleDateString([], { dateStyle: 'full' })}
          <br />
          {formatTime(appointment.startTime)} – {formatTime(appointment.endTime)}
        </div>
      </div>

      {appointment.status === 'BOOKED' && mode === 'view' && (
        <div className="mt-4 flex gap-3">
          <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => setMode('reschedule')}>
            Reschedule
          </Button>
          <Button variant="danger" className="flex-1" disabled={busy} onClick={cancel}>
            Cancel
          </Button>
        </div>
      )}

      {mode === 'reschedule' && (
        <div className="mt-4 space-y-3">
          <input
            type="date"
            value={date}
            min={formatDateKey(new Date())}
            onChange={(e) => {
              setDate(e.target.value);
              loadSlots(e.target.value);
              setSelectedSlot(null);
            }}
            onFocus={() => loadSlots(date)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
          />
          {slots.length === 0 ? (
            <p className="text-sm text-zinc-500">Pick a date to see open times.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.start}
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded-xl border px-2 py-3 text-sm font-medium ${
                    selectedSlot?.start === slot.start ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white'
                  }`}
                >
                  {formatTime(slot.start)}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setMode('view')}>
              Back
            </Button>
            <Button className="flex-1" disabled={!selectedSlot || busy} onClick={confirmReschedule}>
              Confirm new time
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
