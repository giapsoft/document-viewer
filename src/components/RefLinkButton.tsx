function LinkIcon() {
  return (
    <svg
      className="ref-link-icon"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
      />
    </svg>
  );
}

interface RefLinkButtonProps {
  refId: string;
  onJump: () => void;
}

function RefLinkButton({ refId, onJump }: RefLinkButtonProps) {
  return (
    <button
      type="button"
      className="ref-link-btn"
      title={`Go to source component: ${refId}`}
      aria-label={`Go to source component ${refId}`}
      onClick={(e) => {
        e.stopPropagation();
        onJump();
      }}
    >
      <LinkIcon />
    </button>
  );
}

export { LinkIcon, RefLinkButton };
