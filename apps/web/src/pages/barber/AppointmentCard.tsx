import { useState } from 'react';
import type { AppointmentStatus } from '@barbershop/shared';
import { StatusBadge } from '../../components/StatusBadge';
import { Button } from '../../components/Button';
import { api, ApiError } from '../../api/client';
import { formatMoney, formatTime } from '../../lib/date';
import type { AppointmentWithNames } from '../../api/types';

export function AppointmentCard({
  appointment,
  onChanged,
}: {
  appointment: AppointmentWithNames;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState(appointment.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: AppointmentStatus) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/appointments/${appointment.id}`, { status });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    if (notes === (appointment.notes ?? '')) return;
    setBusy(true);
    try {
      await api.patch(`/appointments/${appointment.id}`, { notes });
      onChanged();
    } catch {
      // best-effort; keep the field as typed rather than losing the note
    } finally {
      setBusy(false);
    }
  }

  const noShows = appointment.client?.noShowCount ?? 0;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-bold">
            {formatTime(appointment.startTime)} – {formatTime(appointment.endTime)}
          </div>
          <div className="text-base font-medium">{appointment.client?.name}</div>
          <a href={`tel:${appointment.client?.phone}`} className="text-sm text-zinc-500 underline">
            {appointment.client?.phone}
          </a>
          {noShows > 0 && (
            <div className="mt-1 text-xs font-semibold text-red-600">⚠ {noShows} no-show{noShows > 1 ? 's' : ''}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={appointment.status} />
          <div className="text-sm text-zinc-500">{appointment.service?.name}</div>
          <div className="text-sm font-semibold">{formatMoney(appointment.priceCharged)}</div>
        </div>
      </div>

      {appointment.status === 'BOOKED' && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button variant="primary" disabled={busy} onClick={() => setStatus('COMPLETED')} className="text-sm">
            Complete
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setStatus('NO_SHOW')} className="text-sm">
            No-show
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => setStatus('CANCELLED')} className="text-sm">
            Cancel
          </Button>
        </div>
      )}

      <div className="mt-3">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Notes for this visit…"
          rows={2}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
