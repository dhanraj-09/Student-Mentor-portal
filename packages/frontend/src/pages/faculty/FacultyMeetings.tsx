import { useCallback, useContext, useEffect, useState } from 'react';
import { Calendar, CheckCircle, Circle, Clock, Plus, X } from 'lucide-react';
import { MARKS_MAX, MARKS_MIN } from 'shared';
import type { MeetingSkillOption, MeetingStatus, Student } from 'shared';
import {
  acceptMeeting,
  completeMeeting,
  createMeeting,
  getApiErrorMessage,
  getAssignedStudents,
  getFacultyMeetings,
  getMeetingSkillOptions,
  setMeetingReady,
  startMeeting,
} from '../../api/api';
import { FacultyContext } from '../../context/FacultyContext';
import type { FacultyMeeting } from '../../types/meetings';
import { formatDate } from '../../utils/format';
import './facultymeetings.css';

const TABS = ['All', 'Pending', 'Accepted', 'Ongoing', 'Completed'] as const;
type Tab = (typeof TABS)[number];
type PanelMode = 'create' | 'complete';

const FacultyMeetings = () => {
  const { faculty, loading: authLoading } = useContext(FacultyContext);

  const [meetings, setMeetings] = useState<FacultyMeeting[]>([]);
  const [options, setOptions] = useState<MeetingSkillOption[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('All');
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [readyingId, setReadyingId] = useState<number | null>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>('complete');
  const [selectedMeeting, setSelectedMeeting] = useState<FacultyMeeting | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [panelError, setPanelError] = useState('');

  const [newStudentId, setNewStudentId] = useState('');
  const [newReason, setNewReason] = useState('');
  const [marks, setMarks] = useState('');
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>([]);

  const facultyEmail = faculty?.email;

  const fetchAll = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const [mRes, oRes, sRes] = await Promise.all([
        getFacultyMeetings(),
        getMeetingSkillOptions(),
        getAssignedStudents(),
      ]);
      setMeetings(Array.isArray(mRes.data) ? mRes.data : []);
      setOptions(Array.isArray(oRes.data) ? oRes.data : []);
      setStudents(Array.isArray(sRes.data) ? sRes.data : []);
    } catch (err) {
      console.error('Failed to load meetings', err);
      setError('Failed to load meetings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && facultyEmail !== undefined) void fetchAll();
  }, [authLoading, facultyEmail, fetchAll]);

  const runAction = async (
    id: number,
    action: () => Promise<unknown>
  ): Promise<void> => {
    setActioningId(id);
    setError('');
    try {
      await action();
      await fetchAll();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Action failed. Please try again.'));
    } finally {
      setActioningId(null);
    }
  };

  const handleAccept = (id: number): void =>
    void runAction(id, () => acceptMeeting(id));
  const handleStart = (id: number): void =>
    void runAction(id, () => startMeeting(id));

  const handleFacultyReady = async (m: FacultyMeeting): Promise<void> => {
    setReadyingId(m.meeting_id);
    setError('');
    try {
      await setMeetingReady(m.meeting_id, !m.faculty_ready);
      await fetchAll();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update readiness.'));
    } finally {
      setReadyingId(null);
    }
  };

  const openCreate = (): void => {
    setPanelMode('create');
    setSelectedMeeting(null);
    setNewStudentId('');
    setNewReason('');
    setPanelError('');
    setPanelOpen(true);
  };

  const openComplete = (meeting: FacultyMeeting): void => {
    setPanelMode('complete');
    setSelectedMeeting(meeting);
    setMarks('');
    setSelectedSkillIds([]);
    setPanelError('');
    setPanelOpen(true);
  };

  const closePanel = (): void => {
    setPanelOpen(false);
    setSelectedMeeting(null);
  };

  const toggleSkill = (id: number): void => {
    setSelectedSkillIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreateSubmit = async (): Promise<void> => {
    if (newStudentId === '') {
      setPanelError('Please select a student.');
      return;
    }
    setSubmitting(true);
    setPanelError('');
    try {
      await createMeeting(newStudentId, newReason);
      await fetchAll();
      closePanel();
    } catch (err) {
      setPanelError(getApiErrorMessage(err, 'Failed to create meeting.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteSubmit = async (): Promise<void> => {
    if (selectedMeeting === null) return;

    const numericMarks = Number(marks);
    if (
      !Number.isInteger(numericMarks) ||
      numericMarks < MARKS_MIN ||
      numericMarks > MARKS_MAX
    ) {
      setPanelError(
        `Marks must be a whole number between ${String(MARKS_MIN)} and ${String(MARKS_MAX)}.`
      );
      return;
    }
    if (selectedSkillIds.length === 0) {
      setPanelError('Select at least one skill discussed.');
      return;
    }

    setSubmitting(true);
    setPanelError('');
    try {
      await completeMeeting(
        selectedMeeting.meeting_id,
        numericMarks,
        selectedSkillIds
      );
      await fetchAll();
      closePanel();
    } catch (err) {
      setPanelError(getApiErrorMessage(err, 'Failed to complete meeting.'));
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
      <span className={`fm-pill ${map[status]}`}>{status.toUpperCase()}</span>
    );
  };

  if (authLoading || loading)
    return <div className="loading-state">Loading meetings...</div>;

  const countFor = (tab: Tab): number =>
    tab === 'All'
      ? meetings.length
      : meetings.filter((m) => m.status === tab.toLowerCase()).length;

  const filtered =
    activeTab === 'All'
      ? meetings
      : meetings.filter((m) => m.status === activeTab.toLowerCase());

  return (
    <div className="fm-container">
      <div className="fm-top-bar">
        <p className="fm-breadcrumb">Dashboard / Meetings</p>
        <button className="fm-new-btn" onClick={openCreate}>
          <Plus size={18} /> New meeting
        </button>
      </div>

      <div className="fm-header">
        <h1>Meetings</h1>
        <p>
          Accept requests, get ready, start the meeting, then record marks &amp;
          skills on completion.
        </p>
      </div>

      <div className="fm-tabs">
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

      {error !== '' && <div className="fm-error">{error}</div>}

      {filtered.length === 0 ? (
        <div className="fm-empty">
          <Calendar size={34} color="#ccc" />
          <p>No meetings in this view.</p>
        </div>
      ) : (
        <div className="fm-list">
          {filtered.map((m) => (
            <div key={m.meeting_id} className="fm-card">
              <div className="fm-card-head">
                <div>
                  <h3>
                    {m.student_name !== '' ? m.student_name : m.student_id}
                  </h3>
                  <span className="fm-sub">
                    {m.student_id} • started by {m.initiated_by}
                  </span>
                </div>
                {statusPill(m.status)}
              </div>

              {m.reason !== null && <p className="fm-reason">{m.reason}</p>}

              {m.status === 'accepted' && (
                <div className="fm-ready-row">
                  <button
                    className={`fm-ready-toggle ${m.faculty_ready ? 'on' : ''}`}
                    onClick={() => void handleFacultyReady(m)}
                    disabled={readyingId === m.meeting_id}
                  >
                    {m.faculty_ready ? (
                      <CheckCircle size={15} />
                    ) : (
                      <Circle size={15} />
                    )}
                    {m.faculty_ready ? "You're ready" : 'Mark yourself ready'}
                  </button>
                  <span
                    className={`fm-ready-badge ${m.student_ready ? 'on' : ''}`}
                  >
                    {m.student_ready ? (
                      <CheckCircle size={14} />
                    ) : (
                      <Circle size={14} />
                    )}
                    {m.student_ready ? 'Student ready' : 'Student not ready'}
                  </span>
                </div>
              )}

              <div className="fm-meta">
                <span>
                  <Clock size={14} /> {formatDate(m.created_at)}
                </span>
                {m.status === 'completed' && (
                  <>
                    <span className="fm-marks">
                      Marks: {m.marks}/{MARKS_MAX}
                    </span>
                    {m.skills !== null && (
                      <span className="fm-skills">{m.skills}</span>
                    )}
                  </>
                )}
              </div>

              <div className="fm-actions">
                {m.status === 'pending' && (
                  <button
                    className="fm-accept"
                    onClick={() => handleAccept(m.meeting_id)}
                    disabled={actioningId === m.meeting_id}
                  >
                    {actioningId === m.meeting_id ? 'Accepting...' : 'Accept'}
                  </button>
                )}
                {m.status === 'accepted' && (
                  <button
                    className="fm-start"
                    onClick={() => handleStart(m.meeting_id)}
                    disabled={
                      !m.student_ready ||
                      !m.faculty_ready ||
                      actioningId === m.meeting_id
                    }
                    title={
                      !m.student_ready || !m.faculty_ready
                        ? 'Both sides must be ready first'
                        : ''
                    }
                  >
                    {actioningId === m.meeting_id
                      ? 'Starting...'
                      : 'Start meeting'}
                  </button>
                )}
                {m.status === 'ongoing' && (
                  <button
                    className="fm-complete"
                    onClick={() => openComplete(m)}
                  >
                    <CheckCircle size={16} /> Complete
                  </button>
                )}
                {m.status === 'completed' && (
                  <span className="fm-done">
                    <CheckCircle size={16} /> Completed
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className={`fm-overlay ${panelOpen ? 'open' : ''}`}
        onClick={closePanel}
      />
      <div className={`fm-panel ${panelOpen ? 'open' : ''}`}>
        <div className="fm-panel-header">
          <h2>{panelMode === 'create' ? 'New meeting' : 'Complete meeting'}</h2>
          <button className="fm-close" onClick={closePanel} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="fm-panel-body">
          {panelMode === 'create' ? (
            <>
              <label className="fm-label">Student</label>
              <select
                className="fm-input"
                value={newStudentId}
                onChange={(e) => setNewStudentId(e.target.value)}
              >
                <option value="">Select an assigned student</option>
                {students.map((s) => (
                  <option key={s.registration_no} value={s.registration_no}>
                    {s.name} ({s.registration_no})
                  </option>
                ))}
              </select>

              <label className="fm-label">Agenda / note (optional)</label>
              <textarea
                className="fm-textarea"
                rows={4}
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="What's this meeting about?"
              />
            </>
          ) : (
            selectedMeeting !== null && (
              <>
                <div className="fm-panel-meta">
                  <span className="fm-student">
                    {selectedMeeting.student_name !== ''
                      ? selectedMeeting.student_name
                      : selectedMeeting.student_id}
                  </span>
                  <span className="fm-sub">{selectedMeeting.student_id}</span>
                </div>
                {selectedMeeting.reason !== null && (
                  <p className="fm-reason">{selectedMeeting.reason}</p>
                )}

                <label className="fm-label">
                  Marks ({MARKS_MIN}–{MARKS_MAX})
                </label>
                <input
                  type="number"
                  min={MARKS_MIN}
                  max={MARKS_MAX}
                  className="fm-input"
                  value={marks}
                  onChange={(e) => setMarks(e.target.value)}
                  placeholder="e.g. 24"
                />

                <label className="fm-label">
                  Skills discussed (pick at least one)
                </label>
                <div className="fm-chips">
                  {options.map((opt) => (
                    <button
                      key={opt.skill_id}
                      type="button"
                      className={`fm-chip ${selectedSkillIds.includes(opt.skill_id) ? 'on' : ''}`}
                      onClick={() => toggleSkill(opt.skill_id)}
                    >
                      {opt.skill_name}
                    </button>
                  ))}
                </div>
              </>
            )
          )}

          {panelError !== '' && <p className="fm-panel-error">{panelError}</p>}
        </div>

        <div className="fm-panel-footer">
          <button
            className="fm-cancel"
            onClick={closePanel}
            disabled={submitting}
          >
            Cancel
          </button>
          {panelMode === 'create' ? (
            <button
              className="fm-save"
              onClick={() => void handleCreateSubmit()}
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create meeting'}
            </button>
          ) : (
            <button
              className="fm-save"
              onClick={() => void handleCompleteSubmit()}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : 'Complete & save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FacultyMeetings;
