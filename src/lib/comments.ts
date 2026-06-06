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

    if (!id || !author) continue;

    const authorId =
      typeof record.authorId === 'string' && record.authorId.trim()
        ? record.authorId.trim()
        : undefined;

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
      ...(anchor ? { anchor } : {}),
    });
  }

  return comments;
}

export function getComments(relations: RelationsFile): DocComment[] {
  return relations.comments ?? [];
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
  if (authorId && comment.authorId) {
    return comment.authorId === authorId;
  }
  if (!username) return false;
  return comment.author.trim().toLowerCase() === username.trim().toLowerCase();
}

export function buildCommentTree(comments: DocComment[]): CommentTreeNode[] {
  const byParent = new Map<string | null, DocComment[]>();
  for (const comment of comments) {
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
  return [
    ...comments,
    {
      id: createCommentId(),
      parentId: null,
      author: author.trim(),
      authorId,
      body: trimmed,
      createdAt: Date.now(),
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
  return [
    ...comments,
    {
      id: createCommentId(),
      parentId,
      author: author.trim(),
      authorId,
      body: trimmed,
      createdAt: Date.now(),
    },
  ];
}

export function setCommentAnchor(
  comments: DocComment[],
  commentId: string,
  anchor: CommentAnchor,
): DocComment[] {
  return comments.map((comment) => {
    if (comment.id !== commentId) return comment;
    return { ...comment, anchor };
  });
}

export function clearCommentAnchor(
  comments: DocComment[],
  commentId: string,
): DocComment[] {
  return comments.map((comment) => {
    if (comment.id !== commentId) return comment;
    const { anchor: _removed, ...rest } = comment;
    return rest;
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
    return { ...comment, body: trimmed };
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

  return comments.filter((comment) => !doomed.has(comment.id));
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
  for (const comment of comments) {
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
