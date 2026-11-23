import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth, kindOf } from '../auth.jsx';
import { fmtDay, saveBlob } from '../utils.js';
import Icon from '../components/icons.jsx';
import { Modal, PageHeader, Spinner, useToast } from '../components/ui.jsx';
import DriveForm from '../components/DriveForm.jsx';
import DriveManage from '../components/DriveManage.jsx';

const ctcText = (d) => (d.ctc ? `₹${d.ctc} LPA` : 'Package not stated');

function eligibleText(d) {
  if (!d.eligibleDepartments.length) return 'All departments';
  const names = d.eligibleDepartments;
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

// ------------------------------------------------------------------ student

/** The student's own outcome for one drive: which round they stopped at and how they scored. */
function MyResult({ drive }) {
  const mine = drive.mine;
  if (mine?.response !== 'opted_in') return null;
  const elim = mine.eliminatedRound;

  return (
    <div className="my-result">
      {mine.status === 'selected' && <p className="result-line result-good">Selected. Congratulations!</p>}
      {mine.status === 'eliminated' && (
        <p className="result-line result-bad">Eliminated in Round {elim}: {mine.eliminatedRoundName}</p>
      )}
      {mine.status === 'in_progress' && (
        <p className="result-line result-wait">{drive.open ? 'You are opted in. Results will appear here.' : 'Awaiting results'}</p>
      )}
      <ol className="round-results">
        {drive.rounds.map((name, i) => {
          const n = i + 1;
          const sc = mine.scores.find((x) => x.round === n);
          const after = mine.status === 'eliminated' && n > elim;
          const outcome = after ? '' : mine.status === 'eliminated' && n === elim ? 'Eliminated' : sc || mine.status === 'selected' ? (mine.status === 'in_progress' ? 'Scored' : 'Cleared') : 'Pending';
          return (
            <li key={name + i} className={after ? 'dim' : ''}>
              <span className="round-no">{n}</span>
              <span className="round-name">{name}</span>
              <span className="round-score">{sc ? `${sc.score}/100` : after ? 'Not reached' : '-'}</span>
              <span className={`round-outcome outcome-${outcome.toLowerCase() || 'none'}`}>{outcome}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StudentDriveCard({ drive, busy, onRespond }) {
  const mine = drive.mine;
  const locked = mine?.status === 'selected' || mine?.status === 'eliminated';
  let note = '';
  if (!drive.eligible) note = drive.reasons?.length ? `Not eligible: ${drive.reasons.join('; ')}.` : 'Your department is not eligible for this drive.';
  else if (locked) note = 'Your result is recorded, so your response is final.';
  else if (!drive.canRespond) note = drive.status === 'closed' ? 'This drive is closed.' : 'The last date to respond has passed.';

  return (
    <article className="card drive-card">
      <header>
        <div>
          <h3>{drive.company}</h3>
          <p className="muted">{drive.role}</p>
        </div>
        <span className="ctc">{ctcText(drive)}</span>
      </header>

      <dl className="drive-info">
        {drive.location && <div><dt>Location</dt><dd>{drive.location}</dd></div>}
        <div><dt>Drive date</dt><dd>{fmtDay(drive.driveDate)}</dd></div>
        <div><dt>Respond by</dt><dd>{fmtDay(drive.deadline)}</dd></div>
        <div><dt>Eligible</dt><dd>{eligibleText(drive)}</dd></div>
      </dl>
      {drive.description && <p className="drive-desc">{drive.description}</p>}

      <ol className="round-pills">{drive.rounds.map((r, i) => <li key={r + i}><b>{i + 1}</b> {r}</li>)}</ol>

      <div className="drive-actions">
        {mine?.response && (
          <span className={`chip chip-${mine.response === 'opted_in' ? 'present' : 'none'}`}>
            {mine.response === 'opted_in' ? 'You opted in' : 'You opted out'}
          </span>
        )}
        {drive.canRespond && (
          <>
            <button type="button" className="btn btn-small btn-primary" disabled={busy || mine?.response === 'opted_in'} onClick={() => onRespond(drive, 'opted_in')}>Opt in</button>
            <button type="button" className="btn btn-small" disabled={busy || mine?.response === 'opted_out'} onClick={() => onRespond(drive, 'opted_out')}>Opt out</button>
          </>
        )}
      </div>
      {note && <p className="muted small">{note}</p>}
      <MyResult drive={drive} />
    </article>
  );
}

const STUDENT_TABS = [
  ['all', 'All drives'],
  ['open', 'Open'],
  ['in', 'Opted in'],
  ['closed', 'Closed'],
];

function StudentPlacements() {
  const toast = useToast();
  const [drives, setDrives] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    api.placements().then(setDrives).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const respond = async (drive, response) => {
    setBusyId(drive.id);
    try {
      const updated = await api.respondPlacement(drive.id, response);
      setDrives((list) => list.map((d) => (d.id === drive.id ? updated : d)));
      toast(response === 'opted_in' ? `You opted in to ${drive.company}` : `You opted out of ${drive.company}`);
    } catch (e) {
      toast(e.message, 'error');
      load();
    } finally {
      setBusyId(null);
    }
  };

  const summary = useMemo(() => {
    const list = drives || [];
    return {
      open: list.filter((d) => d.canRespond).length,
      optedIn: list.filter((d) => d.mine?.response === 'opted_in').length,
      selected: list.filter((d) => d.mine?.status === 'selected').length,
    };
  }, [drives]);

  const shown = (drives || []).filter((d) =>
    tab === 'open' ? d.open : tab === 'in' ? d.mine?.response === 'opted_in' : tab === 'closed' ? !d.open : true
  );

  return (
    <>
      <PageHeader title="Placements" subtitle="Companies visiting the campus. Opt in or out, and follow your result round by round." />

      <div className="stat-grid stat-grid-3">
        <div className="card stat stat-primary"><span className="stat-label">Drives awaiting your response</span><strong className="stat-value">{drives ? summary.open : '–'}</strong></div>
        <div className="card stat stat-student"><span className="stat-label">Drives you opted in to</span><strong className="stat-value">{drives ? summary.optedIn : '–'}</strong></div>
        <div className="card stat stat-good"><span className="stat-label">Offers (selected)</span><strong className="stat-value">{drives ? summary.selected : '–'}</strong></div>
      </div>

      <div className="card toolbar">
        <div className="segmented" role="tablist" aria-label="Filter drives">
          {STUDENT_TABS.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>
          ))}
        </div>
      </div>

      {error && <div className="banner banner-error" role="alert">{error}</div>}
      {!drives && !error && <Spinner label="Loading drives…" />}
      {drives && shown.length === 0 && <div className="card empty"><p>No drives in this list.</p></div>}
      <div className="drive-grid">
        {shown.map((d) => <StudentDriveCard key={d.id} drive={d} busy={busyId === d.id} onRespond={respond} />)}
      </div>
    </>
  );
}

// -------------------------------------------------------------------- staff

function StaffPlacements() {
  const toast = useToast();
  const [drives, setDrives] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // { type: 'new' | 'edit' | 'manage' | 'delete', drive? }

  const load = useCallback(() => {
    api.placements().then(setDrives).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const close = () => setModal(null);

  const save = async (values) => {
    if (modal.type === 'edit') await api.updatePlacement(modal.drive.id, values);
    else await api.createPlacement(values);
    toast(modal.type === 'edit' ? 'Drive updated' : 'Drive created');
    close();
    load();
  };

  const remove = async () => {
    try {
      await api.deletePlacement(modal.drive.id);
      toast('Drive deleted');
    } catch (e) {
      toast(e.message, 'error');
    }
    close();
    load();
  };

  const downloadPdf = async () => {
    try {
      saveBlob((await api.placementsPdf({})).blob, 'placement-report.pdf');
      toast('Placement report downloaded');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const openCount = drives?.filter((d) => d.open).length ?? 0;
  const selected = drives?.reduce((n, d) => n + d.counts.selected, 0) ?? 0;

  return (
    <>
      <PageHeader title="Placements" subtitle="Manage campus drives, see who opted in, and record each student's result by round.">
        <button type="button" className="btn" onClick={downloadPdf} disabled={!drives?.length}><Icon name="file" /> Download PDF report</button>
        <button type="button" className="btn btn-primary" onClick={() => setModal({ type: 'new' })}><Icon name="plus" /> New drive</button>
      </PageHeader>

      <div className="stat-grid stat-grid-3">
        <div className="card stat stat-primary"><span className="stat-label">Drives</span><strong className="stat-value">{drives?.length ?? '–'}</strong></div>
        <div className="card stat stat-student"><span className="stat-label">Open for opt in / out</span><strong className="stat-value">{drives ? openCount : '–'}</strong></div>
        <div className="card stat stat-good"><span className="stat-label">Selections recorded</span><strong className="stat-value">{drives ? selected : '–'}</strong></div>
      </div>

      {error && <div className="banner banner-error" role="alert">{error}</div>}
      <div className="card table-card">
        {!drives ? <Spinner /> : drives.length === 0 ? (
          <div className="empty"><p>No placement drives yet.</p><button type="button" className="btn btn-primary" onClick={() => setModal({ type: 'new' })}>Create the first drive</button></div>
        ) : (
          <div className="table-wrap">
            <table className="table table-hover">
              <thead>
                <tr><th>Company</th><th>Drive date</th><th>Respond by</th><th>Eligible</th><th>Opted in</th><th>Opted out</th><th>No response</th><th>Selected</th><th>Status</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {drives.map((d) => (
                  <tr key={d.id} onClick={() => setModal({ type: 'manage', drive: d })}>
                    <td><strong>{d.company}</strong><small className="block">{d.role} · {ctcText(d)}</small></td>
                    <td className="nowrap">{fmtDay(d.driveDate)}</td>
                    <td className="nowrap">{fmtDay(d.deadline)}</td>
                    <td>{d.counts.eligible}</td>
                    <td>{d.counts.optedIn}</td>
                    <td>{d.counts.optedOut}</td>
                    <td>{d.counts.noResponse}</td>
                    <td className="t-good"><strong>{d.counts.selected}</strong></td>
                    <td><span className={`chip chip-${d.open ? 'present' : 'none'}`}>{d.open ? 'Open' : 'Closed'}</span></td>
                    <td className="nowrap actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn btn-small btn-primary" onClick={() => setModal({ type: 'manage', drive: d })}>Manage</button>
                      <button type="button" className="btn btn-small" onClick={() => setModal({ type: 'edit', drive: d })}>Edit</button>
                      <button type="button" className="btn btn-small btn-danger" onClick={() => setModal({ type: 'delete', drive: d })}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(modal?.type === 'new' || modal?.type === 'edit') && (
        <Modal title={modal.type === 'new' ? 'New placement drive' : 'Edit placement drive'} onClose={close} wide>
          <DriveForm initial={modal.drive} onSubmit={save} onCancel={close} />
        </Modal>
      )}
      {modal?.type === 'manage' && <DriveManage driveId={modal.drive.id} onClose={close} onChanged={load} />}
      {modal?.type === 'delete' && (
        <Modal title="Delete this drive?" onClose={close}>
          <p>
            This removes <strong>{modal.drive.company}</strong> together with every opt-in, opt-out and result recorded for it. This cannot be undone.
          </p>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
            <button type="button" className="btn btn-danger-solid" onClick={remove}>Delete</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export default function Placements() {
  const { user } = useAuth();
  return kindOf(user) === 'placement' ? <StaffPlacements /> : <StudentPlacements />;
}
