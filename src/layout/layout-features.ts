import type { LayoutNode, Project } from '../types';
import type { GraphResult } from './graph-builder';

/** Количество признаков на узел для LayoutNet. */
export const LAYOUT_FEATURE_COUNT = 12;

export interface LayoutFeatureContext {
  nodes: LayoutNode[];
  graph: GraphResult;
  project: Project;
  nodeById: Map<string, LayoutNode>;
  graphById: Map<string, Extract<GraphResult['nodes'][number], { kind: 'person' }>>;
  siblingIndex: Map<string, number>;
  siblingCount: Map<string, number>;
  childCount: Map<string, number>;
  maxLayer: number;
  maxAbsX: number;
}

function graphPersonNodes(graph: GraphResult) {
  return graph.nodes.filter(
    (n): n is Extract<GraphResult['nodes'][number], { kind: 'person' }> => n.kind === 'person',
  );
}

export function buildLayoutFeatureContext(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
): LayoutFeatureContext {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const graphById = new Map(graphPersonNodes(graph).map((n) => [n.id, n]));
  const siblingIndex = new Map<string, number>();
  const siblingCount = new Map<string, number>();
  const childCount = new Map<string, number>();

  for (const union of Object.values(project.unions)) {
    const children = union.childIds.filter((id) => nodeById.has(id));
    siblingCount.set(union.id, children.length);
    children.forEach((id, index) => siblingIndex.set(id, index));
    for (const partnerId of union.partnerIds) {
      childCount.set(partnerId, (childCount.get(partnerId) ?? 0) + children.length);
    }
  }

  let maxLayer = 1;
  let maxAbsX = 1;
  for (const node of nodes) {
    maxLayer = Math.max(maxLayer, Math.abs(node.layer) + 1);
    maxAbsX = Math.max(maxAbsX, Math.abs(node.x + node.width / 2));
  }

  return {
    nodes,
    graph,
    project,
    nodeById,
    graphById,
    siblingIndex,
    siblingCount,
    childCount,
    maxLayer,
    maxAbsX,
  };
}

function partnerSide(node: LayoutNode, ctx: LayoutFeatureContext): number {
  const gn = ctx.graphById.get(node.id);
  if (!gn?.unionId) return 0;
  const union = ctx.project.unions[gn.unionId];
  if (!union || union.partnerIds.length < 2) return 0;
  const partners = union.partnerIds
    .map((id) => ctx.nodeById.get(id))
    .filter((n): n is LayoutNode => Boolean(n))
    .sort((a, b) => a.x - b.x);
  if (partners.length < 2) return 0;
  if (partners[0].id === node.id) return -1;
  if (partners[partners.length - 1].id === node.id) return 1;
  return 0;
}

function localDensity(node: LayoutNode, ctx: LayoutFeatureContext): number {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  let count = 0;
  for (const other of ctx.nodes) {
    if (other.id === node.id) continue;
    const ox = other.x + other.width / 2;
    const oy = other.y + other.height / 2;
    if (Math.hypot(cx - ox, cy - oy) < 280) count++;
  }
  return Math.min(count / 8, 1);
}

export function extractNodeFeatures(node: LayoutNode, ctx: LayoutFeatureContext): Float32Array {
  const gn = ctx.graphById.get(node.id);
  const person = node.personId ? ctx.project.persons[node.personId] : undefined;
  const features = new Float32Array(LAYOUT_FEATURE_COUNT);

  const layerNorm = node.layer / ctx.maxLayer;
  const siblingIdx =
    gn?.parentUnionId != null ? (ctx.siblingIndex.get(node.personId ?? '') ?? 0) : 0;
  const siblings =
    gn?.parentUnionId != null
      ? (ctx.siblingCount.get(gn.parentUnionId) ?? 1)
      : 1;
  const hasPartner = gn?.unionId && ctx.project.unions[gn.unionId]?.partnerIds.length >= 2 ? 1 : 0;
  const childCnt = node.personId ? (ctx.childCount.get(node.personId) ?? 0) : 0;
  const cx = node.x + node.width / 2;
  const centerDist = Math.min(Math.abs(cx) / ctx.maxAbsX, 1);

  features[0] = layerNorm;
  features[1] = siblings > 1 ? siblingIdx / Math.max(siblings - 1, 1) : 0.5;
  features[2] = Math.min(siblings / 6, 1);
  features[3] = hasPartner;
  features[4] = (partnerSide(node, ctx) + 1) / 2;
  features[5] = Math.min(childCnt / 6, 1);
  features[6] = gn?.isSideBranch ? 1 : 0;
  features[7] = localDensity(node, ctx);
  features[8] = centerDist;
  features[9] = Math.min(node.width / 180, 1);
  features[10] = person?.gender === 'male' ? 1 : person?.gender === 'female' ? 0 : 0.5;
  features[11] = gn?.branchDepth != null ? Math.min(gn.branchDepth / 4, 1) : 0;

  return features;
}

export function extractAllNodeFeatures(ctx: LayoutFeatureContext): Float32Array[] {
  return ctx.nodes.map((node) => extractNodeFeatures(node, ctx));
}
