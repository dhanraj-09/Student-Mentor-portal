import { useCallback, useContext, useEffect, useState } from 'react';
import { Calendar, CheckCircle, Circle, Clock, Plus, X } from 'lucide-react';
import type { MeetingStatus } from 'shared';
import {
  getApiErrorMessage,
  getStudentMeetings,
  requestMeeting,
  setMeetingReady,
} from '../../api/api';
import { StudentContext } from '../../context/StudentContext';
import type { StudentMeeting } from '../../types/meetings';
import { formatDate } from '../../utils/format';
import './styles/studentmeetings.css';

const TABS = ['All', 'Pending', 'Accepted', 'Ongoing', 'Completed'] as const;
type Tab = (typeof TABS)[number];

const StudentMeetings = () => {
  const { Student } = useContext(StudentContext);
  const regNo = Student?.registration_no;
  const hasMentor =
    Student?.assigned_faculty_email !== null &&
    Student?.assigned_faculty_email !== undefined;

  const [meetings, setMeetings] = useState<StudentMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('All');
  const [readyingId, setReadyingId] = useState<number | null>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [panelError, setPanelError] = useState('');

  const fetchMeetings = useCallback(async (): Promise<void> => {
    if (regNo === undefined) return;

    setLoading(true);
    setError('');
    try {
      const res = await getStudentMeetings(regNo);
      setMeetings(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load meetings', err);
      setError('Failed to load meetings.');
    } finally {
      setLoading(false);
    }
  }, [regNo]);

  useEffect(() => {
    if (regNo !== undefined) void fetchMeetings();
  }, [regNo, fetchMeetings]);

  const handleStudentReady = async (m: StudentMeeting): Promise<void> => {
    setReadyingId(m.meeting_id);
    setError('');
    try {
      await setMeetingReady(m.meeting_id, !m.student_ready);
      await fetchMeetings();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update readiness.'));
    } finally {
      setReadyingId(null);
    }
  };

  const openRequest = (): void => {
    setReason('');
    setPanelError('');
    setPanelOpen(true);
  };
  const closePanel = (): void => setPanelOpen(false);

  const handleRequestSubmit = async (): Promise<void> => {
    if (reason.trim() === '') {
      setPanelError('Please enter a reason for the meeting.');
      return;
    }
    if (regNo === undefined) return;

    setSubmitting(true);
    setPanelError('');
    try {
      await requestMeeting(regNo, reason);
      await fetchMeetings();
      closePanel();
    } catch (err) {
      setPanelError(getApiErrorMessage(err, 'Failed to request meeting.'));
    } finally {
      setSubmitting(false);
    }
  };

  const statusPill = (status: MeetingStatus) => {
    const map: Record<MeetingStatus, string> = {
      pending: 'yellow',
      accepted: 'gray',
      ongoing: 'blue',
      completed: 'green',
    };
    return (
      <span className={`sm-pill ${map[status]}`}>{status.toUpperCase()}</span>
    );
  };

  if (Student === null || loading) {
    return (
      <div style={{ padding: '50px', textAlign: 'center', color: '#777' }}>
        Loading meetings...
      </div>
    );
  }

  const countFor = (tab: Tab): number =>
    tab === 'All'
      ? meetings.length
      : meetings.filter((m) => m.status === tab.toLowerCase()).length;

  const filtered =
    activeTab === 'All'
      ? meetings
      : meetings.filter((m) => m.status === activeTab.toLowerCase());

  return (
    <div className="sm-container">
      <div className="sm-header">
        <div>
          <h1>My Meetings</h1>
          <p>
            Request a meeting with your mentor, get ready, and track its
            progress.
          </p>
        </div>
        <button
          className="sm-new-btn"
          onClick={openRequest}
          disabled={!hasMentor}
          title={hasMentor ? '' : 'You need an assigned mentor first'}
        >
          <Plus size={18} /> Request meeting
        </button>
      </div>

      {!hasMentor && (
        <div className="sm-notice">
          You don&apos;t have an assigned mentor yet, so you can&apos;t request
          a meeting.
        </div>
      )}

      <div className="sm-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {tab} ({countFor(tab)})
          </button>
        ))}
      </div>

      {error !== '' && <div className="sm-error">{error}</div>}

      {filtered.length === 0 ? (
        <div className="sm-empty">
          <Calendar size={34} color="#ccc" />
          <p>No meetings in this view.</p>
        </div>
      ) : (
        <div className="sm-list">
          {filtered.map((m) => (
            <div key={m.meeting_id} className="sm-card">
              <div className="sm-card-head">
                <div>
                  <h3>Mentor: {m.faculty_email}</h3>
                  <span className="sm-sub">started by {m.initiated_by}</span>
                </div>
                {statusPill(m.status)}
              </div>

              {m.reason !== null && <p className="sm-reason">{m.reason}</p>}

              {m.status === 'pending' && (
                <p className="sm-hint">
                  Awaiting your mentor&apos;s acceptance…
                </p>
              )}

              {m.status === 'accepted' && (
                <>
                  <div className="sm-ready-row">
                    <button
                      className={`sm-ready-toggle ${m.student_ready ? 'on' : ''}`}
                      onClick={() => void handleStudentReady(m)}
                      disabled={readyingId === m.meeting_id}
                    >
                      {m.student_ready ? (
                        <CheckCircle size={15} />
                      ) : (
                        <Circle size={15} />
                      )}
                      {m.student_ready ? "You're ready" : 'Mark yourself ready'}
                    </button>
                    <span
                      className={`sm-ready-badge ${m.faculty_ready ? 'on' : ''}`}
                    >
                      {m.faculty_ready ? (
                        <CheckCircle size={14} />
                      ) : (
                        <Circle size={14} />
                      )}
                      {m.faculty_ready ? 'Mentor ready' : 'Mentor not ready'}
                    </span>
                  </div>
                  <p className="sm-hint">
                    Your mentor will start the meeting once you&apos;re both
                    ready.
                  </p>
                </>
              )}

              {m.status === 'ongoing' && (
                <p className="sm-hint sm-live">● Meeting is in progress.</p>
              )}

              <div className="sm-meta">
                <span>
                  <Clock size={14} /> {formatDate(m.created_at)}
                </span>
                {m.status === 'completed' && (
                  <span className="sm-done">
                    <CheckCircle size={14} /> Completed
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className={`sm-overlay ${panelOpen ? 'open' : ''}`}
        onClick={closePanel}
      />
      <div className={`sm-panel ${panelOpen ? 'open' : ''}`}>
        <div className="sm-panel-header">
          <h2>Request a meeting</h2>
          <button className="sm-close" onClick={closePanel} aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <div className="sm-panel-body">
          <label className="sm-label">Reason</label>
          <textarea
            className="sm-textarea"
            rows={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why do you want to meet your mentor?"
          />
          {panelError !== '' && <p className="sm-panel-error">{panelError}</p>}
        </div>
        <div className="sm-panel-footer">
          <button
            className="sm-cancel"
            onClick={closePanel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="sm-save"
            onClick={() => void handleRequestSubmit()}
            disabled={submitting}
          >
            {submitting ? 'Sending...' : 'Send request'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentMeetings;
