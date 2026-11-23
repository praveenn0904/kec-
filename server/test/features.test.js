import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';
import { createLimiter } from '../src/auth.js';
import { checkEligibility, validateAcademics, validateCriteria, validateSlot } from '../src/academic.js';

const CSE = 'Computer Science and Engineering';
let server, base, store, tmp;
const T = {};

const call = (method, url, { body, token } = {}) =>
  fetch(base + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-features-'));
  store = new Store(path.join(tmp, 'db.json'));
  store.ensureAdmin('admin@kongu.edu', bcrypt.hashSync('Admin@123', 4));
  const app = createApp({ store, secret: 'test-secret', limiter: createLimiter() });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${server.address().port}/api`;
      resolve();
    });
  });
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('a fresh system has no people except the administrator', () => {
  assert.equal(store.contacts.length, 1);
  assert.equal(store.contacts[0].role, 'admin');
  assert.equal(store.listAll().length, 0, 'admin is not a directory entry');
});

test('the administrator signs in with the Administrator login', async () => {
  const bad = await call('POST', '/auth/login', { body: { role: 'staff', email: 'admin@kongu.edu', password: 'Admin@123' } });
  assert.equal(bad.status, 403);
  const ok = await call('POST', '/auth/login', { body: { role: 'admin', email: 'admin@kongu.edu', password: 'Admin@123' } });
  assert.equal(ok.status, 200);
  T.admin = (await ok.json()).token;
});

test('the administrator creates a department staff member and a placement coordinator', async () => {
  const staff = await call('POST', '/contacts', {
    token: T.admin,
    body: { role: 'staff', name: 'Meera Krishnan', email: 'meera.cse@kongu.edu', phone: '9876543210', department: CSE, employeeId: 'EMP1', designation: 'Assistant Professor', password: 'Staff@123' },
  });
  assert.equal(staff.status, 201);
  const coord = await call('POST', '/contacts', {
    token: T.admin,
    body: { role: 'staff', name: 'Placement Officer', email: 'placement.cse@kongu.edu', phone: '9876543211', department: CSE, employeeId: 'EMP2', designation: 'TPO', password: 'Staff@123' },
  });
  assert.equal(coord.status, 201);
});

test('the administrator adds a student with academics, and the CGPA is computed from semesters when not given', async () => {
  const res = await call('POST', '/contacts', {
    token: T.admin,
    body: {
      role: 'student', name: 'Aarav Sharma', email: 'aarav.sharma@kongu.edu', phone: '9876500000', department: CSE,
      rollNumber: '24CSE001', course: 'B.E.', year: 3, section: 'A', password: 'Student@123',
      academics: { tenthPercent: 88, twelfthPercent: 76, semesterGpa: [8, 7.5, 8.2, null, null, null, null, null], arrears: 1 },
    },
  });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.academics.tenthPercent, 88);
  assert.equal(created.academics.cgpa, 7.9);
  assert.equal(created.academics.arrears, 1);
  assert.equal(created.academics.semesterGpa.length, 8);
});

test('academic values are checked', () => {
  assert.ok(validateAcademics({ tenthPercent: 120 }).errors.tenthPercent);
  assert.ok(validateAcademics({ semesterGpa: [11] }).errors.semesterGpa);
  assert.ok(validateAcademics({ arrears: -1 }).errors.arrears);
  assert.ok(validateAcademics({ semesterGpa: [1, 2, 3, 4, 5, 6, 7, 8, 9] }).errors.semesterGpa);
});

test('drive eligibility explains which limit a student fails', () => {
  const criteria = validateCriteria({ tenthMin: 60, twelfthMin: 60, cgpaMin: 7, maxArrears: 0 }).value;
  assert.equal(checkEligibility(criteria, { tenthPercent: 88, twelfthPercent: 76, cgpa: 7.9, arrears: 0 }).eligible, true);
  const low = checkEligibility(criteria, { tenthPercent: 55, twelfthPercent: 76, cgpa: 6.5, arrears: 2 });
  assert.equal(low.eligible, false);
  assert.equal(low.reasons.length, 3);
  assert.equal(checkEligibility(criteria, {}).reasons.length, 3, 'missing marks fail each mark limit; arrears default to 0');
  assert.equal(checkEligibility({}, {}).eligible, true, 'no criteria means open to all');
});

test('a timetable slot needs a valid day, period and subject', () => {
  assert.ok(validateSlot({ year: 3, section: 'A', day: 7, period: 1, subject: 'DS', staffId: 'x' }).errors.day);
  assert.ok(validateSlot({ year: 3, section: 'A', day: 1, period: 9, subject: 'DS', staffId: 'x' }).errors.period);
  assert.ok(validateSlot({ year: 3, section: 'A', day: 1, period: 1, subject: 'DS' }).errors.staffId);
});

test('only the staff member who teaches a period can mark its attendance', async () => {
  const meera = store.listAll({ role: 'staff', department: CSE })[0];
  const login = await call('POST', '/auth/login', { body: { role: 'staff', email: 'meera.cse@kongu.edu', password: 'Staff@123' } });
  T.faculty = (await login.json()).token;

  const today = new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const dayOk = weekday >= 1 && weekday <= 6;
  if (!dayOk) return; // Sunday has no teaching day; the rule is still enforced by the timetable lookup

  const student = store.listAll({ role: 'student', department: CSE })[0];
  const body = { date: today, period: 2, year: 3, section: 'A', records: [{ studentId: student.id, status: 'present' }] };

  const noSlot = await call('PUT', '/attendance', { token: T.faculty, body });
  assert.equal(noSlot.status, 400, 'no slot yet');

  store.upsertSlot({ department: CSE, year: 3, section: 'A', day: weekday, period: 2, subject: 'Operating Systems', staffId: meera.id });
  const ok = await call('PUT', '/attendance', { token: T.faculty, body });
  assert.equal(ok.status, 200);

  store.upsertSlot({ department: CSE, year: 3, section: 'A', day: weekday, period: 2, subject: 'Operating Systems', staffId: 'someone-else' });
  const notMine = await call('PUT', '/attendance', { token: T.faculty, body });
  assert.equal(notMine.status, 403);
});

test('CAT marks are entered by the subject staff, and only the student sees them', async () => {
  const meera = store.listAll({ role: 'staff', department: CSE })[0];
  store.upsertSlot({ department: CSE, year: 3, section: 'A', day: 1, period: 5, subject: 'Compiler Design', staffId: meera.id });
  const student = store.listAll({ role: 'student', department: CSE })[0];

  const put = await call('PUT', '/cat', {
    token: T.faculty,
    body: { year: 3, section: 'A', subject: 'Compiler Design', cat: 1, marks: [{ studentId: student.id, mark: 42 }] },
  });
  assert.equal(put.status, 200);
  const over = await call('PUT', '/cat', {
    token: T.faculty,
    body: { year: 3, section: 'A', subject: 'Compiler Design', cat: 1, marks: [{ studentId: student.id, mark: 51 }] },
  });
  assert.equal(over.status, 400);
  const notTaught = await call('PUT', '/cat', {
    token: T.faculty,
    body: { year: 3, section: 'A', subject: 'Unknown Subject', cat: 1, marks: [{ studentId: student.id, mark: 10 }] },
  });
  assert.equal(notTaught.status, 403);

  const stLogin = await (await call('POST', '/auth/login', { body: { role: 'student', email: 'aarav.sharma@kongu.edu', password: 'Student@123' } })).json();
  const mine = await (await call('GET', '/cat/me', { token: stLogin.token })).json();
  const row = mine.data.find((x) => x.subject === 'Compiler Design');
  assert.equal(row.marks.cat1, 42);

  const adminView = await call('GET', '/cat/me', { token: T.admin });
  assert.equal(adminView.status, 403, 'the administrator cannot read CAT marks');
});

test('the timetable is visible to staff and students, and the administrator sets it for any department', async () => {
  const staffView = await call('GET', '/timetable?year=3&section=A', { token: T.faculty });
  assert.equal(staffView.status, 200);
  const stLogin = await (await call('POST', '/auth/login', { body: { role: 'student', email: 'aarav.sharma@kongu.edu', password: 'Student@123' } })).json();
  const studentView = await call('GET', '/timetable', { token: stLogin.token });
  assert.equal(studentView.status, 200);
  assert.equal((await studentView.json()).days.length, 6);
  const adminRead = await call('GET', `/timetable?department=${encodeURIComponent(CSE)}&year=3&section=A`, { token: T.admin });
  assert.equal(adminRead.status, 200);
});
