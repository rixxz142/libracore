// Unit tests that do not need a database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateFine, addDays } = require('../src/services/loans');
const { validate, parseId, parsePagination } = require('../src/validation');
const { loadConfig } = require('../src/config');

test('late fee is zero for on-time and early returns', () => {
  assert.deepEqual(calculateFine('2026-01-10', '2026-01-10', 2000), { overdueDays: 0, fineIdr: 0 });
  assert.deepEqual(calculateFine('2026-01-10', '2026-01-05', 2000), { overdueDays: 0, fineIdr: 0 });
});

test('late fee is charged per overdue calendar day', () => {
  assert.deepEqual(calculateFine('2026-01-10', '2026-01-13', 2000), { overdueDays: 3, fineIdr: 6000 });
  assert.deepEqual(calculateFine('2026-02-27', '2026-03-02', 2000), { overdueDays: 3, fineIdr: 6000 });
});

test('addDays handles month and year boundaries', () => {
  assert.equal(addDays('2026-12-25', 14), '2027-01-08');
  assert.equal(addDays('2028-02-20', 10), '2028-03-01');
});

test('validator reports field errors with 422', () => {
  assert.throws(
    () => validate({ title: '', totalCopies: -1, email: 'nope' })
      .string('title', { required: true })
      .integer('totalCopies', { min: 0 })
      .email('email')
      .done(),
    (err) => err.status === 422
      && err.details.title === 'This field is required'
      && err.details.totalCopies === 'Must be at least 0'
      && err.details.email === 'Must be a valid email address',
  );
});

test('validator trims strings and rejects impossible dates', () => {
  assert.deepEqual(validate({ name: '  Budi  ' }).string('name').done(), { name: 'Budi' });
  assert.throws(() => validate({ d: '2026-02-30' }).date('d').done(), (err) => err.status === 422);
});

test('parseId rejects malformed identifiers', () => {
  assert.equal(parseId('42'), 42);
  for (const bad of ['0', '-1', 'abc', '1.5', '9999999999']) {
    assert.throws(() => parseId(bad), (err) => err.status === 400);
  }
});

test('pagination is bounded', () => {
  assert.deepEqual(parsePagination({ page: '3', pageSize: '500' }), { page: 3, pageSize: 100, offset: 200 });
  assert.deepEqual(parsePagination({ page: 'x' }), { page: 1, pageSize: 20, offset: 0 });
});

test('config requires a strong JWT secret', () => {
  assert.throws(() => loadConfig({}), /JWT_SECRET/);
  assert.throws(() => loadConfig({ JWT_SECRET: 'short' }), /JWT_SECRET/);
  assert.equal(loadConfig({ JWT_SECRET: 'x'.repeat(32) }).loanPeriodDays, 14);
});
