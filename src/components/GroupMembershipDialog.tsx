import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react';
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
  anchorComponentId: string | null;
  groupIndices: number[];
  activeGroupIndex?: number | null;
  linkMode?: boolean;
  canReorder?: boolean;
  canExport?: boolean;
  isVirtualGroup?: (groupIndex: number) => boolean;
  onSelectGroup?: (groupIndex: number) => void;
  onRemoveMember: (groupIndex: number, componentId: string) => void;
  onReorderMember?: (groupIndex: number, fromIndex: number, toIndex: number) => void;
  onExportGroup?: (groupIndex: number, memberIds: string[]) => void;
  onNavigateToComponent: (componentId: string) => void;
  onClose: () => void;
}

function GroupExportIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14"
      />
    </svg>
  );
}

function GroupMemberTile({
  project,
  componentId,
  isAnchor,
  canReorder = false,
  isDragging = false,
  isDropTarget = false,
  onRemove,
  onNavigate,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onDragLeave,
}: {
  project: LoadedProject;
  componentId: string;
  isAnchor: boolean;
  canReorder?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onRemove?: () => void;
  onNavigate: () => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
}) {
  const found = findComponent(project, componentId);
  if (!found) {
    return (
      <div
        className={`group-member-tile group-member-tile-missing${isDragging ? ' group-member-tile-dragging' : ''}${isDropTarget ? ' group-member-tile-drop-target' : ''}`}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={onDragLeave}
      >
        {canReorder ? (
          <button
            type="button"
            className="group-member-tile-drag-handle"
            draggable
            title="Drag to reorder"
            aria-label={`Reorder ${componentId}`}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            ⋮⋮
          </button>
        ) : null}
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
      className={`group-member-tile${isAnchor ? ' group-member-tile-selected' : ''}${isDragging ? ' group-member-tile-dragging' : ''}${isDropTarget ? ' group-member-tile-drop-target' : ''}`}
      style={{ '--group-member-status-bg': statusStyle.backgroundColor } as CSSProperties}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
    >
      {canReorder ? (
        <button
          type="button"
          className="group-member-tile-drag-handle"
          draggable
          title="Drag to reorder"
          aria-label={`Reorder ${componentId}`}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          ⋮⋮
        </button>
      ) : null}
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
  canReorder = false,
  canExport = false,
  isVirtualGroup,
  onSelectGroup,
  onRemoveMember,
  onReorderMember,
  onExportGroup,
  onNavigateToComponent,
  onClose,
}: GroupMembershipDialogProps) {
  const sortedIndices = useMemo(
    () => [...groupIndices].sort((a, b) => a - b),
    [groupIndices],
  );

  const [dragState, setDragState] = useState<{
    groupIndex: number;
    memberIndex: number;
  } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const finishDrag = () => {
    setDragState(null);
    setDropIndex(null);
  };

  const handleNavigateMember = (groupIndex: number, componentId: string) => {
    onSelectGroup?.(groupIndex);
    onNavigateToComponent(componentId);
  };

  const handleDragStart = (
    groupIndex: number,
    memberIndex: number,
    event: DragEvent<HTMLButtonElement>,
  ) => {
    if (!canReorder || !onReorderMember) return;
    setDragState({ groupIndex, memberIndex });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', groups[groupIndex]?.[memberIndex] ?? '');
  };

  const handleDragOver = (
    groupIndex: number,
    memberIndex: number,
    event: DragEvent<HTMLDivElement>,
  ) => {
    if (!canReorder || !dragState || dragState.groupIndex !== groupIndex) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropIndex(memberIndex);
  };

  const handleDrop = (
    groupIndex: number,
    toIndex: number,
    event: DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    if (!canReorder || !onReorderMember || !dragState || dragState.groupIndex !== groupIndex) {
      finishDrag();
      return;
    }

    const fromIndex = dragState.memberIndex;
    if (fromIndex !== toIndex) {
      onReorderMember(groupIndex, fromIndex, toIndex);
    }
    finishDrag();
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
          {anchorComponentId ? (
            <>
              <span className="group-membership-dialog-anchor">{anchorComponentId}</span>
              {sortedIndices.length === 0 ? (
                <> is not in any linked list.</>
              ) : (
                <>
                  {' '}
                  belongs to {sortedIndices.length} linked{' '}
                  {sortedIndices.length === 1 ? 'list' : 'lists'}.
                </>
              )}
            </>
          ) : (
            <>No component selected.</>
          )}
          {sortedIndices.length > 1 && !linkMode ? (
            <span className="group-membership-dialog-hint"> Select a list, then hold Alt to edit.</span>
          ) : null}
          {canReorder ? (
            <span className="group-membership-dialog-hint"> Drag the handle to reorder members.</span>
          ) : null}
          {linkMode ? (
            <span className="group-membership-dialog-hint"> Hold Alt — click components to add or remove.</span>
          ) : null}
        </p>

        {sortedIndices.map((groupIndex) => {
          const group = groups[groupIndex] ?? [];
          const isActiveGroup = activeGroupIndex === groupIndex;
          const virtual = isVirtualGroup?.(groupIndex) ?? false;
          const sectionCanReorder = canReorder && !virtual && !linkMode;
          const sectionCanExport = canExport && !virtual && !linkMode;
          return (
            <section
              key={groupIndex}
              className={`group-membership-section${isActiveGroup ? ' group-membership-section-active' : ''}`}
            >
              <div className="group-membership-section-header">
                <button
                  type="button"
                  className="group-membership-section-title-btn"
                  onClick={() => onSelectGroup?.(groupIndex)}
                  aria-pressed={isActiveGroup}
                >
                  {formatGroupTitle(groupIndex, group, project, virtual)}
                </button>
                {sectionCanExport && onExportGroup ? (
                  <button
                    type="button"
                    className="group-membership-export-btn"
                    title="Export list to Markdown"
                    aria-label={`Export ${formatGroupTitle(groupIndex, group, project, virtual)} to Markdown`}
                    onClick={() => onExportGroup(groupIndex, group)}
                  >
                    <GroupExportIcon />
                  </button>
                ) : null}
              </div>
              <div className="group-membership-members">
                {group.map((memberId, memberIndex) => (
                  <GroupMemberTile
                    key={`${groupIndex}-${memberId}`}
                    project={project}
                    componentId={memberId}
                    isAnchor={memberId === anchorComponentId}
                    canReorder={sectionCanReorder}
                    isDragging={
                      dragState?.groupIndex === groupIndex &&
                      dragState.memberIndex === memberIndex
                    }
                    isDropTarget={
                      dragState?.groupIndex === groupIndex &&
                      dropIndex === memberIndex &&
                      dragState.memberIndex !== memberIndex
                    }
                    onRemove={
                      linkMode || virtual
                        ? undefined
                        : () => onRemoveMember(groupIndex, memberId)
                    }
                    onNavigate={() => handleNavigateMember(groupIndex, memberId)}
                    onDragStart={(event) => handleDragStart(groupIndex, memberIndex, event)}
                    onDragEnd={finishDrag}
                    onDragOver={(event) => handleDragOver(groupIndex, memberIndex, event)}
                    onDrop={(event) => handleDrop(groupIndex, memberIndex, event)}
                    onDragLeave={() => {
                      if (dropIndex === memberIndex) setDropIndex(null);
                    }}
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
