import type { LayoutNode, Project } from '../types';
import type { GraphNode, GraphResult } from './graph-builder';
import { COUPLE_GAP, getCardScale, GROUP_GAP, LAYER_GAP } from './graph-builder';
import { CARD_W } from './card-dimensions';
import { shouldUseNuclearPosition } from './nuclear-tree-adapter';

type PersonGraphNode = Extract<GraphNode, { kind: 'person' }>;
const SIBLING_GAP = 24;
const SIDE_BRANCH_GAP = 96;

function nodeCenterX(node: LayoutNode): number {
  return node.x + node.width / 2;
}

function graphNodeById(graph: GraphResult): Map<string, PersonGraphNode> {
  const map = new Map<string, PersonGraphNode>();
  for (const node of graph.nodes) {
    if (node.kind === 'person') map.set(node.id, node);
  }
  return map;
}

function isNuclearMainLine(graphNode: PersonGraphNode): boolean {
  return shouldUseNuclearPosition(graphNode);
}

function collectAncestryGraphIds(
  seedIds: string[],
  graph: GraphResult,
  graphById: Map<string, PersonGraphNode>,
): Set<string> {
  const seen = new Set<string>();
  const queue = [...seedIds];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);

    const node = graphById.get(id);
    if (!node?.parentUnionId) continue;

    for (const candidate of graph.nodes) {
      if (candidate.kind !== 'person') continue;
      if (candidate.unionId === node.parentUnionId) {
        queue.push(candidate.id);
      }
    }
  }

  return seen;
}

function collectSideBranchDescendants(
  seedIds: string[],
  graph: GraphResult,
  graphById: Map<string, PersonGraphNode>,
): Set<string> {
  const down = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const from = graphById.get(edge.from);
    const to = graphById.get(edge.to);
    if (!from || !to || from.layer >= to.layer) continue;
    const list = down.get(edge.from) ?? [];
    list.push(edge.to);
    down.set(edge.from, list);
  }

  const seen = new Set<string>();
  const queue = [...seedIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    const node = graphById.get(id);
    if (!node?.isSideBranch && !seedIds.includes(id)) continue;
    seen.add(id);
    for (const child of down.get(id) ?? []) queue.push(child);
  }
  return seen;
}

function minGapBetween(left: PersonGraphNode, right: PersonGraphNode): number {
  if (left.unionId && left.unionId === right.unionId && left.layer === right.layer) {
    return COUPLE_GAP;
  }
  if (
    left.parentUnionId &&
    left.parentUnionId === right.parentUnionId &&
    left.layer === right.layer
  ) {
    return SIBLING_GAP;
  }
  if (left.isSideBranch || right.isSideBranch) return SIDE_BRANCH_GAP;
  return GROUP_GAP;
}

function cardHalfWidth(node: PersonGraphNode, settings: Project['viewSettings']): number {
  const scale = getCardScale(node.layer, node.isSideBranch, node.branchDepth, settings.cardSizeMode);
  return (CARD_W * scale) / 2;
}

/** Сдвигает предков и боковые ветки под ядерные координаты потомков. */
function alignPedigreeToNuclearSeam(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
): void {
  const graphById = graphNodeById(graph);
  const byGraphId = new Map(nodes.map((n) => [n.id, n]));
  const layers = [...new Set(nodes.map((n) => n.layer))].sort((a, b) => a - b);

  for (const childLayer of layers) {
    if (childLayer <= 0) continue;
    const parentLayer = childLayer - 1;

    for (const union of Object.values(project.unions)) {
      const childNodes = nodes.filter((n) => {
        const gn = graphById.get(n.id);
        return gn && gn.layer === childLayer && gn.parentUnionId === union.id;
      });
      const parentNodes = nodes.filter((n) => {
        const gn = graphById.get(n.id);
        return gn && gn.layer === parentLayer && gn.unionId === union.id;
      });

      if (childNodes.length === 0 || parentNodes.length === 0) continue;
      if (!childNodes.some((n) => isNuclearMainLine(graphById.get(n.id)!))) continue;

      const childCenter =
        childNodes.reduce((sum, n) => sum + nodeCenterX(n), 0) / childNodes.length;
      const parentCenter =
        parentNodes.reduce((sum, n) => sum + nodeCenterX(n), 0) / parentNodes.length;
      const delta = childCenter - parentCenter;
      if (Math.abs(delta) < 0.5) continue;

      const ancestry = collectAncestryGraphIds(
        parentNodes.map((n) => n.id),
        graph,
        graphById,
      );
      const sideBranches = collectSideBranchDescendants(
        parentNodes.map((n) => n.id),
        graph,
        graphById,
      );
      const shiftIds = new Set([...ancestry, ...sideBranches]);

      for (const id of shiftIds) {
        const layoutNode = byGraphId.get(id);
        const graphNode = graphById.get(id);
        if (!layoutNode || !graphNode || isNuclearMainLine(graphNode)) continue;
        layoutNode.x += delta;
      }
    }
  }

  // Предки над центральной парой (layer < 0 → layer 0)
  for (const union of Object.values(project.unions)) {
    const childNodes = nodes.filter((n) => {
      const gn = graphById.get(n.id);
      return gn && gn.layer === 0 && gn.parentUnionId === union.id && isNuclearMainLine(gn);
    });
    const parentNodes = nodes.filter((n) => {
      const gn = graphById.get(n.id);
      return gn && gn.layer === -1 && gn.unionId === union.id;
    });
    if (childNodes.length === 0 || parentNodes.length === 0) continue;

    const childCenter =
      childNodes.reduce((sum, n) => sum + nodeCenterX(n), 0) / childNodes.length;
    const parentCenter =
      parentNodes.reduce((sum, n) => sum + nodeCenterX(n), 0) / parentNodes.length;
    const delta = childCenter - parentCenter;
    if (Math.abs(delta) < 0.5) continue;

    const shiftIds = new Set([
      ...collectAncestryGraphIds(
        parentNodes.map((n) => n.id),
        graph,
        graphById,
      ),
      ...nodes
        .filter((n) => {
          const gn = graphById.get(n.id);
          return gn?.isSideBranch && gn.layer <= 0;
        })
        .map((n) => n.id),
    ]);

    for (const id of shiftIds) {
      const layoutNode = byGraphId.get(id);
      const graphNode = graphById.get(id);
      if (!layoutNode || !graphNode || isNuclearMainLine(graphNode)) continue;
      layoutNode.x += delta;
    }
  }
}

function resolveLayerCollisions(
  layerNodes: LayoutNode[],
  graphById: Map<string, PersonGraphNode>,
  project: Project,
): void {
  if (layerNodes.length <= 1) return;

  const settings = project.viewSettings;
  const sorted = [...layerNodes].sort((a, b) => a.x - b.x);

  for (let round = 0; round < 48; round++) {
    let moved = 0;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const prevG = graphById.get(prev.id)!;
      const currG = graphById.get(curr.id)!;

      const required =
        nodeCenterX(prev) +
        cardHalfWidth(prevG, settings) +
        minGapBetween(prevG, currG) +
        cardHalfWidth(currG, settings);

      const currCenter = nodeCenterX(curr);
      if (currCenter + 0.01 >= required) continue;

      const delta = required - currCenter;
      const prevAnchored = isNuclearMainLine(prevG);
      const currAnchored = isNuclearMainLine(currG);

      if (prevG.unionId && prevG.unionId === currG.unionId && prevG.layer === currG.layer) {
        continue;
      }

      if (prevAnchored && !currAnchored) {
        curr.x += delta;
      } else if (!prevAnchored && currAnchored) {
        prev.x -= delta;
      } else if (!prevAnchored && !currAnchored) {
        curr.x += delta;
      } else {
        const half = delta / 2;
        prev.x -= half;
        curr.x += half;
      }
      moved = Math.max(moved, delta);
    }
    if (moved < 0.4) break;
  }
}

/** Единая вертикальная сетка по graph.layer (pedigree), не nuclear generation Y. */
function normalizeNodesToLayerY(nodes: LayoutNode[], layerGap = LAYER_GAP): void {
  for (const node of nodes) {
    const centerY = node.layer * layerGap;
    node.y = centerY - node.height / 2;
  }
}

function resolveMergedCollisions(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
): void {
  const graphById = graphNodeById(graph);
  const byLayer = new Map<number, LayoutNode[]>();

  for (const node of nodes) {
    const list = byLayer.get(node.layer) ?? [];
    list.push(node);
    byLayer.set(node.layer, list);
  }

  for (const layerNodes of byLayer.values()) {
    resolveLayerCollisions(layerNodes, graphById, project);
  }
}

/** Согласование pedigree + nuclear и устранение наложений после merge. */
export function reconcileMergedLayout(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
): void {
  if (nodes.length === 0) return;
  normalizeNodesToLayerY(nodes);
  alignPedigreeToNuclearSeam(nodes, graph, project);
  resolveMergedCollisions(nodes, graph, project);
}
