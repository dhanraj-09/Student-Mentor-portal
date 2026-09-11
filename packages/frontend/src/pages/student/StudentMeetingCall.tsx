import { useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MeetingCall from '../../components/MeetingCall';
import { StudentContext } from '../../context/StudentContext';

/**
 * `/student-meetings/:meetingId/call`
 *
 * The encrypted video call with the assigned mentor. Access is enforced by the
 * backend: it only mints a LiveKit token for a participant of an ongoing
 * meeting who already holds an encryption key.
 */
const StudentMeetingCall = () => {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const { Student, assignedFaculty } = useContext(StudentContext);

  const id = Number(meetingId);
  if (!Number.isInteger(id) || id <= 0) {
    return (
      <div className="mc-container">
        <div className="mc-error">That meeting link is not valid.</div>
      </div>
    );
  }

  if (Student === null) {
    return (
      <div style={{ padding: '50px', textAlign: 'center', color: '#777' }}>
        Loading meeting...
      </div>
    );
  }

  return (
    <MeetingCall
      meetingId={id}
      title="Meeting with your mentor"
      subtitle={assignedFaculty?.name ?? undefined}
      onLeave={() => navigate('/student-meetings')}
    />
  );
};

export default StudentMeetingCall;
