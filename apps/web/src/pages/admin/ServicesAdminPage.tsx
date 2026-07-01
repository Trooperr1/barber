import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { api, ApiError } from '../../api/client';
import type { Service } from '../../api/types';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';

export function ServicesAdminPage() {
  const { data: services, loading, refetch } = useFetch<Service[]>(() => api.get('/services'), []);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Services</h1>
        <Button onClick={() => setShowCreate(true)}>+ New service</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-3">
          {(services ?? []).map((s) => (
            <ServiceRow key={s.id} service={s} onSaved={refetch} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateServiceModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function ServiceRow({ service, onSaved }: { service: Service; onSaved: () => void }) {
  const [name, setName] = useState(service.name);
  const [durationMinutes, setDurationMinutes] = useState(String(service.durationMinutes));
  const [basePrice, setBasePrice] = useState(service.basePrice);
  const [active, setActive] = useState(service.active);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/services/${service.id}`, {
        name,
        durationMinutes: Number(durationMinutes),
        basePrice: Number(basePrice),
        active,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
      <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-[160px] rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
      <div className="flex items-center gap-1 text-sm text-zinc-500">
        <input
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
          className="w-16 rounded-lg border border-zinc-300 px-2 py-2 text-sm"
        />
        min
      </div>
      <div className="flex items-center gap-1 text-sm text-zinc-500">
        $
        <input
          value={basePrice}
          onChange={(e) => setBasePrice(e.target.value)}
          className="w-20 rounded-lg border border-zinc-300 px-2 py-2 text-sm"
        />
      </div>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active
      </label>
      <Button variant="secondary" disabled={saving} onClick={save} className="text-sm">
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}

function CreateServiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [basePrice, setBasePrice] = useState('30');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/services', { name, durationMinutes: Number(durationMinutes), basePrice: Number(basePrice) });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create service');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <h2 className="mb-4 text-lg font-bold">New service</h2>
        <div className="space-y-3">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2" />
          <div className="flex gap-3">
            <input
              placeholder="Duration (min)"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="w-1/2 rounded-xl border border-zinc-300 px-3 py-2"
            />
            <input
              placeholder="Price ($)"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              className="w-1/2 rounded-xl border border-zinc-300 px-3 py-2"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button disabled={submitting} onClick={handleSubmit} className="flex-1">
              {submitting ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
