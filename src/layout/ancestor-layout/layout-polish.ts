import type { LayoutContext } from './layout-context';
import { placeCoupleAtCenter } from './layout-couple';
import {
  findCoupleOnLayer,
  measureUnit,
  personHalfWidthCells,
  shiftPersons,
  shiftUnitAndBranch,
  type LayerUnit,
} from './subtree-shift';

function coupleBondCenterCells(ctx: LayoutContext, partnerIds: string[]): number {
  const xs = partnerIds
    .map((id) => ctx.getPlacement(id)?.centerXCells)
    .filter((x): x is number => x !== undefined);
  if (xs.length === 0) return 0;
  if (xs.length === 1) return xs[0];
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

/** Центр группы детей (с учётом пар на слое). */
function childGroupCenterCells(ctx: LayoutContext, childIds: string[], childLayer: number): number {
  const assigned = new Set<string>();
  let minLeft = Infinity;
  let maxRight = -Infinity;

  for (const cid of childIds) {
    for (const id of findCoupleOnLayer(ctx, cid, childLayer)) {
      if (assigned.has(id)) continue;
      assigned.add(id);
      const p = ctx.getPlacement(id)!;
      minLeft = Math.min(minLeft, p.centerXCells - personHalfWidthCells(ctx, id));
      maxRight = Math.max(maxRight, p.centerXCells + personHalfWidthCells(ctx, id));
    }
  }

  if (!Number.isFinite(minLeft)) return 0;
  return (minLeft + maxRight) / 2;
}

function collectDownFromCouple(ctx: LayoutContext, coupleIds: string[], fromLayer: number): Set<string> {
  const result = new Set<string>();
  const queue = [...coupleIds];
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
        if (cp.layer > fromLayer) {
          for (const id of findCoupleOnLayer(ctx, cid, cp.layer)) {
            if (!result.has(id)) queue.push(id);
          }
        }
      }
    }
  }
  return result;
}

interface UnionRow {
  unionId: string;
  parentLayer: number;
  childLayer: number;
}

function unionsByChildLayer(ctx: LayoutContext): UnionRow[] {
  const rows: UnionRow[] = [];
  for (const union of Object.values(ctx.project.unions)) {
    if (union.childIds.length === 0) continue;
    const parents = union.partnerIds.filter((id) => ctx.isPlaced(id));
    const children = union.childIds.filter((id) => ctx.isPlaced(id));
    if (parents.length === 0 || children.length === 0) continue;

    const parentLayer = Math.min(...parents.map((id) => ctx.getPlacement(id)!.layer));
    const childLayer = Math.max(...children.map((id) => ctx.getPlacement(id)!.layer));
    if (childLayer !== parentLayer + 1) continue;
    rows.push({ unionId: union.id, parentLayer, childLayer });
  }
  return rows.sort((a, b) => b.childLayer - a.childLayer);
}

/**
 * Снизу вверх: родители над центром группы детей (шаги 3–4).
 * Сдвигается вся ветка родителей вверх, дети не трогаются.
 */
export function alignParentsOverChildGroups(ctx: LayoutContext): void {
  for (const row of unionsByChildLayer(ctx)) {
    const union = ctx.project.unions[row.unionId]!;
    const parents = union.partnerIds.filter((id) => ctx.isPlaced(id));
    const children = union.childIds.filter((id) => ctx.isPlaced(id));
    if (parents.length === 0 || children.length === 0) continue;

    const target = childGroupCenterCells(ctx, children, row.childLayer);
    const current =
      parents.length >= 2
        ? coupleBondCenterCells(ctx, parents)
        : ctx.getPlacement(parents[0])!.centerXCells;
    const delta = target - current;
    if (Math.abs(delta) < 0.05) continue;

    const unit: LayerUnit = {
      personIds: parents.length >= 2 ? findCoupleOnLayer(ctx, parents[0], row.parentLayer) : parents,
      ...measureUnit(
        ctx,
        parents.length >= 2 ? findCoupleOnLayer(ctx, parents[0], row.parentLayer) : parents,
      ),
    };
    shiftUnitAndBranch(ctx, unit, row.parentLayer, delta, 0);
  }
}

/** Снизу вверх: дети под серединой брака родителей (после шага 5). */
export function alignChildrenUnderParentBonds(ctx: LayoutContext): void {
  for (const row of unionsByChildLayer(ctx)) {
    const union = ctx.project.unions[row.unionId]!;
    const parents = union.partnerIds.filter((id) => ctx.isPlaced(id));
    const children = union.childIds.filter((id) => ctx.isPlaced(id));
    if (parents.length === 0 || children.length === 0) continue;

    const bondCenter = coupleBondCenterCells(ctx, parents);
    const childCenter = childGroupCenterCells(ctx, children, row.childLayer);
    const delta = bondCenter - childCenter;
    if (Math.abs(delta) < 0.05) continue;

    const toShift = new Set<string>();
    for (const cid of children) {
      const couple = findCoupleOnLayer(ctx, cid, row.childLayer);
      collectDownFromCouple(ctx, couple, row.childLayer).forEach((pid) => toShift.add(pid));
    }
    shiftPersons(ctx, toShift, delta);
  }
}

/** Центрировать пары над детьми без сдвига веток (только локальная пара). */
export function snapParentCouplesOverChildren(ctx: LayoutContext): void {
  for (const row of unionsByChildLayer(ctx)) {
    const union = ctx.project.unions[row.unionId]!;
    const parents = union.partnerIds.filter((id) => ctx.isPlaced(id));
    const children = union.childIds.filter((id) => ctx.isPlaced(id));
    if (parents.length === 0 || children.length === 0) continue;

    const target = childGroupCenterCells(ctx, children, row.childLayer);
    if (parents.length >= 2) {
      placeCoupleAtCenter(ctx, parents, target, row.parentLayer);
    } else {
      ctx.placePerson(parents[0], target, { layer: row.parentLayer });
    }
  }
}
