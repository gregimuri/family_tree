import type { LayoutContext } from './layout-context';
import { CARD_WIDTH_CELLS, COUPLE_GAP_CELLS, cardLeftEdge, cardRightEdge } from './grid-math';

export function collectDescendantSubtree(ctx: LayoutContext, rootPersonId: string): Set<string> {
  const result = new Set<string>();
  const queue = [rootPersonId];
  while (queue.length > 0) {
    const pid = queue.shift()!;
    if (result.has(pid)) continue;
    result.add(pid);
    const placement = ctx.getPlacement(pid);
    if (!placement) continue;
    for (const uid of ctx.project.persons[pid]?.unionIds ?? []) {
      const union = ctx.project.unions[uid];
      if (!union) continue;
      for (const cid of union.childIds) {
        const childGn = ctx.graphNode(cid);
        if (childGn && childGn.layer > placement.layer && ctx.isPlaced(cid)) {
          queue.push(cid);
        }
      }
      for (const partnerId of union.partnerIds) {
        if (partnerId === pid) continue;
        const pp = ctx.getPlacement(partnerId);
        if (pp && pp.layer === placement.layer) result.add(partnerId);
      }
    }
  }
  return result;
}

export function collectTowardCenterSubtree(ctx: LayoutContext, rootPersonId: string): Set<string> {
  const result = new Set<string>();
  const queue = [rootPersonId];
  while (queue.length > 0) {
    const pid = queue.shift()!;
    if (result.has(pid)) continue;
    result.add(pid);
    const placement = ctx.getPlacement(pid);
    if (!placement) continue;
    for (const uid of ctx.project.persons[pid]?.unionIds ?? []) {
      for (const cid of ctx.project.unions[uid]?.childIds ?? []) {
        if (cid === pid) continue;
        const cp = ctx.getPlacement(cid);
        if (cp && cp.layer > placement.layer) queue.push(cid);
      }
    }
    for (const puid of ctx.project.persons[pid]?.parentUnionIds ?? []) {
      for (const parentId of ctx.project.unions[puid]?.partnerIds ?? []) {
        if (parentId === pid) continue;
        const pp = ctx.getPlacement(parentId);
        if (pp && pp.layer > placement.layer) queue.push(parentId);
      }
    }
  }
  return result;
}

export function shiftPersons(ctx: LayoutContext, personIds: Iterable<string>, delta: number): void {
  if (Math.abs(delta) < 0.001) return;
  for (const pid of personIds) {
    const p = ctx.getPlacement(pid);
    if (p) p.centerXCells += delta;
  }
}

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

function childrenBelowCouple(ctx: LayoutContext, partnerIds: string[], parentLayer: number): string[] {
  const childLayer = parentLayer + 1;
  const result: string[] = [];
  for (const union of Object.values(ctx.project.unions)) {
    if (union.partnerIds.length < 2) continue;
    if (!union.partnerIds.every((id) => partnerIds.includes(id))) continue;
    for (const cid of union.childIds) {
      const p = ctx.getPlacement(cid);
      if (p && p.layer === childLayer) result.push(cid);
    }
  }
  return [...new Set(result)];
}

function countOnLayer(ctx: LayoutContext, layer: number): number {
  return ctx.personsOnLayer(layer).filter((p) => !p.isSideBranch).length;
}

/** Шаг 5: сдвиг правой пары и потомка на половину. */
export function resolveLayerCollisionStep5(ctx: LayoutContext, layer: number): boolean {
  const onLayer = ctx
    .personsOnLayer(layer)
    .filter((p) => !p.isSideBranch)
    .sort((a, b) => a.centerXCells - b.centerXCells);
  if (onLayer.length < 2) return false;

  let collided = false;
  const count = countOnLayer(ctx, layer);
  const pairShift = count >= 4 ? CARD_WIDTH_CELLS : CARD_WIDTH_CELLS / 2;
  const descendantShift = count >= 4 ? CARD_WIDTH_CELLS / 2 : CARD_WIDTH_CELLS / 4;

  for (let i = 1; i < onLayer.length; i++) {
    const prev = onLayer[i - 1];
    const curr = onLayer[i];
    const overlap =
      cardRightEdge(prev.centerXCells) + COUPLE_GAP_CELLS - cardLeftEdge(curr.centerXCells);
    if (overlap <= 0.01) continue;

    collided = true;
    const shift = Math.max(overlap, pairShift);
    const rightIds = findCoupleOnLayer(ctx, curr.personId, layer);
    shiftPersons(ctx, rightIds, shift);

    const descendantIds = new Set<string>();
    for (const cid of childrenBelowCouple(ctx, rightIds, layer)) {
      collectDescendantSubtree(ctx, cid).forEach((id) => descendantIds.add(id));
      collectTowardCenterSubtree(ctx, cid).forEach((id) => descendantIds.add(id));
    }
    for (const pid of rightIds) {
      collectTowardCenterSubtree(ctx, pid).forEach((id) => descendantIds.add(id));
    }
    rightIds.forEach((id) => descendantIds.delete(id));
    shiftPersons(ctx, descendantIds, descendantShift);
  }

  return collided;
}

export function centerLineageAncestorsOverFocus(ctx: LayoutContext): void {
  const focus = ctx.getPlacement(ctx.focusPersonId);
  if (!focus) return;

  const lineage = new Set<string>();
  const queue = [ctx.focusPersonId];
  const seen = new Set([ctx.focusPersonId]);
  while (queue.length > 0) {
    const pid = queue.shift()!;
    for (const puid of ctx.project.persons[pid]?.parentUnionIds ?? []) {
      for (const parentId of ctx.project.unions[puid]?.partnerIds ?? []) {
        if (seen.has(parentId) || !ctx.personToNode.has(parentId)) continue;
        seen.add(parentId);
        lineage.add(parentId);
        queue.push(parentId);
      }
    }
  }

  const ancestors = [...ctx.placements.values()].filter(
    (p) => p.layer < 0 && !p.isSideBranch && lineage.has(p.personId),
  );
  if (ancestors.length === 0) return;

  const min = Math.min(...ancestors.map((p) => cardLeftEdge(p.centerXCells)));
  const max = Math.max(...ancestors.map((p) => cardRightEdge(p.centerXCells)));
  const delta = focus.centerXCells - (min + max) / 2;
  if (Math.abs(delta) < 0.01) return;

  const layers = new Set(ancestors.map((p) => p.layer));
  for (const p of ctx.placements.values()) {
    if (p.layer < 0 && layers.has(p.layer)) p.centerXCells += delta;
  }
}
