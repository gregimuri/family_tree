import type { LayoutEdge, LayoutResult, Project } from '../types';
import { pedigreeFamilyConnectorPath, snapEdgeCoord } from './edge-router';

type Point = { x: number; y: number };

function clonePoints(points: Point[]): Point[] {
  return points.map((p) => ({ ...p }));
}

function rebuildFamTreePathD(points: Point[]): string {
  if (points.length < 4) return '';
  const trunk = points.slice(0, 4);
  const drops: Point[][] = [];
  for (let i = 4; i + 1 < points.length; i += 2) {
    drops.push([points[i], points[i + 1]]);
  }
  return pedigreeFamilyConnectorPath(trunk, drops);
}

export function rebuildEdgePathD(edgeId: string, points: Point[]): string | undefined {
  if (edgeId.startsWith('fam-tree-') && points.length >= 4) {
    return rebuildFamTreePathD(points);
  }
  return undefined;
}

export function applyManualEdgeRoutes(layout: LayoutResult, project: Project): LayoutResult {
  const manual = project.manualEdgeRoutes;
  if (!manual || Object.keys(manual).length === 0) return layout;

  const edges = layout.edges.map((edge) => {
    const override = manual[edge.id];
    if (!override || override.length < 2) return edge;
    const points = override.map((p) => ({ ...p }));
    const pathD = rebuildEdgePathD(edge.id, points);
    return { ...edge, points, pathD: pathD ?? undefined };
  });

  return { ...layout, edges };
}

function constrainFamTreePoint(points: Point[], index: number, snapped: Point): Point[] {
  const next = clonePoints(points);
  const forkY = () => next[1].y;

  if (index === 0) {
    next[0] = snapped;
    next[1].x = snapped.x;
    return next;
  }

  if (index === 1) {
    next[1] = snapped;
    next[0].x = snapped.x;
    for (let i = 2; i < next.length; i++) {
      if (i <= 3 || i % 2 === 0) next[i].y = snapped.y;
    }
    return next;
  }

  if (index === 2) {
    next[2] = { x: snapped.x, y: forkY() };
    return next;
  }

  if (index === 3) {
    next[3] = { x: snapped.x, y: forkY() };
    return next;
  }

  if (index >= 4 && index % 2 === 0) {
    const y = forkY();
    next[index] = { x: snapped.x, y };
    if (index + 1 < next.length) next[index + 1].x = snapped.x;
    return next;
  }

  if (index >= 4 && index % 2 === 1) {
    next[index] = { x: next[index - 1].x, y: snapped.y };
    return next;
  }

  return next;
}

function constrainBranchPoint(points: Point[], index: number, snapped: Point): Point[] {
  const next = clonePoints(points);
  if (next.length === 2) {
    next[index] = snapped;
    return next;
  }

  if (next.length === 4) {
    if (index === 0) {
      next[0] = snapped;
      next[1].x = snapped.x;
      return next;
    }
    if (index === 1) {
      next[1] = snapped;
      next[0].x = snapped.x;
      next[2].y = snapped.y;
      return next;
    }
    if (index === 2) {
      next[2] = { x: snapped.x, y: next[1].y };
      next[3].x = snapped.x;
      return next;
    }
    if (index === 3) {
      next[3] = { x: next[2].x, y: snapped.y };
      return next;
    }
  }

  return constrainManhattanPoint(next, index, snapped);
}

function constrainManhattanPoint(points: Point[], index: number, snapped: Point): Point[] {
  const next = clonePoints(points);
  const n = next.length;
  if (n <= 1) return next;

  if (n === 2) {
    next[index] = snapped;
    return next;
  }

  if (n === 4) {
    if (index === 0) {
      next[0] = snapped;
      next[1].x = snapped.x;
      return next;
    }
    if (index === 1) {
      next[1] = { x: next[0].x, y: snapped.y };
      next[2].y = snapped.y;
      return next;
    }
    if (index === 2) {
      next[2] = { x: snapped.x, y: next[1].y };
      next[3].x = snapped.x;
      return next;
    }
    if (index === 3) {
      next[3] = { x: next[2].x, y: snapped.y };
      return next;
    }
  }

  next[index] = snapped;
  const prev = index > 0 ? next[index - 1] : null;
  const after = index < n - 1 ? next[index + 1] : null;
  if (prev && after) {
    const horizontal = Math.abs(prev.x - after.x) > Math.abs(prev.y - after.y);
    if (horizontal) next[index].y = prev.y;
    else next[index].x = prev.x;
  } else if (prev) {
    const horizontalLeg = prev.x !== next[index].x && prev.y === next[index].y;
    if (horizontalLeg) next[index].y = prev.y;
    else next[index].x = prev.x;
  } else if (after) {
    const horizontalLeg = after.x !== next[index].x && after.y === next[index].y;
    if (horizontalLeg) next[index].y = after.y;
    else next[index].x = after.x;
  }
  return next;
}

function constrainBondPoint(points: Point[], index: number, snapped: Point): Point[] {
  const next = clonePoints(points);

  if (points.length === 2) {
    if (index === 0) {
      next[0] = { x: snapped.x, y: snapped.y };
      next[1].y = snapped.y;
    } else {
      next[1] = { x: snapped.x, y: snapped.y };
      next[0].y = snapped.y;
    }
    return next[0].x <= next[1].x ? next : [next[1], next[0]];
  }

  const bondRowY = Math.max(...points.map((p) => p.y));
  const onBondRow = Math.abs(points[index].y - bondRowY) < 0.5;

  if (onBondRow) {
    const dy = snapped.y - bondRowY;
    for (let i = 0; i < next.length; i++) {
      if (Math.abs(points[i].y - bondRowY) < 0.5) {
        next[i].y = points[i].y + dy;
      }
    }
    next[index].x = snapped.x;
    return next;
  }

  next[index] = snapped;
  return next;
}

/** Keeps orthogonal pedigree / bond routes connected while dragging a handle. */
export function constrainManualRoutePoint(
  edge: Pick<LayoutEdge, 'id' | 'points'>,
  pointIndex: number,
  snapped: Point,
): Point[] {
  const pos = { x: snapEdgeCoord(snapped.x), y: snapEdgeCoord(snapped.y) };
  const { id, points } = edge;
  if (pointIndex < 0 || pointIndex >= points.length) return clonePoints(points);

  if (id.startsWith('fam-tree-')) {
    return constrainFamTreePoint(points, pointIndex, pos);
  }
  if (id.startsWith('fam-branch-') || id.startsWith('fam-')) {
    return constrainBranchPoint(points, pointIndex, pos);
  }
  if (id.startsWith('bond@') || id.startsWith('bond-')) {
    return constrainBondPoint(points, pointIndex, pos);
  }
  return constrainManhattanPoint(points, pointIndex, pos);
}
