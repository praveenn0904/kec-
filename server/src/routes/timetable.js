import { Router } from 'express';
import { requireManager, isAdmin, canManagePeople } from '../auth.js';
import { findDepartment } from '../departments.js';
import { validateSlot, TEACHING_DAYS, DAY_NAMES, weekdayOf } from '../academic.js';

const bad = (res, error, status = 400, fields) => res.status(status).json(fields ? { error, fields } : { error });
const SECTION_LIST = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export function timetableRouter({ store }) {
  const r = Router();

  const staffOf = (id) => store.get(id);
  const teachesHere = (staff, dept) => staff && staff.role === 'staff' && staff.staffRole !== 'placement' && staff.status === 'active' && staff.department === dept;

  /** The class timetable: 6 teaching days by 8 periods, each cell a subject and its staff member. Everyone with a login can read it. */
  r.get('/', (req, res) => {
    let department = req.user.department;
    let year = req.query.year;
    let section = String(req.query.section || '').toUpperCase();
    if (req.user.role === 'student') {
      year = req.user.year;
      section = req.user.section;
    } else if (isAdmin(req.user)) {
      department = String(req.query.department || '');
      if (!findDepartment(department)) return bad(res, 'Choose a department');
    }
    if (!Number.isInteger(Number(year)) || Number(year) < 1 || Number(year) > 4) return bad(res, 'Choose a year');
    if (!SECTION_LIST.includes(section)) return bad(res, 'Choose a section (A to H)');

    const slots = store.slotsFor({ department, year: Number(year), section });
    const days = TEACHING_DAYS.map((day) => ({
      day,
      name: DAY_NAMES[day],
      periods: Array.from({ length: 8 }, (_, i) => {
        const s = slots.find((x) => x.day === day && x.period === i + 1);
        if (!s) return { period: i + 1, slot: null };
        const staff = staffOf(s.staffId);
        return {
          period: i + 1,
          slot: { id: s.id, subject: s.subject, staffId: s.staffId, staffName: staff?.name || 'Unassigned', designation: staff?.designation || '' },
        };
      }),
    }));
    return res.json({
      department, year: Number(year), section,
      canEdit: canManagePeople(req.user),
      days,
    });
  });

  /** Department staff available to teach in a department (used to fill the timetable). */
  r.get('/staff', requireManager, (req, res) => {
    const department = isAdmin(req.user) ? String(req.query.department || '') : req.user.department;
    if (!findDepartment(department)) return bad(res, 'Choose a department');
    const list = store
      .listAll({ role: 'staff', department, status: 'active' })
      .filter((c) => c.staffRole !== 'placement')
      .map((c) => ({ id: c.id, name: c.name, designation: c.designation || '' }));
    return res.json({ data: list });
  });

  /** Sets the subject and staff member for one class, day and period. Replaces an existing slot. */
  r.put('/', requireManager, (req, res) => {
    const { errors, value } = validateSlot(req.body);
    const department = isAdmin(req.user) ? String(req.body?.department || '') : req.user.department;
    if (!findDepartment(department)) errors.department = 'Choose a department';
    const staff = staffOf(value.staffId);
    if (!teachesHere(staff, department)) errors.staffId = 'Choose an active department staff member of this department';
    if (Object.keys(errors).length) return bad(res, 'Please fix the highlighted fields', 400, errors);
    const slot = store.upsertSlot({ ...value, department });
    return res.json({ slot });
  });

  r.delete('/:id', requireManager, (req, res) => {
    const slot = store.getSlot(req.params.id);
    if (!slot || (!isAdmin(req.user) && slot.department !== req.user.department)) return bad(res, 'Slot not found', 404);
    store.removeSlot(slot.id);
    return res.status(204).end();
  });

  return r;
}
