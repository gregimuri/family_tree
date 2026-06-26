import type { LayoutContext } from './layout-context';
import { childCenterXCells } from './layout-context';
import { shiftPersons } from './subtree-shift';

function findCoupleOnLayer(ctx: LayoutContext, personId: string, layer: number): string[] {
  for (const uid of ctx.project.persons[personId]?.unionIds ?? []) {
    const partners = ctx.project.unions[uid]?.partnerIds.filter(
      (id) => ctx.getPlacement(id)?.layer === layer && ctx.personToNode.has(id),
    );
    if (partners && partners.includes(personId) && partners.length >= 2) return partners;
  }
  for (const puid of ctx.project.persons[personId]?.parentUnionIds ?? []) {
    const partners = ctx.project.unions[puid]?.partnerIds.filter(
      (id) => ctx.getPlacement(id)?.layer === layer && ctx.personToNode.has(id),
    );
    if (partners && partners.includes(personId)) return partners.length > 0 ? partners : [personId];
  }
  return [personId];
}

function coupleBondCenterCells(ctx: LayoutContext, partnerIds: string[]): number {
  const xs = partnerIds
    .map((id) => ctx.getPlacement(id)?.centerXCells)
    .filter((x): x is number => x !== undefined);
  if (xs.length === 0) return 0;
  if (xs.length === 1) return xs[0];
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

function collectDownFromPerson(ctx: LayoutContext, rootId: string, fromLayer: number): Set<string> {
  const result = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const pid = queue.shift()!;
    if (result.has(pid)) continue;
    const placement = ctx.getPlacement(pid);
    if (!placement || placement.layer <= fromLayer) continue;
    result.add(pid);
    for (const uid of ctx.project.persons[pid]?.unionIds ?? []) {
      for (const cid of ctx.project.unions[uid]?.childIds ?? []) {
        if (!ctx.isPlaced(cid)) continue;
        const cp = ctx.getPlacement(cid)!;
        if (cp.layer > fromLayer) queue.push(cid);
      }
    }
  }
  return result;
}

/** Сдвигает детей (и потомков вниз) под середину брака родителей. */
export function alignChildrenUnderParentBonds(ctx: LayoutContext): void {
  const layers = [...new Set([...ctx.placements.values()].map((p) => p.layer))].sort(
    (a, b) => a - b,
  );

  for (const layer of layers) {
    for (const union of Object.values(ctx.project.unions)) {
      if (union.childIds.length === 0) continue;
      const parents = union.partnerIds.filter((id) => ctx.isPlaced(id));
      const children = union.childIds.filter((id) => ctx.isPlaced(id));
      if (parents.length === 0 || children.length === 0) continue;

      const parentLayer = Math.min(...parents.map((id) => ctx.getPlacement(id)!.layer));
      if (parentLayer !== layer) continue;

      const childLayer = Math.max(...children.map((id) => ctx.getPlacement(id)!.layer));
      if (childLayer !== parentLayer + 1) continue;

      const bondCenter = coupleBondCenterCells(ctx, parents);
      const childCenter = childCenterXCells(ctx, children);
      const delta = bondCenter - childCenter;
      if (Math.abs(delta) < 0.05) continue;

      const toShift = new Set<string>();
      for (const cid of children) {
        for (const id of findCoupleOnLayer(ctx, cid, childLayer)) {
          toShift.add(id);
          collectDownFromPerson(ctx, id, childLayer).forEach((pid) => toShift.add(pid));
        }
      }
      shiftPersons(ctx, toShift, delta);
    }
  }
}
