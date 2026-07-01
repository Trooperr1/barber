import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { api, ApiError } from '../api/client';
import type { Barber, Client, Service, Slot } from '../api/types';
import { formatDateKey, formatTime } from '../lib/date';

interface Props {
  fixedBarberId?: string;
  defaultDate: Date;
  onClose: () => void;
  onCreated: () => void;
}

export function AddAppointmentModal({ fixedBarberId, defaultDate, onClose, onCreated }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);

  const [clientMode, setClientMode] = useState<'search' | 'new'>('search');
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [newClient, setNewClient] = useState({ name: '', phone: '', email: '' });

  const [serviceId, setServiceId] = useState('');
  const [barberId, setBarberId] = useState(fixedBarberId ?? '');
  const [date, setDate] = useState(formatDateKey(defaultDate));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [source, setSource] = useState<'WALK_IN' | 'PHONE'>('WALK_IN');
  const [notes, setNotes] = useState('');

  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Service[]>('/services?active=true').then(setServices);
    if (!fixedBarberId) {
      api.get<Barber[]>('/barbers?active=true').then(setBarbers);
    }
  }, [fixedBarberId]);

  useEffect(() => {
    if (clientMode !== 'search' || clientSearch.trim().length < 2) {
      setClientResults([]);
      return;
    }
    const handle = setTimeout(() => {
      api.get<{ clients: Client[] }>(`/clients?search=${encodeURIComponent(clientSearch)}&limit=8`).then((res) =>
        setClientResults(res.clients),
      );
    }, 250);
    return () => clearTimeout(handle);
  }, [clientSearch, clientMode]);

  useEffect(() => {
    setSelectedSlot(null);
    if (!serviceId || !barberId || !date) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    api
      .get<{ slots: Slot[] }>(`/appointments/availability?serviceId=${serviceId}&barberId=${barberId}&date=${date}`)
      .then((res) => setSlots(res.slots))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [serviceId, barberId, date]);

  const canSubmit =
    (selectedClient || (newClient.name && newClient.phone)) &&
    serviceId &&
    barberId &&
    (barberId === 'any' ? date : selectedSlot);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/appointments', {
        clientId: selectedClient?.id,
        newClient: selectedClient
          ? undefined
          : { name: newClient.name, phone: newClient.phone, email: newClient.email || undefined },
        barberId,
        serviceId,
        date: barberId === 'any' ? date : undefined,
        startTime: barberId === 'any' ? undefined : selectedSlot?.start,
        source,
        notes: notes || undefined,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create appointment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Add walk-in / phone booking" onClose={onClose}>
      <div className="space-y-5">
        <section>
          <div className="mb-2 flex gap-2">
            <button
              className={`rounded-full px-3 py-1 text-sm font-medium ${clientMode === 'search' ? 'bg-zinc-900 text-white' : 'bg-zinc-100'}`}
              onClick={() => setClientMode('search')}
            >
              Existing client
            </button>
            <button
              className={`rounded-full px-3 py-1 text-sm font-medium ${clientMode === 'new' ? 'bg-zinc-900 text-white' : 'bg-zinc-100'}`}
              onClick={() => setClientMode('new')}
            >
              New client
            </button>
          </div>

          {clientMode === 'search' ? (
            <div>
              <input
                placeholder="Search by name or phone…"
                value={selectedClient ? selectedClient.name : clientSearch}
                onChange={(e) => {
                  setSelectedClient(null);
                  setClientSearch(e.target.value);
                }}
                className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
              />
              {!selectedClient && clientResults.length > 0 && (
                <ul className="mt-1 max-h-40 divide-y overflow-y-auto rounded-xl border border-zinc-200">
                  {clientResults.map((c) => (
                    <li key={c.id}>
                      <button
                        className="w-full px-3 py-2 text-left hover:bg-zinc-50"
                        onClick={() => {
                          setSelectedClient(c);
                          setClientResults([]);
                        }}
                      >
                        <div className="font-medium">{c.name}</div>
                        <div className="text-sm text-zinc-500">{c.phone}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                placeholder="Name"
                value={newClient.name}
                onChange={(e) => setNewClient((s) => ({ ...s, name: e.target.value }))}
                className="rounded-xl border border-zinc-300 px-3 py-3 text-base"
              />
              <input
                placeholder="Phone"
                value={newClient.phone}
                onChange={(e) => setNewClient((s) => ({ ...s, phone: e.target.value }))}
                className="rounded-xl border border-zinc-300 px-3 py-3 text-base"
              />
              <input
                placeholder="Email (optional)"
                value={newClient.email}
                onChange={(e) => setNewClient((s) => ({ ...s, email: e.target.value }))}
                className="rounded-xl border border-zinc-300 px-3 py-3 text-base"
              />
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Service</label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
            >
              <option value="">Select…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.durationMinutes}m · ${s.basePrice})
                </option>
              ))}
            </select>
          </div>

          {!fixedBarberId && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Barber</label>
              <select
                value={barberId}
                onChange={(e) => setBarberId(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
              >
                <option value="">Select…</option>
                <option value="any">Any available</option>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as 'WALK_IN' | 'PHONE')}
              className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
            >
              <option value="WALK_IN">Walk-in</option>
              <option value="PHONE">Phone</option>
            </select>
          </div>
        </section>

        {barberId && barberId !== 'any' && (
          <section>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Time</label>
            {loadingSlots ? (
              <p className="text-sm text-zinc-500">Loading times…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-zinc-500">No open times that day.</p>
            ) : (
              <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                {slots.map((slot) => (
                  <button
                    key={slot.start}
                    onClick={() => setSelectedSlot(slot)}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      selectedSlot?.start === slot.start
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    {formatTime(slot.start)}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {barberId === 'any' && (
          <p className="text-sm text-zinc-500">We&apos;ll book the first available barber that day.</p>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-base"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button className="w-full" disabled={!canSubmit || submitting} onClick={handleSubmit}>
          {submitting ? 'Booking…' : 'Confirm booking'}
        </Button>
      </div>
    </Modal>
  );
}
