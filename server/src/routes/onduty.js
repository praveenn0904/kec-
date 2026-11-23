import { Router } from 'express';
import fs from 'node:fs';
import { requireFaculty, requireStudent, isFaculty, isPlacementCoordinator } from '../auth.js';
import { isDate } from '../validate.js';
import { addDays, collegeToday, dateRange, isWeekday, str } from '../util.js';

const MAX_PROOF_BYTES = 2 * 1024 * 1024;

/** Identifies the real file type from its first bytes instead of trusting the name or declared type. */
function sniff(buf) {
  if (buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return { ext: 'pdf', type: 'application/pdf' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', type: 'image/png' };
  }
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  return null;
}

function decodeProof(proof) {
  if (!proof || typeof proof.data !== 'string' || !proof.data) return { error: 'Attach a proof file (PNG, JPG or PDF)' };
  const match = proof.data.match(/^data:[^;,]+;base64,([\s\S]*)$/);
  const buf = Buffer.from(match ? match[1] : proof.data, 'base64');
  if (!buf.length) return { error: 'The proof file is empty' };
  if (buf.length > MAX_PROOF_BYTES) return { error: 'The proof file must be 2 MB or smaller' };
  const kind = sniff(buf);
  if (!kind) return { error: 'Proof must be a PNG, JPG or PDF file' };
  const name = str(proof.name).replace(/[^\w.\- ()]/g, '_').slice(0, 80) || `proof.${kind.ext}`;
  return { buf, kind, name };
}

export function onDutyRouter({ store }) {
  const r = Router();

  const view = (req) => {
    const s = store.get(req.studentId);
    const decider = req.decidedBy ? store.get(req.decidedBy) : null;
    return {
      id: req.id,
      studentId: req.studentId,
      studentName: s?.name || 'Former student',
      rollNumber: s?.rollNumber || '',
      department: s?.department || '',
      year: s?.year ?? null,
      reason: req.reason,
      place: req.place,
      fromDate: req.fromDate,
      toDate: req.toDate,
      days: req.days,
      workingDays: req.dates.length,
      hasProof: Boolean(req.proofFile),
      proofName: req.proofName || null,
      status: req.status,
      createdAt: req.createdAt,
      decidedAt: req.decidedAt || null,
      decidedByName: decider?.name || null,
    };
  };

  r.get('/', (req, res) => {
    if (isPlacementCoordinator(req.user)) return res.status(403).json({ error: 'On-duty requests are handled by department staff' });
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : '';
    // Department staff see only their own department's requests.
    const base = isFaculty(req.user)
      ? { department: req.user.department, q: str(req.query.q) }
      : { studentId: req.user.id };
    const all = store.listOnDuty(base);
    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const x of all) counts[x.status]++;
    res.json({ data: (status ? all.filter((x) => x.status === status) : all).map(view), counts });
  });

  // Students apply. The proof arrives as base64 inside the JSON body.
  r.post('/', requireStudent, (req, res) => {
    const body = req.body || {};
    const errors = {};
    const reason = str(body.reason);
    const place = str(body.place);
    const fromDate = str(body.fromDate);
    const days = Number(body.days);
    const today = collegeToday();

    if (reason.length < 5) errors.reason = 'Please give a reason (at least 5 characters)';
    else if (reason.length > 300) errors.reason = 'Reason must be 300 characters or fewer';
    if (place.length < 2) errors.place = 'Please say where you are going';
    else if (place.length > 150) errors.place = 'Place must be 150 characters or fewer';
    if (!isDate(fromDate)) errors.fromDate = 'Choose the first day';
    else if (fromDate < addDays(today, -30) || fromDate > addDays(today, 90)) {
      errors.fromDate = 'The start date must be within the last 30 days or the next 90 days';
    }
    if (!Number.isInteger(days) || days < 1 || days > 30) errors.days = 'Number of days must be between 1 and 30';

    const proof = decodeProof(body.proof);
    if (proof.error) errors.proof = proof.error;

    let dates = [];
    let toDate = fromDate;
    if (!errors.fromDate && !errors.days) {
      const range = dateRange(fromDate, days);
      toDate = range[range.length - 1];
      dates = range.filter(isWeekday);
      if (!dates.length) errors.fromDate = 'The selected days fall on a weekend, so no attendance is affected';
      // Overlap with a request that is still pending or already approved.
      const clash = store
        .listOnDuty({ studentId: req.user.id })
        .some((x) => x.status !== 'rejected' && x.fromDate <= toDate && fromDate <= x.toDate);
      if (clash) errors.fromDate = 'You already have an on-duty request covering some of these dates';
    }

    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    }

    const proofFile = store.saveProof(proof.buf, proof.kind.ext);
    const created = store.createOnDuty({
      studentId: req.user.id, reason, place, fromDate, days, toDate, dates,
      proofFile, proofName: proof.name, proofType: proof.kind.type,
    });
    return res.status(201).json(view(created));
  });

  // Staff only approve or reject. Approval turns the covered days into "present" in the register.
  const decide = (status) => (req, res) => {
    const existing = store.getOnDuty(req.params.id);
    if (!existing || store.get(existing.studentId)?.department !== req.user.department) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (existing.status !== 'pending') return res.status(409).json({ error: `This request was already ${existing.status}` });
    return res.json(view(store.decideOnDuty(existing.id, status, req.user.id)));
  };
  r.post('/:id/approve', requireFaculty, decide('approved'));
  r.post('/:id/reject', requireFaculty, decide('rejected'));

  // A student may withdraw a request that has not been decided yet.
  r.delete('/:id', requireStudent, (req, res) => {
    const existing = store.getOnDuty(req.params.id);
    if (!existing || existing.studentId !== req.user.id) return res.status(404).json({ error: 'Request not found' });
    if (existing.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be withdrawn' });
    store.removeOnDuty(existing.id);
    return res.status(204).end();
  });

  r.get('/:id/proof', (req, res) => {
    const existing = store.getOnDuty(req.params.id);
    const allowed = req.user.role === 'student'
      ? existing?.studentId === req.user.id
      : isFaculty(req.user) && store.get(existing?.studentId)?.department === req.user.department;
    if (!existing || !allowed) return res.status(404).json({ error: 'Request not found' });
    if (!existing.proofFile || !fs.existsSync(store.proofPath(existing.proofFile))) {
      return res.status(404).json({ error: 'No proof was attached to this request' });
    }
    res.setHeader('Content-Type', existing.proofType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${(existing.proofName || 'proof').replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return fs.createReadStream(store.proofPath(existing.proofFile)).pipe(res);
  });

  return r;
}
