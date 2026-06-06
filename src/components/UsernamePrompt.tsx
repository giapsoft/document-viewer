import { useState } from 'react';

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

  return (
    <div className="username-prompt">
      <p className="username-prompt-title">{title}</p>
      <p className="username-prompt-hint">{hint}</p>
      <form
        className="username-prompt-form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = value.trim();
          if (!trimmed) return;
          onConfirm(trimmed);
        }}
      >
        <input
          type="text"
          className="username-prompt-input"
          value={value}
          placeholder="Username"
          autoFocus
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit" className="username-prompt-submit" disabled={!value.trim()}>
          Continue
        </button>
      </form>
    </div>
  );
}
