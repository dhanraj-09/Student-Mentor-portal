import { Link, useLocation } from 'react-router-dom';
import './notfound.css';

/**
 * Catch-all for unmatched routes.
 *
 * Without this, React Router renders nothing at all for an unknown path — a
 * blank white page with no indication anything went wrong, which is what the
 * sidebar's unbuilt links used to produce.
 */
const NotFound = () => {
  const { pathname } = useLocation();

  return (
    <div className="notfound-page">
      <div className="notfound-card">
        <p className="notfound-code">404</p>
        <h1>That page does not exist</h1>
        <p className="notfound-path">{pathname}</p>
        <p className="notfound-help">
          The link may be unfinished, or the address mistyped.
        </p>
        <div className="notfound-actions">
          <Link to="/dashboard" className="notfound-btn primary">
            Student dashboard
          </Link>
          <Link to="/dashboard-faculty" className="notfound-btn">
            Faculty dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
