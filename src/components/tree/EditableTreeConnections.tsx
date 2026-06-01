import { useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import type { LayoutEdge, Project, DateDisplayFormat } from '../../types';
import { branchPath, coupleBondPath, edgePath, isBondEdge } from '../../layout/edge-router';
import { CARD_GRID_CELL, snapToGridCorner } from '../../layout/card-dimensions';
import { constrainManualRoutePoint } from '../../layout/manual-edge-routes';
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

  const selectedEdge = useMemo(
    () => edges.find((e) => e.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  const startPointDrag = (
    edge: LayoutEdge,
    pointIndex: number,
    initialPoints: { x: number; y: number }[],
    e: ReactPointerEvent<SVGCircleElement>,
  ) => {
    if (!screenToLayout) return;
    e.preventDefault();
    e.stopPropagation();

    beginLayoutEditGesture();

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const move = (ev: globalThis.PointerEvent) => {
      const pt = screenToLayout(ev.clientX, ev.clientY);
      if (!pt) return;
      const snapped = snapToGridCorner(pt.x, pt.y, CARD_GRID_CELL);
      const next = constrainManualRoutePoint(
        { id: edge.id, points: initialPoints },
        pointIndex,
        snapped,
      );
      onUpdateRoute(edge.id, next);
    };

    const up = (ev: globalThis.PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      endLayoutEditGesture();
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  return (
    <g className="tree-connections-editable">
      {active &&
        edges.map((edge) => (
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
        edges={edges}
        theme={theme}
        highlightEdgeId={selectedEdgeId}
        pointerEvents={active ? 'none' : 'auto'}
      />

      <MarriageBonds
        edges={edges}
        theme={theme}
        project={project}
        marriageDateFormat={marriageDateFormat}
        highlightEdgeId={selectedEdgeId}
        interactive={!active}
        onUnionDoubleClick={onUnionDoubleClick}
      />

      {active &&
        selectedEdge?.points.map((point, index) => (
          <circle
            key={`${selectedEdge.id}-${index}`}
            cx={point.x}
            cy={point.y}
            r={5}
            className="tree-edge-handle"
            onPointerDown={(e) => startPointDrag(selectedEdge, index, selectedEdge.points, e)}
          />
        ))}
    </g>
  );
}
