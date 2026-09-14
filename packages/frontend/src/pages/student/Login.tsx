import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { getApiErrorMessage, hasStatus, loginStudent } from '../../api/api';
import './styles/login.css';
import './styles/setpassword.css';
import PasswordInput from '../../components/PasswordInput';

const Login = () => {
  const [registrationNo, setRegistrationNo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [passwordNotSet, setPasswordNotSet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');

    setPasswordNotSet(false);

    if (registrationNo.trim() === '' || password === '') {
      setError('Please enter both your Registration Number and Password.');
      return;
    }

    setSubmitting(true);
    try {
      await loginStudent(registrationNo.trim(), password);
      navigate('/dashboard');
    } catch (err) {
      // 409 means the account exists but was provisioned without a password,
      // which starts the first login flow instead of showing a login error.
      if (hasStatus(err, 409)) {
        setPasswordNotSet(true);
        setError('');
        return;
      }
      setError(getApiErrorMessage(err, 'Login failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (passwordNotSet) {
    return (
      <div className="sp-wrapper">
        <div className="sp-card">
          <div className="sp-icon sp-icon-error">
            <X size={26} />
          </div>
          <h1 className="sp-title">Password Not Set</h1>
          <p className="sp-subtitle">
            Your password hasn&apos;t been set yet. Please set your password
            first to access your account.
          </p>
          <button
            className="sp-primary"
            type="button"
            onClick={() =>
              navigate('/set-password', {
                state: { registrationNo: registrationNo.trim() },
              })
            }
          >
            Reset Password
          </button>
          <button
            className="sp-back"
            type="button"
            onClick={() => setPasswordNotSet(false)}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

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

          {/* This form looks up a registration number, so a mentor signing in
              here can only ever get "Invalid credentials". */}
          <p className="redirect-text">
            Are you a mentor?{' '}
            <Link to="/faculty-login" className="orange-link">
              Faculty sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
