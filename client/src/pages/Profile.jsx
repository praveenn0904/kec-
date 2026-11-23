import { useState } from 'react';
import { api, tokenStore } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, Field, PageHeader, RoleBadge, useToast } from '../components/ui.jsx';
import ContactForm from '../components/ContactForm.jsx';

function ChangePassword() {
  const toast = useToast();
  const [v, setV] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const bind = (name) => ({
    value: v[name],
    onChange: (e) => {
      setV((s) => ({ ...s, [name]: e.target.value }));
      setErrors((er) => ({ ...er, [name]: undefined }));
    },
  });

  const submit = async (e) => {
    e.preventDefault();
    if (v.newPassword !== v.confirm) {
      setErrors({ confirm: 'Passwords do not match' });
      return;
    }
    setBusy(true);
    try {
      const res = await api.changePassword({ currentPassword: v.currentPassword, newPassword: v.newPassword });
      tokenStore.set(res.token); // old sessions are signed out; keep this one
      setV({ currentPassword: '', newPassword: '', confirm: '' });
      toast('Password changed');
    } catch (err) {
      setErrors(err.fields || { currentPassword: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card card-pad form" onSubmit={submit} noValidate>
      <h2 className="card-title">Change password</h2>
      <div className="grid">
        <Field label="Current password" error={errors.currentPassword} full><input type="password" {...bind('currentPassword')} autoComplete="current-password" /></Field>
        <Field label="New password" error={errors.newPassword} hint="At least 8 characters, with a letter and a number"><input type="password" {...bind('newPassword')} autoComplete="new-password" /></Field>
        <Field label="Confirm new password" error={errors.confirm}><input type="password" {...bind('confirm')} autoComplete="new-password" /></Field>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !v.currentPassword || !v.newPassword}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </form>
  );
}

export default function Profile() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [version, setVersion] = useState(0);

  const save = async (values) => {
    await api.updateContact(user.id, values);
    await refresh();
    setVersion((n) => n + 1);
    toast('Profile updated');
  };

  return (
    <>
      <PageHeader title="My Profile" subtitle="Keep your details up to date." />
      <div className="profile-layout">
        <aside className="card card-pad profile-summary">
          <Avatar name={user.name} role={user.role} size="xl" />
          <h2>{user.name}</h2>
          <RoleBadge role={user.role} />
          <p className="muted">{user.role === 'student' ? `${user.course} · Year ${user.year}` : user.designation}</p>
          <p>{user.department}</p>
          <p className="muted">{user.role === 'student' ? user.rollNumber : user.employeeId}</p>
        </aside>

        <div className="profile-main">
          <div className="card card-pad">
            <h2 className="card-title">Personal details</h2>
            {/* key remounts the form so it re-reads the refreshed user, and resets the "saving" state */}
            <ContactForm key={version} initial={user} mode="self" onSubmit={save} />
          </div>
          <ChangePassword />
        </div>
      </div>
    </>
  );
}
