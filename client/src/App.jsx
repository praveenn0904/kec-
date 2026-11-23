import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, kindOf } from './auth.jsx';
import { Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Directory from './pages/Directory.jsx';
import Attendance from './pages/Attendance.jsx';
import Timetable from './pages/Timetable.jsx';
import Cat from './pages/Cat.jsx';
import MyAttendance from './pages/MyAttendance.jsx';
import Profile from './pages/Profile.jsx';
import OnDuty from './pages/OnDuty.jsx';
import Placements from './pages/Placements.jsx';

function RequireAuth({ children }) {
  const { user, loading, loggedOut } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Signing you in…" />;
  if (!user) return <Navigate to="/login" replace state={loggedOut ? null : { from: location }} />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Loading…" />;
  if (user) return <Navigate to={location.state?.from?.pathname || '/'} replace />;
  return children;
}

/** Only the listed kinds of account may open this page: 'student', 'faculty' or 'placement'. */
function RequireKind({ allow, children }) {
  const { user } = useAuth();
  return allow.includes(kindOf(user)) ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/directory" element={<RequireKind allow={['admin', 'faculty', 'student']}><Directory /></RequireKind>} />
        <Route path="/timetable" element={<RequireKind allow={['admin', 'faculty', 'student']}><Timetable /></RequireKind>} />
        <Route path="/attendance" element={<RequireKind allow={['faculty']}><Attendance /></RequireKind>} />
        <Route path="/cat" element={<RequireKind allow={['faculty', 'student']}><Cat /></RequireKind>} />
        <Route path="/my-attendance" element={<RequireKind allow={['student']}><MyAttendance /></RequireKind>} />
        <Route path="/onduty" element={<RequireKind allow={['faculty', 'student']}><OnDuty /></RequireKind>} />
        <Route path="/placements" element={<RequireKind allow={['student', 'placement']}><Placements /></RequireKind>} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
