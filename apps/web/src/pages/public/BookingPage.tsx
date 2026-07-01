import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { formatDateKey, formatMoney, formatTime } from '../../lib/date';

interface PublicService {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  basePrice: string;
}

interface PublicBarber {
  id: string;
  displayName: string;
  bio: string | null;
  services: { serviceId: string; priceOverride: string | null }[];
}

interface Slot {
  barberId: string;
  start: string;
  end: string;
}

type Step = 'service' | 'barber' | 'time' | 'contact' | 'done';

export function BookingPage() {
  const [step, setStep] = useState<Step>('service');
  const [services, setServices] = useState<PublicService[]>([]);
  const [barbers, setBarbers] = useState<PublicBarber[]>([]);

  const [serviceId, setServiceId] = useState('');
  const [barberId, setBarberId] = useState(''); // '' unset, 'any', or a barber id
  const [date, setDate] = useState(formatDateKey(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ manageLink: string; start: string } | null>(null);

  useEffect(() => {
    api.get<PublicService[]>('/public/services').then(setServices);
    api.get<PublicBarber[]>('/public/barbers').then(setBarbers);
  }, []);

  useEffect(() => {
    if (step !== 'time' || !serviceId || !barberId) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    api
      .get<{ slots: Slot[] }>(`/public/availability?serviceId=${serviceId}&barberId=${barberId}&date=${date}`)
      .then((res) => setSlots(res.slots))
      .finally(() => setLoadingSlots(false));
  }, [step, serviceId, barberId, date]);

  const service = services.find((s) => s.id === serviceId);
  const eligibleBarbers = barbers.filter((b) => b.services.some((s) => s.serviceId === serviceId));

  async function handleConfirm() {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ manageLink: string; startTime: string }>('/public/appointments', {
        serviceId,
        barberId: selectedSlot.barberId,
        startTime: selectedSlot.start,
        client: { name, phone, email: email || undefined },
      });
      setConfirmation({ manageLink: res.manageLink, start: res.startTime });
      setStep('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not complete booking');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold">Book an appointment</h1>
      <p className="mb-6 text-sm text-zinc-500">Fade &amp; Fortune Barbershop</p>

      {step === 'service' && (
        <div className="space-y-3">
          {services.length === 0 && <Spinner />}
          {services.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setServiceId(s.id);
                setBarberId('');
                setStep('barber');
              }}
              className="w-full rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">{s.name}</span>
                <span className="font-semibold">{formatMoney(s.basePrice)}</span>
              </div>
              <div className="text-sm text-zinc-500">{s.durationMinutes} min</div>
            </button>
          ))}
        </div>
      )}

      {step === 'barber' && (
        <div className="space-y-3">
          <button
            onClick={() => {
              setBarberId('any');
              setStep('time');
            }}
            className="w-full rounded-2xl border-2 border-zinc-900 bg-white p-4 text-left font-semibold"
          >
            Any available barber
          </button>
          {eligibleBarbers.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                setBarberId(b.id);
                setStep('time');
              }}
              className="w-full rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm"
            >
              <div className="text-lg font-semibold">{b.displayName}</div>
              {b.bio && <div className="text-sm text-zinc-500">{b.bio}</div>}
            </button>
          ))}
          <BackButton onClick={() => setStep('service')} />
        </div>
      )}

      {step === 'time' && (
        <div className="space-y-4">
          <input
            type="date"
            value={date}
            min={formatDateKey(new Date())}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
          />
          {loadingSlots ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : slots.length === 0 ? (
            <p className="text-center text-zinc-500">No open times that day. Try another date.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => (
                <button
                  key={`${slot.barberId}-${slot.start}`}
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded-xl border px-2 py-3 text-sm font-medium ${
                    selectedSlot?.start === slot.start && selectedSlot?.barberId === slot.barberId
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-300 bg-white'
                  }`}
                >
                  {formatTime(slot.start)}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <BackButton onClick={() => setStep('barber')} />
            <Button className="flex-1" disabled={!selectedSlot} onClick={() => setStep('contact')}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 'contact' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-zinc-100 p-4 text-sm">
            <div className="font-semibold">{service?.name}</div>
            {selectedSlot && (
              <div>
                {new Date(selectedSlot.start).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
            )}
          </div>
          <input
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
          />
          <input
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
          />
          <input
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <BackButton onClick={() => setStep('time')} />
            <Button className="flex-1" disabled={!name || !phone || submitting} onClick={handleConfirm}>
              {submitting ? 'Booking…' : 'Confirm booking'}
            </Button>
          </div>
        </div>
      )}

      {step === 'done' && confirmation && (
        <div className="space-y-4 text-center">
          <div className="text-4xl">✅</div>
          <h2 className="text-xl font-bold">You&apos;re booked!</h2>
          <p className="text-zinc-600">
            {new Date(confirmation.start).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
          </p>
          <p className="text-sm text-zinc-500">We sent a confirmation to your phone/email with a link to manage this appointment.</p>
          <Link to={confirmation.manageLink.replace(window.location.origin, '')} className="text-sm font-medium underline">
            Manage this appointment
          </Link>
        </div>
      )}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" onClick={onClick}>
      Back
    </Button>
  );
}
