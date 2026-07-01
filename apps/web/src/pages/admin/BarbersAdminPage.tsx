import { useEffect, useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { api, ApiError } from '../../api/client';
import type { Barber, BarberWorkingHours, Service } from '../../api/types';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function minuteToTimeInput(minute: number): string {
  const h = String(Math.floor(minute / 60)).padStart(2, '0');
  const m = String(minute % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function timeInputToMinute(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function BarbersAdminPage() {
  const { data: barbers, loading, refetch } = useFetch<Barber[]>(() => api.get('/barbers'), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!selectedId && barbers && barbers.length > 0) setSelectedId(barbers[0].id);
  }, [barbers, selectedId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Barbers</h1>
          <Button variant="secondary" onClick={() => setShowCreate(true)}>
            + New
          </Button>
        </div>
        <div className="space-y-2">
          {(barbers ?? []).map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedId(b.id)}
              className={`w-full rounded-xl border p-3 text-left ${
                selectedId === b.id ? 'border-zinc-900 bg-white' : 'border-zinc-200 bg-white/60'
              }`}
            >
              <div className="font-medium">{b.displayName}</div>
              <div className="text-xs text-zinc-500">{b.active ? 'Active' : 'Inactive'}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="lg:col-span-2">
        {selectedId && <BarberEditor barberId={selectedId} onSaved={refetch} />}
      </div>

      {showCreate && (
        <CreateBarberModal
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

function BarberEditor({ barberId, onSaved }: { barberId: string; onSaved: () => void }) {
  const { data: barber, loading, refetch } = useFetch<Barber>(() => api.get(`/barbers/${barberId}`), [barberId]);
  const { data: services } = useFetch<Service[]>(() => api.get('/services'), []);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [active, setActive] = useState(true);
  const [buffer, setBuffer] = useState<string>('');
  const [hours, setHours] = useState<BarberWorkingHours[]>([]);
  const [offerings, setOfferings] = useState<Record<string, { active: boolean; priceOverride: string }>>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [savingServices, setSavingServices] = useState(false);

  useEffect(() => {
    if (!barber) return;
    setDisplayName(barber.displayName);
    setBio(barber.bio ?? '');
    setActive(barber.active);
    setBuffer(barber.bufferMinutesOverride?.toString() ?? '');
    setHours(
      Array.from({ length: 7 }, (_, day) => {
        const existing = barber.workingHours?.find((h) => h.dayOfWeek === day);
        return existing ?? { id: '', barberId, dayOfWeek: day, startMinute: 540, endMinute: 1080, isOff: false };
      }),
    );
    const offeringMap: Record<string, { active: boolean; priceOverride: string }> = {};
    for (const s of barber.services ?? []) {
      offeringMap[s.serviceId] = { active: s.active, priceOverride: s.priceOverride ?? '' };
    }
    setOfferings(offeringMap);
  }, [barber, barberId]);

  if (loading || !barber) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await api.patch(`/barbers/${barberId}`, {
        displayName,
        bio,
        active,
        bufferMinutesOverride: buffer === '' ? null : Number(buffer),
      });
      refetch();
      onSaved();
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveHours() {
    setSavingHours(true);
    try {
      await api.put(`/barbers/${barberId}/working-hours`, {
        hours: hours.map(({ dayOfWeek, startMinute, endMinute, isOff }) => ({ dayOfWeek, startMinute, endMinute, isOff })),
      });
      refetch();
    } finally {
      setSavingHours(false);
    }
  }

  async function saveServices() {
    setSavingServices(true);
    try {
      await api.put(`/barbers/${barberId}/services`, {
        services: (services ?? []).map((s) => ({
          serviceId: s.id,
          active: offerings[s.id]?.active ?? false,
          priceOverride: offerings[s.id]?.priceOverride ? Number(offerings[s.id].priceOverride) : null,
        })),
      });
      refetch();
    } finally {
      setSavingServices(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Profile</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Buffer override (minutes, blank = shop default)</label>
            <input
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-zinc-700">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>
        </div>
        <Button className="mt-3" disabled={savingProfile} onClick={saveProfile}>
          {savingProfile ? 'Saving…' : 'Save profile'}
        </Button>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Working hours</h2>
        <div className="space-y-2">
          {hours.map((h, i) => (
            <div key={h.dayOfWeek} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="w-24">{DAY_NAMES[h.dayOfWeek]}</span>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={h.isOff}
                  onChange={(e) => {
                    const next = [...hours];
                    next[i] = { ...h, isOff: e.target.checked };
                    setHours(next);
                  }}
                />
                Off
              </label>
              {!h.isOff && (
                <>
                  <input
                    type="time"
                    value={minuteToTimeInput(h.startMinute)}
                    onChange={(e) => {
                      const next = [...hours];
                      next[i] = { ...h, startMinute: timeInputToMinute(e.target.value) };
                      setHours(next);
                    }}
                    className="rounded-lg border border-zinc-300 px-2 py-1"
                  />
                  <span>to</span>
                  <input
                    type="time"
                    value={minuteToTimeInput(h.endMinute)}
                    onChange={(e) => {
                      const next = [...hours];
                      next[i] = { ...h, endMinute: timeInputToMinute(e.target.value) };
                      setHours(next);
                    }}
                    className="rounded-lg border border-zinc-300 px-2 py-1"
                  />
                </>
              )}
            </div>
          ))}
        </div>
        <Button className="mt-3" disabled={savingHours} onClick={saveHours}>
          {savingHours ? 'Saving…' : 'Save hours'}
        </Button>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Services offered</h2>
        <div className="space-y-2">
          {(services ?? []).map((s) => {
            const offering = offerings[s.id] ?? { active: false, priceOverride: '' };
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex w-56 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={offering.active}
                    onChange={(e) =>
                      setOfferings((prev) => ({ ...prev, [s.id]: { ...offering, active: e.target.checked } }))
                    }
                  />
                  {s.name} (${s.basePrice})
                </label>
                {offering.active && (
                  <input
                    placeholder="Price override"
                    value={offering.priceOverride}
                    onChange={(e) =>
                      setOfferings((prev) => ({ ...prev, [s.id]: { ...offering, priceOverride: e.target.value } }))
                    }
                    className="w-32 rounded-lg border border-zinc-300 px-2 py-1"
                  />
                )}
              </div>
            );
          })}
        </div>
        <Button className="mt-3" disabled={savingServices} onClick={saveServices}>
          {savingServices ? 'Saving…' : 'Save services'}
        </Button>
      </div>
    </div>
  );
}

function CreateBarberModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/auth/users', { name, email, password, role: 'BARBER', displayName: name });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create barber');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <h2 className="mb-4 text-lg font-bold">New barber</h2>
        <div className="space-y-3">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2" />
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-zinc-300 px-3 py-2" />
          <input
            placeholder="Temporary password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-2"
          />
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
