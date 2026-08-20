import {
  BookOpen,
  Calendar,
  FileText,
  Home,
  MessageSquare,
  Settings,
  Users,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../api/api';

const SidebarStudent = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/');
  };

  const navClass = (path: string): string =>
    location.pathname === path ? 'nav-item active' : 'nav-item';

  return (
    <aside className="sidebar">
      <h1 className="logo">MARG</h1>
      <nav className="nav-menu">
        <div
          className={navClass('/dashboard')}
          onClick={() => navigate('/dashboard')}
        >
          <Home size={20} /> <span>Home</span>
        </div>
        <div
          className={navClass('/new-query')}
          onClick={() => navigate('/new-query')}
        >
          <FileText size={20} /> <span>Raise a Query</span>
        </div>
        <div
          className={navClass('/student-meetings')}
          onClick={() => navigate('/student-meetings')}
        >
          <Calendar size={20} /> <span>Meetings</span>
        </div>
        <div className="nav-item nav-item-soon" title="Not built yet">
          <MessageSquare size={20} /> <span>Chat</span>
          <span className="nav-soon-tag">Soon</span>
        </div>
        <div
          className={navClass('/student-resources')}
          onClick={() => navigate('/student-resources')}
        >
          <BookOpen size={20} /> <span>Resources</span>
        </div>
        <div className="nav-item nav-item-soon" title="Not built yet">
          <Users size={20} /> <span>Community</span>
          <span className="nav-soon-tag">Soon</span>
        </div>
        <div className="nav-item">
          <button className="btn-logout" onClick={() => void handleLogout()}>
            Logout
          </button>
        </div>
        <div className="nav-item settings">
          <Settings size={20} /> <span>Settings</span>
        </div>
      </nav>
    </aside>
  );
};

export default SidebarStudent;
