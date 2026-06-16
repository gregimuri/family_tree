import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { LayoutEdge, Project, DateDisplayFormat } from '../../types';
import { branchPath, coupleBondMidpoint, coupleBondPath, edgePath, isBondEdge } from '../../layout/edge-router';
import { CARD_GRID_CELL, snapToGridCorner } from '../../layout/card-dimensions';
import {
  constrainManualRoutePoint,
  isLockedManualRoutePoint,
  previewEdgeRoutes,
} from '../../layout/manual-edge-routes';
import { useProjectStore } from '../../store/project-store';
import { PedigreeConnections, MarriageBonds } from './TreeConnections';

interface EditableTreeConnectionsProps {
  edges: LayoutEdge[];
  theme: 'clean' | 'forest';
  project: Project;
  marriageDateFormat: DateDisplayFormat;
  onUnionDoubleClick?: (unionId: string) => void;
  active: boolean;
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string | null, additive?: boolean) => void;
  onUpdateRoute: (edgeId: string, points: { x: number; y: number }[]) => void;
  screenToLayout?: (clientX: number, clientY: number) => { x: number; y: number } | null;
}

function pathD(edge: LayoutEdge, theme: 'clean' | 'forest'): string {
  const isBond = isBondEdge(edge.id);
  const isPedigree = edge.id.startsWith('fam-');
  if (isBond) return coupleBondPath(edge.points);
  return edge.pathD ?? (isPedigree || theme === 'clean' ? edgePath(edge.points) : branchPath(edge.points));
}

export function EditableTreeConnections({
  edges,
  theme,
  project,
  marriageDateFormat,
  onUnionDoubleClick,
  active,
  selectedEdgeId,
  onSelectEdge,
  onUpdateRoute,
  screenToLayout,
}: EditableTreeConnectionsProps) {
  const beginLayoutEditGesture = useProjectStore((s) => s.beginLayoutEditGesture);
  const endLayoutEditGesture = useProjectStore((s) => s.endLayoutEditGesture);
  const [dragPreview, setDragPreview] = useState<{ edgeId: string; points: { x: number; y: number }[] } | null>(
    null,
  );
  const dragPointsRef = useRef<{ x: number; y: number }[]>([]);
  const dragEdgeIdRef = useRef<string | null>(null);

  const displayEdges = useMemo(() => {
    if (!dragPreview) return edges;
    return previewEdgeRoutes(edges, dragPreview.edgeId, dragPreview.points, project);
  }, [dragPreview, edges, project]);

  const selectedEdge = useMemo(
    () => displayEdges.find((e) => e.id === selectedEdgeId) ?? null,
    [displayEdges, selectedEdgeId],
  );

  const bondMidHandle = useMemo(() => {
    if (!selectedEdge || !isBondEdge(selectedEdge.id) || selectedEdge.points.length < 2) return null;
    return coupleBondMidpoint(selectedEdge.points);
  }, [selectedEdge]);

  const startPointDrag = (
    edge: LayoutEdge,
    pointIndex: number,
    e: ReactPointerEvent<SVGCircleElement>,
  ) => {
    if (!screenToLayout) return;
    e.preventDefault();
    e.stopPropagation();

    beginLayoutEditGesture();
    dragEdgeIdRef.current = edge.id;
    dragPointsRef.current = edge.points.map((p) => ({ ...p }));

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const move = (ev: globalThis.PointerEvent) => {
      const pt = screenToLayout(ev.clientX, ev.clientY);
      if (!pt) return;
      const snapped = snapToGridCorner(pt.x, pt.y, CARD_GRID_CELL);
      const next = constrainManualRoutePoint(
        { id: edge.id, points: dragPointsRef.current },
        pointIndex,
        snapped,
      );
      dragPointsRef.current = next;
      setDragPreview({ edgeId: edge.id, points: next });
    };

    const up = (ev: globalThis.PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      endLayoutEditGesture();
      if (dragEdgeIdRef.current) {
        onUpdateRoute(dragEdgeIdRef.current, dragPointsRef.current);
      }
      dragEdgeIdRef.current = null;
      setDragPreview(null);
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const startBondMidDrag = (edge: LayoutEdge, e: ReactPointerEvent<SVGCircleElement>) => {
    const rowIndex = edge.points.findIndex((p) => Math.abs(p.y - Math.max(...edge.points.map((pt) => pt.y))) < 0.5);
    startPointDrag(edge, rowIndex >= 0 ? rowIndex : 0, e);
  };

  return (
    <g className="tree-connections-editable">
      {active &&
        displayEdges.map((edge) => (
          <path
            key={`hit-${edge.id}`}
            d={pathD(edge, theme)}
            fill="none"
            stroke="transparent"
            strokeWidth={14}
            pointerEvents="stroke"
            className={edge.id === selectedEdgeId ? 'tree-edge-hit selected' : 'tree-edge-hit'}
            onClick={(e) => {
              e.stopPropagation();
              onSelectEdge(edge.id === selectedEdgeId ? null : edge.id, e.shiftKey);
            }}
          />
        ))}

      <PedigreeConnections
        edges={displayEdges}
        theme={theme}
        highlightEdgeId={selectedEdgeId}
        pointerEvents={active ? 'none' : 'auto'}
      />

      <MarriageBonds
        edges={displayEdges}
        theme={theme}
        project={project}
        marriageDateFormat={marriageDateFormat}
        highlightEdgeId={selectedEdgeId}
        interactive={!active}
        onUnionDoubleClick={onUnionDoubleClick}
      />

      {active && selectedEdge && (
        <>
          {selectedEdge.points.map((point, index) => {
            if (isLockedManualRoutePoint(selectedEdge.id, index, selectedEdge.points)) return null;
            return (
              <circle
                key={`${selectedEdge.id}-${index}`}
                cx={point.x}
                cy={point.y}
                r={5}
                className="tree-edge-handle"
                onPointerDown={(e) => startPointDrag(selectedEdge, index, e)}
              />
            );
          })}
          {bondMidHandle && (
            <circle
              key={`${selectedEdge.id}-mid`}
              cx={bondMidHandle.x}
              cy={bondMidHandle.y}
              r={5}
              className="tree-edge-handle tree-edge-handle--bond-mid"
              onPointerDown={(e) => startBondMidDrag(selectedEdge, e)}
            />
          )}
        </>
      )}
    </g>
  );
}
