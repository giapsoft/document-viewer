import { WelcomeScreen } from './components/WelcomeScreen';
import { Sidebar } from './components/Sidebar';
import { PagePanel } from './components/PagePanel';
import { EditBar } from './components/EditBar';
import { LinkModeToggle } from './components/LinkModeToggle';
import { useAppStore } from './hooks/useAppStore';
import { useSelectionNavigationShortcuts } from './hooks/useSelectionNavigationShortcuts';
export default function App() {
  const {
    state,
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
  const linkSelectionSet = new Set(state.linkSelection);
  const handleComponentClick = state.linkMode ? toggleLinkComponent : selectComponent;

  return (
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
          selectedCount={state.linkSelection.length}
          onToggle={toggleLinkMode}
          sidebarCollapsed={!state.sidebarExpanded}
          onExpandSidebar={expandSidebar}
          canGoBack={canGoBack}
          canGoNext={canGoNext}
          onSelectionBack={goBackSelection}
          onSelectionNext={goNextSelection}
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
              linkSelection={linkSelectionSet}
              onToggle={() => togglePanel(panel.pageFile)}
              onSelect={handleComponentClick}
              onClearSelection={clearSelection}
              scrollToComponentId={state.scrollToComponent?.componentId ?? null}
              scrollNonce={state.scrollToComponent?.nonce ?? 0}
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
  );
}
