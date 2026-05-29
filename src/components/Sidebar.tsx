import { useState } from 'react';
import { PageFileDialog, ConfirmDialog } from './PageFileDialog';
import { PageLabel } from './PageLabel';

export interface SidebarPageEntry {
  fileName: string;
  pageId: string;
  pageName: string;
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
  onDeletePage: (fileName: string) => Promise<{ ok: boolean; error?: string }>;
  pinnedPages: string[];
  onTogglePinPage: (fileName: string) => void;
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
  onDeletePage,
  pinnedPages,
  onTogglePinPage,
  suggestNewPageFileName,
  normalizePageFileName,
  normalizePageName,
}: SidebarProps) {
  const [dialog, setDialog] = useState<
    | { type: 'create' }
    | { type: 'rename'; page: SidebarPageEntry }
    | { type: 'delete'; page: SidebarPageEntry }
    | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

      {actionError && (
        <p className="sidebar-action-error" role="alert">
          {actionError}
        </p>
      )}

      <ul className="page-list">
        {pages.map((page) => {
          const isActive = currentPage === page.fileName;
          const isPinned = pinnedPages.includes(page.fileName);
          return (
            <li
              key={page.fileName}
              className={`page-list-row ${isActive ? 'page-list-row-active' : ''}`}
            >
              <button
                type="button"
                className={`page-list-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectPage(page.fileName)}
              >
                <PageLabel
                  pageName={page.pageName}
                  pageId={page.pageId}
                  fileName={page.fileName}
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
                  <>
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
                  <button
                    type="button"
                    className="page-list-action-btn page-list-action-danger"
                    title="Delete page"
                    disabled={pages.length <= 1}
                    onClick={() => {
                      setActionError(null);
                      setDialog({ type: 'delete', page });
                    }}
                  >
                    ×
                  </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {canManagePages && (
        <div className="sidebar-footer">
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
        </div>
      )}

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
          onClose={() => setDialog(null)}
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

      {dialog?.type === 'delete' && (
        <ConfirmDialog
          title="Delete page"
          message={`Delete "${dialog.page.fileName}" and remove its components from all groups? This cannot be undone.`}
          confirmLabel="Delete"
          onClose={() => setDialog(null)}
          onConfirm={() => {
            void runAction(() => onDeletePage(dialog.page.fileName));
          }}
        />
      )}
    </aside>
  );
}
