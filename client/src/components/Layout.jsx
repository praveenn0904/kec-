import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, kindOf } from '../auth.jsx';
import { ThemeToggle } from '../theme.jsx';
import Icon from './icons.jsx';
import { Avatar } from './ui.jsx';

export const COLLEGE_NAME = 'KONGU Engineering College';

const NAV = {
  admin: [
    { to: '/directory', label: 'People', icon: 'users' },
    { to: '/timetable', label: 'Timetable', icon: 'grid' },
  ],
  faculty: [
    { to: '/', label: 'Dashboard', icon: 'home', end: true },
    { to: '/directory', label: 'Directory', icon: 'users' },
    { to: '/timetable', label: 'Timetable', icon: 'grid' },
    { to: '/attendance', label: 'Attendance', icon: 'check' },
    { to: '/cat', label: 'CAT Marks', icon: 'file' },
    { to: '/onduty', label: 'On Duty', icon: 'clipboard' },
  ],
  student: [
    { to: '/', label: 'Dashboard', icon: 'home', end: true },
    { to: '/timetable', label: 'Timetable', icon: 'grid' },
    { to: '/my-attendance', label: 'My Attendance', icon: 'check' },
    { to: '/cat', label: 'My CAT Marks', icon: 'file' },
    { to: '/directory', label: 'Staff Directory', icon: 'users' },
    { to: '/onduty', label: 'On Duty', icon: 'clipboard' },
    { to: '/placements', label: 'Placements', icon: 'briefcase' },
  ],
  placement: [
    { to: '/placements', label: 'Placements', icon: 'briefcase' },
  ],
};

const SUBTITLE = {
  admin: 'Administrator',
  faculty: 'Department staff portal',
  student: 'Student portal',
  placement: 'Placement coordinator',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const kind = kindOf(user);
  const nav = NAV[kind];

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <span className="brand-mark"><Icon name="book" size={20} /></span>
          <div>
            <strong>{COLLEGE_NAME}</strong>
            <small>{SUBTITLE[kind]}</small>
          </div>
        </div>

        <nav aria-label="Main">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="content">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            <Icon name="menu" size={22} />
          </button>
          <span className="topbar-title">{COLLEGE_NAME}</span>

          <div className="topbar-actions" role="toolbar" aria-label="Account">
            <ThemeToggle />
            <Link to="/profile" className="profile-btn" aria-label="My profile" title={`My profile (${user.name})`}>
              <Avatar name={user.name} role={user.role} />
            </Link>
            <button type="button" className="icon-btn round-btn" onClick={logout} aria-label="Log out" title="Log out">
              <Icon name="logout" size={20} />
            </button>
          </div>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
