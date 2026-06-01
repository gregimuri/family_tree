import type { LayoutEdge, LayoutNode, Project, Union } from '../types';
import type { GraphPersonNode, GraphResult } from './graph-builder';
import { formatMarriageDates } from '../models/person-utils';
import {
  getCoupleBondGeometry,
  marriageStemStartY,
  pedigreeFamilyConnectorPathWithBondStem,
  snapEdgeCoord,
} from './edge-router';

function getGraphPerson(graph: GraphResult, personId: string): GraphPersonNode | undefined {
  const nodeId = graph.personToNode.get(personId);
  if (!nodeId) return undefined;
  const node = graph.nodes.find((n) => n.id === nodeId);
  return node?.kind === 'person' ? node : undefined;
}

function sortPartners(nodes: LayoutNode[], project: Project): LayoutNode[] {
  return [...nodes].sort((a, b) => {
    const pa = project.persons[a.personId!];
    const pb = project.persons[b.personId!];
    if (pa?.gender === 'male' && pb?.gender !== 'male') return -1;
    if (pb?.gender === 'male' && pa?.gender !== 'male') return 1;
    return a.x - b.x;
  });
}

function sortChildren(nodes: LayoutNode[]): LayoutNode[] {
  return [...nodes].sort((a, b) => a.x - b.x);
}

/** Partners must share a layer — otherwise pedigree lines stretch across the tree. */
export function pickPartnersForUnion(
  partners: LayoutNode[],
  children: LayoutNode[],
): LayoutNode[] {
  if (partners.length <= 1) return partners;

  const groups = new Map<number, LayoutNode[]>();
  for (const partner of partners) {
    const list = groups.get(partner.layer) ?? [];
    list.push(partner);
    groups.set(partner.layer, list);
  }

  if (groups.size === 1) return partners;

  const parentLayer =
    children.length > 0 ? Math.min(...children.map((c) => c.layer)) - 1 : null;

  if (parentLayer !== null && groups.has(parentLayer)) {
    return groups.get(parentLayer)!;
  }

  let best = partners;
  let bestScore = -1;
  for (const group of groups.values()) {
    const score = group.length * 100 - Math.abs(group[0].layer) * 10;
    if (score > bestScore) {
      bestScore = score;
      best = group;
    }
  }
  return best;
}

function unionShowsMarriageLabel(
  partners: LayoutNode[],
  union: Union | undefined,
  project: Project,
): boolean {
  const marriageFormat = project.viewSettings.cardFields.marriageDateFormat;
  return (
    partners.length > 1 &&
    marriageFormat !== 'hidden' &&
    !!union &&
    !!formatMarriageDates(union, marriageFormat)
  );
}

function getCoupleBondAnchor(
  partners: LayoutNode[],
  project: Project,
  union?: Union,
): {
  bondY: number;
  midX: number;
  stemStartY: number;
  leftBondX: number;
  rightBondX: number;
} {
  const sortedPartners = sortPartners(partners, project);
  const left = sortedPartners[0];
  const right = sortedPartners[sortedPartners.length - 1];
  const showMarriageLabel = unionShowsMarriageLabel(sortedPartners, union, project);
  const { bondY, leftX, rightX, midX } = getCoupleBondGeometry(left, right);
  const stemStartY =
    sortedPartners.length > 1 ? marriageStemStartY(bondY, showMarriageLabel) : bondY;
  return {
    bondY,
    midX,
    stemStartY,
    leftBondX: leftX,
    rightBondX: rightX,
  };
}

function getCoupleStemAnchor(
  partners: LayoutNode[],
  project: Project,
  union?: Union,
): { x: number; y: number } {
  const anchor = getCoupleBondAnchor(partners, project, union);
  return { x: anchor.midX, y: anchor.stemStartY };
}

function coupleSpan(partners: LayoutNode[], project: Project): number {
  const sortedPartners = sortPartners(partners, project);
  if (sortedPartners.length <= 1) return sortedPartners[0]?.width ?? 0;
  const left = sortedPartners[0];
  const right = sortedPartners[sortedPartners.length - 1];
  return right.x + right.width - left.x;
}

function childNeedsBranchRoute(
  partners: LayoutNode[],
  child: LayoutNode,
  allChildren: LayoutNode[],
  graph: GraphResult,
  project: Project,
): boolean {
  const gp = child.personId ? getGraphPerson(graph, child.personId) : undefined;
  const parentLayer = Math.min(...partners.map((p) => p.layer));
  if (gp?.isSideBranch || child.layer !== parentLayer + 1) return true;

  const anchor = getCoupleStemAnchor(partners, project);
  const childCx = child.x + child.width / 2;
  const span = coupleSpan(partners, project);

  if (Math.abs(childCx - anchor.x) > span * 0.55 + 32) return true;

  if (allChildren.length <= 1) return true;

  if (project.viewSettings.showAllPersons) {
    const childCenters = allChildren.map((c) => c.x + c.width / 2);
    const spread = Math.max(...childCenters) - Math.min(...childCenters);
    if (spread > span + 48) return true;
  }

  return false;
}

function splitChildrenForConnector(
  partners: LayoutNode[],
  children: LayoutNode[],
  graph: GraphResult,
  project: Project,
): { mainLine: LayoutNode[]; sideBranch: LayoutNode[] } {
  if (children.length === 0) return { mainLine: [], sideBranch: [] };

  const sorted = sortChildren(children);
  const parentLayer = Math.min(...partners.map((p) => p.layer));

  // Siblings on the next layer always share one T-shaped connector (even collateral siblings).
  if (sorted.length >= 2 && sorted.every((c) => c.layer === parentLayer + 1)) {
    return { mainLine: sorted, sideBranch: [] };
  }

  const mainLine: LayoutNode[] = [];
  const sideBranch: LayoutNode[] = [];

  for (const child of sorted) {
    if (childNeedsBranchRoute(partners, child, children, graph, project)) {
      sideBranch.push(child);
    } else {
      mainLine.push(child);
    }
  }

  return { mainLine, sideBranch };
}

function buildBranchChildConnector(
  unionId: string,
  partners: LayoutNode[],
  child: LayoutNode,
  project: Project,
  union?: Union,
): LayoutEdge[] {
  if (partners.length === 0) return [];

  const unionRecord = union ?? project.unions[unionId];
  const { bondY, midX, stemStartY } = getCoupleBondAnchor(partners, project, unionRecord);
  const childCx = snapEdgeCoord(child.x + child.width / 2);
  const forkY = snapEdgeCoord(stemStartY + (child.y - stemStartY) * 0.45);
  const stemTopY = snapEdgeCoord(bondY);
  const stemBottomY = snapEdgeCoord(stemStartY);
  const midSnap = snapEdgeCoord(midX);
  const childY = snapEdgeCoord(child.y);

  const points =
    Math.abs(childCx - midSnap) < 6
      ? [
          { x: midSnap, y: stemTopY },
          { x: midSnap, y: stemBottomY },
          { x: childCx, y: childY },
        ]
      : [
          { x: midSnap, y: stemTopY },
          { x: midSnap, y: stemBottomY },
          { x: midSnap, y: forkY },
          { x: childCx, y: forkY },
          { x: childCx, y: childY },
        ];

  return [
    {
      id: `fam-branch-${unionId}-${child.personId}`,
      from: partners[0].id,
      to: child.id,
      points,
    },
  ];
}

function buildFamilyConnector(
  unionId: string,
  partners: LayoutNode[],
  children: LayoutNode[],
  project: Project,
): LayoutEdge[] {
  if (partners.length === 0 || children.length === 0) return [];

  const sortedPartners = sortPartners(partners, project);
  const sortedChildren = sortChildren(children);

  const union = project.unions[unionId];
  const { bondY, midX, stemStartY } = getCoupleBondAnchor(sortedPartners, project, union);
  const childTop = Math.min(...sortedChildren.map((c) => c.y));
  const forkY = snapEdgeCoord(stemStartY + (childTop - stemStartY) * 0.55);
  const stemTopY = snapEdgeCoord(bondY);
  const stemBottomY = snapEdgeCoord(stemStartY);
  const midSnap = snapEdgeCoord(midX);

  const childCenters = sortedChildren.map((c) => snapEdgeCoord(c.x + c.width / 2));
  const busMin = snapEdgeCoord(Math.min(midSnap, ...childCenters));
  const busMax = snapEdgeCoord(Math.max(midSnap, ...childCenters));

  const trunk = [
    { x: midSnap, y: stemBottomY },
    { x: midSnap, y: forkY },
    { x: busMin, y: forkY },
    { x: busMax, y: forkY },
  ];

  const drops = sortedChildren.map((child, i) => [
    { x: childCenters[i], y: forkY },
    { x: childCenters[i], y: snapEdgeCoord(child.y) },
  ]);

  const bondStemTop = { x: midSnap, y: stemTopY };

  return [
    {
      id: `fam-tree-${unionId}`,
      from: sortedPartners[0].id,
      to: sortedChildren[sortedChildren.length - 1].id,
      points: [...trunk, ...drops.flat()],
      pathD: pedigreeFamilyConnectorPathWithBondStem(bondStemTop, trunk, drops),
    },
  ];
}

export function buildPedigreeEdges(
  project: Project,
  nodes: LayoutNode[],
  graph: GraphResult,
): LayoutEdge[] {
  const nodeByPersonId = new Map<string, LayoutNode>();
  for (const node of nodes) {
    if (node.personId) nodeByPersonId.set(node.personId, node);
  }

  const visibleUnions = new Set<string>();
  for (const node of nodes) {
    if (!node.personId) continue;
    const person = project.persons[node.personId];
    if (!person) continue;
    for (const unionId of person.unionIds) visibleUnions.add(unionId);
    for (const unionId of person.parentUnionIds) visibleUnions.add(unionId);
  }
  for (const node of graph.nodes) {
    if (node.kind === 'person' && node.unionId) visibleUnions.add(node.unionId);
    if (node.kind === 'person' && node.parentUnionId) visibleUnions.add(node.parentUnionId);
  }

  const edges: LayoutEdge[] = [];
  for (const unionId of visibleUnions) {
    const union = project.unions[unionId];
    if (!union) continue;

    const partners = pickPartnersForUnion(
      union.partnerIds
        .map((id) => nodeByPersonId.get(id))
        .filter((n): n is LayoutNode => Boolean(n)),
      union.childIds
        .map((id) => nodeByPersonId.get(id))
        .filter((n): n is LayoutNode => Boolean(n)),
    );

    const children = union.childIds
      .map((id) => nodeByPersonId.get(id))
      .filter((n): n is LayoutNode => Boolean(n));

    if (partners.length === 0 || children.length === 0) continue;

    const { mainLine, sideBranch } = splitChildrenForConnector(partners, children, graph, project);
    if (mainLine.length > 0) {
      edges.push(...buildFamilyConnector(unionId, partners, mainLine, project));
    }
    for (const child of sideBranch) {
      edges.push(...buildBranchChildConnector(unionId, partners, child, project, union));
    }
  }

  return edges;
}
