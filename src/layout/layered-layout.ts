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
import { reconcileMergedLayout, stabilizeFamilyLayout, restoreCrossUnionParentAlignment } from './merge-layout';
import { refineLayoutSync } from './layout-refiner';
import { routeCoupleBond, bondEdgeId } from './edge-router';
import { pickPartnersForUnion, buildPedigreeEdges } from './pedigree-edges';
import { nodeSize, runPedigreeLayout } from './pedigree-layout';
import { runFamilyLayout } from './family-layout';

type GraphPersonNode = Extract<GraphNode, { kind: 'person' }>;

function collectLineageAncestorPersonIds(project: Project): Set<string> | null {
  if (project.center.type !== 'person') return null;
  const centerId = project.center.id;
  const result = new Set<string>();
  const queue = [centerId];
  const seen = new Set<string>([centerId]);

  while (queue.length > 0) {
    const pid = queue.shift()!;
    for (const puid of project.persons[pid]?.parentUnionIds ?? []) {
      const union = project.unions[puid];
      if (!union) continue;
      for (const parentId of union.partnerIds) {
        if (seen.has(parentId)) continue;
        seen.add(parentId);
        result.add(parentId);
        queue.push(parentId);
      }
    }
  }
  return result;
}

/** После normalize: предки центра по центру над focus (x≈0). */
function alignLineageAncestryToFocus(
  project: Project,
  layout: LayoutResult,
  graph: GraphResult,
): LayoutResult {
  const focus = getCenterFocusPoint(project, layout);
  const lineageIds = collectLineageAncestorPersonIds(project);
  if (!focus || !lineageIds || lineageIds.size === 0) return layout;

  const graphById = new Map<string, Extract<GraphResult['nodes'][number], { kind: 'person' }>>();
  for (const node of graph.nodes) {
    if (node.kind === 'person') graphById.set(node.id, node);
  }

  const centerNode = layout.nodes.find((n) => n.personId === project.center.id);
  if (!centerNode) return layout;

  const mainAncestors = layout.nodes.filter((n) => {
    if (!n.personId || !lineageIds.has(n.personId)) return false;
    const gn = graphById.get(n.id);
    if (!gn || gn.layer >= centerNode.layer || gn.isSideBranch) return false;
    return true;
  });
  if (mainAncestors.length === 0) return layout;

  const minX = Math.min(...mainAncestors.map((n) => n.x));
  const maxX = Math.max(...mainAncestors.map((n) => n.x + n.width));
  const ancestorCenter = (minX + maxX) / 2;
  const delta = focus.x - ancestorCenter;
  if (Math.abs(delta) < 1) return layout;

  const nodes = layout.nodes.map((n) => {
    if (!n.personId || !lineageIds.has(n.personId)) return n;
    const gn = graphById.get(n.id);
    if (!gn || gn.layer >= centerNode.layer) return n;
    return { ...n, x: n.x + delta };
  });

  return {
    nodes,
    edges: buildLayoutEdges(project, nodes, graph),
    bounds: computeBounds(nodes),
  };
}

function normalizeLayoutToFocus(
  project: Project,
  layout: LayoutResult,
  graph: GraphResult,
): LayoutResult {
  const focus = getCenterFocusPoint(project, layout);
  if (!focus) return layout;

  // По Y — центр выбранной персоны/пары; по X — геометрический центр всего видимого дерева.
  let nodes = layout.nodes.map((n) => ({ ...n, y: n.y - focus.y }));
  let edges = buildLayoutEdges(project, nodes, graph);

  let normalized: LayoutResult = {
    nodes,
    edges,
    bounds: getTreeSheetBounds({ nodes, edges, bounds: layout.bounds }, project),
  };

  normalized = alignLineageAncestryToFocus(project, normalized, graph);

  const bounds = getTreeSheetBounds(normalized, project);
  const contentCenterX = (bounds.minX + bounds.maxX) / 2;
  if (Math.abs(contentCenterX) > 0.5) {
    nodes = normalized.nodes.map((n) => ({ ...n, x: n.x - contentCenterX }));
    edges = buildLayoutEdges(project, nodes, graph);
    normalized = {
      nodes,
      edges,
      bounds: getTreeSheetBounds({ nodes, edges, bounds: normalized.bounds }, project),
    };
  }

  return normalized;
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
  const layoutEngine = project.viewSettings.layoutEngine ?? 'family';

  if (layoutEngine === 'family') {
    const mergedNodes = runFamilyLayout(project, graph);
    const pinnedPersonIds = new Set(Object.keys(project.manualLayout ?? {}));

    stabilizeFamilyLayout(mergedNodes, graph, project, pinnedPersonIds);

    if (project.viewSettings.smartLayoutEnabled !== false && mergedNodes.length <= 50) {
      refineLayoutSync(mergedNodes, graph, project, { pinnedPersonIds });
      restoreCrossUnionParentAlignment(mergedNodes, project, graph);
    }
    stabilizeFamilyLayout(mergedNodes, graph, project, pinnedPersonIds);

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
