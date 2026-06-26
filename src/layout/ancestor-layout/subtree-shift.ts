import type { LayoutContext } from './layout-context';
import { CARD_WIDTH_CELLS, COUPLE_GAP_CELLS, cardLeftEdge, cardRightEdge } from './grid-math';

/** Все потомки вниз от personId (без супругов на том же слое). */
export function collectDescendantBranch(
  ctx: LayoutContext,
  rootPersonId: string,
  fromLayer: number,
): Set<string> {
  const result = new Set<string>();
  const queue = [rootPersonId];
  while (queue.length > 0) {
    const pid = queue.shift()!;
    if (result.has(pid)) continue;
    const placement = ctx.getPlacement(pid);
    if (!placement || placement.layer <= fromLayer) continue;

    result.add(pid);

    for (const uid of ctx.project.persons[pid]?.unionIds ?? []) {
      const union = ctx.project.unions[uid];
      if (!union) continue;
      for (const cid of union.childIds) {
        if (!ctx.isPlaced(cid)) continue;
        const cp = ctx.getPlacement(cid)!;
        if (cp.layer > fromLayer) queue.push(cid);
      }
    }
  }
  return result;
}

/** Все предки вверх от personId (слои < fromLayer). */
export function collectAncestorBranch(
  ctx: LayoutContext,
  rootPersonId: string,
  fromLayer: number,
): Set<string> {
  const result = new Set<string>();
  const queue = [rootPersonId];
  while (queue.length > 0) {
    const pid = queue.shift()!;
    const placement = ctx.getPlacement(pid);
    if (!placement) continue;

    for (const puid of ctx.project.persons[pid]?.parentUnionIds ?? []) {
      for (const parentId of ctx.project.unions[puid]?.partnerIds ?? []) {
        if (!ctx.isPlaced(parentId) || result.has(parentId)) continue;
        const pp = ctx.getPlacement(parentId)!;
        if (pp.layer >= fromLayer) continue;
        result.add(parentId);
        queue.push(parentId);
      }
    }
  }
  return result;
}

/** @deprecated используйте collectDescendantBranch */
export function collectDescendantSubtree(ctx: LayoutContext, rootPersonId: string): Set<string> {
  const placement = ctx.getPlacement(rootPersonId);
  const fromLayer = placement ? placement.layer - 1 : -999;
  return collectDescendantBranch(ctx, rootPersonId, fromLayer);
}

/** @deprecated */
export function collectTowardCenterSubtree(ctx: LayoutContext, rootPersonId: string): Set<string> {
  return collectDescendantBranch(ctx, rootPersonId, -999);
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

interface LayerUnit {
  personIds: string[];
  leftEdge: number;
  rightEdge: number;
  centerX: number;
}

function buildLayerUnits(ctx: LayoutContext, layer: number): LayerUnit[] {
  const onLayer = ctx.personsOnLayer(layer).sort((a, b) => a.centerXCells - b.centerXCells);
  const assigned = new Set<string>();
  const units: LayerUnit[] = [];

  for (const placement of onLayer) {
    if (assigned.has(placement.personId)) continue;
    const coupleIds = findCoupleOnLayer(ctx, placement.personId, layer);
    coupleIds.forEach((id) => assigned.add(id));
    const centers = coupleIds
      .map((id) => ctx.getPlacement(id)?.centerXCells)
      .filter((x): x is number => x !== undefined);
    if (centers.length === 0) continue;
    const leftEdge = Math.min(...centers.map((c) => cardLeftEdge(c)));
    const rightEdge = Math.max(...centers.map((c) => cardRightEdge(c)));
    units.push({
      personIds: coupleIds,
      leftEdge,
      rightEdge,
      centerX: (leftEdge + rightEdge) / 2,
    });
  }

  return units.sort((a, b) => a.leftEdge - b.leftEdge);
}

function countOnLayer(ctx: LayoutContext, layer: number): number {
  return ctx.personsOnLayer(layer).length;
}

function collectBranchForShift(
  ctx: LayoutContext,
  unit: LayerUnit,
  layer: number,
): { ancestors: Set<string>; descendants: Set<string> } {
  const ancestors = new Set<string>();
  const descendants = new Set<string>();
  const unitIds = new Set(unit.personIds);

  for (const pid of unit.personIds) {
    collectAncestorBranch(ctx, pid, layer).forEach((id) => ancestors.add(id));
  }

  for (const cid of childrenBelowCouple(ctx, unit.personIds, layer)) {
    collectDescendantBranch(ctx, cid, layer).forEach((id) => descendants.add(id));
  }

  unitIds.forEach((id) => {
    ancestors.delete(id);
    descendants.delete(id);
  });
  ancestors.forEach((id) => descendants.delete(id));

  return { ancestors, descendants };
}

/** Сдвигает пару/юнит, всех предков вверх и потомков вниз по ветке. */
function shiftUnitAndBranch(
  ctx: LayoutContext,
  unit: LayerUnit,
  layer: number,
  unitDelta: number,
  descendantDelta: number,
): void {
  if (Math.abs(unitDelta) < 0.001) return;

  shiftPersons(ctx, unit.personIds, unitDelta);

  const { ancestors, descendants } = collectBranchForShift(ctx, unit, layer);
  shiftPersons(ctx, ancestors, unitDelta);
  shiftPersons(ctx, descendants, descendantDelta);
}

/** Шаг 5: симметричный сдвиг наложившихся пар от центра (влево и вправо). */
export function resolveLayerCollisionStep5(ctx: LayoutContext, layer: number): boolean {
  const units = buildLayerUnits(ctx, layer);
  if (units.length < 2) return false;

  const focus = ctx.getPlacement(ctx.focusPersonId);
  const layerCenter = focus?.layer === layer ? focus.centerXCells : 0;

  const count = countOnLayer(ctx, layer);
  const pairShift = count >= 4 ? CARD_WIDTH_CELLS : CARD_WIDTH_CELLS / 2;
  const descendantShift = count >= 4 ? CARD_WIDTH_CELLS / 2 : CARD_WIDTH_CELLS / 4;

  let collided = false;
  for (let i = 1; i < units.length; i++) {
    const prev = units[i - 1];
    const curr = units[i];
    const overlap = prev.rightEdge + COUPLE_GAP_CELLS - curr.leftEdge;
    if (overlap <= 0.01) continue;

    collided = true;
    const totalShift = Math.max(overlap, pairShift);
    const halfPair = totalShift / 2;
    const halfDescendant = descendantShift / 2;

    const boundary = (prev.centerX + curr.centerX) / 2;
    const prevIsLeft = prev.centerX <= layerCenter + 0.01 || prev.centerX <= boundary;
    const currIsRight = curr.centerX >= layerCenter - 0.01 || curr.centerX >= boundary;

    if (prevIsLeft && currIsRight) {
      shiftUnitAndBranch(ctx, prev, layer, -halfPair, -halfDescendant);
      shiftUnitAndBranch(ctx, curr, layer, halfPair, halfDescendant);
      prev.leftEdge -= halfPair;
      prev.rightEdge -= halfPair;
      prev.centerX -= halfPair;
      curr.leftEdge += halfPair;
      curr.rightEdge += halfPair;
      curr.centerX += halfPair;
    } else if (prev.centerX <= curr.centerX) {
      shiftUnitAndBranch(ctx, prev, layer, -halfPair, -halfDescendant);
      shiftUnitAndBranch(ctx, curr, layer, halfPair, halfDescendant);
      prev.leftEdge -= halfPair;
      prev.rightEdge -= halfPair;
      prev.centerX -= halfPair;
      curr.leftEdge += halfPair;
      curr.rightEdge += halfPair;
      curr.centerX += halfPair;
    }
  }

  return collided;
}

/** Итеративно устраняет наложения на всех слоях (шаг 5). */
export function resolveAllLayerCollisions(ctx: LayoutContext, maxRounds = 48): void {
  const layers = [...new Set([...ctx.placements.values()].map((p) => p.layer))].sort(
    (a, b) => a - b,
  );
  for (let round = 0; round < maxRounds; round++) {
    let any = false;
    for (const layer of layers) {
      if (resolveLayerCollisionStep5(ctx, layer)) any = true;
    }
    if (!any) break;
  }
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
    (p) => p.layer < 0 && lineage.has(p.personId),
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
