import { randomUUID } from 'node:crypto';
import { DEPARTMENTS, PERIODS, emailKey, STAFF_EMAIL_DOMAIN } from './departments.js';
import { addDays, collegeToday, isWeekday } from './util.js';

// Demo credentials created with the sample data (see README). Change or remove before real use.
export const SEED_PASSWORDS = { staff: 'Staff@123', student: 'Student@123' };

const STUDENT_FIRST = [
  'Aarav', 'Priya', 'Mohammed', 'Ananya', 'Rohan', 'Kavya', 'Arjun', 'Divya', 'Karthik', 'Sneha',
  'Vikram', 'Lakshmi', 'Siddharth', 'Meenakshi', 'Rahul', 'Nandini', 'Harish', 'Pooja', 'Suresh', 'Deepika',
  'Naveen', 'Swathi', 'Gokul', 'Harini', 'Pranav', 'Janani', 'Ashwin', 'Keerthana', 'Vignesh', 'Sowmya',
  'Dinesh', 'Revathi', 'Manoj', 'Bhavana', 'Surya', 'Aishwarya', 'Tarun', 'Gayathri', 'Yuvan', 'Nisha',
];
const LAST = [
  'Sharma', 'Nair', 'Iyer', 'Das', 'Reddy', 'Patel', 'Singh', 'Kumar', 'Menon', 'Krishnan', 'Raman', 'Pillai',
  'Verma', 'Gupta', 'Joseph', 'Thomas', 'Rao', 'Naidu', 'Chandran', 'Subramanian', 'Balaji', 'Murugan',
  'Natarajan', 'Sundaram', 'Venkatesh',
];
const STAFF_FIRST = [
  'Meera', 'Arvind', 'Sunita', 'Kiran', 'Rajesh', 'Anitha', 'Balamurugan', 'Chitra', 'Dhanapal', 'Elango',
  'Fathima', 'Ganesan', 'Hema', 'Ilango', 'Jayanthi', 'Kamala', 'Latha', 'Mahesh', 'Nirmala', 'Prakash',
  'Saravanan', 'Thenmozhi', 'Umadevi', 'Vasanth', 'Yamuna',
];
const CITIES = ['Chennai', 'Coimbatore', 'Madurai', 'Salem', 'Erode', 'Trichy', 'Tirunelveli', 'Vellore', 'Kochi', 'Bengaluru'];
const STREETS = ['Lake View Road', 'Gandhi Nagar', 'Temple Street', 'Park Avenue', 'Anna Salai', 'MG Road', 'Nehru Street'];

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n, w = 3) => String(n).padStart(w, '0');
const phone = (n) => {
  const d = `9${String(100000000 + ((n * 7919) % 899999999))}`;
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
};

const ascii = (text) => text.toLowerCase().replace(/[^a-z]/g, '');

/** Students per department as [section, ...]: two in section A, one in section B. */
const SECTION_PLAN = ['A', 'A', 'B'];

export function buildSeed({ staffHash, studentHash, today = collegeToday() }) {
  const now = new Date().toISOString();
  const emails = new Set();
  const unique = (email) => {
    const [local, domain] = email.split('@');
    let e = email;
    let n = 2;
    while (emails.has(e)) e = `${local}${n++}@${domain}`;
    emails.add(e);
    return e;
  };
  const domain = STAFF_EMAIL_DOMAIN;

  const contacts = [];
  let empNo = 1001;

  // Staff: name.DEPT@kongu.edu (faculty) and placement.DEPT@kongu.edu (placement coordinator).
  const addStaff = (dept, name, { designation, office, notes = '', placement = false }) => {
    const i = contacts.length;
    const first = name.replace(/^(Dr|Prof)\.?\s+/i, '').split(/\s+/)[0];
    const key = emailKey(dept.code);
    const email = unique(placement ? `placement.${key}@${domain}` : `${ascii(first)}.${key}@${domain}`);
    contacts.push({
      id: randomUUID(), createdAt: now, updatedAt: now,
      role: 'staff', staffRole: placement ? 'placement' : 'faculty',
      name, email, phone: phone(i + 11), department: dept.name,
      address: `${10 + i} Staff Colony, ${CITIES[i % CITIES.length]}`, notes, status: 'active',
      employeeId: `EMP${empNo++}`, designation, officeLocation: office,
      passwordHash: staffHash, passwordChangedAt: now,
    });
  };

  // One Head of Department and one placement coordinator per department.
  DEPARTMENTS.forEach((dept, d) => {
    const title = ['Dr.', 'Prof.', 'Dr.'][d % 3];
    const name = dept.code === 'CSE'
      ? 'Dr. Meera Krishnan'
      : `${title} ${STAFF_FIRST[(d * 3 + 1) % STAFF_FIRST.length]} ${LAST[(d * 5 + 2) % LAST.length]}`;
    addStaff(dept, name, { designation: 'Professor and Head of Department', office: `${dept.code} Block, Room ${200 + d}`, notes: 'Head of Department' });
    addStaff(dept, `${STAFF_FIRST[(d * 7 + 5) % STAFF_FIRST.length]} ${LAST[(d * 4 + 6) % LAST.length]}`, {
      designation: 'Placement Coordinator', office: 'Placement Cell, Admin Block', notes: 'Runs campus placement drives', placement: true,
    });
  });
  // A few extra faculty members.
  ['CSE', 'IT', 'ECE', 'MECH', 'MBA', 'MCA'].forEach((code, k) => {
    const dept = DEPARTMENTS.find((x) => x.code === code);
    addStaff(dept, `Prof. ${STAFF_FIRST[(k * 4 + 20) % STAFF_FIRST.length]} ${LAST[(k * 3 + 11) % LAST.length]}`, {
      designation: 'Assistant Professor', office: `${dept.code} Block, Room ${300 + k}`,
    });
  });

  // Students: sections A and B in every department.
  const rand = mulberry32(2026);
  const students = [];
  let n = 0;
  DEPARTMENTS.forEach((dept, d) => {
    SECTION_PLAN.forEach((section, k) => {
      const demo = dept.code === 'CSE' && k === 0;
      const first = demo ? 'Aarav' : STUDENT_FIRST[(n + 1) % STUDENT_FIRST.length];
      const last = demo ? 'Sharma' : LAST[(n * 7 + 3) % LAST.length];
      const name = `${first} ${last}`;
      const year = demo ? 3 : 1 + Math.floor(rand() * dept.maxYear);
      const admitted = (2026 - year + 1) % 100;
      const inactive = n === 9 || n === 22;
      const s = {
        id: randomUUID(), createdAt: now, updatedAt: now,
        role: 'student', name, email: unique(`${ascii(first)}.${ascii(last)}@${domain}`), phone: phone(n + 101),
        department: dept.name, section,
        address: `${12 + n} ${STREETS[n % STREETS.length]}, ${CITIES[(n + 3) % CITIES.length]}`,
        notes: inactive ? 'On leave this semester' : '', status: inactive ? 'inactive' : 'active',
        rollNumber: `${pad(admitted, 2)}${dept.code.replace(/[^A-Z]/g, '')}${pad(k + 1)}`,
        course: dept.degree, year,
        guardianName: `${STUDENT_FIRST[(n + 17) % STUDENT_FIRST.length]} ${last}`, guardianPhone: phone(n + 501),
        passwordHash: studentHash, passwordChangedAt: now,
      };
      students.push({ ...s, base: demo ? 0.95 : 0.62 + rand() * 0.36 });
      contacts.push(s);
      n++;
    });
  });

  // Four weeks of weekday attendance up to yesterday, in every period (today is left unmarked to try out).
  const attendance = [];
  const days = [];
  for (let back = 1; days.length < 20; back++) {
    const date = addDays(today, -back);
    if (isWeekday(date)) days.push(date);
  }
  for (const s of students) {
    if (s.status !== 'active') continue;
    for (const date of days) {
      for (let period = 1; period <= PERIODS; period++) {
        const r = rand();
        const status = r < s.base ? (rand() < 0.03 ? 'od' : 'present') : 'absent';
        attendance.push({ studentId: s.id, date, period, status, markedBy: 'seed', updatedAt: now });
      }
    }
  }

  const extra = buildPlacementAndDutySeed({ contacts, today });
  return { contacts, attendance, ...extra };
}

const byCode = (code) => DEPARTMENTS.find((d) => d.code === code).name;

// Fictional companies, so the sample data can never be mistaken for real campus drives.
const SAMPLE_DRIVES = [
  {
    company: 'Nimbus Software Pvt Ltd', role: 'Software Developer', ctc: 6.5, location: 'Coimbatore',
    drive: -40, deadline: -47, status: 'closed',
    rounds: ['Online Aptitude Test', 'Technical Interview', 'HR Interview'],
    eligible: ['CSE', 'IT', 'AIDS', 'AIML', 'CSD', 'MCA', 'CT-UG'],
    description: 'Full-stack development role. Bring your résumé and college ID.',
  },
  {
    company: 'Orion Infotech', role: 'Associate Engineer', ctc: 4.5, location: 'Chennai',
    drive: -15, deadline: -22, status: 'closed',
    rounds: ['Aptitude Test', 'Group Discussion', 'Technical Interview', 'HR Interview'],
    eligible: ['CSE', 'IT', 'ECE', 'EEE', 'EIE', 'AIDS', 'AIML', 'MCA'],
    description: 'Campus drive for engineering graduates.',
  },
  {
    company: 'Summit Analytics', role: 'Data Analyst', ctc: 7, location: 'Chennai (hybrid)',
    drive: 12, deadline: 6, status: 'open',
    rounds: ['Aptitude Test', 'Case Study', 'Technical Interview', 'HR Interview'],
    eligible: ['AIDS', 'AIML', 'CSE', 'IT', 'CSD', 'MBA', 'MCA'],
    description: 'Analytics and reporting role. Knowledge of SQL and statistics preferred.',
  },
  {
    company: 'Vertex Automotive Ltd', role: 'Graduate Engineer Trainee', ctc: 5.2, location: 'Hosur',
    drive: 9, deadline: 4, status: 'open',
    rounds: ['Written Test', 'Technical Interview', 'HR Interview'],
    eligible: ['MECH', 'AUTOMOBILE', 'EEE', 'ECE'],
    description: 'Manufacturing and design trainee programme.',
  },
  {
    company: 'Greenfield Constructions', role: 'Site Engineer', ctc: 3.8, location: 'Bengaluru',
    drive: 16, deadline: 11, status: 'open',
    rounds: ['Aptitude Test', 'Technical Interview'],
    eligible: ['CIVIL', 'MECH'],
    description: 'Site supervision and quantity surveying.',
  },
  {
    company: 'Helix Biofoods', role: 'Quality Analyst', ctc: 3.6, location: 'Erode',
    drive: 20, deadline: 14, status: 'open',
    rounds: ['Written Test', 'Interview'],
    eligible: ['FOOD TECH', 'CHEMICAL', 'NATUROPATHY'],
    description: 'Food safety and quality assurance.',
  },
];

function nextWeekday(from) {
  let d = from;
  while (!isWeekday(d)) d = addDays(d, 1);
  return d;
}

/** Sample placement drives with opt-ins and round results, plus a few pending on-duty requests. */
export function buildPlacementAndDutySeed({ contacts, today = collegeToday() }) {
  const now = new Date().toISOString();
  const rand = mulberry32(77);
  const students = contacts.filter((c) => c.role === 'student' && c.status === 'active');
  const aarav = students.find((s) => s.email === 'aarav.sharma@kongu.edu');
  const staffEmail = contacts.find((c) => c.role === 'staff')?.id || 'seed';

  const drives = [];
  const responses = [];
  const score = (lo, hi) => Math.round(lo + rand() * (hi - lo));

  for (const d of SAMPLE_DRIVES) {
    const drive = {
      id: randomUUID(), createdAt: now, updatedAt: now, company: d.company, role: d.role, ctc: d.ctc,
      location: d.location, driveDate: addDays(today, d.drive), deadline: addDays(today, d.deadline),
      rounds: d.rounds, eligibleDepartments: d.eligible.map(byCode), description: d.description, status: d.status,
    };
    drives.push(drive);

    for (const s of students.filter((x) => drive.eligibleDepartments.includes(x.department))) {
      const isAarav = s.id === aarav?.id;
      let response = null;
      const r = rand();
      if (r < 0.55) response = 'opted_in';
      else if (r < 0.75) response = 'opted_out';
      if (isAarav) response = d.company.startsWith('Nimbus') ? 'opted_in' : d.company.startsWith('Orion') ? 'opted_out' : null;
      if (!response) continue;

      const rec = {
        driveId: drive.id, studentId: s.id, response, respondedAt: now,
        status: 'in_progress', eliminatedRound: null, scores: {}, updatedAt: now, updatedBy: staffEmail,
      };
      if (response === 'opted_in' && d.status === 'closed') {
        const total = d.rounds.length;
        const selected = isAarav ? false : rand() < 0.3;
        const elim = isAarav ? 2 : 1 + Math.floor(rand() * total);
        const last = selected ? total : elim;
        for (let k = 1; k <= last; k++) {
          const failedHere = !selected && k === elim;
          rec.scores[k] = isAarav ? [78, 52][k - 1] : failedHere ? score(30, 59) : score(62, 95);
        }
        rec.status = selected ? 'selected' : 'eliminated';
        rec.eliminatedRound = selected ? null : elim;
      }
      responses.push(rec);
    }
  }

  const onDuty = [];
  const others = students.filter((s) => s.id !== aarav?.id);
  const requests = [
    { s: aarav, from: nextWeekday(addDays(today, 2)), days: 2, reason: 'Representing the college in an inter-college hackathon', place: 'Engineering college, Chennai' },
    { s: others[3], from: nextWeekday(addDays(today, 1)), days: 1, reason: 'Presenting a paper at a national symposium', place: 'Government College of Engineering, Salem' },
    { s: others[8], from: nextWeekday(addDays(today, 3)), days: 3, reason: 'Inter-college sports meet (state level)', place: 'Sports stadium, Coimbatore' },
  ];
  for (const q of requests) {
    if (!q.s) continue;
    const dates = Array.from({ length: q.days }, (_, i) => addDays(q.from, i));
    onDuty.push({
      id: randomUUID(), createdAt: now, status: 'pending', applied: [], studentId: q.s.id,
      reason: q.reason, place: q.place, fromDate: q.from, days: q.days, toDate: dates[dates.length - 1],
      dates: dates.filter(isWeekday), proofFile: null, proofName: null, proofType: null,
    });
  }

  return { drives, responses, onDuty };
}
