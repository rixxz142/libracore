import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Field from '../components/Field';
import Icon from '../components/Icon';
import { useAuth } from '../services/auth';
import { useTheme } from '../services/theme';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const { resolved, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    const nextErrors = {};
    if (!email.trim()) nextErrors.email = 'Enter your email address';
    if (!password) nextErrors.password = 'Enter your password';
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setFormError(err.message);
      setErrors(err.details || {});
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-cover" aria-hidden="true">
        <span className="wordmark">LibraCore</span>
        <div>
          <span className="label">Circulation desk</span>
          <h1>Every book <em>out</em>, every book <em>back.</em></h1>
        </div>
        <div className="catalog-card">
          <div className="row"><span>CALL NO.</span><span>899.221 HIR l</span></div>
          <div className="row"><span>AUTHOR</span><span>Hirata, Andrea</span></div>
          <div className="row"><span>TITLE</span><span>Laskar Pelangi</span></div>
          <div className="row"><span>COPIES</span><span>4 · Fiction</span></div>
          <div className="punch" />
        </div>
      </section>

      <section className="login-form-side">
        <div className="login-form">
          <h2>Sign in</h2>
          <p className="muted">Staff and borrowers use the same door.</p>

          {formError && <div className="alert" role="alert">{formError}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <Field label="Email" error={errors.email} required>
              {(props) => (
                <input {...props} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
              )}
            </Field>
            <Field label="Password" error={errors.password} required>
              {(props) => (
                <input {...props} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              )}
            </Field>
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="login-foot">
            <span>No account? Ask at the desk.</span>
            <button
              type="button"
              className="theme-toggle"
              onClick={toggle}
              aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <Icon name={resolved === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
