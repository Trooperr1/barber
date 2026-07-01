import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch';
import { api } from '../../api/client';
import type { Client } from '../../api/types';
import { downloadCsv } from '../../lib/download';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { useAuth } from '../../context/AuthContext';

export function ClientsPage() {
  const { user } = useAuth();
  const isElevated = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');

  const { data, loading } = useFetch<{ total: number; clients: Client[] }>(
    () => api.get(`/clients?search=${encodeURIComponent(search)}${tag ? `&tag=${tag}` : ''}`),
    [search, tag],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Clients</h1>
        {isElevated && (
          <Button variant="secondary" onClick={() => downloadCsv('/clients/export.csv', 'clients.csv')}>
            Export CSV
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[240px] flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm"
        />
        <select value={tag} onChange={(e) => setTag(e.target.value)} className="rounded-xl border border-zinc-300 px-3 py-2 text-sm">
          <option value="">All tags</option>
          <option value="regular">Regular</option>
          <option value="VIP">VIP</option>
          <option value="referral">Referral</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3 font-medium">Last visit</th>
                <th className="px-4 py-3 font-medium">No-shows</th>
              </tr>
            </thead>
            <tbody>
              {(data?.clients ?? []).map((c) => (
                <tr key={c.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link to={`/admin/clients/${c.id}`} className="font-medium text-zinc-900 underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{c.phone}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {c.tags.map((t) => (
                        <span key={t} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">{c.lastVisit ? new Date(c.lastVisit).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">{c.noShowCount > 0 ? `⚠ ${c.noShowCount}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.clients.length === 0 && <p className="p-6 text-center text-zinc-500">No clients found.</p>}
        </div>
      )}
    </div>
  );
}
