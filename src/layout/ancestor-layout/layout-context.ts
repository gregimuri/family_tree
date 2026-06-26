import type { Project } from '../../types';
import type { GraphPersonNode, GraphResult } from '../graph-builder';
import type { PlacementState } from './types';

export class LayoutContext {
  readonly project: Project;
  readonly graph: GraphResult;
  readonly personToNode = new Map<string, GraphPersonNode>();
  readonly placements = new Map<string, PlacementState>();
  readonly focusPersonId: string;

  constructor(project: Project, graph: GraphResult) {
    this.project = project;
    this.graph = graph;
    for (const node of graph.nodes) {
      if (node.kind === 'person') {
        this.personToNode.set(node.personId, node);
      }
    }
    this.focusPersonId = resolveFocusPersonId(project);
  }

  isPlaced(personId: string): boolean {
    return this.placements.has(personId);
  }

  getPlacement(personId: string): PlacementState | undefined {
    return this.placements.get(personId);
  }

  graphNode(personId: string): GraphPersonNode | undefined {
    return this.personToNode.get(personId);
  }

  placePerson(
    personId: string,
    centerXCells: number,
    options?: { layer?: number },
  ): void {
    const gn = this.personToNode.get(personId);
    if (!gn) return;
    this.placements.set(personId, {
      personId,
      layer: options?.layer ?? gn.layer,
      centerXCells,
      branchSide: gn.branchSide,
      isSideBranch: gn.isSideBranch,
      graphNodeId: gn.id,
    });
  }

  personsOnLayer(layer: number): PlacementState[] {
    return [...this.placements.values()].filter((p) => p.layer === layer);
  }
}

export function resolveFocusPersonId(project: Project): string {
  if (project.center.type === 'person') {
    return project.center.id;
  }
  const union = project.unions[project.center.id];
  if (!union || union.partnerIds.length === 0) {
    return Object.keys(project.persons)[0] ?? '';
  }
  const male = union.partnerIds.find((id) => project.persons[id]?.gender === 'male');
  return male ?? union.partnerIds[0];
}

export function lineageAncestorIds(ctx: LayoutContext): Set<string> {
  const result = new Set<string>();
  const queue = [ctx.focusPersonId];
  const seen = new Set<string>([ctx.focusPersonId]);
  while (queue.length > 0) {
    const pid = queue.shift()!;
    for (const puid of ctx.project.persons[pid]?.parentUnionIds ?? []) {
      for (const parentId of ctx.project.unions[puid]?.partnerIds ?? []) {
        if (seen.has(parentId) || !ctx.personToNode.has(parentId)) continue;
        seen.add(parentId);
        result.add(parentId);
        queue.push(parentId);
      }
    }
  }
  return result;
}

export function childCenterXCells(ctx: LayoutContext, childIds: string[]): number {
  const placed = childIds
    .map((id) => ctx.getPlacement(id))
    .filter((p): p is PlacementState => Boolean(p));
  if (placed.length === 0) return 0;
  if (placed.length === 1) return placed[0].centerXCells;
  const xs = placed.map((p) => p.centerXCells);
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

export function sortPartnersMaleLeft(partnerIds: string[], project: Project): string[] {
  return [...partnerIds].sort((a, b) => {
    const ga = project.persons[a]?.gender;
    const gb = project.persons[b]?.gender;
    if (ga === 'male' && gb !== 'male') return -1;
    if (gb === 'male' && ga !== 'male') return 1;
    return a.localeCompare(b);
  });
}

export function visiblePartners(ctx: LayoutContext, unionId: string): string[] {
  const union = ctx.project.unions[unionId];
  if (!union) return [];
  return union.partnerIds.filter((id) => ctx.personToNode.has(id));
}

export function mainChildUnionId(ctx: LayoutContext): string | undefined {
  if (ctx.project.center.type === 'family') {
    return ctx.project.center.id;
  }
  const focusId = ctx.focusPersonId;
  for (const uid of ctx.project.persons[focusId]?.unionIds ?? []) {
    const u = ctx.project.unions[uid];
    if (u?.childIds.some((cid) => ctx.personToNode.has(cid))) return uid;
  }
  return undefined;
}

export function mainPartnerId(ctx: LayoutContext): string | undefined {
  const uid = mainChildUnionId(ctx);
  if (!uid) return undefined;
  return ctx.project.unions[uid]?.partnerIds.find(
    (id) => id !== ctx.focusPersonId && ctx.personToNode.has(id),
  );
}
