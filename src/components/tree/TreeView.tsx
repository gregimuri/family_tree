import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { buildLayout } from '../../layout';
import { getSymmetricTreeFrame } from '../../layout/center-focus';
import { TREE_SHEET_PAD, TREE_SHEET_STROKE_PAD } from '../../layout/tree-sheet';
import { useProjectStore } from '../../store/project-store';
import { useUiStore } from '../../store/ui-store';
import { useKeyboardNav } from '../../hooks/useKeyboardNav';
import { useTreeWheel } from '../../hooks/useTreeWheel';
import { useCenterTreeView, resetTreeView } from '../../hooks/useCenterTreeView';
import { useScreenToLayout } from '../../hooks/useScreenToLayout';
import { PersonCardWithMedia } from './PersonCard';
import { ManualLayoutGrid } from './ManualLayoutGrid';
import { EditableTreeConnections } from './EditableTreeConnections';
import { MarriageBondLinesBehindCards } from './TreeConnections';
import { MarriageEditDialog } from '../dossier/MarriageEditDialog';
import { SearchPanel } from '../panels/SearchPanel';
import { DisplaySettingsPanel } from '../panels/DisplaySettingsPanel';
import { AddPersonPanel } from '../panels/AddPersonPanel';
import { ZoomControls } from '../panels/ZoomControls';
import { ExportDialog } from '../export/ExportDialog';
import { PersonDossier } from '../dossier/PersonDossier';
import { MediaViewer } from '../media/MediaViewer';
import { Icons } from '../ui/Icons';
import './TreeView.css';
import { snapCardCenterToGridCorners } from '../../layout/card-dimensions';
import { normalizeRect, rectsIntersect, isMarqueePointerTarget, applyMarqueeSelection } from './layout-selection-utils';
import type { LayoutNode } from '../../types';
import type { ProjectSnapshot } from '../../store/project-history';

const MARQUEE_MIN_SIZE = 4;

function getNodeCenter(
  node: LayoutNode,
  dragPositions: Record<string, { x: number; y: number }>,
): { x: number; y: number } {
  const drag = node.personId ? dragPositions[node.personId] : undefined;
  if (drag) return drag;
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

export function TreeView() {
  const project = useProjectStore((s) => s.project);
  const selection = useProjectStore((s) => s.selection);
  const setSelection = useProjectStore((s) => s.setSelection);
  const setCenter = useProjectStore((s) => s.setCenter);
  const openDossier = useProjectStore((s) => s.openDossier);
  const getMediaUrl = useProjectStore((s) => s.getMediaUrl);
  const mode = useProjectStore((s) => s.mode);
  const manualLayoutMode = useProjectStore((s) => s.manualLayoutMode);
  const setManualLayoutMode = useProjectStore((s) => s.setManualLayoutMode);
  const setManualPosition = useProjectStore((s) => s.setManualPosition);
  const setManualPositions = useProjectStore((s) => s.setManualPositions);
  const clearManualPosition = useProjectStore((s) => s.clearManualPosition);
  const clearManualLayout = useProjectStore((s) => s.clearManualLayout);
  const setManualEdgeRoute = useProjectStore((s) => s.setManualEdgeRoute);
  const clearManualEdgeRoute = useProjectStore((s) => s.clearManualEdgeRoute);
  const captureProjectSnapshot = useProjectStore((s) => s.captureProjectSnapshot);
  const syncLayoutPositions = useProjectStore((s) => s.syncLayoutPositions);
  const dossierPersonId = useProjectStore((s) => s.dossierPersonId);
  const mediaViewerId = useProjectStore((s) => s.mediaViewerId);
  const exportOpen = useUiStore((s) => s.exportOpen);
  const setExportOpen = useUiStore((s) => s.setExportOpen);
  const highlightedPersonId = useUiStore((s) => s.highlightedPersonId);
  const fullscreen = useUiStore((s) => s.fullscreen);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const layoutGroupRef = useRef<SVGGElement>(null);
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [marriageEdit, setMarriageEdit] = useState<{
    unionId: string;
    snapshot: ProjectSnapshot | null;
  } | null>(null);
  const [layoutSelection, setLayoutSelection] = useState<Set<string>>(() => new Set());
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );
  const marqueePointerIdRef = useRef<number | null>(null);
  const marqueeAdditiveRef = useRef(false);
  const ignoreNextBackgroundClickRef = useRef(false);

  const treeLayout = useMemo(() => {
    if (!project) return null;
    const built = buildLayout(project);
    const treeFrame = getSymmetricTreeFrame(project, built, TREE_SHEET_PAD);
    if (!treeFrame) return null;
    return { layout: built, frame: treeFrame };
  }, [project]);

  const layoutSyncKey = useMemo(() => {
    if (!project) return '';
    return [
      Object.keys(project.persons).length,
      Object.keys(project.unions).length,
      Object.keys(project.manualLayout ?? {}).length,
      project.viewSettings.generationsUp,
      project.viewSettings.generationsDown,
      project.viewSettings.sideBranchesAt,
      project.viewSettings.sideBranchDepth,
      project.viewSettings.cardSizeMode,
      project.viewSettings.showAllPersons ? 1 : 0,
      project.viewSettings.showDiedBefore18 ? 1 : 0,
    ].join('|');
  }, [project]);

  useEffect(() => {
    if (!project) return;
    syncLayoutPositions();
  }, [layoutSyncKey, project, syncLayoutPositions]);

  const openMarriageEdit = useCallback(
    (unionId: string) => {
      setMarriageEdit({
        unionId,
        snapshot: mode === 'edit' ? captureProjectSnapshot() : null,
      });
    },
    [mode, captureProjectSnapshot],
  );

  const closeMarriageEdit = useCallback(() => setMarriageEdit(null), []);

  const handleSelectEdge = useCallback((edgeId: string | null, additive = false) => {
    setSelectedEdgeId(edgeId);
    if (edgeId && !additive) {
      setLayoutSelection(new Set());
      setSelection(null);
    }
  }, [setSelection]);

  const toggleManualLayoutMode = useCallback(() => {
    if (manualLayoutMode) {
      setLayoutSelection(new Set());
      setMarquee(null);
      setSelectedEdgeId(null);
    }
    setManualLayoutMode(!manualLayoutMode);
  }, [manualLayoutMode, setManualLayoutMode]);

  const layout = treeLayout?.layout ?? null;
  const frame = treeLayout?.frame ?? null;

  const screenToLayout = useScreenToLayout(svgRef, layoutGroupRef);

  const handleBackgroundClick = () => {
    if (ignoreNextBackgroundClickRef.current) {
      ignoreNextBackgroundClickRef.current = false;
      return;
    }
    if (marquee) return;
    setSelection(null);
    if (manualLayoutMode) {
      setSelectedEdgeId(null);
      setLayoutSelection(new Set());
    }
  };

  const finishMarquee = useCallback(
    (box: { x1: number; y1: number; x2: number; y2: number }, additive: boolean) => {
      if (!layout) return;
      const rect = normalizeRect(box.x1, box.y1, box.x2, box.y2);
      if (rect.width < MARQUEE_MIN_SIZE && rect.height < MARQUEE_MIN_SIZE) {
        if (!additive) {
          setLayoutSelection(new Set());
          setSelection(null);
        }
        return;
      }

      const ids = layout.nodes
        .filter((node) => {
          if (node.kind !== 'person' || !node.personId) return false;
          const drag = dragPositions[node.personId];
          const x = drag ? drag.x - node.width / 2 : node.x;
          const y = drag ? drag.y - node.height / 2 : node.y;
          return rectsIntersect(rect, { x, y, width: node.width, height: node.height });
        })
        .map((node) => node.personId!);

      const next = applyMarqueeSelection(layoutSelection, ids, additive);
      setLayoutSelection(next);
      if (next.size === 1) setSelection({ type: 'person', id: [...next][0] });
      else setSelection(null);
    },
    [layout, dragPositions, layoutSelection, setSelection],
  );

  const startMarqueeFromPointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!manualLayoutMode || e.button !== 0 || !screenToLayout) return;
      if (!isMarqueePointerTarget(e.target)) return;

      const pt = screenToLayout(e.clientX, e.clientY);
      if (!pt) return;

      e.preventDefault();
      e.stopPropagation();
      marqueePointerIdRef.current = e.pointerId;
      marqueeAdditiveRef.current = e.shiftKey;
      setMarquee({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
      setSelectedEdgeId(null);

      const move = (ev: PointerEvent) => {
        if (marqueePointerIdRef.current !== ev.pointerId) return;
        const p = screenToLayout(ev.clientX, ev.clientY);
        if (!p) return;
        setMarquee((prev) => (prev ? { ...prev, x2: p.x, y2: p.y } : null));
      };

      const up = (ev: PointerEvent) => {
        if (marqueePointerIdRef.current !== ev.pointerId) return;
        marqueePointerIdRef.current = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);

        const p = screenToLayout(ev.clientX, ev.clientY);
        const additive = marqueeAdditiveRef.current;
        setMarquee((prev) => {
          if (prev && p) finishMarquee({ ...prev, x2: p.x, y2: p.y }, additive);
          return null;
        });
        ignoreNextBackgroundClickRef.current = true;
        ev.preventDefault();
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [manualLayoutMode, screenToLayout, finishMarquee],
  );

  const makeCenter = () => {
    if (!selection) return;
    setDragPositions({});
    if (selection.type === 'person') {
      setCenter({ type: 'person', id: selection.id });
    } else {
      setCenter({ type: 'family', id: selection.id });
    }
  };

  const handleGroupDragMove = useCallback((updates: Record<string, { x: number; y: number }>) => {
    setDragPositions((prev) => ({ ...prev, ...updates }));
  }, []);

  const snapAndSavePositions = useCallback(
    (
      ids: string[],
      centers: Record<string, { x: number; y: number }>,
      sizes: Record<string, { width: number; height: number }>,
    ) => {
      const patch: Record<string, { x: number; y: number }> = {};
      for (const id of ids) {
        const center = centers[id];
        const size = sizes[id];
        if (!center || !size) continue;
        const gridSize = size.width / 6;
        patch[id] = snapCardCenterToGridCorners(
          center.x,
          center.y,
          size.width,
          size.height,
          gridSize,
        );
      }
      if (Object.keys(patch).length === 1) {
        const [id, pos] = Object.entries(patch)[0];
        setManualPosition(id, pos.x, pos.y);
      } else {
        setManualPositions(patch);
      }
      setDragPositions((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
    },
    [setManualPosition, setManualPositions],
  );

  const handleLayoutCardPointerDown = useCallback(
    (personId: string, e: React.PointerEvent<HTMLDivElement>) => {
      if (!manualLayoutMode || e.button !== 0 || !screenToLayout || !layout) return;
      e.preventDefault();
      e.stopPropagation();

      let dragIds: string[];
      if (e.shiftKey) {
        const next = new Set(layoutSelection);
        if (next.has(personId)) next.delete(personId);
        else next.add(personId);
        setLayoutSelection(next);
        dragIds = [...next];
        if (dragIds.length === 0) return;
      } else if (layoutSelection.has(personId) && layoutSelection.size > 1) {
        dragIds = [...layoutSelection];
      } else {
        dragIds = [personId];
        setLayoutSelection(new Set([personId]));
      }

      setSelection({ type: 'person', id: personId });
      setSelectedEdgeId(null);

      const startPointer = screenToLayout(e.clientX, e.clientY);
      if (!startPointer) return;

      const startCenters: Record<string, { x: number; y: number }> = {};
      const sizes: Record<string, { width: number; height: number }> = {};
      for (const id of dragIds) {
        const n = layout.nodes.find((item) => item.personId === id);
        if (!n?.personId) continue;
        startCenters[id] = getNodeCenter(n, dragPositions);
        sizes[id] = { width: n.width, height: n.height };
      }

      const anchorCenter = startCenters[personId];
      if (!anchorCenter) return;

      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const move = (ev: PointerEvent) => {
        const pt = screenToLayout(ev.clientX, ev.clientY);
        if (!pt) return;
        const dx = pt.x - startPointer.x;
        const dy = pt.y - startPointer.y;
        const updates: Record<string, { x: number; y: number }> = {};
        for (const id of dragIds) {
          const base = startCenters[id];
          if (!base) continue;
          updates[id] = { x: base.x + dx, y: base.y + dy };
        }
        handleGroupDragMove(updates);
      };

      const up = (ev: PointerEvent) => {
        target.releasePointerCapture(ev.pointerId);
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        target.removeEventListener('pointercancel', up);
        const pt = screenToLayout(ev.clientX, ev.clientY);
        if (!pt) return;
        const dx = pt.x - startPointer.x;
        const dy = pt.y - startPointer.y;
        const finalCenters: Record<string, { x: number; y: number }> = {};
        for (const id of dragIds) {
          const base = startCenters[id];
          if (!base) continue;
          finalCenters[id] = { x: base.x + dx, y: base.y + dy };
        }
        snapAndSavePositions(dragIds, finalCenters, sizes);
      };

      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', up);
    },
    [
      manualLayoutMode,
      screenToLayout,
      layout,
      layoutSelection,
      dragPositions,
      setSelection,
      handleGroupDragMove,
      snapAndSavePositions,
    ],
  );

  useKeyboardNav({ transformRef, enabled: !manualLayoutMode });
  const onTreeInit = useTreeWheel(transformRef);
  const { onTransformed: onTreeTransformed } = useCenterTreeView({
    transformRef,
    project,
    layout,
    frame,
    enabled: !manualLayoutMode,
  });

  if (!project || !layout || !frame) return null;

  const theme = project.viewSettings.theme;
  const { svgW, svgH, offsetX, offsetY } = frame;
  const manualCount = Object.keys(project.manualLayout ?? {}).length;
  const manualEdgeCount = Object.keys(project.manualEdgeRoutes ?? {}).length;
  const layoutSelectedCount = layoutSelection.size;
  const isDragging = Object.keys(dragPositions).length > 0;
  const marqueeRect = marquee ? normalizeRect(marquee.x1, marquee.y1, marquee.x2, marquee.y2) : null;

  return (
    <div
      className={`tree-view ${fullscreen ? 'fullscreen' : ''} theme-${theme}${manualLayoutMode ? ' tree-view--manual-layout' : ''}${isDragging ? ' tree-view--dragging' : ''}`}
    >
      <div className="tree-panel-dock tree-panel-dock--left">
        <SearchPanel />
        <AddPersonPanel />
      </div>
      <div className="tree-panel-dock tree-panel-dock--right">
        <DisplaySettingsPanel />
      </div>

      {manualLayoutMode && (
        <div className="manual-layout-bar">
          <Icons.Move size={16} />
          <span>
            Карточки — перетаскивание; рамкой — выбор нескольких; Shift+рамка или Shift+клик — добавить в выбор.
          </span>
          {layoutSelectedCount > 0 && (
            <span className="manual-layout-bar__count">Выбрано: {layoutSelectedCount}</span>
          )}
          {(manualCount > 0 || manualEdgeCount > 0) && (
            <span className="manual-layout-bar__count">
              Карточек: {manualCount}
              {manualEdgeCount > 0 ? ` · линий: ${manualEdgeCount}` : ''}
            </span>
          )}
          {selectedEdgeId && (
            <button
              type="button"
              className="btn small"
              onClick={() => {
                clearManualEdgeRoute(selectedEdgeId);
                setSelectedEdgeId(null);
              }}
            >
              Сбросить линию
            </button>
          )}
          {layoutSelectedCount > 0 && (
            <button
              type="button"
              className="btn small"
              onClick={() => {
                for (const id of layoutSelection) clearManualPosition(id);
                setLayoutSelection(new Set());
              }}
            >
              Сбросить выбранные
            </button>
          )}
          {selection?.type === 'person' &&
            layoutSelectedCount <= 1 &&
            !selectedEdgeId &&
            project.manualLayout?.[selection.id] && (
            <button
              type="button"
              className="btn small"
              onClick={() => clearManualPosition(selection.id)}
            >
              Сбросить карточку
            </button>
          )}
          {(manualCount > 0 || manualEdgeCount > 0) && (
            <button
              type="button"
              className="btn small"
              onClick={() => {
                clearManualLayout();
                setSelectedEdgeId(null);
                resetTreeView(transformRef, frame, layout);
              }}
            >
              Авторасположение
            </button>
          )}
        </div>
      )}

      <div className="tree-bottom-bar">
        <button type="button" className="btn tree-action-btn" onClick={() => setExportOpen(true)}>
          <Icons.Export size={16} />
          Экспорт
        </button>
        {mode === 'edit' && (
          <button
            type="button"
            className={`btn tree-action-btn${manualLayoutMode ? ' accent' : ''}`}
            onClick={toggleManualLayoutMode}
            title="Перетаскивание карточек по сетке"
          >
            <Icons.Move size={16} />
            {manualLayoutMode ? 'Расположение: вкл' : 'Расположение карточек'}
          </button>
        )}
        {selection && !manualLayoutMode && (
          <button type="button" className="btn tree-action-btn accent" onClick={makeCenter}>
            <Icons.Target size={16} />
            Сделать центром
          </button>
        )}
      </div>

      <div className="tree-hints">
        {manualLayoutMode ? (
          <>
            <span>ЛКМ на пустом месте — выделить область</span>
            <span>Shift+рамка — добавить область к выбору</span>
            <span>ЛКМ на карточке — перемещение (несколько, если выбраны)</span>
            <span>Shift+клик — добавить/убрать из выбора</span>
            <span>ЛКМ на линии — редактирование маршрута</span>
            <span>ПКМ / колёсико — прокрутка</span>
          </>
        ) : (
          <>
            <span>Колёсико — прокрутка</span>
            <span>Shift+колёсико — вбок</span>
            <span>Ctrl+колёсико — масштаб</span>
            <span>Двойной клик — личное дело</span>
          </>
        )}
      </div>

      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={0.12}
        maxScale={2.5}
        limitToBounds={false}
        centerOnInit={false}
        smooth={false}
        panning={{
          velocityDisabled: true,
          allowLeftClickPan: !manualLayoutMode,
          allowMiddleClickPan: true,
          allowRightClickPan: true,
        }}
        wheel={{
          step: 0.12,
          wheelDisabled: true,
          touchPadDisabled: false,
        }}
        trackPadPanning={{
          disabled: false,
        }}
        doubleClick={{ disabled: true }}
        onInit={onTreeInit}
        onTransform={(ref) => onTreeTransformed(ref)}
      >
        {() => (
          <TransformComponent
            wrapperClass="tree-transform-wrapper"
            contentClass="tree-transform-content"
          >
            <svg
              ref={svgRef}
              id="tree-export-root"
              width={svgW}
              height={svgH}
              className={`tree-svg${manualLayoutMode ? ' tree-svg--marquee' : ''}`}
              overflow="visible"
              onClick={handleBackgroundClick}
              onPointerDown={startMarqueeFromPointer}
            >
              <defs>
                {theme === 'forest' ? (
                  <pattern id="tree-bg" width="160" height="160" patternUnits="userSpaceOnUse">
                    <rect width="160" height="160" fill="#f3e9dc" />
                    <path
                      d="M20 120 Q40 80 60 120 M100 40 Q120 10 140 50"
                      stroke="#8d6e63"
                      strokeWidth="2"
                      fill="none"
                      opacity="0.25"
                    />
                    <circle cx="130" cy="130" r="8" fill="#a1887f" opacity="0.2" />
                  </pattern>
                ) : null}
              </defs>
              <rect
                x={TREE_SHEET_STROKE_PAD}
                y={TREE_SHEET_STROKE_PAD}
                width={svgW - TREE_SHEET_STROKE_PAD * 2}
                height={svgH - TREE_SHEET_STROKE_PAD * 2}
                rx={theme === 'forest' ? 12 : 8}
                fill={theme === 'forest' ? 'url(#tree-bg)' : '#ffffff'}
                stroke={theme === 'forest' ? '#7f1d1d' : '#e7e5e4'}
                strokeWidth={theme === 'forest' ? 6 : 2}
              />
              <g ref={layoutGroupRef} transform={`translate(${offsetX}, ${offsetY})`}>
                <ManualLayoutGrid
                  layout={layout}
                  active={manualLayoutMode}
                  dragging={isDragging}
                />
                <MarriageBondLinesBehindCards
                  edges={layout.edges}
                  theme={theme}
                  highlightEdgeId={manualLayoutMode ? selectedEdgeId : null}
                />
                {layout.nodes.map((node) => {
                  if (node.kind === 'person' && node.personId) {
                    const person = project.persons[node.personId];
                    if (!person) return null;
                    const selected =
                      selection?.type === 'person' && selection.id === node.personId;
                    const layoutSelected = layoutSelection.has(node.personId);
                    const drag = dragPositions[node.personId];
                    const displayX = drag ? drag.x - node.width / 2 : node.x;
                    const displayY = drag ? drag.y - node.height / 2 : node.y;
                    const manualPlaced = !!project.manualLayout?.[node.personId];
                    return (
                      <PersonCardWithMedia
                        key={node.id}
                        person={person}
                        project={project}
                        settings={project.viewSettings}
                        selected={selected}
                        layoutSelected={layoutSelected}
                        highlighted={highlightedPersonId === node.personId}
                        x={displayX}
                        y={displayY}
                        width={node.width}
                        height={node.height}
                        theme={theme}
                        getMediaUrl={getMediaUrl}
                        draggable={manualLayoutMode}
                        manualPlaced={manualPlaced}
                        screenToLayout={screenToLayout}
                        onLayoutPointerDown={(e) =>
                          handleLayoutCardPointerDown(node.personId!, e)
                        }
                        onClick={() => {
                          if (!manualLayoutMode) {
                            setSelection({ type: 'person', id: node.personId! });
                          }
                        }}
                        onDoubleClick={() => !manualLayoutMode && openDossier(node.personId!)}
                      />
                    );
                  }
                  return null;
                })}
                <EditableTreeConnections
                  edges={layout.edges}
                  theme={theme}
                  project={project}
                  marriageDateFormat={project.viewSettings.cardFields.marriageDateFormat}
                  onUnionDoubleClick={openMarriageEdit}
                  active={manualLayoutMode}
                  selectedEdgeId={selectedEdgeId}
                  onSelectEdge={handleSelectEdge}
                  onUpdateRoute={setManualEdgeRoute}
                  screenToLayout={screenToLayout}
                />
                {marqueeRect && (
                  <rect
                    className="layout-marquee"
                    x={marqueeRect.x}
                    y={marqueeRect.y}
                    width={marqueeRect.width}
                    height={marqueeRect.height}
                    pointerEvents="none"
                  />
                )}
              </g>
            </svg>
          </TransformComponent>
        )}
      </TransformWrapper>

      <ZoomControls
        onZoomIn={() => transformRef.current?.zoomIn()}
        onZoomOut={() => transformRef.current?.zoomOut()}
        onReset={() => resetTreeView(transformRef, frame, layout)}
        onToggleManualLayout={toggleManualLayoutMode}
      />

      {exportOpen && (
        <ExportDialog
          onClose={() => setExportOpen(false)}
          svgRef={svgRef}
          layout={layout}
          frame={frame}
        />
      )}
      {dossierPersonId && <PersonDossier key={dossierPersonId} personId={dossierPersonId} />}
      {marriageEdit && (
        <MarriageEditDialog
          key={marriageEdit.unionId}
          unionId={marriageEdit.unionId}
          editSnapshot={marriageEdit.snapshot}
          onClose={closeMarriageEdit}
        />
      )}
      {mediaViewerId && <MediaViewer mediaId={mediaViewerId} />}
    </div>
  );
}
