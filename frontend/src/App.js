import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './services/auth';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CatalogPage from './pages/CatalogPage';
import MembersPage from './pages/MembersPage';
import LoansPage from './pages/LoansPage';
import ReportsPage from './pages/ReportsPage';
import BorrowerHomePage from './pages/BorrowerHomePage';
import AccountPage from './pages/AccountPage';
import NotFoundPage from './pages/NotFoundPage';

const TITLES = {
  '/': 'Home', '/loans': 'Loans', '/catalog': 'Catalog', '/members': 'Members', '/reports': 'Reports', '/account': 'Account',
};

// Frontend route protection is a usability feature; the API enforces access.
function RequireAuth({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="boot-screen" role="status">Opening the circulation desk…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  const location = useLocation();
  const isBorrower = user?.role === 'borrower';
  const staff = ['admin', 'librarian'];

  useEffect(() => {
    const title = TITLES[location.pathname];
    document.title = title ? `${title} · LibraCore` : 'LibraCore';
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={isBorrower ? <BorrowerHomePage /> : <DashboardPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="loans" element={<RequireAuth roles={staff}><LoansPage /></RequireAuth>} />
        <Route path="members" element={<RequireAuth roles={staff}><MembersPage /></RequireAuth>} />
        <Route path="reports" element={<RequireAuth roles={['admin']}><ReportsPage /></RequireAuth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
