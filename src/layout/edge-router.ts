import type { LayoutEdge, LayoutNode } from '../types';

interface RawEdge {
  id: string;
  from: LayoutNode;
  to: LayoutNode;
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

/** Bond anchors at inner bottom corners between partner cards. */
export function getCoupleBondGeometry(left: LayoutNode, right: LayoutNode) {
  const leftBottom = left.y + left.height;
  const rightBottom = right.y + right.height;
  const bondY = Math.max(leftBottom, rightBottom);
  const leftX = left.x + left.width;
  const rightX = right.x;
  return {
    bondY,
    leftBottom,
    rightBottom,
    leftX,
    rightX,
    midX: (leftX + rightX) / 2,
  };
}

export function routeCoupleBond(left: LayoutNode, right: LayoutNode): { x: number; y: number }[] {
  const { bondY, leftBottom, rightBottom, leftX, rightX } = getCoupleBondGeometry(left, right);
  const points: { x: number; y: number }[] = [];

  if (leftBottom < bondY - 0.01) {
    points.push({ x: leftX, y: leftBottom });
  }
  points.push({ x: leftX, y: bondY });
  points.push({ x: rightX, y: bondY });
  if (rightBottom < bondY - 0.01) {
    points.push({ x: rightX, y: rightBottom });
  }

  return points;
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

export function snapEdgeCoord(value: number): number {
  return Math.round(value * 2) / 2;
}

export function edgePath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

/** Single SVG path: vertical stem + horizontal bus + vertical drops to each child. */
export function pedigreeFamilyConnectorPath(
  trunk: { x: number; y: number }[],
  drops: { x: number; y: number }[][],
): string {
  if (trunk.length < 2) return '';
  let d = edgePath(trunk);
  for (const drop of drops) {
    if (drop.length >= 2) {
      d += ` M ${drop[0].x} ${drop[0].y}${drop.slice(1).map((p) => ` L ${p.x} ${p.y}`).join('')}`;
    }
  }
  return d;
}

/** Connects marriage bond center down to the family connector trunk. */
export function pedigreeFamilyConnectorPathWithBondStem(
  bondStemTop: { x: number; y: number },
  trunk: { x: number; y: number }[],
  drops: { x: number; y: number }[][],
): string {
  if (trunk.length < 2) return pedigreeFamilyConnectorPath(trunk, drops);
  if (Math.abs(bondStemTop.y - trunk[0].y) < 0.01) {
    return pedigreeFamilyConnectorPath(trunk, drops);
  }
  let d = edgePath([bondStemTop, trunk[0]]);
  for (let i = 1; i < trunk.length; i++) {
    d += ` L ${trunk[i].x} ${trunk[i].y}`;
  }
  for (const drop of drops) {
    if (drop.length >= 2) {
      d += ` M ${drop[0].x} ${drop[0].y}${drop.slice(1).map((p) => ` L ${p.x} ${p.y}`).join('')}`;
    }
  }
  return d;
}

/** Horizontal marriage line between partner card bottom centers. */
export function marriageBondHorizontalPath(
  leftBondX: number,
  rightBondX: number,
  bondY: number,
): string {
  return `M ${leftBondX} ${bondY} L ${rightBondX} ${bondY}`;
}

/** Vertical stem (below date label) + pedigree trunk and drops — renders above cards, under labels. */
export function pedigreeFamilyChildConnectorPath(
  midX: number,
  bondY: number,
  stemStartY: number,
  trunk: { x: number; y: number }[],
  drops: { x: number; y: number }[][],
): string {
  let d = '';
  if (Math.abs(stemStartY - bondY) > 0.01) {
    d = `M ${midX} ${bondY} L ${midX} ${stemStartY}`;
  }
  if (trunk.length >= 2) {
    if (d) d += ` M ${trunk[0].x} ${trunk[0].y}`;
    else d = `M ${trunk[0].x} ${trunk[0].y}`;
    for (let i = 1; i < trunk.length; i++) {
      d += ` L ${trunk[i].x} ${trunk[i].y}`;
    }
  }
  for (const drop of drops) {
    if (drop.length >= 2) {
      d += ` M ${drop[0].x} ${drop[0].y}${drop.slice(1).map((p) => ` L ${p.x} ${p.y}`).join('')}`;
    }
  }
  return d;
}

/** Vertical stem + branch continuation (fam-branch). */
export function pedigreeBranchChildConnectorPath(
  midX: number,
  bondY: number,
  stemStartY: number,
  branchPoints: { x: number; y: number }[],
): string {
  let d = '';
  if (Math.abs(stemStartY - bondY) > 0.01) {
    d = `M ${midX} ${bondY} L ${midX} ${stemStartY}`;
  }
  if (branchPoints.length >= 2) {
    if (d) d += ` M ${branchPoints[0].x} ${branchPoints[0].y}`;
    else d = `M ${branchPoints[0].x} ${branchPoints[0].y}`;
    for (let i = 1; i < branchPoints.length; i++) {
      d += ` L ${branchPoints[i].x} ${branchPoints[i].y}`;
    }
  }
  return d;
}

/** Full marriage horizontal + stem + pedigree trunk/drops (single path for hit testing). */
export function pedigreeFamilyConnectorPathWithMarriage(
  leftBondX: number,
  rightBondX: number,
  bondY: number,
  midX: number,
  stemStartY: number,
  trunk: { x: number; y: number }[],
  drops: { x: number; y: number }[][],
): string {
  const marriage = marriageBondHorizontalPath(leftBondX, rightBondX, bondY);
  const child = pedigreeFamilyChildConnectorPath(midX, bondY, stemStartY, trunk, drops);
  return child ? `${marriage} ${child}` : marriage;
}

/** Marriage horizontal + continuation through branch points (fam-branch). */
export function pedigreeBranchConnectorPathWithMarriage(
  leftBondX: number,
  rightBondX: number,
  bondY: number,
  midX: number,
  stemStartY: number,
  branchPoints: { x: number; y: number }[],
): string {
  const marriage = marriageBondHorizontalPath(leftBondX, rightBondX, bondY);
  const child = pedigreeBranchChildConnectorPath(midX, bondY, stemStartY, branchPoints);
  return child ? `${marriage} ${child}` : marriage;
}

export function famEdgeUnionId(edgeId: string, unionIds: Iterable<string>): string | null {
  if (edgeId.startsWith('fam-tree-')) {
    return edgeId.slice('fam-tree-'.length) || null;
  }
  if (edgeId.startsWith('fam-branch-')) {
    const rest = edgeId.slice('fam-branch-'.length);
    for (const unionId of unionIds) {
      if (rest.startsWith(`${unionId}-`)) return unionId;
    }
  }
  return null;
}

export function familyConnectorBusSpan(edge: { id: string; points: { x: number; y: number }[] }): number {
  if (edge.id.startsWith('fam-bus-')) {
    const xs = edge.points.map((p) => p.x);
    return Math.max(...xs) - Math.min(...xs);
  }
  if (edge.id.startsWith('fam-tree-') && edge.points.length >= 4) {
    return Math.abs(edge.points[3].x - edge.points[2].x);
  }
  return 0;
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
  return edgePath(points);
}
