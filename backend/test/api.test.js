// Integration tests against a real PostgreSQL instance.
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestEnv, client, ADMIN, LIBRARIAN } = require('./helpers');
const { bootstrapAdmin, bootstrapBorrower } = require('../src/bootstrap');

let env;
let admin;
let librarian;

before(async () => {
  env = await startTestEnv();
  admin = client(env.baseUrl);
  librarian = client(env.baseUrl);
  await admin.login(ADMIN);
  await librarian.login(LIBRARIAN);
});

after(async () => {
  if (env) await env.stop();
});

async function createBook(overrides = {}) {
  const res = await librarian.post('/api/books', {
    title: 'Test Book', author: 'Tester', category: 'Testing', totalCopies: 1, ...overrides,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function createMember(overrides = {}) {
  const code = `T-${Math.random().toString(36).slice(2, 8)}`;
  const res = await librarian.post('/api/members', { memberCode: code, name: 'Test Member', ...overrides });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function bookById(id) {
  return (await admin.get(`/api/books/${id}`)).body.data;
}

describe('health', () => {
  test('reports database connectivity', async () => {
    const res = await client(env.baseUrl).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.database, 'up');
  });
});

describe('authentication', () => {
  test('rejects wrong password and unknown email with the same message', async () => {
    const anon = client(env.baseUrl);
    const a = await anon.post('/api/auth/login', { email: ADMIN.email, password: 'wrong-password' });
    const b = await anon.post('/api/auth/login', { email: 'nobody@example.local', password: 'wrong-password' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error, b.body.error);
  });

  test('validates login input', async () => {
    const res = await client(env.baseUrl).post('/api/auth/login', { email: 'not-an-email' });
    assert.equal(res.status, 422);
    assert.ok(res.body.details.email);
    assert.ok(res.body.details.password);
  });

  test('rejects malformed JSON with 400', async () => {
    const res = await client(env.baseUrl).post('/api/auth/login', '{bad json');
    assert.equal(res.status, 400);
  });

  test('sets an HttpOnly cookie and returns the profile', async () => {
    const c = client(env.baseUrl);
    const res = await c.login(ADMIN);
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /libracore_token=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.equal(res.body.user.password_hash, undefined);
    const me = await c.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.role, 'admin');
  });

  test('protected routes reject missing or forged cookies', async () => {
    assert.equal((await client(env.baseUrl).get('/api/books')).status, 401);
    const res = await fetch(`${env.baseUrl}/api/auth/me`, { headers: { Cookie: 'libracore_token=forged.token.value' } });
    assert.equal(res.status, 401);
  });

  test('logout clears the session', async () => {
    const c = client(env.baseUrl);
    await c.login(LIBRARIAN);
    assert.equal((await c.post('/api/auth/logout')).status, 204);
    assert.equal((await c.get('/api/auth/me')).status, 401);
  });

  test('deactivated users lose access immediately', async () => {
    const c = client(env.baseUrl);
    await c.login(LIBRARIAN);
    await env.pool.query(`UPDATE users SET is_active = FALSE WHERE email = $1`, [LIBRARIAN.email]);
    try {
      assert.equal((await c.get('/api/auth/me')).status, 401);
    } finally {
      await env.pool.query(`UPDATE users SET is_active = TRUE WHERE email = $1`, [LIBRARIAN.email]);
    }
  });

  test('bootstrap does not reset an existing administrator password', async () => {
    const result = await bootstrapAdmin(env.pool, {
      name: 'Other', email: 'other@example.local', password: 'a-different-password-456',
    });
    assert.equal(result.created, false);
    await client(env.baseUrl).login(ADMIN);
  });
});

describe('roles', () => {
  test('librarian cannot archive books or view reports', async () => {
    const book = await createBook();
    assert.equal((await librarian.delete(`/api/books/${book.id}`)).status, 403);
    assert.equal((await librarian.get('/api/reports/overview')).status, 403);
  });

  test('admin can archive books and view reports', async () => {
    const book = await createBook();
    const res = await admin.delete(`/api/books/${book.id}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.archivedAt);
    const list = await admin.get('/api/books?q=Test%20Book');
    assert.ok(!list.body.data.some((b) => b.id === book.id), 'archived book hidden by default');
    const report = await admin.get('/api/reports/overview');
    assert.equal(report.status, 200);
    assert.equal(report.body.monthlyLoans.length, 6);
  });
});

describe('books', () => {
  test('lists seeded catalog with pagination', async () => {
    const res = await admin.get('/api/books?pageSize=2');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
    assert.ok(res.body.pagination.total >= 6);
    assert.ok(res.body.categories.includes('Fiction'));
  });

  test('searches by title, author or ISBN', async () => {
    const res = await admin.get('/api/books?q=hirata');
    assert.equal(res.body.data[0].title, 'Laskar Pelangi');
  });

  test('new book has available copies equal to total copies', async () => {
    const book = await createBook({ totalCopies: 3 });
    assert.equal(book.availableCopies, 3);
  });

  test('validates input', async () => {
    const res = await librarian.post('/api/books', { title: '', totalCopies: -2, publicationYear: 'abc' });
    assert.equal(res.status, 422);
    assert.deepEqual(Object.keys(res.body.details).sort(), ['author', 'category', 'publicationYear', 'title', 'totalCopies']);
  });

  test('partial update rejects blanking a required field', async () => {
    const book = await createBook();
    const res = await librarian.patch(`/api/books/${book.id}`, { title: '  ' });
    assert.equal(res.status, 422);
  });

  test('rejects duplicate ISBN with 409', async () => {
    await createBook({ isbn: '978-0000000001' });
    const res = await librarian.post('/api/books', {
      isbn: '978-0000000001', title: 'Dup', author: 'X', category: 'Y', totalCopies: 1,
    });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /ISBN/);
  });

  test('returns 400 for malformed id and 404 for missing book', async () => {
    assert.equal((await admin.get('/api/books/abc')).status, 400);
    assert.equal((await admin.get('/api/books/999999')).status, 404);
  });

  test('changing total copies keeps on-loan copies consistent', async () => {
    const book = await createBook({ totalCopies: 3 });
    const member = await createMember();
    await librarian.post('/api/loans', { memberId: member.id, bookIds: [book.id] });

    const tooFew = await librarian.patch(`/api/books/${book.id}`, { totalCopies: 0 });
    assert.equal(tooFew.status, 422);

    const res = await librarian.patch(`/api/books/${book.id}`, { totalCopies: 5 });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.totalCopies, 5);
    assert.equal(res.body.data.availableCopies, 4);
  });
});

describe('members', () => {
  test('registers, searches and updates members', async () => {
    const m = await createMember({ name: 'Dewi Lestari', email: 'dewi@example.com' });
    assert.equal(m.status, 'active');
    const found = await admin.get('/api/members?q=dewi');
    assert.ok(found.body.data.some((x) => x.id === m.id));
    const upd = await librarian.patch(`/api/members/${m.id}`, { status: 'inactive', phone: '+62 812 0000 0000' });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.data.status, 'inactive');
  });

  test('rejects duplicate member code and invalid fields', async () => {
    const m = await createMember();
    const dup = await librarian.post('/api/members', { memberCode: m.memberCode, name: 'X' });
    assert.equal(dup.status, 409);
    const bad = await librarian.post('/api/members', { memberCode: 'a', name: '', email: 'x', status: 'gone' });
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys(bad.body.details).sort(), ['email', 'memberCode', 'name', 'status']);
  });
});

describe('loans', () => {
  test('checkout decreases inventory and return restores it once', async () => {
    const book = await createBook({ totalCopies: 2 });
    const member = await createMember();

    const loan = await librarian.post('/api/loans', { memberId: member.id, bookIds: [book.id] });
    assert.equal(loan.status, 201, JSON.stringify(loan.body));
    assert.equal(loan.body.data.status, 'active');
    assert.equal(loan.body.data.items.length, 1);
    assert.equal((await bookById(book.id)).availableCopies, 1);

    const itemId = loan.body.data.items[0].id;
    const ret = await librarian.post(`/api/loans/${loan.body.data.id}/items/${itemId}/return`);
    assert.equal(ret.status, 200);
    assert.equal(ret.body.data.status, 'returned');
    assert.equal(ret.body.data.items[0].fineIdr, 0);
    assert.equal((await bookById(book.id)).availableCopies, 2);

    const again = await librarian.post(`/api/loans/${loan.body.data.id}/items/${itemId}/return`);
    assert.equal(again.status, 409);
    assert.equal((await bookById(book.id)).availableCopies, 2);
  });

  test('loan stays active until every item is returned', async () => {
    const b1 = await createBook();
    const b2 = await createBook();
    const member = await createMember();
    const loan = (await librarian.post('/api/loans', { memberId: member.id, bookIds: [b1.id, b2.id] })).body.data;
    const first = await librarian.post(`/api/loans/${loan.id}/items/${loan.items[0].id}/return`);
    assert.equal(first.body.data.status, 'active');
    const second = await librarian.post(`/api/loans/${loan.id}/items/${loan.items[1].id}/return`);
    assert.equal(second.body.data.status, 'returned');
  });

  test('inactive members cannot borrow', async () => {
    const book = await createBook();
    const member = await createMember({ status: 'inactive' });
    const res = await librarian.post('/api/loans', { memberId: member.id, bookIds: [book.id] });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /Inactive/);
  });

  test('fails when no copies are available and rolls back the whole loan', async () => {
    const available = await createBook({ totalCopies: 1 });
    const empty = await createBook({ totalCopies: 0 });
    const member = await createMember();
    const res = await librarian.post('/api/loans', { memberId: member.id, bookIds: [available.id, empty.id] });
    assert.equal(res.status, 409);
    assert.equal((await bookById(available.id)).availableCopies, 1, 'no partial checkout');
    const loans = await admin.get(`/api/loans?memberId=${member.id}`);
    assert.equal(loans.body.pagination.total, 0);
  });

  test('archived books cannot be borrowed', async () => {
    const book = await createBook();
    await admin.delete(`/api/books/${book.id}`);
    const member = await createMember();
    const res = await librarian.post('/api/loans', { memberId: member.id, bookIds: [book.id] });
    assert.equal(res.status, 409);
  });

  test('concurrent checkouts cannot take the last copy twice', async () => {
    const book = await createBook({ totalCopies: 1 });
    const members = await Promise.all([1, 2, 3, 4, 5].map(() => createMember()));
    const results = await Promise.all(
      members.map((m) => librarian.post('/api/loans', { memberId: m.id, bookIds: [book.id] })),
    );
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 4);
    assert.equal((await bookById(book.id)).availableCopies, 0);
  });

  test('validates loan requests', async () => {
    const member = await createMember();
    const book = await createBook();
    const cases = [
      [{ memberId: member.id, bookIds: [] }, 'bookIds'],
      [{ memberId: member.id, bookIds: [book.id, book.id] }, 'bookIds'],
      [{ memberId: member.id, bookIds: [1, 2, 3, 4] }, 'bookIds'],
      [{ memberId: member.id, bookIds: ['1'] }, 'bookIds'],
      [{ bookIds: [book.id] }, 'memberId'],
      [{ memberId: member.id, bookIds: [book.id], dueDate: '2000-01-01' }, 'dueDate'],
      [{ memberId: member.id, bookIds: [book.id], dueDate: 'tomorrow' }, 'dueDate'],
    ];
    for (const [body, field] of cases) {
      const res = await librarian.post('/api/loans', body);
      assert.equal(res.status, 422, JSON.stringify(body));
      assert.ok(res.body.details[field], `${field} error for ${JSON.stringify(body)}`);
    }
    assert.equal((await librarian.post('/api/loans', { memberId: 999999, bookIds: [book.id] })).status, 404);
  });

  test('overdue returns are charged per day and appear as overdue', async () => {
    const book = await createBook();
    const member = await createMember();
    const loan = (await librarian.post('/api/loans', { memberId: member.id, bookIds: [book.id] })).body.data;
    // Simulate a loan taken 20 days ago that was due 6 days ago.
    await env.pool.query(
      `UPDATE loans SET checkout_date = CURRENT_DATE - 20, due_date = CURRENT_DATE - 6 WHERE id = $1`,
      [loan.id],
    );

    const overdue = await admin.get('/api/loans?status=overdue');
    assert.ok(overdue.body.data.some((l) => l.id === loan.id && l.isOverdue));
    const dash = await admin.get('/api/dashboard');
    assert.ok(dash.body.stats.overdueItems >= 1);

    const ret = await librarian.post(`/api/loans/${loan.id}/items/${loan.items[0].id}/return`);
    assert.equal(ret.body.data.items[0].fineIdr, 6 * 2000);
  });

  test('returns 404 when the item does not belong to the loan', async () => {
    const res = await librarian.post('/api/loans/1/items/999999/return');
    assert.equal(res.status, 404);
  });
});

describe('dashboard', () => {
  test('returns summary metrics', async () => {
    const res = await librarian.get('/api/dashboard');
    assert.equal(res.status, 200);
    for (const key of ['totalTitles', 'totalCopies', 'availableCopies', 'activeMembers', 'activeLoans', 'overdueItems']) {
      assert.equal(typeof res.body.stats[key], 'number', key);
    }
  });

  test('unknown API routes return JSON 404', async () => {
    const res = await admin.get('/api/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Resource not found');
  });
});

describe('borrower accounts and data isolation', () => {
  async function borrowerWithLoan(name) {
    const email = `${name.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
    const member = await createMember({ name, email });
    const password = `${name}-password-123`;
    const res = await librarian.put(`/api/members/${member.id}/account`, { password });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.hasAccount, true);
    const book = await createBook({ title: `${name}'s Book` });
    const loan = (await librarian.post('/api/loans', { memberId: member.id, bookIds: [book.id] })).body.data;
    const c = client(env.baseUrl);
    const login = await c.login({ email, password });
    assert.equal(login.body.user.role, 'borrower');
    assert.equal(login.body.user.memberId, member.id);
    return { member, loan, client: c, email, password };
  }

  test('a borrower sees only their own loans', async () => {
    const a = await borrowerWithLoan('Ayu');
    const b = await borrowerWithLoan('Bima');

    const aLoans = await a.client.get('/api/me/loans');
    assert.equal(aLoans.status, 200);
    assert.deepEqual(aLoans.body.data.map((l) => l.id), [a.loan.id]);
    const bLoans = await b.client.get('/api/me/loans');
    assert.deepEqual(bLoans.body.data.map((l) => l.id), [b.loan.id]);

    // Query parameters cannot widen the scope.
    const sneaky = await a.client.get(`/api/me/loans?memberId=${b.member.id}`);
    assert.deepEqual(sneaky.body.data.map((l) => l.id), [a.loan.id]);

    const summary = await a.client.get('/api/me/summary');
    assert.equal(summary.status, 200);
    assert.equal(summary.body.booksOnLoan, 1);
    assert.equal(summary.body.member.name, 'Ayu');
  });

  test('borrowers are blocked from staff endpoints but can browse the catalog', async () => {
    const a = await borrowerWithLoan('Citra');
    for (const url of ['/api/loans', '/api/members', `/api/members/${a.member.id}`, '/api/dashboard', '/api/reports/overview']) {
      assert.equal((await a.client.get(url)).status, 403, url);
    }
    assert.equal((await a.client.post('/api/loans', { memberId: a.member.id, bookIds: [1] })).status, 403);
    assert.equal((await a.client.post(`/api/loans/${a.loan.id}/items/${a.loan.items[0].id}/return`)).status, 403);
    assert.equal((await a.client.post('/api/books', { title: 'X', author: 'Y', category: 'Z', totalCopies: 1 })).status, 403);
    assert.equal((await a.client.get('/api/books')).status, 200);
  });

  test('staff cannot use borrower endpoints', async () => {
    assert.equal((await admin.get('/api/me/loans')).status, 403);
  });

  test('login access requires an email and a long password, and can be revoked', async () => {
    const noEmail = await createMember();
    assert.equal((await librarian.put(`/api/members/${noEmail.id}/account`, { password: 'long-enough-pass' })).status, 422);

    const m = await createMember({ email: `dani-${Date.now()}@example.com` });
    const short = await librarian.put(`/api/members/${m.id}/account`, { password: 'short' });
    assert.equal(short.status, 422);
    assert.ok(short.body.details.password);

    assert.equal((await librarian.put(`/api/members/${m.id}/account`, { password: 'first-password-1' })).status, 201);
    assert.equal((await librarian.put(`/api/members/${m.id}/account`, { password: 'reset-password-2' })).status, 200);
    await client(env.baseUrl).login({ email: m.email, password: 'reset-password-2' });

    const blank = await librarian.patch(`/api/members/${m.id}`, { email: '' });
    assert.equal(blank.status, 422, 'cannot remove email while login exists');

    assert.equal((await librarian.delete(`/api/members/${m.id}/account`)).status, 204);
    const res = await client(env.baseUrl).post('/api/auth/login', { email: m.email, password: 'reset-password-2' });
    assert.equal(res.status, 401);
  });

  test('changing the member email changes the login email', async () => {
    const a = await borrowerWithLoan('Eka');
    const newEmail = `eka-new-${Date.now()}@example.com`;
    assert.equal((await librarian.patch(`/api/members/${a.member.id}`, { email: newEmail })).status, 200);
    await client(env.baseUrl).login({ email: newEmail, password: a.password });
  });

  test('users can change their own password', async () => {
    const a = await borrowerWithLoan('Fajar');
    const wrong = await a.client.post('/api/auth/password', { currentPassword: 'nope', newPassword: 'brand-new-password' });
    assert.equal(wrong.status, 422);
    assert.ok(wrong.body.details.currentPassword);
    const ok = await a.client.post('/api/auth/password', { currentPassword: a.password, newPassword: 'brand-new-password' });
    assert.equal(ok.status, 204);
    await client(env.baseUrl).login({ email: a.email, password: 'brand-new-password' });
  });
});

describe('member deletion', () => {
  test('admin can delete a member without loan history, including their login', async () => {
    const m = await createMember({ email: `gita-${Date.now()}@example.com` });
    await librarian.put(`/api/members/${m.id}/account`, { password: 'gita-password-1' });
    assert.equal((await librarian.delete(`/api/members/${m.id}`)).status, 403, 'librarian cannot delete');
    assert.equal((await admin.delete(`/api/members/${m.id}`)).status, 204);
    assert.equal((await admin.get(`/api/members/${m.id}`)).status, 404);
    const { rows } = await env.pool.query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [m.email]);
    assert.equal(rows.length, 0);
  });

  test('members with loan history cannot be deleted', async () => {
    const m = await createMember();
    const book = await createBook();
    await librarian.post('/api/loans', { memberId: m.id, bookIds: [book.id] });
    const res = await admin.delete(`/api/members/${m.id}`);
    assert.equal(res.status, 409);
    assert.match(res.body.error, /inactive/);
  });
});

describe('borrower bootstrap', () => {
  test('creates the sign-in once for a matching member and never resets it', async () => {
    const email = `boot-${Date.now()}@example.com`;
    await createMember({ email });
    assert.equal((await bootstrapBorrower(env.pool, { email, password: 'first-boot-pass' })).created, true);
    assert.equal((await bootstrapBorrower(env.pool, { email, password: 'second-boot-pass' })).created, false);
    await client(env.baseUrl).login({ email, password: 'first-boot-pass' });
  });

  test('skips when no member has that email', async () => {
    const res = await bootstrapBorrower(env.pool, { email: 'nobody-here@example.com', password: 'long-enough-pass' });
    assert.equal(res.created, false);
  });
});
