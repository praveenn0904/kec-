// Every department of the college, with its full name.
// `maxYear` is the length of the programme in years, `degree` is the default course name.
// To add or rename a department, edit this list only.
export const DEPARTMENTS = [
  { code: 'AIDS', name: 'Artificial Intelligence and Data Science', degree: 'B.Tech', maxYear: 4 },
  { code: 'AIML', name: 'Artificial Intelligence and Machine Learning', degree: 'B.Tech', maxYear: 4 },
  { code: 'CSE', name: 'Computer Science and Engineering', degree: 'B.E.', maxYear: 4 },
  { code: 'CSD', name: 'Computer Science and Design', degree: 'B.Tech', maxYear: 4 },
  { code: 'CIVIL', name: 'Civil Engineering', degree: 'B.E.', maxYear: 4 },
  { code: 'MECH', name: 'Mechanical Engineering', degree: 'B.E.', maxYear: 4 },
  { code: 'AUTOMOBILE', name: 'Automobile Engineering', degree: 'B.E.', maxYear: 4 },
  { code: 'NATUROPATHY', name: 'Naturopathy', degree: 'B.N.Y.S.', maxYear: 5 },
  { code: 'CT-UG', name: 'Computer Technology (UG)', degree: 'B.Sc', maxYear: 3 },
  { code: 'MBA', name: 'Master of Business Administration', degree: 'M.B.A.', maxYear: 2 },
  { code: 'MCA', name: 'Master of Computer Applications', degree: 'M.C.A.', maxYear: 2 },
  { code: 'IT', name: 'Information Technology', degree: 'B.Tech', maxYear: 4 },
  { code: 'CHEMICAL', name: 'Chemical Engineering', degree: 'B.Tech', maxYear: 4 },
  { code: 'FOOD TECH', name: 'Food Technology', degree: 'B.Tech', maxYear: 4 },
  { code: 'EEE', name: 'Electrical and Electronics Engineering', degree: 'B.E.', maxYear: 4 },
  { code: 'ECE', name: 'Electronics and Communication Engineering', degree: 'B.E.', maxYear: 4 },
  { code: 'EIE', name: 'Electronics and Instrumentation Engineering', degree: 'B.E.', maxYear: 4 },
];

export const findDepartment = (name) => DEPARTMENTS.find((d) => d.name === name) || null;

// ---------------------------------------------------------------- academic structure

/** Class sections within a year. */
export const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** Teaching periods in one working day. Attendance is taken for each period. */
export const PERIODS = 8;

/** Lower-case key used in staff email addresses, e.g. CSD -> "csd", FOOD TECH -> "foodtech", CT-UG -> "ctug". */
export const emailKey = (code) => code.toLowerCase().replace(/[^a-z0-9]/g, '');

export const findDepartmentByKey = (key) => DEPARTMENTS.find((d) => emailKey(d.code) === key) || null;

export const STAFF_EMAIL_DOMAIN = 'kongu.edu';

/**
 * Staff emails carry their department:  praveen.csd@kongu.edu  (faculty of CSD)
 *                                       placement.csd@kongu.edu (placement coordinator of CSD)
 * Returns { who, department, role } or null when the address does not follow the pattern.
 */
export function parseStaffEmail(email) {
  const m = String(email || '').trim().toLowerCase().match(/^([a-z]+)\.([a-z0-9]+)@kongu\.edu$/);
  if (!m) return null;
  const department = findDepartmentByKey(m[2]);
  if (!department) return null;
  return { who: m[1], department, role: m[1] === 'placement' ? 'placement' : 'faculty' };
}
