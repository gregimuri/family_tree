import type { GraphResult } from '../graph-builder';
import {
  CONVERGENCE_EPS,
  CROSSING_SWAP_ROUNDS,
  MAX_ORDER_ITERATIONS,
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

function countCrossings(
  orderA: FamilyUnit[],
  orderB: FamilyUnit[],
  graph: GraphResult,
): number {
  const posA = new Map(orderA.map((u, i) => [u.id, i]));
  const posB = new Map(orderB.map((u, i) => [u.id, i]));
  let crossings = 0;

  for (const edge of graph.edges) {
    const fromUnit = orderA.find((u) => u.graphNodeIds.includes(edge.from));
    const toUnit = orderB.find((u) => u.graphNodeIds.includes(edge.to));
    if (!fromUnit || !toUnit) continue;
    const fromIdx = posA.get(fromUnit.id)!;
    const toIdx = posB.get(toUnit.id)!;

    for (const edge2 of graph.edges) {
      const fromUnit2 = orderA.find((u) => u.graphNodeIds.includes(edge2.from));
      const toUnit2 = orderB.find((u) => u.graphNodeIds.includes(edge2.to));
      if (!fromUnit2 || !toUnit2) continue;
      const fromIdx2 = posA.get(fromUnit2.id)!;
      const toIdx2 = posB.get(toUnit2.id)!;
      if (fromIdx < fromIdx2 && toIdx > toIdx2) crossings++;
      if (fromIdx > fromIdx2 && toIdx < toIdx2) crossings++;
    }
  }

  return crossings;
}

function reduceCrossingsAdjacentSwap(
  units: FamilyUnit[],
  adjacentUnits: FamilyUnit[],
  graph: GraphResult,
): FamilyUnit[] {
  let order = [...units];
  for (let round = 0; round < CROSSING_SWAP_ROUNDS; round++) {
    let improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      const swapped = [...order];
      [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
      if (countCrossings(swapped, adjacentUnits, graph) < countCrossings(order, adjacentUnits, graph)) {
        order = swapped;
        improved = true;
      }
    }
    if (!improved) break;
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
  const mainGap = 64;
  const sideGap = 96;

  const mainW = main.length * unitWidth + Math.max(0, main.length - 1) * mainGap;
  let x = targetX - mainW / 2;

  for (let i = 0; i < main.length; i++) {
    centers.set(main[i].id, x + unitWidth / 2);
    x += unitWidth + (i < main.length - 1 ? mainGap : 0);
  }
  const mainEnd = x;

  if (left.length > 0) {
    const leftW = left.length * unitWidth + Math.max(0, left.length - 1) * sideGap;
    let lx = targetX - mainW / 2 - 88 - leftW;
    for (let i = 0; i < left.length; i++) {
      centers.set(left[i].id, lx + unitWidth / 2);
      lx += unitWidth + (i < left.length - 1 ? sideGap : 0);
    }
  }

  if (right.length > 0) {
    let rx = mainEnd + 88;
    for (let i = 0; i < right.length; i++) {
      centers.set(right[i].id, rx + unitWidth / 2);
      rx += unitWidth + (i < right.length - 1 ? sideGap : 0);
    }
  }
}

function alignChildUnitsUnderParents(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
): number {
  let maxShift = 0;

  for (let li = layout.sortedLayers.length - 1; li >= 0; li--) {
    const layer = layout.sortedLayers[li];
    const nextLayer = layer + 1;
    if (!layout.layers.has(nextLayer)) continue;

    for (const parent of layout.layers.get(layer) ?? []) {
      const childUnits = parent.childUnitIds
        .map((id) => layout.unitById.get(id))
        .filter((u): u is FamilyUnit => Boolean(u && u.layer === nextLayer));
      if (childUnits.length === 0) continue;

      const parentCenter = centers.get(parent.id) ?? 0;
      const childCenters = childUnits.map((c) => centers.get(c.id) ?? 0);
      const childCenter = (Math.min(...childCenters) + Math.max(...childCenters)) / 2;
      const delta = parentCenter - childCenter;
      if (Math.abs(delta) < CONVERGENCE_EPS) continue;

      for (const unit of layout.units) {
        if (unit.layer >= nextLayer) {
          centers.set(unit.id, (centers.get(unit.id) ?? 0) + delta);
        }
      }
      maxShift = Math.max(maxShift, Math.abs(delta));
    }
  }

  return maxShift;
}

function anchorMainLineToCenter(layout: FamilyLayoutGraph, centers: Map<string, number>): void {
  const layer0 = layout.layers.get(0) ?? [];
  const main = layer0.filter((u) => u.branchSide === 'main');
  if (main.length === 0) return;

  const avg =
    main.reduce((s, u) => s + (centers.get(u.id) ?? 0), 0) / main.length;
  if (Math.abs(avg) < CONVERGENCE_EPS) return;

  for (const unit of layout.units) {
    centers.set(unit.id, (centers.get(unit.id) ?? 0) - avg);
  }
}

/** Sugiyama: barycenter ordering + crossing reduction per layer. */
export function orderFamilyUnits(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  graph: GraphResult,
): void {
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
    let maxMove = 0;
    const down = iter % 2 === 0;
    const layerOrder = down ? layout.sortedLayers : [...layout.sortedLayers].reverse();

    for (const layer of layerOrder) {
      let units = [...(layout.layers.get(layer) ?? [])];
      const towardLayer = down ? layer - 1 : layer + 1;
      const adjacentLayer = towardLayer;

      units = orderUnitsByBarycenter(units, towardLayer, layout, centers, geneWeight);

      if (layout.layers.has(adjacentLayer)) {
        const adjacent = layout.layers.get(adjacentLayer)!;
        units = reduceCrossingsAdjacentSwap(units, adjacent, graph);
      }

      const targetX = layer === 0 ? 0 : layerTargetCenter(units, towardLayer, layout, centers);
      packOrderedUnits(units, centers, targetX);
      layout.layers.set(layer, units);
    }

    maxMove = Math.max(maxMove, alignChildUnitsUnderParents(layout, centers));
    if (maxMove < CONVERGENCE_EPS) break;
  }

  anchorMainLineToCenter(layout, centers);
}
