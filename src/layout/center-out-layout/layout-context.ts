import type { Project } from '../../types';
import type { GraphResult } from '../graph-builder';
import type { GraphPersonNode, PlacementState, UnionPlacementState } from './types';

export class LayoutContext {
  readonly project: Project;
  readonly graph: GraphResult;
  readonly personToNode = new Map<string, GraphPersonNode>();
  readonly placements = new Map<string, PlacementState>();
  readonly unionStates = new Map<string, UnionPlacementState>();
  readonly focusPersonId: string;

  constructor(project: Project, graph: GraphResult) {
    this.project = project;
    this.graph = graph;
    for (const node of graph.nodes) {
      if (node.kind === 'person') {
        this.personToNode.set(node.personId, node as GraphPersonNode);
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

  markUnionComplete(unionId: string, childPersonIds: string[], partnerIds: string[]): void {
    this.unionStates.set(unionId, {
      unionId,
      status: 'complete',
      placedPartnerIds: [...partnerIds],
      childPersonIds: [...childPersonIds],
    });
  }

  markUnionPartial(
    unionId: string,
    placedId: string,
    childPersonIds: string[],
  ): void {
    this.unionStates.set(unionId, {
      unionId,
      status: 'partial',
      placedPartnerIds: [placedId],
      childPersonIds: [...childPersonIds],
    });
  }

  addPartnerToPartialUnion(unionId: string, partnerId: string): void {
    const state = this.unionStates.get(unionId);
    if (!state) return;
    if (!state.placedPartnerIds.includes(partnerId)) {
      state.placedPartnerIds.push(partnerId);
    }
    if (state.placedPartnerIds.length >= 2) {
      state.status = 'complete';
    }
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

export function layer0PersonIds(ctx: LayoutContext): string[] {
  const ids = new Set<string>();
  if (ctx.project.center.type === 'family') {
    const union = ctx.project.unions[ctx.project.center.id];
    for (const pid of union?.partnerIds ?? []) {
      if (ctx.personToNode.has(pid)) ids.add(pid);
    }
  } else {
    const focusId = ctx.focusPersonId;
    if (ctx.personToNode.has(focusId)) ids.add(focusId);
    const person = ctx.project.persons[focusId];
    for (const uid of person?.unionIds ?? []) {
      const u = ctx.project.unions[uid];
      for (const pid of u?.partnerIds ?? []) {
        if (pid !== focusId && ctx.personToNode.has(pid)) {
          const gn = ctx.personToNode.get(pid);
          if (gn && gn.layer === 0) ids.add(pid);
        }
      }
    }
  }
  return [...ids];
}

/** Прямые предки фокуса (lineage вверх). */
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

/** Прямые потомки фокуса (lineage вниз). */
export function lineageDescendantIds(ctx: LayoutContext): Set<string> {
  const result = new Set<string>();
  const queue = [ctx.focusPersonId];
  const seen = new Set<string>([ctx.focusPersonId]);
  while (queue.length > 0) {
    const pid = queue.shift()!;
    for (const uid of ctx.project.persons[pid]?.unionIds ?? []) {
      for (const childId of ctx.project.unions[uid]?.childIds ?? []) {
        if (seen.has(childId) || !ctx.personToNode.has(childId)) continue;
        seen.add(childId);
        result.add(childId);
        queue.push(childId);
      }
    }
  }
  return result;
}

export function childPersonIdsForParentUnion(
  ctx: LayoutContext,
  unionId: string,
): string[] {
  const union = ctx.project.unions[unionId];
  if (!union) return [];
  return union.childIds.filter((id) => ctx.personToNode.has(id));
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
