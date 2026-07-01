import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { api, ApiError } from '../api/client';
import { formatDateKey } from '../lib/date';
import type { TimeBlockReason } from '@barbershop/shared';

const REASONS: { value: TimeBlockReason; label: string }[] = [
  { value: 'LUNCH', label: 'Lunch' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'NO_SHOW_RESCHEDULE', label: 'No-show reschedule hold' },
  { value: 'OTHER', label: 'Other' },
];

export function TimeBlockModal({
  barberId,
  defaultDate,
  onClose,
  onCreated,
}: {
  barberId: string;
  defaultDate: Date;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [date, setDate] = useState(formatDateKey(defaultDate));
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('12:30');
  const [reason, setReason] = useState<TimeBlockReason>('LUNCH');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/time-blocks', {
        barberId,
        startTime: new Date(`${date}T${startTime}:00`).toISOString(),
        endTime: new Date(`${date}T${endTime}:00`).toISOString(),
        reason,
        notes: notes || undefined,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create time block');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Block time" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Start</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">End</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as TimeBlockReason)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Notes (optional)</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button className="w-full" disabled={submitting} onClick={handleSubmit}>
          {submitting ? 'Saving…' : 'Block time'}
        </Button>
      </div>
    </Modal>
  );
}
