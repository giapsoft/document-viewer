import { useState } from 'react';
import type { CommentAnchor, DocComment, LoadedProject } from '../types';
import {
  buildCommentTree,
  formatCommentAnchorLabel,
  isRootComment,
  type CommentTreeNode,
} from '../lib/comments';
import { UsernamePrompt } from './UsernamePrompt';
import { setStoredCommentUsername } from '../lib/commentSession';
import { authorAvatarColors, authorInitial } from '../lib/commentAvatar';

interface CommentPanelProps {
  expanded: boolean;
  project: LoadedProject;
  username: string | null;
  linkTargetId: string | null;
  focusedCommentId: string | null;
  onToggle: () => void;
  onSetUsername: (username: string) => void;
  onSelectLinkTarget: (commentId: string | null) => void;
  onAddRoot: (body: string) => void;
  onAddReply: (parentId: string, body: string) => void;
  onFocusComment: (commentId: string) => void;
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
  linkTargetId,
  focusedCommentId,
  componentLabels,
  onSelectLinkTarget,
  onReply,
  onFocusComment,
  isReply = false,
}: {
  node: CommentTreeNode;
  linkTargetId: string | null;
  focusedCommentId: string | null;
  componentLabels: Map<string, string>;
  onSelectLinkTarget: (commentId: string | null) => void;
  onReply: (parentId: string, body: string) => void;
  onFocusComment: (commentId: string) => void;
  isReply?: boolean;
}) {
  const { comment } = node;
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const isRoot = isRootComment(comment);
  const isLinkTarget = linkTargetId === comment.id;
  const isFocused = focusedCommentId === comment.id;

  const anchorLabel = comment.anchor
    ? formatCommentAnchorLabel(
        comment.anchor,
        componentLabels.get(comment.anchor.componentId),
      )
    : null;
  const authorColors = authorAvatarColors(comment.author);

  const handleSelectForLink = () => {
    if (!isRoot) return;
    onSelectLinkTarget(isLinkTarget ? null : comment.id);
  };

  const stopCardClick = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.stopPropagation();
  };

  return (
    <li
      className={`comment-thread-item ${isReply ? 'comment-thread-item-reply' : ''} ${isLinkTarget ? 'comment-thread-item-linking' : ''} ${isFocused ? 'comment-thread-item-focused' : ''}`}
    >
      <article
        className={`comment-card ${isRoot ? 'comment-card-selectable' : ''} ${isLinkTarget ? 'comment-card-selected' : ''}`}
        onClick={isRoot ? handleSelectForLink : undefined}
        onKeyDown={
          isRoot
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleSelectForLink();
                }
              }
            : undefined
        }
        role={isRoot ? 'button' : undefined}
        tabIndex={isRoot ? 0 : undefined}
        aria-pressed={isRoot ? isLinkTarget : undefined}
        aria-label={
          isRoot
            ? isLinkTarget
              ? 'Comment selected for linking — press to cancel'
              : 'Select comment for linking'
            : undefined
        }
      >
        <div className="comment-card-row">
          <AuthorAvatar name={comment.author} />
          <div className="comment-card-content">
            <header className="comment-card-header">
              <span className="comment-author" style={{ color: authorColors.color }}>
                {comment.author}
              </span>
              {isLinkTarget && (
                <span className="comment-linking-badge">Selected for link</span>
              )}
              <time className="comment-time" dateTime={new Date(comment.createdAt).toISOString()}>
                {formatCommentTime(comment.createdAt)}
              </time>
            </header>

            <p className="comment-body">{comment.body}</p>

            {isRoot && anchorLabel && (
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

            {isRoot && !comment.anchor && !isLinkTarget && (
              <p className="comment-anchor-hint">
                Click to select, then click a component or select markdown text to link.
              </p>
            )}

            {isRoot && isLinkTarget && (
              <p className="comment-linking-hint">
                Click a component to link, or select text in markdown. Click the linked component again to unlink.
              </p>
            )}

            <footer className="comment-card-actions" onClick={stopCardClick}>
              {isRoot && (
                <button
                  type="button"
                  className={`comment-text-btn ${isLinkTarget ? 'comment-text-btn-active' : ''}`}
                  onClick={() => onSelectLinkTarget(isLinkTarget ? null : comment.id)}
                >
                  {isLinkTarget ? 'Cancel' : 'Link'}
                </button>
              )}
              <button
                type="button"
                className="comment-text-btn"
                onClick={() => setReplyOpen((open) => !open)}
              >
                {replyOpen ? 'Cancel' : 'Reply'}
              </button>
            </footer>

            {replyOpen && (
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

      {node.replies.length > 0 && (
        <ul className="comment-thread comment-thread-nested">
          {node.replies.map((child) => (
            <CommentTreeItem
              key={child.comment.id}
              node={child}
              isReply
              linkTargetId={linkTargetId}
              focusedCommentId={focusedCommentId}
              componentLabels={componentLabels}
              onSelectLinkTarget={onSelectLinkTarget}
              onReply={onReply}
              onFocusComment={onFocusComment}
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
  linkTargetId,
  focusedCommentId,
  onToggle,
  onSetUsername,
  onSelectLinkTarget,
  onAddRoot,
  onAddReply,
  onFocusComment,
}: CommentPanelProps) {
  const [composeBody, setComposeBody] = useState('');
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(username ?? '');

  const comments = project.relations.comments ?? [];
  const tree = buildCommentTree(comments);
  const commentCount = comments.length;

  const componentLabels = new Map<string, string>();
  for (const page of project.pages) {
    for (const component of page.components) {
      componentLabels.set(component.id, `${page.pageName} · ${component.id}`);
    }
  }

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
          {!username ? (
            <UsernamePrompt onConfirm={handleSetUsername} />
          ) : (
            <>
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

                {linkTargetId && (
                  <p className="comment-link-banner comment-link-banner-active">
                    Click a component to link, or select text in markdown. Click the same component again to unlink.
                  </p>
                )}

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

              <div className="comment-thread-scroll">
                {tree.length === 0 ? (
                  <p className="comment-empty">No comments yet.</p>
                ) : (
                  <ul className="comment-thread">
                    {tree.map((node) => (
                      <CommentTreeItem
                        key={node.comment.id}
                        node={node}
                        linkTargetId={linkTargetId}
                        focusedCommentId={focusedCommentId}
                        componentLabels={componentLabels}
                        onSelectLinkTarget={onSelectLinkTarget}
                        onReply={onAddReply}
                        onFocusComment={onFocusComment}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function getCommentAnchorForComponent(
  comments: DocComment[],
  componentId: string,
): CommentAnchor[] {
  return comments
    .filter((c) => c.parentId === null && c.anchor?.componentId === componentId)
    .map((c) => c.anchor!)
    .filter(Boolean);
}
