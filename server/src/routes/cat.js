import { Router } from 'express';
import { isFaculty, requireStudent } from '../auth.js';
import { CAT_TESTS, CAT_MAX, validateCatMark } from '../academic.js';

const bad = (res, error, status = 400) => res.status(status).json({ error });

/**
 * Continuous assessment (CAT1 to CAT3, out of 50 each).
 * Only the staff member who teaches a subject to a class may enter its marks, and only students see their own marks.
 */
export function catRouter({ store }) {
  const r = Router();

  const catShape = (subject, records) => {
    const row = { subject, marks: {} };
    for (const t of CAT_TESTS) row.marks[`cat${t}`] = records.find((c) => c.cat === t)?.mark ?? null;
    return row;
  };

  // A student's own CAT marks, one row per subject of their class.
  r.get('/me', requireStudent, (req, res) => {
    const subjects = [...new Set(store.slotsFor({ department: req.user.department, year: req.user.year, section: req.user.section }).map((s) => s.subject))];
    const mine = store.catsOf(req.user.id);
    const rows = subjects.map((subject) => catShape(subject, mine.filter((c) => c.subject === subject)));
    res.json({ maxMark: CAT_MAX, tests: CAT_TESTS, data: rows });
  });

  // Subjects this staff member teaches to a class.
  r.get('/subjects', (req, res) => {
    if (!isFaculty(req.user)) return bad(res, 'Only subject staff enter CAT marks', 403);
    const year = Number(req.query.year);
    const section = String(req.query.section || '').toUpperCase();
    if (!Number.isInteger(year) || year < 1 || year > 4 || !/^[A-H]$/.test(section)) return bad(res, 'Choose a year and section');
    return res.json({ data: store.subjectsTaughtBy(req.user.id, req.user.department, year, section) });
  });

  // Marks of one subject for one class, for the subject staff member.
  r.get('/class', (req, res) => {
    if (!isFaculty(req.user)) return bad(res, 'Only subject staff enter CAT marks', 403);
    const year = Number(req.query.year);
    const section = String(req.query.section || '').toUpperCase();
    const subject = String(req.query.subject || '');
    const allowed = store.subjectsTaughtBy(req.user.id, req.user.department, year, section);
    if (!allowed.includes(subject)) return bad(res, 'You do not teach this subject to this class', 403);
    const students = store
      .listAll({ role: 'student', status: 'active', department: req.user.department, year, section, sort: 'rollNumber' })
      .map((st) => ({
        id: st.id, name: st.name, rollNumber: st.rollNumber,
        tests: catShape(subject, store.catsOf(st.id).filter((c) => c.subject === subject)).marks,
      }));
    return res.json({ year, section, subject, tests: CAT_TESTS, maxMark: CAT_MAX, students });
  });

  // Save marks of one CAT test for one subject. marks: [{ studentId, mark }]. A null mark clears it.
  r.put('/', (req, res) => {
    if (!isFaculty(req.user)) return bad(res, 'Only subject staff enter CAT marks', 403);
    const { year, section: rawSection, subject, cat, marks } = req.body || {};
    const y = Number(year);
    const section = String(rawSection || '').toUpperCase();
    if (!Number.isInteger(y) || y < 1 || y > 4 || !/^[A-H]$/.test(section)) return bad(res, 'Choose a year and section');
    if (!CAT_TESTS.includes(Number(cat))) return bad(res, 'Choose CAT1, CAT2 or CAT3');
    if (!store.subjectsTaughtBy(req.user.id, req.user.department, y, section).includes(subject)) {
      return bad(res, 'You do not teach this subject to this class', 403);
    }
    if (!Array.isArray(marks) || marks.length === 0 || marks.length > 500) return bad(res, 'Provide between 1 and 500 marks');

    const classIds = new Set(
      store.listAll({ role: 'student', status: 'active', department: req.user.department, year: y, section }).map((st) => st.id)
    );
    const checked = [];
    for (const m of marks) {
      if (!classIds.has(m?.studentId)) return bad(res, 'One of the marks refers to a student outside this class');
      const v = validateCatMark(m.mark);
      if (!v.ok) return bad(res, `Marks must be between 0 and ${CAT_MAX}`);
      checked.push({ studentId: m.studentId, mark: v.value });
    }
    for (const c of checked) {
      store.setCatMark({ studentId: c.studentId, subject, cat: Number(cat), mark: c.mark, markedBy: req.user.id });
    }
    return res.json({ saved: checked.length });
  });

  return r;
}
