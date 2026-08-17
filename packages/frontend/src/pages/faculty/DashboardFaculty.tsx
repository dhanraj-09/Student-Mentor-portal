import { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Calendar,
  Clock,
  List,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';
import type { Query, QueryStatus } from 'shared';
import {
  getApiErrorMessage,
  getAssignedStudents,
  getFacultyQueries,
  respondToQuery,
} from '../../api/api';
import { FacultyContext } from '../../context/FacultyContext';
import { formatDate, formatDateTime } from '../../utils/format';
import './facultydashboard.css';

const FacultyDashboard = () => {
  const { faculty, loading: authLoading } = useContext(FacultyContext);
  const navigate = useNavigate();

  const [queries, setQueries] = useState<Query[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);

  const [selectedQuery, setSelectedQuery] = useState<Query | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [responseStatus, setResponseStatus] = useState<QueryStatus>('Pending');
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');

  const facultyEmail = faculty?.email;

  const fetchDashboardData = useCallback(async (): Promise<void> => {
    if (facultyEmail === undefined) return;

    setDataLoading(true);

    try {
      const studentsRes = await getAssignedStudents();
      setStudentCount(
        Array.isArray(studentsRes.data) ? studentsRes.data.length : 0
      );
    } catch (error) {
      console.error('Failed to load student count', error);
      setStudentCount(0);
    }

    try {
      const queriesRes = await getFacultyQueries(facultyEmail);
      setQueries(Array.isArray(queriesRes.data) ? queriesRes.data : []);
    } catch (error) {
      console.error('Failed to load queries', error);
      setQueries([]);
    }

    setDataLoading(false);
  }, [facultyEmail]);

  useEffect(() => {
    if (!authLoading && facultyEmail !== undefined) {
      void fetchDashboardData();
    }
  }, [authLoading, facultyEmail, fetchDashboardData]);

  const openQuery = (q: Query): void => {
    setSelectedQuery(q);
    setResponseText(q.response ?? '');
    setResponseStatus(q.status);
    setSaveError('');
    setIsPanelOpen(true);
  };

  const closePanel = (): void => {
    setIsPanelOpen(false);
    setSelectedQuery(null);
  };

  const handleSaveResponse = async (): Promise<void> => {
    if (selectedQuery === null) return;
    setSubmitting(true);
    setSaveError('');
    try {
      await respondToQuery(selectedQuery.query_id, {
        response: responseText,
        status: responseStatus,
      });
      await fetchDashboardData();
      closePanel();
    } catch (err) {
      setSaveError(
        getApiErrorMessage(err, 'Failed to save. Please try again.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const statusPill = (status: QueryStatus) => {
    const cls = status.toLowerCase() === 'resolved' ? 'green' : 'yellow';
    return <span className={`pill-tag ${cls}`}>{status.toUpperCase()}</span>;
  };

  if (authLoading)
    return <div className="loading-state">Authenticating...</div>;
  if (faculty === null)
    return (
      <div className="loading-state">Session expired. Please log in again.</div>
    );

  const pendingCount = queries.filter(
    (q) => q.status.toLowerCase() !== 'resolved'
  ).length;

  return (
    <div className="faculty-dashboard-main">
      <div className="dash-top-bar">
        <h2 className="dash-title">Dashboard</h2>
        <div className="dash-top-right">
          <div className="search-bar">
            <Search size={18} color="#888" />
            <input type="text" placeholder="Search students or queries..." />
          </div>
          <button className="icon-btn">
            <Bell size={20} />
          </button>
          <button className="icon-btn">
            <User size={20} />
          </button>
        </div>
      </div>

      <div className="welcome-section">
        <h1>Welcome back, {faculty.name}.</h1>
        <p>You have {pendingCount} pending queries to address today.</p>
      </div>

      <div className="summary-cards-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="icon-wrapper alert">
              <AlertCircle size={20} />
            </div>
            <span className="pill-tag red">High Priority</span>
          </div>
          <h2>{pendingCount}</h2>
          <p>PENDING QUERIES</p>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div className="icon-wrapper calendar">
              <Calendar size={20} />
            </div>
            <span className="pill-tag grey">Next: 2:00 PM</span>
          </div>
          <h2>3</h2>
          <p>MEETINGS TODAY</p>
        </div>
      </div>

      <div className="dashboard-content-grid">
        <div className="queries-column">
          <div className="section-header">
            <h3>Student Queries</h3>
            <button className="view-all-btn">
              View All <ArrowRight size={16} />
            </button>
          </div>

          <div className="queries-list">
            {dataLoading ? (
              <p className="status-text">Loading queries...</p>
            ) : queries.length === 0 ? (
              <div className="empty-card">
                <AlertCircle size={32} color="#ccc" />
                <p>No queries at the moment.</p>
              </div>
            ) : (
              queries.map((q) => (
                <div key={q.query_id} className="query-list-card">
                  <div className="query-card-left">
                    <div className="student-avatar">
                      {q.student_id.substring(0, 2).toUpperCase()}
                    </div>
                  </div>
                  <div className="query-card-main">
                    <div className="q-meta-top">
                      <h4>{q.student_id}</h4>
                      {statusPill(q.status)}
                    </div>
                    <p className="q-subject">
                      {q.subject} • <span>{q.category}</span>
                    </p>
                    <p className="q-snippet">{q.description}</p>
                    <p className="q-time">
                      Received {formatDate(q.created_at)}
                    </p>
                  </div>
                  <div className="query-card-right">
                    <button className="btn-view" onClick={() => openQuery(q)}>
                      {q.response !== null &&
                      q.response !== undefined &&
                      q.response !== ''
                        ? 'View / Edit'
                        : 'Respond'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="actions-column">
          <div className="quick-actions-card">
            <h3>Quick Actions</h3>
            <div className="action-buttons">
              <button className="action-btn">
                <List size={18} /> View All Queries
              </button>
              <button
                className="action-btn"
                onClick={() => navigate('/faculty-students')}
              >
                <Users size={18} /> View Students ({studentCount})
              </button>
              <button
                className="action-btn"
                onClick={() => navigate('/faculty-meetings')}
              >
                <Clock size={18} /> Schedule Meeting
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`fq-overlay ${isPanelOpen ? 'open' : ''}`}
        onClick={closePanel}
      />
      <div className={`fq-panel ${isPanelOpen ? 'open' : ''}`}>
        {selectedQuery !== null && (
          <>
            <div className="fq-panel-header">
              <h2>Query details</h2>
              <button
                className="fq-close"
                onClick={closePanel}
                aria-label="Close panel"
              >
                <X size={22} />
              </button>
            </div>

            <div className="fq-panel-body">
              <div className="fq-meta">
                <span className="fq-student">{selectedQuery.student_id}</span>
                {statusPill(selectedQuery.status)}
              </div>

              <h3 className="fq-subject">{selectedQuery.subject}</h3>

              <div className="fq-tags">
                <span className="cat-tag">{selectedQuery.category}</span>
                {selectedQuery.subcategory !== '' && (
                  <span className="cat-tag">{selectedQuery.subcategory}</span>
                )}
              </div>

              <p className="fq-description">{selectedQuery.description}</p>
              <p className="fq-received">
                Received {formatDateTime(selectedQuery.created_at)}
              </p>

              <label className="fq-label" htmlFor="fq-response">
                Your response
              </label>
              <textarea
                id="fq-response"
                className="fq-textarea"
                rows={6}
                placeholder="Write your response to the student..."
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
              />

              <div className="fq-status-row">
                <span className="fq-label">Mark as</span>
                <div className="fq-status-toggle">
                  <button
                    type="button"
                    className={responseStatus === 'Pending' ? 'active' : ''}
                    onClick={() => setResponseStatus('Pending')}
                  >
                    Pending
                  </button>
                  <button
                    type="button"
                    className={responseStatus === 'Resolved' ? 'active' : ''}
                    onClick={() => setResponseStatus('Resolved')}
                  >
                    Resolved
                  </button>
                </div>
              </div>

              {saveError !== '' && <p className="fq-error">{saveError}</p>}
            </div>

            <div className="fq-panel-footer">
              <button
                className="fq-cancel"
                onClick={closePanel}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="fq-save"
                onClick={() => void handleSaveResponse()}
                disabled={submitting}
              >
                {submitting ? 'Saving...' : 'Save response'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FacultyDashboard;
