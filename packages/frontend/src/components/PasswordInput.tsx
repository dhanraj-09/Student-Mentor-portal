import { useState } from 'react';
import type { CSSProperties, InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './PasswordInput.css';

// A password <input> with a show/hide eye toggle. Forwards every normal input
// prop (value, onChange, name, placeholder, minLength, required, ...) so it
// drops into any existing form and inherits that page's input styling.
type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

const PasswordInput = ({ style, ...rest }: PasswordInputProps) => {
  const [show, setShow] = useState(false);
  // Reserve room on the right for the eye button regardless of page CSS.
  const inputStyle: CSSProperties = { paddingRight: '44px', ...style };

  return (
    <div className="pw-field">
      <input {...rest} type={show ? 'text' : 'password'} style={inputStyle} />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShow((prev) => !prev)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
};

export default PasswordInput;
