import type { LayoutNode, Project } from '../types';
import type { GraphResult } from './graph-builder';
import { COUPLE_GAP } from './graph-builder';
import { CARD_GRID_CELL } from './card-dimensions';
import { buildLayoutFeatureContext, extractNodeFeatures } from './layout-features';
import {
  CARD_GRID_CELL as ENERGY_GRID,
  computeLayoutEnergy,
  DEFAULT_ENERGY_WEIGHTS,
} from './layout-energy';
import { predictLayoutDeltas } from './layout-net';
import { resolveLayoutCollisions } from './merge-layout';

export interface RefineLayoutOptions {
  pinnedPersonIds?: ReadonlySet<string>;
  useNetwork?: boolean;
  energyIterations?: number;
}

function pinnedSet(project: Project, override?: ReadonlySet<string>): ReadonlySet<string> {
  if (override) return override;
  return new Set(Object.keys(project.manualLayout ?? {}));
}

function isPinned(node: LayoutNode, pinned: ReadonlySet<string>): boolean {
  return Boolean(node.personId && pinned.has(node.personId));
}

function applyNetworkDeltas(
  nodes: LayoutNode[],
  deltas: Float32Array[],
  pinned: ReadonlySet<string>,
): void {
  const maxShift = CARD_GRID_CELL * 3;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (isPinned(node, pinned)) continue;
    const dx = Math.max(-maxShift, Math.min(maxShift, deltas[i]?.[0] ?? 0));
    node.x += dx;
  }
}

function minimizeEnergy(
  nodes: LayoutNode[],
  project: Project,
  pinned: ReadonlySet<string>,
  iterations: number,
): void {
  const edges: never[] = [];
  const step = ENERGY_GRID / 2;
  const candidates = [-step, -step / 2, 0, step / 2, step];

  for (let round = 0; round < iterations; round++) {
    let improved = false;
    for (const node of nodes) {
      if (isPinned(node, pinned)) continue;
      const baseEnergy = computeLayoutEnergy(nodes, edges, project);
      let bestDx = 0;
      let bestEnergy = baseEnergy;

      for (const dx of candidates) {
        if (dx === 0) continue;
        const clone = nodes.map((n) => (n.id === node.id ? { ...n, x: n.x + dx } : n));
        const e = computeLayoutEnergy(clone, edges, project);
        if (e < bestEnergy) {
          bestEnergy = e;
          bestDx = dx;
        }
      }

      if (bestDx !== 0) {
        node.x += bestDx;
        improved = true;
      }
    }
    if (!improved) break;
  }
}

/**
 * LayoutNet refiner: ML nudge + energy minimization + collision resolution.
 * Y координаты не меняются (привязка к layer).
 */
export function refineLayoutSync(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
  options: RefineLayoutOptions = {},
): LayoutNode[] {
  const pinned = pinnedSet(project, options.pinnedPersonIds);
  const useNetwork = false;
  const iterations = options.energyIterations ?? 24;

  if (nodes.length === 0) return nodes;

  const ctx = buildLayoutFeatureContext(nodes, graph, project);
  const features = nodes.map((node) => extractNodeFeatures(node, ctx));

  if (useNetwork) {
    const deltas = predictLayoutDeltas(features);
    applyNetworkDeltas(nodes, deltas, pinned);
  }

  minimizeEnergy(nodes, project, pinned, Math.min(8, iterations));
  resolveLayoutCollisions(nodes, graph, project, pinned);
  enforceCoupleSpacingPinned(nodes, graph, project, pinned);
  resolveLayoutCollisions(nodes, graph, project, pinned);

  minimizeEnergy(nodes, project, pinned, Math.min(6, iterations));
  resolveLayoutCollisions(nodes, graph, project, pinned);

  return nodes;
}

/** Async refiner with TF.js model when available. */
export async function refineLayoutAsync(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
  options: RefineLayoutOptions = {},
): Promise<LayoutNode[]> {
  const pinned = pinnedSet(project, options.pinnedPersonIds);
  const useNetwork = options.useNetwork !== false && project.viewSettings.smartLayoutEnabled !== false;

  if (useNetwork && nodes.length > 0) {
    const ctx = buildLayoutFeatureContext(nodes, graph, project);
    const features = nodes.map((node) => extractNodeFeatures(node, ctx));
    const { predictLayoutDeltasAsync } = await import('./layout-net');
    const deltas = await predictLayoutDeltasAsync(features);
    applyNetworkDeltas(nodes, deltas, pinned);
  }

  return refineLayoutSync(nodes, graph, project, { ...options, useNetwork: false });
}

function enforceCoupleSpacingPinned(
  nodes: LayoutNode[],
  _graph: GraphResult,
  project: Project,
  pinned: ReadonlySet<string>,
): void {
  const byPerson = new Map(nodes.filter((n) => n.personId).map((n) => [n.personId!, n]));

  for (const union of Object.values(project.unions)) {
    if (union.partnerIds.length < 2) continue;
    const partners = union.partnerIds.map((id) => byPerson.get(id)).filter(Boolean) as LayoutNode[];
    if (partners.length < 2 || partners[0].layer !== partners[1].layer) continue;
    const sorted = [...partners].sort((a, b) => a.x - b.x);
    const left = sorted[0];
    const right = sorted[1];
    const needX = left.x + left.width + COUPLE_GAP;
    if (right.x >= needX - 0.5) continue;
    const shift = needX - right.x;
    if (!pinned.has(right.personId ?? '')) {
      right.x = needX;
    } else if (!pinned.has(left.personId ?? '')) {
      left.x -= shift;
    }
  }
}

export { DEFAULT_ENERGY_WEIGHTS };
