import type { CommentAnchor, DocComment, RelationsFile } from '../types';

export interface CommentTreeNode {
  comment: DocComment;
  replies: CommentTreeNode[];
}

export function normalizeComments(raw: unknown): DocComment[] {
  if (!Array.isArray(raw)) return [];

  const comments: DocComment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const author = typeof record.author === 'string' ? record.author.trim() : '';
    const body = typeof record.body === 'string' ? record.body : '';
    const parentId =
      record.parentId === null || record.parentId === undefined
        ? null
        : typeof record.parentId === 'string'
          ? record.parentId.trim() || null
          : null;
    const createdAt =
      typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
        ? record.createdAt
        : Date.now();
    // Fall back to createdAt so old comments without updatedAt still compare correctly
    const updatedAt =
      typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
        ? record.updatedAt
        : createdAt;
    const deletedAt =
      typeof record.deletedAt === 'number' && Number.isFinite(record.deletedAt)
        ? record.deletedAt
        : undefined;

    if (!id || !author) continue;

    const authorId =
      typeof record.authorId === 'string' && record.authorId.trim()
        ? record.authorId.trim()
        : undefined;

    if (deletedAt !== undefined) {
      comments.push({
        id,
        parentId,
        author,
        ...(authorId ? { authorId } : {}),
        body,
        createdAt,
        updatedAt,
        deletedAt,
      });
      continue;
    }

    let anchor: CommentAnchor | undefined;
    const rawAnchor = record.anchor;
    if (rawAnchor && typeof rawAnchor === 'object') {
      const a = rawAnchor as Record<string, unknown>;
      const componentId =
        typeof a.componentId === 'string' ? a.componentId.trim() : '';

      if (componentId && a.kind === 'component') {
        anchor = { kind: 'component', componentId };
      } else if (componentId && a.kind === 'md-range') {
        const start = typeof a.start === 'number' ? a.start : -1;
        const end = typeof a.end === 'number' ? a.end : -1;
        const excerpt = typeof a.excerpt === 'string' ? a.excerpt : '';
        if (start >= 0 && end > start) {
          anchor = { kind: 'md-range', componentId, start, end, excerpt };
        }
      }
    }

    comments.push({
      id,
      parentId,
      author,
      ...(authorId ? { authorId } : {}),
      body,
      createdAt,
      updatedAt,
      ...(anchor ? { anchor } : {}),
    });
  }

  return comments;
}

export function isDeletedComment(comment: DocComment): boolean {
  return typeof comment.deletedAt === 'number' && Number.isFinite(comment.deletedAt);
}

export function activeComments(comments: DocComment[]): DocComment[] {
  return comments.filter((comment) => !isDeletedComment(comment));
}

/** Comments written to disk / remote storage (includes tombstones for multi-session delete sync). */
export function commentsForPersistence(comments: DocComment[]): DocComment[] {
  return comments;
}

export function stripCommentTombstones<T extends { relations: RelationsFile }>(project: T): T {
  const comments = project.relations.comments;
  if (!comments?.some(isDeletedComment)) return project;
  return {
    ...project,
    relations: {
      ...project.relations,
      comments: activeComments(comments),
    },
  };
}

export function getComments(relations: RelationsFile): DocComment[] {
  return activeComments(relations.comments ?? []);
}

function commentTimestamp(comment: DocComment): number {
  return comment.deletedAt ?? comment.updatedAt ?? comment.createdAt;
}

export function createCommentId(): string {
  return `cmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isRootComment(comment: DocComment): boolean {
  return comment.parentId === null;
}

export function canOwnComment(
  comment: DocComment,
  authorId: string | null,
  username: string | null,
): boolean {
  if (authorId && comment.authorId && comment.authorId === authorId) {
    return true;
  }
  if (!username) return false;
  return comment.author.trim().toLowerCase() === username.trim().toLowerCase();
}

/**
 * Merge server and local comment lists for multi-session sync.
 *
 * Rules:
 * - Comments only on server (from another session) are kept unless tombstoned.
 * - Comments only on local are kept when they look newly created (timestamp
 *   after the newest server change); otherwise treat as deleted on server.
 * - For the same id: pick whichever has the higher timestamp (updatedAt,
 *   deletedAt, or createdAt). Tombstones win over older active copies.
 */
export function mergeCommentsFromServer(
  server: DocComment[],
  local: DocComment[],
): DocComment[] {
  const localById = new Map<string, DocComment>();
  for (const comment of local) {
    localById.set(comment.id, comment);
  }

  const serverIds = new Set(server.map((comment) => comment.id));
  const newestServerTs = server.reduce(
    (max, comment) => Math.max(max, commentTimestamp(comment)),
    0,
  );

  const byId = new Map<string, DocComment>();

  for (const serverComment of server) {
    const localComment = localById.get(serverComment.id);
    if (!localComment) {
      if (!isDeletedComment(serverComment)) {
        byId.set(serverComment.id, serverComment);
      }
      continue;
    }
    const serverTs = commentTimestamp(serverComment);
    const localTs = commentTimestamp(localComment);
    const winner = localTs > serverTs ? localComment : serverComment;
    if (!isDeletedComment(winner)) {
      byId.set(serverComment.id, winner);
    }
  }

  for (const localComment of local) {
    if (byId.has(localComment.id) || isDeletedComment(localComment)) continue;
    if (!serverIds.has(localComment.id)) {
      const localTs = commentTimestamp(localComment);
      if (localTs > newestServerTs) {
        byId.set(localComment.id, localComment);
      }
    }
  }

  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}

export function commentsEqual(a: DocComment[], b: DocComment[]): boolean {
  const activeA = activeComments(a);
  const activeB = activeComments(b);
  if (activeA.length !== activeB.length) return false;
  const bById = new Map(activeB.map((comment) => [comment.id, comment]));
  return activeA.every((comment) => {
    const other = bById.get(comment.id);
    if (!other) return false;
    return (
      comment.body === other.body &&
      comment.parentId === other.parentId &&
      comment.author === other.author &&
      comment.authorId === other.authorId &&
      comment.createdAt === other.createdAt &&
      (comment.updatedAt ?? comment.createdAt) === (other.updatedAt ?? other.createdAt) &&
      comment.deletedAt === other.deletedAt &&
      JSON.stringify(comment.anchor ?? null) === JSON.stringify(other.anchor ?? null)
    );
  });
}

export function buildCommentTree(comments: DocComment[]): CommentTreeNode[] {
  const byParent = new Map<string | null, DocComment[]>();
  for (const comment of activeComments(comments)) {
    const key = comment.parentId;
    const list = byParent.get(key) ?? [];
    list.push(comment);
    byParent.set(key, list);
  }

  const sortByTime = (list: DocComment[]) =>
    [...list].sort((a, b) => a.createdAt - b.createdAt);

  const build = (parentId: string | null): CommentTreeNode[] =>
    sortByTime(byParent.get(parentId) ?? []).map((comment) => ({
      comment,
      replies: build(comment.id),
    }));

  return build(null);
}

export function addRootComment(
  comments: DocComment[],
  author: string,
  authorId: string,
  body: string,
): DocComment[] {
  const trimmed = body.trim();
  if (!trimmed) return comments;
  const now = Date.now();
  return [
    ...comments,
    {
      id: createCommentId(),
      parentId: null,
      author: author.trim(),
      authorId,
      body: trimmed,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function addReplyComment(
  comments: DocComment[],
  parentId: string,
  author: string,
  authorId: string,
  body: string,
): DocComment[] {
  const trimmed = body.trim();
  if (!trimmed) return comments;
  if (!comments.some((c) => c.id === parentId)) return comments;
  const now = Date.now();
  return [
    ...comments,
    {
      id: createCommentId(),
      parentId,
      author: author.trim(),
      authorId,
      body: trimmed,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function setCommentAnchor(
  comments: DocComment[],
  commentId: string,
  anchor: CommentAnchor,
  authorId: string | null,
  username: string | null,
): DocComment[] {
  return comments.map((comment) => {
    if (comment.id !== commentId) return comment;
    if (!canOwnComment(comment, authorId, username)) return comment;
    return { ...comment, anchor, updatedAt: Date.now() };
  });
}

export function clearCommentAnchor(
  comments: DocComment[],
  commentId: string,
  authorId: string | null,
  username: string | null,
): DocComment[] {
  return comments.map((comment) => {
    if (comment.id !== commentId) return comment;
    if (!canOwnComment(comment, authorId, username)) return comment;
    const { anchor: _removed, ...rest } = comment;
    return { ...rest, updatedAt: Date.now() };
  });
}

export function updateCommentBody(
  comments: DocComment[],
  commentId: string,
  authorId: string | null,
  username: string | null,
  body: string,
): DocComment[] {
  const trimmed = body.trim();
  if (!trimmed) return comments;

  return comments.map((comment) => {
    if (comment.id !== commentId) return comment;
    if (!canOwnComment(comment, authorId, username)) return comment;
    return { ...comment, body: trimmed, updatedAt: Date.now() };
  });
}

export function deleteCommentSubtree(
  comments: DocComment[],
  commentId: string,
  authorId: string | null,
  username: string | null,
): DocComment[] {
  const target = comments.find((comment) => comment.id === commentId);
  if (!target || !canOwnComment(target, authorId, username)) return comments;

  const doomed = new Set<string>();
  const markDoomed = (id: string) => {
    doomed.add(id);
    for (const comment of comments) {
      if (comment.parentId === id) markDoomed(comment.id);
    }
  };
  markDoomed(commentId);

  const now = Date.now();
  return comments.map((comment) => {
    if (!doomed.has(comment.id)) return comment;
    return { ...comment, deletedAt: now, updatedAt: now };
  });
}

export function removeCommentsForComponent(
  comments: DocComment[],
  componentId: string,
): DocComment[] {
  const doomed = new Set<string>();
  const markDoomed = (id: string) => {
    doomed.add(id);
    for (const c of comments) {
      if (c.parentId === id) markDoomed(c.id);
    }
  };

  for (const comment of comments) {
    if (comment.anchor?.componentId === componentId) markDoomed(comment.id);
  }

  return comments.filter((c) => !doomed.has(c.id));
}

export function renameCommentAnchors(
  comments: DocComment[],
  oldId: string,
  newId: string,
): DocComment[] {
  if (oldId === newId) return comments;
  return comments.map((comment) => {
    if (!comment.anchor || comment.anchor.componentId !== oldId) return comment;
    return {
      ...comment,
      anchor: { ...comment.anchor, componentId: newId },
    };
  });
}

export function getAnchorsByComponent(
  comments: DocComment[],
): Map<string, CommentAnchor[]> {
  const map = new Map<string, CommentAnchor[]>();
  for (const comment of activeComments(comments)) {
    if (!comment.anchor) continue;
    const list = map.get(comment.anchor.componentId) ?? [];
    list.push(comment.anchor);
    map.set(comment.anchor.componentId, list);
  }
  return map;
}

export function formatCommentAnchorLabel(
  anchor: CommentAnchor,
  componentLabel?: string,
): string {
  const label = componentLabel ?? anchor.componentId;
  if (anchor.kind === 'component') return label;
  const snippet =
    anchor.excerpt.length > 48 ? `${anchor.excerpt.slice(0, 48)}…` : anchor.excerpt;
  return `${label}: "${snippet}"`;
}
