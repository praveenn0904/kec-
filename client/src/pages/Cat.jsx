import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { SECTION_LIST, YEAR_LIST } from '../academic.js';
import { PageHeader, Spinner, useToast } from '../components/ui.jsx';

const TESTS = [1, 2, 3];
const MAX = 50;
const key = (t) => `cat${t}`;

/** Staff: enter CAT1 to CAT3 (out of 50) for a subject they teach. Only that subject staff member sees this. */
function StaffCat() {
  const toast = useToast();
  const [year, setYear] = useState('');
  const [section, setSection] = useState('');
  const [subjects, setSubjects] = useState(null);
  const [subject, setSubject] = useState('');
  const [data, setData] = useState(null);
  const [marks, setMarks] = useState({}); // studentId -> { cat1, cat2, cat3 } as typed
  const [changed, setChanged] = useState(new Set()); // `${studentId}|${cat}`
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSubject('');
    setData(null);
    if (!year || !section) {
      setSubjects(null);
      return;
    }
    api.catSubjects({ year, section }).then((r) => setSubjects(r.data)).catch((e) => setError(e.message));
  }, [year, section]);

  useEffect(() => {
    if (!subject) return;
    setError('');
    api
      .catClass({ year, section, subject })
      .then((r) => {
        setData(r);
        setMarks(Object.fromEntries(r.students.map((s) => [s.id, { ...s.tests }])));
        setChanged(new Set());
      })
      .catch((e) => setError(e.message));
  }, [subject, year, section]);

  const set = (studentId, t, value) => {
    setMarks((m) => ({ ...m, [studentId]: { ...m[studentId], [key(t)]: value } }));
    setChanged((c) => new Set(c).add(`${studentId}|${t}`));
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const t of TESTS) {
        const rows = [...changed].filter((x) => x.endsWith(`|${t}`)).map((x) => x.split('|')[0]);
        if (!rows.length) continue;
        const payload = rows.map((id) => {
          const raw = marks[id][key(t)];
          return { studentId: id, mark: raw === '' || raw === null || raw === undefined ? null : Number(raw) };
        });
        await api.saveCat({ year: Number(year), section, subject, cat: t, marks: payload });
      }
      toast('CAT marks saved');
      setChanged(new Set());
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="card toolbar">
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
        <label className="inline-field grow">
          <span>Subject you teach</span>
          <select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!subjects?.length}>
            <option value="">{subjects ? (subjects.length ? 'Choose subject…' : 'You teach no subject to this class') : 'Choose year and section first'}</option>
            {(subjects || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="banner banner-error" role="alert">{error}</div>}

      {!subject ? (
        <div className="card empty"><p>Choose a class and a subject you teach to enter CAT marks.</p></div>
      ) : !data ? (
        <div className="card"><Spinner label="Loading marks…" /></div>
      ) : data.students.length === 0 ? (
        <div className="card empty"><p>No active students in this class.</p></div>
      ) : (
        <div className="card table-card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Roll no</th><th>Name</th>{TESTS.map((t) => <th key={t}>CAT{t} <small className="block muted">out of {MAX}</small></th>)}</tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.rollNumber}</td>
                    <td><strong>{s.name}</strong></td>
                    {TESTS.map((t) => (
                      <td key={t}>
                        <input
                          type="number"
                          className="mark-input"
                          min="0"
                          max={MAX}
                          step="0.5"
                          aria-label={`CAT${t} mark for ${s.name}`}
                          value={marks[s.id]?.[key(t)] ?? ''}
                          onChange={(e) => set(s.id, t, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            <span className="muted">{changed.size ? 'You have unsaved marks.' : 'All marks saved. Students see their own marks only.'}</span>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving || changed.size === 0}>
              {saving ? 'Saving…' : 'Save CAT marks'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Student: their own CAT marks, one row per subject. */
function StudentCat() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.catMe().then(setData).catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="banner banner-error" role="alert">{error}</div>;
  if (!data) return <Spinner label="Loading your marks…" />;
  if (!data.data.length) return <div className="card empty"><p>No subjects are timetabled for your class yet.</p></div>;
  return (
    <div className="card table-card">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Subject</th>{TESTS.map((t) => <th key={t}>CAT{t}</th>)}</tr>
          </thead>
          <tbody>
            {data.data.map((row) => (
              <tr key={row.subject}>
                <td><strong>{row.subject}</strong></td>
                {TESTS.map((t) => (
                  <td key={t}>{row.marks[key(t)] ?? <span className="muted">–</span>}{row.marks[key(t)] !== null && <small className="muted"> / {MAX}</small>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Cat() {
  const { user } = useAuth();
  const student = user.role === 'student';
  return (
    <>
      <PageHeader
        title={student ? 'My CAT Marks' : 'CAT Marks'}
        subtitle={student ? 'Continuous assessment tests, out of 50 each.' : 'Enter CAT1 to CAT3 (out of 50) for the subjects you teach.'}
      />
      {student ? <StudentCat /> : <StaffCat />}
    </>
  );
}
