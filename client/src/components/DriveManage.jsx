import { Fragment, useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDay, saveBlob } from '../utils.js';
import Icon from './icons.jsx';
import { Field, Modal, Spinner, useToast } from './ui.jsx';

const RESPONSE_LABEL = { opted_in: 'Opted in', opted_out: 'Opted out' };

export function resultLabel(drive, p) {
  if (p.response !== 'opted_in') return '';
  if (p.status === 'selected') return 'Selected';
  if (p.status === 'eliminated') return `Eliminated in Round ${p.eliminatedRound}: ${drive.rounds[p.eliminatedRound - 1] || ''}`;
  return 'In progress';
}

const resultTone = (p) => (p.status === 'selected' ? 'present' : p.status === 'eliminated' ? 'absent' : 'none');

function ResultEditor({ drive, p, onSaved, onCancel }) {
  const toast = useToast();
  const [status, setStatus] = useState(p.status || 'in_progress');
  const [round, setRound] = useState(p.eliminatedRound ? String(p.eliminatedRound) : '');
  const [scores, setScores] = useState(() => Object.fromEntries(Object.entries(p.scores || {}).map(([k, v]) => [k, String(v)])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // A student eliminated in round N only has scores up to round N.
  const scoredRounds = status === 'eliminated' ? Number(round) || 0 : drive.rounds.length;

  const save = async () => {
    setBusy(true);
    setError('');
    const payload = {};
    for (let i = 1; i <= scoredRounds; i++) payload[i] = scores[i] ?? '';
    try {
      await api.saveResult(drive.id, p.studentId, { status, eliminatedRound: status === 'eliminated' ? Number(round) : null, scores: payload });
      toast(`Result saved for ${p.name}`);
      onSaved();
    } catch (e) {
      setError(e.fields ? Object.values(e.fields).join(' ') : e.message);
      setBusy(false);
    }
  };

  return (
    <div className="result-editor">
      <div className="grid">
        <Field label="Result">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="in_progress">In progress</option>
            <option value="eliminated">Eliminated</option>
            <option value="selected">Selected</option>
          </select>
        </Field>
        {status === 'eliminated' && (
          <Field label="Eliminated in round">
            <select value={round} onChange={(e) => setRound(e.target.value)}>
              <option value="">Choose round…</option>
              {drive.rounds.map((name, i) => <option key={name + i} value={i + 1}>Round {i + 1}: {name}</option>)}
            </select>
          </Field>
        )}
      </div>
      {scoredRounds > 0 && (
        <div className="score-grid">
          {drive.rounds.slice(0, scoredRounds).map((name, i) => (
            <Field key={name + i} label={`Round ${i + 1} score (0-100)`} hint={name}>
              <input type="number" min="0" max="100" value={scores[i + 1] ?? ''} onChange={(e) => setScores((s) => ({ ...s, [i + 1]: e.target.value }))} />
            </Field>
          ))}
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost btn-small" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-primary btn-small" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save result'}</button>
      </div>
    </div>
  );
}

/** Staff view of one drive: who opted in or out, and the round-wise result of each student. */
export default function DriveManage({ driveId, onClose, onChanged }) {
  const toast = useToast();
  const [drive, setDrive] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('opted_in');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      setDrive(await api.placement(driveId));
    } catch (e) {
      setError(e.message);
    }
  }, [driveId]);
  useEffect(() => { load(); }, [load]);

  const saved = () => {
    setEditing(null);
    load();
    onChanged?.();
  };

  const downloadPdf = async () => {
    try {
      saveBlob((await api.placementsPdf({ driveId })).blob, `placement-${drive.company.replace(/\W+/g, '-').toLowerCase()}.pdf`);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (error) return <Modal title="Placement drive" onClose={onClose}><p className="form-error">{error}</p></Modal>;
  if (!drive) return <Modal title="Placement drive" onClose={onClose}><Spinner /></Modal>;

  const c = drive.counts;
  const tabs = [
    ['opted_in', `Opted in (${c.optedIn})`],
    ['opted_out', `Opted out (${c.optedOut})`],
    ['none', `No response (${c.noResponse})`],
    ['all', `Everyone (${drive.participants.length})`],
  ];
  const rows = drive.participants.filter((p) => (tab === 'all' ? true : tab === 'none' ? !p.response : p.response === tab));

  return (
    <Modal title={`${drive.company}: ${drive.role}`} onClose={onClose} xl>
      <div className="drive-meta">
        <span>{drive.ctc ? `₹${drive.ctc} LPA` : 'Package not stated'}</span>
        {drive.location && <span>{drive.location}</span>}
        <span>Drive: {fmtDay(drive.driveDate)}</span>
        <span>Respond by: {fmtDay(drive.deadline)}</span>
        <span className={`chip chip-${drive.open ? 'present' : 'none'}`}>{drive.open ? 'Open' : 'Closed'}</span>
      </div>
      <ol className="round-pills">{drive.rounds.map((r, i) => <li key={r + i}><b>{i + 1}</b> {r}</li>)}</ol>
      <div className="drive-counts">
        <div><strong>{c.eligible}</strong><span>Eligible</span></div>
        <div><strong>{c.optedIn}</strong><span>Opted in</span></div>
        <div><strong>{c.optedOut}</strong><span>Opted out</span></div>
        <div><strong>{c.noResponse}</strong><span>No response</span></div>
        <div><strong className="t-bad">{c.eliminated}</strong><span>Eliminated</span></div>
        <div><strong className="t-good">{c.selected}</strong><span>Selected</span></div>
      </div>

      <div className="toolbar toolbar-flat">
        <div className="segmented" role="tablist" aria-label="Participants">
          {tabs.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} onClick={() => { setTab(value); setEditing(null); }}>{label}</button>
          ))}
        </div>
        <button type="button" className="btn" onClick={downloadPdf}><Icon name="file" /> Download PDF</button>
      </div>

      {rows.length === 0 ? (
        <div className="empty"><p>No students in this list.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Roll no</th><th>Name</th><th>Department</th><th>Response</th><th>Result</th><th>Round scores</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <Fragment key={p.studentId}>
                  <tr>
                    <td>{p.rollNumber}</td>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.department}</td>
                    <td>{p.response ? <span className={`chip chip-${p.response === 'opted_in' ? 'present' : 'none'}`}>{RESPONSE_LABEL[p.response]}</span> : <span className="muted">No response</span>}</td>
                    <td>{p.response === 'opted_in' ? <span className={`chip chip-${resultTone(p)}`}>{resultLabel(drive, p)}</span> : ''}</td>
                    <td className="nowrap">
                      {Object.keys(p.scores).length
                        ? Object.keys(p.scores).sort((a, b) => a - b).map((k) => `R${k}: ${p.scores[k]}`).join('  ')
                        : p.response === 'opted_in' ? <span className="muted">-</span> : ''}
                    </td>
                    <td className="nowrap actions">
                      {p.response === 'opted_in' && (
                        <button type="button" className="btn btn-small" onClick={() => setEditing(editing === p.studentId ? null : p.studentId)}>
                          {editing === p.studentId ? 'Close' : 'Update result'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {editing === p.studentId && (
                    <tr className="editor-row">
                      <td colSpan={7}><ResultEditor drive={drive} p={p} onSaved={saved} onCancel={() => setEditing(null)} /></td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
