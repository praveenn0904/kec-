import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireFaculty, requireManager, isFaculty, isAdmin, canManagePeople, isPlacementCoordinator } from '../auth.js';
import { validateAcademics } from '../academic.js';
import { validateContact, validatePassword, ROLES, STATUSES, isSection } from '../validate.js';
import { viewFor, publicContact, DUPLICATE_MESSAGES } from '../views.js';

const SORTS = ['name', 'department', 'createdAt', 'year', 'rollNumber', 'employeeId'];
// A student may edit these on their own record. Email, roll number, section, department and status are college-managed.
const STUDENT_EDITABLE = ['name', 'phone', 'course', 'year', 'address', 'guardianName', 'guardianPhone'];
// Department staff may edit these on their own record. Email (login), employee ID, department and role are locked.
const STAFF_SELF_EDITABLE = ['name', 'phone', 'address', 'notes', 'designation', 'officeLocation'];

const s = (v) => (typeof v === 'string' ? v : '');
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj && k in obj).map((k) => [k, obj[k]]));
const fail = (res, status, fields, error = 'Please fix the highlighted fields') => res.status(status).json({ error, fields });

const csvCell = (v) => {
  const t = v === undefined || v === null ? '' : String(v);
  const safe = /^[=+\-@]/.test(t) ? `'${t}` : t; // neutralise spreadsheet formula injection
  return `"${safe.replace(/"/g, '""')}"`;
};

function parseFilters(q) {
  return {
    q: s(q.q).trim(),
    role: ROLES.includes(q.role) ? q.role : '',
    department: s(q.department),
    status: STATUSES.includes(q.status) ? q.status : '',
    year: s(q.year),
    section: isSection(s(q.section).toUpperCase()) ? s(q.section).toUpperCase() : '',
    sort: SORTS.includes(q.sort) ? q.sort : 'name',
    order: q.order === 'desc' ? 'desc' : 'asc',
  };
}

export function contactsRouter({ store }) {
  const r = Router();

  r.get('/', (req, res) => {
    if (isPlacementCoordinator(req.user)) return res.status(403).json({ error: 'The placement coordinator works in Placements' });
    const filters = parseFilters(req.query);
    if (req.user.role === 'student') {
      // Students only see active staff (their own department's staff first would need a separate list).
      Object.assign(filters, { role: 'staff', status: 'active', year: '', section: '' });
    } else if (req.user.role === 'staff') {
      // Department staff only ever see their own department. The administrator sees every department.
      filters.department = req.user.department;
    }
    const { data, meta } = store.list({ ...filters, page: req.query.page, limit: req.query.limit });
    res.json({ data: data.map((c) => viewFor(req.user, c)).filter(Boolean), meta });
  });

  r.get('/export.csv', requireFaculty, (req, res) => {
    const filters = { ...parseFilters(req.query), department: req.user.department };
    const items = store.listAll(filters);
    const cols = [
      'role', 'name', 'email', 'phone', 'department', 'status',
      'rollNumber', 'course', 'year', 'section', 'employeeId', 'designation', 'officeLocation', 'address',
    ];
    const lines = [cols.join(',')];
    for (const c of items) lines.push(cols.map((k) => csvCell(c[k])).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="college-contacts.csv"');
    res.send(lines.join('\n'));
  });

  r.get('/:id', (req, res) => {
    const contact = store.get(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    const view = viewFor(req.user, contact);
    if (!view) return res.status(403).json({ error: 'You do not have access to this contact' });
    return res.json(view);
  });

  r.post('/', requireManager, async (req, res) => {
    const { errors, value } = validateContact(req.body);
    if (!isAdmin(req.user) && value.department !== req.user.department) errors.department = 'You can only add people to your own department';
    if (value.role === 'student') {
      const a = validateAcademics(req.body.academics || {});
      Object.assign(errors, a.errors);
      value.academics = a.value;
    }
    const pwError = validatePassword(req.body?.password);
    if (pwError) errors.password = pwError;
    if (Object.keys(errors).length) return fail(res, 400, errors);

    const dup = store.findDuplicate(value);
    if (dup) return fail(res, 409, { [dup.field]: DUPLICATE_MESSAGES[dup.field] }, 'Duplicate contact');

    const created = store.create({
      ...value,
      passwordHash: await bcrypt.hash(req.body.password, 10),
      passwordChangedAt: new Date().toISOString(),
    });
    return res.status(201).json(viewFor(req.user, created));
  });

  r.put('/:id', async (req, res) => {
    const existing = store.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Contact not found' });

    const faculty = canManagePeople(req.user);
    const isSelf = existing.id === req.user.id;
    if (!isSelf && !faculty) return res.status(403).json({ error: 'You can only edit your own details' });
    if (!isSelf && existing.role === 'admin') return res.status(404).json({ error: 'Contact not found' });
    // Another department's people are invisible to department staff.
    if (!isSelf && !isAdmin(req.user) && existing.department !== req.user.department) return res.status(404).json({ error: 'Contact not found' });

    let input;
    if (isSelf) {
      const editable = req.user.role === 'student' ? STUDENT_EDITABLE : STAFF_SELF_EDITABLE;
      input = { ...publicContact(existing), ...pick(req.body, editable) };
    } else {
      input = req.body || {};
    }
    const { errors, value } = validateContact(input);

    if (isSelf) {
      // Locked fields always keep their stored values.
      value.email = existing.email;
      value.status = existing.status;
      value.section = existing.section;
      if (req.user.role === 'student') {
        value.rollNumber = existing.rollNumber;
        value.department = existing.department;
      } else {
        value.employeeId = existing.employeeId;
        value.department = existing.department;
        value.staffRole = existing.staffRole;
        value.role = 'staff';
      }
    } else if (!isAdmin(req.user) && value.department !== req.user.department) {
      errors.department = 'You can only keep people in your own department';
    }

    // Academic record: staff and the administrator enter it; a student keeps what is stored.
    if (value.role === 'student') {
      if (!isSelf && req.body?.academics) {
        const a = validateAcademics(req.body.academics);
        Object.assign(errors, a.errors);
        value.academics = a.value;
      } else {
        value.academics = existing.academics ?? validateAcademics({}).value;
      }
    }

    const newPassword = faculty && !isSelf && s(req.body?.password) ? req.body.password : null;
    if (newPassword) {
      const pwError = validatePassword(newPassword);
      if (pwError) errors.password = pwError;
    }
    // Staff cannot lock themselves out.
    if (isSelf && faculty) {
      if (value.status !== existing.status) errors.status = 'You cannot change your own status';
    }
    if (Object.keys(errors).length) return fail(res, 400, errors);

    const dup = store.findDuplicate(value, existing.id);
    if (dup) return fail(res, 409, { [dup.field]: DUPLICATE_MESSAGES[dup.field] }, 'Duplicate contact');

    const extra = newPassword
      ? { passwordHash: await bcrypt.hash(newPassword, 10), passwordChangedAt: new Date().toISOString() }
      : {};
    const updated = store.update(existing.id, { ...value, ...extra });
    return res.json(viewFor(req.user, updated));
  });

  r.delete('/:id', requireManager, (req, res) => {
    const target = store.get(req.params.id);
    if (!target || target.role === 'admin' || (!isAdmin(req.user) && target.department !== req.user.department)) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
    store.remove(target.id);
    return res.status(204).end();
  });

  return r;
}
