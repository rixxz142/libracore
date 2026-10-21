// Small input validation helpers. Each validator collects field errors and
// throws a 422 HttpError when anything is invalid.
const { HttpError } = require('./errors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class Validator {
  constructor(body) {
    this.body = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    this.errors = {};
    this.values = {};
  }

  has(field) {
    return this.body[field] !== undefined;
  }

  fail(field, message) {
    if (!this.errors[field]) this.errors[field] = message;
  }

  string(field, { required = false, max = 255, nullable = false, pattern, patternMessage } = {}) {
    const raw = this.body[field];
    if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      if (required) this.fail(field, 'This field is required');
      else if (raw !== undefined) this.values[field] = nullable ? null : '';
      return this;
    }
    if (typeof raw !== 'string') {
      this.fail(field, 'Must be text');
      return this;
    }
    const value = raw.trim();
    if (value.length > max) this.fail(field, `Must be at most ${max} characters`);
    else if (pattern && !pattern.test(value)) this.fail(field, patternMessage || 'Invalid format');
    else this.values[field] = value;
    return this;
  }

  email(field, opts = {}) {
    return this.string(field, { ...opts, pattern: EMAIL_RE, patternMessage: 'Must be a valid email address' });
  }

  integer(field, { required = false, min, max, nullable = false } = {}) {
    const raw = this.body[field];
    if (raw === undefined || raw === null || raw === '') {
      if (required) this.fail(field, 'This field is required');
      else if (raw !== undefined && nullable) this.values[field] = null;
      return this;
    }
    const value = typeof raw === 'string' && /^-?\d+$/.test(raw.trim()) ? Number(raw) : raw;
    if (!Number.isInteger(value)) this.fail(field, 'Must be a whole number');
    else if (min !== undefined && value < min) this.fail(field, `Must be at least ${min}`);
    else if (max !== undefined && value > max) this.fail(field, `Must be at most ${max}`);
    else this.values[field] = value;
    return this;
  }

  oneOf(field, allowed, { required = false } = {}) {
    const raw = this.body[field];
    if (raw === undefined || raw === null || raw === '') {
      if (required) this.fail(field, 'This field is required');
      return this;
    }
    if (!allowed.includes(raw)) this.fail(field, `Must be one of: ${allowed.join(', ')}`);
    else this.values[field] = raw;
    return this;
  }

  date(field, { required = false } = {}) {
    const raw = this.body[field];
    if (raw === undefined || raw === null || raw === '') {
      if (required) this.fail(field, 'This field is required');
      return this;
    }
    if (typeof raw !== 'string' || !DATE_RE.test(raw) || !isRealDate(raw)) {
      this.fail(field, 'Must be a date in YYYY-MM-DD format');
    } else {
      this.values[field] = raw;
    }
    return this;
  }

  done() {
    if (Object.keys(this.errors).length > 0) {
      throw new HttpError(422, 'Validation failed', this.errors);
    }
    return this.values;
  }
}

function isRealDate(value) {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function validate(body) {
  return new Validator(body);
}

// Parses a positive integer route parameter, or throws 400.
function parseId(raw, name = 'id') {
  if (typeof raw !== 'string' || !/^\d{1,9}$/.test(raw) || Number(raw) < 1) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  return Number(raw);
}

// Reads page/pageSize query parameters with safe bounds.
function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function queryString(value, max = 100) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

module.exports = { validate, parseId, parsePagination, queryString, EMAIL_RE };
