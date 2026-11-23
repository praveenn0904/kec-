import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useMeta } from '../hooks.js';
import { SECTION_LIST, YEAR_LIST, PERIOD_COUNT } from '../academic.js';
import { Field, Modal, PageHeader, Spinner, useToast } from '../components/ui.jsx';

/** One cell: edit the subject and the staff member who teaches it. */
function SlotForm({ slot, day, period, year, section, department, staffList, onSaved, onCancel, onDelete }) {
  const toast = useToast();
  const [subject, setSubject] = useState(slot?.subject || '');
  const [staffId, setStaffId] = useState(slot?.staffId || '');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.saveSlot({ department, year: Number(year), section, day, period, subject, staffId });
      toast('Timetable saved');
      onSaved();
    } catch (err) {
      setErrors(err.fields || {});
      toast(err.message, 'error');
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="grid">
        <Field label="Subject *" error={errors.subject} full>
          <input value={subject} onChange={(e) => { setSubject(e.target.value); setErrors({}); }} placeholder="e.g. Operating Systems" autoFocus />
        </Field>
        <Field label="Staff member *" error={errors.staffId} full hint="Only this staff member can mark attendance and CAT marks for this subject">
          <select value={staffId} onChange={(e) => { setStaffId(e.target.value); setErrors({}); }}>
            <option value="">Choose staff…</option>
            {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}{s.designation ? ` · ${s.designation}` : ''}</option>)}
          </select>
        </Field>
      </div>
      <div className="form-actions">
        {slot && onDelete && <button type="button" className="btn btn-danger" onClick={onDelete}>Remove</button>}
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save period'}</button>
      </div>
    </form>
  );
}

export default function Timetable() {
  const { user } = useAuth();
  const meta = useMeta();
  const toast = useToast();
  const isStudent = user.role === 'student';
  const isAdminUser = user.role === 'admin';
  const [department, setDepartment] = useState(isAdminUser ? '' : user.department);
  const [year, setYear] = useState(isStudent ? user.year : '');
  const [section, setSection] = useState(isStudent ? user.section : '');
  const [table, setTable] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [editing, setEditing] = useState(null); // { day, period, slot }
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  const departments = meta?.departments || [];
  const ready = (isStudent || (year && section)) && (!isAdminUser || department);
  const canEdit = Boolean(table?.canEdit);

  useEffect(() => {
    if (!ready) {
      setTable(null);
      return undefined;
    }
    let cancelled = false;
    setError('');
    api
      .timetable({ year: isStudent ? undefined : year, section: isStudent ? undefined : section, department: isAdminUser ? department : undefined })
      .then((t) => !cancelled && setTable(t))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, section, department, reload]);

  // Staff who can teach this class (for the staff picker).
  useEffect(() => {
    if (!canEdit && !isAdminUser) return;
    const dep = isAdminUser ? department : user.department;
    if (!dep) return;
    api.timetableStaff(isAdminUser ? { department: dep } : {}).then((r) => setStaffList(r.data)).catch(() => setStaffList([]));
  }, [canEdit, isAdminUser, department, user.department]);

  const remove = async (slot) => {
    try {
      await api.deleteSlot(slot.id);
      toast('Period removed');
      setEditing(null);
      setReload((n) => n + 1);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const dayLabel = (d) => d.name.slice(0, 3);

  return (
    <>
      <PageHeader
        title="Timetable"
        subtitle={isStudent ? `Year ${user.year} · Section ${user.section} · ${user.department}` : 'Subject, period and staff for each class.'}
      />

      {!isStudent && (
        <div className="card toolbar">
          {isAdminUser && (
            <label className="inline-field grow">
              <span>Department</span>
              <select value={department} onChange={(e) => { setDepartment(e.target.value); setYear(''); setSection(''); }}>
                <option value="">Choose department…</option>
                {departments.map((d) => <option key={d.code} value={d.name}>{d.name} ({d.code})</option>)}
              </select>
            </label>
          )}
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
        </div>
      )}

      {error && <div className="banner banner-error" role="alert">{error}</div>}

      {!ready ? (
        <div className="card empty"><p>{isAdminUser ? 'Choose a department, year and section.' : 'Choose a year and section.'}</p></div>
      ) : !table ? (
        <div className="card"><Spinner label="Loading timetable…" /></div>
      ) : (
        <div className="card table-card">
          <div className="table-wrap">
            <table className="table timetable">
              <thead>
                <tr>
                  <th>Period</th>
                  {table.days.map((d) => <th key={d.day}>{dayLabel(d)}</th>)}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: PERIOD_COUNT }, (_, i) => i + 1).map((p) => (
                  <tr key={p}>
                    <th scope="row">{p}</th>
                    {table.days.map((d) => {
                      const cell = d.periods[p - 1];
                      const slot = cell.slot;
                      return (
                        <td key={d.day} className="tt-cell">
                          {canEdit ? (
                            <button type="button" className="tt-btn" onClick={() => setEditing({ day: d.day, dayName: d.name, period: p, slot })}>
                              {slot ? <><strong>{slot.subject}</strong><small>{slot.staffName}</small></> : <small className="muted">+ add</small>}
                            </button>
                          ) : slot ? (
                            <><strong>{slot.subject}</strong><small className="block">{slot.staffName}</small></>
                          ) : (
                            <small className="muted">–</small>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && <p className="muted small table-foot">Click a period to set its subject and staff member. Only that staff member can mark attendance and CAT marks for it.</p>}
        </div>
      )}

      {editing && (
        <Modal title={`${editing.dayName} · period ${editing.period} · Year ${table.year} ${table.section}`} onClose={() => setEditing(null)}>
          <SlotForm
            slot={editing.slot}
            day={editing.day}
            period={editing.period}
            year={table.year}
            section={table.section}
            department={table.department}
            staffList={staffList}
            onSaved={() => { setEditing(null); setReload((n) => n + 1); }}
            onCancel={() => setEditing(null)}
            onDelete={editing.slot ? () => remove(editing.slot) : undefined}
          />
        </Modal>
      )}
    </>
  );
}
