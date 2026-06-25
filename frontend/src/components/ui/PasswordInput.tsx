import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export default function PasswordInput({ label, id, className = '', ...props }: Props) {
  const [visible, setVisible] = useState(false);
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="input-group">
      <label className="input-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="password-wrapper">
        <input
          id={inputId}
          className={`input password-input ${className}`.trim()}
          type={visible ? 'text' : 'password'}
          {...props}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}
