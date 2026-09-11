import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  KeyRound,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { getApiErrorMessage, requestPasswordEmail } from '../../api/api';
import './styles/setpassword.css';

/**
 * `/set-password`
 *
 * Step 3 of the first login flow: the student chooses how to set their
 * password. Picking email keeps them on this screen (steps 4A and 5A); picking
 * the authenticator hands over to `/set-password/authenticator`.
 */
type Stage = 'choose' | 'email-form' | 'email-sent';

const SetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const passedRegistration =
    (location.state as { registrationNo?: string } | null)?.registrationNo ??
    '';

  const [stage, setStage] = useState<Stage>('choose');
  const [registrationNo, setRegistrationNo] = useState(passedRegistration);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSendLink = async (
    e: FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    setError('');

    if (registrationNo.trim() === '') {
      setError('Please enter your registration number.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await requestPasswordEmail(registrationNo.trim());
      setSentTo(response.data.sent_to);
      setStage('email-sent');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not send the reset link.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sp-wrapper">
      <div className="sp-card">
        {stage === 'choose' && (
          <>
            <div className="sp-icon">
              <KeyRound size={26} />
            </div>
            <h1 className="sp-title">Set Your Password</h1>
            <p className="sp-subtitle">Choose a method to set your password</p>

            <button
              className="sp-option"
              onClick={() => setStage('email-form')}
              type="button"
            >
              <span className="sp-option-icon">
                <Mail size={20} />
              </span>
              <span className="sp-option-text">
                <strong>Send reset link to my</strong>
                <span>Outlook email</span>
              </span>
              <ChevronRight size={18} className="sp-option-chevron" />
            </button>

            <button
              className="sp-option"
              onClick={() =>
                navigate('/set-password/authenticator', {
                  state: { registrationNo },
                })
              }
              type="button"
            >
              <span className="sp-option-icon">
                <ShieldCheck size={20} />
              </span>
              <span className="sp-option-text">
                <strong>Use Microsoft</strong>
                <span>Authenticator app</span>
              </span>
              <ChevronRight size={18} className="sp-option-chevron" />
            </button>

            <button
              className="sp-back"
              onClick={() => navigate('/')}
              type="button"
            >
              <ArrowLeft size={15} /> Back to Login
            </button>
          </>
        )}

        {stage === 'email-form' && (
          <>
            <div className="sp-icon">
              <Mail size={26} />
            </div>
            <h1 className="sp-title">Reset via Email</h1>
            <p className="sp-subtitle">
              Enter your registration number and we will send a reset link to
              your Outlook email.
            </p>

            <form onSubmit={(e) => void handleSendLink(e)} className="sp-form">
              <label className="sp-label" htmlFor="sp-reg">
                Registration Number
              </label>
              <input
                id="sp-reg"
                className="sp-input"
                value={registrationNo}
                onChange={(e) => setRegistrationNo(e.target.value)}
                placeholder="Enter registration number"
                autoComplete="username"
              />

              {error !== '' && <p className="sp-error">{error}</p>}

              <button
                className="sp-primary"
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>

            <button
              className="sp-back"
              onClick={() => setStage('choose')}
              type="button"
            >
              <ArrowLeft size={15} /> Back
            </button>
          </>
        )}

        {stage === 'email-sent' && (
          <>
            <div className="sp-icon sp-icon-success">
              <ShieldCheck size={26} />
            </div>
            <h1 className="sp-title">Reset Link Sent!</h1>
            <p className="sp-subtitle">
              We have sent a password reset link to your Outlook email
              {sentTo !== null ? ` (${sentTo})` : ''}. Please check your inbox
              and spam folder.
            </p>
            <p className="sp-note">The link expires in 30 minutes.</p>

            <button
              className="sp-primary"
              onClick={() => navigate('/')}
              type="button"
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default SetPassword;
