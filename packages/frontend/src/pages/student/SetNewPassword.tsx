import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, CheckCircle2, Eye, EyeOff, Lock, X } from 'lucide-react';
import { checkPasswordRules } from 'shared';
import {
  checkPasswordSetupToken,
  completePasswordSetup,
  getApiErrorMessage,
} from '../../api/api';
import './styles/setpassword.css';

/**
 * `/set-password/new`
 *
 * Steps 7A and 7B: set and confirm the new password. The token arrives either
 * in the emailed link (`?token=`) or in navigation state after an authenticator
 * code was verified.
 */
const SetNewPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const token =
    searchParams.get('token') ??
    (location.state as { token?: string } | null)?.token ??
    '';

  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const rules = checkPasswordRules(password);
  const rulesMet = rules.minLength && rules.mixedCase && rules.numberAndSymbol;

  useEffect(() => {
    if (token === '') {
      setChecking(false);
      setError('That link is invalid or has expired. Request a new one.');
      return;
    }

    let cancelled = false;
    checkPasswordSetupToken(token)
      .then((response) => {
        if (cancelled) return;
        setStudentName(response.data.name);
        setTokenValid(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          getApiErrorMessage(
            err,
            'That link is invalid or has expired. Request a new one.'
          )
        );
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');

    if (!rulesMet) {
      setError('Your password does not meet all the requirements yet.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await completePasswordSetup(token, password);
      setDone(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not set your password.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="sp-wrapper">
        <div className="sp-card">
          <p className="sp-subtitle">Checking your link…</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="sp-wrapper">
        <div className="sp-card">
          <div className="sp-icon sp-icon-success">
            <CheckCircle2 size={26} />
          </div>
          <h1 className="sp-title">Password Reset Successful!</h1>
          <p className="sp-subtitle">
            Your password has been set successfully.
          </p>
          <button
            className="sp-primary"
            onClick={() => navigate('/')}
            type="button"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="sp-wrapper">
        <div className="sp-card">
          <div className="sp-icon sp-icon-error">
            <X size={26} />
          </div>
          <h1 className="sp-title">Link no longer valid</h1>
          <p className="sp-subtitle">{error}</p>
          <button
            className="sp-primary"
            onClick={() => navigate('/set-password')}
            type="button"
          >
            Request a new link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sp-wrapper">
      <div className="sp-card">
        <div className="sp-icon">
          <Lock size={26} />
        </div>
        <h1 className="sp-title">Set New Password</h1>
        <p className="sp-subtitle">
          {studentName !== '' ? `Hi ${studentName}, ` : ''}enter your new
          password below.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="sp-form">
          <label className="sp-label" htmlFor="sp-new">
            New Password
          </label>
          <div className="sp-input-row">
            <input
              id="sp-new"
              className="sp-input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              autoComplete="new-password"
            />
            <button
              type="button"
              className="sp-eye"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          <label className="sp-label" htmlFor="sp-confirm">
            Confirm Password
          </label>
          <div className="sp-input-row">
            <input
              id="sp-confirm"
              className="sp-input"
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
            />
            <button
              type="button"
              className="sp-eye"
              onClick={() => setShowConfirm((value) => !value)}
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
            >
              {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          <div className="sp-rules">
            <p className="sp-rules-title">Password must contain:</p>
            <ul>
              <li className={rules.minLength ? 'met' : ''}>
                {rules.minLength ? <Check size={14} /> : <X size={14} />}
                At least 8 characters
              </li>
              <li className={rules.mixedCase ? 'met' : ''}>
                {rules.mixedCase ? <Check size={14} /> : <X size={14} />}
                Uppercase and lowercase letters
              </li>
              <li className={rules.numberAndSymbol ? 'met' : ''}>
                {rules.numberAndSymbol ? <Check size={14} /> : <X size={14} />}
                Number and special character
              </li>
            </ul>
          </div>

          {error !== '' && <p className="sp-error">{error}</p>}

          <button className="sp-primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetNewPassword;
