import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MeetingCall from '../../components/MeetingCall';
import { getApiErrorMessage, getMeetingDetail } from '../../api/api';

/**
 * `/faculty-meetings/:meetingId/call`
 *
 * The mentor's side of the encrypted call. The mentor may also rotate the
 * meeting encryption key, which reseals it for both participants.
 */
const FacultyMeetingCall = () => {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const [studentName, setStudentName] = useState('');
  const [error, setError] = useState('');

  const id = Number(meetingId);
  const valid = Number.isInteger(id) && id > 0;

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;

    getMeetingDetail(id)
      .then((response) => {
        if (!cancelled) setStudentName(response.data.student_name ?? '');
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'Could not load the meeting.'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, valid]);

  if (!valid) {
    return (
      <div className="mc-container">
        <div className="mc-error">That meeting link is not valid.</div>
      </div>
    );
  }

  if (error !== '') {
    return (
      <div className="mc-container">
        <div className="mc-error">{error}</div>
      </div>
    );
  }

  return (
    <MeetingCall
      meetingId={id}
      title="Mentoring call"
      subtitle={studentName !== '' ? `With ${studentName}` : undefined}
      canManageKeys
      onLeave={() => navigate('/faculty-meetings')}
    />
  );
};

export default FacultyMeetingCall;
