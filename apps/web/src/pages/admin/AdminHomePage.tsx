import { useMemo, useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { api } from '../../api/client';
import type { BarberPerformance, DashboardSummary } from '../../api/types';
import { endOfLocalDay, formatMoney, startOfLocalDay } from '../../lib/date';
import { downloadCsv } from '../../lib/download';
import { Spinner } from '../../components/Spinner';

type Preset = 'today' | 'week' | 'month';

function rangeFor(preset: Preset): { from: Date; to: Date } {
  const now = new Date();
  if (preset === 'today') {
    return { from: startOfLocalDay(now), to: endOfLocalDay(now) };
  }
  if (preset === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    return { from: startOfLocalDay(start), to: endOfLocalDay(now) };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: startOfLocalDay(start), to: endOfLocalDay(now) };
}

export function AdminHomePage() {
  const [preset, setPreset] = useState<Preset>('week');
  const { from, to } = useMemo(() => rangeFor(preset), [preset]);

  const { data: summary, loading } = useFetch<DashboardSummary>(
    () => api.get(`/dashboard/summary?from=${from.toISOString()}&to=${to.toISOString()}`),
    [from.toISOString(), to.toISOString()],
  );

  const { data: performance } = useFetch<BarberPerformance[]>(
    () => api.get(`/dashboard/barber-performance?from=${from.toISOString()}&to=${to.toISOString()}`),
    [from.toISOString(), to.toISOString()],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-1 rounded-xl bg-zinc-100 p-1">
          {(['today', 'week', 'month'] as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${
                preset === p ? 'bg-white shadow-sm' : 'text-zinc-500'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading || !summary ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <StatCard label="Revenue" value={formatMoney(summary.totalRevenue)} />
            <StatCard label="Appointments" value={String(summary.totalAppointments)} />
            <StatCard label="Completed" value={String(summary.statusBreakdown.COMPLETED)} />
            <StatCard label="No-shows" value={String(summary.statusBreakdown.NO_SHOW)} />
            <StatCard label="Cancelled" value={String(summary.statusBreakdown.CANCELLED)} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h2 className="mb-3 font-semibold">Revenue by barber</h2>
              <Table
                columns={['Barber', 'Appointments', 'Revenue']}
                rows={summary.byBarber.map((b) => [b.name, String(b.count), formatMoney(b.revenue)])}
              />
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h2 className="mb-3 font-semibold">Revenue by service</h2>
              <Table
                columns={['Service', 'Appointments', 'Revenue']}
                rows={summary.byService.map((s) => [s.name, String(s.count), formatMoney(s.revenue)])}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-3 font-semibold">Barber performance</h2>
            <Table
              columns={['Barber', 'Clients served', 'Completed visits', 'Revenue', 'Rebooking rate']}
              rows={(performance ?? []).map((p) => [
                p.displayName,
                String(p.clientsServed),
                String(p.appointmentsCompleted),
                formatMoney(p.revenue),
                `${Math.round(p.rebookingRate * 100)}%`,
              ])}
            />
          </div>

          <div className="flex gap-3">
            <button
              className="text-sm font-medium text-zinc-600 underline"
              onClick={() =>
                downloadCsv(
                  `/appointments/export.csv?from=${from.toISOString()}&to=${to.toISOString()}`,
                  'appointments.csv',
                )
              }
            >
              Export appointments CSV
            </button>
            <button
              className="text-sm font-medium text-zinc-600 underline"
              onClick={() => downloadCsv('/clients/export.csv', 'clients.csv')}
            >
              Export clients CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function Table({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (rows.length === 0) return <p className="text-sm text-zinc-500">No data for this period.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-zinc-500">
          {columns.map((c) => (
            <th key={c} className="pb-2 font-medium">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-zinc-100 last:border-0">
            {row.map((cell, j) => (
              <td key={j} className="py-2">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
