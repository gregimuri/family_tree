import { useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import type { LayoutEdge, Project } from '../../types';
import { branchPath, coupleBondPath, edgePath } from '../../layout/edge-router';
import { CARD_GRID_CELL, snapTopLeftToGrid } from '../../layout/card-dimensions';
import { TreeConnections } from './TreeConnections';

interface EditableTreeConnectionsProps {
  edges: LayoutEdge[];
  theme: 'clean' | 'forest';
  project: Project;
  showMarriageYears: boolean;
  active: boolean;
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string | null) => void;
  onUpdateRoute: (edgeId: string, points: { x: number; y: number }[]) => void;
  screenToLayout?: (clientX: number, clientY: number) => { x: number; y: number } | null;
}

function pathD(edge: LayoutEdge, theme: 'clean' | 'forest'): string {
  const isBond = edge.id.startsWith('bond-');
  const isPedigree = edge.id.startsWith('fam-');
  if (isBond) return coupleBondPath(edge.points);
  return isPedigree || theme === 'clean' ? edgePath(edge.points) : branchPath(edge.points);
}

export function EditableTreeConnections({
  edges,
  theme,
  project,
  showMarriageYears,
  active,
  selectedEdgeId,
  onSelectEdge,
  onUpdateRoute,
  screenToLayout,
}: EditableTreeConnectionsProps) {
  const selectedEdge = useMemo(
    () => edges.find((e) => e.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  const startPointDrag = (
    edgeId: string,
    pointIndex: number,
    initialPoints: { x: number; y: number }[],
    e: ReactPointerEvent<SVGCircleElement>,
  ) => {
    if (!screenToLayout) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const move = (ev: globalThis.PointerEvent) => {
      const pt = screenToLayout(ev.clientX, ev.clientY);
      if (!pt) return;
      const grid = CARD_GRID_CELL;
      const x = snapTopLeftToGrid(pt.x, grid) + grid / 2;
      const y = snapTopLeftToGrid(pt.y, grid) + grid / 2;
      const next = initialPoints.map((p, i) => (i === pointIndex ? { x, y } : { ...p }));
      onUpdateRoute(edgeId, next);
    };

    const up = (ev: globalThis.PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
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
              onSelectEdge(edge.id === selectedEdgeId ? null : edge.id);
            }}
          />
        ))}

      <TreeConnections
        edges={edges}
        theme={theme}
        project={project}
        showMarriageYears={showMarriageYears}
        highlightEdgeId={selectedEdgeId}
      />

      {active &&
        selectedEdge?.points.map((point, index) => (
          <circle
            key={`${selectedEdge.id}-${index}`}
            cx={point.x}
            cy={point.y}
            r={5}
            className="tree-edge-handle"
            onPointerDown={(e) => startPointDrag(selectedEdge.id, index, selectedEdge.points, e)}
          />
        ))}
    </g>
  );
}
