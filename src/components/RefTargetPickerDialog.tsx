import { useEffect, useMemo, useRef, useState } from 'react';
import type { LoadedProject, SelectionState } from '../types';
import { findComponent } from '../lib/projectMutations';
import { formatPageName } from '../lib/formatPageName';
import { ComponentBlock } from './PagePanel';

interface RefTargetPickerDialogProps {
  project: LoadedProject;
  refComponentId: string;
  targetId: string;
  onSelect: (targetId: string) => void;
  onClose: () => void;
}

function resolveValidTarget(
  project: LoadedProject,
  targetId: string,
): { pageFile: string; componentId: string } | null {
  const trimmed = targetId.trim();
  if (!trimmed) return null;
  const located = findComponent(project, trimmed);
  if (!located) return null;
  return { pageFile: located.pageFile, componentId: located.component.id };
}

export function RefTargetPickerDialog({
  project,
  refComponentId,
  targetId,
  onSelect,
  onClose,
}: RefTargetPickerDialogProps) {
  const validTarget = useMemo(
    () => resolveValidTarget(project, targetId),
    [project, targetId],
  );

  const [view, setView] = useState<'pages' | 'page'>(() =>
    validTarget ? 'page' : 'pages',
  );
  const [activePage, setActivePage] = useState<string | null>(
    () => validTarget?.pageFile ?? null,
  );
  const [highlightId, setHighlightId] = useState<string | null>(
    () => validTarget?.componentId ?? null,
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const componentRefs = useRef<Map<string, HTMLElement>>(new Map());

  const registerRef = (id: string, el: HTMLElement | null) => {
    if (el) componentRefs.current.set(id, el);
    else componentRefs.current.delete(id);
  };

  const page = activePage
    ? project.pages.find((p) => p.fileName === activePage)
    : null;

  const pickerSelection: SelectionState | null = highlightId
    ? {
        componentId: highlightId,
        relatedIds: new Set([highlightId]),
        activeGroupIndex: null,
        matchingGroupIndices: [],
      }
    : null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (view !== 'page' || !highlightId) return;
    const el = componentRefs.current.get(highlightId);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [view, activePage, highlightId]);

  const handlePickComponent = (componentId: string, _pageFile: string) => {
    if (componentId === refComponentId) return;
    onSelect(componentId);
    onClose();
  };

  const handlePickPage = (pageFile: string) => {
    setActivePage(pageFile);
    setHighlightId(null);
    setView('page');
  };

  return (
    <div
      className="picker-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="picker-header">
          <div className="picker-header-start">
            {view === 'page' && (
              <button
                type="button"
                className="picker-back-btn"
                onClick={() => setView('pages')}
              >
                ← Back
              </button>
            )}
            <h2 id="picker-dialog-title" className="picker-title">
              {view === 'pages' ? 'Select page' : formatPageName(activePage ?? '')}
            </h2>
          </div>
          <button
            type="button"
            className="picker-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="picker-body">
          {view === 'pages' ? (
            <ul className="picker-page-list">
              {project.pages.map((p) => (
                <li key={p.fileName}>
                  <button
                    type="button"
                    className={`picker-page-item ${activePage === p.fileName ? 'active' : ''}`}
                    onClick={() => handlePickPage(p.fileName)}
                  >
                    <span className="picker-page-name">{formatPageName(p.fileName)}</span>
                    <span className="picker-page-meta">
                      {p.components.length} component{p.components.length === 1 ? '' : 's'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : page ? (
            <div ref={scrollRef} className="picker-page-scroll">
              <div className="page-content">
                {page.components.map((component) => {
                  const isSelf = component.id === refComponentId;
                  return (
                    <div
                      key={component.id}
                      className={isSelf ? 'picker-component-disabled' : undefined}
                    >
                      <ComponentBlock
                        component={component}
                        project={project}
                        styles={project.styles}
                        pageFile={page.fileName}
                        selection={pickerSelection}
                        onSelect={handlePickComponent}
                        registerRef={registerRef}
                      />
                      {isSelf && (
                        <p className="picker-self-hint">Cannot reference itself</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {view === 'page' && (
          <footer className="picker-footer">
            <span>Click a component to set it as the ref target.</span>
          </footer>
        )}
      </div>
    </div>
  );
}
