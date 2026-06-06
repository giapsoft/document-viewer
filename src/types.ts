export type ComponentType = 'header' | 'title' | 'body' | 'listItem' | 'img' | 'md';
export type ComponentStatus = 'pending' | 'working' | 'done' | 'blocked' | 'undefined';

export interface Component {
  id: string;
  type: ComponentType;
  status: ComponentStatus;
  content: string;
}

export type CommentAnchor =
  | { kind: 'component'; componentId: string }
  | {
      kind: 'md-range';
      componentId: string;
      start: number;
      end: number;
      excerpt: string;
    };

export interface DocComment {
  id: string;
  parentId: string | null;
  author: string;
  /** Browser-local id of the author — used to allow edit/delete on this device */
  authorId?: string;
  body: string;
  createdAt: number;
  /** Optional link to a component or md passage */
  anchor?: CommentAnchor;
}

export interface RelationsFile {
  /** Optional display names: page file (e.g. intro.p) → pageName shown in UI */
  pageNames?: Record<string, string>;
  /** Page files always shown as secondary panels when not the main page */
  pinnedPages?: string[];
  /** Sidebar / panel display order (page file names) */
  pageOrder?: string[];
  groups: string[][];
  comments?: DocComment[];
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
  type: Record<Exclude<ComponentType, 'img' | 'md'>, TypeStyle>;
  /** Primary clicked / focused component in a selection. */
  selectedComponent: SelectedComponentStyle;
  /** Other components in the same active relation group. */
  linkedComponent: SelectedComponentStyle;
  linkedScrollMarker: ScrollMarkerStyle;
}

export interface ResolvedComponent {
  id: string;
  type: ComponentType;
  status: ComponentStatus;
  content: string;
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

export type ProjectSource = 'local' | 'remote';

/** Tracks last saved remote payload to skip unchanged uploads. */
export interface RemoteSyncState {
  format: 'files' | 'bundle' | 'legacy';
  bundleHash?: string | null;
  fileHashes?: Map<string, string>;
}

export interface LoadedProject {
  pages: PageData[];
  relations: RelationsFile;
  styles: AppStyles;
  imageUrls: Map<string, string>;
  /** Image bytes keyed by filename in docs/ (persisted on Save). */
  imageBlobs: Map<string, Blob>;
  /** Markdown body keyed by global id (sidecar `{globalId}.md` files). */
  mdFiles: Map<string, string>;
  index: ProjectIndex;
  warnings: string[];
  source: ProjectSource;
  remoteDocId?: string | null;
  remoteTitle?: string | null;
  /** Set when opened from a local folder (reload from disk). */
  folderHandle?: FileSystemDirectoryHandle | null;
  /** Populated after remote load/save for incremental sync. */
  remoteSync?: RemoteSyncState | null;
  /** Server `documents.updated_at` when this copy was loaded or last saved. */
  remoteUpdatedAt?: string | null;
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
  commentPanelExpanded: boolean;
  commentUsername: string | null;
  commentAuthorId: string;
  /** Comment selected for anchor linking */
  commentLinkTargetId: string | null;
  focusedCommentId: string | null;
}

export interface SelectionHistoryEntry {
  componentId: string;
  pageFile: string;
}

export type AppAction =
  | { type: 'SET_PROJECT'; project: LoadedProject }
  | { type: 'CLOSE_PROJECT' }
  | { type: 'RELOAD_PROJECT'; project: LoadedProject }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'EXPAND_SIDEBAR' }
  | { type: 'OPEN_PAGE'; pageFile: string }
  | { type: 'SELECT_COMPONENT'; componentId: string; pageFile: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'TOGGLE_PANEL'; pageFile: string }
  | { type: 'REORDER_PANELS'; orderedPageFiles: string[] }
  | { type: 'REORDER_PAGES'; orderedPageFiles: string[] }
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
  | { type: 'SET_LINK_MODE'; enabled: boolean }
  | { type: 'DELETE_ACTIVE_GROUP' }
  | { type: 'TOGGLE_LINK_COMPONENT'; componentId: string; pageFile: string }
  | { type: 'GO_BACK_SELECTION' }
  | { type: 'GO_NEXT_SELECTION' }
  | { type: 'ADD_IMAGE'; filename: string; objectUrl: string; blob: Blob }
  | {
      type: 'APPEND_IMAGE_COMPONENT';
      pageFile: string;
      filename: string;
      objectUrl: string;
      blob: Blob;
    }
  | { type: 'UPDATE_MD_CONTENT'; componentId: string; content: string }
  | { type: 'CREATE_PAGE'; fileName: string; pageName?: string }
  | { type: 'RENAME_PAGE'; fileName: string; newPageName: string }
  | { type: 'DELETE_PAGE'; fileName: string }
  | { type: 'TOGGLE_PIN_PAGE'; pageFile: string }
  | { type: 'CLEAR_ALL_PINS' }
  | { type: 'DELETE_COMPONENT'; pageFile: string; componentId: string }
  | { type: 'TOGGLE_COMMENT_PANEL' }
  | { type: 'SET_COMMENT_USERNAME'; username: string }
  | { type: 'SELECT_COMMENT_LINK_TARGET'; commentId: string | null }
  | { type: 'ADD_ROOT_COMMENT'; body: string }
  | { type: 'ADD_REPLY_COMMENT'; parentId: string; body: string }
  | {
      type: 'SET_COMMENT_ANCHOR';
      commentId: string;
      anchor: CommentAnchor;
    }
  | { type: 'CLEAR_COMMENT_ANCHOR'; commentId: string }
  | { type: 'UPDATE_COMMENT'; commentId: string; body: string }
  | { type: 'DELETE_COMMENT'; commentId: string }
  | { type: 'FOCUS_COMMENT'; commentId: string | null };

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: 'read' | 'readwrite';
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

export {};
