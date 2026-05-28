import { WelcomeScreen } from './components/WelcomeScreen';
import { Sidebar } from './components/Sidebar';
import { PagePanel } from './components/PagePanel';
import { EditBar } from './components/EditBar';
import { LinkModeToggle } from './components/LinkModeToggle';
import { SaveIndicator } from './components/SaveIndicator';
import { useAppStore } from './hooks/useAppStore';
import { useSelectionNavigationShortcuts } from './hooks/useSelectionNavigationShortcuts';
import { getGroupIndicesForComponent } from './lib/groupRelations';

export default function App() {
  const {
    state,
    saveStatus,
    saveError,
    setProject,
    toggleSidebar,
    expandSidebar,
    openPage,
    selectComponent,
    clearSelection,
    togglePanel,
    updateComponent,
    insertComponentAbove,
    insertComponentBelow,
    toggleLinkMode,
    toggleLinkComponent,
    goBackSelection,
    goNextSelection,
    goPrevGroup,
    goNextGroup,
    goPrevLinkGroup,
    goNextLinkGroup,
  } = useAppStore();

  const canGoBack = state.selectionHistoryIndex > 0;
  const canGoNext =
    state.selectionHistoryIndex >= 0 &&
    state.selectionHistoryIndex < state.selectionHistory.length - 1;

  useSelectionNavigationShortcuts({
    enabled: Boolean(state.project) && !state.linkMode,
    canGoBack,
    canGoNext,
    onBack: goBackSelection,
    onNext: goNextSelection,
  });

  if (!state.project) {
    return <WelcomeScreen onLoaded={setProject} />;
  }

  const pageNames = state.project.pages.map((p) => p.fileName);
  const handleComponentClick = state.linkMode ? toggleLinkComponent : selectComponent;

  const matchingGroupIndices = state.selection?.matchingGroupIndices ?? [];
  const activeGroupIndex = state.selection?.activeGroupIndex ?? null;
  const matchingGroupPosition =
    activeGroupIndex === null ? -1 : matchingGroupIndices.indexOf(activeGroupIndex);
  const showGroupNav = !state.linkMode && matchingGroupIndices.length > 1;
  const groupNavLabel = showGroupNav
    ? `Group ${(matchingGroupPosition >= 0 ? matchingGroupPosition : 0) + 1}/${matchingGroupIndices.length}`
    : null;

  const groups = state.project.relations.groups;
  const linkTargetGroupIndex = state.linkTargetGroupIndex;
  const linkMatchingGroupIndices = state.linkFocusComponentId
    ? getGroupIndicesForComponent(groups, state.linkFocusComponentId)
    : [];
  const resolvedLinkTargetIndex =
    linkTargetGroupIndex !== null &&
    linkMatchingGroupIndices.includes(linkTargetGroupIndex)
      ? linkTargetGroupIndex
      : (linkMatchingGroupIndices[0] ?? null);
  const linkGroupMembers =
    state.linkMode && resolvedLinkTargetIndex !== null
      ? new Set(groups[resolvedLinkTargetIndex] ?? [])
      : new Set<string>();
  const showLinkGroupNav = state.linkMode && linkMatchingGroupIndices.length > 1;
  const linkTargetPosition =
    resolvedLinkTargetIndex !== null
      ? linkMatchingGroupIndices.indexOf(resolvedLinkTargetIndex)
      : -1;
  const linkGroupNavLabel = showLinkGroupNav
    ? `List ${linkTargetPosition + 1}/${linkMatchingGroupIndices.length}`
    : null;

  return (
    <>
      <SaveIndicator
        visible={Boolean(state.project.folderHandle)}
        status={saveStatus}
        errorMessage={saveError}
      />
      <div className={`app ${state.sidebarExpanded ? 'sidebar-open' : 'sidebar-collapsed'}`}>
      <Sidebar
        expanded={state.sidebarExpanded}
        pages={pageNames}
        currentPage={state.currentPage}
        onSelectPage={openPage}
        onToggle={toggleSidebar}
      />

      <main
        className="main-area"
        onClick={(e) => {
          if (e.target === e.currentTarget) clearSelection();
        }}
      >
        {state.project.warnings.length > 0 && (
          <div className="warnings-bar">
            {state.project.warnings.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>
        )}

        <LinkModeToggle
          enabled={state.linkMode}
          onToggle={toggleLinkMode}
          sidebarCollapsed={!state.sidebarExpanded}
          onExpandSidebar={expandSidebar}
          canGoBack={canGoBack}
          canGoNext={canGoNext}
          onSelectionBack={goBackSelection}
          onSelectionNext={goNextSelection}
          canGoPrevGroup={showGroupNav}
          canGoNextGroup={showGroupNav}
          groupNavLabel={groupNavLabel}
          onGroupPrev={goPrevGroup}
          onGroupNext={goNextGroup}
          canGoPrevLinkGroup={showLinkGroupNav}
          canGoNextLinkGroup={showLinkGroupNav}
          linkGroupNavLabel={linkGroupNavLabel}
          linkFocusComponentId={state.linkFocusComponentId}
          onLinkGroupPrev={goPrevLinkGroup}
          onLinkGroupNext={goNextLinkGroup}
          linkTargetMemberCount={linkGroupMembers.size}
        />

        <div className="panel-row">
          {state.panels.length === 0 && (
            <div className="empty-panels">Select a page from the sidebar to get started.</div>
          )}
          {state.panels.map((panel) => (
            <PagePanel
              key={panel.pageFile}
              pageFile={panel.pageFile}
              expanded={panel.expanded}
              project={state.project!}
              isCurrent={state.currentPage === panel.pageFile}
              selection={state.selection}
              linkMode={state.linkMode}
              linkGroupMembers={linkGroupMembers}
              onToggle={() => togglePanel(panel.pageFile)}
              onSelect={handleComponentClick}
              onClearSelection={clearSelection}
              scrollToComponentId={state.scrollToComponent?.componentId ?? null}
              scrollNonce={state.scrollToComponent?.nonce ?? 0}
              selectionScrollNonce={state.selectionScrollNonce}
            />
          ))}
        </div>

        <EditBar
          project={state.project}
          selection={state.selection}
          onUpdate={updateComponent}
          onInsertAbove={insertComponentAbove}
          onInsertBelow={insertComponentBelow}
        />
      </main>
    </div>
    </>
  );
}
