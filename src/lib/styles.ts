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
    borderWidth: '2px',
    borderStyle: 'solid',
  },
  linkedScrollMarker: {
    backgroundColor: '#0D6EFD',
    width: '4px',
  },
};

export function mergeStyles(partial?: Partial<AppStyles> | null): AppStyles {
  if (!partial) return DEFAULT_STYLES;

  return {
    statuses: { ...DEFAULT_STYLES.statuses, ...partial.statuses },
    type: { ...DEFAULT_STYLES.type, ...partial.type },
    selectedComponent: {
      ...DEFAULT_STYLES.selectedComponent,
      ...partial.selectedComponent,
    },
    linkedScrollMarker: {
      ...DEFAULT_STYLES.linkedScrollMarker,
      ...partial.linkedScrollMarker,
    },
  };
}
