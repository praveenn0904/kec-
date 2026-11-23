import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { buildSeed, SEED_PASSWORDS } from './seed.js';
import { DEPARTMENTS, PERIODS } from './departments.js';
import { collegeToday } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SORT_FIELDS = new Set(['name', 'department', 'createdAt', 'year', 'rollNumber', 'employeeId']);

/**
 * JSON-file persistence for contacts (with password hashes), attendance, on-duty requests and placements.
 * Writes are atomic (temp file + rename) so a crash mid-write cannot corrupt the data.
 * Uploaded proof files live in an `uploads` folder next to the data file.
 */
export class Store {
  constructor(file = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json'), { seed = false } = {}) {
    this.file = file;
    this.uploadDir = path.join(path.dirname(file), 'uploads');
    this.contacts = [];
    this.attendance = [];
    this.onDuty = [];
    this.drives = [];
    this.responses = [];
    this.timetable = [];
    this.cats = [];
    this.demo = false;
    fs.mkdirSync(this.uploadDir, { recursive: true });

    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.contacts = raw.contacts || [];
      this.attendance = raw.attendance || [];
      this.onDuty = raw.onDuty || [];
      this.drives = raw.drives || [];
      this.responses = raw.responses || [];
      this.timetable = raw.timetable || [];
      this.cats = raw.cats || [];
      this.demo = Boolean(raw.demo);
    } else {
      if (seed) {
        const data = buildSeed({
          staffHash: bcrypt.hashSync(SEED_PASSWORDS.staff, 10),
          studentHash: bcrypt.hashSync(SEED_PASSWORDS.student, 10),
        });
        this.contacts = data.contacts;
        this.attendance = data.attendance;
        this.drives = data.drives;
        this.responses = data.responses;
        this.onDuty = data.onDuty;
        this.demo = true;
      }
      this.#persist();
    }
    this.#reindex();
  }

  #persist() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(
      tmp,
      JSON.stringify(
        {
          demo: this.demo, contacts: this.contacts, attendance: this.attendance, onDuty: this.onDuty,
          drives: this.drives, responses: this.responses, timetable: this.timetable, cats: this.cats,
        },
        null,
        2
      )
    );
    fs.renameSync(tmp, this.file);
  }

  #reindex() {
    this.attIndex = new Map(this.attendance.map((r) => [`${r.studentId}|${r.date}|${r.period}`, r]));
  }

  // ---------------------------------------------------------------- contacts

  /** Filtered + sorted list without pagination. */
  listAll({ q, role, department, status, year, section, sort = 'name', order = 'asc' } = {}) {
    // Administrator accounts are not directory entries.
    let items = this.contacts.filter((c) => c.role !== 'admin');
    if (role) items = items.filter((c) => c.role === role);
    if (department) items = items.filter((c) => c.department === department);
    if (status) items = items.filter((c) => c.status === status);
    if (year) items = items.filter((c) => c.year === Number(year));
    if (section) items = items.filter((c) => c.section === section);

    if (q) {
      const needle = q.toLowerCase();
      items = items.filter((c) =>
        [c.name, c.email, c.phone, c.department, c.rollNumber, c.employeeId, c.course, c.designation]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(needle))
      );
    }

    const key = SORT_FIELDS.has(sort) ? sort : 'name';
    const dir = order === 'desc' ? -1 : 1;
    items.sort((a, b) =>
      String(a[key] ?? '').localeCompare(String(b[key] ?? ''), undefined, { numeric: true, sensitivity: 'base' }) * dir
    );
    return items;
  }

  list({ page = 1, limit = 10, ...filters } = {}) {
    const items = this.listAll(filters);
    const total = items.length;
    const pageNum = Math.max(1, Number(page) || 1);
    const size = Math.min(100, Math.max(1, Number(limit) || 10));
    const totalPages = Math.max(1, Math.ceil(total / size));
    const start = (pageNum - 1) * size;
    return { data: items.slice(start, start + size), meta: { total, page: pageNum, limit: size, totalPages } };
  }

  get(id) {
    return this.contacts.find((c) => c.id === id) || null;
  }

  getByEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    return this.contacts.find((c) => c.email === e) || null;
  }

  findDuplicate(value, ignoreId) {
    for (const c of this.contacts) {
      if (c.id === ignoreId) continue;
      if (c.email === value.email) return { field: 'email', contact: c };
      if (value.rollNumber && c.rollNumber === value.rollNumber) return { field: 'rollNumber', contact: c };
      if (value.employeeId && c.employeeId === value.employeeId) return { field: 'employeeId', contact: c };
    }
    return null;
  }

  create(value) {
    const now = new Date().toISOString();
    const contact = { id: randomUUID(), createdAt: now, updatedAt: now, ...value };
    this.contacts.push(contact);
    this.#persist();
    return contact;
  }

  /** Replaces the record (so switching role drops the other role's fields) but keeps the password unless a new one is given. */
  update(id, value) {
    const idx = this.contacts.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const existing = this.contacts[idx];
    this.contacts[idx] = {
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      passwordHash: existing.passwordHash,
      passwordChangedAt: existing.passwordChangedAt,
      ...value,
    };
    this.#persist();
    return this.contacts[idx];
  }

  /** Removes a person together with their attendance, on-duty requests (and proof files) and placement responses. */
  remove(id) {
    const idx = this.contacts.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    this.contacts.splice(idx, 1);
    this.attendance = this.attendance.filter((r) => r.studentId !== id);
    this.responses = this.responses.filter((r) => r.studentId !== id);
    this.cats = this.cats.filter((c) => c.studentId !== id);
    for (const r of this.onDuty.filter((x) => x.studentId === id)) this.#deleteProof(r);
    this.onDuty = this.onDuty.filter((r) => r.studentId !== id);
    this.#reindex();
    this.#persist();
    return true;
  }

  /** Figures for one department's staff (the only scope a faculty login can see). */
  stats(today, department) {
    this.#syncOnDuty();
    const mine = this.contacts.filter((c) => c.department === department);
    const students = mine.filter((c) => c.role === 'student' && c.status === 'active');
    const staff = mine.filter((c) => c.role === 'staff' && c.status === 'active' && c.staffRole !== 'placement');
    const inactive = mine.filter((c) => c.status !== 'active').length;

    const ids = new Set(students.map((s) => s.id));
    const today_ = { present: 0, absent: 0, od: 0 };
    const periodsSeen = new Set();
    for (const r of this.attendance) {
      if (r.date !== today || !ids.has(r.studentId)) continue;
      today_[r.status]++;
      periodsSeen.add(r.period);
    }
    const markedStudents = new Set(this.attendance.filter((r) => r.date === today && ids.has(r.studentId)).map((r) => r.studentId));

    // Active students by year and section, for the dashboard.
    const classes = new Map();
    for (const s of students) {
      const key = `${s.year}|${s.section}`;
      if (!classes.has(key)) classes.set(key, { year: s.year, section: s.section, students: 0 });
      classes.get(key).students++;
    }

    return {
      department,
      students: students.length,
      staff: staff.length,
      inactive,
      periods: PERIODS,
      classes: [...classes.values()].sort((a, b) => a.year - b.year || a.section.localeCompare(b.section)),
      attendanceToday: {
        date: today,
        activeStudents: students.length,
        marked: markedStudents.size,
        periodsMarked: periodsSeen.size,
        ...today_,
      },
    };
  }

  // -------------------------------------------------------------- attendance

  /** Applies approved on-duty days (up to today) to the attendance register as "present" in every period. */
  #syncOnDuty() {
    const today = collegeToday();
    const now = new Date().toISOString();
    let changed = false;
    for (const req of this.onDuty) {
      if (req.status !== 'approved') continue;
      for (const date of req.dates) {
        if (date > today || req.applied.includes(date)) continue;
        for (let period = 1; period <= PERIODS; period++) {
          const key = `${req.studentId}|${date}|${period}`;
          const existing = this.attIndex.get(key);
          const fields = { status: 'present', onDuty: req.id, markedBy: req.decidedBy, updatedAt: now };
          if (existing) {
            Object.assign(existing, fields);
          } else {
            const rec = { studentId: req.studentId, date, period, ...fields };
            this.attendance.push(rec);
            this.attIndex.set(key, rec);
          }
        }
        req.applied.push(date);
        changed = true;
      }
    }
    if (changed) this.#persist();
  }

  /** Map of studentId -> attendance record for one date and period. */
  attendanceOn(date, period) {
    this.#syncOnDuty();
    const map = new Map();
    for (const r of this.attendance) if (r.date === date && r.period === period) map.set(r.studentId, r);
    return map;
  }

  /** All period records for one student, newest day first, periods in order. */
  attendanceFor(studentId) {
    this.#syncOnDuty();
    return this.attendance
      .filter((r) => r.studentId === studentId)
      .sort((a, b) => b.date.localeCompare(a.date) || a.period - b.period);
  }

  /** Map of studentId -> period records, optionally limited to a date range (inclusive). */
  attendanceByStudent({ from, to } = {}) {
    this.#syncOnDuty();
    const map = new Map();
    for (const r of this.attendance) {
      if (from && r.date < from) continue;
      if (to && r.date > to) continue;
      if (!map.has(r.studentId)) map.set(r.studentId, []);
      map.get(r.studentId).push(r);
    }
    return map;
  }

  upsertAttendance(date, period, records, markedBy) {
    this.#syncOnDuty();
    const now = new Date().toISOString();
    for (const { studentId, status } of records) {
      const key = `${studentId}|${date}|${period}`;
      const existing = this.attIndex.get(key);
      if (existing) {
        existing.status = status;
        existing.markedBy = markedBy;
        existing.updatedAt = now;
        delete existing.onDuty; // a manual mark overrides the automatic on-duty one
      } else {
        const rec = { studentId, date, period, status, markedBy, updatedAt: now };
        this.attendance.push(rec);
        this.attIndex.set(key, rec);
      }
    }
    this.#persist();
    return records.length;
  }

  // ------------------------------------------------------------------ on duty

  saveProof(buffer, ext) {
    const name = `${randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(this.uploadDir, name), buffer, { mode: 0o600 });
    return name;
  }

  proofPath(name) {
    // Stored names are server-generated UUIDs; basename() is a second guard against path tricks.
    return path.join(this.uploadDir, path.basename(String(name)));
  }

  #deleteProof(req) {
    if (req.proofFile) fs.rmSync(this.proofPath(req.proofFile), { force: true });
  }

  listOnDuty({ studentId, status, department, q } = {}) {
    let items = [...this.onDuty];
    if (studentId) items = items.filter((r) => r.studentId === studentId);
    if (status) items = items.filter((r) => r.status === status);
    if (department || q) {
      const needle = (q || '').toLowerCase();
      items = items.filter((r) => {
        const s = this.get(r.studentId);
        if (!s) return false;
        if (department && s.department !== department) return false;
        return !needle || [s.name, s.rollNumber, r.place, r.reason].some((f) => String(f || '').toLowerCase().includes(needle));
      });
    }
    const order = { pending: 0, approved: 1, rejected: 2 };
    return items.sort((a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt));
  }

  getOnDuty(id) {
    return this.onDuty.find((r) => r.id === id) || null;
  }

  createOnDuty(value) {
    const req = { id: randomUUID(), createdAt: new Date().toISOString(), status: 'pending', applied: [], ...value };
    this.onDuty.push(req);
    this.#persist();
    return req;
  }

  decideOnDuty(id, status, decidedBy) {
    const req = this.getOnDuty(id);
    if (!req) return null;
    req.status = status;
    req.decidedBy = decidedBy;
    req.decidedAt = new Date().toISOString();
    this.#persist();
    if (status === 'approved') this.#syncOnDuty(); // dates up to today become "present" immediately
    return req;
  }

  removeOnDuty(id) {
    const idx = this.onDuty.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.#deleteProof(this.onDuty[idx]);
    this.onDuty.splice(idx, 1);
    this.#persist();
    return true;
  }

  // --------------------------------------------------------------- placements

  getDrive(id) {
    return this.drives.find((d) => d.id === id) || null;
  }

  listDrives() {
    return [...this.drives].sort((a, b) => b.driveDate.localeCompare(a.driveDate));
  }

  createDrive(value) {
    const now = new Date().toISOString();
    const drive = { id: randomUUID(), createdAt: now, updatedAt: now, ...value };
    this.drives.push(drive);
    this.#persist();
    return drive;
  }

  updateDrive(id, value) {
    const idx = this.drives.findIndex((d) => d.id === id);
    if (idx === -1) return null;
    this.drives[idx] = { ...this.drives[idx], ...value, id, updatedAt: new Date().toISOString() };
    this.#persist();
    return this.drives[idx];
  }

  removeDrive(id) {
    const idx = this.drives.findIndex((d) => d.id === id);
    if (idx === -1) return false;
    this.drives.splice(idx, 1);
    this.responses = this.responses.filter((r) => r.driveId !== id);
    this.#persist();
    return true;
  }

  responsesFor(driveId) {
    return this.responses.filter((r) => r.driveId === driveId);
  }

  getResponse(driveId, studentId) {
    return this.responses.find((r) => r.driveId === driveId && r.studentId === studentId) || null;
  }

  /** Creates or updates a student's record for a drive. */
  saveResponse(driveId, studentId, patch) {
    let rec = this.getResponse(driveId, studentId);
    const now = new Date().toISOString();
    if (!rec) {
      rec = {
        driveId, studentId, response: null, respondedAt: null,
        status: 'in_progress', eliminatedRound: null, scores: {}, updatedAt: now,
      };
      this.responses.push(rec);
    }
    Object.assign(rec, patch, { updatedAt: now });
    this.#persist();
    return rec;
  }

  /** Is this student allowed to take part in this drive? */
  isEligible(drive, student) {
    if (!student || student.role !== 'student' || student.status !== 'active') return false;
    return drive.eligibleDepartments.length === 0 || drive.eligibleDepartments.includes(student.department);
  }

  // ------------------------------------------------------------------ admin

  /** Creates the administrator from ADMIN_EMAIL / ADMIN_PASSWORD on first start. Does nothing once an admin exists. */
  ensureAdmin(email, passwordHash) {
    if (this.contacts.some((c) => c.role === 'admin')) return false;
    const now = new Date().toISOString();
    this.contacts.push({
      id: randomUUID(), role: 'admin', name: 'Administrator', email: email.toLowerCase(), phone: '',
      department: '', status: 'active', passwordHash, passwordChangedAt: now, createdAt: now, updatedAt: now,
    });
    this.#persist();
    return true;
  }

  // -------------------------------------------------------------- timetable

  slotsFor({ department, year, section } = {}) {
    return this.timetable
      .filter((x) => (!department || x.department === department) && (!year || x.year === Number(year)) && (!section || x.section === section))
      .sort((a, b) => a.day - b.day || a.period - b.period);
  }

  slotAt(department, year, section, day, period) {
    return this.timetable.find((x) => x.department === department && x.year === year && x.section === section && x.day === day && x.period === period) || null;
  }

  getSlot(id) {
    return this.timetable.find((x) => x.id === id) || null;
  }

  /** One slot per class, day and period: saving again replaces the subject and staff member. */
  upsertSlot(value) {
    const now = new Date().toISOString();
    const existing = this.slotAt(value.department, value.year, value.section, value.day, value.period);
    if (existing) {
      Object.assign(existing, value, { updatedAt: now });
      this.#persist();
      return existing;
    }
    const slot = { id: randomUUID(), createdAt: now, updatedAt: now, ...value };
    this.timetable.push(slot);
    this.#persist();
    return slot;
  }

  removeSlot(id) {
    const before = this.timetable.length;
    this.timetable = this.timetable.filter((x) => x.id !== id);
    this.#persist();
    return this.timetable.length !== before;
  }

  /** Subjects a staff member teaches to a class (from the timetable). */
  subjectsTaughtBy(staffId, department, year, section) {
    return [...new Set(this.timetable.filter((x) => x.staffId === staffId && x.department === department && x.year === year && x.section === section).map((x) => x.subject))];
  }

  // -------------------------------------------------------------- CAT marks

  catsOf(studentId) {
    return this.cats.filter((c) => c.studentId === studentId);
  }

  /** Saves one CAT mark. A null mark clears it. */
  setCatMark({ studentId, subject, cat, mark, markedBy }) {
    const idx = this.cats.findIndex((c) => c.studentId === studentId && c.subject === subject && c.cat === cat);
    if (mark === null) {
      if (idx !== -1) this.cats.splice(idx, 1);
    } else if (idx !== -1) {
      Object.assign(this.cats[idx], { mark, markedBy, updatedAt: new Date().toISOString() });
    } else {
      this.cats.push({ id: randomUUID(), studentId, subject, cat, mark, markedBy, updatedAt: new Date().toISOString() });
    }
    this.#persist();
  }
}
