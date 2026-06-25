import type { LayoutEdge, LayoutNode, LayoutResult, Project } from '../types';
import type { GraphNode, GraphResult } from './graph-builder';
import { getCardDimensions } from './card-dimensions';
import { getTreeSheetBounds } from './content-bounds';
import { computeBounds } from './layout-bounds';
import { LAYER_GAP, getCardScale } from './graph-builder';
import { getCenterFocusPoint } from './center-focus';
import {
  computeNuclearLayoutNodes,
  mergeNuclearAndPedigreeNodes,
} from './nuclear-tree-adapter';
import { reconcileMergedLayout, stabilizeFamilyLayout, restoreCrossUnionParentAlignment, resolveCompactLayoutOverlaps, alignAncestryRowOverMainCouple } from './merge-layout';
import { findLayerHorizontalOverlap } from './layout-zones';
import { enforcePedigreeLayerY } from './layout-grid';
import { refineLayoutSync } from './layout-refiner';
import { routeCoupleBond, bondEdgeId } from './edge-router';
import { pickPartnersForUnion, buildPedigreeEdges } from './pedigree-edges';
import { nodeSize, runPedigreeLayout } from './pedigree-layout';
import { runFamilyLayout } from './family-layout';
import { runCenterOutLayout } from './center-out-layout';

type GraphPersonNode = Extract<GraphNode, { kind: 'person' }>;

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
  const layoutEngine = project.viewSettings.layoutEngine ?? 'center-out';

  if (layoutEngine === 'center-out') {
    const mergedNodes = runCenterOutLayout(project, graph);
    enforcePedigreeLayerY(mergedNodes, LAYER_GAP);

    const layout: LayoutResult = {
      nodes: mergedNodes,
      edges: buildLayoutEdges(project, mergedNodes, graph),
      bounds: computeBounds(mergedNodes),
    };
    return normalizeLayoutToFocus(project, layout, graph);
  }

  if (layoutEngine === 'family') {
    const mergedNodes = runFamilyLayout(project, graph);
    const pinnedPersonIds = new Set(Object.keys(project.manualLayout ?? {}));
    const compactFamilyPost =
      !project.viewSettings.showAllPersons || mergedNodes.length <= 30;

    if (compactFamilyPost) {
      restoreCrossUnionParentAlignment(mergedNodes, project, graph);
      for (let pass = 0; pass < 6; pass++) {
        if (!findLayerHorizontalOverlap(mergedNodes, 2)) break;
        resolveCompactLayoutOverlaps(mergedNodes, graph, pinnedPersonIds);
      }
      alignAncestryRowOverMainCouple(mergedNodes, graph, project);
      for (let pass = 0; pass < 6; pass++) {
        if (!findLayerHorizontalOverlap(mergedNodes, 1)) break;
        resolveCompactLayoutOverlaps(mergedNodes, graph, pinnedPersonIds);
      }
    } else {
      alignAncestryRowOverMainCouple(mergedNodes, graph, project);
    }
    enforcePedigreeLayerY(mergedNodes, LAYER_GAP);

    if (project.viewSettings.smartLayoutEnabled !== false && mergedNodes.length <= 50) {
      refineLayoutSync(mergedNodes, graph, project, { pinnedPersonIds });
      restoreCrossUnionParentAlignment(mergedNodes, project, graph);
      stabilizeFamilyLayout(mergedNodes, graph, project, pinnedPersonIds, { mode: 'compact' });
    }

    const layout: LayoutResult = {
      nodes: mergedNodes,
      edges: buildLayoutEdges(project, mergedNodes, graph),
      bounds: computeBounds(mergedNodes),
    };
    return normalizeLayoutToFocus(project, layout, graph);
  }

  const pedigree = computePedigreeLayout(graph, project);
  const nuclearNodes = computeNuclearLayoutNodes(project, graph);
  const mergedNodes = mergeNuclearAndPedigreeNodes(nuclearNodes, pedigree.nodes, graph);
  reconcileMergedLayout(mergedNodes, graph, project);

  const pinnedPersonIds = new Set(Object.keys(project.manualLayout ?? {}));
  if (project.viewSettings.smartLayoutEnabled !== false) {
    refineLayoutSync(mergedNodes, graph, project, { pinnedPersonIds });
  }
  stabilizeFamilyLayout(mergedNodes, graph, project, pinnedPersonIds);

  const layout: LayoutResult = {
    nodes: mergedNodes,
    edges: buildLayoutEdges(project, mergedNodes, graph),
    bounds: computeBounds(mergedNodes),
  };

  return normalizeLayoutToFocus(project, layout, graph);
}
