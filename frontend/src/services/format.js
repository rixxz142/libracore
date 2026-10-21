const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const longFormatter = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const idrFormatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

function toDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

// Accepts 'YYYY-MM-DD' or ISO timestamps.
export function formatDate(value, short = false) {
  if (!value) return '—';
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return (short ? shortDateFormatter : dateFormatter).format(date);
}

export function longToday() {
  return longFormatter.format(new Date());
}

export function formatIdr(value) {
  return idrFormatter.format(value || 0);
}

function localIso(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function todayIso() {
  return localIso(new Date());
}

export function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localIso(d);
}

// Whole days from today until a 'YYYY-MM-DD' date (negative when past).
export function daysUntil(value) {
  return Math.round((toDate(value) - toDate(todayIso())) / 86400000);
}
