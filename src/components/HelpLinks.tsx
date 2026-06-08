interface HelpLinksProps {
  disabled?: boolean;
  onOpenAbout: () => void;
  onOpenGuide: () => void;
}

export function HelpLinks({ disabled = false, onOpenAbout, onOpenGuide }: HelpLinksProps) {
  return (
    <div className="welcome-help-links">
      <button type="button" className="help-link-btn" disabled={disabled} onClick={onOpenAbout}>
        About
      </button>
      <button type="button" className="help-link-btn" disabled={disabled} onClick={onOpenGuide}>
        User guide
      </button>
    </div>
  );
}
