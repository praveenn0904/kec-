import { useAuth } from '../auth.jsx';
import { PageHeader } from '../components/ui.jsx';
import AttendanceDetail from '../components/AttendanceDetail.jsx';

export default function MyAttendance() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="My Attendance" subtitle={`${user.name} · ${user.rollNumber} · ${user.department}`} />
      <div className="card card-pad">
        <AttendanceDetail studentId={user.id} />
      </div>
    </>
  );
}
