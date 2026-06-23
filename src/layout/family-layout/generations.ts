import type { Project } from '../../types';
import type { GraphResult } from '../graph-builder';

/** Выровнять layer супругов в одном union к max(partner layers), кроме родительских union. */
export function syncSpouseLayers(graph: GraphResult, project: Project): void {
  const personToNode = new Map<string, Extract<GraphResult['nodes'][number], { kind: 'person' }>>();
  for (const node of graph.nodes) {
    if (node.kind === 'person') {
      personToNode.set(node.personId, node);
    }
  }

  const seenUnions = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind !== 'person' || !node.unionId || seenUnions.has(node.unionId)) continue;
    seenUnions.add(node.unionId);

    const union = project.unions[node.unionId];
    if (!union || union.partnerIds.length < 2) continue;

    const partners = union.partnerIds
      .map((pid) => personToNode.get(pid))
      .filter(Boolean) as Extract<GraphResult['nodes'][number], { kind: 'person' }>[];
    if (partners.length < 2) continue;

    const layers = partners.map((p) => p.layer);
    const minLayer = Math.min(...layers);
    const maxLayer = Math.max(...layers);
    if (minLayer === maxLayer) continue;

    const isParentUnionForHigherChild = union.childIds.some((childId) => {
      const child = personToNode.get(childId);
      return child && child.layer >= minLayer + 1;
    });

    if (isParentUnionForHigherChild) continue;

    for (const partner of partners) {
      const graphNode = graph.nodes.find((n) => n.id === partner.id);
      if (graphNode && graphNode.kind === 'person') {
        graphNode.layer = maxLayer;
      }
    }
  }
}
