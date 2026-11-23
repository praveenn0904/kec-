/** Today's date (YYYY-MM-DD) in the user's own time zone. */
export const localDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/** For YYYY-MM-DD strings (parsed as local midnight so the day never shifts). */
export const fmtDay = (s) =>
  new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const short = (s) => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
/** "17 Nov to 19 Nov 2026" or "17 Nov 2026" */
export const fmtRange = (from, to) =>
  from === to ? fmtDay(from).replace(/^\w+, /, '') : `${short(from)} to ${short(to)} ${to.slice(0, 4)}`;

export const fmtMonth = (s) =>
  new Date(`${s}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export const initials = (name = '') =>
  name
    .replace(/^(Dr|Prof)\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

/** good >= 85, warn 75-85, bad < 75 */
export const pctTone = (p) => (p === null || p === undefined ? 'none' : p >= 85 ? 'good' : p >= 75 ? 'warn' : 'bad');
export const fmtPct = (p) => (p === null || p === undefined ? '–' : `${p}%`);

export const STATUS_LABELS = { present: 'Present', absent: 'Absent', od: 'On duty' };

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function rowsToCsv(rows, columns) {
  const cell = (v) => {
    const t = v === null || v === undefined ? '' : String(v);
    return `"${(/^[=+\-@]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
  };
  return [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(','))].join('\n');
}
