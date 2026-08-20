import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PASSWORD_MIN_LENGTH, isValidPassword } from 'shared';
import {
  getApiErrorMessage,
  loginFaculty,
  registerFaculty,
} from '../../api/api';
import type { FacultySignupForm } from '../../api/api';
import PasswordInput from '../../components/PasswordInput';
import './teacherlogin.css';

const FacultyLogin = () => {
  const [isLogin, setIsLogin] = useState(true);
  const navigate = useNavigate();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupData, setSignupData] = useState<FacultySignupForm>({
    name: '',
    email: '',
    designation: '',
    department: '',
    phone_number: '',
    linked_in: '',
    muj_page: '',
    password: '',
  });

  const handleLogin = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (loginEmail.trim() === '' || loginPassword === '') {
      alert('Please enter your email and password.');
      return;
    }
    try {
      await loginFaculty(loginEmail.trim(), loginPassword);
      navigate('/dashboard-faculty');
    } catch (err) {
      alert(
        getApiErrorMessage(err, 'Login failed. Please check your credentials.')
      );
    }
  };

  const handleSignup = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!isValidPassword(signupData.password)) {
      alert(
        `Password must be at least ${String(PASSWORD_MIN_LENGTH)} characters long.`
      );
      return;
    }
    try {
      const response = await registerFaculty(signupData);
      if (response.status === 200 || response.status === 201) {
        await loginFaculty(signupData.email, signupData.password);
        navigate('/dashboard-faculty');
      }
    } catch (err) {
      console.error('Signup failed:', err);
      alert(
        getApiErrorMessage(
          err,
          'Registration failed. Please check your details.'
        )
      );
    }
  };

  const handleSignupChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setSignupData({ ...signupData, [e.target.name]: e.target.value });
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-modal">
        <h1 className="brand-title" style={{ textAlign: 'center' }} />

        <div className="toggle-container">
          <button
            className={`toggle-btn ${isLogin ? 'active' : ''}`}
            onClick={() => setIsLogin(true)}
          >
            Login
          </button>
          <button
            className={`toggle-btn ${!isLogin ? 'active' : ''}`}
            onClick={() => setIsLogin(false)}
          >
            Register
          </button>
        </div>

        <div className="form-viewport">
          <div
            className={`form-slider ${isLogin ? 'show-login' : 'show-signup'}`}
          >
            <form className="auth-form" onSubmit={(e) => void handleLogin(e)}>
              <h2>Faculty Login</h2>
              <div className="input-group">
                <label>Official Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label>Password</label>
                <PasswordInput
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="action-button mt-auto">
                Sign In
              </button>
            </form>

            <form
              className="auth-form signup-form"
              onSubmit={(e) => void handleSignup(e)}
            >
              <h2>Faculty Registration</h2>
              <div className="scrollable-fields">
                <div className="input-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    name="name"
                    onChange={handleSignupChange}
                    required
                  />
                </div>
                <div className="input-group">
                  <label>Official Email</label>
                  <input
                    type="email"
                    name="email"
                    onChange={handleSignupChange}
                    required
                  />
                </div>
                <div className="input-group">
                  <label>Password (min {PASSWORD_MIN_LENGTH} characters)</label>
                  <PasswordInput
                    name="password"
                    onChange={handleSignupChange}
                    minLength={PASSWORD_MIN_LENGTH}
                    required
                  />
                </div>
                <div className="input-row">
                  <div className="input-group">
                    <label>Designation</label>
                    <input
                      type="text"
                      name="designation"
                      onChange={handleSignupChange}
                      required
                    />
                  </div>
                  <div className="input-group">
                    <label>Department</label>
                    <input
                      type="text"
                      name="department"
                      onChange={handleSignupChange}
                      required
                    />
                  </div>
                </div>
                <div className="input-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    name="phone_number"
                    onChange={handleSignupChange}
                    required
                  />
                </div>
                <div className="input-group">
                  <label>LinkedIn Profile URL</label>
                  <input
                    type="url"
                    name="linked_in"
                    onChange={handleSignupChange}
                  />
                </div>
                <div className="input-group">
                  <label>MUJ Profile Page URL</label>
                  <input
                    type="url"
                    name="muj_page"
                    onChange={handleSignupChange}
                  />
                </div>
              </div>
              <button type="submit" className="action-button">
                Create Account
              </button>
            </form>
          </div>
        </div>

        <p className="auth-switch">
          Are you a student?
          <Link to="/">Student login</Link>
        </p>
      </div>
    </div>
  );
};

export default FacultyLogin;
