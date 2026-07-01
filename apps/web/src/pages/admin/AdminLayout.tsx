import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function AdminLayout() {
  const { user, logout } = useAuth();
  const isElevated = user?.role === 'OWNER' || user?.role === 'ADMIN';

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold">Fade &amp; Fortune</span>
            <nav className="flex gap-1">
              {isElevated && (
                <NavLink to="/admin" end className={linkClass}>
                  Dashboard
                </NavLink>
              )}
              <NavLink to="/admin/calendar" className={linkClass}>
                Calendar
              </NavLink>
              <NavLink to="/admin/clients" className={linkClass}>
                Clients
              </NavLink>
              {isElevated && (
                <NavLink to="/admin/barbers" className={linkClass}>
                  Barbers
                </NavLink>
              )}
              {isElevated && (
                <NavLink to="/admin/services" className={linkClass}>
                  Services
                </NavLink>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500">
              {user?.name} · {user?.role}
            </span>
            <button onClick={logout} className="text-sm font-medium text-zinc-500 underline">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
