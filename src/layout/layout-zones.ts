import type { LayoutNode, Project } from '../types';
import type { GraphNode, GraphResult } from './graph-builder';
import { COUPLE_GAP, GROUP_GAP } from './graph-builder';

type PersonGraphNode = Extract<GraphNode, { kind: 'person' }>;

const SIBLING_GAP = 24;
const SIDE_BRANCH_GAP = 96;
const MAIN_SIDE_GAP = 88;

function nodeRight(node: LayoutNode): number {
  return node.x + node.width;
}

function graphNodeById(graph: GraphResult): Map<string, PersonGraphNode> {
  const map = new Map<string, PersonGraphNode>();
  for (const node of graph.nodes) {
    if (node.kind === 'person') map.set(node.id, node);
  }
  return map;
}

function minGapBetween(left: PersonGraphNode, right: PersonGraphNode): number {
  if (left.unionId && left.unionId === right.unionId && left.layer === right.layer) {
    return COUPLE_GAP;
  }
  if (
    left.parentUnionId &&
    left.parentUnionId === right.parentUnionId &&
    left.layer === right.layer
  ) {
    return SIBLING_GAP;
  }
  const leftSide = left.isSideBranch;
  const rightSide = right.isSideBranch;
  if (leftSide !== rightSide) return MAIN_SIDE_GAP;
  if (leftSide || rightSide) return SIDE_BRANCH_GAP;
  return GROUP_GAP;
}

/** Связанные на слое узлы (пара или группа siblings) — сдвигаются вместе. */
function collectSameLayerUnit(
  seedId: string,
  layer: number,
  graphById: Map<string, PersonGraphNode>,
  byGraphId: Map<string, LayoutNode>,
): Set<string> {
  const gn = graphById.get(seedId);
  const ln = byGraphId.get(seedId);
  if (!gn || !ln) return new Set();

  const unit = new Set<string>([seedId]);
  if (gn.unionId) {
    for (const node of graphById.values()) {
      if (node.layer === layer && node.unionId === gn.unionId) {
        unit.add(node.id);
      }
    }
  }
  if (gn.parentUnionId) {
    for (const node of graphById.values()) {
      if (
        node.layer === layer &&
        node.parentUnionId === gn.parentUnionId &&
        node.isSideBranch === gn.isSideBranch
      ) {
        unit.add(node.id);
      }
    }
  }
  return unit;
}

function shiftUnit(
  unitIds: Set<string>,
  delta: number,
  byGraphId: Map<string, LayoutNode>,
  pinnedPersonIds?: ReadonlySet<string>,
): void {
  if (Math.abs(delta) < 0.01) return;
  for (const id of unitIds) {
    const node = byGraphId.get(id);
    if (!node) continue;
    if (node.personId && pinnedPersonIds?.has(node.personId)) continue;
    node.x += delta;
  }
}

function layerMainBBox(
  layerNodes: LayoutNode[],
  graphById: Map<string, PersonGraphNode>,
): { minX: number; maxX: number } | null {
  const main = layerNodes.filter((n) => !graphById.get(n.id)?.isSideBranch);
  if (main.length === 0) return null;
  return {
    minX: Math.min(...main.map((n) => n.x)),
    maxX: Math.max(...main.map((n) => nodeRight(n))),
  };
}

/** Разносит боковые ветки за пределы «коридора» основной линии на каждом слое. */
export function enforceSideBranchCorridors(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
  pinnedPersonIds?: ReadonlySet<string>,
): void {
  const graphById = graphNodeById(graph);
  const byGraphId = new Map(nodes.map((n) => [n.id, n]));
  const byLayer = new Map<number, LayoutNode[]>();

  for (const node of nodes) {
    const list = byLayer.get(node.layer) ?? [];
    list.push(node);
    byLayer.set(node.layer, list);
  }

  for (const [layer, layerNodes] of byLayer) {
    const mainBBox = layerMainBBox(layerNodes, graphById);
    if (!mainBBox) continue;

    const leftUnits = new Map<string, Set<string>>();
    const rightUnits = new Map<string, Set<string>>();

    for (const node of layerNodes) {
      const gn = graphById.get(node.id);
      if (!gn?.isSideBranch) continue;
      const unit = collectSameLayerUnit(node.id, layer, graphById, byGraphId);
      const key = [...unit].sort().join('|');
      if (gn.branchSide === 'left') leftUnits.set(key, unit);
      else if (gn.branchSide === 'right') rightUnits.set(key, unit);
    }

    const unitBBox = (unit: Set<string>) => {
      const members = [...unit].map((id) => byGraphId.get(id)!).filter(Boolean);
      return {
        minX: Math.min(...members.map((n) => n.x)),
        maxX: Math.max(...members.map((n) => nodeRight(n))),
        width: Math.max(...members.map((n) => nodeRight(n))) - Math.min(...members.map((n) => n.x)),
      };
    };

    let leftEdge = mainBBox.minX - MAIN_SIDE_GAP;
    const leftSorted = [...leftUnits.values()].sort((a, b) => {
      const ax = Math.max(...[...a].map((id) => byGraphId.get(id)!.x));
      const bx = Math.max(...[...b].map((id) => byGraphId.get(id)!.x));
      return bx - ax;
    });
    for (const unit of leftSorted) {
      const box = unitBBox(unit);
      const targetMaxX = leftEdge;
      const delta = targetMaxX - box.maxX;
      if (delta < -0.5) shiftUnit(unit, delta, byGraphId, pinnedPersonIds);
      leftEdge = Math.min(...[...unit].map((id) => byGraphId.get(id)!.x)) - SIDE_BRANCH_GAP;
    }

    let rightEdge = mainBBox.maxX + MAIN_SIDE_GAP;
    const rightSorted = [...rightUnits.values()].sort((a, b) => {
      const ax = Math.min(...[...a].map((id) => byGraphId.get(id)!.x));
      const bx = Math.min(...[...b].map((id) => byGraphId.get(id)!.x));
      return ax - bx;
    });
    for (const unit of rightSorted) {
      const box = unitBBox(unit);
      const targetMinX = rightEdge;
      const delta = targetMinX - box.minX;
      if (delta > 0.5) shiftUnit(unit, delta, byGraphId, pinnedPersonIds);
      rightEdge = Math.max(...[...unit].map((id) => nodeRight(byGraphId.get(id)!))) + SIDE_BRANCH_GAP;
    }
  }

  void project;
}

function rectsOverlapHorizontally(a: LayoutNode, b: LayoutNode, gap: number): boolean {
  return a.x < nodeRight(b) + gap && nodeRight(a) + gap > b.x;
}

/** Локальное отталкивание (force-directed lite): устраняет остаточные наложения на слое. */
export function applyLayerRepulsion(
  nodes: LayoutNode[],
  graph: GraphResult,
  pinnedPersonIds?: ReadonlySet<string>,
): boolean {
  const graphById = graphNodeById(graph);
  const byGraphId = new Map(nodes.map((n) => [n.id, n]));
  const byLayer = new Map<number, LayoutNode[]>();
  let anyMoved = false;

  for (const node of nodes) {
    const list = byLayer.get(node.layer) ?? [];
    list.push(node);
    byLayer.set(node.layer, list);
  }

  for (const [layer, layerNodes] of byLayer) {
    const sorted = [...layerNodes].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        const ga = graphById.get(a.id)!;
        const gb = graphById.get(b.id)!;
        const gap = minGapBetween(ga, gb);
        if (!rectsOverlapHorizontally(a, b, gap)) continue;

        const overlap = nodeRight(a) + gap - b.x;
        if (overlap <= 0) continue;

        const aPinned = a.personId ? pinnedPersonIds?.has(a.personId) : false;
        const bPinned = b.personId ? pinnedPersonIds?.has(b.personId) : false;
        const aMain = !ga.isSideBranch;
        const bMain = !gb.isSideBranch;

        let moveA: number;
        let moveB: number;

        if (aPinned && !bPinned) {
          moveA = 0;
          moveB = overlap;
        } else if (!aPinned && bPinned) {
          moveA = -overlap;
          moveB = 0;
        } else if (aMain && !bMain) {
          moveA = 0;
          moveB = overlap;
        } else if (!aMain && bMain) {
          moveA = -overlap;
          moveB = 0;
        } else {
          moveA = -overlap / 2;
          moveB = overlap / 2;
        }

        const unitA = collectSameLayerUnit(a.id, layer, graphById, byGraphId);
        const unitB = collectSameLayerUnit(b.id, layer, graphById, byGraphId);

        if (Math.abs(moveA) > 0.01) {
          shiftUnit(unitA, moveA, byGraphId, pinnedPersonIds);
          anyMoved = true;
        }
        if (Math.abs(moveB) > 0.01) {
          shiftUnit(unitB, moveB, byGraphId, pinnedPersonIds);
          anyMoved = true;
        }
      }
    }
  }

  return anyMoved;
}

export function findLayerHorizontalOverlap(
  nodes: LayoutNode[],
  minGap = 2,
): { a: string; b: string } | null {
  const byLayer = new Map<number, LayoutNode[]>();
  for (const n of nodes) {
    const list = byLayer.get(n.layer) ?? [];
    list.push(n);
    byLayer.set(n.layer, list);
  }
  for (const layerNodes of byLayer.values()) {
    const sorted = [...layerNodes].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (curr.x < nodeRight(prev) + minGap) {
        return { a: prev.personId ?? prev.id, b: curr.personId ?? curr.id };
      }
    }
  }
  return null;
}

/** Итеративно устраняет горизонтальные наложения: коридоры + отталкивание. */
export function resolveOverlapsUntilClean(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
  pinnedPersonIds?: ReadonlySet<string>,
  maxPasses = 12,
): void {
  for (let pass = 0; pass < maxPasses; pass++) {
    enforceSideBranchCorridors(nodes, graph, project, pinnedPersonIds);
    applyLayerRepulsion(nodes, graph, pinnedPersonIds);
    if (!findLayerHorizontalOverlap(nodes, 2)) break;
  }
}

export { MAIN_SIDE_GAP, SIDE_BRANCH_GAP, SIBLING_GAP };
