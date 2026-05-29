import type { LayoutResult, Project } from '../types';
import type { GraphResult } from './graph-builder';
import { buildGraph } from './graph-builder';
import { buildLayoutEdges, computeBounds, computeLayout } from './layered-layout';

export function applyManualLayout(
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

  return {
    nodes,
    edges: buildLayoutEdges(project, nodes, graph),
    bounds: computeBounds(nodes),
  };
}

export function buildLayout(project: Project, _manualMode = false): LayoutResult {
  const graph = buildGraph(project, project.viewSettings);
  const layout = computeLayout(graph, project);
  return applyManualLayout(layout, project, graph);
}

/** @deprecated use applyManualLayout */
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
