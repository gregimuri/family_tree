import type { Person, Project, ViewSettings } from '../types';
import { diedBefore18, sortChildrenByAge } from '../models/person-utils';

export type BranchSide = 'main' | 'left' | 'right';

export interface GraphPersonNode {
  id: string;
  personId: string;
  layer: number;
  isSideBranch: boolean;
  branchSide: BranchSide;
  branchDepth: number;
  unionId?: string;
  parentUnionId?: string;
  birthOrder?: number;
}

export interface GraphFamilyNode {
  id: string;
  unionId: string;
  partnerIds: string[];
  layer: number;
  isSideBranch: boolean;
}

export type GraphNode =
  | ({ kind: 'person' } & GraphPersonNode)
  | ({ kind: 'family' } & GraphFamilyNode);

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
}

export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  personToNode: Map<string, string>;
}

import { CARD_H_FULL, CARD_W } from './card-dimensions';

const CARD_H = CARD_H_FULL;
const FAMILY_W = 200;
const FAMILY_H = 110;
/** Расстояние между центрами поколений: не меньше высоты карточки + зазор для линий */
const LAYER_GAP = CARD_H + 48;
const NODE_GAP = 48;
const COUPLE_GAP = 10;
/** Расстояние между группами карточек на одном слое */
const GROUP_GAP = 64;

export { CARD_W, CARD_H, FAMILY_W, FAMILY_H, LAYER_GAP, NODE_GAP, COUPLE_GAP, GROUP_GAP };

function shouldIncludePerson(person: Person, settings: ViewSettings): boolean {
  if (settings.showDiedBefore18) return true;
  return !diedBefore18(person);
}

function isLinkedToFamilyTree(person: Person, project: Project): boolean {
  if (person.parentUnionIds.length > 0 || person.unionIds.length > 0) return true;
  for (const union of Object.values(project.unions)) {
    if (union.partnerIds.includes(person.id) || union.childIds.includes(person.id)) return true;
  }
  return false;
}

function sortPartners(project: Project, partnerIds: string[]): string[] {
  return [...partnerIds].sort((a, b) => {
    const pa = project.persons[a];
    const pb = project.persons[b];
    if (pa?.gender === 'male' && pb?.gender !== 'male') return -1;
    if (pb?.gender === 'male' && pa?.gender !== 'male') return 1;
    return 0;
  });
}

function isStrictDescendant(descendantId: string, ancestorId: string, project: Project): boolean {
  const queue = [ancestorId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === descendantId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const person = project.persons[id];
    if (!person) continue;
    for (const unionId of person.unionIds) {
      const union = project.unions[unionId];
      if (!union) continue;
      for (const childId of union.childIds) queue.push(childId);
    }
  }
  return false;
}

/** Продолжение основной линии вниз: прямые дети центра, предки/потомки центра. */
function childContinuesMainLine(
  childId: string,
  parentId: string,
  startPersonId: string | null,
  useFamilyCenter: boolean,
  project: Project,
): boolean {
  if (useFamilyCenter || !startPersonId) return true;
  if (parentId === startPersonId) return true;
  if (childId === startPersonId) return true;
  if (isStrictDescendant(childId, startPersonId, project)) return true;
  if (isStrictDescendant(startPersonId, childId, project)) return true;
  return false;
}

function graphExpansionLimits(settings: ViewSettings) {
  const showAll = !!settings.showAllPersons;
  return {
    showAll,
    maxUp: showAll || settings.generationsUp >= 999 ? 100 : settings.generationsUp,
    maxDown: showAll ? 999 : settings.generationsDown,
    maxSideDepth: showAll ? 999 : settings.sideBranchDepth,
    allowUp: showAll || settings.generationsUp > 0,
    allowDown: showAll || settings.generationsDown > 0,
    shouldExpandCollateralSiblings: (personLayer: number, isSide: boolean) =>
      !isSide &&
      (showAll ||
        (settings.sideBranchesAt > 0 && Math.abs(personLayer) === settings.sideBranchesAt)),
  };
}

export function buildGraph(
  project: Project,
  settings: ViewSettings,
): GraphResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const personToNode = new Map<string, string>();
  const visitedPersons = new Set<string>();
  const visitedUnions = new Set<string>();

  const center = project.center;
  let startUnionId: string | null = null;
  let startPersonId: string | null = null;
  let useFamilyCenter = false;

  if (center.type === 'family') {
    startUnionId = project.unions[center.id] ? center.id : null;
    useFamilyCenter = !!startUnionId;
  } else {
    startPersonId = project.persons[center.id] ? center.id : null;
  }

  if (!startUnionId && !startPersonId) {
    const fallback = Object.values(project.persons)[0];
    if (fallback) {
      startPersonId = fallback.id;
      startUnionId = fallback.unionIds.find((uid) => project.unions[uid]) ?? null;
      useFamilyCenter = !!startUnionId && center.type === 'family';
    }
  }

  const limits = graphExpansionLimits(settings);

  const linkParentChild = (parentNodeId: string, childNodeId: string) => {
    const edgeId = `${parentNodeId}-${childNodeId}`;
    if (edges.some((e) => e.id === edgeId)) return;
    edges.push({ id: edgeId, from: parentNodeId, to: childNodeId });
  };

  const expandedDownUnions = new Set<string>();
  const expandedUpUnions = new Set<string>();

  const addPerson = (
    personId: string,
    layer: number,
    branchSide: BranchSide,
    branchDepth: number,
    unionId?: string,
    birthOrder?: number,
    parentUnionId?: string,
  ): string | null => {
    const isSideBranch = branchSide !== 'main';
    if (visitedPersons.has(personId)) {
      const existingId = personToNode.get(personId);
      if (existingId) {
        const node = nodes.find((n) => n.id === existingId);
        if (node?.kind === 'person') {
          if (unionId && !node.unionId) node.unionId = unionId;
          const preferMainLine =
            branchSide === 'main' &&
            (node.branchSide !== 'main' || Math.abs(layer) < Math.abs(node.layer));
          if (preferMainLine) {
            node.layer = layer;
            node.branchSide = branchSide;
            node.isSideBranch = false;
            node.branchDepth = branchDepth;
            if (unionId) node.unionId = unionId;
            if (parentUnionId) node.parentUnionId = parentUnionId;
          }
        }
      }
      return existingId ?? null;
    }
    const person = project.persons[personId];
    if (!person || !shouldIncludePerson(person, settings)) return null;
    visitedPersons.add(personId);
    const id = `p-${personId}`;
    nodes.push({
      kind: 'person',
      id,
      personId,
      layer,
      isSideBranch,
      branchSide,
      branchDepth,
      unionId,
      birthOrder,
      parentUnionId,
    });
    personToNode.set(personId, id);
    return id;
  };

  const addCoupleUnion = (
    unionId: string,
    layer: number,
    branchSide: BranchSide,
  ): string[] => {
    const union = project.unions[unionId];
    if (!union) return [];

    const partners = sortPartners(
      project,
      union.partnerIds.filter((pid) => {
        const p = project.persons[pid];
        return p && shouldIncludePerson(p, settings);
      }),
    );
    if (partners.length === 0) return [];

    if (visitedUnions.has(unionId)) {
      return partners
        .map((pid) => personToNode.get(pid))
        .filter((id): id is string => Boolean(id));
    }

    visitedUnions.add(unionId);
    const partnerNodes: string[] = [];
    for (const pid of partners) {
      const pn = addPerson(pid, layer, branchSide, 0, unionId);
      if (pn) partnerNodes.push(pn);
    }
    return partnerNodes;
  };

  const collateralSideForParent = (parentId: string): BranchSide => {
    const parent = project.persons[parentId];
    if (parent?.gender === 'female') return 'left';
    if (parent?.gender === 'male') return 'right';
    return 'right';
  };

  const expandAncestors = (personId: string, personLayer: number, branchSide: BranchSide) => {
    const isSide = branchSide !== 'main';
    if (personLayer - 1 < -limits.maxUp) return;
    const person = project.persons[personId];
    if (!person) return;

    for (const unionId of person.parentUnionIds) {
      const union = project.unions[unionId];
      if (!union) continue;
      const parentLayer = personLayer - 1;
      const partnerNodes = addCoupleUnion(unionId, parentLayer, branchSide);
      const childNode = personToNode.get(personId);
      if (childNode) {
        for (const pn of partnerNodes) linkParentChild(pn, childNode);
      }

      if (limits.shouldExpandCollateralSiblings(personLayer, isSide)) {
        const siblingSide = collateralSideForParent(personId);
        for (const sibId of union.childIds) {
          if (sibId === personId) continue;
          const sid = addPerson(
            sibId,
            personLayer,
            siblingSide,
            0,
            undefined,
            undefined,
            unionId,
          );
          if (sid) {
            for (const pn of partnerNodes) linkParentChild(pn, sid);
          }
          if (sid && limits.allowDown) {
            expandDescendants(
              sibId,
              personLayer,
              limits.maxSideDepth,
              siblingSide,
              1,
            );
          }
        }
      }

      if (expandedUpUnions.has(unionId)) continue;
      expandedUpUnions.add(unionId);

      for (const parentId of union.partnerIds) {
        expandAncestors(parentId, parentLayer, branchSide);
      }
    }
  };

  const expandDescendants = (
    personId: string,
    personLayer: number,
    depthLeft: number,
    branchSide: BranchSide,
    branchDepth: number,
  ) => {
    const isSide = branchSide !== 'main';
    if (!isSide && !limits.showAll && personLayer >= settings.generationsDown) return;
    if (isSide && branchDepth > limits.maxSideDepth) return;
    const person = project.persons[personId];
    if (!person) return;

    for (const unionId of person.unionIds) {
      const union = project.unions[unionId];
      if (!union) continue;
      if (expandedDownUnions.has(unionId)) continue;
      expandedDownUnions.add(unionId);

      const partnerNodes = addCoupleUnion(unionId, personLayer, branchSide);
      const childLayer = personLayer + 1;
      const children = sortChildrenByAge(
        union.childIds.map((id) => project.persons[id]).filter(Boolean),
      );

      children.forEach((child, idx) => {
        if (!shouldIncludePerson(child, settings)) return;

        let childSide = branchSide;
        let childDepth = branchDepth;
        const onMainLine =
          isSide ||
          childContinuesMainLine(child.id, personId, startPersonId, useFamilyCenter, project);
        if (!isSide && !onMainLine) {
          childSide = collateralSideForParent(personId);
          childDepth = 1;
        }

        const cn = addPerson(
          child.id,
          childLayer,
          childSide,
          childDepth,
          undefined,
          idx,
          unionId,
        );
        if (cn) {
          for (const pn of partnerNodes) linkParentChild(pn, cn);
        }
        if (childSide !== 'main') {
          expandDescendants(child.id, childLayer, depthLeft, childSide, childDepth + 1);
        } else {
          expandDescendants(child.id, childLayer, limits.maxDown, 'main', 0);
        }
      });
    }
  };

  if (useFamilyCenter && startUnionId) {
    addCoupleUnion(startUnionId, 0, 'main');
    const union = project.unions[startUnionId];
    if (union) {
      for (const pid of union.partnerIds) {
        if (limits.allowUp) expandAncestors(pid, 0, 'main');
        if (limits.allowDown) expandDescendants(pid, 0, limits.maxDown, 'main', 0);
      }
    }
  } else if (startPersonId) {
    addPerson(startPersonId, 0, 'main', 0);
    const centered = project.persons[startPersonId];
    if (centered) {
      for (const unionId of centered.unionIds) {
        addCoupleUnion(unionId, 0, 'main');
      }
    }
    if (limits.allowUp) expandAncestors(startPersonId, 0, 'main');
    if (limits.allowDown) expandDescendants(startPersonId, 0, limits.maxDown, 'main', 0);
  }

  for (const personId of Object.keys(project.persons)) {
    if (personToNode.has(personId)) continue;
    const person = project.persons[personId];
    if (!person || !shouldIncludePerson(person, settings)) continue;
    if (limits.showAll) {
      addPerson(personId, 0, 'right', 99);
      continue;
    }
    if (person.parentUnionIds.length > 0 || person.unionIds.length > 0) continue;
    if (isLinkedToFamilyTree(person, project)) continue;
    addPerson(personId, 0, 'right', 99);
  }

  return { nodes, edges, personToNode };
}

export function getCardScale(
  layer: number,
  isSideBranch: boolean,
  branchDepth: number,
  mode: ViewSettings['cardSizeMode'],
): number {
  if (mode === 'uniform') return 1;
  let scale = 1;
  const absLayer = Math.abs(layer);
  if (absLayer >= 4) scale = Math.min(scale, 0.75);
  if (isSideBranch && branchDepth >= 2) scale = Math.min(scale, 0.8);
  if (isSideBranch && absLayer >= 2) scale = Math.min(scale, 0.85);
  return scale;
}
