import { Outlet } from 'react-router-dom';
import SidebarStudent from '../components/SidebarStudent';
import StudentProvider from '../context/StudentContext';

const StudentLayout = () => {
  return (
    <StudentProvider>
      <div className="dashboard-container">
        <SidebarStudent />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </StudentProvider>
  );
};

export default StudentLayout;
