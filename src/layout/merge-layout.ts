import type { LayoutNode, Project } from '../types';
import type { GraphNode, GraphResult } from './graph-builder';
import { COUPLE_GAP, GROUP_GAP, LAYER_GAP } from './graph-builder';
import { shouldUseNuclearPosition } from './nuclear-tree-adapter';
import {
  enforceSideBranchCorridors,
  findLayerHorizontalOverlap,
  applyLayerRepulsion,
  MAIN_SIDE_GAP,
} from './layout-zones';

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

function collectDownstreamGraphIds(
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
    seen.add(id);
    for (const child of down.get(id) ?? []) queue.push(child);
  }
  return seen;
}

function shiftLayoutNodes(
  graphIds: Iterable<string>,
  delta: number,
  byGraphId: Map<string, LayoutNode>,
): void {
  if (Math.abs(delta) < 0.01) return;
  for (const id of graphIds) {
    const node = byGraphId.get(id);
    if (node) node.x += delta;
  }
}

/** Дети одного union на одном слое — в плотный ряд под родителями (без «разъезда» nuclear-блоков). */
function compactSiblingGroups(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
): void {
  const graphById = graphNodeById(graph);
  const byGraphId = new Map(nodes.map((n) => [n.id, n]));

  for (const union of Object.values(project.unions)) {
    if (union.childIds.length < 2) continue;

    type ChildEntry = { gn: PersonGraphNode; ln: LayoutNode };
    const childEntries: ChildEntry[] = [];
    for (const personId of union.childIds) {
      const graphId = graph.personToNode.get(personId);
      if (!graphId) continue;
      const gn = graphById.get(graphId);
      const ln = byGraphId.get(graphId);
      if (gn && ln) childEntries.push({ gn, ln });
    }

    const byLayer = new Map<number, ChildEntry[]>();
    for (const entry of childEntries) {
      const list = byLayer.get(entry.gn.layer) ?? [];
      list.push(entry);
      byLayer.set(entry.gn.layer, list);
    }

    for (const [layer, group] of byLayer) {
      if (group.length < 2) continue;

      type ChildEntry = { gn: PersonGraphNode; ln: LayoutNode };
      const mainGroup = group.filter((e) => !e.gn.isSideBranch);
      const sideGroup = group.filter((e) => e.gn.isSideBranch);

      const parentNodes = union.partnerIds
        .map((personId) => {
          const graphId = graph.personToNode.get(personId);
          if (!graphId) return null;
          const gn = graphById.get(graphId);
          const ln = byGraphId.get(graphId);
          if (!gn || !ln || gn.layer !== layer - 1) return null;
          return ln;
        })
        .filter((n): n is LayoutNode => Boolean(n));

      const parentCenter =
        parentNodes.length > 0
          ? coupleBondCenter(parentNodes)
          : group.reduce((sum, entry) => sum + nodeCenterX(entry.ln), 0) / group.length;

      const compactRow = (entries: ChildEntry[], anchorCenter: number) => {
        if (entries.length < 2) return;
        const sorted = [...entries].sort((a, b) => a.ln.x - b.ln.x);
        const totalWidth =
          sorted.reduce((sum, entry) => sum + entry.ln.width, 0) +
          SIBLING_GAP * (sorted.length - 1);
        let cursor = anchorCenter - totalWidth / 2;
        for (const entry of sorted) {
          const delta = cursor - entry.ln.x;
          if (Math.abs(delta) > 0.5) {
            const moveIds = collectDownstreamGraphIds([entry.gn.id], graph, graphById);
            moveIds.add(entry.gn.id);
            shiftLayoutNodes(moveIds, delta, byGraphId);
          }
          cursor += entry.ln.width + SIBLING_GAP;
        }
      };

      compactRow(mainGroup, parentCenter);
      compactRow(sideGroup, parentCenter);
    }
  }
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
  if (left.isSideBranch !== right.isSideBranch) return MAIN_SIDE_GAP;
  if (left.isSideBranch || right.isSideBranch) return SIDE_BRANCH_GAP;
  return GROUP_GAP;
}

function layoutHalfWidth(node: LayoutNode): number {
  return node.width / 2;
}

function coupleBondCenter(partners: LayoutNode[]): number {
  if (partners.length === 0) return 0;
  if (partners.length === 1) return nodeCenterX(partners[0]);
  const sorted = [...partners].sort((a, b) => a.x - b.x);
  return (nodeCenterX(sorted[0]) + nodeCenterX(sorted[sorted.length - 1])) / 2;
}

function childrenGroupCenter(children: LayoutNode[]): number {
  const minX = Math.min(...children.map((n) => n.x));
  const maxX = Math.max(...children.map((n) => n.x + n.width));
  return (minX + maxX) / 2;
}

function collectShiftIds(
  rootGraphIds: string[],
  graph: GraphResult,
  graphById: Map<string, PersonGraphNode>,
  mode: 'downstream' | 'ancestry',
): Set<string> {
  const ids = new Set<string>();
  for (const rootId of rootGraphIds) {
    ids.add(rootId);
    const extra =
      mode === 'downstream'
        ? collectDownstreamGraphIds([rootId], graph, graphById)
        : collectAncestryGraphIds([rootId], graph, graphById);
    for (const id of extra) ids.add(id);
  }
  return ids;
}

/** Центрирует группу детей под серединой линии между партнёрами. */
function alignChildrenToCoupleBonds(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
): void {
  const graphById = graphNodeById(graph);
  const byGraphId = new Map(nodes.map((n) => [n.id, n]));

  for (const union of Object.values(project.unions)) {
    if (union.childIds.length === 0) continue;

    const parentLayerByUnion = new Map<number, { gn: PersonGraphNode; ln: LayoutNode }[]>();
    for (const personId of union.partnerIds) {
      const graphId = graph.personToNode.get(personId);
      if (!graphId) continue;
      const gn = graphById.get(graphId);
      const ln = byGraphId.get(graphId);
      if (!gn || !ln) continue;
      const list = parentLayerByUnion.get(gn.layer) ?? [];
      list.push({ gn, ln });
      parentLayerByUnion.set(gn.layer, list);
    }

    for (const [parentLayer, parentEntries] of parentLayerByUnion) {
      const childLayer = parentLayer + 1;
      const childEntries = union.childIds
        .map((personId) => {
          const graphId = graph.personToNode.get(personId);
          if (!graphId) return null;
          const gn = graphById.get(graphId);
          const ln = byGraphId.get(graphId);
          if (!gn || !ln || gn.layer !== childLayer) return null;
          return { gn, ln };
        })
        .filter((entry): entry is { gn: PersonGraphNode; ln: LayoutNode } => Boolean(entry));

      if (childEntries.length === 0) continue;
      if (parentLayer < 0) continue;

      const bondCenter = coupleBondCenter(parentEntries.map((entry) => entry.ln));
      const childCenter = childrenGroupCenter(childEntries.map((entry) => entry.ln));
      const delta = bondCenter - childCenter;
      if (Math.abs(delta) < 0.5) continue;

      const shiftIds = collectShiftIds(
        childEntries.map((entry) => entry.gn.id),
        graph,
        graphById,
        'downstream',
      );
      shiftLayoutNodes(shiftIds, delta, byGraphId);
    }
  }
}

/** Сдвигает весь ряд предков (layer < 0) под центральную пару на layer 0. */
function alignAncestryRowOverMainCouple(
  nodes: LayoutNode[],
  graph: GraphResult,
): void {
  const graphById = graphNodeById(graph);

  const mainCouple = nodes.filter((n) => {
    const gn = graphById.get(n.id);
    return gn && gn.layer === 0 && !gn.isSideBranch && gn.unionId;
  });
  if (mainCouple.length < 2) return;

  const coupleCenter = coupleBondCenter(mainCouple);
  const ancestorNodes = nodes.filter((n) => {
    const gn = graphById.get(n.id);
    return gn && gn.layer < 0;
  });
  if (ancestorNodes.length === 0) return;

  const ancestorCenter =
    ancestorNodes.reduce((sum, n) => sum + nodeCenterX(n), 0) / ancestorNodes.length;
  const delta = coupleCenter - ancestorCenter;
  if (Math.abs(delta) < 0.5) return;

  for (const node of ancestorNodes) {
    node.x += delta;
  }
}

/** Согласование pedigree + nuclear: предки над детьми, потомки под парой. */
function alignPedigreeToNuclearSeam(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
): void {
  alignAncestryRowOverMainCouple(nodes, graph);
  alignChildrenToCoupleBonds(nodes, graph, project);
}



function enforceCoupleSpacing(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
): void {
  const graphById = graphNodeById(graph);
  const byGraphId = new Map(nodes.map((n) => [n.id, n]));

  for (const union of Object.values(project.unions)) {
    if (union.partnerIds.length < 2) continue;

    type PartnerEntry = { gn: PersonGraphNode; ln: LayoutNode; personId: string };
    const partners: PartnerEntry[] = [];
    for (const personId of union.partnerIds) {
      const graphId = graph.personToNode.get(personId);
      if (!graphId) continue;
      const gn = graphById.get(graphId);
      const ln = byGraphId.get(graphId);
      if (gn && ln) partners.push({ gn, ln, personId });
    }
    if (partners.length < 2) continue;

    const byLayer = new Map<number, PartnerEntry[]>();
    for (const entry of partners) {
      const list = byLayer.get(entry.gn.layer) ?? [];
      list.push(entry);
      byLayer.set(entry.gn.layer, list);
    }

    for (const group of byLayer.values()) {
      if (group.length < 2) continue;
      const sorted = [...group].sort((a, b) => {
        const pa = project.persons[a.personId];
        const pb = project.persons[b.personId];
        if (pa?.gender === 'male' && pb?.gender !== 'male') return -1;
        if (pb?.gender === 'male' && pa?.gender !== 'male') return 1;
        return a.ln.x - b.ln.x;
      });
      const left = sorted[0].ln;
      const right = sorted[1].ln;
      const center = (nodeCenterX(left) + nodeCenterX(right)) / 2;
      const totalW = left.width + COUPLE_GAP + right.width;
      left.x = center - totalW / 2;
      right.x = left.x + left.width + COUPLE_GAP;
    }
  }
}

function resolveLayerCollisions(
  layerNodes: LayoutNode[],
  graphById: Map<string, PersonGraphNode>,
  _project: Project,
  pinnedPersonIds?: ReadonlySet<string>,
): void {
  if (layerNodes.length <= 1) return;

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
        layoutHalfWidth(prev) +
        minGapBetween(prevG, currG) +
        layoutHalfWidth(curr);

      const currCenter = nodeCenterX(curr);
      if (currCenter + 0.01 >= required) continue;

      const delta = required - currCenter;
      const prevAnchored = isNuclearMainLine(prevG);
      const currAnchored = isNuclearMainLine(currG);
      const prevSide = prevG.isSideBranch;
      const currSide = currG.isSideBranch;

      if (prevG.unionId && prevG.unionId === currG.unionId && prevG.layer === currG.layer) {
        const left = prev.x <= curr.x ? prev : curr;
        const right = prev.x <= curr.x ? curr : prev;
        const needX = left.x + left.width + COUPLE_GAP;
        const shift = needX - right.x;
        if (shift > 0.01 && !pinnedPersonIds?.has(right.personId ?? '')) {
          right.x = needX;
          moved = Math.max(moved, shift);
        }
        continue;
      }

      if (prevSide && !currSide && !pinnedPersonIds?.has(prev.personId ?? '')) {
        prev.x -= delta;
      } else if (!prevSide && currSide && !pinnedPersonIds?.has(curr.personId ?? '')) {
        curr.x += delta;
      } else if (prevAnchored && !currAnchored && !pinnedPersonIds?.has(curr.personId ?? '')) {
        curr.x += delta;
      } else if (!prevAnchored && currAnchored && !pinnedPersonIds?.has(prev.personId ?? '')) {
        prev.x -= delta;
      } else if (!prevAnchored && !currAnchored && !pinnedPersonIds?.has(curr.personId ?? '')) {
        curr.x += delta;
      } else if (prevSide && currSide && !pinnedPersonIds?.has(curr.personId ?? '')) {
        curr.x += delta;
      } else if (!pinnedPersonIds?.has(curr.personId ?? '')) {
        curr.x += delta;
      } else if (!pinnedPersonIds?.has(prev.personId ?? '')) {
        prev.x -= delta;
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
  pinnedPersonIds?: ReadonlySet<string>,
): void {
  const graphById = graphNodeById(graph);
  const byLayer = new Map<number, LayoutNode[]>();

  for (const node of nodes) {
    const list = byLayer.get(node.layer) ?? [];
    list.push(node);
    byLayer.set(node.layer, list);
  }

  for (const layerNodes of byLayer.values()) {
    resolveLayerCollisions(layerNodes, graphById, project, pinnedPersonIds);
  }
}

/** Устранение горизонтальных наложений карточек по слоям. */
export function resolveLayoutCollisions(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
  pinnedPersonIds?: ReadonlySet<string>,
): void {
  resolveMergedCollisions(nodes, graph, project, pinnedPersonIds);
}

/** Финальная стабилизация: дети под парой, предки над детьми, без наложений. */
export function stabilizeFamilyLayout(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
  pinnedPersonIds?: ReadonlySet<string>,
): void {
  for (let pass = 0; pass < 6; pass++) {
    enforceSideBranchCorridors(nodes, graph, project, pinnedPersonIds);
    compactSiblingGroups(nodes, graph, project);
    alignAncestryRowOverMainCouple(nodes, graph);
    alignChildrenToCoupleBonds(nodes, graph, project);
    enforceCoupleSpacing(nodes, graph, project);
    resolveMergedCollisions(nodes, graph, project, pinnedPersonIds);
    applyLayerRepulsion(nodes, graph, pinnedPersonIds);
    if (!findLayerHorizontalOverlap(nodes, 2)) break;
  }
  enforceCoupleSpacing(nodes, graph, project);
  enforceSideBranchCorridors(nodes, graph, project, pinnedPersonIds);
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
  stabilizeFamilyLayout(nodes, graph, project);
}
