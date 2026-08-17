import { useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle, Search, UserPlus } from 'lucide-react';
import type { Student } from 'shared';
import {
  assignStudentToFaculty,
  getAllUnassignedStudents,
  getApiErrorMessage,
} from '../../api/api';
import { FacultyContext } from '../../context/FacultyContext';
import './unassignedstudents.css';

const UnassignedStudents = () => {
  const { faculty, loading: authLoading } = useContext(FacultyContext);

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [justAssigned, setJustAssigned] = useState<string | null>(null);
  const [error, setError] = useState('');

  const facultyEmail = faculty?.email;

  const fetchUnassigned = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const res = await getAllUnassignedStudents();
      setStudents(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load unassigned students', err);
      setError('Failed to load unassigned students.');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && facultyEmail !== undefined) {
      void fetchUnassigned();
    }
  }, [authLoading, facultyEmail, fetchUnassigned]);

  const handleAssign = async (regNo: string): Promise<void> => {
    if (facultyEmail === undefined) return;

    setAssigningId(regNo);
    setError('');
    try {
      await assignStudentToFaculty(regNo, facultyEmail);
      setJustAssigned(regNo);
      setTimeout(() => {
        setStudents((prev) => prev.filter((s) => s.registration_no !== regNo));
        setJustAssigned(null);
      }, 800);
    } catch (err) {
      console.error('Failed to assign student', err);
      setError(
        getApiErrorMessage(err, 'Failed to assign student. Please try again.')
      );
    } finally {
      setAssigningId(null);
    }
  };

  if (authLoading || loading) {
    return <div className="loading-state">Loading unassigned students...</div>;
  }

  const filtered = students.filter((s) => {
    if (searchTerm === '') return true;
    const term = searchTerm.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      s.registration_no.toLowerCase().includes(term)
    );
  });

  return (
    <div className="ua-container">
      <div className="ua-top-bar">
        <p className="ua-breadcrumb">Dashboard / Assign Mentees</p>
        <div className="ua-search">
          <Search size={18} color="#888" />
          <input
            type="text"
            placeholder="Search by name or registration no..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="ua-header">
        <h1>Unassigned Students</h1>
        <p>
          These students don&apos;t have a mentor yet. Assign them to yourself
          to start mentoring.
        </p>
      </div>

      {error !== '' && <div className="ua-error">{error}</div>}

      {filtered.length === 0 ? (
        <div className="ua-empty">
          <CheckCircle size={36} color="#22c55e" />
          <p>
            {students.length === 0
              ? 'No unassigned students right now — everyone has a mentor.'
              : 'No students match your search.'}
          </p>
        </div>
      ) : (
        <div className="ua-grid">
          {filtered.map((s) => {
            const isAssigning = assigningId === s.registration_no;
            const isDone = justAssigned === s.registration_no;
            return (
              <div
                key={s.registration_no}
                className={`ua-card ${isDone ? 'assigned' : ''}`}
              >
                <div className="ua-avatar">
                  {s.name !== '' ? s.name.charAt(0).toUpperCase() : '?'}
                </div>
                <div className="ua-info">
                  <h3>{s.name !== '' ? s.name : 'Unnamed Student'}</h3>
                  <p className="ua-reg">{s.registration_no}</p>
                  <p className="ua-academic">
                    {s.degree ?? ''}
                    {s.branch !== null ? ` • ${s.branch}` : ''}
                    {s.year !== null ? ` • Year ${String(s.year)}` : ''}
                  </p>
                </div>
                <button
                  className="ua-assign-btn"
                  onClick={() => void handleAssign(s.registration_no)}
                  disabled={isAssigning || isDone}
                >
                  {isDone ? (
                    <>
                      <CheckCircle size={16} /> Assigned
                    </>
                  ) : isAssigning ? (
                    'Assigning...'
                  ) : (
                    <>
                      <UserPlus size={16} /> Assign to me
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UnassignedStudents;
