import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import {
  getApiErrorMessage,
  startAuthenticatorSetup,
  verifyAuthenticatorCode,
} from '../../api/api';
import './styles/setpassword.css';

/**
 * `/set-password/authenticator`
 *
 * Steps 4B to 6B: enter the registration number, scan the QR code with
 * Microsoft Authenticator, then type the 6-digit code. A verified code returns
 * a single-use setup token, which carries the student to the password screen.
 */
type Stage = 'registration' | 'scan' | 'code';

const CODE_LENGTH = 6;

const AuthenticatorSetup = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [stage, setStage] = useState<Stage>('registration');
  const [registrationNo, setRegistrationNo] = useState(
    (location.state as { registrationNo?: string } | null)?.registrationNo ?? ''
  );
  const [qrCode, setQrCode] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const handleStart = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');

    if (registrationNo.trim() === '') {
      setError('Please enter your registration number.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await startAuthenticatorSetup(registrationNo.trim());
      setQrCode(response.data.qr_code);
      setManualKey(response.data.manual_key);
      setStage('scan');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not start the setup.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDigit = (
    index: number,
    event: ChangeEvent<HTMLInputElement>
  ): void => {
    const value = event.target.value.replace(/\D/g, '');
    if (value === '') {
      setDigits((current) => current.map((d, i) => (i === index ? '' : d)));
      return;
    }

    // Pasting the whole code into the first box fills the row.
    const characters = value.split('');
    setDigits((current) => {
      const next = [...current];
      characters.forEach((character, offset) => {
        if (index + offset < CODE_LENGTH) next[index + offset] = character;
      });
      return next;
    });

    const nextIndex = Math.min(index + characters.length, CODE_LENGTH - 1);
    inputsRef.current[nextIndex]?.focus();
  };

  const handleKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLInputElement>
  ): void => {
    if (event.key === 'Backspace' && digits[index] === '' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (): Promise<void> => {
    const code = digits.join('');
    setError('');

    if (code.length !== CODE_LENGTH) {
      setError('Enter all six digits from the app.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await verifyAuthenticatorCode(
        registrationNo.trim(),
        code
      );
      navigate('/set-password/new', {
        state: { token: response.data.setup_token, via: 'authenticator' },
      });
    } catch (err) {
      setError(getApiErrorMessage(err, 'That code is not valid.'));
      setDigits(Array(CODE_LENGTH).fill(''));
      inputsRef.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sp-wrapper">
      <div className="sp-card">
        <div className="sp-icon">
          <ShieldCheck size={26} />
        </div>

        {stage === 'registration' && (
          <>
            <h1 className="sp-title">Use Microsoft Authenticator</h1>
            <p className="sp-subtitle">
              Enter your registration number to set up Microsoft Authenticator.
            </p>

            <form onSubmit={(e) => void handleStart(e)} className="sp-form">
              <label className="sp-label" htmlFor="auth-reg">
                Registration Number
              </label>
              <input
                id="auth-reg"
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
                {submitting ? 'Starting…' : 'Continue'}
              </button>
            </form>

            <button
              className="sp-back"
              onClick={() => navigate('/set-password')}
              type="button"
            >
              <ArrowLeft size={15} /> Back
            </button>
          </>
        )}

        {stage === 'scan' && (
          <>
            <h1 className="sp-title">Scan this QR code</h1>
            <p className="sp-subtitle">with the Microsoft Authenticator app</p>

            <img className="sp-qr" src={qrCode} alt="Authenticator QR code" />

            <p className="sp-note">
              Can&apos;t scan? Enter this code manually:
            </p>
            <code className="sp-manual-key">{manualKey}</code>

            <button
              className="sp-primary"
              onClick={() => setStage('code')}
              type="button"
            >
              I&apos;ve added it
            </button>
            <button
              className="sp-back"
              onClick={() => setStage('registration')}
              type="button"
            >
              <ArrowLeft size={15} /> Back
            </button>
          </>
        )}

        {stage === 'code' && (
          <>
            <h1 className="sp-title">Enter the 6-digit code</h1>
            <p className="sp-subtitle">
              Enter the code shown in your Microsoft Authenticator app.
            </p>

            <div className="sp-otp">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    inputsRef.current[index] = element;
                  }}
                  className="sp-otp-box"
                  value={digit}
                  onChange={(event) => handleDigit(index, event)}
                  onKeyDown={(event) => handleKeyDown(index, event)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={CODE_LENGTH}
                  aria-label={`Digit ${index + 1}`}
                />
              ))}
            </div>

            {error !== '' && <p className="sp-error">{error}</p>}

            <button
              className="sp-primary"
              onClick={() => void handleVerify()}
              type="button"
              disabled={submitting}
            >
              {submitting ? 'Verifying…' : 'Verify Code'}
            </button>
            <button
              className="sp-back"
              onClick={() => setStage('scan')}
              type="button"
            >
              <ArrowLeft size={15} /> Back
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthenticatorSetup;
