import { useState, type DragEvent } from 'react';
import { PageFileDialog } from './PageFileDialog';
import { PageLabel } from './PageLabel';
import { VersionBadge } from './VersionBadge';
import { reorderPageFileList } from '../lib/pageOrder';

export interface SidebarPageEntry {
  fileName: string;
  pageId: string;
  pageName: string;
  componentCount: number;
}

interface SidebarProps {
  expanded: boolean;
  pages: SidebarPageEntry[];
  currentPage: string | null;
  canManagePages: boolean;
  onSelectPage: (pageFile: string) => void;
  onToggle: () => void;
  onCreatePage: (fileName: string) => Promise<{ ok: boolean; error?: string }>;
  onRenamePage: (
    fileName: string,
    newPageName: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onReorderPages: (orderedPageFiles: string[]) => void;
  onDeletePage: (fileName: string) => Promise<{ ok: boolean; error?: string }>;
  pinnedPages: string[];
  onTogglePinPage: (fileName: string) => void;
  onAppendClipboardImage: (fileName: string) => Promise<{ ok: boolean; error?: string }>;
  suggestNewPageFileName: () => string;
  normalizePageFileName: (input: string) => string | null;
  normalizePageName: (input: string) => string | null;
}

export function Sidebar({
  expanded,
  pages,
  currentPage,
  canManagePages,
  onSelectPage,
  onToggle,
  onCreatePage,
  onRenamePage,
  onReorderPages,
  onDeletePage,
  pinnedPages,
  onTogglePinPage,
  onAppendClipboardImage,
  suggestNewPageFileName,
  normalizePageFileName,
  normalizePageName,
}: SidebarProps) {
  const [dialog, setDialog] = useState<
    | { type: 'create' }
    | { type: 'rename'; page: SidebarPageEntry }
    | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [appendingImageFor, setAppendingImageFor] = useState<string | null>(null);
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
        <button type="button" className="sidebar-collapse-btn" onClick={onToggle}>
          Collapse
        </button>
      </div>

      {!canManagePages && (
        <p className="sidebar-hint">Open a local project folder to add, rename, or delete pages.</p>
      )}

      {canManagePages && (
        <p className="sidebar-hint">Drag the handle to reorder pages.</p>
      )}

      {actionError && (
        <p className="sidebar-action-error" role="alert">
          {actionError}
        </p>
      )}

      <ul className="page-list">
        {pages.map((page, index) => {
          const isActive = currentPage === page.fileName;
          const isPinned = pinnedPages.includes(page.fileName);
          const isDragging = dragIndex === index;
          const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;

          return (
            <li
              key={page.fileName}
              className={`page-list-row ${isActive ? 'page-list-row-active' : ''} ${isDragging ? 'page-list-row-dragging' : ''} ${isDropTarget ? 'page-list-row-drop-target' : ''}`}
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
                className={`page-list-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectPage(page.fileName)}
              >
                <PageLabel
                  pageName={page.pageName}
                  pageId={page.pageId}
                  fileName={page.fileName}
                  componentCount={page.componentCount}
                />
              </button>
              <div className="page-list-actions">
                <button
                  type="button"
                  className={`page-list-action-btn page-list-action-pin${isPinned ? ' page-list-action-pin-active' : ''}`}
                  title={
                    isPinned
                      ? 'Unpin — hide from secondary panels when not linked'
                      : 'Pin — always show in secondary panels when not main page'
                  }
                  aria-pressed={isPinned}
                  onClick={() => onTogglePinPage(page.fileName)}
                >
                  📌
                </button>
                {canManagePages && (
                  <button
                    type="button"
                    className="page-list-action-btn page-list-action-image"
                    title="Add image from clipboard at end of page"
                    disabled={appendingImageFor === page.fileName}
                    onClick={() => {
                      setActionError(null);
                      setAppendingImageFor(page.fileName);
                      void runAction(() => onAppendClipboardImage(page.fileName)).finally(() => {
                        setAppendingImageFor((current) =>
                          current === page.fileName ? null : current,
                        );
                      });
                    }}
                  >
                    🖼
                  </button>
                )}
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
          label="File name"
          initialValue={suggestNewPageFileName()}
          hint="Creates docs/name.p (creates docs/ if needed). pageId = name without .p. Display name defaults to pageId."
          confirmLabel="Create"
          onClose={() => setDialog(null)}
          onConfirm={(raw) => {
            const fileName = normalizePageFileName(raw);
            if (!fileName) {
              setActionError('Invalid name. Use letters, numbers, dots, hyphens (e.g. my-page.p).');
              return;
            }
            if (pages.some((p) => p.fileName === fileName)) {
              setActionError('A page with that file name already exists.');
              return;
            }
            void runAction(() => onCreatePage(fileName));
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
