import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, kindOf } from '../auth.jsx';
import { fmtPct, localDate, pctTone } from '../utils.js';
import { Avatar, PageHeader, Spinner } from '../components/ui.jsx';
import { AttendanceRing, PercentBar } from '../components/AttendanceDetail.jsx';

function StatCard({ label, value, tone, hint }) {
  return (
    <div className={`card stat stat-${tone}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value ?? '–'}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

function FacultyDashboard({ user }) {
  const [stats, setStats] = useState(null);
  const [low, setLow] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.stats(localDate()),
      api.attendanceReport({ below: 75, sort: 'percentage', limit: 6 }),
      api.onDuty({ status: 'pending' }),
    ])
      .then(([s, l, od]) => {
        setStats(s);
        setLow(l);
        setPending(od.counts.pending);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="banner banner-error" role="alert">{error}</div>;
  if (!stats) return <Spinner label="Loading dashboard…" />;

  const a = stats.attendanceToday;
  const todayPct = a.marked ? Math.round(((a.present + a.od) / a.marked) * 1000) / 10 : null;

  return (
    <>
      <PageHeader title={`Welcome, ${user.name}`} subtitle={`${user.department} department · ${stats.periods} periods a day`} />

      <div className="stat-grid">
        <StatCard label="Active students" value={stats.students} tone="student" />
        <StatCard label="Department staff" value={stats.staff} tone="staff" />
        <StatCard label="Classes" value={stats.classes.length} tone="primary" hint="Year and section pairs" />
        <StatCard
          label="Today's attendance"
          value={a.marked ? fmtPct(todayPct) : 'Not marked'}
          tone={a.marked ? pctTone(todayPct) : 'muted'}
          hint={a.marked ? `${a.periodsMarked} of ${stats.periods} periods marked` : 'No period marked yet today'}
        />
      </div>

      <div className="dash-grid">
        <section className="card card-pad">
          <div className="card-head">
            <h2 className="card-title">Classes in your department</h2>
            <Link to="/attendance" className="link">Mark attendance</Link>
          </div>
          {stats.classes.length === 0 ? (
            <p className="muted">No students are registered in your department yet.</p>
          ) : (
            <ul className="class-grid">
              {stats.classes.map((c) => (
                <li key={`${c.year}${c.section}`}>
                  <Link to={`/attendance?year=${c.year}&section=${c.section}`} className="class-chip">
                    <strong>Year {c.year} · {c.section}</strong>
                    <small>{c.students} student{c.students === 1 ? "" : "s"}</small>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="dash-side">
          <section className="card card-pad">
            <h2 className="card-title">Needs your attention</h2>
            <ul className="todo-list">
              <li>
                <div><strong>{pending ?? '–'}</strong><span>On-duty requests waiting</span></div>
                <Link to="/onduty" className="btn btn-small">Review</Link>
              </li>
            </ul>
          </section>

          <section className="card card-pad">
            <h2 className="card-title">Today</h2>
            {a.marked === 0 ? (
              <p className="muted">Attendance has not been marked today.</p>
            ) : (
              <div className="today">
                <AttendanceRing percentage={todayPct} size={104} label="present" />
                <dl className="att-counts">
                  <div><dt>Present</dt><dd className="t-good">{a.present}</dd></div>
                  <div><dt>On duty</dt><dd>{a.od}</dd></div>
                  <div><dt>Absent</dt><dd className="t-bad">{a.absent}</dd></div>
                </dl>
              </div>
            )}
          </section>

          <section className="card card-pad">
            <div className="card-head">
              <h2 className="card-title">Needs attention</h2>
              <span className="muted">Below 75%</span>
            </div>
            {!low ? <Spinner /> : low.data.length === 0 ? (
              <p className="muted">Every student is at or above 75%.</p>
            ) : (
              <ul className="low-list">
                {low.data.map((s) => (
                  <li key={s.id}>
                    <div>
                      <strong>{s.name}</strong>
                      <small>{s.rollNumber} · Year {s.year} {s.section}</small>
                    </div>
                    <div className="pct-cell">
                      <PercentBar value={s.percentage} />
                      <span className="pct t-bad">{fmtPct(s.percentage)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {low && low.meta.total > low.data.length && <p className="muted small">+ {low.meta.total - low.data.length} more in Reports</p>}
          </section>
        </div>
      </div>
    </>
  );
}

function StudentDashboard({ user }) {
  const [att, setAtt] = useState(null);
  const [faculty, setFaculty] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.studentAttendance(user.id), api.contacts({ department: user.department, limit: 6 })])
      .then(([a, f]) => {
        setAtt(a);
        setFaculty(f.data);
      })
      .catch((e) => setError(e.message));
  }, [user.id, user.department]);

  if (error) return <div className="banner banner-error" role="alert">{error}</div>;
  if (!att) return <Spinner label="Loading dashboard…" />;

  const { summary } = att;

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} subtitle={`${user.department} · Year ${user.year} · Section ${user.section}`} />

      <div className="dash-grid">
        <section className="card card-pad">
          <div className="card-head">
            <h2 className="card-title">My attendance</h2>
            <Link to="/my-attendance" className="link">View details</Link>
          </div>
          {summary.total === 0 ? (
            <p className="muted">No attendance has been recorded for you yet.</p>
          ) : (
            <div className="att-summary">
              <AttendanceRing percentage={summary.percentage} />
              <dl className="att-counts">
                <div><dt>Periods recorded</dt><dd>{summary.total}</dd></div>
                <div><dt>Present</dt><dd className="t-good">{summary.present}</dd></div>
                <div><dt>On duty</dt><dd>{summary.od}</dd></div>
                <div><dt>Absent</dt><dd className="t-bad">{summary.absent}</dd></div>
              </dl>
            </div>
          )}
          {summary.percentage !== null && summary.percentage < 75 && (
            <p className="banner banner-warn">Your attendance is below the 75% requirement.</p>
          )}
        </section>

        <div className="dash-side">
          <section className="card card-pad">
            <h2 className="card-title">My details</h2>
            <dl className="mini-details">
              <div><dt>Roll number</dt><dd>{user.rollNumber}</dd></div>
              <div><dt>Course</dt><dd>{user.course}</dd></div>
              <div><dt>Email</dt><dd>{user.email}</dd></div>
              <div><dt>Phone</dt><dd>{user.phone}</dd></div>
            </dl>
            <Link to="/profile" className="btn btn-block">Edit my details</Link>
          </section>
        </div>
      </div>

      <section className="card card-pad section-gap">
        <div className="card-head">
          <h2 className="card-title">Staff in your department</h2>
          <Link to="/directory" className="link">Staff directory</Link>
        </div>
        {!faculty ? <Spinner /> : faculty.length === 0 ? (
          <p className="muted">No staff are listed for your department yet.</p>
        ) : (
          <ul className="faculty-list">
            {faculty.map((f) => (
              <li key={f.id}>
                <Avatar name={f.name} role="staff" />
                <div>
                  <strong>{f.name}</strong>
                  <small>{f.designation}</small>
                  <small><a href={`mailto:${f.email}`}>{f.email}</a></small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const kind = kindOf(user);
  if (kind === 'placement') return <Navigate to="/placements" replace />;
  if (kind === 'admin') return <Navigate to="/directory" replace />;
  return kind === 'student' ? <StudentDashboard user={user} /> : <FacultyDashboard user={user} />;
}
