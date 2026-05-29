import type { Project } from '../types';
import type { GraphNode, GraphResult } from './graph-builder';
import {
  CARD_H,
  CARD_W,
  COUPLE_GAP,
  LAYER_GAP,
  getCardScale,
} from './graph-builder';

type GraphPersonNode = Extract<GraphNode, { kind: 'person' }>;

/** Расстояния между группами на слое */
const SIBLING_GAP = 24;
const GROUP_GAP = 64;
const SIDE_BRANCH_GAP = 96;
const MAIN_SIDE_GAP = 88;

const MAX_ITERATIONS = 48;
const CONVERGENCE_EPS = 0.4;
const PARENT_ALIGN_PASSES = 8;
const CROSSING_SWAP_ROUNDS = 6;

/** Порог «крупного» древа: ниже — строже генеалогические правила */
const LARGE_TREE_NODES = 14;

export interface LayoutUnit {
  ids: string[];
  sortKey: number;
  siblingGroup: boolean;
  parentUnionId?: string;
  isSideBranch: boolean;
}

function nodeSize(scale: number): { w: number; h: number } {
  return { w: CARD_W * scale, h: CARD_H * scale };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function isLargeTree(graph: GraphResult): boolean {
  return graph.nodes.filter((n) => n.kind === 'person').length >= LARGE_TREE_NODES;
}

/** Мужчина слева, женщина справа в паре */
function sortPartnersInUnit(nodes: GraphPersonNode[], project: Project): GraphPersonNode[] {
  return [...nodes].sort((a, b) => {
    const pa = project.persons[a.personId];
    const pb = project.persons[b.personId];
    if (pa?.gender === 'male' && pb?.gender !== 'male') return -1;
    if (pb?.gender === 'male' && pa?.gender !== 'male') return 1;
    return 0;
  });
}

function unitIsSideBranch(unit: LayoutUnit): boolean {
  return unit.isSideBranch;
}

function nodeFromLayer(layerNodes: GraphNode[], id: string): GraphPersonNode {
  return layerNodes.find((n) => n.id === id) as GraphPersonNode;
}

/** Собрать блоки слоя: пары, группы сiblings, одиночные персоны */
export function buildLayoutUnits(layerNodes: GraphNode[], project: Project): LayoutUnit[] {
  const persons = layerNodes.filter((n): n is GraphPersonNode => n.kind === 'person');
  const used = new Set<string>();
  const units: LayoutUnit[] = [];

  const sideOf = (nodes: GraphPersonNode[]) => nodes.some((n) => n.isSideBranch);

  const byUnion = new Map<string, GraphPersonNode[]>();
  for (const node of persons) {
    if (!node.unionId) continue;
    const list = byUnion.get(node.unionId) ?? [];
    list.push(node);
    byUnion.set(node.unionId, list);
  }

  for (const members of byUnion.values()) {
    if (members.length < 2) continue;
    const sorted = sortPartnersInUnit(members, project);
    sorted.forEach((m) => used.add(m.id));
    units.push({
      ids: sorted.map((m) => m.id),
      sortKey: Math.min(...sorted.map((m) => m.birthOrder ?? Number.MAX_SAFE_INTEGER)),
      siblingGroup: false,
      isSideBranch: sideOf(sorted),
    });
  }

  const byParentUnion = new Map<string, GraphPersonNode[]>();
  for (const node of persons) {
    if (used.has(node.id) || !node.parentUnionId) continue;
    const list = byParentUnion.get(node.parentUnionId) ?? [];
    list.push(node);
    byParentUnion.set(node.parentUnionId, list);
  }

  for (const [parentUnionId, members] of byParentUnion) {
    const sorted = [...members].sort(
      (a, b) => (a.birthOrder ?? Number.MAX_SAFE_INTEGER) - (b.birthOrder ?? Number.MAX_SAFE_INTEGER),
    );
    sorted.forEach((m) => used.add(m.id));
    units.push({
      ids: sorted.map((m) => m.id),
      sortKey: sorted[0].birthOrder ?? Number.MAX_SAFE_INTEGER,
      siblingGroup: true,
      parentUnionId,
      isSideBranch: sideOf(sorted),
    });
  }

  for (const node of persons) {
    if (used.has(node.id)) continue;
    units.push({
      ids: [node.id],
      sortKey: node.birthOrder ?? Number.MAX_SAFE_INTEGER,
      siblingGroup: false,
      parentUnionId: node.parentUnionId,
      isSideBranch: node.isSideBranch,
    });
  }

  units.sort((a, b) => a.sortKey - b.sortKey || a.ids[0].localeCompare(b.ids[0]));
  return units;
}

function unitWidth(unit: LayoutUnit, layerNodes: GraphNode[], settings: Project['viewSettings']): number {
  if (unit.ids.length === 1) {
    const node = nodeFromLayer(layerNodes, unit.ids[0]);
    const scale = getCardScale(node.layer, node.isSideBranch, node.branchDepth, settings.cardSizeMode);
    return CARD_W * scale;
  }

  if (unit.siblingGroup) {
    let total = 0;
    for (let i = 0; i < unit.ids.length; i++) {
      const node = nodeFromLayer(layerNodes, unit.ids[i]);
      const scale = getCardScale(node.layer, node.isSideBranch, node.branchDepth, settings.cardSizeMode);
      total += CARD_W * scale;
      if (i < unit.ids.length - 1) total += SIBLING_GAP;
    }
    return total;
  }

  const n0 = nodeFromLayer(layerNodes, unit.ids[0]);
  const n1 = nodeFromLayer(layerNodes, unit.ids[1]);
  const s0 = getCardScale(n0.layer, n0.isSideBranch, n0.branchDepth, settings.cardSizeMode);
  const s1 = getCardScale(n1.layer, n1.isSideBranch, n1.branchDepth, settings.cardSizeMode);
  return CARD_W * s0 + COUPLE_GAP + CARD_W * s1;
}

function cardHalfWidth(node: GraphPersonNode, settings: Project['viewSettings']): number {
  const scale = getCardScale(node.layer, node.isSideBranch, node.branchDepth, settings.cardSizeMode);
  return (CARD_W * scale) / 2;
}

function buildNodeToUnitMap(units: LayoutUnit[]): Map<string, LayoutUnit> {
  const map = new Map<string, LayoutUnit>();
  for (const unit of units) {
    for (const id of unit.ids) map.set(id, unit);
  }
  return map;
}

function gapBetweenCards(
  left: GraphPersonNode,
  right: GraphPersonNode,
  nodeToUnit: Map<string, LayoutUnit>,
): number {
  const leftUnit = nodeToUnit.get(left.id);
  const rightUnit = nodeToUnit.get(right.id);
  if (leftUnit && rightUnit && leftUnit === rightUnit) {
    if (leftUnit.siblingGroup) return SIBLING_GAP;
    if (leftUnit.ids.length === 2) return COUPLE_GAP;
    return 0;
  }
  return GROUP_GAP;
}

function layerPersons(layerNodes: GraphNode[]): GraphPersonNode[] {
  return layerNodes.filter((n): n is GraphPersonNode => n.kind === 'person');
}

function placeUnitAt(
  unit: LayoutUnit,
  layerNodes: GraphNode[],
  settings: Project['viewSettings'],
  startX: number,
  positions: Map<string, number>,
): number {
  if (unit.siblingGroup) {
    let x = startX;
    for (let i = 0; i < unit.ids.length; i++) {
      const node = nodeFromLayer(layerNodes, unit.ids[i]);
      const scale = getCardScale(node.layer, node.isSideBranch, node.branchDepth, settings.cardSizeMode);
      const w = CARD_W * scale;
      const px = x + w / 2;
      positions.set(node.id, px);
      x += w + (i < unit.ids.length - 1 ? SIBLING_GAP : 0);
    }
    return x;
  }

  if (unit.ids.length === 2) {
    const n0 = nodeFromLayer(layerNodes, unit.ids[0]);
    const n1 = nodeFromLayer(layerNodes, unit.ids[1]);
    const s0 = getCardScale(n0.layer, n0.isSideBranch, n0.branchDepth, settings.cardSizeMode);
    const s1 = getCardScale(n1.layer, n1.isSideBranch, n1.branchDepth, settings.cardSizeMode);
    const w0 = CARD_W * s0;
    const w1 = CARD_W * s1;
    const px0 = startX + w0 / 2;
    const px1 = startX + w0 + COUPLE_GAP + w1 / 2;
    positions.set(n0.id, px0);
    positions.set(n1.id, px1);
    return startX + w0 + COUPLE_GAP + w1;
  }

  const node = nodeFromLayer(layerNodes, unit.ids[0]);
  const scale = getCardScale(node.layer, node.isSideBranch, node.branchDepth, settings.cardSizeMode);
  const w = CARD_W * scale;
  const px = startX + w / 2;
  positions.set(node.id, px);
  return startX + w;
}

function unitAnchor(unit: LayoutUnit, positions: Map<string, number>): number {
  const xs = unit.ids.map((id) => positions.get(id)).filter((x): x is number => x !== undefined);
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function shiftUnit(unit: LayoutUnit, delta: number, positions: Map<string, number>): void {
  if (Math.abs(delta) < 1e-9) return;
  for (const id of unit.ids) {
    positions.set(id, (positions.get(id) ?? 0) + delta);
  }
}

function neighborMedian(
  unit: LayoutUnit,
  towardLayer: number,
  graph: GraphResult,
  nodeById: Map<string, GraphPersonNode>,
  positions: Map<string, number>,
): number | null {
  const values: number[] = [];
  for (const id of unit.ids) {
    for (const edge of graph.edges) {
      const otherId = edge.from === id ? edge.to : edge.to === id ? edge.from : null;
      if (!otherId) continue;
      const other = nodeById.get(otherId);
      if (!other || other.layer !== towardLayer) continue;
      const ox = positions.get(otherId);
      if (ox !== undefined) values.push(ox);
    }
  }
  return median(values);
}

/** Индекс блока в порядке слева направо */
function unitIndexMap(units: LayoutUnit[]): Map<string, number> {
  const map = new Map<string, number>();
  units.forEach((unit, idx) => unit.ids.forEach((id) => map.set(id, idx)));
  return map;
}

function getLayerRankByX(
  layer: number,
  nodeById: Map<string, GraphPersonNode>,
  positions: Map<string, number>,
): Map<string, number> {
  const nodes = [...nodeById.values()].filter((n) => n.layer === layer);
  nodes.sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0));
  const rank = new Map<string, number>();
  nodes.forEach((n, i) => rank.set(n.id, i));
  return rank;
}

function countCrossingsForLayerOrder(
  order: LayoutUnit[],
  currentLayer: number,
  adjacentLayer: number,
  adjacentRank: Map<string, number>,
  graph: GraphResult,
  nodeById: Map<string, GraphPersonNode>,
): number {
  const currentIdx = unitIndexMap(order);
  const pairs: { c: number; a: number }[] = [];

  for (const edge of graph.edges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) continue;

    let cNode: string | null = null;
    let aNode: string | null = null;
    if (from.layer === currentLayer && to.layer === adjacentLayer) {
      cNode = edge.from;
      aNode = edge.to;
    } else if (to.layer === currentLayer && from.layer === adjacentLayer) {
      cNode = edge.to;
      aNode = edge.from;
    }
    if (!cNode || !aNode) continue;

    const c = currentIdx.get(cNode);
    const a = adjacentRank.get(aNode);
    if (c !== undefined && a !== undefined) pairs.push({ c, a });
  }

  let crossings = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const p = pairs[i];
      const q = pairs[j];
      if ((p.c < q.c && p.a > q.a) || (p.c > q.c && p.a < q.a)) crossings++;
    }
  }
  return crossings;
}

function reduceCrossingsAdjacentSwap(
  units: LayoutUnit[],
  currentLayer: number,
  adjacentLayer: number,
  graph: GraphResult,
  nodeById: Map<string, GraphPersonNode>,
  positions: Map<string, number>,
): LayoutUnit[] {
  const adjacentRank = getLayerRankByX(adjacentLayer, nodeById, positions);
  let order = [...units];

  for (let round = 0; round < CROSSING_SWAP_ROUNDS; round++) {
    let improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      const before = countCrossingsForLayerOrder(
        order,
        currentLayer,
        adjacentLayer,
        adjacentRank,
        graph,
        nodeById,
      );
      const swapped = [...order];
      [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
      const after = countCrossingsForLayerOrder(
        swapped,
        currentLayer,
        adjacentLayer,
        adjacentRank,
        graph,
        nodeById,
      );
      if (after < before) {
        order = swapped;
        improved = true;
      }
    }
    if (!improved) break;
  }

  return order;
}

function genealogyRank(unit: LayoutUnit): number {
  return unit.sortKey;
}

function orderUnitsByBarycenter(
  units: LayoutUnit[],
  towardLayer: number,
  graph: GraphResult,
  nodeById: Map<string, GraphPersonNode>,
  positions: Map<string, number>,
  largeTree: boolean,
): LayoutUnit[] {
  const geneWeight = largeTree ? 0.15 : 1;

  const scored = units.map((unit) => {
    const bary = neighborMedian(unit, towardLayer, graph, nodeById, positions);
    const fallback = unit.siblingGroup ? unit.sortKey : unitAnchor(unit, positions);
    const score = (bary ?? fallback) + genealogyRank(unit) * geneWeight * 0.01;
    return { unit, score };
  });

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.unit.sortKey !== b.unit.sortKey) return a.unit.sortKey - b.unit.sortKey;
    return a.unit.ids[0].localeCompare(b.unit.ids[0]);
  });

  return scored.map((s) => s.unit);
}

function splitMainAndSide(units: LayoutUnit[]): { main: LayoutUnit[]; side: LayoutUnit[] } {
  const main: LayoutUnit[] = [];
  const side: LayoutUnit[] = [];
  for (const unit of units) {
    if (unitIsSideBranch(unit)) side.push(unit);
    else main.push(unit);
  }
  return { main, side };
}

function totalUnitsWidth(
  units: LayoutUnit[],
  layerNodes: GraphNode[],
  settings: Project['viewSettings'],
  gap: number,
): number {
  if (units.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < units.length; i++) {
    total += unitWidth(units[i], layerNodes, settings);
    if (i < units.length - 1) total += gap;
  }
  return total;
}

function assignLayerX(
  units: LayoutUnit[],
  layerNodes: GraphNode[],
  settings: Project['viewSettings'],
  positions: Map<string, number>,
  centerX: number,
): void {
  const { main, side } = splitMainAndSide(units);
  const mainGap = GROUP_GAP;
  const sideGap = SIDE_BRANCH_GAP;

  const mainWidth = totalUnitsWidth(main, layerNodes, settings, mainGap);
  let x = centerX - mainWidth / 2;

  for (let i = 0; i < main.length; i++) {
    x = placeUnitAt(main[i], layerNodes, settings, x, positions);
    if (i < main.length - 1) x += mainGap;
  }

  if (side.length === 0) return;

  x += MAIN_SIDE_GAP;
  for (let i = 0; i < side.length; i++) {
    x = placeUnitAt(side[i], layerNodes, settings, x, positions);
    if (i < side.length - 1) x += sideGap;
  }
}

function resolveLayerCollisions(
  units: LayoutUnit[],
  layerNodes: GraphNode[],
  settings: Project['viewSettings'],
  positions: Map<string, number>,
): number {
  const persons = layerPersons(layerNodes);
  if (persons.length <= 1) return 0;

  const nodeToUnit = buildNodeToUnitMap(units);
  let maxShift = 0;

  for (let round = 0; round < 64; round++) {
    let moved = 0;
    const sorted = [...persons].sort(
      (a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0),
    );

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const prevCx = positions.get(prev.id) ?? 0;
      const currCx = positions.get(curr.id) ?? 0;
      const required =
        prevCx +
        cardHalfWidth(prev, settings) +
        gapBetweenCards(prev, curr, nodeToUnit) +
        cardHalfWidth(curr, settings);

      if (currCx + 0.01 < required) {
        const delta = required - currCx;
        const unit = nodeToUnit.get(curr.id);
        if (unit) shiftUnit(unit, delta, positions);
        else positions.set(curr.id, currCx + delta);
        moved = Math.max(moved, delta);
      }
    }

    maxShift = Math.max(maxShift, moved);
    if (moved < CONVERGENCE_EPS) break;
  }

  return maxShift;
}

function enforceAllLayerCollisions(
  layers: Map<number, GraphNode[]>,
  sortedLayers: number[],
  project: Project,
  positions: Map<string, number>,
): void {
  const settings = project.viewSettings;
  for (const layer of sortedLayers) {
    const layerNodes = layers.get(layer)!;
    const units = buildLayoutUnits(layerNodes, project);
    resolveLayerCollisions(units, layerNodes, settings, positions);
  }
}

function collectDescendants(rootIds: string[], graph: GraphResult): Set<string> {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const down = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to || from.layer >= to.layer) continue;
    const list = down.get(edge.from) ?? [];
    list.push(edge.to);
    down.set(edge.from, list);
  }

  const seen = new Set<string>();
  const queue = [...rootIds];
  while (queue.length) {
    const id = queue.shift()!;
    for (const child of down.get(id) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return seen;
}

function shiftSubtree(ids: string[], delta: number, positions: Map<string, number>): number {
  if (Math.abs(delta) < 1e-9) return 0;
  for (const id of ids) positions.set(id, (positions.get(id) ?? 0) + delta);
  return Math.abs(delta);
}

function alignChildrenUnderParents(
  layers: Map<number, GraphNode[]>,
  sortedLayers: number[],
  graph: GraphResult,
  positions: Map<string, number>,
): number {
  let maxShift = 0;

  for (let pass = 0; pass < PARENT_ALIGN_PASSES; pass++) {
    for (let li = sortedLayers.length - 1; li >= 0; li--) {
      const layer = sortedLayers[li];
      const nextLayer = layer + 1;
      if (!layers.has(nextLayer)) continue;

      const unionsOnLayer = new Set<string>();
      for (const node of layers.get(layer)!) {
        if (node.kind === 'person' && node.unionId) unionsOnLayer.add(node.unionId);
      }

      for (const unionId of unionsOnLayer) {
        const partners = layers
          .get(layer)!
          .filter((n): n is GraphPersonNode => n.kind === 'person' && n.unionId === unionId);
        if (partners.length === 0) continue;

        const parentCenter =
          partners.reduce((sum, p) => sum + (positions.get(p.id) ?? 0), 0) / partners.length;

        const children = layers
          .get(nextLayer)!
          .filter((n): n is GraphPersonNode => n.kind === 'person' && n.parentUnionId === unionId);
        if (children.length === 0) continue;

        const childCenter =
          children.reduce((sum, c) => sum + (positions.get(c.id) ?? 0), 0) / children.length;
        const delta = parentCenter - childCenter;
        if (Math.abs(delta) < CONVERGENCE_EPS) continue;

        const shiftIds = new Set<string>();
        for (const child of children) {
          shiftIds.add(child.id);
          for (const d of collectDescendants([child.id], graph)) shiftIds.add(d);
        }
        maxShift = Math.max(maxShift, shiftSubtree([...shiftIds], delta, positions));
      }
    }
  }

  return maxShift;
}

function layerTargetCenter(
  units: LayoutUnit[],
  towardLayer: number,
  graph: GraphResult,
  nodeById: Map<string, GraphPersonNode>,
  positions: Map<string, number>,
): number {
  const scores = units
    .map((unit) => neighborMedian(unit, towardLayer, graph, nodeById, positions))
    .filter((v): v is number => v !== null);
  return median(scores) ?? 0;
}

/**
 * Основной алгоритм раскладки:
 * — поколения на слоях;
 * — мужчина слева, женщина справа;
 * — дети по возрасту слева направо;
 * — центральная ветвь приоритетнее боковых;
 * — минимизация пересечений линий (barycenter + локальные перестановки).
 */
export function runPedigreeLayout(
  layers: Map<number, GraphNode[]>,
  sortedLayers: number[],
  graph: GraphResult,
  nodeById: Map<string, GraphPersonNode>,
  positions: Map<string, number>,
  project: Project,
): void {
  const settings = project.viewSettings;
  const largeTree = isLargeTree(graph);

  for (const layer of sortedLayers) {
    const layerNodes = layers.get(layer)!;
    const units = buildLayoutUnits(layerNodes, project);
    assignLayerX(units, layerNodes, settings, positions, 0);
    resolveLayerCollisions(units, layerNodes, settings, positions);
  }

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let maxMove = 0;
    const down = iter % 2 === 0;
    const layerOrder = down ? sortedLayers : [...sortedLayers].reverse();

    for (const layer of layerOrder) {
      const layerNodes = layers.get(layer)!;
      let units = buildLayoutUnits(layerNodes, project);
      const towardLayer = down ? layer - 1 : layer + 1;
      const adjacentLayer = towardLayer;

      units = orderUnitsByBarycenter(units, towardLayer, graph, nodeById, positions, largeTree);

      if (layers.has(adjacentLayer)) {
        units = reduceCrossingsAdjacentSwap(
          units,
          layer,
          adjacentLayer,
          graph,
          nodeById,
          positions,
        );
      }

      const targetX = layer === 0 ? 0 : layerTargetCenter(units, towardLayer, graph, nodeById, positions);
      assignLayerX(units, layerNodes, settings, positions, targetX);
      maxMove = Math.max(maxMove, resolveLayerCollisions(units, layerNodes, settings, positions));
    }

    maxMove = Math.max(maxMove, alignChildrenUnderParents(layers, sortedLayers, graph, positions));
    enforceAllLayerCollisions(layers, sortedLayers, project, positions);

    if (maxMove < CONVERGENCE_EPS) break;
  }

  enforceAllLayerCollisions(layers, sortedLayers, project, positions);
}

export { LAYER_GAP, nodeSize };
