import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Link as LinkIcon, User } from 'lucide-react';
import { getStudentData, updateStudentData } from '../../api/api';
import type { StudentProfileForm } from '../../api/api';
import { toDateInputValue } from '../../utils/format';
import './styles/editprofile.css';

type FormField = HTMLInputElement | HTMLSelectElement;

const EditProfile = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<StudentProfileForm>({
    registration_no: '',
    name: '',
    degree: '',
    branch: '',
    year: '',
    gender: '',
    dob: '',
    linked_in: '',
    github: '',
  });

  useEffect(() => {
    const sessionID = sessionStorage.getItem('studentSessionID');
    if (sessionID === null) {
      navigate('/');
      return;
    }

    const load = async (): Promise<void> => {
      const res = await getStudentData(sessionID);
      if (res.status === 200) {
        const data = res.data;
        setFormData({
          registration_no:
            data.registration_no !== '' ? data.registration_no : sessionID,
          name: data.name ?? '',
          degree: data.degree ?? '',
          branch: data.branch ?? '',
          year: data.year !== null ? String(data.year) : '',
          gender: data.gender ?? '',
          dob: toDateInputValue(data.dob),
          linked_in: data.linked_in ?? '',
          github: data.github ?? '',
        });
      }
    };

    void load();
  }, [navigate]);

  const handleChange = (e: ChangeEvent<FormField>): void => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNextValidation = (): void => {
    if (step === 0) {
      if (
        formData.name === '' ||
        formData.gender === '' ||
        formData.dob === ''
      ) {
        alert(
          'Please fill out all required Personal Details (Name, Gender, DOB) before continuing.'
        );
        return;
      }
    }

    if (step === 1) {
      if (
        formData.degree === '' ||
        formData.branch === '' ||
        formData.year === ''
      ) {
        alert(
          'Please fill out all required Academic Details (Degree, Branch, Year) before continuing.'
        );
        return;
      }
    }

    setStep((prev) => Math.min(prev + 1, 2));
  };

  const prevStep = (): void => setStep((prev) => Math.max(prev - 1, 0));

  const handleSubmit = async (): Promise<void> => {
    try {
      const response = await updateStudentData(
        formData.registration_no,
        formData
      );
      if (response.status === 200) navigate('/dashboard');
    } catch (error) {
      console.error(error);
      alert('Update failed. Please try again.');
    }
  };

  return (
    <div className="edit-container">
      <div className="edit-card">
        <div className="edit-header">
          <h2>Edit Profile</h2>
          <div className="progress-indicator">
            <div className={`step-dot ${step >= 0 ? 'active' : ''}`}>
              <User size={16} />
            </div>
            <div className={`step-line ${step >= 1 ? 'active' : ''}`} />
            <div className={`step-dot ${step >= 1 ? 'active' : ''}`}>
              <BookOpen size={16} />
            </div>
            <div className={`step-line ${step >= 2 ? 'active' : ''}`} />
            <div className={`step-dot ${step >= 2 ? 'active' : ''}`}>
              <LinkIcon size={16} />
            </div>
          </div>
        </div>

        <form>
          <div className="slider-viewport">
            <div
              className="slider-track"
              style={{ transform: `translateX(-${String(step * 33.33)}%)` }}
            >
              <div className="slide">
                <h3>Personal Details</h3>
                <div className="input-group">
                  <label>Registration Number</label>
                  <input
                    type="text"
                    value={formData.registration_no}
                    disabled
                    className="disabled-input"
                  />
                </div>
                <div className="input-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="input-row">
                  <div className="input-group">
                    <label>Gender</label>
                    <select
                      name="gender"
                      value={formData.gender}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Date of Birth</label>
                    <input
                      type="date"
                      name="dob"
                      value={formData.dob}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="slide">
                <h3>Academic Profile</h3>
                <div className="input-group">
                  <label>Degree</label>
                  <input
                    type="text"
                    name="degree"
                    value={formData.degree}
                    onChange={handleChange}
                    placeholder="e.g. B.Tech"
                    required
                  />
                </div>
                <div className="input-group">
                  <label>Branch</label>
                  <input
                    type="text"
                    name="branch"
                    value={formData.branch}
                    onChange={handleChange}
                    placeholder="e.g. Computer Science"
                    required
                  />
                </div>
                <div className="input-group">
                  <label>Admission Year</label>
                  <input
                    type="number"
                    name="year"
                    value={formData.year}
                    onChange={handleChange}
                    placeholder="e.g. 2023"
                    required
                  />
                </div>
              </div>

              <div className="slide">
                <h3>Social Links</h3>
                <div className="input-group">
                  <label>LinkedIn URL</label>
                  <input
                    type="url"
                    name="linked_in"
                    value={formData.linked_in}
                    onChange={handleChange}
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>
                <div className="input-group">
                  <label>GitHub URL</label>
                  <input
                    type="url"
                    name="github"
                    value={formData.github}
                    onChange={handleChange}
                    placeholder="https://github.com/..."
                  />
                </div>
                <div className="final-notice">
                  <p>
                    Please review your details before saving. You can go back to
                    make changes.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="slider-controls">
            {step > 0 ? (
              <button
                type="button"
                className="nav-btn outline"
                onClick={prevStep}
              >
                Back
              </button>
            ) : (
              <button
                type="button"
                className="nav-btn cancel"
                onClick={() => navigate('/dashboard')}
              >
                Cancel
              </button>
            )}
            {step < 2 ? (
              <button
                type="button"
                className="nav-btn primary"
                onClick={handleNextValidation}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="nav-btn success"
                onClick={() => void handleSubmit()}
              >
                Save Changes
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProfile;
