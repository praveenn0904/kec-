import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { localDate, fmtPct, pctTone, rowsToCsv, saveBlob, STATUS_LABELS } from '../utils.js';
import { PERIOD_COUNT, SECTION_LIST, YEAR_LIST } from '../academic.js';
import Icon from '../components/icons.jsx';
import { Modal, PageHeader, Spinner, useToast } from '../components/ui.jsx';
import AttendanceDetail, { PercentBar } from '../components/AttendanceDetail.jsx';
import { useAuth } from '../auth.jsx';

const LETTER = { present: 'P', absent: 'A', od: 'OD' };
const NEXT = { null: 'present', present: 'absent', absent: 'od', od: null };

/** Register: students down, periods 1 to 8 across. Each staff member edits only the periods they teach. */
function Register() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [date, setDate] = useState(localDate());
  const [year, setYear] = useState(params.get('year') || '');
  const [section, setSection] = useState(params.get('section') || '');
  const [grid, setGrid] = useState(null);
  const [cells, setCells] = useState({}); // studentId -> array of status per period (null = not marked)
  const [changed, setChanged] = useState(new Set()); // period numbers with unsaved edits
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ready = date && year && section;

  useEffect(() => {
    if (!ready) {
      setGrid(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .grid({ date, year, section })
      .then((res) => {
        if (cancelled) return;
        setGrid(res);
        setCells(Object.fromEntries(res.students.map((s) => [s.id, s.cells.map((c) => c?.status || null)])));
        setChanged(new Set());
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, year, section]);

  const editable = useMemo(() => (grid ? grid.columns.map((c) => c.editable) : []), [grid]);

  const touch = (periodIndex) => setChanged((prev) => new Set(prev).add(periodIndex + 1));

  const cycle = (studentId, i) => {
    setCells((c) => ({ ...c, [studentId]: c[studentId].map((v, j) => (j === i ? NEXT[v] ?? null : v)) }));
    touch(i);
  };

  const markColumn = (i, status) => {
    setCells((c) => Object.fromEntries(Object.entries(c).map(([id, arr]) => [id, arr.map((v, j) => (j === i ? status : v))])));
    touch(i);
  };

  const save = async () => {
    setSaving(true);
    try {
      let saved = 0;
      for (const p of [...changed].sort((a, b) => a - b)) {
        const i = p - 1;
        const records = grid.students
          .filter((s) => cells[s.id][i])
          .map((s) => ({ studentId: s.id, status: cells[s.id][i] }));
        if (records.length === 0) continue;
        const res = await api.saveAttendance({ date, period: p, year: Number(year), section, records });
        saved += res.saved;
      }
      toast(`Attendance saved for ${saved} mark${saved === 1 ? '' : 's'}`);
      setChanged(new Set());
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const count = (i) => {
    const c = { present: 0, absent: 0, od: 0, none: 0 };
    grid?.students.forEach((s) => (cells[s.id]?.[i] ? c[cells[s.id][i]]++ : c.none++));
    return c;
  };
  const anyEditable = editable.some(Boolean);

  return (
    <>
      <div className="card toolbar">
        <label className="inline-field">
          <span>Date</span>
          <input type="date" value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="inline-field">
          <span>Year</span>
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Choose year…</option>
            {YEAR_LIST.map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </label>
        <label className="inline-field">
          <span>Section</span>
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">Choose section…</option>
            {SECTION_LIST.map((s) => <option key={s} value={s}>Section {s}</option>)}
          </select>
        </label>
        <span className="muted toolbar-note">P = present · A = absent · OD = on duty</span>
      </div>

      {error && <div className="banner banner-error" role="alert">{error}</div>}

      {!ready ? (
        <div className="card empty"><p>Choose the date, year and section to open the register.</p></div>
      ) : loading || !grid ? (
        <div className="card"><Spinner label="Loading register…" /></div>
      ) : grid.students.length === 0 ? (
        <div className="card empty"><p>No active students in Year {year} Section {section}.</p></div>
      ) : (
        <div className="card table-card">
          {!anyEditable && (
            <p className="banner banner-warn">You do not teach any period of Year {year} Section {section} on this day. You can see the register, but only the staff who teach a period can mark it.</p>
          )}
          <div className="table-wrap">
            <table className="table register">
              <thead>
                <tr>
                  <th>Roll no</th>
                  <th>Name</th>
                  {grid.columns.map((col, i) => (
                    <th key={col.period} className={`reg-col ${col.editable ? 'reg-mine' : ''}`}>
                      <div>Period {col.period}</div>
                      <small className="block">{col.subject || 'No class'}</small>
                      <small className="block muted">{col.staffName}</small>
                      {col.editable && (
                        <div className="mark-quick">
                          <button type="button" className="btn btn-small" onClick={() => markColumn(i, 'present')}>All P</button>
                          <button type="button" className="btn btn-small" onClick={() => markColumn(i, 'absent')}>All A</button>
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.rollNumber}</td>
                    <td><strong>{s.name}</strong></td>
                    {grid.columns.map((col, i) => {
                      const v = cells[s.id]?.[i] ?? null;
                      if (!col.subject) return <td key={col.period} className="reg-cell reg-none">–</td>;
                      if (!col.editable) {
                        return (
                          <td key={col.period} className="reg-cell" title={`${col.subject} is taken by ${col.staffName}`}>
                            <span className={`reg-mark reg-${v || 'none'}`}>{v ? LETTER[v] : '·'}</span>
                          </td>
                        );
                      }
                      return (
                        <td key={col.period} className="reg-cell">
                          <button
                            type="button"
                            className={`reg-mark reg-btn reg-${v || 'none'}`}
                            onClick={() => cycle(s.id, i)}
                            aria-label={`${s.name}, period ${col.period}: ${v ? STATUS_LABELS[v] : 'not marked'}. Click to change.`}
                          >
                            {v ? LETTER[v] : '·'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="muted">Counts (present / absent / on duty)</td>
                  {grid.columns.map((col, i) => {
                    if (!col.subject) return <td key={col.period} />;
                    const c = count(i);
                    return <td key={col.period} className="reg-count">{c.present} / {c.absent} / {c.od}</td>;
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="table-foot">
            <span className="muted">{changed.size ? `Unsaved changes in period${changed.size > 1 ? 's' : ''} ${[...changed].sort((a, b) => a - b).join(', ')}.` : 'All changes saved.'}</span>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving || changed.size === 0}>
              {saving ? 'Saving…' : 'Save attendance'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function AttendanceReport() {
  const toast = useToast();
  const [f, setF] = useState({ year: '', section: '', from: '', to: '', below: false });
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError('');
    api
      .attendanceReport({ year: f.year, section: f.section, from: f.from, to: f.to, below: f.below ? 75 : '', sort: f.below ? 'percentage' : '' })
      .then((res) => !cancelled && setRows(res.data))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [f]);

  const filters = { year: f.year, section: f.section, from: f.from, to: f.to, below: f.below ? 75 : '' };

  const downloadPdf = async () => {
    try {
      const { blob } = await api.attendancePdf(filters);
      saveBlob(blob, 'attendance-report.pdf');
      toast('Attendance report downloaded');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const exportCsv = () => {
    const csv = rowsToCsv(rows, [
      { label: 'Roll number', value: (r) => r.rollNumber },
      { label: 'Name', value: (r) => r.name },
      { label: 'Year', value: (r) => r.year },
      { label: 'Section', value: (r) => r.section },
      { label: 'Periods recorded', value: (r) => r.total },
      { label: 'Present', value: (r) => r.present },
      { label: 'On duty', value: (r) => r.od },
      { label: 'Absent', value: (r) => r.absent },
      { label: 'Percentage', value: (r) => (r.percentage === null ? '' : r.percentage) },
    ]);
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'attendance-report.csv');
    toast('Report downloaded');
  };

  return (
    <>
      <div className="card toolbar">
        <label className="inline-field">
          <span>Year</span>
          <select value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })}>
            <option value="">All years</option>
            {YEAR_LIST.map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </label>
        <label className="inline-field">
          <span>Section</span>
          <select value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })}>
            <option value="">All sections</option>
            {SECTION_LIST.map((s) => <option key={s} value={s}>Section {s}</option>)}
          </select>
        </label>
        <label className="inline-field"><span>From</span><input type="date" value={f.from} max={f.to || localDate()} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="inline-field"><span>To</span><input type="date" value={f.to} min={f.from} max={localDate()} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <label className="check">
          <input type="checkbox" checked={f.below} onChange={(e) => setF({ ...f, below: e.target.checked })} />
          Below 75% only
        </label>
        <button type="button" className="btn" onClick={exportCsv} disabled={!rows?.length}><Icon name="download" /> CSV</button>
        <button type="button" className="btn btn-primary" onClick={downloadPdf} disabled={!rows?.length}><Icon name="file" /> Download PDF</button>
      </div>

      {error && <div className="banner banner-error" role="alert">{error}</div>}

      <div className="card table-card">
        {!rows ? (
          <Spinner label="Building report…" />
        ) : rows.length === 0 ? (
          <div className="empty"><p>No students match these filters.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="table table-hover">
              <thead>
                <tr><th>Roll no</th><th>Name</th><th>Year</th><th>Sec</th><th>Periods</th><th>Present</th><th>On duty</th><th>Absent</th><th>Attendance</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r)}>
                    <td>{r.rollNumber}</td>
                    <td><strong>{r.name}</strong></td>
                    <td>{r.year}</td>
                    <td>{r.section}</td>
                    <td>{r.total}</td>
                    <td>{r.present}</td>
                    <td>{r.od}</td>
                    <td>{r.absent}</td>
                    <td>
                      <div className="pct-cell">
                        <PercentBar value={r.percentage} />
                        <span className={`pct t-${pctTone(r.percentage)}`}>{fmtPct(r.percentage)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows && rows.length > 0 && <div className="table-foot"><span className="muted">{rows.length} student{rows.length === 1 ? '' : 's'} · select a row for the period-by-period history</span></div>}
      </div>

      {selected && (
        <Modal title={`${selected.name} · ${selected.rollNumber}`} onClose={() => setSelected(null)} wide>
          <AttendanceDetail studentId={selected.id} />
        </Modal>
      )}
    </>
  );
}

export default function Attendance() {
  const { user } = useAuth();
  const [tab, setTab] = useState('mark');
  return (
    <>
      <PageHeader title="Attendance" subtitle={`${user.department} · each staff member marks the periods they teach.`}>
        <div className="segmented" role="tablist" aria-label="Attendance view">
          <button type="button" role="tab" aria-selected={tab === 'mark'} className={tab === 'mark' ? 'active' : ''} onClick={() => setTab('mark')}>Register</button>
          <button type="button" role="tab" aria-selected={tab === 'report'} className={tab === 'report' ? 'active' : ''} onClick={() => setTab('report')}>Reports</button>
        </div>
      </PageHeader>
      {tab === 'mark' ? <Register /> : <AttendanceReport />}
    </>
  );
}
