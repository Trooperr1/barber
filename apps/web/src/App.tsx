import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { FullPageSpinner } from './components/Spinner';
import { LoginPage } from './pages/LoginPage';
import { BarberSchedulePage } from './pages/barber/BarberSchedulePage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminHomePage } from './pages/admin/AdminHomePage';
import { CalendarPage } from './pages/admin/CalendarPage';
import { ClientsPage } from './pages/admin/ClientsPage';
import { ClientDetailPage } from './pages/admin/ClientDetailPage';
import { BarbersAdminPage } from './pages/admin/BarbersAdminPage';
import { ServicesAdminPage } from './pages/admin/ServicesAdminPage';
import { BookingPage } from './pages/public/BookingPage';
import { ManagePage } from './pages/public/ManagePage';

function RoleHome() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'BARBER') return <Navigate to="/barber" replace />;
  if (user.role === 'FRONT_DESK') return <Navigate to="/admin/calendar" replace />;
  return <Navigate to="/admin" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/book" element={<BookingPage />} />
          <Route path="/manage/:token" element={<ManagePage />} />

          <Route path="/" element={<RoleHome />} />

          <Route
            path="/barber"
            element={
              <ProtectedRoute roles={['BARBER']}>
                <BarberSchedulePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={['OWNER', 'ADMIN', 'FRONT_DESK']}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminHomePage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="clients/:id" element={<ClientDetailPage />} />
            <Route path="barbers" element={<BarbersAdminPage />} />
            <Route path="services" element={<ServicesAdminPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
