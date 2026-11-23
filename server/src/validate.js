import { findDepartment, parseStaffEmail, SECTIONS, STAFF_EMAIL_DOMAIN, emailKey } from './departments.js';

export const ROLES = ['student', 'staff'];
export const STATUSES = ['active', 'inactive'];
export const ATTENDANCE_STATUSES = ['present', 'absent', 'od']; // od = on duty

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s()-]{7,18}$/;

const str = (v) => (typeof v === 'string' ? v.trim() : '');

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters';
  if (pw.length > 72) return 'Password must be 72 characters or fewer';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain at least one letter and one number';
  return null;
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Attendance period: a whole number from 1 to PERIODS. */
export const isPeriod = (v, max) => Number.isInteger(v) && v >= 1 && v <= max;

export const isSection = (v) => SECTIONS.includes(v);

/**
 * Validates and normalises a contact payload.
 * Returns { errors, value }. `errors` is an object keyed by field name.
 * Staff department and role come from the email address (name.dept@kongu.edu / placement.dept@kongu.edu).
 */
export function validateContact(body = {}) {
  const errors = {};
  const role = str(body.role).toLowerCase();

  const value = {
    role,
    name: str(body.name),
    email: str(body.email).toLowerCase(),
    phone: str(body.phone),
    department: str(body.department),
    address: str(body.address),
    notes: str(body.notes),
    status: str(body.status).toLowerCase() || 'active',
  };

  if (!ROLES.includes(role)) errors.role = 'Role must be "student" or "staff"';
  if (value.name.length < 2) errors.name = 'Name must be at least 2 characters';
  if (value.name.length > 100) errors.name = 'Name must be 100 characters or fewer';
  if (!EMAIL_RE.test(value.email)) errors.email = 'Enter a valid email address';
  if (!PHONE_RE.test(value.phone)) errors.phone = 'Enter a valid phone number';
  if (!STATUSES.includes(value.status)) errors.status = 'Status must be "active" or "inactive"';

  if (role === 'staff') {
    const parsed = parseStaffEmail(value.email);
    if (!parsed) {
      errors.email = `Staff email must be name.DEPT@${STAFF_EMAIL_DOMAIN} (e.g. praveen.csd@${STAFF_EMAIL_DOMAIN}), or placement.DEPT@${STAFF_EMAIL_DOMAIN} for the placement coordinator`;
    } else {
      const dept = findDepartment(value.department);
      if (dept && dept.code !== parsed.department.code) {
        errors.department = `This email belongs to ${parsed.department.name}. Choose that department.`;
      }
      value.department = parsed.department.name;
      value.staffRole = parsed.role;
    }
    value.employeeId = str(body.employeeId).toUpperCase();
    value.designation = str(body.designation);
    value.officeLocation = str(body.officeLocation);

    if (!value.employeeId) errors.employeeId = 'Employee ID is required for staff';
    if (!value.designation) errors.designation = 'Designation is required for staff';
  } else {
    const dept = findDepartment(value.department);
    if (!dept) errors.department = 'Select a department from the list';

    value.rollNumber = str(body.rollNumber).toUpperCase();
    value.course = str(body.course);
    value.year = Number(body.year);
    value.section = str(body.section).toUpperCase();
    value.guardianName = str(body.guardianName);
    value.guardianPhone = str(body.guardianPhone);

    if (!value.rollNumber) errors.rollNumber = 'Roll number is required for students';
    if (!value.course) errors.course = 'Course is required for students';
    if (!Number.isInteger(value.year) || value.year < 1) errors.year = 'Select a valid year';
    else if (dept && value.year > dept.maxYear) errors.year = `${dept.name} is a ${dept.maxYear}-year programme`;
    if (!isSection(value.section)) errors.section = 'Select a section (A to H)';
    if (value.guardianPhone && !PHONE_RE.test(value.guardianPhone)) errors.guardianPhone = 'Enter a valid guardian phone number';
  }

  return { errors, value };
}

export { emailKey };
