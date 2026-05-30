import type { LayoutEdge, LayoutNode, Project } from '../types';
import type { GraphPersonNode, GraphResult } from './graph-builder';

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

function splitChildrenForConnector(
  partners: LayoutNode[],
  children: LayoutNode[],
  graph: GraphResult,
): { mainLine: LayoutNode[]; sideBranch: LayoutNode[] } {
  if (children.length === 0) return { mainLine: [], sideBranch: [] };

  const parentLayer = Math.min(...partners.map((p) => p.layer));
  const mainLine: LayoutNode[] = [];
  const sideBranch: LayoutNode[] = [];

  for (const child of children) {
    const gp = child.personId ? getGraphPerson(graph, child.personId) : undefined;
    if (gp?.isSideBranch || child.layer !== parentLayer + 1) {
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
): LayoutEdge[] {
  if (partners.length === 0) return [];

  const sortedPartners = sortPartners(partners, project);
  const childCx = child.x + child.width / 2;
  const nearest = sortedPartners.reduce((best, partner) => {
    const bestCx = best.x + best.width / 2;
    const partnerCx = partner.x + partner.width / 2;
    return Math.abs(partnerCx - childCx) < Math.abs(bestCx - childCx) ? partner : best;
  });
  const partnerCx = nearest.x + nearest.width / 2;
  const startY = nearest.y + nearest.height;
  const forkY = startY + (child.y - startY) * 0.45;

  return [
    {
      id: `fam-branch-${unionId}-${child.personId}`,
      from: nearest.id,
      to: child.id,
      points: [
        { x: partnerCx, y: startY },
        { x: partnerCx, y: forkY },
        { x: childCx, y: forkY },
        { x: childCx, y: child.y },
      ],
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

  const left = sortedPartners[0];
  const right = sortedPartners[sortedPartners.length - 1];
  const leftBottom = left.y + left.height;
  const rightBottom = right.y + right.height;
  const bondY = Math.max(leftBottom, rightBottom);
  const coupleMidX =
    sortedPartners.length > 1
      ? (left.x + left.width + right.x) / 2
      : left.x + left.width / 2;
  const parentBottom = sortedPartners.length > 1 ? bondY : leftBottom;
  const childTop = Math.min(...sortedChildren.map((c) => c.y));
  const forkY = parentBottom + (childTop - parentBottom) * 0.55;

  const childCenters = sortedChildren.map((c) => c.x + c.width / 2);
  const busMin = Math.min(coupleMidX, ...childCenters);
  const busMax = Math.max(coupleMidX, ...childCenters);

  const edges: LayoutEdge[] = [];

  edges.push({
    id: `fam-stem-${unionId}`,
    from: left.id,
    to: sortedChildren[0].id,
    points: [
      { x: coupleMidX, y: parentBottom },
      { x: coupleMidX, y: forkY },
    ],
  });

  if (busMax - busMin > 1) {
    edges.push({
      id: `fam-bus-${unionId}`,
      from: left.id,
      to: sortedChildren[sortedChildren.length - 1].id,
      points: [
        { x: busMin, y: forkY },
        { x: busMax, y: forkY },
      ],
    });
  }

  for (const child of sortedChildren) {
    const cx = child.x + child.width / 2;
    edges.push({
      id: `fam-drop-${unionId}-${child.personId}`,
      from: left.id,
      to: child.id,
      points: [
        { x: cx, y: forkY },
        { x: cx, y: child.y },
      ],
    });
  }

  return edges;
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

    const { mainLine, sideBranch } = splitChildrenForConnector(partners, children, graph);
    if (mainLine.length > 0) {
      edges.push(...buildFamilyConnector(unionId, partners, mainLine, project));
    }
    for (const child of sideBranch) {
      edges.push(...buildBranchChildConnector(unionId, partners, child, project));
    }
  }

  return edges;
}
