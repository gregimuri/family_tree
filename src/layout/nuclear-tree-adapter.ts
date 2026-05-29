import type { LayoutNode, Person, Project } from '../types';
import type { GraphNode, GraphResult } from './graph-builder';
import { CARD_W, COUPLE_GAP, GROUP_GAP, LAYER_GAP, getCardScale } from './graph-builder';
import { CARD_H_TEXT, getCardDimensions } from './card-dimensions';
import {
  computeNuclearTreeLayout,
  type LayoutOptions,
  type LayoutPerson,
} from './nuclear-tree-layout';

type GraphPersonNode = Extract<GraphNode, { kind: 'person' }>;

/** Преобразует персону проекта в упрощённую модель для ядерного алгоритма. */
export function personToLayoutPerson(person: Person, project: Project): LayoutPerson {
  let fatherId: string | null = null;
  let motherId: string | null = null;

  for (const unionId of person.parentUnionIds) {
    const union = project.unions[unionId];
    if (!union) continue;
    for (const partnerId of union.partnerIds) {
      const partner = project.persons[partnerId];
      if (!partner) continue;
      if (partner.gender === 'male') fatherId = partnerId;
      else if (partner.gender === 'female') motherId = partnerId;
      else if (fatherId === null) fatherId = partnerId;
      else if (motherId === null) motherId = partnerId;
    }
  }

  const spouseIds: string[] = [];
  for (const unionId of person.unionIds) {
    const union = project.unions[unionId];
    if (!union) continue;
    for (const partnerId of union.partnerIds) {
      if (partnerId === person.id) continue;
      if (!spouseIds.includes(partnerId)) spouseIds.push(partnerId);
    }
  }

  return {
    id: person.id,
    name: `${person.givenName} ${person.surname}`.trim(),
    fatherId,
    motherId,
    spouseIds,
  };
}

/** Корень нисходящего древа из настроек центра проекта. */
export function resolveLayoutRootId(project: Project): string {
  const { center } = project;
  if (center.type === 'person' && project.persons[center.id]) {
    return center.id;
  }
  if (center.type === 'family') {
    const union = project.unions[center.id];
    if (union && union.partnerIds.length > 0) {
      const maleId = union.partnerIds.find((id) => project.persons[id]?.gender === 'male');
      return maleId ?? union.partnerIds[0];
    }
  }
  return Object.keys(project.persons)[0] ?? '';
}

export function graphPersonNodes(graph: GraphResult): GraphPersonNode[] {
  return graph.nodes.filter((n): n is GraphPersonNode => n.kind === 'person');
}

export function buildNuclearLayoutOptions(project: Project): LayoutOptions {
  const settings = project.viewSettings;
  const scale = getCardScale(0, false, 0, settings.cardSizeMode);
  const nodeHeight = CARD_H_TEXT * scale;
  return {
    nodeWidth: CARD_W * scale,
    nodeHeight,
    verticalGap: LAYER_GAP - nodeHeight,
    horizontalGap: GROUP_GAP,
    spouseGap: COUPLE_GAP,
  };
}

export function projectPersonsForGraph(project: Project, graph: GraphResult): LayoutPerson[] {
  const ids = new Set(graphPersonNodes(graph).map((n) => n.personId));
  return [...ids]
    .map((id) => project.persons[id])
    .filter(Boolean)
    .map((p) => personToLayoutPerson(p, project));
}

/** Узел основной линии с layer >= 0 — координаты из ядерного алгоритма. */
export function shouldUseNuclearPosition(node: GraphPersonNode): boolean {
  return !node.isSideBranch && node.layer >= 0;
}

/** Раскладка узлов ядерным алгоритмом (центры → top-left с учётом размеров карточек). */
export function computeNuclearLayoutNodes(project: Project, graph: GraphResult): LayoutNode[] {
  const settings = project.viewSettings;
  const rootId = resolveLayoutRootId(project);
  const layoutPersons = projectPersonsForGraph(project, graph);
  const options = buildNuclearLayoutOptions(project);
  const nuclear = computeNuclearTreeLayout(layoutPersons, rootId, options);

  const graphByPersonId = new Map<string, GraphPersonNode>();
  for (const node of graphPersonNodes(graph)) {
    graphByPersonId.set(node.personId, node);
  }

  const layoutNodes: LayoutNode[] = [];
  for (const [personId, center] of nuclear.positions) {
    const graphNode = graphByPersonId.get(personId);
    const person = project.persons[personId];
    if (!graphNode || !person) continue;

    const scale = getCardScale(
      graphNode.layer,
      graphNode.isSideBranch,
      graphNode.branchDepth,
      settings.cardSizeMode,
    );
    const { w, h } = getCardDimensions(project, person, settings, scale);

    layoutNodes.push({
      id: graphNode.id,
      kind: 'person',
      layer: graphNode.layer,
      x: center.x - w / 2,
      y: center.y - h / 2,
      width: w,
      height: h,
      scale,
      isSideBranch: graphNode.isSideBranch,
      personId,
      unionId: graphNode.unionId,
    });
  }

  return layoutNodes;
}

/** Сливает узлы: ядерный алгоритм для основной линии, pedigree — для предков и боковых веток. */
export function mergeNuclearAndPedigreeNodes(
  nuclearNodes: LayoutNode[],
  pedigreeNodes: LayoutNode[],
  graph: GraphResult,
): LayoutNode[] {
  const nuclearByPerson = new Map(
    nuclearNodes.filter((n) => n.personId).map((n) => [n.personId!, n]),
  );
  const pedigreeByPerson = new Map(
    pedigreeNodes.filter((n) => n.personId).map((n) => [n.personId!, n]),
  );

  const merged: LayoutNode[] = [];
  for (const node of graphPersonNodes(graph)) {
    const useNuclear = shouldUseNuclearPosition(node) && nuclearByPerson.has(node.personId);
    const picked = useNuclear ? nuclearByPerson.get(node.personId)! : pedigreeByPerson.get(node.personId);
    if (!picked) continue;
    merged.push({
      ...picked,
      id: node.id,
      layer: node.layer,
      isSideBranch: node.isSideBranch,
      unionId: node.unionId ?? picked.unionId,
    });
  }
  return merged;
}

export type { LayoutPerson, LayoutOptions };
