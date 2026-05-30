import type { LayoutEdge, LayoutNode, LayoutResult, Project } from '../types';
import type { GraphNode, GraphResult } from './graph-builder';
import { getCardDimensions } from './card-dimensions';
import { getTreeSheetBounds } from './content-bounds';
import { LAYER_GAP, getCardScale } from './graph-builder';
import { getCenterFocusPoint } from './center-focus';
import {
  computeNuclearLayoutNodes,
  mergeNuclearAndPedigreeNodes,
} from './nuclear-tree-adapter';
import { reconcileMergedLayout } from './merge-layout';
import { routeCoupleBond, bondEdgeId } from './edge-router';
import { pickPartnersForUnion, buildPedigreeEdges } from './pedigree-edges';
import { nodeSize, runPedigreeLayout } from './pedigree-layout';

type GraphPersonNode = Extract<GraphNode, { kind: 'person' }>;

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
    bounds: getTreeSheetBounds({ nodes, edges, bounds: layout.bounds }, project),
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

export { computeBounds };

function computePedigreeLayout(graph: GraphResult, project: Project): LayoutResult {
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

  runPedigreeLayout(layers, sortedLayers, graph, nodeById, positions, project);

  const layoutNodes: LayoutNode[] = [];
  for (const layer of sortedLayers) {
    const layerNodes = layers.get(layer)!;
    for (const node of layerNodes) {
      if (node.kind !== 'person') continue;
      const scale = getCardScale(node.layer, node.isSideBranch, node.branchDepth, settings.cardSizeMode);
      const person = project.persons[node.personId];
      const { w, h } = person
        ? getCardDimensions(project, person, settings, scale)
        : nodeSize(scale);
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

  return {
    nodes: layoutNodes,
    edges: buildLayoutEdges(project, layoutNodes, graph),
    bounds: computeBounds(layoutNodes),
  };
}

export function computeLayout(
  graph: GraphResult,
  project: Project,
): LayoutResult {
  const pedigree = computePedigreeLayout(graph, project);
  const nuclearNodes = computeNuclearLayoutNodes(project, graph);
  const mergedNodes = mergeNuclearAndPedigreeNodes(nuclearNodes, pedigree.nodes, graph);
  reconcileMergedLayout(mergedNodes, graph, project);

  const layout: LayoutResult = {
    nodes: mergedNodes,
    edges: buildLayoutEdges(project, mergedNodes, graph),
    bounds: computeBounds(mergedNodes),
  };

  return normalizeLayoutToFocus(project, layout);
}
