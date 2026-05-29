export type ComponentType = 'header' | 'title' | 'body' | 'listItem' | 'img' | 'md' | 'ref';
export type ComponentStatus = 'pending' | 'working' | 'done' | 'blocked' | 'undefined';

export interface Component {
  id: string;
  type: ComponentType;
  status: ComponentStatus;
  content: string;
}

export interface RelationsFile {
  /** Optional display names: page file (e.g. intro.p) → pageName shown in UI */
  pageNames?: Record<string, string>;
  groups: string[][];
}

export interface TypeStyle {
  fontSize: string;
  color: string;
}

export interface StatusStyle {
  backgroundColor: string;
}

export interface SelectedComponentStyle {
  borderColor: string;
  borderWidth: string;
  borderStyle: string;
}

export interface ScrollMarkerStyle {
  backgroundColor: string;
  width: string;
}

export interface AppStyles {
  statuses: Record<ComponentStatus, StatusStyle>;
  type: Record<Exclude<ComponentType, 'img' | 'md' | 'ref'>, TypeStyle>;
  selectedComponent: SelectedComponentStyle;
  linkedScrollMarker: ScrollMarkerStyle;
}

export interface ResolvedComponent {
  id: string;
  type: ComponentType;
  status: ComponentStatus;
  content: string;
  refError?: string;
}

export interface PageData {
  fileName: string;
  /** Fixed: file stem without .p — prefix of global ids on this page */
  pageId: string;
  /** Display label (relations.pageNames or defaults to pageId) */
  pageName: string;
  components: Component[];
}

export interface ProjectIndex {
  componentToPage: Map<string, string>;
  componentData: Map<string, Component>;
  pageIdByFile: Map<string, string>;
  groups: string[][];
  componentToGroups: Map<string, number[]>;
}

export interface LoadedProject {
  pages: PageData[];
  relations: RelationsFile;
  styles: AppStyles;
  imageUrls: Map<string, string>;
  /** Markdown body keyed by global id (sidecar `{globalId}.md` files). */
  mdFiles: Map<string, string>;
  index: ProjectIndex;
  warnings: string[];
  /** Set when opened from a local folder; enables auto-save. */
  folderHandle?: FileSystemDirectoryHandle | null;
}

export interface PanelState {
  pageFile: string;
  expanded: boolean;
}

export interface SelectionState {
  componentId: string;
  relatedIds: Set<string>;
  /** Active group index in relations.groups */
  activeGroupIndex: number | null;
  /** Group indices that contain the selected component */
  matchingGroupIndices: number[];
}

export interface AppState {
  project: LoadedProject | null;
  sidebarExpanded: boolean;
  panels: PanelState[];
  currentPage: string | null;
  selection: SelectionState | null;
  linkMode: boolean;
  /** Which relations.groups entry is being edited in link mode */
  linkTargetGroupIndex: number | null;
  /** Component whose containing lists are used for link list navigation */
  linkFocusComponentId: string | null;
  selectionHistory: SelectionHistoryEntry[];
  selectionHistoryIndex: number;
  scrollToComponent: { componentId: string; nonce: number } | null;
  /** Bumped when selection/group changes — each panel scrolls to first related component */
  selectionScrollNonce: number;
}

export interface SelectionHistoryEntry {
  componentId: string;
  pageFile: string;
}

export type AppAction =
  | { type: 'SET_PROJECT'; project: LoadedProject }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'EXPAND_SIDEBAR' }
  | { type: 'OPEN_PAGE'; pageFile: string }
  | { type: 'SELECT_COMPONENT'; componentId: string; pageFile: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'TOGGLE_PANEL'; pageFile: string }
  | { type: 'REORDER_PANELS'; orderedPageFiles: string[] }
  | {
      type: 'UPDATE_COMPONENT';
      pageFile: string;
      componentId: string;
      patch: Partial<Component>;
    }
  | {
      type: 'INSERT_COMPONENT';
      pageFile: string;
      anchorComponentId: string;
      position: 'above' | 'below';
    }
  | { type: 'TOGGLE_LINK_MODE' }
  | { type: 'TOGGLE_LINK_COMPONENT'; componentId: string; pageFile: string }
  | { type: 'GO_PREV_GROUP' }
  | { type: 'GO_NEXT_GROUP' }
  | { type: 'GO_PREV_LINK_GROUP' }
  | { type: 'GO_NEXT_LINK_GROUP' }
  | { type: 'GO_BACK_SELECTION' }
  | { type: 'GO_NEXT_SELECTION' }
  | { type: 'ADD_IMAGE'; filename: string; objectUrl: string }
  | { type: 'UPDATE_MD_CONTENT'; componentId: string; content: string }
  | { type: 'CREATE_PAGE'; fileName: string }
  | { type: 'RENAME_PAGE'; fileName: string; newPageName: string }
  | { type: 'DELETE_PAGE'; fileName: string }
  | { type: 'DELETE_COMPONENT'; pageFile: string; componentId: string };

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: 'read' | 'readwrite';
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

export {};
