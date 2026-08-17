import { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Search, User } from 'lucide-react';
import type { Student } from 'shared';
import { getAssignedStudents } from '../../api/api';
import { FacultyContext } from '../../context/FacultyContext';
import './studentfaculty.css';

const TABS = [
  'All Students',
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year',
] as const;

const YEAR_BY_TAB: Record<string, number> = {
  '1st Year': 1,
  '2nd Year': 2,
  '3rd Year': 3,
  '4th Year': 4,
};

function ordinalSuffix(year: number | null): string {
  if (year === 1) return 'st';
  if (year === 2) return 'nd';
  if (year === 3) return 'rd';
  return 'th';
}

const StudentsFaculty = () => {
  const { faculty, loading: authLoading } = useContext(FacultyContext);
  const navigate = useNavigate();

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  const facultyEmail = faculty?.email;

  const fetchStudents = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await getAssignedStudents();
      setStudents(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error fetching assigned students', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && facultyEmail !== undefined) {
      void fetchStudents();
    }
  }, [authLoading, facultyEmail, fetchStudents]);

  const handleViewProfile = (regNo: string): void => {
    navigate(`/student-profile/${regNo}`);
  };

  if (authLoading || loading)
    return <div className="loading-state">Loading assigned cohort...</div>;

  const filteredStudents = students
    .filter((s) => activeTab === 'All' || s.year === YEAR_BY_TAB[activeTab])
    .filter((s) => {
      if (searchTerm === '') return true;
      const term = searchTerm.toLowerCase();
      return (
        s.name.toLowerCase().includes(term) ||
        s.registration_no.toLowerCase().includes(term)
      );
    });

  return (
    <div className="sf-container">
      <div className="sf-top-bar">
        <p className="breadcrumb">Dashboard / Students</p>
        <div className="sf-top-right">
          <div className="sf-search">
            <Search size={18} color="#888" />
            <input
              type="text"
              placeholder="Search students..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="sf-icon-btn">
            <Bell size={20} />
          </button>
          <button className="sf-icon-btn">
            <User size={20} />
          </button>
        </div>
      </div>

      <div className="sf-header">
        <div className="sf-header-text">
          <h1>Students</h1>
          <p>
            Manage your cohort and track individual progress through the
            academic cycle.
          </p>
        </div>

        <div className="sf-tabs">
          {TABS.map((tab) => {
            const value = tab === 'All Students' ? 'All' : tab;
            return (
              <button
                key={tab}
                className={activeTab === value ? 'active' : ''}
                onClick={() => setActiveTab(value)}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </div>

      <div className="sf-grid">
        {filteredStudents.length === 0 ? (
          <div className="empty-cohort">
            No students found matching your criteria.
          </div>
        ) : (
          filteredStudents.map((student) => (
            <div key={student.registration_no} className="student-card">
              <div className="avatar-wrapper">
                <div className="avatar-circle">
                  <User size={40} color="#000" />
                </div>
                <span className="status-dot online" />
              </div>

              <div className="card-info">
                <h3>{student.name}</h3>
                <p className="reg-no">{student.registration_no}</p>
                <p className="academic-info">
                  {student.year}
                  {ordinalSuffix(student.year)} Year, {student.branch}
                </p>
              </div>

              <button
                className="btn-view-profile"
                onClick={() => handleViewProfile(student.registration_no)}
              >
                View Profile
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StudentsFaculty;
