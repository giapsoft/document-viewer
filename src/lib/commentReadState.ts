import type { DocComment } from '../types';
import { parseReadStateFile } from './readState';

export type CommentReadState = Record<string, number>;

export function getCommentRevision(comment: DocComment): number {
  return comment.updatedAt ?? comment.createdAt;
}

export function commentReadStateFileName(username: string): string {
  return `${username}.comment-reads.json`;
}

export const parseCommentReadStateFile = parseReadStateFile;

export function isCommentRead(
  commentId: string,
  revision: number,
  readState: CommentReadState,
): boolean {
  const readRevision = readState[commentId];
  return readRevision !== undefined && readRevision >= revision;
}

export function markCommentRead(
  readState: CommentReadState,
  commentId: string,
  revision: number,
): CommentReadState {
  const current = readState[commentId];
  if (current !== undefined && current >= revision) return readState;
  return { ...readState, [commentId]: revision };
}

export function markCommentUnread(
  readState: CommentReadState,
  commentId: string,
): CommentReadState {
  const next = { ...readState };
  delete next[commentId];
  return next;
}

export function isOwnComment(comment: DocComment, username: string | null): boolean {
  if (!username) return false;
  return comment.author.trim().toLowerCase() === username.trim().toLowerCase();
}

export function isForeignComment(comment: DocComment, username: string | null): boolean {
  return username != null && !isOwnComment(comment, username);
}

export function isCommentReadForUser(
  comment: DocComment,
  username: string | null,
  readState: CommentReadState,
): boolean {
  if (!username || isOwnComment(comment, username)) return true;
  return isCommentRead(comment.id, getCommentRevision(comment), readState);
}

export function countForeignComments(
  comments: DocComment[],
  username: string | null,
): number {
  if (!username) return 0;
  let count = 0;
  for (const comment of comments) {
    if (isForeignComment(comment, username)) count += 1;
  }
  return count;
}

export function countUnreadComments(
  comments: DocComment[],
  readState: CommentReadState,
): number {
  let count = 0;
  for (const comment of comments) {
    if (!isCommentRead(comment.id, getCommentRevision(comment), readState)) {
      count += 1;
    }
  }
  return count;
}

export function countUnreadForeignComments(
  comments: DocComment[],
  username: string | null,
  readState: CommentReadState,
): number {
  if (!username) return 0;
  let count = 0;
  for (const comment of comments) {
    if (!isForeignComment(comment, username)) continue;
    if (!isCommentRead(comment.id, getCommentRevision(comment), readState)) {
      count += 1;
    }
  }
  return count;
}

export function markAllForeignCommentsRead(
  comments: DocComment[],
  username: string | null,
  readState: CommentReadState,
): CommentReadState {
  if (!username) return readState;
  const next = { ...readState };
  for (const comment of comments) {
    if (!isForeignComment(comment, username)) continue;
    next[comment.id] = getCommentRevision(comment);
  }
  return next;
}

export function markAllForeignCommentsUnread(
  comments: DocComment[],
  username: string | null,
  readState: CommentReadState,
): CommentReadState {
  if (!username) return readState;
  const next = { ...readState };
  for (const comment of comments) {
    if (!isForeignComment(comment, username)) continue;
    delete next[comment.id];
  }
  return next;
}

export function toggleAllForeignCommentsRead(
  comments: DocComment[],
  username: string | null,
  readState: CommentReadState,
): CommentReadState {
  if (countUnreadForeignComments(comments, username, readState) > 0) {
    return markAllForeignCommentsRead(comments, username, readState);
  }
  return markAllForeignCommentsUnread(comments, username, readState);
}

export function mergeCommentReadStates(
  ...states: CommentReadState[]
): CommentReadState {
  const merged: CommentReadState = {};
  for (const state of states) {
    for (const [commentId, revision] of Object.entries(state)) {
      merged[commentId] = Math.max(merged[commentId] ?? -1, revision);
    }
  }
  return merged;
}

export function pruneCommentReadState(
  readState: CommentReadState,
  removedCommentIds: Iterable<string>,
): CommentReadState {
  let changed = false;
  const next = { ...readState };
  for (const commentId of removedCommentIds) {
    if (commentId in next) {
      delete next[commentId];
      changed = true;
    }
  }
  return changed ? next : readState;
}

export function commentReadStateStorageKey(projectKey: string, username: string): string {
  return `doc-viewer-comment-reads-${projectKey}-${username}`;
}
