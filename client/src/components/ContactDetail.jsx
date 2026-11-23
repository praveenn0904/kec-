import { useAuth } from '../auth.jsx';
import { fmtDate } from '../utils.js';
import { Avatar, RoleBadge, StatusChip } from './ui.jsx';
import AttendanceDetail from './AttendanceDetail.jsx';

function Row({ label, children }) {
  if (children === undefined || children === null || children === '') return null;
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function ContactDetail({ contact: c, onEdit, onDelete }) {
  const { user } = useAuth();
  const isStaffViewer = user.role === 'staff';
  const isStudent = c.role === 'student';

  return (
    <div className="detail">
      <div className="detail-hero">
        <Avatar name={c.name} role={c.role} size="lg" />
        <div>
          <h3>{c.name}</h3>
          <p className="muted">{isStudent ? `${c.course} · Year ${c.year}` : c.designation}</p>
          <div className="detail-tags">
            <RoleBadge role={c.role} />
            {c.status && <StatusChip status={c.status} />}
          </div>
        </div>
      </div>

      <dl>
        <Row label="Department">{c.department}</Row>
        <Row label={isStudent ? 'Roll number' : 'Employee ID'}>{isStudent ? c.rollNumber : c.employeeId}</Row>
        <Row label="Email"><a href={`mailto:${c.email}`}>{c.email}</a></Row>
        <Row label="Phone"><a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a></Row>
        {isStudent ? (
          <>
            <Row label="Guardian">{c.guardianName}</Row>
            <Row label="Guardian phone">{c.guardianPhone}</Row>
          </>
        ) : (
          <Row label="Office">{c.officeLocation}</Row>
        )}
        <Row label="Address">{c.address}</Row>
        <Row label="Notes">{c.notes}</Row>
        {isStaffViewer && <Row label="Added">{fmtDate(c.createdAt)}</Row>}
        {isStaffViewer && <Row label="Last updated">{fmtDate(c.updatedAt)}</Row>}
      </dl>

      {isStaffViewer && isStudent && (
        <>
          <h3 className="section-title">Attendance</h3>
          <AttendanceDetail studentId={c.id} compact />
        </>
      )}

      {isStaffViewer && (
        <div className="form-actions">
          {c.id !== user.id && <button type="button" className="btn btn-danger" onClick={() => onDelete(c)}>Delete</button>}
          <button type="button" className="btn btn-primary" onClick={() => onEdit(c)}>Edit</button>
        </div>
      )}
    </div>
  );
}
