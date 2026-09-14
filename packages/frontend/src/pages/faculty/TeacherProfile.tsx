import { ChevronDown, Linkedin, Mail } from 'lucide-react';
import { useContext } from 'react';
import { FacultyContext } from '../../context/FacultyContext';
import './teacherprofile.css';

const SECTIONS = [
  'Educational Qualification',
  'Area of Expertise',
  'Responsibility',
  'Publication',
];

const TeacherProfile = () => {
  const { faculty, loading } = useContext(FacultyContext);

  if (loading) {
    return <div className="profile-page">Loading profile...</div>;
  }

  if (faculty === null) {
    return <div className="profile-page">Could not load your profile.</div>;
  }

  return (
    <div className="profile-page">
      <div className="container">
        <header className="header-card">
          <div className="avatar-section">
            <div className="profile-img-wrapper">
              {/* No avatar is stored yet, so fall back to the initial. */}
              <div className="profile-initial">
                {faculty.name.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>

          <div className="info-section">
            <h1 className="name">{faculty.name}</h1>
            <hr className="divider" />
            <div className="title-group">
              <p className="role">{faculty.designation ?? 'Faculty'}</p>
              <p className="department">
                {faculty.department === null
                  ? 'Department not set'
                  : `Department of ${faculty.department}`}
              </p>
            </div>

            <div className="contact-pills">
              <div className="pill">{faculty.email}</div>
              {faculty.phone_number !== null && (
                <div className="pill">{faculty.phone_number}</div>
              )}
            </div>

            <div className="social-links">
              {faculty.linked_in !== null && (
                <a
                  className="social-icon"
                  href={faculty.linked_in}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Linkedin size={20} />
                </a>
              )}
              <a className="social-icon" href={`mailto:${faculty.email}`}>
                <Mail size={20} />
              </a>
            </div>
          </div>
        </header>

        <section className="accordion-list">
          {SECTIONS.map((title) => (
            <div key={title} className="accordion-item">
              <span>{title}</span>
              <ChevronDown size={20} className="chevron" />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};

export default TeacherProfile;
