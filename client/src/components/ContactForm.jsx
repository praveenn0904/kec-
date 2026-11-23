import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useMeta } from '../hooks.js';
import { SECTION_LIST, YEAR_LIST } from '../academic.js';
import { Field } from './ui.jsx';

const EMPTY = {
  role: 'student', name: '', email: '', phone: '', department: '', address: '', notes: '', status: 'active',
  rollNumber: '', course: '', year: 1, section: 'A', guardianName: '', guardianPhone: '',
  employeeId: '', designation: '', officeLocation: '',
};
const GPA_SLOTS = Array.from({ length: 8 }, (_, i) => i + 1);

/**
 * mode = 'create' (adds someone), 'edit' (edits someone), 'self' (a user edits their own profile).
 * Department staff add people to their own department; the administrator picks any department.
 * Academic record (10th, 12th, semester GPAs, CGPA, arrears) is entered by staff and the administrator, not by the student.
 */
export default function ContactForm({ initial, mode = 'create', onSubmit, onCancel }) {
  const { user } = useAuth();
  const meta = useMeta();
  const departments = meta?.departments || [];
  const isAdminUser = user.role === 'admin';
  const own = departments.find((d) => d.name === user.department);
  const [values, setValues] = useState({ ...EMPTY, department: isAdminUser ? '' : user.department, ...(initial || {}), password: '' });
  const [acad, setAcad] = useState(() => {
    const a = initial?.academics || {};
    return {
      tenthPercent: a.tenthPercent ?? '', twelfthPercent: a.twelfthPercent ?? '', cgpa: a.cgpa ?? '', arrears: a.arrears ?? 0,
      semesterGpa: GPA_SLOTS.map((_, i) => a.semesterGpa?.[i] ?? ''),
    };
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const self = mode === 'self';
  const isStudent = values.role === 'student';
  const showAcademics = isStudent && !self;

  const clearError = (name) => errors[name] && setErrors((er) => ({ ...er, [name]: undefined }));
  const bind = (name) => ({
    value: values[name] ?? '',
    onChange: (e) => {
      setValues((v) => ({ ...v, [name]: e.target.value }));
      clearError(name);
    },
  });
  const bindAcad = (name) => ({
    value: acad[name] ?? '',
    onChange: (e) => {
      setAcad((a) => ({ ...a, [name]: e.target.value }));
      clearError(name);
    },
  });
  const setGpa = (i, v) => {
    setAcad((a) => ({ ...a, semesterGpa: a.semesterGpa.map((g, j) => (j === i ? v : g)) }));
    clearError('semesterGpa');
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    const department = isAdminUser ? values.department : user.department;
    const payload = { ...values, department };
    if (self || !payload.password) delete payload.password;
    if (showAcademics) payload.academics = acad;
    try {
      await onSubmit(payload);
    } catch (err) {
      setErrors(err.fields || {});
      if (!err.fields || !Object.keys(err.fields).length) setFormError(err.message);
      setSaving(false);
    }
  };

  const deptSlug = (own?.code || 'dept').toLowerCase().replace(/[^a-z0-9]/g, '');
  const emailHint = isStudent
    ? 'Students use their college email, for example aarav.sharma@kongu.edu'
    : `Staff use name.${deptSlug}@kongu.edu, and placement coordinators use placement.${deptSlug}@kongu.edu`;

  return (
    <form className="form" onSubmit={submit} noValidate>
      {!self && (
        <div className="segmented segmented-full" role="group" aria-label="Contact type">
          {[['student', 'Student'], ['staff', 'Staff']].map(([r, label]) => (
            <button key={r} type="button" className={values.role === r ? 'active' : ''}
              onClick={() => setValues((v) => ({ ...v, role: r }))}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="grid">
        <Field label="Full name *" error={errors.name} full><input {...bind('name')} placeholder="e.g. Aarav Sharma" autoFocus /></Field>
        <Field label="College email *" error={errors.email} hint={self ? 'Your login ID. Contact an administrator to change it.' : emailHint}>
          <input type="email" {...bind('email')} disabled={self} placeholder={isStudent ? 'name@kongu.edu' : `name.${deptSlug}@kongu.edu`} />
        </Field>
        <Field label="Phone *" error={errors.phone}><input type="tel" {...bind('phone')} placeholder="+91 98765 43210" /></Field>

        {isAdminUser && !self ? (
          <Field label="Department *" error={errors.department} full>
            <select {...bind('department')}>
              <option value="">Select department…</option>
              {departments.map((d) => <option key={d.code} value={d.name}>{d.name} ({d.code})</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Department" full hint={self ? undefined : 'Department staff manage only their own department'}>
            <input value={own ? `${own.name} (${own.code})` : user.department} disabled />
          </Field>
        )}

        {isStudent ? (
          <>
            <Field label="Roll number *" error={errors.rollNumber} hint={self ? 'Locked. Ask staff to change it.' : undefined}>
              <input {...bind('rollNumber')} disabled={self} placeholder="24CSE001" />
            </Field>
            <Field label="Course *" error={errors.course}><input {...bind('course')} placeholder="B.E." /></Field>
            <Field label="Year *" error={errors.year}>
              <select {...bind('year')}>
                {YEAR_LIST.map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </Field>
            <Field label="Section *" error={errors.section}>
              <select {...bind('section')}>
                {SECTION_LIST.map((s) => <option key={s} value={s}>Section {s}</option>)}
              </select>
            </Field>
            <Field label="Guardian name" error={errors.guardianName}><input {...bind('guardianName')} /></Field>
            <Field label="Guardian phone" error={errors.guardianPhone}><input type="tel" {...bind('guardianPhone')} /></Field>
          </>
        ) : (
          <>
            <Field label="Employee ID *" error={errors.employeeId} hint={self ? 'Locked. Ask an administrator to change it.' : undefined}>
              <input {...bind('employeeId')} disabled={self} placeholder="EMP1001" />
            </Field>
            <Field label="Designation *" error={errors.designation}><input {...bind('designation')} placeholder="Assistant Professor" /></Field>
            <Field label="Office location" error={errors.officeLocation}><input {...bind('officeLocation')} placeholder="Block A, Room 101" /></Field>
          </>
        )}

        {showAcademics && (
          <div className="field field-full">
            <span className="field-label">Academic record</span>
            <div className="grid criteria-grid">
              <Field label="10th percentage" error={errors.tenthPercent}><input type="number" step="0.01" min="0" max="100" {...bindAcad('tenthPercent')} /></Field>
              <Field label="12th percentage" error={errors.twelfthPercent}><input type="number" step="0.01" min="0" max="100" {...bindAcad('twelfthPercent')} /></Field>
              <Field label="CGPA" error={errors.cgpa} hint="Leave blank to use the average of the semesters entered">
                <input type="number" step="0.01" min="0" max="10" {...bindAcad('cgpa')} />
              </Field>
              <Field label="Arrears (count)" error={errors.arrears}><input type="number" step="1" min="0" max="50" {...bindAcad('arrears')} /></Field>
            </div>
            <div className="grid criteria-grid gpa-grid">
              {GPA_SLOTS.map((n, i) => (
                <Field key={n} label={`Semester ${n} GPA`} error={i === 0 ? errors.semesterGpa : undefined}>
                  <input type="number" step="0.01" min="0" max="10" value={acad.semesterGpa[i]} onChange={(e) => setGpa(i, e.target.value)} />
                </Field>
              ))}
            </div>
          </div>
        )}

        {!self && (
          <Field label="Status" error={errors.status}>
            <select {...bind('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive (cannot log in)</option>
            </select>
          </Field>
        )}

        {!self && (
          <Field
            label={mode === 'create' ? 'Initial password *' : 'Reset password'}
            error={errors.password}
            hint={mode === 'create' ? 'They can change it after logging in' : 'Leave blank to keep the current password'}
          >
            <input type="password" {...bind('password')} autoComplete="new-password" />
          </Field>
        )}

        <Field label="Address" full error={errors.address}><input {...bind('address')} /></Field>
        {!(self && isStudent) && (
          <Field label="Internal notes" full error={errors.notes} hint={isStudent && !self ? 'Visible to staff only' : undefined}>
            <textarea rows="3" {...bind('notes')} />
          </Field>
        )}
      </div>

      {formError && <p className="form-error" role="alert">{formError}</p>}

      <div className="form-actions">
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : mode === 'create' ? 'Add contact' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
