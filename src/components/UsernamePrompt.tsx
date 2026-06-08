import { useState } from 'react';
import { normalizeReadUsername } from '../lib/readState';

interface UsernamePromptProps {
  initialValue?: string;
  title?: string;
  hint?: string;
  onConfirm: (username: string) => void;
}

export function UsernamePrompt({
  initialValue = '',
  title = 'Your name for comments',
  hint = 'Enter a display name for this session. You can change it later from the Comments panel.',
  onConfirm,
}: UsernamePromptProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="username-prompt">
      <p className="username-prompt-title">{title}</p>
      <p className="username-prompt-hint">{hint}</p>
      <form
        className="username-prompt-form"
        onSubmit={(event) => {
          event.preventDefault();
          const normalized = normalizeReadUsername(value);
          if (!normalized) {
            setError('Use 1–20 letters or digits only (A–Z, a–z, 0–9).');
            return;
          }
          setError(null);
          onConfirm(normalized);
        }}
      >
        <input
          type="text"
          className="username-prompt-input"
          value={value}
          placeholder="Username"
          autoFocus
          maxLength={20}
          pattern="[A-Za-z0-9]+"
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
        />
        <button type="submit" className="username-prompt-submit" disabled={!value.trim()}>
          Continue
        </button>
      </form>
      {error ? <p className="username-validation-error">{error}</p> : null}
    </div>
  );
}
