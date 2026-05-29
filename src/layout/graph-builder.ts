import type { Person, Project, ViewSettings } from '../types';
import { diedBefore18, sortChildrenByAge } from '../models/person-utils';

export interface GraphPersonNode {
  id: string;
  personId: string;
  layer: number;
  isSideBranch: boolean;
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

const CARD_W = 148;
const CARD_H = 208;
const FAMILY_W = 200;
const FAMILY_H = 110;
const LAYER_GAP = 156;
const NODE_GAP = 48;
const COUPLE_GAP = 10;

export { CARD_W, CARD_H, FAMILY_W, FAMILY_H, LAYER_GAP, NODE_GAP, COUPLE_GAP };

function shouldIncludePerson(person: Person, settings: ViewSettings): boolean {
  if (settings.showDiedBefore18) return true;
  return !diedBefore18(person);
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

export function buildGraph(
  project: Project,
  settings: ViewSettings,
  _manualMode = false,
): GraphResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const personToNode = new Map<string, string>();
  const visitedPersons = new Set<string>();
  const visitedUnions = new Set<string>();

  const center = project.center;
  let startUnionId: string | null = null;
  let startPersonId: string | null = null;

  if (center.type === 'family') {
    startUnionId = project.unions[center.id] ? center.id : null;
  } else {
    startPersonId = project.persons[center.id] ? center.id : null;
    if (startPersonId) {
      const person = project.persons[startPersonId];
      startUnionId = person.unionIds.find((uid) => project.unions[uid]) ?? null;
    }
  }

  if (!startUnionId && !startPersonId) {
    const fallback = Object.values(project.persons)[0];
    if (fallback) {
      startPersonId = fallback.id;
      startUnionId = fallback.unionIds.find((uid) => project.unions[uid]) ?? null;
    }
  }

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
    isSideBranch: boolean,
    branchDepth: number,
    unionId?: string,
    birthOrder?: number,
    parentUnionId?: string,
  ): string | null => {
    if (visitedPersons.has(personId)) {
      const existing = personToNode.get(personId);
      if (existing && unionId) {
        const node = nodes.find((n) => n.id === existing);
        if (node?.kind === 'person' && !node.unionId) node.unionId = unionId;
      }
      return existing ?? null;
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
    isSideBranch: boolean,
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
      const pn = addPerson(pid, layer, isSideBranch, 0, unionId);
      if (pn) partnerNodes.push(pn);
    }
    return partnerNodes;
  };

  const expandAncestors = (personId: string, personLayer: number, isSide: boolean) => {
    const maxUp = settings.generationsUp >= 999 ? 100 : settings.generationsUp;
    if (personLayer - 1 < -maxUp) return;
    const person = project.persons[personId];
    if (!person) return;

    for (const unionId of person.parentUnionIds) {
      const union = project.unions[unionId];
      if (!union) continue;
      const parentLayer = personLayer - 1;
      const partnerNodes = addCoupleUnion(unionId, parentLayer, isSide);
      const childNode = personToNode.get(personId);
      if (childNode) {
        for (const pn of partnerNodes) linkParentChild(pn, childNode);
      }

      if (expandedUpUnions.has(unionId)) continue;
      expandedUpUnions.add(unionId);

      for (const parentId of union.partnerIds) {
        expandAncestors(parentId, parentLayer, isSide);

        const genFromCenter = Math.abs(parentLayer);
        if (genFromCenter === settings.sideBranchesAt && settings.sideBranchesAt > 0) {
          for (const siblingUnionId of project.persons[parentId]?.parentUnionIds ?? []) {
            const sibUnion = project.unions[siblingUnionId];
            if (!sibUnion) continue;
            const sibParentNodes = addCoupleUnion(siblingUnionId, parentLayer - 1, true);
            for (const sibId of sibUnion.childIds) {
              if (sibId === parentId) continue;
              const sid = addPerson(
                sibId,
                parentLayer,
                true,
                0,
                undefined,
                undefined,
                siblingUnionId,
              );
              if (sid) {
                for (const pn of sibParentNodes) linkParentChild(pn, sid);
              }
              expandDescendants(sibId, parentLayer, settings.sideBranchDepth, true, 1);
            }
          }
        }
      }
    }
  };

  const expandDescendants = (
    personId: string,
    personLayer: number,
    depthLeft: number,
    isSide: boolean,
    branchDepth: number,
  ) => {
    if (!isSide && personLayer >= settings.generationsDown) return;
    if (isSide && branchDepth > settings.sideBranchDepth) return;
    const person = project.persons[personId];
    if (!person) return;

    for (const unionId of person.unionIds) {
      const union = project.unions[unionId];
      if (!union) continue;
      if (expandedDownUnions.has(unionId)) continue;
      expandedDownUnions.add(unionId);

      const partnerNodes = addCoupleUnion(unionId, personLayer, isSide);
      const childLayer = personLayer + 1;
      const children = sortChildrenByAge(
        union.childIds.map((id) => project.persons[id]).filter(Boolean),
      );

      children.forEach((child, idx) => {
        if (!shouldIncludePerson(child, settings)) return;
        const cn = addPerson(child.id, childLayer, isSide, branchDepth, undefined, idx, unionId);
        if (cn) {
          for (const pn of partnerNodes) linkParentChild(pn, cn);
        }
        if (isSide) {
          expandDescendants(child.id, childLayer, depthLeft, true, branchDepth + 1);
        } else {
          expandDescendants(child.id, childLayer, settings.generationsDown, false, 0);
        }
      });
    }
  };

  if (startUnionId) {
    addCoupleUnion(startUnionId, 0, false);
    const union = project.unions[startUnionId];
    if (union) {
      for (const pid of union.partnerIds) {
        expandAncestors(pid, 0, false);
        expandDescendants(pid, 0, settings.generationsDown, false, 0);
      }
    }
  } else if (startPersonId) {
    addPerson(startPersonId, 0, false, 0);
    expandAncestors(startPersonId, 0, false);
    expandDescendants(startPersonId, 0, settings.generationsDown, false, 0);
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
