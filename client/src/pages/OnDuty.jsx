import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useDebounce } from '../hooks.js';
import { addDays, fmtDate, fmtDay, fmtRange, localDate } from '../utils.js';
import Icon from '../components/icons.jsx';
import { Field, PageHeader, Spinner, useToast } from '../components/ui.jsx';
import ProofViewer from '../components/ProofViewer.jsx';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf';

const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
const StatusChip = ({ status }) => <span className={`chip chip-${status}`}>{STATUS_LABEL[status]}</span>;

const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });

// ------------------------------------------------------------------ student

function ApplyForm({ onSent }) {
  const toast = useToast();
  const today = localDate();
  const [v, setV] = useState({ reason: '', place: '', fromDate: today, days: '1' });
  const [proof, setProof] = useState(null); // { name, data }
  const [fileKey, setFileKey] = useState(0);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const bind = (name) => ({
    value: v[name],
    onChange: (e) => {
      setV((s) => ({ ...s, [name]: e.target.value }));
      if (errors[name]) setErrors((er) => ({ ...er, [name]: undefined }));
    },
  });

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    setProof(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setErrors((er) => ({ ...er, proof: 'The proof file must be 2 MB or smaller' }));
      setFileKey((k) => k + 1);
      return;
    }
    try {
      setProof({ name: file.name, data: await readFile(file) });
      setErrors((er) => ({ ...er, proof: undefined }));
    } catch (err) {
      setErrors((er) => ({ ...er, proof: err.message }));
    }
  };

  const days = Number(v.days);
  const endsOn = v.fromDate && Number.isInteger(days) && days >= 1 && days <= 30 ? addDays(v.fromDate, days - 1) : null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.applyOnDuty({ reason: v.reason, place: v.place, fromDate: v.fromDate, days, proof });
      toast('On-duty request sent to your staff');
      setV({ reason: '', place: '', fromDate: today, days: '1' });
      setProof(null);
      setFileKey((k) => k + 1);
      setErrors({});
      onSent();
    } catch (err) {
      setErrors(err.fields && Object.keys(err.fields).length ? err.fields : { form: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card card-pad form" onSubmit={submit} noValidate>
      <h2 className="card-title">Apply for on duty</h2>
      <div className="grid">
        <Field label="Reason *" error={errors.reason} full>
          <textarea rows="2" {...bind('reason')} placeholder="e.g. Representing the college in an inter-college hackathon" maxLength={300} />
        </Field>
        <Field label="Where are you going? *" error={errors.place} full>
          <input {...bind('place')} placeholder="Name of the college, company or venue, and city" maxLength={150} />
        </Field>
        <Field label="First day *" error={errors.fromDate} hint={endsOn ? `Ends on ${fmtDay(endsOn)}. Weekends are skipped.` : undefined}>
          <input type="date" {...bind('fromDate')} min={addDays(today, -30)} max={addDays(today, 90)} />
        </Field>
        <Field label="Number of days *" error={errors.days}>
          <input type="number" min="1" max="30" {...bind('days')} />
        </Field>
        <Field label="Proof *" error={errors.proof} full hint={proof ? `Selected: ${proof.name}` : 'Permission or invitation letter. PNG, JPG or PDF, up to 2 MB.'}>
          <input key={fileKey} type="file" accept={ACCEPT} onChange={pickFile} />
        </Field>
      </div>
      {errors.form && <p className="form-error" role="alert">{errors.form}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
      </div>
    </form>
  );
}

function RequestTable({ rows, staff, onProof, onApprove, onReject, onCancel, busyId }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {staff && <th>Student</th>}
            <th>Dates</th>
            <th>Where and why</th>
            <th>Proof</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {staff && (
                <td>
                  <strong>{r.studentName}</strong>
                  <small className="block">{r.rollNumber} · Year {r.year}</small>
                  <small className="block">{r.department}</small>
                </td>
              )}
              <td className="nowrap">
                {fmtRange(r.fromDate, r.toDate)}
                <small className="block">{r.days} day{r.days === 1 ? '' : 's'} ({r.workingDays} working)</small>
              </td>
              <td className="wide-cell">
                <strong>{r.place}</strong>
                <small className="block">{r.reason}</small>
                <small className="block">Applied {fmtDate(r.createdAt)}</small>
              </td>
              <td>
                {r.hasProof ? (
                  <button type="button" className="btn btn-small" onClick={() => onProof(r)}><Icon name="paperclip" size={14} /> View</button>
                ) : (
                  <span className="muted">None</span>
                )}
              </td>
              <td>
                <StatusChip status={r.status} />
                {r.decidedByName && <small className="block">{r.status === 'approved' ? 'Approved' : 'Rejected'} by {r.decidedByName}</small>}
              </td>
              <td className="nowrap actions">
                {staff && r.status === 'pending' && (
                  <>
                    <button type="button" className="btn btn-small btn-approve" disabled={busyId === r.id} onClick={() => onApprove(r)}>
                      <Icon name="tick" size={14} /> Approve
                    </button>
                    <button type="button" className="btn btn-small btn-danger" disabled={busyId === r.id} onClick={() => onReject(r)}>
                      <Icon name="x" size={14} /> Reject
                    </button>
                  </>
                )}
                {!staff && r.status === 'pending' && (
                  <button type="button" className="btn btn-small btn-danger" disabled={busyId === r.id} onClick={() => onCancel(r)}>Withdraw</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudentOnDuty() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [proofFor, setProofFor] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    api.onDuty().then((res) => setRows(res.data)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const withdraw = async (r) => {
    setBusyId(r.id);
    try {
      await api.cancelOnDuty(r.id);
      toast('Request withdrawn');
      load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader title="On Duty" subtitle="Apply when you are away for college work. Once a staff member approves, those days count as present." />
      <ApplyForm onSent={load} />
      <h2 className="section-title section-title-lg">My requests</h2>
      {error && <div className="banner banner-error" role="alert">{error}</div>}
      <div className="card table-card">
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <div className="empty"><p>You have not applied for on duty yet.</p></div>
        ) : (
          <RequestTable rows={rows} onProof={setProofFor} onCancel={withdraw} busyId={busyId} />
        )}
      </div>
      {proofFor && <ProofViewer request={proofFor} onClose={() => setProofFor(null)} />}
    </>
  );
}

// -------------------------------------------------------------------- staff

const TABS = [
  ['pending', 'Pending'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['', 'All'],
];

function StaffOnDuty() {
  const toast = useToast();
  const [tab, setTab] = useState('pending');
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [proofFor, setProofFor] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    api
      .onDuty({ q: dq })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [dq]);
  useEffect(load, [load]);

  const decide = async (r, approve) => {
    setBusyId(r.id);
    try {
      await (approve ? api.approveOnDuty(r.id) : api.rejectOnDuty(r.id));
      toast(approve ? `Approved. ${r.studentName}'s days now count as present.` : 'Request rejected');
      load();
    } catch (e) {
      toast(e.message, 'error');
      load();
    } finally {
      setBusyId(null);
    }
  };

  const rows = data ? (tab ? data.data.filter((r) => r.status === tab) : data.data) : null;

  return (
    <>
      <PageHeader title="On Duty Requests" subtitle="Approve or reject student requests. Approved days are marked present automatically." />

      <div className="card toolbar">
        <div className="segmented" role="tablist" aria-label="Request status">
          {TABS.map(([value, label]) => (
            <button key={label} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>
              {label}{value && data ? ` (${data.counts[value]})` : ''}
            </button>
          ))}
        </div>
        <div className="search-box">
          <Icon name="search" />
          <input type="search" placeholder="Search student, roll no, place or reason…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search requests" />
        </div>
      </div>

      {error && <div className="banner banner-error" role="alert">{error}</div>}
      <div className="card table-card">
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <div className="empty"><p>{tab === 'pending' ? 'No requests are waiting for you.' : 'No requests to show.'}</p></div>
        ) : (
          <RequestTable
            rows={rows}
            staff
            busyId={busyId}
            onProof={setProofFor}
            onApprove={(r) => decide(r, true)}
            onReject={(r) => decide(r, false)}
          />
        )}
      </div>
      {proofFor && <ProofViewer request={proofFor} onClose={() => setProofFor(null)} />}
    </>
  );
}

export default function OnDuty() {
  const { user } = useAuth();
  return user.role === 'staff' ? <StaffOnDuty /> : <StudentOnDuty />;
}
