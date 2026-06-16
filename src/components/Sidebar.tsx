import { useState, type DragEvent } from 'react';
import { PageFileDialog } from './PageFileDialog';
import { PageLabel } from './PageLabel';
import { VersionBadge } from './VersionBadge';
import { reorderPageFileList } from '../lib/pageOrder';

import {
  MAX_MAX_OPEN_PAGES,
  MIN_MAX_OPEN_PAGES,
} from '../lib/maxOpenPagesStorage';

export interface SidebarPageEntry {
  fileName: string;
  pageId: string;
  pageName: string;
  componentCount: number;
  unreadCount?: number | null;
}

interface SidebarProps {
  expanded: boolean;
  pages: SidebarPageEntry[];
  panelPageFiles: Set<string>;
  highlightedPageFiles: Set<string>;
  mainGroupPageFiles: Set<string>;
  mainSelectionPageFile: string | null;
  canManagePages: boolean;
  onSelectPage: (pageFile: string) => void;
  onToggle: () => void;
  maxOpenPages: number;
  onMaxOpenPagesChange: (value: number) => void;
  onCreatePage: (fileName: string) => Promise<{ ok: boolean; error?: string }>;
  onRenamePage: (
    fileName: string,
    newPageName: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onReorderPages: (orderedPageFiles: string[]) => void;
  onDeletePage: (fileName: string) => Promise<{ ok: boolean; error?: string }>;
  suggestNewPageName: () => string;
  normalizePageName: (input: string) => string | null;
}

export function Sidebar({
  expanded,
  pages,
  panelPageFiles,
  highlightedPageFiles,
  mainGroupPageFiles,
  mainSelectionPageFile,
  canManagePages,
  onSelectPage,
  onToggle,
  maxOpenPages,
  onMaxOpenPagesChange,
  onCreatePage,
  onRenamePage,
  onReorderPages,
  onDeletePage,
  suggestNewPageName,
  normalizePageName,
}: SidebarProps) {
  const [dialog, setDialog] = useState<
    | { type: 'create' }
    | { type: 'rename'; page: SidebarPageEntry }
    | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  if (!expanded) {
    return null;
  }

  const runAction = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setActionError(null);
    const result = await fn();
    if (!result.ok) {
      setActionError(result.error ?? 'Could not complete the action.');
      return false;
    }
    setDialog(null);
    return true;
  };

  const finishDrag = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, index: number) => {
    if (!canManagePages) return;
    setDragIndex(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', pages[index].fileName);
  };

  const handleDragOver = (event: DragEvent<HTMLLIElement>, index: number) => {
    if (!canManagePages || dragIndex === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropIndex(index);
  };

  const handleDrop = (event: DragEvent<HTMLLIElement>, toIndex: number) => {
    event.preventDefault();
    if (!canManagePages || dragIndex === null || dragIndex === toIndex) {
      finishDrag();
      return;
    }

    const order = pages.map((page) => page.fileName);
    onReorderPages(reorderPageFileList(order, dragIndex, toIndex));
    finishDrag();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Pages</h2>
        <div className="sidebar-header-controls">
          <label className="sidebar-max-pages" title="Maximum pages open at once">
            <span className="sidebar-max-pages-label">Max</span>
            <input
              type="range"
              min={MIN_MAX_OPEN_PAGES}
              max={MAX_MAX_OPEN_PAGES}
              value={maxOpenPages}
              onChange={(event) => onMaxOpenPagesChange(Number(event.target.value))}
              aria-label={`Maximum open pages: ${maxOpenPages}`}
            />
            <span className="sidebar-max-pages-value">{maxOpenPages}</span>
          </label>
          <button type="button" className="sidebar-collapse-btn" onClick={onToggle} title="Collapse sidebar (Ctrl+B)">
            Collapse
          </button>
        </div>
      </div>

      {!canManagePages && (
        <p className="sidebar-hint">Open a local project folder to add, rename, or delete pages.</p>
      )}

      {canManagePages && (
        <p className="sidebar-hint">Drag the handle to reorder pages.</p>
      )}

      <div className="sidebar-status-key" aria-label="Page status legend">
        <div className="sidebar-status-key-row">
          <span className="sidebar-status-key-swatch sidebar-status-key-swatch-panel" aria-hidden />
          <span className="sidebar-status-key-text">In workspace</span>
        </div>
        <div className="sidebar-status-key-row">
          <span
            className="sidebar-status-key-name-demo sidebar-status-key-name-demo-main-group"
            aria-hidden
          >
            Page
          </span>
          <span className="sidebar-status-key-text">Same group</span>
        </div>
        <div className="sidebar-status-key-row">
          <span className="sidebar-status-key-name-demo sidebar-status-key-name-demo-linked" aria-hidden>
            Page
          </span>
          <span className="sidebar-status-key-text">Linked elsewhere</span>
        </div>
        <div className="sidebar-status-key-row">
          <span className="sidebar-status-key-dot-demo" aria-hidden />
          <span className="sidebar-status-key-text">Selected component</span>
        </div>
      </div>

      {actionError && (
        <p className="sidebar-action-error" role="alert">
          {actionError}
        </p>
      )}

      <ul className="page-list">
        {pages.map((page, index) => {
          const inPanel = panelPageFiles.has(page.fileName);
          const inMainGroup = mainGroupPageFiles.has(page.fileName);
          const hasHighlight = highlightedPageFiles.has(page.fileName);
          const nameHighlight = inMainGroup
            ? 'main-group'
            : hasHighlight
              ? 'related'
              : undefined;
          const hasMainSelection = mainSelectionPageFile === page.fileName;
          const isDragging = dragIndex === index;
          const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;

          return (
            <li
              key={page.fileName}
              className={`page-list-row${inPanel ? ' page-list-row-in-panel' : ''}${hasMainSelection ? ' page-list-row-main-selected' : ''} ${isDragging ? 'page-list-row-dragging' : ''} ${isDropTarget ? 'page-list-row-drop-target' : ''}`}
              aria-label={`${page.pageName}: ${inPanel ? 'in panel area' : 'not in panel area'}, ${nameHighlight === 'main-group' ? 'same group as selection' : hasHighlight ? 'linked elsewhere' : 'no link highlight'}, ${hasMainSelection ? 'contains selected component' : 'no selected component'}`}
              onDragOver={(event) => handleDragOver(event, index)}
              onDrop={(event) => handleDrop(event, index)}
              onDragLeave={() => {
                if (dropIndex === index) setDropIndex(null);
              }}
            >
              {canManagePages && (
                <button
                  type="button"
                  className="page-list-drag-handle"
                  draggable
                  title="Drag to reorder"
                  aria-label={`Reorder ${page.pageName}`}
                  onDragStart={(event) => handleDragStart(event, index)}
                  onDragEnd={finishDrag}
                >
                  ⋮⋮
                </button>
              )}
              <button
                type="button"
                className="page-list-item"
                onClick={() => onSelectPage(page.fileName)}
                title={inPanel ? 'Remove from workspace' : 'Add to workspace'}
              >
                <PageLabel
                  pageName={page.pageName}
                  pageId={page.pageId}
                  fileName={page.fileName}
                  componentCount={page.componentCount}
                  unreadCount={page.unreadCount}
                  nameHighlight={nameHighlight}
                />
              </button>
              <div className="page-list-actions">
                {canManagePages && (
                  <button
                    type="button"
                    className="page-list-action-btn"
                    title="Rename page"
                    onClick={() => {
                      setActionError(null);
                      setDialog({ type: 'rename', page });
                    }}
                  >
                    ✎
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="sidebar-footer">
        {canManagePages && (
          <button
            type="button"
            className="sidebar-new-page-btn"
            onClick={() => {
              setActionError(null);
              setDialog({ type: 'create' });
            }}
          >
            + New page
          </button>
        )}
        <VersionBadge className="sidebar-version" />
      </div>

      {dialog?.type === 'create' && (
        <PageFileDialog
          title="New page"
          label="Page name"
          initialValue={suggestNewPageName()}
          hint="Any name is fine. pageId is derived automatically (a-z, 0-9)."
          confirmLabel="Create"
          onClose={() => setDialog(null)}
          onConfirm={(raw) => {
            void runAction(() => onCreatePage(raw));
          }}
        />
      )}

      {dialog?.type === 'rename' && (
        <PageFileDialog
          title="Rename page"
          label="Page name"
          initialValue={dialog.page.pageName}
          hint={`File ${dialog.page.fileName} and pageId "${dialog.page.pageId}" stay unchanged.`}
          confirmLabel="Rename"
          deleteDisabled={pages.length <= 1}
          deleteConfirmMessage={`Delete "${dialog.page.fileName}" and remove its components from all groups? This cannot be undone.`}
          onClose={() => setDialog(null)}
          onDelete={() => {
            void runAction(() => onDeletePage(dialog.page.fileName));
          }}
          onConfirm={(raw) => {
            const pageName = normalizePageName(raw);
            if (!pageName) {
              setActionError('Enter a page name.');
              return;
            }
            if (pageName === dialog.page.pageName) {
              setDialog(null);
              return;
            }
            void runAction(() => onRenamePage(dialog.page.fileName, pageName));
          }}
        />
      )}
    </aside>
  );
}
