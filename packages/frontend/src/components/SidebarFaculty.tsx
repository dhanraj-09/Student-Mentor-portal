import { useNavigate } from 'react-router-dom';
import { logout } from '../api/api';

const SidebarFaculty = () => {
  const navigate = useNavigate();

  const handleLogOut = async (): Promise<void> => {
    await logout();
    navigate('/faculty-login');
  };

  return (
    <aside className="faculty-sidebar">
      <h1 className="logo">MARG</h1>
      <nav className="nav-menu-faculty">
        <div
          className="nav-item-faculty"
          onClick={() => navigate('/dashboard-faculty')}
        >
          <span>Home</span>
        </div>
        <div
          className="nav-item-faculty"
          onClick={() => navigate('/faculty-meetings')}
        >
          <span>Queries</span>
        </div>
        <div
          className="nav-item-faculty"
          onClick={() => navigate('/faculty-students')}
        >
          <span>Students</span>
        </div>
        <div
          className="nav-item-faculty"
          onClick={() => navigate('/unassigned-students')}
        >
          <span>Assign Mentees</span>
        </div>
        <div
          className="nav-item-faculty"
          onClick={() => navigate('/community')}
        >
          <span>chat</span>
        </div>
        <div
          className="nav-item-faculty"
          onClick={() => navigate('/faculty-meetings')}
        >
          <span>Meetings</span>
        </div>
        <div className="sidebar-footer">
          <button className="btn-logout" onClick={() => void handleLogOut()}>
            Logout
          </button>
        </div>
      </nav>
    </aside>
  );
};

export default SidebarFaculty;
