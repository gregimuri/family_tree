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
  const clearManualPosition = useProjectStore((s) => s.clearManualPosition);
  const clearManualLayout = useProjectStore((s) => s.clearManualLayout);
  const setManualEdgeRoute = useProjectStore((s) => s.setManualEdgeRoute);
  const clearManualEdgeRoute = useProjectStore((s) => s.clearManualEdgeRoute);
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

  const treeLayout = useMemo(() => {
    if (!project) return null;
    const built = buildLayout(project);
    const treeFrame = getSymmetricTreeFrame(project, built, TREE_SHEET_PAD);
    if (!treeFrame) return null;
    return { layout: built, frame: treeFrame };
  }, [project]);

  useEffect(() => {
    if (!project) return;
    syncLayoutPositions();
  }, [project, syncLayoutPositions]);

  const layout = treeLayout?.layout ?? null;
  const frame = treeLayout?.frame ?? null;

  const screenToLayout = useScreenToLayout(svgRef, layoutGroupRef);

  const handleBackgroundClick = () => {
    setSelection(null);
    if (manualLayoutMode) setSelectedEdgeId(null);
  };

  const makeCenter = () => {
    if (!selection) return;
    setDragPositions({});
    if (selection.type === 'person') {
      setCenter({ type: 'person', id: selection.id });
    } else {
      setCenter({ type: 'family', id: selection.id });
    }
  };

  const handleDragMove = useCallback((personId: string, centerX: number, centerY: number) => {
    setDragPositions((prev) => ({ ...prev, [personId]: { x: centerX, y: centerY } }));
  }, []);

  const handleDragEnd = useCallback(
    (personId: string, centerX: number, centerY: number, width: number, height: number) => {
      const gridSize = width / 6;
      const snapped = snapCardCenterToGridCorners(centerX, centerY, width, height, gridSize);
      setManualPosition(personId, snapped.x, snapped.y);
      setDragPositions((prev) => {
        const next = { ...prev };
        delete next[personId];
        return next;
      });
    },
    [setManualPosition],
  );

  useKeyboardNav({ transformRef, enabled: !manualLayoutMode });
  const onTreeInit = useTreeWheel(transformRef);
  useCenterTreeView({ transformRef, project, layout, frame, enabled: !manualLayoutMode });

  if (!project || !layout || !frame) return null;

  const theme = project.viewSettings.theme;
  const { svgW, svgH, offsetX, offsetY } = frame;
  const manualCount = Object.keys(project.manualLayout ?? {}).length;
  const manualEdgeCount = Object.keys(project.manualEdgeRoutes ?? {}).length;
  const isDragging = Object.keys(dragPositions).length > 0;

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
            Карточки — перетаскивание; линии — клик и узлы маршрута. ПКМ / колёсико — прокрутка.
          </span>
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
          {selection?.type === 'person' && project.manualLayout?.[selection.id] && (
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
            onClick={() => {
              if (manualLayoutMode) setSelectedEdgeId(null);
              setManualLayoutMode(!manualLayoutMode);
            }}
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
            <span>ЛКМ на карточке — перемещение</span>
            <span>ЛКМ на линии — редактирование маршрута</span>
            <span>ПКМ / колёсико — прокрутка</span>
            <span>Ctrl+Z — отмена (вся сессия расположения)</span>
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
              className="tree-svg"
              overflow="visible"
              onClick={handleBackgroundClick}
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
                ) : (
                  <pattern id="tree-bg" width="80" height="80" patternUnits="userSpaceOnUse">
                    <rect width="80" height="80" fill="#f7f3eb" />
                    <circle cx="12" cy="18" r="1.2" fill="#d6cfc0" opacity="0.6" />
                    <circle cx="52" cy="44" r="1" fill="#d6cfc0" opacity="0.5" />
                    <circle cx="68" cy="12" r="0.8" fill="#d6cfc0" opacity="0.4" />
                  </pattern>
                )}
              </defs>
              <rect
                x={TREE_SHEET_STROKE_PAD}
                y={TREE_SHEET_STROKE_PAD}
                width={svgW - TREE_SHEET_STROKE_PAD * 2}
                height={svgH - TREE_SHEET_STROKE_PAD * 2}
                rx={theme === 'forest' ? 12 : 8}
                fill="url(#tree-bg)"
                stroke={theme === 'forest' ? '#7f1d1d' : '#d4cfc4'}
                strokeWidth={theme === 'forest' ? 6 : 2}
              />
              <g ref={layoutGroupRef} transform={`translate(${offsetX}, ${offsetY})`}>
                <ManualLayoutGrid
                  layout={layout}
                  active={manualLayoutMode}
                  dragging={isDragging}
                />
                <EditableTreeConnections
                  edges={layout.edges}
                  theme={theme}
                  project={project}
                  marriageDateFormat={project.viewSettings.cardFields.marriageDateFormat}
                  active={manualLayoutMode}
                  selectedEdgeId={selectedEdgeId}
                  onSelectEdge={setSelectedEdgeId}
                  onUpdateRoute={setManualEdgeRoute}
                  screenToLayout={screenToLayout}
                />
                {layout.nodes.map((node) => {
                  if (node.kind === 'person' && node.personId) {
                    const person = project.persons[node.personId];
                    if (!person) return null;
                    const selected =
                      selection?.type === 'person' && selection.id === node.personId;
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
                        onDragMove={(cx, cy) => handleDragMove(node.personId!, cx, cy)}
                        onDragEnd={(cx, cy) => handleDragEnd(node.personId!, cx, cy, node.width, node.height)}
                        onClick={() => setSelection({ type: 'person', id: node.personId! })}
                        onDoubleClick={() => !manualLayoutMode && openDossier(node.personId!)}
                      />
                    );
                  }
                  return null;
                })}
              </g>
            </svg>
          </TransformComponent>
        )}
      </TransformWrapper>

      <ZoomControls
        onZoomIn={() => transformRef.current?.zoomIn()}
        onZoomOut={() => transformRef.current?.zoomOut()}
        onReset={() => resetTreeView(transformRef, frame, layout)}
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
      {mediaViewerId && <MediaViewer mediaId={mediaViewerId} />}
    </div>
  );
}
