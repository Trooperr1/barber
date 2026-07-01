import { getAccessToken } from '../api/client';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

// CSV export routes require the JWT bearer token, so a plain <a href> can't
// be used (no way to attach an Authorization header to a browser navigation).
export async function downloadCsv(path: string, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
