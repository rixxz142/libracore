import { useEffect, useState } from 'react';
import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { useAuth } from '../services/auth';
import { useTheme } from '../services/theme';

const STAFF_NAV = [
  { to: '/', label: 'Daybook', end: true },
  { to: '/loans', label: 'Loans' },
  { to: '/catalog', label: 'Catalog' },
  { to: '/members', label: 'Members' },
  { to: '/reports', label: 'Reports', role: 'admin' },
];

const BORROWER_NAV = [
  { to: '/', label: 'My loans', end: true },
  { to: '/catalog', label: 'Catalog' },
];

const ROLE_LABEL = { admin: 'Administrator', librarian: 'Librarian', borrower: 'Borrower' };

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const nav = (user.role === 'borrower' ? BORROWER_NAV : STAFF_NAV).filter((item) => !item.role || item.role === user.role);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className={navOpen ? 'nav-open' : ''}>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="masthead">
        <div className="masthead-inner">
          <button
            type="button"
            className="icon-button nav-toggle"
            onClick={() => setNavOpen((o) => !o)}
            aria-label="Menu"
            aria-expanded={navOpen}
          >
            <Icon name={navOpen ? 'close' : 'menu'} />
          </button>
          <Link to="/" className="wordmark">
            LibraCore<span>{user.role === 'borrower' ? 'Reader' : 'Circulation'}</span>
          </Link>
          <nav className="main-nav" aria-label="Main">
            <ul>
              {nav.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end}>{item.label}</NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="masthead-tools">
            <div className="masthead-user">
              <Link to="/account">{user.name}</Link>
              <span className="label">{ROLE_LABEL[user.role]}</span>
            </div>
            <button
              type="button"
              className="theme-toggle"
              onClick={toggle}
              aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={resolved === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              <Icon name={resolved === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>
            <button type="button" className="link-button" onClick={handleLogout}>Sign out</button>
          </div>
        </div>
      </header>
      <main id="main" className="content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
