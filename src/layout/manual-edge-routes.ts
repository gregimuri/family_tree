import type { LayoutEdge, LayoutResult, Project } from '../types';
import { formatMarriageDates } from '../models/person-utils';
import {
  famEdgeUnionId,
  isBondEdge,
  marriageStemStartY,
  parseBondUnionId,
  pedigreeBranchChildConnectorPath,
  pedigreeFamilyChildConnectorPath,
  snapEdgeCoord,
} from './edge-router';

type Point = { x: number; y: number };

function clonePoints(points: Point[]): Point[] {
  return points.map((p) => ({ ...p }));
}

function bondRowY(points: Point[]): number {
  return Math.max(...points.map((p) => p.y));
}

function mergeBondRoute(auto: Point[], manual: Point[]): Point[] {
  if (manual.length < 2 || auto.length < 2) return auto;
  const dy = bondRowY(manual) - bondRowY(auto);
  if (Math.abs(dy) < 0.01) return auto;
  return auto.map((p) => ({ x: p.x, y: snapEdgeCoord(p.y + dy) }));
}

function mergeFamTreeRoute(auto: Point[], manual: Point[]): Point[] {
  if (auto.length < 4 || auto.length !== manual.length) return auto;

  const forkDeltaY = manual[1].y - auto[1].y;
  const merged = auto.map((p) => ({ ...p }));

  merged[1].y = snapEdgeCoord(auto[1].y + forkDeltaY);
  merged[2].y = merged[1].y;
  merged[3].y = merged[1].y;
  merged[2].x = manual[2].x;
  merged[3].x = manual[3].x;

  for (let i = 4; i < merged.length; i += 2) {
    merged[i].y = merged[1].y;
    merged[i].x = manual[i].x;
    if (i + 1 < merged.length) {
      merged[i + 1] = { x: auto[i + 1].x, y: auto[i + 1].y };
    }
  }

  return merged;
}

function mergeBranchRoute(auto: Point[], manual: Point[]): Point[] {
  if (auto.length !== manual.length || auto.length < 2) return auto;

  if (auto.length === 3) {
    const forkDeltaY = manual[1].y - auto[1].y;
    return [
      { x: auto[0].x, y: auto[0].y },
      { x: auto[0].x, y: snapEdgeCoord(auto[1].y + forkDeltaY) },
      { ...auto[2] },
    ];
  }

  const merged = manual.map((p) => ({ ...p }));
  merged[0] = { x: auto[0].x, y: auto[0].y };
  merged[1].x = auto[0].x;

  if (merged.length >= 3) {
    merged[merged.length - 1] = { ...auto[auto.length - 1] };
    if (merged.length >= 4) {
      merged[2].y = manual[2].y;
      merged[3].x = merged[2].x;
    }
  }

  return merged;
}

function mergeManualRoute(edge: LayoutEdge, manual: Point[]): Point[] {
  const auto = edge.points;
  if (manual.length < 2) return auto;

  if (isBondEdge(edge.id)) return mergeBondRoute(auto, manual);
  if (edge.id.startsWith('fam-tree-')) return mergeFamTreeRoute(auto, manual);
  if (edge.id.startsWith('fam-branch-')) return mergeBranchRoute(auto, manual);

  if (auto.length !== manual.length) return auto;
  const merged = manual.map((p) => ({ ...p }));
  merged[0] = { ...auto[0] };
  merged[merged.length - 1] = { ...auto[merged.length - 1] };
  return merged;
}

interface BondRouteContext {
  midX: number;
  bondY: number;
  stemStartY: number;
}

function bondRouteContext(bondEdge: LayoutEdge, project: Project): BondRouteContext {
  const unionId = parseBondUnionId(bondEdge.id);
  const bondY = bondRowY(bondEdge.points);
  const rowPoints = bondEdge.points.filter((p) => Math.abs(p.y - bondY) < 0.5);
  const xs = rowPoints.map((p) => p.x);
  const leftBondX = Math.min(...xs);
  const rightBondX = Math.max(...xs);
  const midX = snapEdgeCoord((leftBondX + rightBondX) / 2);

  let showLabel = false;
  if (unionId) {
    const union = project.unions[unionId];
    const marriageFormat = project.viewSettings.cardFields.marriageDateFormat;
    showLabel =
      marriageFormat !== 'hidden' && !!union && !!formatMarriageDates(union, marriageFormat);
  }

  return {
    midX,
    bondY,
    stemStartY: marriageStemStartY(bondY, showLabel),
  };
}

function rebuildFamTreePathD(points: Point[], bond?: BondRouteContext): string {
  if (points.length < 4) return '';
  const trunk = points.slice(0, 4);
  const drops: Point[][] = [];
  for (let i = 4; i + 1 < points.length; i += 2) {
    drops.push([points[i], points[i + 1]]);
  }

  if (bond) {
    const syncedTrunk = trunk.map((p, i) =>
      i === 0 ? { x: p.x, y: snapEdgeCoord(bond.stemStartY) } : p,
    );
    return pedigreeFamilyChildConnectorPath(
      bond.midX,
      bond.bondY,
      bond.stemStartY,
      syncedTrunk,
      drops,
    );
  }

  return pedigreeFamilyChildConnectorPath(
    trunk[0].x,
    trunk[0].y,
    trunk[0].y,
    trunk,
    drops,
  );
}

function rebuildFamBranchPathD(points: Point[], bond?: BondRouteContext): string {
  if (points.length < 2 || !bond) return '';
  return pedigreeBranchChildConnectorPath(bond.midX, bond.bondY, bond.stemStartY, points.slice(1));
}

export function rebuildEdgePathD(
  edgeId: string,
  points: Point[],
  bond?: BondRouteContext,
): string | undefined {
  if (edgeId.startsWith('fam-tree-') && points.length >= 4) {
    return rebuildFamTreePathD(points, bond);
  }
  if (edgeId.startsWith('fam-branch-') && points.length >= 2) {
    return rebuildFamBranchPathD(points, bond);
  }
  return undefined;
}

export function recomputeEdgePaths(edges: LayoutEdge[], project: Project): LayoutEdge[] {
  const bondByUnion = new Map<string, LayoutEdge>();
  for (const edge of edges) {
    const unionId = parseBondUnionId(edge.id);
    if (unionId) bondByUnion.set(unionId, edge);
  }

  return edges.map((edge) => {
    const unionId = famEdgeUnionId(edge.id, bondByUnion.keys());
    const bondEdge = unionId ? bondByUnion.get(unionId) : undefined;
    const bond = bondEdge ? bondRouteContext(bondEdge, project) : undefined;

    if (edge.id.startsWith('fam-tree-') && bond && edge.points.length >= 4) {
      const points = edge.points.map((p, i) =>
        i === 0 ? { x: p.x, y: snapEdgeCoord(bond.stemStartY) } : p,
      );
      const pathD = rebuildFamTreePathD(points, bond);
      return { ...edge, points, pathD };
    }

    if (edge.id.startsWith('fam-branch-') && bond) {
      const pathD = rebuildFamBranchPathD(edge.points, bond);
      return pathD ? { ...edge, pathD } : edge;
    }

    const pathD = rebuildEdgePathD(edge.id, edge.points, bond);
    if (pathD) return { ...edge, pathD };
    return edge;
  });
}

export function applyManualEdgeRoutes(layout: LayoutResult, project: Project): LayoutResult {
  const manual = project.manualEdgeRoutes;
  if (!manual || Object.keys(manual).length === 0) return layout;

  const mergedEdges = layout.edges.map((edge) => {
    const override = manual[edge.id];
    if (!override || override.length < 2) return edge;
    const points = mergeManualRoute(edge, override);
    return { ...edge, points };
  });

  const edges = recomputeEdgePaths(mergedEdges, project);

  return { ...layout, edges };
}

export function previewEdgeRoutes(
  edges: LayoutEdge[],
  edgeId: string,
  points: Point[],
  project: Project,
): LayoutEdge[] {
  const patched = edges.map((edge) =>
    edge.id === edgeId ? { ...edge, points: clonePoints(points) } : edge,
  );
  return recomputeEdgePaths(patched, project);
}

/** Route points that stay fixed to cards or marriage anchors while editing. */
export function isLockedManualRoutePoint(
  edgeId: string,
  pointIndex: number,
  points: Point[],
): boolean {
  if (pointIndex < 0 || pointIndex >= points.length) return true;

  if (isBondEdge(edgeId)) {
    const rowY = bondRowY(points);
    const onBondRow = Math.abs(points[pointIndex].y - rowY) < 0.5;
    return !onBondRow;
  }

  if (edgeId.startsWith('fam-tree-')) {
    if (pointIndex === 0) return true;
    if (pointIndex >= 5 && pointIndex % 2 === 1) return true;
    return false;
  }

  if (edgeId.startsWith('fam-branch-')) {
    if (pointIndex === 0) return true;
    if (pointIndex === points.length - 1) return true;
    return false;
  }

  if (pointIndex === 0 || pointIndex === points.length - 1) return true;
  return false;
}

function constrainFamTreePoint(points: Point[], index: number, snapped: Point): Point[] {
  const next = clonePoints(points);
  const forkY = () => next[1].y;

  if (index === 0) {
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
    return next;
  }

  return next;
}

function constrainBranchPoint(points: Point[], index: number, snapped: Point): Point[] {
  const next = clonePoints(points);
  if (next.length === 2) {
    return next;
  }

  if (next.length === 3) {
    if (index === 0 || index === 2) return next;
    if (index === 1) {
      next[1] = { x: next[0].x, y: snapEdgeCoord(snapped.y) };
      return next;
    }
  }

  if (next.length === 4) {
    if (index === 0) {
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
      return next;
    }
  }

  return constrainManhattanPoint(next, index, snapped);
}

function constrainManhattanPoint(points: Point[], index: number, snapped: Point): Point[] {
  const next = clonePoints(points);
  const n = next.length;
  if (n <= 1) return next;

  if (index === 0 || index === n - 1) return next;

  if (n === 4) {
    if (index === 0 || index === 3) return next;
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
    const dy = snapped.y - points[index].y;
    return [
      { x: points[0].x, y: snapEdgeCoord(points[0].y + dy) },
      { x: points[1].x, y: snapEdgeCoord(points[1].y + dy) },
    ];
  }

  const rowY = bondRowY(points);
  const onBondRow = Math.abs(points[index].y - rowY) < 0.5;

  if (onBondRow) {
    const dy = snapped.y - rowY;
    for (let i = 0; i < next.length; i++) {
      if (Math.abs(points[i].y - rowY) < 0.5) {
        next[i] = { x: points[i].x, y: snapEdgeCoord(points[i].y + dy) };
      }
    }
    return next;
  }

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
  if (isLockedManualRoutePoint(id, pointIndex, points)) return clonePoints(points);

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
