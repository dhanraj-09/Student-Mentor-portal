import { ChevronDown, Linkedin, Mail } from 'lucide-react';
import './teacherprofile.css';

const SECTIONS = [
  'Educational Qualification',
  'Area of Expertise',
  'Responsibility',
  'Publication',
];

const TeacherProfile = () => {
  return (
    <div className="profile-page">
      <div className="container">
        <header className="header-card">
          <div className="avatar-section">
            <div className="profile-img-wrapper">
              <img
                src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400"
                alt="Professor"
              />
            </div>
          </div>

          <div className="info-section">
            <h1 className="name">XYZ</h1>
            <hr className="divider" />
            <div className="title-group">
              <p className="role">Professor</p>
              <p className="department">Department of Information Technology</p>
            </div>

            <div className="contact-pills">
              <div className="pill">aditya.dhanraj@gmail.com</div>
              <div className="pill">Contact info</div>
            </div>

            <div className="social-links">
              <div className="social-icon">
                <Linkedin size={20} />
              </div>
              <div className="social-icon">
                <Mail size={20} />
              </div>
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
