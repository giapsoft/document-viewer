interface ComponentReadBarProps {
  isRead: boolean;
  onToggle: () => void;
}

export function ComponentReadBar({ isRead, onToggle }: ComponentReadBarProps) {
  return (
    <div
      className={`component-read-bar ${isRead ? 'is-read' : 'is-unread'}`}
      role="presentation"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      title={isRead ? 'Mark as unread' : 'Mark as read'}
    >
      <span
        className={`component-read-dot ${isRead ? 'is-read' : 'is-unread'}`}
        aria-hidden="true"
      />
      <span className="component-read-label">{isRead ? 'Read' : 'Unread'}</span>
      <span className="component-read-action">{isRead ? 'Mark unread' : 'Mark read'}</span>
    </div>
  );
}
