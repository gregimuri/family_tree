import type { LayoutEdge, LayoutNode, LayoutResult, Project } from '../types';
import type { GraphResult } from './graph-builder';
import { getTreeSheetBounds } from './content-bounds';
import { computeBounds } from './layout-bounds';
import { LAYER_GAP } from './graph-builder';
import { getCenterFocusPoint } from './center-focus';
import { enforcePedigreeLayerY } from './layout-grid';
import { routeCoupleBond, bondEdgeId } from './edge-router';
import { pickPartnersForUnion, buildPedigreeEdges } from './pedigree-edges';
import { runAncestorLayout } from './ancestor-layout';

function normalizeLayoutToFocus(
  project: Project,
  layout: LayoutResult,
  graph: GraphResult,
): LayoutResult {
  const focus = getCenterFocusPoint(project, layout);
  if (!focus) return layout;

  let nodes = layout.nodes.map((n) => ({
    ...n,
    x: n.x - focus.x,
    y: n.y - focus.y,
  }));

  const edges = buildLayoutEdges(project, nodes, graph);
  return {
    nodes,
    edges,
    bounds: getTreeSheetBounds({ nodes, edges, bounds: layout.bounds }, project),
  };
}

export function buildLayoutEdges(
  project: Project,
  layoutNodes: LayoutNode[],
  graph: GraphResult,
): LayoutEdge[] {
  const pedigreeEdges = buildPedigreeEdges(project, layoutNodes, graph);

  const coupleBonds: LayoutEdge[] = [];
  const seenBonds = new Set<string>();
  const nodeByPersonId = new Map<string, LayoutNode>();
  for (const node of layoutNodes) {
    if (node.personId) nodeByPersonId.set(node.personId, node);
  }

  const visibleUnionIds = new Set<string>();
  for (const node of layoutNodes) {
    if (node.unionId) visibleUnionIds.add(node.unionId);
    if (!node.personId) continue;
    const person = project.persons[node.personId];
    if (!person) continue;
    for (const unionId of person.unionIds) visibleUnionIds.add(unionId);
  }

  for (const unionId of visibleUnionIds) {
    const union = project.unions[unionId];
    if (!union || union.partnerIds.length < 2) continue;

    const partners = union.partnerIds
      .map((id) => nodeByPersonId.get(id))
      .filter((n): n is LayoutNode => Boolean(n));
    if (partners.length < 2) continue;

    const children = union.childIds
      .map((id) => nodeByPersonId.get(id))
      .filter((n): n is LayoutNode => Boolean(n));

    const bondPartners = pickPartnersForUnion(partners, children);
    const sorted = [...(bondPartners.length >= 2 ? bondPartners : partners)].sort((a, b) => {
      const pa = project.persons[a.personId!];
      const pb = project.persons[b.personId!];
      if (pa?.gender === 'male' && pb?.gender !== 'male') return -1;
      if (pb?.gender === 'male' && pa?.gender !== 'male') return 1;
      return a.x - b.x;
    });
    if (sorted.length < 2) continue;

    const left = sorted[0];
    const right = sorted[sorted.length - 1];
    const id = bondEdgeId(unionId);
    if (seenBonds.has(id)) continue;
    seenBonds.add(id);
    coupleBonds.push({
      id,
      from: left.id,
      to: right.id,
      points: routeCoupleBond(left, right),
    });
  }

  return [...coupleBonds, ...pedigreeEdges];
}

export { computeBounds } from './layout-bounds';

export function computeLayout(graph: GraphResult, project: Project): LayoutResult {
  const mergedNodes = runAncestorLayout(project, graph);
  enforcePedigreeLayerY(mergedNodes, LAYER_GAP);

  const layout: LayoutResult = {
    nodes: mergedNodes,
    edges: buildLayoutEdges(project, mergedNodes, graph),
    bounds: computeBounds(mergedNodes),
  };
  return normalizeLayoutToFocus(project, layout, graph);
}
