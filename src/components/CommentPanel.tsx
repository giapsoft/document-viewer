import { useState, type CSSProperties } from 'react';
import type { CommentAnchor, DocComment, LoadedProject, AppStyles } from '../types';
import {
  activeComments,
  buildCommentTree,
  canOwnComment,
  formatCommentAnchorLabel,
  type CommentTreeNode,
} from '../lib/comments';
import { getCommentCardSelectionStyle } from '../lib/styles';
import { UsernamePrompt } from './UsernamePrompt';
import { isTypingTarget } from '../lib/keyboard';
import { setStoredCommentUsername } from '../lib/commentSession';
import { authorAvatarColors, authorInitial } from '../lib/commentAvatar';

interface CommentPanelProps {
  expanded: boolean;
  project: LoadedProject;
  username: string | null;
  authorId: string;
  selectedCommentId: string | null;
  commentLinkCtrlActive?: boolean;
  canLinkSelectedComment?: boolean;
  onToggle: () => void;
  onSetUsername: (username: string) => void;
  onSelectComment: (commentId: string) => void;
  onAddRoot: (body: string) => void;
  onAddReply: (parentId: string, body: string) => void;
  onFocusComment: (commentId: string) => void;
  onUpdateComment: (commentId: string, body: string) => void;
  onDeleteComment: (commentId: string) => void;
}

function AuthorAvatar({ name, small = false }: { name: string; small?: boolean }) {
  const colors = authorAvatarColors(name);
  return (
    <span
      className={`comment-avatar${small ? ' comment-avatar-sm' : ''}`}
      style={{ backgroundColor: colors.background, color: colors.color }}
      aria-hidden
    >
      {authorInitial(name)}
    </span>
  );
}

function formatCommentTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CommentTreeItem({
  node,
  selectedCommentId,
  commentLinkCtrlActive,
  canLinkSelectedComment,
  appStyles,
  componentLabels,
  authorId,
  username,
  onSelectComment,
  onReply,
  onFocusComment,
  onUpdateComment,
  onDeleteComment,
  hasUsername,
  isReply = false,
}: {
  node: CommentTreeNode;
  selectedCommentId: string | null;
  commentLinkCtrlActive: boolean;
  canLinkSelectedComment: boolean;
  appStyles: AppStyles;
  componentLabels: Map<string, string>;
  authorId: string;
  username: string | null;
  onSelectComment: (commentId: string) => void;
  onReply: (parentId: string, body: string) => void;
  onFocusComment: (commentId: string) => void;
  onUpdateComment: (commentId: string, body: string) => void;
  onDeleteComment: (commentId: string) => void;
  hasUsername: boolean;
  isReply?: boolean;
}) {
  const { comment } = node;
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const isSelected = selectedCommentId === comment.id;
  const isOwner = canOwnComment(comment, authorId, username);
  const showLinkHint = isSelected && isOwner;
  const linkPreviewActive = showLinkHint && commentLinkCtrlActive;
  const selectionStyle: CSSProperties | undefined = isSelected
    ? getCommentCardSelectionStyle(linkPreviewActive, appStyles)
    : undefined;

  const anchorLabel = comment.anchor
    ? formatCommentAnchorLabel(
        comment.anchor,
        componentLabels.get(comment.anchor.componentId),
      )
    : null;
  const authorColors = authorAvatarColors(comment.author);

  const handleToggleSelect = () => {
    if (editOpen) return;
    onSelectComment(comment.id);
  };

  const stopCardClick = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.stopPropagation();
  };

  return (
    <li
      className={`comment-thread-item ${isReply ? 'comment-thread-item-reply' : ''} ${isSelected ? 'comment-thread-item-selected' : ''}`}
    >
      <article
        className={`comment-card comment-card-selectable${isSelected ? ' comment-card-selected' : ''}`}
        style={selectionStyle}
        onClick={handleToggleSelect}
        onKeyDown={(event) => {
          if (isTypingTarget(event.target)) return;
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleToggleSelect();
          }
        }}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        aria-label={isSelected ? 'Comment selected — press to deselect' : 'Select comment'}
      >
        <div className="comment-card-row">
          <AuthorAvatar name={comment.author} />
          <div className="comment-card-content">
            <header className="comment-card-header">
              <span className="comment-author" style={{ color: authorColors.color }}>
                {comment.author}
              </span>
              {isSelected && (
                <span
                  className={`comment-selected-badge${linkPreviewActive ? ' comment-selected-badge-preview' : ' comment-selected-badge-primary'}`}
                >
                  Selected
                </span>
              )}
              <time className="comment-time" dateTime={new Date(comment.createdAt).toISOString()}>
                {formatCommentTime(comment.createdAt)}
              </time>
            </header>

            {!editOpen && <p className="comment-body">{comment.body}</p>}

            {editOpen && (
              <form
                className="comment-inline-form"
                onClick={stopCardClick}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!editBody.trim()) return;
                  onUpdateComment(comment.id, editBody);
                  setEditOpen(false);
                }}
              >
                <textarea
                  className="comment-compose-input comment-compose-input-compact"
                  rows={3}
                  value={editBody}
                  autoFocus
                  onChange={(event) => setEditBody(event.target.value)}
                />
                <div className="comment-inline-form-actions">
                  <button
                    type="submit"
                    className="comment-compose-submit comment-compose-submit-compact"
                    disabled={!editBody.trim()}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="comment-text-btn"
                    onClick={() => {
                      setEditBody(comment.body);
                      setEditOpen(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {!editOpen && anchorLabel && (
              <button
                type="button"
                className="comment-anchor-pill"
                onClick={(event) => {
                  stopCardClick(event);
                  onFocusComment(comment.id);
                }}
                title="Jump to linked content"
              >
                ↗ {anchorLabel}
              </button>
            )}

            <footer className="comment-card-actions" onClick={stopCardClick}>
              {!editOpen && (
                <>
                  {hasUsername && (
                    <button
                      type="button"
                      className="comment-text-btn"
                      onClick={() => setReplyOpen((open) => !open)}
                    >
                      {replyOpen ? 'Cancel' : 'Reply'}
                    </button>
                  )}
                  {isOwner && (
                    <>
                      <button
                        type="button"
                        className="comment-text-btn"
                        onClick={() => {
                          setEditBody(comment.body);
                          setEditOpen(true);
                          setReplyOpen(false);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="comment-text-btn comment-text-btn-danger"
                        onClick={() => {
                          const hasReplies = node.replies.length > 0;
                          const message = hasReplies
                            ? 'Delete this comment and all replies?'
                            : 'Delete this comment?';
                          if (!window.confirm(message)) return;
                          onDeleteComment(comment.id);
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </>
              )}
            </footer>

            {replyOpen && hasUsername && (
              <form
                className="comment-inline-form"
                onClick={stopCardClick}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!replyBody.trim()) return;
                  onReply(comment.id, replyBody);
                  setReplyBody('');
                  setReplyOpen(false);
                }}
              >
                <textarea
                  className="comment-compose-input comment-compose-input-compact"
                  rows={2}
                  value={replyBody}
                  placeholder="Reply…"
                  autoFocus
                  onChange={(event) => setReplyBody(event.target.value)}
                />
                <button
                  type="submit"
                  className="comment-compose-submit comment-compose-submit-compact"
                  disabled={!replyBody.trim()}
                >
                  Post
                </button>
              </form>
            )}
          </div>
        </div>
      </article>

      {showLinkHint && (
        <p
          className={`comment-link-hint-float${linkPreviewActive ? ' comment-link-hint-float-preview' : ' comment-link-hint-float-primary'}`}
          role="status"
        >
          {linkPreviewActive
            ? 'Hold Ctrl — click a component to preview the link, or select text in markdown. Release Ctrl to save. Click the same component again to clear.'
            : 'Comment selected — hold Ctrl to link to a component or markdown selection. Release Ctrl to save.'}
        </p>
      )}

      {node.replies.length > 0 && (
        <ul className="comment-thread comment-thread-nested">
          {node.replies.map((child) => (
            <CommentTreeItem
              key={child.comment.id}
              node={child}
              isReply
              selectedCommentId={selectedCommentId}
              commentLinkCtrlActive={commentLinkCtrlActive}
              canLinkSelectedComment={canLinkSelectedComment}
              appStyles={appStyles}
              componentLabels={componentLabels}
              authorId={authorId}
              username={username}
              onSelectComment={onSelectComment}
              onReply={onReply}
              onFocusComment={onFocusComment}
              onUpdateComment={onUpdateComment}
              onDeleteComment={onDeleteComment}
              hasUsername={hasUsername}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CommentPanel({
  expanded,
  project,
  username,
  authorId,
  selectedCommentId,
  commentLinkCtrlActive = false,
  canLinkSelectedComment = false,
  onToggle,
  onSetUsername,
  onSelectComment,
  onAddRoot,
  onAddReply,
  onFocusComment,
  onUpdateComment,
  onDeleteComment,
}: CommentPanelProps) {
  const [composeBody, setComposeBody] = useState('');
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(username ?? '');

  const comments = activeComments(project.relations.comments ?? []);
  const tree = buildCommentTree(comments);
  const commentCount = comments.length;

  const componentLabels = new Map<string, string>();
  for (const page of project.pages) {
    for (const component of page.components) {
      componentLabels.set(component.id, `${page.pageName} · ${component.id}`);
    }
  }
  const appStyles = project.styles;

  const handleSetUsername = (name: string) => {
    setStoredCommentUsername(name);
    onSetUsername(name);
    setEditingUsername(false);
    setUsernameDraft(name);
  };

  return (
    <div
      className={`page-panel comment-panel ${expanded ? 'expanded' : 'shrunk'}`}
      data-panel="comments"
    >
      <div className="page-panel-header comment-panel-header">
        {expanded ? (
          <>
            <span className="page-panel-title comment-panel-title">
              Comments
              {commentCount > 0 && (
                <span className="comment-count-badge">{commentCount}</span>
              )}
            </span>
            <button type="button" className="panel-toggle-btn" onClick={onToggle} title="Shrink">
              ◀
            </button>
          </>
        ) : (
          <>
            <button type="button" className="panel-toggle-btn" onClick={onToggle} title="Expand">
              ▶
            </button>
            <span className="page-panel-vertical-title" title={`Comments (${commentCount})`}>
              Comments
            </span>
          </>
        )}
      </div>

      {expanded && (
        <div className="page-panel-body comment-panel-body">
          {!project.remoteDocId && !project.folderHandle && (
            <p className="comment-storage-hint">
              Comments are only in memory. Use Save → remote storage (or a local folder) so they
              persist and sync across browsers.
            </p>
          )}
          {!username ? (
            <UsernamePrompt
              title="Sign in to comment"
              hint="You can read all comments below without a name. Enter a display name to post, reply, or link your own comments."
              onConfirm={handleSetUsername}
            />
          ) : (
            <div className="comment-panel-top">
              <div className="comment-user-row">
                <AuthorAvatar name={username} small />
                {editingUsername ? (
                  <div className="comment-user-edit">
                    <input
                      type="text"
                      className="comment-user-input"
                      value={usernameDraft}
                      onChange={(event) => setUsernameDraft(event.target.value)}
                    />
                    <button
                      type="button"
                      className="comment-text-btn"
                      onClick={() => handleSetUsername(usernameDraft)}
                      disabled={!usernameDraft.trim()}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="comment-text-btn"
                      onClick={() => setEditingUsername(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <span
                      className="comment-user-name"
                      style={{ color: authorAvatarColors(username).color }}
                    >
                      {username}
                    </span>
                    <button
                      type="button"
                      className="comment-text-btn"
                      onClick={() => {
                        setUsernameDraft(username);
                        setEditingUsername(true);
                      }}
                    >
                      Edit
                    </button>
                  </>
                )}
              </div>

              <form
                className="comment-compose-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!composeBody.trim()) return;
                  onAddRoot(composeBody);
                  setComposeBody('');
                }}
              >
                <textarea
                  className="comment-compose-input"
                  rows={2}
                  value={composeBody}
                  placeholder="Write a comment…"
                  onChange={(event) => setComposeBody(event.target.value)}
                />
                <div className="comment-compose-actions">
                  <button
                    type="submit"
                    className="comment-compose-submit"
                    disabled={!composeBody.trim()}
                  >
                    Add comment
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="comment-thread-scroll">
            {tree.length === 0 ? (
              <p className="comment-empty">No comments yet.</p>
            ) : (
              <ul className="comment-thread">
                {tree.map((node) => (
                  <CommentTreeItem
                    key={node.comment.id}
                    node={node}
                    selectedCommentId={selectedCommentId}
                    commentLinkCtrlActive={commentLinkCtrlActive}
                    canLinkSelectedComment={canLinkSelectedComment}
                    appStyles={appStyles}
                    componentLabels={componentLabels}
                    authorId={authorId}
                    username={username}
                    onSelectComment={onSelectComment}
                    onReply={onAddReply}
                    onFocusComment={onFocusComment}
                    onUpdateComment={onUpdateComment}
                    onDeleteComment={onDeleteComment}
                    hasUsername={Boolean(username)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function getCommentAnchorForComponent(
  comments: DocComment[],
  componentId: string,
): CommentAnchor[] {
  return activeComments(comments)
    .filter((c) => c.anchor?.componentId === componentId)
    .map((c) => c.anchor!)
    .filter(Boolean);
}
