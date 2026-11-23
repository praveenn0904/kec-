// The college's own time zone decides what "today" means for attendance and deadlines.
// Default is India Standard Time (UTC+5:30); override with COLLEGE_TZ_OFFSET (minutes).
const TZ_OFFSET_MIN = Number.isFinite(Number(process.env.COLLEGE_TZ_OFFSET)) && process.env.COLLEGE_TZ_OFFSET
  ? Number(process.env.COLLEGE_TZ_OFFSET)
  : 330;

/** Today's date (YYYY-MM-DD) in the college's time zone. */
export const collegeToday = (now = Date.now()) => new Date(now + TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10);

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday to Friday. */
export function isWeekday(iso) {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

/** `days` consecutive calendar dates starting at `from`. */
export const dateRange = (from, days) => Array.from({ length: days }, (_, i) => addDays(from, i));

export const str = (v) => (typeof v === 'string' ? v.trim() : '');
