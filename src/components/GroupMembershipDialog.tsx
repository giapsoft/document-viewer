import { useEffect, useMemo, type CSSProperties } from 'react';
import type { LoadedProject } from '../types';
import { resolveComponentForDisplay } from '../lib/componentDisplay';
import { parseActionData } from '../lib/actionComponent';
import { getGroupMemberPageFiles } from '../lib/groupRelations';
import { findComponent } from '../lib/projectMutations';
import { resolvePageName } from '../lib/pageIds';
import { ComponentTypeBadge } from './ComponentTypeIcon';

interface GroupMembershipDialogProps {
  project: LoadedProject;
  groups: string[][];
  anchorComponentId: string;
  groupIndices: number[];
  activeGroupIndex?: number | null;
  linkMode?: boolean;
  isVirtualGroup?: (groupIndex: number) => boolean;
  onSelectGroup?: (groupIndex: number) => void;
  onRemoveMember: (groupIndex: number, componentId: string) => void;
  onNavigateToComponent: (componentId: string) => void;
  onClose: () => void;
}

function GroupMemberTile({
  project,
  componentId,
  isAnchor,
  onRemove,
  onNavigate,
}: {
  project: LoadedProject;
  componentId: string;
  isAnchor: boolean;
  onRemove?: () => void;
  onNavigate: () => void;
}) {
  const found = findComponent(project, componentId);
  if (!found) {
    return (
      <div className="group-member-tile group-member-tile-missing">
        <div className="group-member-tile-body group-member-tile-body-static">
          <div className="group-member-tile-meta">
            <span className="group-member-tile-id">{componentId}</span>
            <span className="group-member-tile-page">Missing</span>
          </div>
        </div>
        <div className="group-member-tile-actions">
          <button
            type="button"
            className="group-member-tile-remove"
            onClick={onRemove}
            title="Remove from group"
            aria-label={`Remove ${componentId} from group`}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  const { component, pageFile } = found;
  const resolved = resolveComponentForDisplay(component, project.mdFiles);
  const pageName = resolvePageName(pageFile, project.relations.pageNames);
  const statusStyle = project.styles.statuses[component.status];

  let previewText: string;
  if (resolved.type === 'img') {
    previewText = resolved.content.trim() || 'image';
  } else if (resolved.type === 'action') {
    const title = parseActionData(resolved.content).title.trim();
    previewText = title || 'action';
  } else if (resolved.type === 'md') {
    previewText = resolved.content.trim().replace(/\s+/g, ' ').slice(0, 48) || 'markdown';
  } else {
    const text = (resolved.type === 'listItem' ? `• ${resolved.content}` : resolved.content)
      .trim()
      .replace(/\s+/g, ' ');
    previewText = text.slice(0, 48) || resolved.type;
  }

  return (
    <div
      className={`group-member-tile${isAnchor ? ' group-member-tile-selected' : ''}`}
      style={{ '--group-member-status-bg': statusStyle.backgroundColor } as CSSProperties}
    >
      <button
        type="button"
        className="group-member-tile-body"
        onClick={onNavigate}
        title={`View ${componentId}`}
        aria-current={isAnchor ? 'true' : undefined}
      >
        <div className="group-member-tile-meta">
          <span className="group-member-tile-label">{previewText}</span>
          <span className="group-member-tile-id">{componentId}</span>
          <span className="group-member-tile-page">{pageName}</span>
        </div>
      </button>
      <div className="group-member-tile-actions">
        <ComponentTypeBadge
          type={resolved.type}
          iconSize={14}
          className="group-member-tile-type-icon"
        />
        {onRemove ? (
          <button
            type="button"
            className="group-member-tile-remove"
            onClick={onRemove}
            title="Remove from group"
            aria-label={`Remove ${componentId} from group`}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

function formatGroupTitle(
  groupIndex: number,
  group: string[],
  project: LoadedProject,
  isVirtual: boolean,
): string {
  const pageFiles = [...getGroupMemberPageFiles(group, project.index.componentToPage)];
  const pageLabels = pageFiles.map((file) =>
    resolvePageName(file, project.relations.pageNames),
  );
  const pagesPart = pageLabels.length > 0 ? ` · ${pageLabels.join(' ↔ ')}` : '';
  if (isVirtual) {
    return `MD links${pagesPart}`;
  }
  return `List ${groupIndex + 1}${pagesPart}`;
}

export function GroupMembershipDialog({
  project,
  groups,
  anchorComponentId,
  groupIndices,
  activeGroupIndex = null,
  linkMode = false,
  isVirtualGroup,
  onSelectGroup,
  onRemoveMember,
  onNavigateToComponent,
  onClose,
}: GroupMembershipDialogProps) {
  const sortedIndices = useMemo(
    () => [...groupIndices].sort((a, b) => a - b),
    [groupIndices],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleNavigateMember = (groupIndex: number, componentId: string) => {
    onSelectGroup?.(groupIndex);
    onNavigateToComponent(componentId);
  };

  return (
    <aside className="sidebar group-membership-sidebar" aria-label="Linked lists">
      <div className="sidebar-header group-membership-sidebar-header">
        <h2>Linked lists</h2>
        <button type="button" className="sidebar-collapse-btn" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="group-membership-sidebar-body">
        <p className="group-membership-dialog-intro">
          <span className="group-membership-dialog-anchor">{anchorComponentId}</span> belongs to{' '}
          {sortedIndices.length} linked {sortedIndices.length === 1 ? 'list' : 'lists'}.
          {sortedIndices.length > 1 && !linkMode ? (
            <span className="group-membership-dialog-hint"> Select a list, then hold Ctrl to edit.</span>
          ) : null}
          {linkMode ? (
            <span className="group-membership-dialog-hint"> Hold Ctrl — click components to add or remove.</span>
          ) : null}
        </p>

        {sortedIndices.map((groupIndex) => {
          const group = groups[groupIndex] ?? [];
          const isActiveGroup = activeGroupIndex === groupIndex;
          const virtual = isVirtualGroup?.(groupIndex) ?? false;
          return (
            <section
              key={groupIndex}
              className={`group-membership-section${isActiveGroup ? ' group-membership-section-active' : ''}`}
            >
              <button
                type="button"
                className="group-membership-section-title-btn"
                onClick={() => onSelectGroup?.(groupIndex)}
                aria-pressed={isActiveGroup}
              >
                {formatGroupTitle(groupIndex, group, project, virtual)}
              </button>
              <div className="group-membership-members">
                {group.map((memberId) => (
                  <GroupMemberTile
                    key={`${groupIndex}-${memberId}`}
                    project={project}
                    componentId={memberId}
                    isAnchor={memberId === anchorComponentId}
                    onRemove={
                      linkMode || virtual
                        ? undefined
                        : () => onRemoveMember(groupIndex, memberId)
                    }
                    onNavigate={() => handleNavigateMember(groupIndex, memberId)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
