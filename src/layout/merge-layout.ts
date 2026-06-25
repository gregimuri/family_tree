import type { LayoutNode, Project } from '../types';
import type { GraphNode, GraphResult } from './graph-builder';
import { COUPLE_GAP, GROUP_GAP, LAYER_GAP } from './graph-builder';
import { shouldUseNuclearPosition } from './nuclear-tree-adapter';
import { unionHasCrossUnionMarriedChild } from './family-layout/cross-union';
import {
  enforceSideBranchCorridors,
  findLayerHorizontalOverlap,
  applyLayerRepulsion,
} from './layout-zones';
import { SIBLING_GAP, SIDE_BRANCH_GAP, MAIN_SIDE_GAP } from './family-layout/types';

type PersonGraphNode = Extract<GraphNode, { kind: 'person' }>;

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

function collectMoveIdsWithSameLayerSpouse(
  entry: { gn: PersonGraphNode },
  graph: GraphResult,
  graphById: Map<string, PersonGraphNode>,
  project: Project,
): Set<string> {
  const moveIds = collectDownstreamGraphIds([entry.gn.id], graph, graphById);
  moveIds.add(entry.gn.id);

  const person = project.persons[entry.gn.personId];
  for (const unionId of person?.unionIds ?? []) {
    const union = project.unions[unionId];
    if (!union || union.partnerIds.length < 2) continue;
    const partnerId = union.partnerIds.find((id) => id !== entry.gn.personId);
    if (!partnerId) continue;
    const partnerGraphId = graph.personToNode.get(partnerId);
    if (!partnerGraphId) continue;
    const partnerGn = graphById.get(partnerGraphId);
    if (!partnerGn || partnerGn.layer !== entry.gn.layer) continue;
    moveIds.add(partnerGraphId);
    for (const id of collectDownstreamGraphIds([partnerGraphId], graph, graphById)) {
      moveIds.add(id);
    }
  }
  return moveIds;
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
    if (unionHasCrossUnionMarriedChild(union.childIds, project)) continue;

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
            const moveIds = collectMoveIdsWithSameLayerSpouse(
              entry,
              graph,
              graphById,
              project,
            );
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
    if (unionHasCrossUnionMarriedChild(union.childIds, project)) continue;

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

function focusCoupleCenter(
  nodes: LayoutNode[],
  graphById: Map<string, PersonGraphNode>,
  project: Project,
): number | null {
  if (project.center.type === 'person') {
    const centerNode = nodes.find((n) => n.personId === project.center.id);
    if (centerNode) {
      if (centerNode.unionId) {
        const couple = nodes.filter(
          (n) => n.unionId === centerNode.unionId && n.layer === centerNode.layer,
        );
        if (couple.length >= 2) return coupleBondCenter(couple);
      }
      return nodeCenterX(centerNode);
    }
  }

  const mainCouple = nodes.filter((n) => {
    const gn = graphById.get(n.id);
    return gn && gn.layer === 0 && !gn.isSideBranch && gn.unionId;
  });
  if (mainCouple.length >= 2) return coupleBondCenter(mainCouple);
  return null;
}

export function alignAncestryRowOverMainCouple(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
): void {
  const graphById = graphNodeById(graph);
  const coupleCenter = focusCoupleCenter(nodes, graphById, project);
  if (coupleCenter === null) return;

  const lineageIds = collectLineageAncestorPersonIds(project);

  const mainAncestors = nodes.filter((n) => {
    const gn = graphById.get(n.id);
    if (!gn || gn.layer >= 0 || gn.isSideBranch || !n.personId) return false;
    if (lineageIds && !lineageIds.has(n.personId)) return false;
    return true;
  });
  if (mainAncestors.length === 0) return;

  const minX = Math.min(...mainAncestors.map((n) => n.x));
  const maxX = Math.max(...mainAncestors.map((n) => n.x + n.width));
  const ancestorCenter = (minX + maxX) / 2;
  const delta = coupleCenter - ancestorCenter;
  if (Math.abs(delta) < 0.5) return;

  const shiftedLineageIds = new Set<string>();
  for (const node of nodes) {
    const gn = graphById.get(node.id);
    if (!gn || gn.layer >= 0) continue;
    if (lineageIds) {
      if (!node.personId || !lineageIds.has(node.personId)) continue;
    }
    if (gn.isSideBranch) continue;
    shiftedLineageIds.add(node.personId!);
    node.x += delta;
  }

  // Collateral siblings of shifted lineage on the same layer move together (e.g. uncle with father).
  for (const node of nodes) {
    const gn = graphById.get(node.id);
    if (!gn || gn.layer >= 0 || !node.personId || !gn.isSideBranch) continue;
    const person = project.persons[node.personId];
    if (!person) continue;
    const sharesParentUnion = person.parentUnionIds.some((uid) => {
      const union = project.unions[uid];
      return union?.childIds.some((cid) => shiftedLineageIds.has(cid));
    });
    if (sharesParentUnion) node.x += delta;
  }
}

/** Согласование pedigree + nuclear: предки над детьми, потомки под парой. */
function alignPedigreeToNuclearSeam(
  nodes: LayoutNode[],
  graph: GraphResult,
  project: Project,
): void {
  alignAncestryRowOverMainCouple(nodes, graph, project);
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
    if (union.childIds.length > 0 && unionHasCrossUnionMarriedChild(union.childIds, project)) {
      continue;
    }

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

function nodeRightEdge(node: LayoutNode): number {
  return node.x + node.width;
}

function shiftSameLayerCardGroup(
  seed: LayoutNode,
  delta: number,
  layer: number,
  layerNodes: LayoutNode[],
  graphById: Map<string, PersonGraphNode>,
  pinnedPersonIds?: ReadonlySet<string>,
): void {
  if (Math.abs(delta) < 0.01) return;
  const gn = graphById.get(seed.id);
  if (!gn) return;

  const ids = new Set<string>([seed.id]);
  if (gn.unionId) {
    for (const node of layerNodes) {
      const g = graphById.get(node.id);
      if (g && g.layer === layer && g.unionId === gn.unionId) ids.add(node.id);
    }
  }

  for (const node of layerNodes) {
    if (!ids.has(node.id)) continue;
    if (node.personId && pinnedPersonIds?.has(node.personId)) continue;
    node.x += delta;
  }
}

/** Компактно убирает наложения карточек на слое (без разноса боковых веток). */
export function resolveCompactLayoutOverlaps(
  nodes: LayoutNode[],
  graph: GraphResult,
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
    for (let round = 0; round < 24; round++) {
      const sorted = [...layerNodes].sort((a, b) => a.x - b.x);
      let moved = 0;
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const prevG = graphById.get(prev.id);
        const currG = graphById.get(curr.id);
        if (!prevG || !currG) continue;

        let minGap = GROUP_GAP;
        if (prevG.unionId && prevG.unionId === currG.unionId && prevG.layer === currG.layer) {
          minGap = COUPLE_GAP;
        } else if (
          prevG['parentUnionId'] &&
          prevG['parentUnionId'] === currG['parentUnionId'] &&
          prevG.layer === currG.layer
        ) {
          minGap = SIBLING_GAP;
        }

        const needX = nodeRightEdge(prev) + minGap;
        if (curr.x + 0.5 >= needX) continue;

        const delta = needX - curr.x;
        shiftSameLayerCardGroup(curr, delta, currG.layer, layerNodes, graphById, pinnedPersonIds);
        moved = Math.max(moved, delta);
      }
      if (moved < 0.4) break;
    }
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
  options?: { skipAncestryAlign?: boolean; mode?: 'full' | 'compact' },
): void {
  const compact = options?.mode === 'compact';
  const maxPasses = compact ? 4 : 6;

  for (let pass = 0; pass < maxPasses; pass++) {
    if (!compact) {
      enforceSideBranchCorridors(nodes, graph, project, pinnedPersonIds);
    }
    compactSiblingGroups(nodes, graph, project);
    alignChildrenToCoupleBonds(nodes, graph, project);
    enforceCoupleSpacing(nodes, graph, project);
    resolveMergedCollisions(nodes, graph, project, pinnedPersonIds);
    if (!compact) {
      applyLayerRepulsion(nodes, graph, pinnedPersonIds);
    }
    if (!findLayerHorizontalOverlap(nodes, 2)) break;
  }
  enforceCoupleSpacing(nodes, graph, project);
  if (!compact) {
    enforceSideBranchCorridors(nodes, graph, project, pinnedPersonIds);
  }
  restoreCrossUnionParentAlignment(nodes, project, graph);
  resolveMergedCollisions(nodes, graph, project, pinnedPersonIds);
  if (!options?.skipAncestryAlign && !compact) {
    alignAncestryRowOverMainCouple(nodes, graph, project);
    resolveMergedCollisions(nodes, graph, project, pinnedPersonIds);
  }
}

/** После stabilize: родители с «чужими» браками детей — над рядом детей. */
export function restoreCrossUnionParentAlignment(
  nodes: LayoutNode[],
  project: Project,
  graph: GraphResult,
): void {
  const byPerson = new Map<string, LayoutNode>();
  for (const node of nodes) {
    if (node.personId) byPerson.set(node.personId, node);
  }

  for (const union of Object.values(project.unions)) {
    if (union.childIds.length === 0 || !unionHasCrossUnionMarriedChild(union.childIds, project)) {
      continue;
    }

    const parentLayer = Math.min(
      ...union.partnerIds
        .map((id) => graph.personToNode.get(id))
        .map((gid) => (gid ? graph.nodes.find((n) => n.id === gid) : undefined))
        .filter((n): n is PersonGraphNode => n?.kind === 'person')
        .map((n) => n.layer),
    );
    const childLayer = parentLayer + 1;

    const parents = union.partnerIds
      .map((id) => byPerson.get(id))
      .filter((n): n is LayoutNode => Boolean(n && n.layer === parentLayer));
    const directChildren = union.childIds
      .map((id) => byPerson.get(id))
      .filter((n): n is LayoutNode => Boolean(n && n.layer === childLayer));
    if (parents.length === 0 || directChildren.length === 0) continue;

    const rowNodes: LayoutNode[] = [];
    const seen = new Set<string>();
    for (const child of directChildren) {
      if (!child.personId || seen.has(child.id)) continue;
      seen.add(child.id);
      rowNodes.push(child);
      for (const uid of project.persons[child.personId]?.unionIds ?? []) {
        const marriage = project.unions[uid];
        if (!marriage || marriage.partnerIds.length < 2) continue;
        const partnerId = marriage.partnerIds.find((id) => id !== child.personId);
        if (!partnerId) continue;
        const partner = byPerson.get(partnerId);
        if (partner && partner.layer === child.layer && !seen.has(partner.id)) {
          seen.add(partner.id);
          rowNodes.push(partner);
        }
      }
    }

    const childMin = Math.min(...rowNodes.map((n) => n.x));
    const childMax = Math.max(...rowNodes.map((n) => n.x + n.width));
    const childCenter = (childMin + childMax) / 2;

    const sortedParents = [...parents].sort((a, b) => a.x - b.x);
    if (sortedParents.length >= 2) {
      const left = sortedParents[0];
      const right = sortedParents[1];
      const totalW = left.width + COUPLE_GAP + right.width;
      left.x = childCenter - totalW / 2;
      right.x = left.x + left.width + COUPLE_GAP;
    } else if (sortedParents.length === 1) {
      sortedParents[0].x = childCenter - sortedParents[0].width / 2;
    }
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
  stabilizeFamilyLayout(nodes, graph, project);
}
