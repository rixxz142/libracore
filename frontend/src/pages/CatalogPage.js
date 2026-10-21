import { useState } from 'react';
import { api, toQuery } from '../services/api';
import { useAuth } from '../services/auth';
import { useDebounced, useResource } from '../services/useResource';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import Field from '../components/Field';
import ConfirmDialog from '../components/ConfirmDialog';
import { EmptyState, ErrorState, Pagination, SearchInput, Status, TableSkeleton } from '../components/DataState';

const EMPTY_BOOK = { isbn: '', title: '', author: '', category: '', publisher: '', publicationYear: '', totalCopies: '1' };

function BookForm({ book, categories, onClose, onSaved }) {
  const notify = useToast();
  const [values, setValues] = useState(book
    ? {
      isbn: book.isbn || '',
      title: book.title,
      author: book.author,
      category: book.category,
      publisher: book.publisher || '',
      publicationYear: book.publicationYear ?? '',
      totalCopies: String(book.totalCopies),
    }
    : EMPTY_BOOK);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const onLoan = book ? book.totalCopies - book.availableCopies : 0;

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  function clientValidate() {
    const e = {};
    if (!values.title.trim()) e.title = 'Enter a title';
    if (!values.author.trim()) e.author = 'Enter an author';
    if (!values.category.trim()) e.category = 'Enter a category';
    const copies = Number(values.totalCopies);
    if (values.totalCopies === '' || !Number.isInteger(copies) || copies < 0) e.totalCopies = 'Enter a whole number of 0 or more';
    else if (copies < onLoan) e.totalCopies = `${onLoan} cop${onLoan === 1 ? 'y is' : 'ies are'} on loan right now`;
    if (values.publicationYear !== '' && !/^\d{4}$/.test(String(values.publicationYear))) e.publicationYear = 'Enter a four-digit year';
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const clientErrors = clientValidate();
    setErrors(clientErrors);
    setFormError('');
    if (Object.keys(clientErrors).length) return;

    const payload = {
      isbn: values.isbn.trim() || null,
      title: values.title,
      author: values.author,
      category: values.category,
      publisher: values.publisher.trim() || null,
      publicationYear: values.publicationYear === '' ? null : Number(values.publicationYear),
      totalCopies: Number(values.totalCopies),
    };
    setSaving(true);
    try {
      const res = book ? await api.patch(`/books/${book.id}`, payload) : await api.post('/books', payload);
      notify(book ? `Saved “${res.data.title}”` : `“${res.data.title}” is on the shelf`);
      onSaved();
    } catch (err) {
      setErrors(err.details || {});
      setFormError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={book ? 'Edit record' : 'New catalog record'}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="book-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : book ? 'Save record' : 'Add to catalog'}
          </button>
        </>
      )}
    >
      {formError && <div className="alert" role="alert">{formError}</div>}
      <form id="book-form" className="form-grid" onSubmit={handleSubmit} noValidate>
        <Field label="Title" error={errors.title} required className="span-2">
          {(p) => <input {...p} value={values.title} onChange={set('title')} maxLength={255} />}
        </Field>
        <Field label="Author" error={errors.author} required>
          {(p) => <input {...p} value={values.author} onChange={set('author')} maxLength={255} />}
        </Field>
        <Field label="Category" error={errors.category} required>
          {(p) => (
            <>
              <input {...p} value={values.category} onChange={set('category')} list="category-options" maxLength={100} />
              <datalist id="category-options">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </>
          )}
        </Field>
        <Field label="ISBN" error={errors.isbn} hint="Optional">
          {(p) => <input {...p} className="mono" value={values.isbn} onChange={set('isbn')} maxLength={20} inputMode="numeric" />}
        </Field>
        <Field label="Publisher" error={errors.publisher} hint="Optional">
          {(p) => <input {...p} value={values.publisher} onChange={set('publisher')} maxLength={255} />}
        </Field>
        <Field label="Year" error={errors.publicationYear} hint="Optional">
          {(p) => <input {...p} value={values.publicationYear} onChange={set('publicationYear')} inputMode="numeric" maxLength={4} />}
        </Field>
        <Field
          label="Copies owned"
          error={errors.totalCopies}
          required
          hint={book ? `${onLoan} on loan; the shelf count adjusts itself` : 'All copies start on the shelf'}
        >
          {(p) => <input {...p} type="number" min={onLoan} value={values.totalCopies} onChange={set('totalCopies')} />}
        </Field>
      </form>
    </Modal>
  );
}

function ShelfState({ book }) {
  if (book.archivedAt) return <Status tone="off">Archived</Status>;
  if (book.availableCopies === 0) return <Status tone="late">All {book.totalCopies} out</Status>;
  return <Status tone="ok">{book.availableCopies} of {book.totalCopies} on shelf</Status>;
}

export default function CatalogPage() {
  const { user } = useAuth();
  const notify = useToast();
  const isStaff = user.role !== 'borrower';
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // null | 'new' | book
  const [archiving, setArchiving] = useState(null);
  const q = useDebounced(search);

  const { data, error, loading, reload } = useResource(
    `/books${toQuery({ q, category, includeArchived: isStaff && includeArchived, page, pageSize: 15 })}`,
  );
  const books = data?.data || [];
  const filtersActive = q || category || includeArchived;

  function updateFilter(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  async function archive() {
    try {
      await api.delete(`/books/${archiving.id}`);
      notify(`Archived “${archiving.title}”`);
      setArchiving(null);
      reload();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="label">{data ? `${data.pagination.total} record${data.pagination.total === 1 ? '' : 's'}` : 'Catalog'}</span>
          <h1>The catalog</h1>
          {!isStaff && <p className="lede">Browse what the library holds. Ask at the desk to borrow a book that’s on the shelf.</p>}
        </div>
        {isStaff && <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>New record</button>}
      </header>

      <div className="toolbar">
        <SearchInput value={search} onChange={updateFilter(setSearch)} label="Search the catalog" placeholder="Title, author or ISBN" />
        <select aria-label="Category" value={category} onChange={(e) => updateFilter(setCategory)(e.target.value)}>
          <option value="">Every category</option>
          {(data?.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {isStaff && (
          <label className="checkbox">
            <input type="checkbox" checked={includeArchived} onChange={(e) => updateFilter(setIncludeArchived)(e.target.checked)} />
            Include archived
          </label>
        )}
      </div>

      <section>
        {error ? <ErrorState error={error} onRetry={reload} />
          : loading && !data ? <TableSkeleton columns={4} />
            : books.length === 0 ? (
              filtersActive
                ? <EmptyState title="Nothing on these shelves" message="Try another title, author, ISBN or category." />
                : <EmptyState
                    title="The catalog is empty"
                    message={isStaff ? 'Add the first record to start lending.' : 'Check back soon.'}
                    action={isStaff && <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>New record</button>}
                  />
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Title</th>
                      <th scope="col">Category</th>
                      <th scope="col">ISBN</th>
                      <th scope="col">Shelf</th>
                      {isStaff && <th scope="col"><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {books.map((book) => (
                      <tr key={book.id} className={book.archivedAt ? 'row-muted' : ''}>
                        <td>
                          <p className="cell-title">{book.title}</p>
                          <p className="cell-sub">
                            {book.author}
                            {book.publisher ? ` · ${book.publisher}` : ''}
                            {book.publicationYear ? `, ${book.publicationYear}` : ''}
                          </p>
                        </td>
                        <td>{book.category}</td>
                        <td className="mono">{book.isbn || '—'}</td>
                        <td><ShelfState book={book} /></td>
                        {isStaff && (
                          <td className="actions">
                            {!book.archivedAt && (
                              <>
                                <button type="button" className="link-button" onClick={() => setEditing(book)}>Edit</button>
                                {user.role === 'admin' && (
                                  <button type="button" className="link-button danger" onClick={() => setArchiving(book)}>Archive</button>
                                )}
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        {data && books.length > 0 && <Pagination pagination={data.pagination} onPage={setPage} />}
      </section>

      {editing && (
        <BookForm
          book={editing === 'new' ? null : editing}
          categories={data?.categories || []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {archiving && (
        <ConfirmDialog
          title="Archive this record?"
          message={`“${archiving.title}” leaves the catalog and can’t be borrowed any more. Past loans keep their history.`}
          confirmLabel="Archive"
          danger
          onConfirm={archive}
          onClose={() => setArchiving(null)}
        />
      )}
    </div>
  );
}
