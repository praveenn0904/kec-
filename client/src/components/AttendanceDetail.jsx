import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDay, fmtMonth, fmtPct, pctTone, STATUS_LABELS } from '../utils.js';
import { Spinner } from './ui.jsx';

export function AttendanceRing({ percentage, size = 120, label = 'attendance' }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const pct = percentage ?? 0;
  return (
    <div className={`ring ring-${pctTone(percentage)}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${fmtPct(percentage)} ${label}`}>
        <circle cx="50" cy="50" r={radius} className="ring-track" />
        <circle
          cx="50" cy="50" r={radius} className="ring-value"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="ring-text">
        <strong>{fmtPct(percentage)}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function PercentBar({ value }) {
  return (
    <div className="pbar" title={fmtPct(value)}>
      <div className={`pbar-fill pbar-${pctTone(value)}`} style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}

/** Records grouped by date, each date showing its periods 1 to N. */
export function groupByDate(records, periods = 8) {
  const days = new Map();
  for (const r of records) {
    if (!days.has(r.date)) days.set(r.date, new Map());
    days.get(r.date).set(r.period, r);
  }
  return [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, byPeriod]) => ({
      date,
      periods: Array.from({ length: periods }, (_, i) => byPeriod.get(i + 1) || null),
    }));
}

/** A student's full attendance: summary, month-by-month, and the recent days with every period. */
export default function AttendanceDetail({ studentId, compact = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    api
      .studentAttendance(studentId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <Spinner label="Loading attendance…" />;

  const { summary, monthly, records, periodsPerDay } = data;
  if (!summary.total) return <p className="muted">No attendance has been recorded yet.</p>;
  const days = groupByDate(records, periodsPerDay);

  return (
    <div className="att-detail">
      <div className="att-summary">
        <AttendanceRing percentage={summary.percentage} />
        <dl className="att-counts">
          <div><dt>Periods recorded</dt><dd>{summary.total}</dd></div>
          <div><dt>Present</dt><dd className="t-good">{summary.present}</dd></div>
          <div><dt>On duty</dt><dd>{summary.od}</dd></div>
          <div><dt>Absent</dt><dd className="t-bad">{summary.absent}</dd></div>
        </dl>
      </div>

      {summary.percentage < 75 && (
        <p className="banner banner-warn">Attendance is below the 75% requirement.</p>
      )}

      {!compact && (
        <>
          <h3 className="section-title">By month</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Month</th><th>Periods</th><th>Present</th><th>Absent</th><th>On duty</th><th>%</th></tr>
              </thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.month}>
                    <td>{fmtMonth(m.month)}</td>
                    <td>{m.total}</td>
                    <td>{m.present}</td>
                    <td>{m.absent}</td>
                    <td>{m.od}</td>
                    <td><span className={`pct t-${pctTone(m.percentage)}`}>{fmtPct(m.percentage)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="section-title">Recent days, period by period</h3>
          <ul className="day-list">
            {days.slice(0, 30).map((d) => (
              <li key={d.date} className="day-row">
                <span className="day-date">{fmtDay(d.date)}</span>
                <span className="period-strip">
                  {d.periods.map((p, i) => (
                    <span
                      key={i}
                      className={`period-cell ${p ? `period-${p.status}` : 'period-none'}`}
                      title={p ? `Period ${i + 1}: ${STATUS_LABELS[p.status]}${p.onDuty ? ' (on duty)' : ''}` : `Period ${i + 1}: not marked`}
                    >
                      {i + 1}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">Green = present, amber = on duty, red = absent, grey = not marked.</p>
        </>
      )}
    </div>
  );
}
