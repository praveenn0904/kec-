import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';
import { createLimiter } from '../src/auth.js';
import { collegeToday } from '../src/util.js';

let server;
let base;
let tmpDir;
let store;
const T = {}; // tokens

const FACULTY = { email: 'meera.cse@kongu.edu', password: 'Staff@123' };          // CSE department staff
const COORD = { email: 'placement.cse@kongu.edu', password: 'Staff@123' };        // CSE placement coordinator
const OTHER = { email: 'arvind.aids@kongu.edu', password: 'Staff@123' };          // AIDS department staff
const STUDENT = { email: 'aarav.sharma@kongu.edu', password: 'Student@123' };     // CSE, year 3, section A
const CSE = 'Computer Science and Engineering';
const AIDS = 'Artificial Intelligence and Data Science';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const call = (method, url, { body, token } = {}) =>
  fetch(base + url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const login = async (role, creds) => {
  const res = await call('POST', '/auth/login', { body: { role, ...creds } });
  return { res, body: await res.json() };
};

/** A weekday on or before yesterday, `back` weekdays ago. */
function pastWeekday(back = 1) {
  let d = new Date(`${collegeToday()}T00:00:00Z`);
  let found = 0;
  for (;;) {
    d = new Date(d.getTime() - 86400000);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) {
      found++;
      if (found === back) return d.toISOString().slice(0, 10);
    }
  }
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contacts-test-'));
  store = new Store(path.join(tmpDir, 'db.json'), { seed: true });
  server = createApp({ store, secret: 'test-secret', limiter: createLimiter({ max: 5 }) }).listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
  T.faculty = (await login('staff', FACULTY)).body.token;
  T.coord = (await login('staff', COORD)).body.token;
  T.other = (await login('staff', OTHER)).body.token;
  T.student = (await login('student', STUDENT)).body.token;
});

after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ------------------------------------------------------------------ meta and logins

test('meta lists 17 departments, sections A-H and 8 periods', async () => {
  const m = await (await call('GET', '/meta')).json();
  assert.equal(m.departments.length, 17);
  assert.deepEqual(m.sections, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  assert.equal(m.periods, 8);
  assert.equal(m.demoAccounts.placement.email, 'placement.cse@kongu.edu');
});

test('department staff, placement coordinator and students can log in', async () => {
  const f = await login('staff', FACULTY);
  assert.equal(f.res.status, 200);
  assert.equal(f.body.user.department, CSE);
  assert.equal(f.body.user.staffRole, 'faculty');
  const c = await login('staff', COORD);
  assert.equal(c.body.user.staffRole, 'placement');
  assert.equal(c.body.user.passwordHash, undefined);
});

test('wrong role tab and wrong password are refused', async () => {
  assert.equal((await login('student', FACULTY)).res.status, 403);
  assert.equal((await login('staff', { ...FACULTY, password: 'Wrong@1234' })).res.status, 401);
});

test('protected routes still need a token', async () => {
  for (const url of ['/contacts', '/stats', '/attendance/report', '/onduty', '/placements', '/auth/me']) {
    assert.equal((await call('GET', url)).status, 401, url);
  }
});

// ------------------------------------------------------------------ department scope

test('department staff see only their own department in the directory', async () => {
  const body = await (await call('GET', '/contacts?limit=100', { token: T.faculty })).json();
  assert.ok(body.data.length > 0);
  assert.ok(body.data.every((c) => c.department === CSE));
  // asking for another department is ignored
  const other = await (await call('GET', `/contacts?limit=100&department=${encodeURIComponent(AIDS)}`, { token: T.faculty })).json();
  assert.ok(other.data.every((c) => c.department === CSE));
});

test('department staff cannot open a contact from another department', async () => {
  const aids = (await (await call('GET', `/contacts?limit=100`, { token: T.other })).json()).data.find((c) => c.department === AIDS && c.role === 'student');
  assert.equal((await call('GET', `/contacts/${aids.id}`, { token: T.faculty })).status, 403);
  assert.equal((await call('PUT', `/contacts/${aids.id}`, { token: T.faculty, body: aids })).status, 404);
  assert.equal((await call('DELETE', `/contacts/${aids.id}`, { token: T.faculty })).status, 404);
});

test('department staff stats are for their own department only', async () => {
  const s = await (await call('GET', '/stats?today=2026-01-05', { token: T.faculty })).json();
  assert.equal(s.department, CSE);
  assert.equal(s.periods, 8);
  assert.ok(s.classes.every((c) => c.year >= 1 && ['A', 'B'].includes(c.section)));
});

test('placement coordinator has no directory, attendance, stats or on-duty access', async () => {
  for (const url of ['/contacts', '/stats', '/attendance/report', '/attendance/roster?date=2026-01-05&period=1&year=3&section=A', '/onduty', '/contacts/export.csv']) {
    assert.equal((await call('GET', url, { token: T.coord })).status, 403, url);
  }
});

test('department staff have no placement access', async () => {
  for (const url of ['/placements', '/placements/report.pdf']) {
    assert.equal((await call('GET', url, { token: T.faculty })).status, 403, url);
  }
  assert.equal((await call('POST', '/placements', { token: T.faculty, body: {} })).status, 403);
});

test('students see only active staff, not students', async () => {
  const body = await (await call('GET', '/contacts?limit=100', { token: T.student })).json();
  assert.ok(body.data.every((c) => c.role === 'staff' && c.status === 'active'));
  assert.ok(body.data.every((c) => c.address === undefined && c.notes === undefined));
});

// ------------------------------------------------------------------ creating staff and students

test('department staff add a student with a section, only in their own department', async () => {
  const ok = await call('POST', '/contacts', {
    token: T.faculty,
    body: { role: 'student', name: 'New Student', email: 'new.student@kongu.edu', phone: '+91 90000 00011', department: CSE, rollNumber: '26CSE901', course: 'B.E.', year: 1, section: 'c', password: 'Created@123' },
  });
  assert.equal(ok.status, 201);
  const created = await ok.json();
  assert.equal(created.section, 'C');

  const wrongDept = await call('POST', '/contacts', {
    token: T.faculty,
    body: { role: 'student', name: 'Wrong Dept', email: 'wrong.dept@kongu.edu', phone: '+91 90000 00012', department: AIDS, rollNumber: '26AIDS901', course: 'B.Tech', year: 1, section: 'A', password: 'Created@123' },
  });
  assert.equal(wrongDept.status, 400);
  assert.ok((await wrongDept.json()).fields.department);
});

test('a student needs a section between A and H', async () => {
  const res = await call('POST', '/contacts', {
    token: T.faculty,
    body: { role: 'student', name: 'No Section', email: 'no.section@kongu.edu', phone: '+91 90000 00013', department: CSE, rollNumber: '26CSE902', course: 'B.E.', year: 1, section: 'Z', password: 'Created@123' },
  });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).fields.section);
});

test('staff email must carry the department: name.dept@kongu.edu', async () => {
  const base = { role: 'staff', name: 'Praveen Kumar', phone: '+91 90000 00014', department: CSE, employeeId: 'E9', designation: 'Assistant Professor', password: 'Staff@999' };
  const good = await call('POST', '/contacts', { token: T.faculty, body: { ...base, email: 'praveen.cse@kongu.edu' } });
  assert.equal(good.status, 201);
  const created = await good.json();
  assert.equal(created.staffRole, 'faculty');

  const noDept = await call('POST', '/contacts', { token: T.faculty, body: { ...base, email: 'praveen@kongu.edu', employeeId: 'E10' } });
  assert.equal(noDept.status, 400);
  assert.ok((await noDept.json()).fields.email);

  // the email says AIDS but the form says CSE: refused, pointing at the department
  const otherDept = await call('POST', '/contacts', { token: T.faculty, body: { ...base, email: 'praveen.aids@kongu.edu', employeeId: 'E11' } });
  assert.equal(otherDept.status, 400);
  assert.ok((await otherDept.json()).fields.department);
});

test('a department staff member can create the placement coordinator for their department', async () => {
  const res = await call('POST', '/contacts', {
    token: T.faculty,
    body: { role: 'staff', name: 'Placement Desk', email: 'placement.cse2@kongu.edu', phone: '+91 90000 00015', department: CSE, employeeId: 'E12', designation: 'Placement Coordinator', password: 'Staff@999' },
  });
  // placement.cse2 has a key that is not a department, so it is refused
  assert.equal(res.status, 400);
  const ok = await call('POST', '/contacts', {
    token: T.faculty,
    body: { role: 'staff', name: 'Placement Desk', email: 'placement.cse@kongu.edu', phone: '+91 90000 00016', department: CSE, employeeId: 'E13', designation: 'Placement Coordinator', password: 'Staff@999' },
  });
  assert.equal(ok.status, 409); // the seeded coordinator already uses this email
});

test('department staff cannot edit another department, and cannot move people out of theirs', async () => {
  const mine = (await (await call('GET', '/contacts?role=student&limit=100', { token: T.faculty })).json()).data[0];
  const moved = await call('PUT', `/contacts/${mine.id}`, { token: T.faculty, body: { ...mine, department: AIDS } });
  assert.equal(moved.status, 400);
  assert.ok((await moved.json()).fields.department);
});

// ------------------------------------------------------------------ self-service

test('a student can change phone and address but not section, department or email', async () => {
  const me = (await (await call('GET', '/auth/me', { token: T.student })).json());
  const res = await call('PUT', `/contacts/${me.id}`, {
    token: T.student,
    body: { ...me, phone: '+91 90000 77777', section: 'H', department: AIDS, email: 'hacker@kongu.edu', rollNumber: 'HACK1', status: 'inactive' },
  });
  assert.equal(res.status, 200);
  const u = await res.json();
  assert.equal(u.phone, '+91 90000 77777');
  assert.equal(u.section, 'A');
  assert.equal(u.department, CSE);
  assert.equal(u.email, STUDENT.email);
  assert.equal(u.status, 'active');
});

test('department staff can edit their own details but not their email or department', async () => {
  const me = await (await call('GET', '/auth/me', { token: T.faculty })).json();
  const res = await call('PUT', `/contacts/${me.id}`, {
    token: T.faculty,
    body: { ...me, designation: 'Professor', email: 'meera.aids@kongu.edu', department: AIDS, employeeId: 'HACK' },
  });
  assert.equal(res.status, 200);
  const u = await res.json();
  assert.equal(u.designation, 'Professor');
  assert.equal(u.email, FACULTY.email);
  assert.equal(u.department, CSE);
});

// ------------------------------------------------------------------ attendance by period

test('attendance is marked per period for one class', async () => {
  const date = pastWeekday(2);
  const roster = await (await call('GET', `/attendance/roster?date=${date}&period=3&year=3&section=A`, { token: T.faculty })).json();
  assert.equal(roster.period, 3);
  assert.ok(roster.students.length >= 1);
  assert.ok(roster.students.every((s) => s.year === 3 && s.section === 'A'));

  // The timetable must give this staff member the period first (attendance is only for the teacher of that period).
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  store.upsertSlot({ department: CSE, year: 3, section: 'A', day: weekday, period: 3, subject: 'Data Structures', staffId: store.getByEmail(FACULTY.email).id });

  const records = roster.students.map((s, i) => ({ studentId: s.id, status: i === 0 ? 'absent' : 'present' }));
  const save = await call('PUT', '/attendance', { token: T.faculty, body: { date, period: 3, year: 3, section: 'A', records } });
  assert.equal(save.status, 200);

  const again = await (await call('GET', `/attendance/roster?date=${date}&period=3&year=3&section=A`, { token: T.faculty })).json();
  assert.equal(again.students[0].status, 'absent');
  // a different period is independent
  const p4 = await (await call('GET', `/attendance/roster?date=${date}&period=4&year=3&section=A`, { token: T.faculty })).json();
  assert.ok(p4.students.every((s) => s.status === null || s.status === 'present' || s.status === 'absent'));
});

test('a period, year and section are all required for the roster', async () => {
  const date = pastWeekday(2);
  assert.equal((await call('GET', `/attendance/roster?date=${date}&year=3&section=A`, { token: T.faculty })).status, 400);
  assert.equal((await call('GET', `/attendance/roster?date=${date}&period=9&year=3&section=A`, { token: T.faculty })).status, 400);
  assert.equal((await call('GET', `/attendance/roster?date=${date}&period=1&section=A`, { token: T.faculty })).status, 400);
  assert.equal((await call('GET', `/attendance/roster?date=${date}&period=1&year=3`, { token: T.faculty })).status, 400);
  assert.equal((await call('GET', `/attendance/roster?date=${date}&period=1&year=3&section=Z`, { token: T.faculty })).status, 400);
});

test('marking attendance outside the department or for a future date is refused', async () => {
  const aids = (await (await call('GET', '/contacts?role=student&limit=100', { token: T.other })).json()).data[0];
  const bad = await call('PUT', '/attendance', { token: T.faculty, body: { date: pastWeekday(1), period: 1, records: [{ studentId: aids.id, status: 'present' }] } });
  assert.equal(bad.status, 400);
  const future = await call('PUT', '/attendance', { token: T.faculty, body: { date: '2999-01-01', period: 1, records: [{ studentId: aids.id, status: 'present' }] } });
  assert.equal(future.status, 400);
  const period = await call('PUT', '/attendance', { token: T.faculty, body: { date: pastWeekday(1), period: 0, records: [] } });
  assert.equal(period.status, 400);
});

test('attendance report is limited to the department and can be filtered by section', async () => {
  const all = await (await call('GET', '/attendance/report', { token: T.faculty })).json();
  assert.ok(all.data.length > 0 && all.data.every((r) => r.department === CSE));
  assert.equal(all.meta.periodsPerDay, 8);
  const secA = await (await call('GET', '/attendance/report?section=A', { token: T.faculty })).json();
  assert.ok(secA.data.every((r) => r.section === 'A'));
  const yr = await (await call('GET', '/attendance/report?year=3&section=A', { token: T.faculty })).json();
  assert.ok(yr.data.every((r) => r.year === 3 && r.section === 'A'));
  assert.equal((await call('GET', '/attendance/report?section=Q', { token: T.faculty })).status, 400);
});

test('the attendance PDF downloads for department staff', async () => {
  const res = await call('GET', '/attendance/report.pdf', { token: T.faculty });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /pdf/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 4).toString(), '%PDF');
});

test('a student sees their own periods, not another student', async () => {
  const me = (await (await call('GET', '/auth/me', { token: T.student })).json());
  const mine = await (await call('GET', `/attendance/students/${me.id}`, { token: T.student })).json();
  assert.equal(mine.periodsPerDay, 8);
  assert.ok(mine.summary.total > 0);
  assert.ok(mine.records.every((r) => Number.isInteger(r.period) && r.period >= 1 && r.period <= 8));
  const other = (await (await call('GET', '/contacts?role=staff', { token: T.student })).json()).data[0];
  assert.equal((await call('GET', `/attendance/students/${other.id}`, { token: T.student })).status, 404);
});

// ------------------------------------------------------------------ on duty

test('an approved on-duty request marks every period of the covered day as present', async () => {
  const date = pastWeekday(3);
  const apply = await call('POST', '/onduty', {
    token: T.student,
    body: { reason: 'Attending a national workshop', place: 'Anna University, Chennai', fromDate: date, days: 1, proof: { name: 'letter.png', data: PNG } },
  });
  assert.equal(apply.status, 201);
  const req = await apply.json();

  const before = await (await call('GET', '/onduty', { token: T.faculty })).json();
  assert.ok(before.data.some((r) => r.id === req.id && r.status === 'pending'));

  const approve = await call('POST', `/onduty/${req.id}/approve`, { token: T.faculty });
  assert.equal(approve.status, 200);

  const me = (await (await call('GET', '/auth/me', { token: T.student })).json());
  const detail = await (await call('GET', `/attendance/students/${me.id}`, { token: T.student })).json();
  const dayRecs = detail.records.filter((r) => r.date === date);
  assert.equal(dayRecs.length, 8);
  assert.ok(dayRecs.every((r) => r.status === 'present' && r.onDuty === true));
});

test('on-duty decisions are limited to the department', async () => {
  const pending = (await (await call('GET', '/onduty?status=pending', { token: T.faculty })).json()).data;
  const cse = pending.find((r) => r.department === CSE);
  const otherList = await (await call('GET', '/onduty', { token: T.other })).json();
  assert.ok(otherList.data.every((r) => r.department === AIDS));
  if (cse) assert.equal((await call('POST', `/onduty/${cse.id}/reject`, { token: T.other })).status, 404);
});

test('students cannot approve on-duty requests', async () => {
  const req = (await (await call('GET', '/onduty', { token: T.faculty })).json()).data[0];
  if (req) assert.equal((await call('POST', `/onduty/${req.id}/approve`, { token: T.student })).status, 403);
});

// ------------------------------------------------------------------ placements

test('the placement coordinator sees placements scoped to their department', async () => {
  const drives = await (await call('GET', '/placements', { token: T.coord })).json();
  assert.ok(drives.length >= 3);
  const nimbus = drives.find((d) => d.company.startsWith('Nimbus'));
  assert.ok(nimbus.counts.eligible > 0);
  const detail = await (await call('GET', `/placements/${nimbus.id}`, { token: T.coord })).json();
  assert.ok(detail.participants.length > 0);
  assert.ok(detail.participants.every((p) => p.department === CSE));
});

test('the coordinator creates a drive and records a result for their own student', async () => {
  const created = await call('POST', '/placements', {
    token: T.coord,
    body: {
      company: 'Test Systems Pvt Ltd', role: 'Graduate Engineer', ctc: 5, location: 'Chennai',
      driveDate: '2999-03-01', deadline: '2999-02-20', rounds: ['Aptitude', 'Interview'], eligibleDepartments: [CSE], description: '',
      status: 'open',
    },
  });
  assert.equal(created.status, 201);
  const drive = await created.json();

  const me = (await (await call('GET', '/auth/me', { token: T.student })).json());
  const resp = await call('POST', `/placements/${drive.id}/respond`, { token: T.student, body: { response: 'opted_in' } });
  assert.equal(resp.status, 200);

  const res = await call('PUT', `/placements/${drive.id}/results/${me.id}`, {
    token: T.coord, body: { status: 'eliminated', eliminatedRound: 1, scores: { 1: 41 } },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'eliminated');
});

test('the coordinator cannot record results for students of another department', async () => {
  const drive = (await (await call('GET', '/placements', { token: T.coord })).json()).find((d) => d.company.startsWith('Summit'));
  const aids = (await (await call('GET', '/contacts?role=student&limit=100', { token: T.other })).json()).data[0];
  const res = await call('PUT', `/placements/${drive.id}/results/${aids.id}`, { token: T.coord, body: { status: 'in_progress', scores: {} } });
  assert.equal(res.status, 404);
});

test('students see only their own placement outcome, and can opt in or out of an open drive', async () => {
  const list = await (await call('GET', '/placements', { token: T.student })).json();
  const summit = list.find((d) => d.company.startsWith('Summit'));
  const opt = await call('POST', `/placements/${summit.id}/respond`, { token: T.student, body: { response: 'opted_out' } });
  assert.equal(opt.status, 200);
  assert.equal((await opt.json()).mine.response, 'opted_out');
  assert.equal((await call('GET', `/placements/${summit.id}`, { token: T.student })).status, 200);
});

test('the placement PDF is scoped to the coordinator department', async () => {
  const res = await call('GET', '/placements/report.pdf', { token: T.coord });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /pdf/);
  assert.equal((await call('GET', '/placements/report.pdf', { token: T.student })).status, 403);
});

test('unknown routes and bad JSON', async () => {
  assert.equal((await call('GET', '/nothing-here', { token: T.faculty })).status, 404);
  const badJson = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal(badJson.status, 400);
});
