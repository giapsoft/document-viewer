import { formatPageName } from '../lib/formatPageName';

interface SidebarProps {
  expanded: boolean;
  pages: string[];
  currentPage: string | null;
  onSelectPage: (pageFile: string) => void;
  onToggle: () => void;
}

export function Sidebar({
  expanded,
  pages,
  currentPage,
  onSelectPage,
  onToggle,
}: SidebarProps) {
  if (!expanded) {
    return null;
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Pages</h2>
        <button type="button" className="sidebar-collapse-btn" onClick={onToggle}>
          Collapse
        </button>
      </div>
      <ul className="page-list">
        {pages.map((file) => (
          <li key={file}>
            <button
              type="button"
              className={`page-list-item ${currentPage === file ? 'active' : ''}`}
              onClick={() => onSelectPage(file)}
            >
              {formatPageName(file)}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
