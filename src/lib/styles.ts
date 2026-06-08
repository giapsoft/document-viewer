import type { CSSProperties } from 'react';
import type { AppStyles, ScrollMarkerStyle } from '../types';

export const DEFAULT_STYLES: AppStyles = {
  statuses: {
    pending: { backgroundColor: '#FFF3CD' },
    working: { backgroundColor: '#CCE5FF' },
    done: { backgroundColor: '#D4EDDA' },
    blocked: { backgroundColor: '#F8D7DA' },
    undefined: { backgroundColor: '#E9ECEF' },
  },
  type: {
    header: { fontSize: '24px', color: '#212529' },
    title: { fontSize: '20px', color: '#343A40' },
    body: { fontSize: '16px', color: '#495057' },
    listItem: { fontSize: '16px', color: '#495057' },
  },
  selectedComponent: {
    borderColor: '#0D6EFD',
    borderWidth: '3px',
    borderStyle: 'solid',
  },
  linkedComponent: {
    borderColor: '#0D6EFD',
    borderWidth: '2px',
    borderStyle: 'dashed',
  },
  linkedScrollMarker: {
    backgroundColor: 'rgb(153 194 255 / 20%)',
    borderColor: '#0D6EFD',
  },
};

/** Transitive linked components (related via algorithm, not in main group). */
export const TRANSITIVE_LINKED_COMPONENT = {
  borderColor: '#E8590C',
  borderWidth: '2px',
  borderStyle: 'dashed',
} as const;

export const TRANSITIVE_LINKED_SCROLL_MARKER = {
  backgroundColor: 'rgb(255 192 120 / 20%)',
  borderColor: '#E8590C',
} as const;

function normalizeLinkedScrollMarker(
  partial?: Partial<ScrollMarkerStyle> & { width?: string },
): ScrollMarkerStyle {
  const base = DEFAULT_STYLES.linkedScrollMarker;
  if (!partial) return base;

  const bg = partial.backgroundColor?.trim().toLowerCase();
  const legacySolidFill =
    bg === '#0d6efd' ||
    bg === '#228be6' ||
    bg === '#1c7ed6' ||
    bg === '#a5d8ff' ||
    bg === 'rgb(153, 194, 255)' ||
    bg === 'rgb(153,194,255)';

  return {
    backgroundColor: legacySolidFill
      ? base.backgroundColor
      : (partial.backgroundColor ?? base.backgroundColor),
    borderColor: partial.borderColor ?? base.borderColor,
  };
}

/** Shared blue theme for component ↔ component relation linking. */
export const COMPONENT_LINK_THEME = {
  borderColor: '#0D6EFD',
  borderWidth: '3px',
  borderStyle: 'solid',
  glow: '0 0 0 2px rgba(13, 110, 253, 0.35), 0 0 12px rgba(13, 110, 253, 0.25)',
  hintText: '#084298',
} as const;

/** Component border while held in component link mode (Ctrl). */
export const LINK_MODE_HIGHLIGHT = {
  borderColor: COMPONENT_LINK_THEME.borderColor,
  borderWidth: COMPONENT_LINK_THEME.borderWidth,
  borderStyle: COMPONENT_LINK_THEME.borderStyle,
} as const;

/** Shared orange theme for comment ↔ component linking. */
export const COMMENT_LINK_THEME = {
  borderColor: '#E8590C',
  borderWidth: '3px',
  borderStyle: 'solid',
  mdFill: '#FFC078',
  mdFillCode: 'rgba(255, 192, 120, 0.55)',
  componentInset: 'rgba(232, 89, 12, 0.5)',
  pillBg: '#FFF4E6',
  pillBorder: '#FFA94D',
  pillText: '#9C3600',
  badgeBg: '#E8590C',
  hintText: '#9C3600',
  glow: '0 0 0 2px rgba(232, 89, 12, 0.45), 0 0 12px rgba(253, 126, 20, 0.3)',
} as const;

/** Component border while comment link target is previewed. */
export const COMMENT_LINK_PREVIEW_HIGHLIGHT = {
  borderColor: COMMENT_LINK_THEME.borderColor,
  borderWidth: COMMENT_LINK_THEME.borderWidth,
  borderStyle: COMMENT_LINK_THEME.borderStyle,
} as const;

export function getCommentCardSelectionStyle(
  _linkPreviewActive: boolean,
  _styles: AppStyles,
): CSSProperties {
  const t = COMMENT_LINK_THEME;
  return {
    borderColor: t.borderColor,
    borderWidth: t.borderWidth,
    borderStyle: t.borderStyle,
    boxShadow: t.glow,
    backgroundColor: '#fff',
  };
}

export function mergeStyles(partial?: Partial<AppStyles> | null): AppStyles {
  if (!partial) return DEFAULT_STYLES;

  return {
    statuses: { ...DEFAULT_STYLES.statuses, ...partial.statuses },
    type: { ...DEFAULT_STYLES.type, ...partial.type },
    selectedComponent: {
      ...DEFAULT_STYLES.selectedComponent,
      ...partial.selectedComponent,
    },
    linkedComponent: {
      ...DEFAULT_STYLES.linkedComponent,
      ...partial.linkedComponent,
    },
    linkedScrollMarker: normalizeLinkedScrollMarker(partial.linkedScrollMarker),
  };
}
