export type ComponentType = 'header' | 'title' | 'body' | 'listItem' | 'img' | 'ref';
export type ComponentStatus = 'pending' | 'working' | 'done' | 'blocked' | 'undefined';

export interface Component {
  id: string;
  type: ComponentType;
  status: ComponentStatus;
  content: string;
}

export interface RelationsFile {
  connectors: Record<string, string[]>;
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
  type: Record<Exclude<ComponentType, 'img' | 'ref'>, TypeStyle>;
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
  components: Component[];
}

export interface ProjectIndex {
  componentToPage: Map<string, string>;
  componentData: Map<string, Component>;
  graph: Map<string, Set<string>>;
  connectors: Record<string, string[]>;
}

export interface LoadedProject {
  pages: PageData[];
  relations: RelationsFile;
  styles: AppStyles;
  imageUrls: Map<string, string>;
  index: ProjectIndex;
  warnings: string[];
}

export interface PanelState {
  pageFile: string;
  expanded: boolean;
}

export interface SelectionState {
  componentId: string;
  relatedIds: Set<string>;
}

export interface AppState {
  project: LoadedProject | null;
  sidebarExpanded: boolean;
  panels: PanelState[];
  currentPage: string | null;
  selection: SelectionState | null;
  linkMode: boolean;
  linkSelection: string[];
  selectionHistory: SelectionHistoryEntry[];
  selectionHistoryIndex: number;
  scrollToComponent: { componentId: string; nonce: number } | null;
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
  | { type: 'GO_BACK_SELECTION' }
  | { type: 'GO_NEXT_SELECTION' };

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: 'read' | 'readwrite';
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

export {};
