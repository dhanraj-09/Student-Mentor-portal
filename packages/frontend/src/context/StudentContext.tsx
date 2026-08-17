import { createContext, useEffect, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Faculty, Student as StudentRecord } from 'shared';
import { getFacultyData, getStudentData } from '../api/api';

interface StudentContextValue {
  Student: StudentRecord | null;
  setStudent: Dispatch<SetStateAction<StudentRecord | null>>;
  assignedFaculty: Faculty | null;
}

export const StudentContext = createContext<StudentContextValue>({
  Student: null,
  setStudent: () => undefined,
  assignedFaculty: null,
});

const StudentProvider = ({ children }: { children: ReactNode }) => {
  const [Student, setStudent] = useState<StudentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignedFaculty, setAssignedFaculty] = useState<Faculty | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const sessionID = sessionStorage.getItem('studentSessionID');

    if (sessionID === null) {
      navigate('/register');
      return;
    }

    const fetchProfile = async (): Promise<void> => {
      try {
        const response = await getStudentData(sessionID);

        if (response.status === 200) {
          const studentProfile = response.data;
          setStudent(studentProfile);

          const facultyEmail = studentProfile.assigned_faculty_email;
          if (
            facultyEmail !== null &&
            facultyEmail !== undefined &&
            facultyEmail !== ''
          ) {
            try {
              const facultyRes = await getFacultyData(facultyEmail);
              if (facultyRes.status === 200) {
                setAssignedFaculty(facultyRes.data);
              }
            } catch (facultyError) {
              console.error('Could not fetch assigned faculty:', facultyError);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching student data:', error);
        sessionStorage.removeItem('studentSessionID');
        navigate('/register');
      } finally {
        setLoading(false);
      }
    };

    void fetchProfile();
  }, [navigate]);

  if (loading) {
    return (
      <div style={{ padding: '50px', textAlign: 'center' }}>
        Loading MARG Dash...
      </div>
    );
  }

  return (
    <StudentContext.Provider value={{ Student, setStudent, assignedFaculty }}>
      {children}
    </StudentContext.Provider>
  );
};

export default StudentProvider;
