import type { Project } from '../../types';
import type { GraphResult } from '../graph-builder';
import {
  CONVERGENCE_EPS,
  CROSSING_SWAP_ROUNDS,
  GROUP_GAP,
  MAIN_SIDE_GAP,
  MAX_ORDER_ITERATIONS,
  SIDE_BRANCH_GAP,
  type FamilyLayoutGraph,
  type FamilyUnit,
} from './types';

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function unitCenter(unit: FamilyUnit, centers: Map<string, number>): number {
  return centers.get(unit.id) ?? 0;
}

function neighborCentersOnLayer(
  unit: FamilyUnit,
  targetLayer: number,
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
): number[] {
  const result: number[] = [];

  if (targetLayer < unit.layer && unit.parentUnitId) {
    const parent = layout.unitById.get(unit.parentUnitId);
    if (parent && parent.layer === targetLayer) {
      result.push(unitCenter(parent, centers));
    }
  }

  if (targetLayer > unit.layer) {
    for (const childId of unit.childUnitIds) {
      const child = layout.unitById.get(childId);
      if (child && child.layer === targetLayer) {
        result.push(unitCenter(child, centers));
      }
    }
  }

  return result;
}

function orderUnitsByBarycenter(
  units: FamilyUnit[],
  towardLayer: number,
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  geneWeight: number,
): FamilyUnit[] {
  const scored = units.map((unit) => {
    const neighbors = neighborCentersOnLayer(unit, towardLayer, layout, centers);
    const bary = median(neighbors);
    const score = (bary ?? unit.birthOrder) + unit.birthOrder * geneWeight * 0.01;
    return { unit, score };
  });

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.unit.birthOrder !== b.unit.birthOrder) return a.unit.birthOrder - b.unit.birthOrder;
    return a.unit.id.localeCompare(b.unit.id);
  });

  return scored.map((s) => s.unit);
}

/** Связи parent-unit → child-unit между соседними слоями. */
function unitLinksBetweenLayers(
  layerA: number,
  layerB: number,
  layout: FamilyLayoutGraph,
): { parentId: string; childId: string }[] {
  const links: { parentId: string; childId: string }[] = [];
  for (const parent of layout.layers.get(layerA) ?? []) {
    for (const childUnitId of parent.childUnitIds) {
      const child = layout.unitById.get(childUnitId);
      if (child && child.layer === layerB) {
        links.push({ parentId: parent.id, childId: child.id });
      }
    }
  }
  return links;
}

function countUnitLinkCrossings(
  orderA: FamilyUnit[],
  orderB: FamilyUnit[],
  links: { parentId: string; childId: string }[],
): number {
  const posA = new Map(orderA.map((u, i) => [u.id, i]));
  const posB = new Map(orderB.map((u, i) => [u.id, i]));
  const mapped = links
    .map((link) => ({
      pi: posA.get(link.parentId),
      ci: posB.get(link.childId),
    }))
    .filter((l): l is { pi: number; ci: number } => l.pi !== undefined && l.ci !== undefined);

  let crossings = 0;
  for (let i = 0; i < mapped.length; i++) {
    for (let j = i + 1; j < mapped.length; j++) {
      const a = mapped[i];
      const b = mapped[j];
      if ((a.pi < b.pi && a.ci > b.ci) || (a.pi > b.pi && a.ci < b.ci)) crossings++;
    }
  }
  return crossings;
}

function reduceCrossingsAdjacentSwap(
  units: FamilyUnit[],
  adjacentUnits: FamilyUnit[],
  links: { parentId: string; childId: string }[],
): FamilyUnit[] {
  let order = [...units];
  for (let round = 0; round < CROSSING_SWAP_ROUNDS; round++) {
    let improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      const swapped = [...order];
      [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
      if (
        countUnitLinkCrossings(swapped, adjacentUnits, links) <
        countUnitLinkCrossings(order, adjacentUnits, links)
      ) {
        order = swapped;
        improved = true;
      }
    }
    if (!improved) break;
  }
  return order;
}

/** Супруги на одном слое — рядом (если разнесены по разным unit-ам). */
function keepUnionPartnersAdjacent(
  units: FamilyUnit[],
  layer: number,
  project: Project,
  layout: FamilyLayoutGraph,
): FamilyUnit[] {
  const order = [...units];

  for (const union of Object.values(project.unions)) {
    if (union.partnerIds.length < 2) continue;
    const partnerUnits = new Set<number>();
    for (const pid of union.partnerIds) {
      const unit = layout.units.find((u) => u.layer === layer && u.personIds.includes(pid));
      if (!unit) continue;
      const idx = order.findIndex((u) => u.id === unit.id);
      if (idx >= 0) partnerUnits.add(idx);
    }
    if (partnerUnits.size < 2) continue;

    const indices = [...partnerUnits].sort((a, b) => a - b);
    const block = indices.map((i) => order[i]);
    const without = order.filter((_, i) => !partnerUnits.has(i));
    const insertAt = Math.min(...indices);
    without.splice(insertAt, 0, ...block);
    order.splice(0, order.length, ...without);
  }

  return order;
}

function layerTargetCenter(
  units: FamilyUnit[],
  towardLayer: number,
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
): number {
  const scores = units
    .map((u) => median(neighborCentersOnLayer(u, towardLayer, layout, centers)))
    .filter((v): v is number => v !== null);
  return median(scores) ?? 0;
}

function packOrderedUnits(
  units: FamilyUnit[],
  centers: Map<string, number>,
  targetX: number,
): void {
  const main = units.filter((u) => u.branchSide === 'main');
  const left = units.filter((u) => u.branchSide === 'left');
  const right = units.filter((u) => u.branchSide === 'right');

  const unitWidth = 120;
  const mainGap = GROUP_GAP;
  const sideGap = SIDE_BRANCH_GAP;

  const mainW = main.length * unitWidth + Math.max(0, main.length - 1) * mainGap;
  let x = targetX - mainW / 2;

  for (let i = 0; i < main.length; i++) {
    centers.set(main[i].id, x + unitWidth / 2);
    x += unitWidth + (i < main.length - 1 ? mainGap : 0);
  }
  const mainEnd = x;

  if (left.length > 0) {
    const leftW = left.length * unitWidth + Math.max(0, left.length - 1) * sideGap;
    let lx = targetX - mainW / 2 - MAIN_SIDE_GAP - leftW;
    for (let i = 0; i < left.length; i++) {
      centers.set(left[i].id, lx + unitWidth / 2);
      lx += unitWidth + (i < left.length - 1 ? sideGap : 0);
    }
  }

  if (right.length > 0) {
    let rx = mainEnd + MAIN_SIDE_GAP;
    for (let i = 0; i < right.length; i++) {
      centers.set(right[i].id, rx + unitWidth / 2);
      rx += unitWidth + (i < right.length - 1 ? sideGap : 0);
    }
  }
}

function anchorMainLineToCenter(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  project: Project,
): void {
  let cx = 0;
  if (project.center.type === 'person') {
    const unitId = layout.personToUnit.get(project.center.id);
    if (unitId) cx = centers.get(unitId) ?? 0;
  }
  if (Math.abs(cx) < CONVERGENCE_EPS) {
    const layer0 = layout.layers.get(0) ?? [];
    const main = layer0.filter((u) => u.branchSide === 'main');
    if (main.length === 0) return;
    cx = main.reduce((s, u) => s + (centers.get(u.id) ?? 0), 0) / main.length;
  }
  if (Math.abs(cx) < CONVERGENCE_EPS) return;
  for (const unit of layout.units) {
    centers.set(unit.id, (centers.get(unit.id) ?? 0) - cx);
  }
}

/** Sugiyama: barycenter ordering + crossing reduction per layer. */
export function orderFamilyUnits(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  graph: GraphResult,
  project: Project,
): void {
  void graph;
  const largeTree = layout.units.length >= 14;
  const geneWeight = largeTree ? 0.35 : 1;

  for (const layer of layout.sortedLayers) {
    const units = layout.layers.get(layer) ?? [];
    let x = 0;
    for (const unit of units) {
      centers.set(unit.id, x);
      x += 100;
    }
  }

  for (let iter = 0; iter < MAX_ORDER_ITERATIONS; iter++) {
    const down = iter % 2 === 0;
    const layerOrder = down ? layout.sortedLayers : [...layout.sortedLayers].reverse();

    for (const layer of layerOrder) {
      let units = [...(layout.layers.get(layer) ?? [])];
      const towardLayer = down ? layer - 1 : layer + 1;
      const adjacentLayer = towardLayer;

      units = orderUnitsByBarycenter(units, towardLayer, layout, centers, geneWeight);

      if (layout.layers.has(adjacentLayer)) {
        const adjacent = layout.layers.get(adjacentLayer)!;
        const links = unitLinksBetweenLayers(
          down ? adjacentLayer : layer,
          down ? layer : adjacentLayer,
          layout,
        );
        units = reduceCrossingsAdjacentSwap(units, adjacent, links);
      }

      units = keepUnionPartnersAdjacent(units, layer, project, layout);

      const targetX = layer === 0 ? 0 : layerTargetCenter(units, towardLayer, layout, centers);
      packOrderedUnits(units, centers, targetX);
      layout.layers.set(layer, units);
    }
  }

  anchorMainLineToCenter(layout, centers, project);
}
