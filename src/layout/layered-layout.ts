import type { LayoutEdge, LayoutNode, LayoutResult, Project } from '../types';
import type { GraphNode, GraphResult } from './graph-builder';
import {
  CARD_H,
  CARD_W,
  COUPLE_GAP,
  LAYER_GAP,
  getCardScale,
} from './graph-builder';
import { getCenterFocusPoint } from './center-focus';
import { routeCoupleBond } from './edge-router';
import { buildPedigreeEdges } from './pedigree-edges';

type GraphPersonNode = Extract<GraphNode, { kind: 'person' }>;

const SIBLING_GAP = 22;
const GROUP_GAP = 80;
const MAX_ITERATIONS = 40;
const CONVERGENCE_EPS = 0.5;
const PARENT_ALIGN_PASSES = 6;

interface LayoutUnit {
  ids: string[];
  sortKey: number;
  siblingGroup: boolean;
  parentUnionId?: string;
}

interface UnitBounds {
  unit: LayoutUnit;
  left: number;
  right: number;
  anchor: number;
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

function sortPartnersInUnit(nodes: GraphPersonNode[], project: Project): GraphPersonNode[] {
  return [...nodes].sort((a, b) => {
    const pa = project.persons[a.personId];
    const pb = project.persons[b.personId];
    if (pa?.gender === 'male' && pb?.gender !== 'male') return -1;
    if (pb?.gender === 'male' && pa?.gender !== 'male') return 1;
    return 0;
  });
}

function buildUnits(layerNodes: GraphNode[], project: Project): LayoutUnit[] {
  const persons = layerNodes.filter((n): n is GraphPersonNode => n.kind === 'person');
  const used = new Set<string>();
  const units: LayoutUnit[] = [];

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
    });
  }

  for (const node of persons) {
    if (used.has(node.id)) continue;
    units.push({
      ids: [node.id],
      sortKey: node.birthOrder ?? Number.MAX_SAFE_INTEGER,
      siblingGroup: false,
      parentUnionId: node.parentUnionId,
    });
  }

  units.sort((a, b) => a.sortKey - b.sortKey || a.ids[0].localeCompare(b.ids[0]));
  return units;
}

function unitWidth(
  unit: LayoutUnit,
  layerNodes: GraphNode[],
  settings: Project['viewSettings'],
): number {
  if (unit.ids.length === 1) {
    const node = layerNodes.find((n) => n.id === unit.ids[0]) as GraphPersonNode;
    const scale = getCardScale(node.layer, node.isSideBranch, node.branchDepth, settings.cardSizeMode);
    return CARD_W * scale;
  }

  if (unit.siblingGroup) {
    let total = 0;
    for (let i = 0; i < unit.ids.length; i++) {
      const node = layerNodes.find((n) => n.id === unit.ids[i]) as GraphPersonNode;
      const scale = getCardScale(node.layer, node.isSideBranch, node.branchDepth, settings.cardSizeMode);
      total += CARD_W * scale;
      if (i < unit.ids.length - 1) total += SIBLING_GAP;
    }
    return total;
  }

  const n0 = layerNodes.find((n) => n.id === unit.ids[0]) as GraphPersonNode;
  const n1 = layerNodes.find((n) => n.id === unit.ids[1]) as GraphPersonNode;
  const s0 = getCardScale(n0.layer, n0.isSideBranch, n0.branchDepth, settings.cardSizeMode);
  const s1 = getCardScale(n1.layer, n1.isSideBranch, n1.branchDepth, settings.cardSizeMode);
  return CARD_W * s0 + COUPLE_GAP + CARD_W * s1;
}

function placeUnitAt(
  unit: LayoutUnit,
  layerNodes: GraphNode[],
  settings: Project['viewSettings'],
  startX: number,
  positions: Map<string, number>,
  manualMode: boolean,
  manualLayout: Project['manualLayout'],
): number {
  if (unit.siblingGroup) {
    let x = startX;
    for (let i = 0; i < unit.ids.length; i++) {
      const node = layerNodes.find((n) => n.id === unit.ids[i]) as GraphPersonNode;
      const scale = getCardScale(node.layer, node.isSideBranch, node.branchDepth, settings.cardSizeMode);
      const w = CARD_W * scale;
      let px = x + w / 2;
      if (manualMode && manualLayout?.[node.personId]) px = manualLayout[node.personId].x;
      positions.set(node.id, px);
      x += w + (i < unit.ids.length - 1 ? SIBLING_GAP : 0);
    }
    return x;
  }

  if (unit.ids.length === 2) {
    const n0 = layerNodes.find((n) => n.id === unit.ids[0]) as GraphPersonNode;
    const n1 = layerNodes.find((n) => n.id === unit.ids[1]) as GraphPersonNode;
    const s0 = getCardScale(n0.layer, n0.isSideBranch, n0.branchDepth, settings.cardSizeMode);
    const s1 = getCardScale(n1.layer, n1.isSideBranch, n1.branchDepth, settings.cardSizeMode);
    const w0 = CARD_W * s0;
    const w1 = CARD_W * s1;
    let px0 = startX + w0 / 2;
    let px1 = startX + w0 + COUPLE_GAP + w1 / 2;
    if (manualMode) {
      const m0 = manualLayout?.[n0.personId];
      const m1 = manualLayout?.[n1.personId];
      if (m0) px0 = m0.x;
      if (m1) px1 = m1.x;
    }
    positions.set(n0.id, px0);
    positions.set(n1.id, px1);
    return startX + w0 + COUPLE_GAP + w1;
  }

  const node = layerNodes.find((n) => n.id === unit.ids[0]) as GraphPersonNode;
  const scale = getCardScale(node.layer, node.isSideBranch, node.branchDepth, settings.cardSizeMode);
  const w = CARD_W * scale;
  let px = startX + w / 2;
  if (manualMode && manualLayout?.[node.personId]) px = manualLayout[node.personId].x;
  positions.set(node.id, px);
  return startX + w;
}

function unitAnchor(unit: LayoutUnit, positions: Map<string, number>): number {
  const xs = unit.ids.map((id) => positions.get(id)).filter((x): x is number => x !== undefined);
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function unitBounds(
  unit: LayoutUnit,
  layerNodes: GraphNode[],
  settings: Project['viewSettings'],
  positions: Map<string, number>,
): UnitBounds {
  let left = Infinity;
  let right = -Infinity;
  for (const id of unit.ids) {
    const node = layerNodes.find((n) => n.id === id) as GraphPersonNode;
    const scale = getCardScale(node.layer, node.isSideBranch, node.branchDepth, settings.cardSizeMode);
    const half = (CARD_W * scale) / 2;
    const px = positions.get(id) ?? 0;
    left = Math.min(left, px - half);
    right = Math.max(right, px + half);
  }
  return { unit, left, right, anchor: (left + right) / 2 };
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

function orderUnits(
  units: LayoutUnit[],
  towardLayer: number,
  graph: GraphResult,
  nodeById: Map<string, GraphPersonNode>,
  positions: Map<string, number>,
): LayoutUnit[] {
  const scored = units.map((unit) => {
    const m = neighborMedian(unit, towardLayer, graph, nodeById, positions);
    const fallback = unit.siblingGroup ? unit.sortKey : unitAnchor(unit, positions);
    return { unit, score: m ?? fallback };
  });

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.unit.sortKey !== b.unit.sortKey) return a.unit.sortKey - b.unit.sortKey;
    return a.unit.ids[0].localeCompare(b.unit.ids[0]);
  });
  return scored.map((s) => s.unit);
}

function totalUnitsWidth(
  units: LayoutUnit[],
  layerNodes: GraphNode[],
  settings: Project['viewSettings'],
): number {
  if (units.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < units.length; i++) {
    total += unitWidth(units[i], layerNodes, settings);
    if (i < units.length - 1) total += GROUP_GAP;
  }
  return total;
}

function assignLayerXCentered(
  units: LayoutUnit[],
  layerNodes: GraphNode[],
  settings: Project['viewSettings'],
  positions: Map<string, number>,
  centerX: number,
  manualMode: boolean,
  manualLayout: Project['manualLayout'],
): void {
  const totalWidth = totalUnitsWidth(units, layerNodes, settings);
  let x = centerX - totalWidth / 2;
  for (let i = 0; i < units.length; i++) {
    x = placeUnitAt(units[i], layerNodes, settings, x, positions, manualMode, manualLayout);
    if (i < units.length - 1) x += GROUP_GAP;
  }
}

function resolveLayerCollisions(
  units: LayoutUnit[],
  layerNodes: GraphNode[],
  settings: Project['viewSettings'],
  positions: Map<string, number>,
): number {
  if (units.length <= 1) return 0;

  let maxShift = 0;
  const bounds = units
    .map((unit) => unitBounds(unit, layerNodes, settings, positions))
    .sort((a, b) => a.anchor - b.anchor);

  for (let i = 1; i < bounds.length; i++) {
    const prev = bounds[i - 1];
    const curr = bounds[i];
    const requiredLeft = prev.right + GROUP_GAP;
    if (curr.left < requiredLeft) {
      const delta = requiredLeft - curr.left;
      shiftUnit(curr.unit, delta, positions);
      curr.left += delta;
      curr.right += delta;
      curr.anchor += delta;
      maxShift = Math.max(maxShift, Math.abs(delta));
    }
  }

  for (let i = bounds.length - 2; i >= 0; i--) {
    const curr = bounds[i];
    const next = bounds[i + 1];
    const requiredRight = next.left - GROUP_GAP;
    if (curr.right > requiredRight) {
      const delta = requiredRight - curr.right;
      shiftUnit(curr.unit, delta, positions);
      curr.left += delta;
      curr.right += delta;
      curr.anchor += delta;
      maxShift = Math.max(maxShift, Math.abs(delta));
    }
  }

  return maxShift;
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
  for (const id of ids) {
    positions.set(id, (positions.get(id) ?? 0) + delta);
  }
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
          .filter(
            (n): n is GraphPersonNode => n.kind === 'person' && n.parentUnionId === unionId,
          );
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

function runAutoLayout(
  layers: Map<number, GraphNode[]>,
  sortedLayers: number[],
  graph: GraphResult,
  nodeById: Map<string, GraphPersonNode>,
  positions: Map<string, number>,
  project: Project,
): void {
  const settings = project.viewSettings;

  for (const layer of sortedLayers) {
    const layerNodes = layers.get(layer)!;
    const units = buildUnits(layerNodes, project);
    assignLayerXCentered(units, layerNodes, settings, positions, layer === 0 ? 0 : 0, false, project.manualLayout);
  }

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let maxMove = 0;
    const down = iter % 2 === 0;
    const layerOrder = down ? sortedLayers : [...sortedLayers].reverse();

    for (const layer of layerOrder) {
      const layerNodes = layers.get(layer)!;
      let units = buildUnits(layerNodes, project);
      const towardLayer = down ? layer - 1 : layer + 1;
      units = orderUnits(units, towardLayer, graph, nodeById, positions);

      const targetX =
        layer === 0 ? 0 : layerTargetCenter(units, towardLayer, graph, nodeById, positions);
      assignLayerXCentered(units, layerNodes, settings, positions, targetX, false, project.manualLayout);
      maxMove = Math.max(maxMove, resolveLayerCollisions(units, layerNodes, settings, positions));
    }

    maxMove = Math.max(maxMove, alignChildrenUnderParents(layers, sortedLayers, graph, positions));

    for (const layer of sortedLayers) {
      const layerNodes = layers.get(layer)!;
      const units = buildUnits(layerNodes, project);
      maxMove = Math.max(maxMove, resolveLayerCollisions(units, layerNodes, settings, positions));
    }

    if (maxMove < CONVERGENCE_EPS) break;
  }
}

function normalizeLayoutToFocus(project: Project, layout: LayoutResult): LayoutResult {
  const focus = getCenterFocusPoint(project, layout);
  if (!focus) return layout;

  const dx = -focus.x;
  const dy = -focus.y;

  const nodes = layout.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy }));
  const edges = layout.edges.map((e) => ({
    ...e,
    points: e.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
  }));

  return {
    nodes,
    edges,
    bounds: {
      minX: layout.bounds.minX + dx,
      minY: layout.bounds.minY + dy,
      maxX: layout.bounds.maxX + dx,
      maxY: layout.bounds.maxY + dy,
    },
  };
}

function computeBounds(nodes: LayoutNode[]): LayoutResult['bounds'] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  if (!nodes.length) {
    minX = minY = 0;
    maxX = maxY = 400;
  }
  return { minX, minY, maxX, maxY };
}

export function buildLayoutEdges(
  project: Project,
  layoutNodes: LayoutNode[],
  graph: GraphResult,
): LayoutEdge[] {
  const pedigreeEdges = buildPedigreeEdges(project, layoutNodes, graph);

  const coupleBonds: LayoutEdge[] = [];
  const seenBonds = new Set<string>();
  const byUnion = new Map<string, LayoutNode[]>();

  for (const node of layoutNodes) {
    if (!node.unionId) continue;
    const list = byUnion.get(node.unionId) ?? [];
    list.push(node);
    byUnion.set(node.unionId, list);
  }

  for (const [unionId, members] of byUnion) {
    if (members.length < 2) continue;
    const sorted = [...members].sort((a, b) => {
      const pa = project.persons[a.personId!];
      const pb = project.persons[b.personId!];
      if (pa?.gender === 'male' && pb?.gender !== 'male') return -1;
      if (pb?.gender === 'male' && pa?.gender !== 'male') return 1;
      return a.x - b.x;
    });
    const left = sorted[0];
    const right = sorted[1];
    const bondId = `bond-${unionId}`;
    if (seenBonds.has(bondId)) continue;
    seenBonds.add(bondId);
    coupleBonds.push({
      id: bondId,
      from: left.id,
      to: right.id,
      points: routeCoupleBond(left, right),
    });
  }

  return [...coupleBonds, ...pedigreeEdges];
}

export { computeBounds };

export function computeLayout(
  graph: GraphResult,
  project: Project,
): LayoutResult {
  const settings = project.viewSettings;
  const layers = new Map<number, GraphNode[]>();
  const nodeById = new Map<string, GraphPersonNode>();

  for (const node of graph.nodes) {
    const list = layers.get(node.layer) ?? [];
    list.push(node);
    layers.set(node.layer, list);
    if (node.kind === 'person') nodeById.set(node.id, node);
  }

  const positions = new Map<string, number>();
  const sortedLayers = [...layers.keys()].sort((a, b) => a - b);

  runAutoLayout(layers, sortedLayers, graph, nodeById, positions, project);

  const layoutNodes: LayoutNode[] = [];
  for (const layer of sortedLayers) {
    const layerNodes = layers.get(layer)!;
    for (const node of layerNodes) {
      if (node.kind !== 'person') continue;
      const scale = getCardScale(node.layer, node.isSideBranch, node.branchDepth, settings.cardSizeMode);
      const { w, h } = nodeSize(scale);
      const px = positions.get(node.id) ?? 0;
      const py = layer * LAYER_GAP;

      layoutNodes.push({
        id: node.id,
        kind: 'person',
        layer: node.layer,
        x: px - w / 2,
        y: py - h / 2,
        width: w,
        height: h,
        scale,
        isSideBranch: node.isSideBranch,
        personId: node.personId,
        unionId: node.unionId,
      });
    }
  }

  let layout: LayoutResult = {
    nodes: layoutNodes,
    edges: buildLayoutEdges(project, layoutNodes, graph),
    bounds: computeBounds(layoutNodes),
  };

  return normalizeLayoutToFocus(project, layout);
}
