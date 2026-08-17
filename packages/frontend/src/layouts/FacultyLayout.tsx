import { Outlet } from 'react-router-dom';
import SidebarFaculty from '../components/SidebarFaculty';
import FacultyProvider from '../context/FacultyContext';

const FacultyLayout = () => {
  return (
    <FacultyProvider>
      <div className="faculty-dashboard-container">
        <SidebarFaculty />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </FacultyProvider>
  );
};

export default FacultyLayout;
