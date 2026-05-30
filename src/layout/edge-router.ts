import type { LayoutEdge, LayoutNode } from '../types';

interface RawEdge {
  id: string;
  from: LayoutNode;
  to: LayoutNode;
}

export function routeCoupleBond(left: LayoutNode, right: LayoutNode): { x: number; y: number }[] {
  const leftBottom = left.y + left.height;
  const rightBottom = right.y + right.height;
  return [
    { x: left.x + left.width, y: leftBottom },
    { x: right.x, y: rightBottom },
  ];
}

/** Union id from edge id `bond@{uuid}` (legacy: `bond-{uuid}-{layer}` with layer ≥ 0). */
export function parseBondUnionId(bondEdgeId: string): string | null {
  if (bondEdgeId.startsWith('bond@')) {
    return bondEdgeId.slice('bond@'.length) || null;
  }
  if (!bondEdgeId.startsWith('bond-')) return null;
  const rest = bondEdgeId.slice('bond-'.length);
  const legacyMatch = rest.match(/^(.+)-(\d+)$/);
  if (legacyMatch) return legacyMatch[1];
  return rest || null;
}

export function bondEdgeId(unionId: string): string {
  return `bond@${unionId}`;
}

export function isBondEdge(edgeId: string): boolean {
  return edgeId.startsWith('bond@') || edgeId.startsWith('bond-');
}

export function coupleBondMidpoint(points: { x: number; y: number }[]): { x: number; y: number } | null {
  if (points.length < 2) return null;
  const start = points[0];
  const end = points[points.length - 1];
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

/** Marriage date label sits below the horizontal bond line. */
export const MARRIAGE_BOND_LABEL_HEIGHT = 14;
export const MARRIAGE_BOND_LABEL_GAP = 4;
export const MARRIAGE_STEM_GAP = 4;

export function marriageLabelTopY(bondY: number): number {
  return bondY + MARRIAGE_BOND_LABEL_GAP;
}

export function marriageStemStartY(bondY: number, showLabel: boolean): number {
  if (!showLabel) return bondY;
  return bondY + MARRIAGE_BOND_LABEL_GAP + MARRIAGE_BOND_LABEL_HEIGHT + MARRIAGE_STEM_GAP;
}

export function routeEdges(rawEdges: RawEdge[]): LayoutEdge[] {
  return rawEdges.map(({ id, from, to }) => {
    const childBelow = from.y < to.y;
    const x1 = from.x + from.width / 2;
    const y1 = from.y + (childBelow ? from.height : 0);
    const x2 = to.x + to.width / 2;
    const y2 = to.y + (childBelow ? 0 : to.height);
    const midY = (y1 + y2) / 2;

    const points =
      Math.abs(x1 - x2) < 4
        ? [
            { x: x1, y: y1 },
            { x: x2, y: y2 },
          ]
        : [
            { x: x1, y: y1 },
            { x: x1, y: midY },
            { x: x2, y: midY },
            { x: x2, y: y2 },
          ];

    return { id, from: from.id, to: to.id, points };
  });
}

export function edgePath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

export function branchPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  const [start, ...rest] = points;
  if (rest.length === 1) {
    const end = rest[0];
    const cx = (start.x + end.x) / 2;
    return `M ${start.x} ${start.y} Q ${cx} ${start.y} ${end.x} ${end.y}`;
  }
  let d = `M ${start.x} ${start.y}`;
  for (let i = 0; i < rest.length; i++) {
    const p = rest[i];
    const prev = i === 0 ? start : rest[i - 1];
    const cx = (prev.x + p.x) / 2;
    d += ` Q ${cx} ${prev.y} ${p.x} ${p.y}`;
  }
  return d;
}

export function coupleBondPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  const [a, b] = points;
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}
