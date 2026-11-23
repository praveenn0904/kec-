/** Academic rules: marks, GPA, CAT tests, timetable slots and drive eligibility. */

export const SEMESTERS = 8;
export const CAT_TESTS = [1, 2, 3];
export const CAT_MAX = 50;
export const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const TEACHING_DAYS = [1, 2, 3, 4, 5, 6];

const blankToNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const isNum = (v) => v !== null && Number.isFinite(v);

/** Academic record of a student: 10th and 12th percentages, eight semester GPAs, CGPA and arrears. */
export function validateAcademics(body = {}) {
  const errors = {};
  const tenth = blankToNull(body.tenthPercent);
  const twelfth = blankToNull(body.twelfthPercent);
  if (tenth !== null && (!isNum(tenth) || tenth < 0 || tenth > 100)) errors.tenthPercent = 'Enter a percentage between 0 and 100';
  if (twelfth !== null && (!isNum(twelfth) || twelfth < 0 || twelfth > 100)) errors.twelfthPercent = 'Enter a percentage between 0 and 100';

  let gpas = [];
  if (Array.isArray(body.semesterGpa)) gpas = body.semesterGpa.map(blankToNull);
  else if (body.semesterGpa !== undefined && body.semesterGpa !== null && body.semesterGpa !== '') errors.semesterGpa = 'Semester GPAs must be a list';
  if (gpas.length > SEMESTERS) errors.semesterGpa = `At most ${SEMESTERS} semesters`;
  if (gpas.some((g) => g !== null && (!isNum(g) || g < 0 || g > 10))) errors.semesterGpa = 'Each GPA must be between 0 and 10';
  const semesterGpa = Array.from({ length: SEMESTERS }, (_, i) => (isNum(gpas[i]) ? gpas[i] : null));

  let cgpa = blankToNull(body.cgpa);
  if (cgpa !== null && (!isNum(cgpa) || cgpa < 0 || cgpa > 10)) errors.cgpa = 'CGPA must be between 0 and 10';
  if (cgpa === null) {
    const known = semesterGpa.filter(isNum);
    if (known.length) cgpa = Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 100) / 100;
  }

  const arrears = blankToNull(body.arrears) ?? 0;
  if (!Number.isInteger(arrears) || arrears < 0 || arrears > 50) errors.arrears = 'Arrears must be a whole number from 0 to 50';

  return {
    errors,
    value: { tenthPercent: tenth, twelfthPercent: twelfth, semesterGpa, cgpa, arrears },
  };
}

/** Placement eligibility criteria chosen by the coordinator for one drive. null means "no limit". */
export function validateCriteria(body = {}) {
  const errors = {};
  const pct = (v, name, label) => {
    const n = blankToNull(v);
    if (n !== null && (!isNum(n) || n < 0 || n > 100)) errors[name] = `${label} must be between 0 and 100`;
    return n;
  };
  const value = {
    tenthMin: pct(body.tenthMin, 'tenthMin', '10th minimum'),
    twelfthMin: pct(body.twelfthMin, 'twelfthMin', '12th minimum'),
  };
  const cgpa = blankToNull(body.cgpaMin);
  if (cgpa !== null && (!isNum(cgpa) || cgpa < 0 || cgpa > 10)) errors.cgpaMin = 'CGPA minimum must be between 0 and 10';
  value.cgpaMin = cgpa;
  const arrears = blankToNull(body.maxArrears);
  if (arrears !== null && (!Number.isInteger(arrears) || arrears < 0 || arrears > 50)) errors.maxArrears = 'Maximum arrears must be a whole number from 0 to 50';
  value.maxArrears = arrears;
  return { errors, value };
}

/** Explains whether a student meets the criteria. Missing marks count as failing a limit that is set. */
export function checkEligibility(criteria = {}, academics = {}) {
  const reasons = [];
  const a = academics || {};
  const c = criteria || {};
  if (c.tenthMin != null) {
    if (a.tenthPercent == null) reasons.push('10th percentage is not recorded');
    else if (a.tenthPercent < c.tenthMin) reasons.push(`10th ${a.tenthPercent}% is below the ${c.tenthMin}% minimum`);
  }
  if (c.twelfthMin != null) {
    if (a.twelfthPercent == null) reasons.push('12th percentage is not recorded');
    else if (a.twelfthPercent < c.twelfthMin) reasons.push(`12th ${a.twelfthPercent}% is below the ${c.twelfthMin}% minimum`);
  }
  if (c.cgpaMin != null) {
    if (a.cgpa == null) reasons.push('CGPA is not recorded');
    else if (a.cgpa < c.cgpaMin) reasons.push(`CGPA ${a.cgpa} is below the ${c.cgpaMin} minimum`);
  }
  if (c.maxArrears != null && (a.arrears ?? 0) > c.maxArrears) {
    reasons.push(`${a.arrears} arrears; the limit is ${c.maxArrears}`);
  }
  return { eligible: reasons.length === 0, reasons };
}

/** A timetable slot: one subject taught by one staff member to one class in one period of one day. */
export function validateSlot(body = {}) {
  const errors = {};
  const year = Number(body.year);
  const day = Number(body.day);
  const period = Number(body.period);
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const staffId = typeof body.staffId === 'string' ? body.staffId : '';
  const section = typeof body.section === 'string' ? body.section.toUpperCase() : '';
  if (!Number.isInteger(year) || year < 1 || year > 4) errors.year = 'Choose a year from 1 to 4';
  if (!['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(section)) errors.section = 'Choose a section from A to H';
  if (!TEACHING_DAYS.includes(day)) errors.day = 'Choose a teaching day (Monday to Saturday)';
  if (!Number.isInteger(period) || period < 1 || period > 8) errors.period = 'Choose a period from 1 to 8';
  if (subject.length < 2 || subject.length > 60) errors.subject = 'Subject name must be 2 to 60 characters';
  if (!staffId) errors.staffId = 'Choose the staff member who teaches this period';
  return { errors, value: { year, section, day, period, subject, staffId } };
}

/** One CAT mark: a number from 0 to CAT_MAX, or null to clear it. */
export function validateCatMark(v) {
  if (v === null || v === '' || v === undefined) return { ok: true, value: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > CAT_MAX) return { ok: false, value: null };
  return { ok: true, value: Math.round(n * 2) / 2 };
}

export const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay(); // 1 = Monday ... 6 = Saturday, 0 = Sunday
