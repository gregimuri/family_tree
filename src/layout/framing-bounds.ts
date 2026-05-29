import type { LayoutNode, LayoutResult, Project } from '../types';
import { computeBounds } from './layered-layout';

export function getLinkedPersonIds(project: Project): Set<string> {
  const linked = new Set<string>();
  for (const p of Object.values(project.persons)) {
    if (p.unionIds.length > 0 || p.parentUnionIds.length > 0) linked.add(p.id);
  }
  return linked;
}

/** Nodes that affect viewport framing (linked tree + centered orphan if any). */
export function getFramingNodes(project: Project, layout: LayoutResult): LayoutNode[] {
  const linked = getLinkedPersonIds(project);
  const centerPersonId = project.center.type === 'person' ? project.center.id : null;

  return layout.nodes.filter((n) => {
    if (!n.personId) return true;
    if (linked.has(n.personId)) return true;
    return centerPersonId === n.personId;
  });
}

export function getFramingBounds(project: Project, layout: LayoutResult): LayoutResult['bounds'] {
  return computeBounds(getFramingNodes(project, layout));
}
