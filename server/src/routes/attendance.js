import { Router } from 'express';
import { requireFaculty, isFaculty } from '../auth.js';
import { findDepartment, PERIODS } from '../departments.js';
import { ATTENDANCE_STATUSES, isDate, isPeriod, isSection } from '../validate.js';
import { summarize, monthly } from '../attendance.js';
import { collegeToday, str as s } from '../util.js';
import { weekdayOf } from '../academic.js';
import { attendancePdf } from '../pdf.js';

const bad = (res, error, status = 400) => res.status(status).json({ error });

/** Year as a number 1-6, or '' when not given. Returns null when given but invalid. */
const yearOf = (v) => {
  if (v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? String(n) : null;
};
const sectionOf = (v) => {
  const x = s(v).toUpperCase();
  return isSection(x) ? x : '';
};

export function attendanceRouter({ store }) {
  const r = Router();

  /** Shared by the JSON report and the PDF. Returns { error } or { rows, filters }. Always limited to the viewer's department. */
  function buildReport(query, department) {
    const year = yearOf(query.year);
    const section = s(query.section) ? sectionOf(query.section) : '';
    const from = s(query.from);
    const to = s(query.to);
    if (year === null) return { error: 'Choose a valid year' };
    if (s(query.section) && !section) return { error: 'Choose a valid section (A to H)' };
    if ((from && !isDate(from)) || (to && !isDate(to))) return { error: 'Choose valid dates' };

    const byStudent = store.attendanceByStudent({ from, to });
    let rows = store
      .listAll({ role: 'student', status: 'active', department, year, section, sort: 'rollNumber' })
      .map((c) => ({
        id: c.id, name: c.name, rollNumber: c.rollNumber, department: c.department, year: c.year, section: c.section,
        ...summarize(byStudent.get(c.id) || []),
      }));

    let below = null;
    if (s(query.below) !== '') {
      below = Number(query.below);
      if (!Number.isFinite(below)) return { error: 'Invalid threshold' };
      rows = rows.filter((x) => x.percentage !== null && x.percentage < below);
    }
    if (query.sort === 'percentage') rows.sort((a, b) => (a.percentage ?? 101) - (b.percentage ?? 101));
    return { rows, filters: { department, year, section, from, to, below } };
  }

  // Students of one class (year and section) with their mark for one period on one date. Department staff only.
  r.get('/roster', requireFaculty, (req, res) => {
    const date = s(req.query.date);
    const period = Number(req.query.period);
    const year = yearOf(req.query.year);
    const section = sectionOf(req.query.section);
    if (!isDate(date)) return bad(res, 'Choose a valid date');
    if (!isPeriod(period, PERIODS)) return bad(res, `Choose a period between 1 and ${PERIODS}`);
    if (!year) return bad(res, 'Choose a year');
    if (!section) return bad(res, 'Choose a section (A to H)');
    if (s(req.query.department) && s(req.query.department) !== req.user.department) {
      return bad(res, 'You can only mark attendance for your own department', 403);
    }

    const marks = store.attendanceOn(date, period);
    const slot = store.slotAt(req.user.department, Number(year), section, weekdayOf(date), period);
    const students = store
      .listAll({ role: 'student', status: 'active', department: req.user.department, year, section, sort: 'rollNumber' })
      .map((c) => ({
        id: c.id, name: c.name, rollNumber: c.rollNumber, year: c.year, section: c.section,
        status: marks.get(c.id)?.status || null, onDuty: Boolean(marks.get(c.id)?.onDuty),
      }));
    return res.json({
      date, period, year: Number(year), section, department: req.user.department, students,
      slot: slot ? { subject: slot.subject, staffId: slot.staffId, staffName: store.get(slot.staffId)?.name || '' } : null,
      editable: Boolean(slot && slot.staffId === req.user.id),
    });
  });

  // The register for one class and date: students down, periods 1 to 8 across, marked P / A / OD.
  r.get('/grid', requireFaculty, (req, res) => {
    const date = s(req.query.date);
    const year = yearOf(req.query.year);
    const section = sectionOf(req.query.section);
    if (!isDate(date)) return bad(res, 'Choose a valid date');
    if (!year) return bad(res, 'Choose a year');
    if (!section) return bad(res, 'Choose a section (A to H)');
    const dept = req.user.department;
    const day = weekdayOf(date);
    const students = store.listAll({ role: 'student', status: 'active', department: dept, year, section, sort: 'rollNumber' });
    const columns = Array.from({ length: PERIODS }, (_, i) => {
      const period = i + 1;
      const slot = store.slotAt(dept, Number(year), section, day, period);
      return {
        period,
        subject: slot?.subject || null,
        staffName: slot ? store.get(slot.staffId)?.name || '' : '',
        editable: Boolean(slot && slot.staffId === req.user.id),
      };
    });
    const byPeriod = columns.map((_, i) => store.attendanceOn(date, i + 1));
    return res.json({
      date, year: Number(year), section, columns,
      students: students.map((st) => ({
        id: st.id, name: st.name, rollNumber: st.rollNumber,
        cells: byPeriod.map((m) => (m.get(st.id) ? { status: m.get(st.id).status, onDuty: Boolean(m.get(st.id).onDuty) } : null)),
      })),
    });
  });

  // Save (or overwrite) marks for one period on one date. Department staff only.
  r.put('/', requireFaculty, (req, res) => {
    const { date, period, records, year: rawYear, section: rawSection } = req.body || {};
    if (!isDate(date)) return bad(res, 'Choose a valid date');
    if (date > collegeToday()) return bad(res, 'Attendance cannot be marked for a future date');
    if (!isPeriod(period, PERIODS)) return bad(res, `Choose a period between 1 and ${PERIODS}`);
    const year = yearOf(rawYear);
    const section = sectionOf(rawSection);
    if (!year) return bad(res, 'Choose a year');
    if (!section) return bad(res, 'Choose a section (A to H)');
    // Only the staff member who teaches this period in this class may mark it.
    const slot = store.slotAt(req.user.department, Number(year), section, weekdayOf(date), period);
    if (!slot) return bad(res, 'No class is timetabled for this period', 400);
    if (slot.staffId !== req.user.id) return bad(res, 'Only the staff member who teaches this period can mark its attendance', 403);
    if (!Array.isArray(records) || records.length === 0 || records.length > 500) {
      return bad(res, 'Provide between 1 and 500 attendance records');
    }
    for (const rec of records) {
      const student = store.get(rec?.studentId);
      if (!student || student.role !== 'student' || student.department !== req.user.department || student.year !== Number(year) || student.section !== section) {
        return bad(res, 'One of the records refers to a student outside this class');
      }
      if (!ATTENDANCE_STATUSES.includes(rec.status)) return bad(res, 'Status must be present, absent or od');
    }
    const saved = store.upsertAttendance(date, period, records.map(({ studentId, status }) => ({ studentId, status })), req.user.id);
    return res.json({ saved });
  });

  // Per-student totals and percentages for the department. Department staff only.
  r.get('/report', requireFaculty, (req, res) => {
    const out = buildReport(req.query, req.user.department);
    if (out.error) return bad(res, out.error);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 500));
    return res.json({ data: out.rows.slice(0, limit), meta: { total: out.rows.length, periodsPerDay: PERIODS } });
  });

  r.get('/report.pdf', requireFaculty, (req, res) => {
    const out = buildReport({ ...req.query, sort: '' }, req.user.department);
    if (out.error) return bad(res, out.error);
    out.rows.sort((a, b) => a.year - b.year || a.section.localeCompare(b.section) || a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }));
    out.filters.department = findDepartment(req.user.department)?.name || req.user.department;
    return attendancePdf(res, out);
  });

  // One student's attendance. Department staff can open their department's students; a student only themselves.
  r.get('/students/:id', (req, res) => {
    const student = store.get(req.params.id);
    if (!student || student.role !== 'student') return bad(res, 'Student not found', 404);
    const allowed = req.user.role === 'student' ? req.user.id === student.id : isFaculty(req.user) && student.department === req.user.department;
    if (!allowed) return bad(res, 'You do not have access to this student’s attendance', 403);
    const records = store.attendanceFor(student.id);
    return res.json({
      student: {
        id: student.id, name: student.name, rollNumber: student.rollNumber,
        department: student.department, year: student.year, section: student.section,
      },
      periodsPerDay: PERIODS,
      summary: summarize(records),
      monthly: monthly(records),
      records: records.slice(0, PERIODS * 40).map(({ date, period, status, onDuty }) => ({ date, period, status, onDuty: Boolean(onDuty) })),
    });
  });

  return r;
}
