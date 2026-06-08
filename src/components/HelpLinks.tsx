import { buildHelpUrl, HELP_ABOUT_PAGE, HELP_GUIDE_PAGE } from '../lib/helpUrl';

interface HelpLinksProps {
  variant: 'welcome' | 'toolbar';
  disabled?: boolean;
  inBundledHelp?: boolean;
  onOpenAbout?: () => void;
  onOpenGuide?: () => void;
}

export function HelpLinks({
  variant,
  disabled = false,
  inBundledHelp = false,
  onOpenAbout,
  onOpenGuide,
}: HelpLinksProps) {
  const className = variant === 'welcome' ? 'welcome-help-links' : 'project-help-links';
  const useButtons = variant === 'welcome' || inBundledHelp;

  if (useButtons) {
    return (
      <div className={className}>
        <button
          type="button"
          className="help-link-btn"
          disabled={disabled}
          onClick={onOpenAbout}
        >
          About
        </button>
        <button
          type="button"
          className="help-link-btn"
          disabled={disabled}
          onClick={onOpenGuide}
        >
          User guide
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <a
        className="help-link-btn"
        href={buildHelpUrl(HELP_ABOUT_PAGE)}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={disabled ? true : undefined}
        onClick={disabled ? (event) => event.preventDefault() : undefined}
      >
        About
      </a>
      <a
        className="help-link-btn"
        href={buildHelpUrl(HELP_GUIDE_PAGE)}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={disabled ? true : undefined}
        onClick={disabled ? (event) => event.preventDefault() : undefined}
      >
        User guide
      </a>
    </div>
  );
}
