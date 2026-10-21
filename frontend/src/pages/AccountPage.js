import { useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../services/auth';
import { useTheme } from '../services/theme';
import { useToast } from '../components/Toast';
import Field from '../components/Field';

const ROLE_LABEL = { admin: 'Administrator', librarian: 'Librarian', borrower: 'Borrower' };
const MIN_PASSWORD = 10;

function PasswordForm() {
  const notify = useToast();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    const next = {};
    if (!values.currentPassword) next.currentPassword = 'Enter your current password';
    if (values.newPassword.length < MIN_PASSWORD) next.newPassword = `Use at least ${MIN_PASSWORD} characters`;
    else if (values.newPassword !== values.confirm) next.confirm = 'The two passwords don’t match';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      await api.post('/auth/password', { currentPassword: values.currentPassword, newPassword: values.newPassword });
      notify('Password changed');
      setValues({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setErrors(err.details || { currentPassword: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ maxWidth: 360 }}>
      <Field label="Current password" error={errors.currentPassword} required>
        {(p) => <input {...p} type="password" autoComplete="current-password" value={values.currentPassword} onChange={set('currentPassword')} />}
      </Field>
      <Field label="New password" error={errors.newPassword} required hint={`At least ${MIN_PASSWORD} characters`}>
        {(p) => <input {...p} type="password" autoComplete="new-password" value={values.newPassword} onChange={set('newPassword')} />}
      </Field>
      <Field label="Repeat new password" error={errors.confirm} required>
        {(p) => <input {...p} type="password" autoComplete="new-password" value={values.confirm} onChange={set('confirm')} />}
      </Field>
      <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Change password'}</button>
    </form>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  const { preference, setPreference } = useTheme();

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="label">{ROLE_LABEL[user.role]}</span>
          <h1>Your account</h1>
        </div>
      </header>

      <div className="settings">
        <h2>Profile</h2>
        <div>
          <dl className="definition">
            <dt>Name</dt><dd>{user.name}</dd>
            <dt>Sign-in email</dt><dd className="mono">{user.email}</dd>
            <dt>Role</dt><dd>{ROLE_LABEL[user.role]}</dd>
          </dl>
          {user.role === 'borrower' && (
            <p className="muted small" style={{ marginTop: 14 }}>To change your name or email, ask at the desk.</p>
          )}
        </div>

        <h2>Password</h2>
        <div><PasswordForm /></div>

        <h2>Appearance</h2>
        <div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sr-only">Theme</legend>
            <div className="theme-options">
              {[
                { value: 'system', label: 'Match my device' },
                { value: 'light', label: 'Light — paper' },
                { value: 'dark', label: 'Dark — ink' },
              ].map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="theme"
                    value={option.value}
                    checked={preference === option.value}
                    onChange={() => setPreference(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
