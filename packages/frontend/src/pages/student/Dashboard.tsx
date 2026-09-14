import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StudentDashboard } from 'shared';
import {
  Bell,
  Building2,
  Calendar,
  ChevronRight,
  HelpCircle,
  LogOut,
  MapPin,
  MessageSquare,
  Pencil,
  Search,
} from 'lucide-react';
import { StudentContext } from '../../context/StudentContext';
import { getStudentDashboard, logout } from '../../api/api';
import { formatDate } from '../../utils/format';
import './styles/dashboard.css';

const Dashboard = () => {
  const { Student, assignedFaculty } = useContext(StudentContext);
  const navigate = useNavigate();
  // Server-side aggregate: one request instead of fanning out across the
  // profile, query and meeting endpoints.
  const [summary, setSummary] = useState<StudentDashboard | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStudentDashboard()
      .then(({ data }) => {
        if (!cancelled) setSummary(data);
      })
      // The rest of the page renders from context, so a failed summary
      // degrades the status tiles rather than blanking the dashboard.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (Student === null) {
    return <div className="sd-loading">Loading dashboard…</div>;
  }

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/');
  };

  const initials = (Student.name !== '' ? Student.name : 'S')
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const department =
    Student.branch !== null && Student.branch !== ''
      ? `Department of ${Student.branch}`
      : (Student.degree ?? 'Department');

  return (
    <div className="sd-page">
      {/* Top bar */}
      <header className="sd-topbar">
        <p className="sd-breadcrumb">
          <span>Home</span>
          <ChevronRight size={14} />
          <span className="sd-breadcrumb-current">Student Profile</span>
        </p>
        <div className="sd-topbar-actions">
          <div className="sd-search">
            <Search size={16} />
            <input type="text" placeholder="Search portal..." />
          </div>
          <button className="sd-icon-btn" aria-label="Notifications">
            <Bell size={18} />
            <span className="sd-icon-dot" />
          </button>
          <button className="sd-icon-btn" aria-label="Help">
            <HelpCircle size={18} />
          </button>
          <button
            className="sd-icon-btn"
            aria-label="Log out"
            onClick={() => void handleLogout()}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Hero profile banner */}
      <section className="sd-hero">
        <div className="sd-hero-decoration" />
        <div className="sd-hero-avatar">{initials}</div>
        <div className="sd-hero-info">
          <div className="sd-hero-name">
            <h1>{Student.name !== '' ? Student.name : 'Student'}</h1>
            <span className="sd-badge sd-badge-active">ACTIVE</span>
          </div>
          <ul className="sd-hero-meta">
            <li>
              <span className="sd-meta-key">#</span>
              {Student.registration_no}
            </li>
            <li>
              <Building2 size={15} />
              {department}
            </li>
            {Student.year !== null && (
              <li>
                <MapPin size={15} />
                Year {Student.year}
              </li>
            )}
          </ul>
        </div>
        <button
          className="sd-btn-primary"
          onClick={() => navigate('/edit-profile')}
        >
          <Pencil size={15} /> Edit Profile
        </button>
      </section>

      {/* Two-column content grid */}
      <div className="sd-grid">
        {/* Left column */}
        <div className="sd-col-main">
          <article className="sd-card sd-about">
            <div className="sd-card-head">
              <h3>About Me</h3>
              <button
                className="sd-link-btn"
                onClick={() => navigate('/edit-profile')}
              >
                Edit
              </button>
            </div>
            <p className="sd-about-body">
              {Student.name !== ''
                ? Student.name.split(' ')[0]
                : 'This student'}{' '}
              is a student in the {department.replace('Department of ', '')}{' '}
              programme at MARG. Add a personal bio from Edit Profile to
              introduce yourself to mentors and peers.
            </p>
          </article>

          <article className="sd-card sd-mentor">
            <div className="sd-card-head">
              <h3>Primary Mentor</h3>
              <button className="sd-btn-ghost">
                <MessageSquare size={15} /> Send Message
              </button>
            </div>
            {assignedFaculty !== null ? (
              <div className="sd-mentor-body">
                <div className="sd-mentor-avatar">
                  {assignedFaculty.name.charAt(0).toUpperCase()}
                </div>
                <div className="sd-mentor-info">
                  <h4>{assignedFaculty.name}</h4>
                  <p>{assignedFaculty.department ?? 'Faculty'}</p>
                  <div className="sd-mentor-tags">
                    {summary !== null && (
                      <span className="sd-chip">
                        <Calendar size={13} /> {summary.meetings.total}{' '}
                        {summary.meetings.total === 1 ? 'meeting' : 'meetings'}
                      </span>
                    )}
                    {assignedFaculty.designation !== null && (
                      <span className="sd-chip sd-chip-accent">
                        {assignedFaculty.designation}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="sd-mentor-empty">
                <p>No mentor assigned yet.</p>
                <span>You&apos;ll see your mentor here once allocated.</span>
              </div>
            )}
          </article>
        </div>

        {/* Right column */}
        <div className="sd-col-side">
          <p className="sd-side-label">QUICK STATUS</p>

          <button className="sd-status" onClick={() => navigate('/new-query')}>
            <span className="sd-status-icon sd-status-icon-amber">
              <MessageSquare size={18} />
            </span>
            <span className="sd-status-text">
              <span className="sd-status-key">CURRENT QUERY</span>
              <span className="sd-status-val">
                {summary === null
                  ? '—'
                  : summary.queries.pending === 0
                    ? 'Nothing pending'
                    : `${summary.queries.pending} pending`}
              </span>
            </span>
            <ChevronRight size={16} className="sd-status-chevron" />
          </button>

          <button
            className="sd-status"
            onClick={() => navigate('/student-meetings')}
          >
            <span className="sd-status-icon sd-status-icon-blue">
              <Calendar size={18} />
            </span>
            <span className="sd-status-text">
              <span className="sd-status-key">NEXT MEETING</span>
              <span className="sd-status-val">
                {summary === null
                  ? '—'
                  : summary.upcomingMeetings.length === 0
                    ? 'None scheduled'
                    : formatDate(summary.upcomingMeetings[0].created_at)}
              </span>
            </span>
            <ChevronRight size={16} className="sd-status-chevron" />
          </button>

          {/* This tile used to display a fixed CGPA. Nothing in the schema
              records one, so it now reports meeting progress, which is real. */}
          <article className="sd-card sd-cgpa">
            <p className="sd-side-label">MEETINGS COMPLETED</p>
            <div className="sd-cgpa-value">
              <strong>{summary?.meetings.completed ?? 0}</strong>
              <span>/ {summary?.meetings.total ?? 0}</span>
            </div>
            <div className="sd-cgpa-bar">
              <span
                style={{
                  width:
                    summary === null || summary.meetings.total === 0
                      ? '0%'
                      : `${Math.round(
                          (summary.meetings.completed /
                            summary.meetings.total) *
                            100
                        )}%`,
                }}
              />
            </div>
          </article>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
