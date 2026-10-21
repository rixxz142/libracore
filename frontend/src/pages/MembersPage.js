import { useState } from 'react';
import { api, toQuery } from '../services/api';
import { useAuth } from '../services/auth';
import { useDebounced, useResource } from '../services/useResource';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import Field from '../components/Field';
import ConfirmDialog from '../components/ConfirmDialog';
import { EmptyState, ErrorState, Pagination, SearchInput, Status, TableSkeleton } from '../components/DataState';

const EMPTY_MEMBER = { memberCode: '', name: '', email: '', phone: '', status: 'active' };
const MIN_PASSWORD = 10;

function MemberForm({ member, onClose, onSaved }) {
  const notify = useToast();
  const [values, setValues] = useState(member
    ? { memberCode: member.memberCode, name: member.name, email: member.email || '', phone: member.phone || '', status: member.status }
    : EMPTY_MEMBER);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    const clientErrors = {};
    if (!/^[A-Za-z0-9-]{3,30}$/.test(values.memberCode.trim())) clientErrors.memberCode = 'Use 3–30 letters, digits or dashes';
    if (!values.name.trim()) clientErrors.name = 'Enter the member’s name';
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) clientErrors.email = 'Enter a valid email address';
    if (member?.hasAccount && !values.email.trim()) clientErrors.email = 'Needed while this member can sign in';
    setErrors(clientErrors);
    setFormError('');
    if (Object.keys(clientErrors).length) return;

    const payload = {
      memberCode: values.memberCode,
      name: values.name,
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      status: values.status,
    };
    setSaving(true);
    try {
      const res = member ? await api.patch(`/members/${member.id}`, payload) : await api.post('/members', payload);
      notify(member ? `Saved ${res.data.name}` : `Card issued to ${res.data.name}`);
      onSaved();
    } catch (err) {
      setErrors(err.details || {});
      setFormError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={member ? 'Edit member' : 'Issue a library card'}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="member-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : member ? 'Save member' : 'Issue card'}
          </button>
        </>
      )}
    >
      {formError && <div className="alert" role="alert">{formError}</div>}
      <form id="member-form" className="form-grid" onSubmit={handleSubmit} noValidate>
        <Field label="Card number" error={errors.memberCode} required hint="e.g. M-0004">
          {(p) => <input {...p} className="mono" value={values.memberCode} onChange={set('memberCode')} maxLength={30} />}
        </Field>
        <Field label="Card status" error={errors.status}>
          {(p) => (
            <select {...p} value={values.status} onChange={set('status')}>
              <option value="active">Active — may borrow</option>
              <option value="inactive">Inactive — no borrowing</option>
            </select>
          )}
        </Field>
        <Field label="Full name" error={errors.name} required className="span-2">
          {(p) => <input {...p} value={values.name} onChange={set('name')} maxLength={120} autoComplete="off" />}
        </Field>
        <Field label="Email" error={errors.email} hint={member?.hasAccount ? 'Also their sign-in email' : 'Needed for sign-in access'}>
          {(p) => <input {...p} type="email" value={values.email} onChange={set('email')} maxLength={255} autoComplete="off" />}
        </Field>
        <Field label="Phone" error={errors.phone} hint="Optional">
          {(p) => <input {...p} type="tel" value={values.phone} onChange={set('phone')} maxLength={30} autoComplete="off" />}
        </Field>
      </form>
    </Modal>
  );
}

function AccessDialog({ member, onClose, onSaved }) {
  const notify = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);

  async function grant(e) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters`);
      return;
    }
    setSaving(true);
    try {
      await api.put(`/members/${member.id}/account`, { password });
      notify(member.hasAccount ? `New password set for ${member.name}` : `${member.name} can now sign in`);
      onSaved();
    } catch (err) {
      setError(err.details?.password || err.message);
      setSaving(false);
    }
  }

  async function revoke() {
    try {
      await api.delete(`/members/${member.id}/account`);
      notify(`${member.name} can no longer sign in`);
      onSaved();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  if (revoking) {
    return (
      <ConfirmDialog
        title="Remove sign-in access?"
        message={`${member.name} won’t be able to sign in and see their loans. Their card and loan history stay.`}
        confirmLabel="Remove access"
        danger
        onConfirm={revoke}
        onClose={() => setRevoking(false)}
      />
    );
  }

  return (
    <Modal
      title={member.hasAccount ? 'Reset sign-in password' : 'Give sign-in access'}
      size="sm"
      onClose={onClose}
      footer={(
        <>
          {member.hasAccount && (
            <button type="button" className="link-button danger" style={{ marginRight: 'auto' }} onClick={() => setRevoking(true)} disabled={saving}>
              Remove access
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="access-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : member.hasAccount ? 'Set password' : 'Give access'}
          </button>
        </>
      )}
    >
      {!member.email ? (
        <p>Add an email address to {member.name}’s card first. It becomes their sign-in.</p>
      ) : (
        <form id="access-form" onSubmit={grant} noValidate>
          <p className="muted small" style={{ marginBottom: 16 }}>
            {member.name} will sign in as <span className="mono">{member.email}</span> and see only their own loans.
            Share the password with them in person.
          </p>
          <Field label="Password" error={error} required hint={`At least ${MIN_PASSWORD} characters`}>
            {(p) => (
              <input
                {...p}
                type="text"
                className="mono"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                autoComplete="new-password"
              />
            )}
          </Field>
        </form>
      )}
    </Modal>
  );
}

export default function MembersPage() {
  const { user } = useAuth();
  const notify = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [access, setAccess] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const q = useDebounced(search);

  const { data, error, loading, reload } = useResource(`/members${toQuery({ q, status, page, pageSize: 15 })}`);
  const members = data?.data || [];

  function closeAndReload(setter) {
    setter(null);
    reload();
  }

  async function remove() {
    try {
      await api.delete(`/members/${deleting.id}`);
      notify(`Removed ${deleting.name}`);
      closeAndReload(setDeleting);
    } catch (err) {
      notify(err.message, 'error');
      setDeleting(null);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="label">{data ? `${data.pagination.total} card${data.pagination.total === 1 ? '' : 's'}` : 'Members'}</span>
          <h1>Members</h1>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>Issue a card</button>
      </header>

      <div className="toolbar">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} label="Search members" placeholder="Name, card number or email" />
        <select aria-label="Card status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <section>
        {error ? <ErrorState error={error} onRetry={reload} />
          : loading && !data ? <TableSkeleton columns={5} />
            : members.length === 0 ? (
              q || status
                ? <EmptyState title="No one by that name" message="Check the spelling or clear the status filter." />
                : <EmptyState title="No members yet" message="Issue a card before lending books." action={<button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>Issue a card</button>} />
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Member</th>
                      <th scope="col">Contact</th>
                      <th scope="col">Card</th>
                      <th scope="col">Sign-in</th>
                      <th scope="col" className="num">Out</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <p className="cell-title">{m.name}</p>
                          <p className="cell-sub mono">{m.memberCode}</p>
                        </td>
                        <td>
                          <p>{m.email || <span className="faint">no email</span>}</p>
                          {m.phone && <p className="cell-sub">{m.phone}</p>}
                        </td>
                        <td>{m.status === 'active' ? <Status tone="ok">Active</Status> : <Status tone="off">Inactive</Status>}</td>
                        <td>{m.hasAccount ? <Status tone="key">Can sign in</Status> : <span className="faint small">—</span>}</td>
                        <td className="num">{m.activeItems}</td>
                        <td className="actions">
                          <button type="button" className="link-button" onClick={() => setEditing(m)}>Edit</button>
                          <button type="button" className="link-button" onClick={() => setAccess(m)}>
                            {m.hasAccount ? 'Access' : 'Give access'}
                          </button>
                          {user.role === 'admin' && (
                            <button
                              type="button"
                              className="link-button danger"
                              onClick={() => setDeleting(m)}
                              disabled={m.loanCount > 0}
                              title={m.loanCount > 0 ? 'Has loan history; set the card to inactive instead' : undefined}
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        {data && members.length > 0 && <Pagination pagination={data.pagination} onPage={setPage} />}
      </section>

      {editing && (
        <MemberForm member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => closeAndReload(setEditing)} />
      )}
      {access && <AccessDialog member={access} onClose={() => setAccess(null)} onSaved={() => closeAndReload(setAccess)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="Their card and any sign-in access are removed permanently. This can’t be undone."
          confirmLabel="Delete member"
          danger
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
