import type { LayoutEdge, LayoutNode, Project } from '../types';
import type { GraphResult } from './graph-builder';

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
  const coupleMidX = (left.x + left.width / 2 + right.x + right.width / 2) / 2;
  const parentBottom = Math.max(left.y + left.height, right.y + right.height);
  const childTop = Math.min(...sortedChildren.map((c) => c.y));
  const forkY = parentBottom + (childTop - parentBottom) * 0.55;

  const childCenters = sortedChildren.map((c) => c.x + c.width / 2);
  const busMin = Math.min(coupleMidX, ...childCenters);
  const busMax = Math.max(coupleMidX, ...childCenters);

  const edges: LayoutEdge[] = [];

  const stemPoints = [
    { x: coupleMidX, y: partners.length > 1 ? left.y + left.height / 2 : parentBottom },
    { x: coupleMidX, y: forkY },
  ];
  if (partners.length > 1 && Math.abs(stemPoints[0].y - parentBottom) > 2) {
    stemPoints.splice(1, 0, { x: coupleMidX, y: parentBottom });
  }

  edges.push({
    id: `fam-stem-${unionId}`,
    from: left.id,
    to: sortedChildren[0].id,
    points: stemPoints,
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

    const partners = union.partnerIds
      .map((id) => nodeByPersonId.get(id))
      .filter((n): n is LayoutNode => Boolean(n));

    const children = union.childIds
      .map((id) => nodeByPersonId.get(id))
      .filter((n): n is LayoutNode => Boolean(n));

    if (partners.length === 0 || children.length === 0) continue;
    edges.push(...buildFamilyConnector(unionId, partners, children, project));
  }

  return edges;
}
