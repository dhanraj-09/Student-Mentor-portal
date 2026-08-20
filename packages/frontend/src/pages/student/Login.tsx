import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getApiErrorMessage, loginStudent } from '../../api/api';
import PasswordInput from '../../components/PasswordInput';
import './styles/login.css';

const Login = () => {
  const [registrationNo, setRegistrationNo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');

    if (registrationNo.trim() === '' || password === '') {
      setError('Please enter both your Registration Number and Password.');
      return;
    }

    setSubmitting(true);
    try {
      await loginStudent(registrationNo.trim(), password);
      navigate('/dashboard');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Login failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-banner">
        <div className="banner-content">
          <div className="brand-logo">M</div>
          <h1 className="banner-title">MARG Dashak</h1>
          <p className="banner-text">
            Your central hub to connect, resolve queries, and manage your
            academic profile.
          </p>
          <img
            src="https://illustrations.popsy.co/orange/student-going-to-school.svg"
            alt="Student"
            className="banner-image"
          />
        </div>
      </div>

      <div className="login-form-section">
        <div className="login-card">
          <h2 className="greeting">Welcome Back! 👋</h2>
          <p className="instruction">
            Enter your credentials to continue to your dashboard.
          </p>

          <form
            onSubmit={(e) => void handleLogin(e)}
            className="pure-login-form"
          >
            <div className="single-input-group">
              <label htmlFor="regNo">Registration Number</label>
              <input
                type="text"
                id="regNo"
                placeholder="e.g. 23FE10ITE00xxx"
                value={registrationNo}
                onChange={(e) => setRegistrationNo(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="single-input-group">
              <label htmlFor="password">Password</label>
              <PasswordInput
                id="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error !== '' && (
              <p
                style={{
                  color: '#d03b3b',
                  fontSize: '14px',
                  margin: '4px 0 0',
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="action-button"
              disabled={submitting}
            >
              {submitting ? 'Signing in...' : 'Access Dashboard'}
            </button>
          </form>

          <div className="divider">
            <span>or</span>
          </div>

          <p className="redirect-text">
            New student?{' '}
            <Link to="/register" className="orange-link">
              Create your profile
            </Link>
          </p>

          <p className="redirect-text" style={{ marginTop: '12px' }}>
            Are you a faculty member?
            <Link to="/faculty-login" className="orange-link">
              Faculty login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
