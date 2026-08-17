import { createContext, useEffect, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Faculty } from 'shared';
import { getFacultyData, hasStatus } from '../api/api';

interface FacultyContextValue {
  faculty: Faculty | null;
  setFaculty: Dispatch<SetStateAction<Faculty | null>>;
  loading: boolean;
}

export const FacultyContext = createContext<FacultyContextValue>({
  faculty: null,
  setFaculty: () => undefined,
  loading: true,
});

const FacultyProvider = ({ children }: { children: ReactNode }) => {
  const [faculty, setFaculty] = useState<Faculty | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const sessionEmail = sessionStorage.getItem('facultyEmail');

    if (sessionEmail === null) {
      setLoading(false);
      navigate('/faculty-login');
      return;
    }

    const fetchProfile = async (): Promise<void> => {
      try {
        const response = await getFacultyData(sessionEmail);
        if (response.status === 200) {
          setFaculty(response.data);
        }
      } catch (error) {
        console.error('Error fetching faculty data:', error);
        if (hasStatus(error, 404)) {
          sessionStorage.removeItem('facultyEmail');
          navigate('/faculty-login');
        }
      } finally {
        setLoading(false);
      }
    };

    void fetchProfile();
  }, [navigate]);

  return (
    <FacultyContext.Provider value={{ faculty, setFaculty, loading }}>
      {children}
    </FacultyContext.Provider>
  );
};

export default FacultyProvider;
