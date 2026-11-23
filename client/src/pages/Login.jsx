import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useMeta } from '../hooks.js';
import Icon from '../components/icons.jsx';
import { ThemeToggle } from '../theme.jsx';

export function AuthShell({ children }) {
  return (
    <div className="auth">
      <ThemeToggle className="auth-theme" />
      <section className="auth-brand">
        <img
          className="auth-photo"
          src="/kongu-campus.png"
          alt="KONGU Engineering College campus building"
          width="351"
          height="227"
        />
        <div className="auth-title">
          <h2>KONGU Engineering College</h2>
          <p>Contact, Attendance &amp; Placement Portal</p>
        </div>
        <ul>
          <li>Student and staff directory across 17 departments</li>
          <li>Daily attendance, on-duty requests and reports</li>
          <li>Placement drives, opt in or out, and round-wise results</li>
        </ul>
      </section>
      <section className="auth-panel">{children}</section>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const meta = useMeta();
  const [role, setRole] = useState('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const demo = meta?.demoAccounts;
  const demos = !demo
    ? []
    : role === 'student'
      ? [['student account', demo.student]]
      : [['department staff account', demo.staff], ['placement coordinator account', demo.placement]];

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(role, email.trim(), password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const switchRole = (r) => {
    setRole(r);
    setError('');
  };

  return (
    <AuthShell>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">
          <span className="brand-mark"><Icon name="book" size={20} /></span>
          <strong>KONGU Engineering College</strong>
        </div>
        <h1>Welcome back</h1>
        <p className="muted">Log in to continue to your portal.</p>

        <div className="segmented segmented-full" role="tablist" aria-label="Login type">
          {[['student', 'Student'], ['staff', 'Staff'], ['admin', 'Administrator']].map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={role === value}
              className={role === value ? 'active' : ''} onClick={() => switchRole(value)}>
              {label} login
            </button>
          ))}
        </div>

        <label className="field">
          <span className="field-label">Email address</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username"
            placeholder={role === 'staff' ? 'name.dept@kongu.edu' : role === 'admin' ? 'administrator email' : 'name@kongu.edu'} required autoFocus />
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <div className="input-group">
            <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" placeholder="Enter your password" required />
            <button type="button" className="input-addon" onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Hide password' : 'Show password'}>
              <Icon name={show ? 'eyeOff' : 'eye'} />
            </button>
          </div>
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : `Log in as ${role}`}
        </button>

        {role === 'student' ? (
          <p className="auth-switch">New student? <Link to="/register">Create your account</Link></p>
        ) : (
          <p className="auth-switch muted">
            Staff use their department email, e.g. <strong>fathima.csd@kongu.edu</strong>. Placement coordinators use <strong>placement.csd@kongu.edu</strong>.
          </p>
        )}

        {demos.map(([label, demo]) => (
          <div className="demo-box" key={demo.email}>
            <div>
              <strong>Demo {label}</strong>
              <span>{demo.email} · {demo.password}</span>
            </div>
            <button type="button" className="btn btn-small" onClick={() => { setEmail(demo.email); setPassword(demo.password); setError(''); }}>
              Fill in
            </button>
          </div>
        ))}
      </form>
    </AuthShell>
  );
}
