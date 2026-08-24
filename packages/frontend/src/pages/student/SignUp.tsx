import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Link as LinkIcon,
  Sparkles,
  User,
} from 'lucide-react';
import { PASSWORD_MIN_LENGTH, isValidPassword } from 'shared';
import {
  getApiErrorMessage,
  loginStudent,
  registerStudent,
} from '../../api/api';
import type { StudentSignupForm } from '../../api/api';
import PasswordInput from '../../components/PasswordInput';
import './styles/SignUp.css';

type FormField = HTMLInputElement | HTMLSelectElement;

const Signup = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const [studentData, setStudentData] = useState<StudentSignupForm>({
    name: '',
    registration_no: '',
    degree: '',
    branch: '',
    year: '',
    gender: '',
    dob: '',
    linked_in: '',
    github: '',
    password: '',
  });

  const handleInputChange = (e: ChangeEvent<FormField>): void => {
    const { name, value } = e.target;
    setStudentData((prev) => ({ ...prev, [name]: value }));
  };

  const handleNext = (): void => {
    if (step === 1) {
      if (
        studentData.name.trim() === '' ||
        studentData.gender === '' ||
        studentData.dob === ''
      ) {
        alert('Please fill in all required identity fields to proceed.');
        return;
      }
    } else if (step === 2) {
      if (
        studentData.registration_no.trim() === '' ||
        studentData.degree === ''
      ) {
        alert('Please fill in your Registration Number and Degree Programme.');
        return;
      }
    }
    setStep((prev) => prev + 1);
  };

  const handleBack = (): void => {
    setStep((prev) => prev - 1);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    if (!isValidPassword(studentData.password)) {
      alert(
        `Password must be at least ${String(PASSWORD_MIN_LENGTH)} characters long.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const response = await registerStudent(studentData);
      if (response.status === 200 || response.status === 201) {
        await loginStudent(studentData.registration_no, studentData.password);
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Registration error:', error);
      alert(
        getApiErrorMessage(
          error,
          'Registration failed. Is your backend server running?'
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-wrapper">
      <div className="modal-container">
        <div className="modal-header-bar">
          <button
            type="button"
            className="btn-nav-back"
            onClick={() => navigate('/')}
            title="Return to Login"
          >
            <ArrowLeft size={16} />
            <span>Back to Login</span>
          </button>

          <div className="modal-brand">
            <div className="brand-logo">
              <Sparkles size={16} color="#ffffff" />
            </div>
            <span className="brand-name">MARG Portal</span>
          </div>
        </div>

        <div className="progress-container">
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${String(((step - 1) / 2) * 100)}%` }}
            />
          </div>

          <div className="steps-row">
            <div className={`step-item ${step >= 1 ? 'active' : ''}`}>
              <div className="step-circle">
                <User size={12} />
              </div>
              <span>Identity</span>
            </div>
            <div className={`step-item ${step >= 2 ? 'active' : ''}`}>
              <div className="step-circle">
                <BookOpen size={12} />
              </div>
              <span>Academics</span>
            </div>
            <div className={`step-item ${step >= 3 ? 'active' : ''}`}>
              <div className="step-circle">
                <LinkIcon size={12} />
              </div>
              <span>Profiles</span>
            </div>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="modal-form">
          <div className="form-viewport">
            {step === 1 && (
              <div className="step-panel">
                <div className="panel-header">
                  <h2>Personal Identity</h2>
                  <p>Enter your basic demographic context.</p>
                </div>

                <div className="centered-fields">
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      name="name"
                      value={studentData.name}
                      onChange={handleInputChange}
                      placeholder="e.g. Aditya Dhanraj"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Gender *</label>
                    <select
                      name="gender"
                      value={studentData.gender}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Date of Birth *</label>
                    <input
                      type="date"
                      name="dob"
                      value={studentData.dob}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="step-panel">
                <div className="panel-header">
                  <h2>Academic Context</h2>
                  <p>Provide your institution context and branch.</p>
                </div>

                <div className="centered-fields">
                  <div className="form-group">
                    <label>Registration Number * (Unique Context ID)</label>
                    <input
                      type="text"
                      name="registration_no"
                      value={studentData.registration_no}
                      onChange={handleInputChange}
                      placeholder="e.g. 23FE10ITE00101"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Degree Programme *</label>
                    <select
                      name="degree"
                      value={studentData.degree}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="">Select Degree</option>
                      <option value="B.Tech">B.Tech</option>
                      <option value="M.Tech">M.Tech</option>
                      <option value="BCA">BCA</option>
                      <option value="MCA">MCA</option>
                      <option value="BBA">BBA</option>
                    </select>
                  </div>

                  <div className="form-group-row">
                    <div className="form-group half-width">
                      <label>Admission Year</label>
                      <input
                        type="number"
                        name="year"
                        value={studentData.year}
                        onChange={handleInputChange}
                        placeholder="YYYY"
                      />
                    </div>
                    <div className="form-group half-width">
                      <label>Branch</label>
                      <input
                        type="text"
                        name="branch"
                        value={studentData.branch}
                        onChange={handleInputChange}
                        placeholder="e.g. IT"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="step-panel">
                <div className="panel-header">
                  <h2>Professional Profiles</h2>
                  <p>Link your developer portfolio to finish onboarding.</p>
                </div>

                <div className="centered-fields">
                  <div className="form-group">
                    <label>LinkedIn Profile URL</label>
                    <input
                      type="url"
                      name="linked_in"
                      value={studentData.linked_in}
                      onChange={handleInputChange}
                      placeholder="https://linkedin.com/in/username"
                    />
                  </div>

                  <div className="form-group">
                    <label>GitHub Profile URL</label>
                    <input
                      type="url"
                      name="github"
                      value={studentData.github}
                      onChange={handleInputChange}
                      placeholder="https://github.com/username"
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      Password * (min {PASSWORD_MIN_LENGTH} characters)
                    </label>
                    <PasswordInput
                      name="password"
                      value={studentData.password}
                      onChange={handleInputChange}
                      placeholder="Create a secure password"
                      minLength={PASSWORD_MIN_LENGTH}
                      required
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            {step > 1 ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleBack}
              >
                <ChevronLeft size={16} /> Back
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                type="button"
                className="btn-primary"
                onClick={handleNext}
              >
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="submit"
                className="btn-submit"
                disabled={submitting}
              >
                {submitting ? 'Processing...' : 'Submit'} <Check size={16} />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default Signup;
