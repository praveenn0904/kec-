import { useState } from 'react';
import { useMeta } from '../hooks.js';
import { Field } from './ui.jsx';
import Icon from './icons.jsx';

const blank = () => ({
  company: '', role: '', ctc: '', location: '', driveDate: '', deadline: '',
  rounds: ['Aptitude Test', 'Technical Interview', 'HR Interview'], eligibleDepartments: [], description: '', status: 'open',
  tenthMin: '', twelfthMin: '', cgpaMin: '', maxArrears: '',
});

/** Create or edit a placement drive. An empty "eligible departments" list means every department. */
export default function DriveForm({ initial, onSubmit, onCancel }) {
  const departments = useMeta()?.departments || [];
  const [v, setV] = useState(initial ? { ...blank(), ...initial, ...(initial.criteria || {}), ctc: initial.ctc ?? '' } : blank());
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const editing = Boolean(initial?.id);

  const bind = (name) => ({
    value: v[name] ?? '',
    onChange: (e) => {
      setV((s) => ({ ...s, [name]: e.target.value }));
      if (errors[name]) setErrors((er) => ({ ...er, [name]: undefined }));
    },
  });

  const setRound = (i, value) => setV((s) => ({ ...s, rounds: s.rounds.map((r, j) => (j === i ? value : r)) }));
  const addRound = () => v.rounds.length < 10 && setV((s) => ({ ...s, rounds: [...s.rounds, ''] }));
  const removeRound = (i) => v.rounds.length > 1 && setV((s) => ({ ...s, rounds: s.rounds.filter((_, j) => j !== i) }));

  const toggleDept = (name) =>
    setV((s) => ({
      ...s,
      eligibleDepartments: s.eligibleDepartments.includes(name)
        ? s.eligibleDepartments.filter((d) => d !== name)
        : [...s.eligibleDepartments, name],
    }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const num = (x) => (x === '' || x === null || x === undefined ? null : Number(x));
      await onSubmit({
        ...v,
        ctc: num(v.ctc),
        // Eligibility set by the TPO for this company. Blank means no limit.
        criteria: { tenthMin: num(v.tenthMin), twelfthMin: num(v.twelfthMin), cgpaMin: num(v.cgpaMin), maxArrears: num(v.maxArrears) },
      });
    } catch (err) {
      setErrors(err.fields || {});
      if (!err.fields || !Object.keys(err.fields).length) setFormError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="grid">
        <Field label="Company *" error={errors.company}><input {...bind('company')} autoFocus /></Field>
        <Field label="Job role *" error={errors.role}><input {...bind('role')} placeholder="e.g. Software Developer" /></Field>
        <Field label="Package (LPA)" error={errors.ctc}><input type="number" step="0.1" min="0" {...bind('ctc')} placeholder="e.g. 6.5" /></Field>
        <Field label="Location" error={errors.location}><input {...bind('location')} /></Field>
        <Field label="Drive date *" error={errors.driveDate}><input type="date" {...bind('driveDate')} /></Field>
        <Field label="Last date to opt in or out *" error={errors.deadline}><input type="date" {...bind('deadline')} max={v.driveDate || undefined} /></Field>

        <div className="field field-full">
          <span className="field-label">Rounds, in order *</span>
          <ol className="round-inputs">
            {v.rounds.map((name, i) => (
              <li key={i}>
                <span className="round-no">{i + 1}</span>
                <input value={name} onChange={(e) => setRound(i, e.target.value)} placeholder="e.g. Technical Interview" aria-label={`Round ${i + 1} name`} />
                <button type="button" className="icon-btn" onClick={() => removeRound(i)} disabled={v.rounds.length === 1} aria-label={`Remove round ${i + 1}`}>×</button>
              </li>
            ))}
          </ol>
          {errors.rounds && <span className="field-msg">{errors.rounds}</span>}
          <button type="button" className="btn btn-small btn-ghost add-round" onClick={addRound} disabled={v.rounds.length >= 10}>
            <Icon name="plus" size={14} /> Add round
          </button>
        </div>

        <div className="field field-full">
          <span className="field-label">Eligibility criteria (leave blank for no limit)</span>
          <div className="grid criteria-grid">
            <Field label="10th minimum %" error={errors.tenthMin}><input type="number" step="0.01" min="0" max="100" {...bind('tenthMin')} placeholder="e.g. 60" /></Field>
            <Field label="12th minimum %" error={errors.twelfthMin}><input type="number" step="0.01" min="0" max="100" {...bind('twelfthMin')} placeholder="e.g. 60" /></Field>
            <Field label="CGPA minimum" error={errors.cgpaMin}><input type="number" step="0.01" min="0" max="10" {...bind('cgpaMin')} placeholder="e.g. 6.5" /></Field>
            <Field label="Maximum arrears" error={errors.maxArrears}><input type="number" step="1" min="0" max="50" {...bind('maxArrears')} placeholder="e.g. 0" /></Field>
          </div>
        </div>

        <div className="field field-full">
          <span className="field-label">Eligible departments</span>
          <label className="check dept-all">
            <input type="checkbox" checked={v.eligibleDepartments.length === 0} onChange={() => setV((s) => ({ ...s, eligibleDepartments: [] }))} />
            All departments
          </label>
          <div className="dept-checks">
            {departments.map((d) => (
              <label key={d.code} className="check">
                <input type="checkbox" checked={v.eligibleDepartments.includes(d.name)} onChange={() => toggleDept(d.name)} />
                {d.name}
              </label>
            ))}
          </div>
          {errors.eligibleDepartments && <span className="field-msg">{errors.eligibleDepartments}</span>}
        </div>

        <Field label="Description" full error={errors.description}><textarea rows="3" {...bind('description')} /></Field>
        {editing && (
          <Field label="Status" error={errors.status}>
            <select {...bind('status')}>
              <option value="open">Open for opt in / out</option>
              <option value="closed">Closed</option>
            </select>
          </Field>
        )}
      </div>

      {formError && <p className="form-error" role="alert">{formError}</p>}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create drive'}</button>
      </div>
    </form>
  );
}
