import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch';
import { api } from '../../api/client';
import type { Barber, Client } from '../../api/types';
import { StatusBadge } from '../../components/StatusBadge';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { formatMoney } from '../../lib/date';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: client, loading, refetch } = useFetch<Client>(() => api.get(`/clients/${id}`), [id]);
  const { data: barbers } = useFetch<Barber[]>(() => api.get('/barbers?active=true'), []);

  const [generalNotes, setGeneralNotes] = useState('');
  const [newTag, setNewTag] = useState('');
  const [noteBarberId, setNoteBarberId] = useState('');
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (client) setGeneralNotes(client.generalNotes ?? '');
  }, [client]);

  if (loading || !client) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  async function saveGeneralNotes() {
    await api.patch(`/clients/${id}`, { generalNotes });
    refetch();
  }

  async function addTag() {
    if (!newTag.trim()) return;
    await api.patch(`/clients/${id}`, { tags: [...client!.tags, newTag.trim()] });
    setNewTag('');
    refetch();
  }

  async function removeTag(tag: string) {
    await api.patch(`/clients/${id}`, { tags: client!.tags.filter((t) => t !== tag) });
    refetch();
  }

  async function saveBarberNote() {
    if (!noteBarberId || !noteText.trim()) return;
    await api.put(`/clients/${id}/barber-notes`, { barberId: noteBarberId, note: noteText.trim() });
    setNoteText('');
    refetch();
  }

  return (
    <div className="space-y-6">
      <Link to="/admin/clients" className="text-sm text-zinc-500 underline">
        ← Back to clients
      </Link>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{client.name}</h1>
            <p className="text-zinc-500">
              {client.phone} {client.email ? `· ${client.email}` : ''}
            </p>
          </div>
          <div className="flex gap-4 text-sm">
            <div>
              <div className="text-zinc-500">No-shows</div>
              <div className="text-lg font-bold">{client.noShowCount}</div>
            </div>
            <div>
              <div className="text-zinc-500">Cancellations</div>
              <div className="text-lg font-bold">{client.cancellationCount}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {client.tags.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-sm">
              {t}
              <button onClick={() => removeTag(t)} className="text-zinc-400 hover:text-zinc-700">
                ×
              </button>
            </span>
          ))}
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
            placeholder="Add tag…"
            className="rounded-full border border-zinc-300 px-3 py-1 text-sm"
          />
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            General notes (visible to all staff — e.g. allergy warnings)
          </label>
          <textarea
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
            onBlur={saveGeneralNotes}
            rows={2}
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 font-semibold">Barber notes</h2>
        <div className="space-y-2">
          {(client.barberNotes ?? []).map((n) => (
            <div key={n.id} className="rounded-lg bg-zinc-50 p-3 text-sm">
              <span className="font-medium">{n.barber.displayName}: </span>
              {n.note}
            </div>
          ))}
          {(client.barberNotes ?? []).length === 0 && <p className="text-sm text-zinc-500">No barber notes yet.</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={noteBarberId}
            onChange={(e) => setNoteBarberId(e.target.value)}
            className="rounded-xl border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Select barber…</option>
            {(barbers ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.displayName}
              </option>
            ))}
          </select>
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="e.g. fades on the sides, no scissor on top"
            className="min-w-[280px] flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm"
          />
          <Button variant="secondary" onClick={saveBarberNote}>
            Save note
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 font-semibold">Visit history</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Barber</th>
              <th className="pb-2 font-medium">Service</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Price</th>
              <th className="pb-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {(client.appointments ?? []).map((a) => (
              <tr key={a.id} className="border-t border-zinc-100">
                <td className="py-2">{new Date(a.startTime).toLocaleDateString()}</td>
                <td className="py-2">{a.barber?.displayName}</td>
                <td className="py-2">{a.service?.name}</td>
                <td className="py-2">
                  <StatusBadge status={a.status} />
                </td>
                <td className="py-2">{formatMoney(a.priceCharged)}</td>
                <td className="py-2 text-zinc-500">{a.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(client.appointments ?? []).length === 0 && <p className="text-sm text-zinc-500">No visits yet.</p>}
      </div>
    </div>
  );
}
