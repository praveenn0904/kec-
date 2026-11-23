import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useMeta } from '../hooks.js';
import { Field } from '../components/ui.jsx';
import { AuthShell } from './Login.jsx';
import Icon from '../components/icons.jsx';

const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export default function Register() {
  const { register } = useAuth();
  const meta = useMeta();
  const departments = meta?.departments || [];
  const [v, setV] = useState({
    name: '', email: '', phone: '', department: '', rollNumber: '', course: '', year: '1', section: 'A',
    guardianName: '', guardianPhone: '', password: '', confirm: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const dept = departments.find((d) => d.name === v.department);
  const maxYear = dept?.maxYear || 4;

  const bind = (name) => ({
    value: v[name],
    onChange: (e) => {
      setV((s) => ({ ...s, [name]: e.target.value }));
      if (errors[name]) setErrors((er) => ({ ...er, [name]: undefined }));
    },
  });

  const chooseDepartment = (e) => {
    const next = departments.find((d) => d.name === e.target.value);
    setV((s) => ({
      ...s,
      department: e.target.value,
      course: next ? next.degree : s.course,
      year: Number(s.year) > (next?.maxYear || 4) ? '1' : s.year,
    }));
    setErrors((er) => ({ ...er, department: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (v.password !== v.confirm) {
      setErrors({ confirm: 'Passwords do not match' });
      return;
    }
    setBusy(true);
    try {
      const { confirm, ...payload } = v;
      await register(payload);
    } catch (err) {
      setErrors(err.fields || {});
      if (!err.fields || !Object.keys(err.fields).length) setFormError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <form className="auth-card auth-card-wide" onSubmit={submit} noValidate>
        <div className="auth-logo">
          <span className="brand-mark"><Icon name="book" size={20} /></span>
          <strong>KONGU Engineering College</strong>
        </div>
        <h1>Create student account</h1>
        <p className="muted">Enter your details. You can edit them any time after logging in.</p>

        <div className="grid">
          <Field label="Full name *" error={errors.name} full><input {...bind('name')} placeholder="As on your college ID" autoFocus /></Field>
          <Field label="Email *" error={errors.email}><input type="email" {...bind('email')} placeholder="name@kongu.edu" autoComplete="username" /></Field>
          <Field label="Phone *" error={errors.phone}><input type="tel" {...bind('phone')} placeholder="+91 98765 43210" /></Field>
          <Field label="Department *" error={errors.department} full>
            <select value={v.department} onChange={chooseDepartment}>
              <option value="">Select your department…</option>
              {departments.map((d) => <option key={d.code} value={d.name}>{d.name} ({d.code})</option>)}
            </select>
          </Field>
          <Field label="Roll number *" error={errors.rollNumber}><input {...bind('rollNumber')} placeholder="e.g. 24CSE001" /></Field>
          <Field label="Course *" error={errors.course}><input {...bind('course')} placeholder="e.g. B.E." /></Field>
          <Field label="Year *" error={errors.year}>
            <select {...bind('year')}>
              {Array.from({ length: maxYear }, (_, i) => i + 1).map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </Field>
          <Field label="Section *" error={errors.section}>
            <select {...bind('section')}>
              {SECTIONS.map((x) => <option key={x} value={x}>Section {x}</option>)}
            </select>
          </Field>
          <Field label="Guardian name" error={errors.guardianName}><input {...bind('guardianName')} /></Field>
          <Field label="Guardian phone" error={errors.guardianPhone}><input type="tel" {...bind('guardianPhone')} /></Field>
          <Field label="Password *" error={errors.password} hint="At least 8 characters, with a letter and a number">
            <input type="password" {...bind('password')} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password *" error={errors.confirm}>
            <input type="password" {...bind('confirm')} autoComplete="new-password" />
          </Field>
        </div>

        {formError && <p className="form-error" role="alert">{formError}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
        <p className="auth-switch">Already registered? <Link to="/login">Log in</Link></p>
      </form>
    </AuthShell>
  );
}
