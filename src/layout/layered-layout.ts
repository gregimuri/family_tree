import type { LayoutEdge, LayoutNode, LayoutResult, Project } from '../types';
import type { GraphNode, GraphResult } from './graph-builder';
import { COUPLE_GAP, LAYER_GAP, getCardScale } from './graph-builder';
import { getCardDimensions } from './card-dimensions';
import { getTreeSheetBounds } from './content-bounds';
import { computeBounds } from './layout-bounds';
import { getCenterFocusPoint } from './center-focus';
import { routeCoupleBond, bondEdgeId } from './edge-router';
import { pickPartnersForUnion, buildPedigreeEdges } from './pedigree-edges';

type GraphPersonNode = Extract<GraphNode, { kind: 'person' }>;

function graphPersonNodes(graph: GraphResult): GraphPersonNode[] {
  return graph.nodes.filter((n): n is GraphPersonNode => n.kind === 'person');
}

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

  const cardBounds = computeBounds(nodes);
  const contentCenterX = (cardBounds.minX + cardBounds.maxX) / 2;
  if (Number.isFinite(contentCenterX) && Math.abs(contentCenterX) > 0.5) {
    nodes = nodes.map((n) => ({ ...n, x: n.x - contentCenterX }));
  }

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

/** Начальные координаты: один ряд на слой, слева направо, ряд по центру x=0. */
function buildDefaultLayoutNodes(project: Project, graph: GraphResult): LayoutNode[] {
  const settings = project.viewSettings;
  const byLayer = new Map<number, GraphPersonNode[]>();

  for (const node of graphPersonNodes(graph)) {
    const list = byLayer.get(node.layer) ?? [];
    list.push(node);
    byLayer.set(node.layer, list);
  }

  const nodes: LayoutNode[] = [];

  for (const layer of [...byLayer.keys()].sort((a, b) => a - b)) {
    const row = byLayer.get(layer)!;
    row.sort(
      (a, b) =>
        (a.birthOrder ?? 0) - (b.birthOrder ?? 0) ||
        a.personId.localeCompare(b.personId),
    );

    const sizes = row.map((node) => {
      const scale = getCardScale(
        node.layer,
        node.isSideBranch,
        node.branchDepth,
        settings.cardSizeMode,
      );
      const person = project.persons[node.personId];
      const { w, h } = person
        ? getCardDimensions(project, person, settings, scale)
        : { w: 120 * scale, h: 110 * scale };
      return { node, scale, w, h };
    });

    const rowWidth =
      sizes.reduce((sum, s) => sum + s.w, 0) + Math.max(0, sizes.length - 1) * COUPLE_GAP;
    let x = -rowWidth / 2;
    const centerY = layer * LAYER_GAP;

    for (const { node, scale, w, h } of sizes) {
      nodes.push({
        id: node.id,
        kind: 'person',
        layer: node.layer,
        x,
        y: centerY - h / 2,
        width: w,
        height: h,
        scale,
        isSideBranch: node.isSideBranch,
        personId: node.personId,
        unionId: node.unionId,
      });
      x += w + COUPLE_GAP;
    }
  }

  return nodes;
}

export function computeLayout(graph: GraphResult, project: Project): LayoutResult {
  const nodes = buildDefaultLayoutNodes(project, graph);
  const layout: LayoutResult = {
    nodes,
    edges: buildLayoutEdges(project, nodes, graph),
    bounds: computeBounds(nodes),
  };
  return normalizeLayoutToFocus(project, layout, graph);
}
