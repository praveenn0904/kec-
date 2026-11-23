/** Removes secrets before a contact leaves the server. */
export const publicContact = ({ passwordHash, passwordChangedAt, ...rest }) => rest;

/**
 * What `viewer` may see of contact `c`, or null.
 *  - everyone sees their own record (students: without internal notes)
 *  - department staff (faculty) see everyone in their own department, in full
 *  - placement coordinators see no directory entries (their work is in Placements)
 *  - students see active staff's official details (no home address or notes)
 *  - students never see other students
 */
export function viewFor(viewer, c) {
  if (viewer.role === 'admin') return publicContact(c);
  if (c.id === viewer.id) {
    if (viewer.role === 'student') {
      const { notes, ...rest } = publicContact(c);
      return rest;
    }
    return publicContact(c);
  }
  if (viewer.role === 'staff') {
    return viewer.staffRole !== 'placement' && c.department === viewer.department ? publicContact(c) : null;
  }
  if (c.role === 'staff' && c.status === 'active') {
    const { notes, address, ...rest } = publicContact(c);
    return rest;
  }
  return null;
}

export const DUPLICATE_MESSAGES = {
  email: 'This email address is already registered',
  rollNumber: 'This roll number is already registered',
  employeeId: 'This employee ID already exists',
};
