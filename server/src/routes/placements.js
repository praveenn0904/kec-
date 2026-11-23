import { Router } from 'express';
import { requireCoordinator, requireStudent, isFaculty } from '../auth.js';
import { DEPARTMENTS } from '../departments.js';
import { isDate } from '../validate.js';
import { collegeToday, str } from '../util.js';
import { placementsPdf } from '../pdf.js';
import { validateCriteria, checkEligibility } from '../academic.js';

const DEPARTMENT_NAMES = new Set(DEPARTMENTS.map((d) => d.name));
const RESULT_STATUSES = ['in_progress', 'eliminated', 'selected'];

const fail = (res, status, fields, error = 'Please fix the highlighted fields') => res.status(status).json({ error, fields });

/** Department and the coordinator's criteria (10th, 12th, CGPA, arrears) together. */
const eligibilityOf = (store, drive, student) => {
  if (!store.isEligible(drive, student)) return { eligible: false, reasons: ['Your department is not eligible for this drive'] };
  return checkEligibility(drive.criteria, student.academics);
};

function validateDrive(body = {}) {
  const errors = {};
  const company = str(body.company);
  const role = str(body.role);
  const location = str(body.location);
  const description = str(body.description);
  const driveDate = str(body.driveDate);
  const deadline = str(body.deadline);
  const status = str(body.status) || 'open';

  if (company.length < 2 || company.length > 100) errors.company = 'Company name must be 2 to 100 characters';
  if (role.length < 2 || role.length > 100) errors.role = 'Job role must be 2 to 100 characters';
  if (location.length > 100) errors.location = 'Location must be 100 characters or fewer';
  if (description.length > 1000) errors.description = 'Description must be 1000 characters or fewer';
  if (!['open', 'closed'].includes(status)) errors.status = 'Status must be open or closed';

  let ctc = null;
  if (body.ctc !== '' && body.ctc !== null && body.ctc !== undefined) {
    ctc = Number(body.ctc);
    if (!Number.isFinite(ctc) || ctc < 0 || ctc > 500) errors.ctc = 'Package must be a number between 0 and 500 (LPA)';
  }

  if (!isDate(driveDate)) errors.driveDate = 'Choose the drive date';
  if (!isDate(deadline)) errors.deadline = 'Choose the last date to opt in or out';
  else if (isDate(driveDate) && deadline > driveDate) errors.deadline = 'This must be on or before the drive date';

  const rounds = Array.isArray(body.rounds) ? body.rounds.map(str).filter(Boolean) : [];
  if (rounds.length < 1 || rounds.length > 10) errors.rounds = 'Add between 1 and 10 rounds';
  else if (rounds.some((n) => n.length > 60)) errors.rounds = 'Each round name must be 60 characters or fewer';

  const eligible = Array.isArray(body.eligibleDepartments) ? [...new Set(body.eligibleDepartments.map(str))] : [];
  if (eligible.some((d) => !DEPARTMENT_NAMES.has(d))) errors.eligibleDepartments = 'Choose departments from the list';

  // Each company sets its own cut-offs when the drive is created.
  const crit = validateCriteria(body.criteria || {});
  Object.assign(errors, crit.errors);

  return {
    errors,
    value: { company, role, ctc, location, driveDate, deadline, rounds, eligibleDepartments: eligible, criteria: crit.value, description, status },
  };
}

export function placementsRouter({ store }) {
  const r = Router();

  // Department staff have no placement work. Students and the placement coordinator do.
  r.use((req, res, next) => (isFaculty(req.user) ? res.status(403).json({ error: 'Placements are handled by the placement coordinator' }) : next()));

  /** The coordinator sees counts and participants for their own department only; students never use this. */
  const scopeOf = (req) => (req.user.role === 'staff' ? req.user.department : null);
  const inScope = (scope, studentId) => !scope || store.get(studentId)?.department === scope;
  const activeStudents = (scope) => store.listAll({ role: 'student', status: 'active', department: scope || '', sort: 'rollNumber' });

  const isOpen = (drive) => drive.status === 'open' && drive.deadline >= collegeToday();
  const meets = (drive, student) => eligibilityOf(store, drive, student).eligible;

  const baseDrive = (d) => ({
    id: d.id, company: d.company, role: d.role, ctc: d.ctc, location: d.location, driveDate: d.driveDate,
    deadline: d.deadline, rounds: d.rounds, eligibleDepartments: d.eligibleDepartments, criteria: d.criteria || {},
    description: d.description, status: d.status, open: isOpen(d),
  });

  /** A student's own outcome for a drive (never includes anyone else's). */
  const myOutcome = (drive, rec) => {
    if (!rec?.response) return null;
    const out = { response: rec.response, respondedAt: rec.respondedAt };
    if (rec.response === 'opted_in') {
      out.status = rec.status;
      out.eliminatedRound = rec.eliminatedRound;
      out.eliminatedRoundName = rec.eliminatedRound ? drive.rounds[rec.eliminatedRound - 1] : null;
      out.scores = Object.keys(rec.scores || {})
        .map(Number)
        .sort((a, b) => a - b)
        .map((k) => ({ round: k, name: drive.rounds[k - 1], score: rec.scores[k] }));
    }
    return out;
  };

  const studentView = (drive, student) => {
    const rec = store.getResponse(drive.id, student.id);
    const check = eligibilityOf(store, drive, student);
    const eligible = check.eligible;
    const locked = Boolean(rec?.response === 'opted_in' && rec.status !== 'in_progress');
    return {
      ...baseDrive(drive),
      eligible,
      reasons: check.reasons,
      canRespond: eligible && isOpen(drive) && !locked,
      mine: myOutcome(drive, rec),
    };
  };

  const counts = (drive, scope) => {
    const eligible = activeStudents(scope).filter((s) => meets(drive, s));
    const recs = store.responsesFor(drive.id);
    const byStudent = new Map(recs.map((x) => [x.studentId, x]));
    let optedIn = 0;
    let optedOut = 0;
    let selected = 0;
    let eliminated = 0;
    for (const s of eligible) {
      const x = byStudent.get(s.id);
      if (x?.response === 'opted_in') {
        optedIn++;
        if (x.status === 'selected') selected++;
        if (x.status === 'eliminated') eliminated++;
      } else if (x?.response === 'opted_out') optedOut++;
    }
    return { eligible: eligible.length, optedIn, optedOut, noResponse: eligible.length - optedIn - optedOut, selected, eliminated };
  };

  /** Everyone eligible plus anyone who responded, with their response and result. Staff only. */
  const participants = (drive, scope) => {
    const byStudent = new Map(store.responsesFor(drive.id).map((x) => [x.studentId, x]));
    const ids = new Set([...byStudent.keys()].filter((id) => inScope(scope, id)));
    for (const s of activeStudents(scope)) if (store.isEligible(drive, s)) ids.add(s.id);
    return [...ids]
      .map((id) => ({ student: store.get(id), rec: byStudent.get(id) || null }))
      .filter((p) => p.student)
      .sort((a, b) => a.student.rollNumber.localeCompare(b.student.rollNumber, undefined, { numeric: true }));
  };

  const staffParticipant = (drive, { student, rec }) => ({
    studentId: student.id, name: student.name, rollNumber: student.rollNumber, department: student.department,
    year: student.year, response: rec?.response || null, respondedAt: rec?.respondedAt || null,
    status: rec?.response === 'opted_in' ? rec.status : null, eliminatedRound: rec?.eliminatedRound || null,
    scores: rec?.scores || {},
  });

  // ---------------------------------------------------------------- list / report

  r.get('/', (req, res) => {
    if (req.user.role === 'student') {
      return res.json(store.listDrives().map((d) => studentView(d, req.user)));
    }
    const scope = scopeOf(req);
    return res.json(store.listDrives().map((d) => ({ ...baseDrive(d), counts: counts(d, scope) })));
  });

  // The coordinator's report covers only their own department.
  r.get('/report.pdf', requireCoordinator, (req, res) => {
    const driveId = str(req.query.driveId);
    const department = req.user.department;
    let drives = store.listDrives();
    if (driveId) {
      drives = drives.filter((d) => d.id === driveId);
      if (!drives.length) return res.status(404).json({ error: 'Placement drive not found' });
    }
    const sections = drives
      .slice()
      .sort((a, b) => a.driveDate.localeCompare(b.driveDate))
      .map((drive) => ({
        drive,
        counts: counts(drive, department),
        participants: participants(drive, department)
          .filter((p) => p.rec?.response === 'opted_in')
          .map((p) => ({ student: p.student, rec: p.rec })),
      }));
    return placementsPdf(res, { sections, filters: { department } });
  });

  // ----------------------------------------------------------------- manage drives

  r.post('/', requireCoordinator, (req, res) => {
    const { errors, value } = validateDrive(req.body);
    if (Object.keys(errors).length) return fail(res, 400, errors);
    const drive = store.createDrive(value);
    return res.status(201).json({ ...baseDrive(drive), counts: counts(drive, scopeOf(req)) });
  });

  r.put('/:id', requireCoordinator, (req, res) => {
    const drive = store.getDrive(req.params.id);
    if (!drive) return res.status(404).json({ error: 'Placement drive not found' });
    const { errors, value } = validateDrive(req.body);
    // Rounds that already have results cannot be removed.
    const deepest = Math.max(0, ...store.responsesFor(drive.id).flatMap((x) => [x.eliminatedRound || 0, ...Object.keys(x.scores || {}).map(Number)]));
    if (!errors.rounds && value.rounds.length < deepest) {
      errors.rounds = `Results are already recorded up to round ${deepest}, so at least ${deepest} rounds are needed`;
    }
    if (Object.keys(errors).length) return fail(res, 400, errors);
    const updated = store.updateDrive(drive.id, value);
    return res.json({ ...baseDrive(updated), counts: counts(updated, scopeOf(req)) });
  });

  r.delete('/:id', requireCoordinator, (req, res) => {
    if (!store.removeDrive(req.params.id)) return res.status(404).json({ error: 'Placement drive not found' });
    return res.status(204).end();
  });

  r.get('/:id', (req, res) => {
    const drive = store.getDrive(req.params.id);
    if (!drive) return res.status(404).json({ error: 'Placement drive not found' });
    if (req.user.role === 'student') return res.json(studentView(drive, req.user));
    const scope = scopeOf(req);
    return res.json({
      ...baseDrive(drive),
      counts: counts(drive, scope),
      participants: participants(drive, scope).map((p) => staffParticipant(drive, p)),
    });
  });

  // ------------------------------------------------------------ student: opt in / out

  r.post('/:id/respond', requireStudent, (req, res) => {
    const drive = store.getDrive(req.params.id);
    if (!drive) return res.status(404).json({ error: 'Placement drive not found' });
    const response = str(req.body?.response);
    if (!['opted_in', 'opted_out'].includes(response)) return res.status(400).json({ error: 'Choose opt in or opt out' });
    const check = eligibilityOf(store, drive, req.user);
    if (!check.eligible) return res.status(403).json({ error: `You are not eligible for this drive: ${check.reasons.join('; ')}` });
    if (!isOpen(drive)) return res.status(400).json({ error: 'The last date to respond has passed, or this drive is closed' });
    const existing = store.getResponse(drive.id, req.user.id);
    if (existing?.response === 'opted_in' && existing.status !== 'in_progress') {
      return res.status(400).json({ error: 'Your result is already recorded, so your response can no longer be changed' });
    }
    store.saveResponse(drive.id, req.user.id, {
      response,
      respondedAt: new Date().toISOString(),
      ...(response === 'opted_out' ? { status: 'in_progress', eliminatedRound: null, scores: {} } : {}),
    });
    return res.json(studentView(drive, req.user));
  });

  // ------------------------------------------------------------ staff: record results

  r.put('/:id/results/:studentId', requireCoordinator, (req, res) => {
    const drive = store.getDrive(req.params.id);
    if (!drive) return res.status(404).json({ error: 'Placement drive not found' });
    if (!inScope(scopeOf(req), req.params.studentId)) return res.status(404).json({ error: 'Student not found in your department' });
    const rec = store.getResponse(drive.id, req.params.studentId);
    if (rec?.response !== 'opted_in') return res.status(400).json({ error: 'Results can only be recorded for students who opted in' });

    const body = req.body || {};
    const errors = {};
    const status = str(body.status);
    if (!RESULT_STATUSES.includes(status)) errors.status = 'Choose in progress, eliminated or selected';

    let eliminatedRound = null;
    if (status === 'eliminated') {
      eliminatedRound = Number(body.eliminatedRound);
      if (!Number.isInteger(eliminatedRound) || eliminatedRound < 1 || eliminatedRound > drive.rounds.length) {
        errors.eliminatedRound = `Choose a round between 1 and ${drive.rounds.length}`;
      }
    }

    const scores = {};
    const input = body.scores && typeof body.scores === 'object' ? body.scores : {};
    for (const [k, raw] of Object.entries(input)) {
      if (raw === '' || raw === null || raw === undefined) continue;
      const round = Number(k);
      const score = Number(raw);
      if (!Number.isInteger(round) || round < 1 || round > drive.rounds.length) {
        errors.scores = 'A score refers to a round that does not exist';
        break;
      }
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        errors.scores = 'Scores must be between 0 and 100';
        break;
      }
      if (status === 'eliminated' && eliminatedRound && round > eliminatedRound) {
        errors.scores = 'A student eliminated in a round has no scores for later rounds';
        break;
      }
      scores[round] = score;
    }
    if (Object.keys(errors).length) return fail(res, 400, errors);

    const saved = store.saveResponse(drive.id, req.params.studentId, {
      status, eliminatedRound: status === 'eliminated' ? eliminatedRound : null, scores, updatedBy: req.user.id,
    });
    return res.json(staffParticipant(drive, { student: store.get(req.params.studentId), rec: saved }));
  });

  return r;
}
