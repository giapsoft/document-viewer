import type { AppStyles } from '../types';

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
    backgroundColor: '#0D6EFD',
    width: '4px',
  },
};

/** Fixed highlight for components selected in link mode. */
export const LINK_MODE_HIGHLIGHT = {
  borderColor: '#E8590C',
  borderWidth: '4px',
  borderStyle: 'solid',
} as const;

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
    linkedScrollMarker: {
      ...DEFAULT_STYLES.linkedScrollMarker,
      ...partial.linkedScrollMarker,
    },
  };
}
