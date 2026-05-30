import type { LayoutResult, ManualLayoutEntry, Project } from '../types';
import type { GraphResult } from './graph-builder';
import { buildGraph } from './graph-builder';
import { buildLayoutEdges, computeBounds, computeLayout } from './layered-layout';
import { getTreeSheetBounds } from './content-bounds';
import { applyManualEdgeRoutes } from './manual-edge-routes';

/** Center coordinates for persons visible in layout but not yet pinned in manualLayout. */
export function collectMissingLayoutPositions(
  project: Project,
  layout: LayoutResult,
  personIds?: string[],
): Record<string, ManualLayoutEntry> {
  const manual = project.manualLayout ?? {};
  const filter = personIds ? new Set(personIds) : null;
  const patch: Record<string, ManualLayoutEntry> = {};

  for (const node of layout.nodes) {
    if (!node.personId || manual[node.personId]) continue;
    if (filter && !filter.has(node.personId)) continue;
    patch[node.personId] = {
      x: node.x + node.width / 2,
      y: node.y + node.height / 2,
    };
  }

  return patch;
}

function applyStoredPositions(
  layout: LayoutResult,
  project: Project,
  graph: GraphResult,
): LayoutResult {
  const manual = project.manualLayout;
  if (!manual || Object.keys(manual).length === 0) return layout;

  const nodes = layout.nodes.map((n) => {
    if (!n.personId) return n;
    const entry = manual[n.personId];
    if (!entry) return n;
    return { ...n, x: entry.x - n.width / 2, y: entry.y - n.height / 2 };
  });

  const edges = buildLayoutEdges(project, nodes, graph);
  return {
    nodes,
    edges,
    bounds: getTreeSheetBounds({ nodes, edges, bounds: layout.bounds }, project),
  };
}

export function buildLayout(project: Project): LayoutResult {
  const graph = buildGraph(project, project.viewSettings);
  let layout = computeLayout(graph, project);
  layout = repositionOrphanNodes(layout, project);
  layout = applyStoredPositions(layout, project, graph);
  layout = applyManualEdgeRoutes(layout, project);
  return { ...layout, bounds: getTreeSheetBounds(layout, project) };
}

function repositionOrphanNodes(layout: LayoutResult, project: Project): LayoutResult {
  const manual = project.manualLayout ?? {};
  const linked = new Set<string>();
  for (const p of Object.values(project.persons)) {
    if (p.unionIds.length > 0 || p.parentUnionIds.length > 0) linked.add(p.id);
  }

  const orphans = layout.nodes.filter(
    (n) => n.personId && !linked.has(n.personId) && !manual[n.personId],
  );
  if (orphans.length === 0) return layout;

  const y = layout.bounds.maxY + 64;
  const orphanIds = new Set(orphans.map((n) => n.personId!));
  const totalWidth =
    orphans.reduce((sum, n) => sum + n.width, 0) + Math.max(0, orphans.length - 1) * 48;
  let x = -totalWidth / 2;

  const nodes = layout.nodes.map((n) => {
    if (!n.personId || !orphanIds.has(n.personId)) return n;
    const placed = { ...n, x, y };
    x += n.width + 48;
    return placed;
  });

  return {
    ...layout,
    nodes,
    bounds: computeBounds(nodes),
  };
}

/** @deprecated use applyStoredPositions via buildLayout */
export function applyManualLayout(
  layout: LayoutResult,
  project: Project,
  graph: GraphResult,
): LayoutResult {
  return applyStoredPositions(layout, project, graph);
}

/** @deprecated use applyStoredPositions */
export function mergeManualLayout(layout: LayoutResult, project: Project): LayoutResult {
  if (!project.manualLayout) return layout;
  const nodes = layout.nodes.map((n) => {
    if (n.kind !== 'person' || !n.personId) return n;
    const manual = project.manualLayout![n.personId];
    if (!manual) return n;
    return { ...n, x: manual.x - n.width / 2, y: manual.y - n.height / 2 };
  });
  return { ...layout, nodes, bounds: computeBounds(nodes) };
}

export { computeNuclearTreeLayout } from './nuclear-tree-layout';
export type { LayoutPerson as NuclearLayoutPerson, LayoutOptions as NuclearLayoutOptions } from './nuclear-tree-layout';
export { personToLayoutPerson, resolveLayoutRootId, computeNuclearLayoutNodes } from './nuclear-tree-adapter';
