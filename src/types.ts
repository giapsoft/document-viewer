export type ComponentType = 'header' | 'title' | 'body' | 'listItem' | 'img' | 'md' | 'action';
export type ComponentStatus = 'pending' | 'working' | 'done' | 'blocked' | 'undefined';

export interface Component {
  id: string;
  type: ComponentType;
  status: ComponentStatus;
  content: string;
  /** Monotonic edit counter; missing in files means 0 */
  version?: number;
}

export type CommentAnchor =
  | { kind: 'component'; componentId: string }
  | {
      kind: 'md-range';
      componentId: string;
      start: number;
      end: number;
      excerpt: string;
      /** Visible text spans when selection crosses formats or lines (source offsets). */
      segments?: Array<{ start: number; end: number }>;
    };

export interface DocComment {
  id: string;
  parentId: string | null;
  author: string;
  /** Legacy browser-local id — not used for edit/delete permission (username only) */
  authorId?: string;
  body: string;
  createdAt: number;
  /** Last time body or anchor changed — used for multi-session merge conflict resolution */
  updatedAt?: number;
  /** Set when deleted locally — tombstone kept until save so sync does not restore the comment */
  deletedAt?: number;
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
  borderColor: string;
}

export interface AppStyles {
  statuses: Record<ComponentStatus, StatusStyle>;
  type: Record<Exclude<ComponentType, 'img' | 'md' | 'action'>, TypeStyle>;
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
  /** Persisted link groups only (saved to groups.json). */
  groups: string[][];
  componentToGroups: Map<string, number[]>;
  /** Persisted + md virtual groups for UI highlighting only. */
  displayGroups: string[][];
  /** Indices `< persistedGroupCount` are persisted; the rest are md virtual. */
  persistedGroupCount: number;
  componentToDisplayGroups: Map<string, number[]>;
}

export type ProjectSource = 'local' | 'remote';

/** Tracks last-saved remote file hashes to skip unchanged uploads. */
export interface RemoteSyncState {
  fileHashes: Map<string, string>;
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
  /** Built-in help doc-tree loaded from public/help (not persisted). */
  bundledHelp?: boolean;
  /** Opened from an encrypted export; saves re-encrypt with session password. */
  passwordProtected?: boolean;
  /** When false, hidden from the welcome screen list (remote documents only). */
  remotePublished?: boolean;
}

export interface PanelState {
  pageFile: string;
  expanded: boolean;
  /** Custom width in px when set by the user (drag resize). */
  widthPx?: number;
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
  /** Maximum page panels open at once (user preference). */
  maxOpenPages: number;
  panels: PanelState[];
  currentPage: string | null;
  selection: SelectionState | null;
  linkMode: boolean;
  /** Which relations.groups entry is being edited in link mode */
  linkTargetGroupIndex: number | null;
  /** Component whose containing lists are used for link list navigation */
  linkFocusComponentId: string | null;
  /** Preview groups while holding Ctrl in link mode (not persisted until commit). */
  linkPreviewGroups: string[][] | null;
  /** True while Control is held during component link mode. */
  linkCtrlActive: boolean;
  selectionHistory: SelectionHistoryEntry[];
  selectionHistoryIndex: number;
  scrollToComponent: {
    componentId: string;
    nonce: number;
    coldOpen?: boolean;
    immediate?: boolean;
    smooth?: boolean;
  } | null;
  /** Temporary highlight after md component-link navigation (does not affect selection). */
  flashedComponent: { componentId: string; nonce: number } | null;
  /** Bumped when selection/group changes — each panel scrolls to first related component */
  selectionScrollNonce: number;
  commentPanelExpanded: boolean;
  commentUsername: string | null;
  /** Per-component read version for the active comment username */
  componentReadState: Record<string, number>;
  /** Per-comment read revision (updatedAt) for the active comment username */
  commentReadState: Record<string, number>;
  commentAuthorId: string;
  /** Comment selected in the panel (click to toggle). */
  selectedCommentId: string | null;
  /** Comment emphasized when navigating from a linked component/passage. */
  outstandingCommentId: string | null;
  /** Bumped to scroll the comment panel to outstandingCommentId. */
  commentPanelScrollNonce: number;
  /** Preview anchor while holding Ctrl during comment link mode (not persisted until commit). */
  commentLinkPreviewAnchor: CommentAnchor | null;
  /** True while Control is held during comment link mode. */
  commentLinkCtrlActive: boolean;
  /** True while the full-screen content editor dialog is open. */
  contentEditorOpen: boolean;
  /** Transient workspace toast (e.g. link validation). */
  appToast: { message: string; id: number } | null;
}

export interface SelectionHistoryEntry {
  componentId: string;
  pageFile: string;
}

export type AppAction =
  | { type: 'SET_PROJECT'; project: LoadedProject }
  | { type: 'CLOSE_PROJECT' }
  | { type: 'RELOAD_PROJECT'; project: LoadedProject }
  | { type: 'PATCH_PROJECT'; project: LoadedProject }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'EXPAND_SIDEBAR' }
  | { type: 'OPEN_PAGE'; pageFile: string }
  | {
      type: 'SELECT_COMPONENT';
      componentId: string;
      pageFile: string;
      scrollIntoView?: boolean;
    }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_MAX_OPEN_PAGES'; maxOpenPages: number }
  | {
      type: 'RESIZE_PANEL_SPLIT';
      leftPageFile: string;
      rightPageFile: string;
      leftWidthPx: number;
      rightWidthPx: number;
    }
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
  | { type: 'SET_LINK_CTRL_ACTIVE'; active: boolean; preferredGroupIndex?: number | null }
  | { type: 'SET_LINK_TARGET_GROUP_INDEX'; groupIndex: number }
  | { type: 'END_LINK_SESSION' }
  | { type: 'DELETE_ACTIVE_GROUP' }
  | { type: 'REMOVE_COMPONENT_FROM_GROUP'; componentId: string; groupIndex: number }
  | { type: 'TOGGLE_LINK_COMPONENT'; componentId: string; pageFile: string }
  | { type: 'GO_BACK_SELECTION' }
  | { type: 'GO_NEXT_SELECTION' }
  | { type: 'ADD_IMAGE'; filename: string; objectUrl: string; blob: Blob }
  | { type: 'DELETE_IMAGE'; filename: string }
  | { type: 'HYDRATE_IMAGE'; filename: string; objectUrl: string; blob: Blob }
  | {
      type: 'HYDRATE_MD';
      componentId: string;
      content: string;
      storagePath?: string;
      fileHash?: string;
    }
  | { type: 'RECONCILE_MD_WARNINGS' }
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
  | { type: 'DELETE_COMPONENT'; pageFile: string; componentId: string }
  | { type: 'TOGGLE_COMMENT_PANEL' }
  | { type: 'SET_COMMENT_USERNAME'; username: string }
  | { type: 'FOCUS_UNREAD_COMPONENT'; componentId: string; pageFile: string }
  | { type: 'SET_COMPONENT_READ_STATE'; readState: Record<string, number> }
  | { type: 'SET_COMMENT_READ_STATE'; readState: Record<string, number> }
  | { type: 'TOGGLE_COMPONENT_READ'; componentId: string }
  | { type: 'TOGGLE_COMMENT_READ'; commentId: string }
  | { type: 'SELECT_COMMENT'; commentId: string }
  | { type: 'SET_COMMENT_LINK_PREVIEW'; anchor: CommentAnchor | null }
  | { type: 'SET_COMMENT_LINK_CTRL_ACTIVE'; active: boolean }
  | { type: 'END_COMMENT_LINK_SESSION' }
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
  | { type: 'FOCUS_COMMENT'; commentId: string | null }
  | { type: 'JUMP_TO_COMPONENT'; componentId: string; anchorPageFile?: string | null }
  | { type: 'CLEAR_FLASHED_COMPONENT' }
  | { type: 'OUTSTANDING_COMMENT'; commentId: string | null }
  | { type: 'SET_CONTENT_EDITOR_OPEN'; open: boolean }
  | { type: 'CLEAR_APP_TOAST'; id?: number }
  | {
      type: 'RESTORE_WORKSPACE_FROM_URL';
      pageFiles: string[];
      primaryComponentId: string | null;
    };

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: 'read' | 'readwrite';
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

export {};
