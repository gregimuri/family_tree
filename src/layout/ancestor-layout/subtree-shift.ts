import type { LayoutContext } from './layout-context';
import { getCardScale } from '../graph-builder';
import { CARD_WIDTH_CELLS, COUPLE_GAP_CELLS, cardHalfWidthCells } from './grid-math';

function personHalfWidthCells(ctx: LayoutContext, personId: string): number {
  const p = ctx.getPlacement(personId);
  const gn = ctx.graphNode(personId);
  if (!p || !gn) return CARD_WIDTH_CELLS / 2;
  const scale = getCardScale(
    p.layer,
    p.isSideBranch,
    gn.branchDepth,
    ctx.project.viewSettings.cardSizeMode,
  );
  return cardHalfWidthCells(scale);
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

function childrenBelowUnit(ctx: LayoutContext, partnerIds: string[], parentLayer: number): string[] {
  const childLayer = parentLayer + 1;
  const partnerSet = new Set(partnerIds);
  const result: string[] = [];
  for (const union of Object.values(ctx.project.unions)) {
    if (!union.childIds.some((cid) => ctx.isPlaced(cid))) continue;
    if (!union.partnerIds.some((id) => partnerSet.has(id))) continue;
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

function measureUnit(ctx: LayoutContext, personIds: string[]): Pick<LayerUnit, 'leftEdge' | 'rightEdge' | 'centerX'> {
  const leftEdge = Math.min(
    ...personIds.map((id) => ctx.getPlacement(id)!.centerXCells - personHalfWidthCells(ctx, id)),
  );
  const rightEdge = Math.max(
    ...personIds.map((id) => ctx.getPlacement(id)!.centerXCells + personHalfWidthCells(ctx, id)),
  );
  return { leftEdge, rightEdge, centerX: (leftEdge + rightEdge) / 2 };
}

function buildLayerUnits(ctx: LayoutContext, layer: number): LayerUnit[] {
  const onLayer = ctx.personsOnLayer(layer).sort((a, b) => a.centerXCells - b.centerXCells);
  const assigned = new Set<string>();
  const units: LayerUnit[] = [];

  for (const placement of onLayer) {
    if (assigned.has(placement.personId)) continue;
    const coupleIds = findCoupleOnLayer(ctx, placement.personId, layer);
    coupleIds.forEach((id) => assigned.add(id));
    if (coupleIds.length === 0) continue;
    units.push({ personIds: coupleIds, ...measureUnit(ctx, coupleIds) });
  }

  return units.sort((a, b) => a.leftEdge - b.leftEdge);
}

function countOnLayer(ctx: LayoutContext, layer: number): number {
  return ctx.personsOnLayer(layer).length;
}

function shiftAmountsForLayer(ctx: LayoutContext, layer: number): { pairShift: number; descendantShift: number } {
  const count = countOnLayer(ctx, layer);
  return {
    pairShift: count >= 4 ? CARD_WIDTH_CELLS : CARD_WIDTH_CELLS / 2,
    descendantShift: count >= 4 ? CARD_WIDTH_CELLS / 2 : CARD_WIDTH_CELLS / 4,
  };
}

/** Предки вверх (пары целиком). */
function collectBranchAboveUnit(ctx: LayoutContext, unit: LayerUnit, layer: number): Set<string> {
  const result = new Set<string>();
  const queue = [...unit.personIds];
  const seen = new Set(unit.personIds);

  while (queue.length > 0) {
    const pid = queue.shift()!;
    for (const puid of ctx.project.persons[pid]?.parentUnionIds ?? []) {
      for (const parentId of ctx.project.unions[puid]?.partnerIds ?? []) {
        if (!ctx.isPlaced(parentId) || seen.has(parentId)) continue;
        const pp = ctx.getPlacement(parentId)!;
        if (pp.layer >= layer) continue;
        const couple = findCoupleOnLayer(ctx, parentId, pp.layer);
        for (const id of couple) {
          if (seen.has(id)) continue;
          seen.add(id);
          result.add(id);
          queue.push(id);
        }
      }
    }
  }
  return result;
}

/**
 * Потомки вниз: ребёнок пары + его супруг на слое + дети (шаг 5 документа).
 */
function collectBranchBelowUnit(ctx: LayoutContext, unit: LayerUnit, layer: number): Set<string> {
  const result = new Set<string>();
  const seen = new Set<string>();
  const queue: string[] = [];

  for (const cid of childrenBelowUnit(ctx, unit.personIds, layer)) {
    const childLayer = layer + 1;
    const couple = findCoupleOnLayer(ctx, cid, childLayer);
    for (const id of couple) {
      if (!seen.has(id)) {
        seen.add(id);
        result.add(id);
        queue.push(id);
      }
    }
  }

  while (queue.length > 0) {
    const pid = queue.shift()!;
    const placement = ctx.getPlacement(pid);
    if (!placement || placement.layer <= layer) continue;

    for (const uid of ctx.project.persons[pid]?.unionIds ?? []) {
      for (const cid of ctx.project.unions[uid]?.childIds ?? []) {
        if (!ctx.isPlaced(cid)) continue;
        const cp = ctx.getPlacement(cid)!;
        if (cp.layer <= layer) continue;
        const couple = findCoupleOnLayer(ctx, cid, cp.layer);
        for (const id of couple) {
          if (!seen.has(id)) {
            seen.add(id);
            result.add(id);
            queue.push(id);
          }
        }
      }
    }
  }

  unit.personIds.forEach((id) => result.delete(id));
  return result;
}

function shiftUnitAndBranch(
  ctx: LayoutContext,
  unit: LayerUnit,
  layer: number,
  unitDelta: number,
  descendantDelta: number,
): void {
  if (Math.abs(unitDelta) < 0.001 && Math.abs(descendantDelta) < 0.001) return;

  shiftPersons(ctx, unit.personIds, unitDelta);

  const ancestors = collectBranchAboveUnit(ctx, unit, layer);
  shiftPersons(ctx, ancestors, unitDelta);

  const descendants = collectBranchBelowUnit(ctx, unit, layer);
  shiftPersons(ctx, descendants, descendantDelta);
}

function splitUnitsSymmetrically(
  ctx: LayoutContext,
  left: LayerUnit,
  right: LayerUnit,
  layer: number,
  totalShift: number,
): void {
  const { descendantShift } = shiftAmountsForLayer(ctx, layer);
  const halfPair = totalShift / 2;
  const halfDescendant = descendantShift / 2;

  shiftUnitAndBranch(ctx, left, layer, -halfPair, -halfDescendant);
  shiftUnitAndBranch(ctx, right, layer, halfPair, halfDescendant);
}

/** Шаг 5: симметричный сдвиг наложившихся пар от центра между ними. */
export function resolveLayerCollisionStep5(ctx: LayoutContext, layer: number): boolean {
  const units = buildLayerUnits(ctx, layer);
  if (units.length < 2) return false;

  const { pairShift } = shiftAmountsForLayer(ctx, layer);
  let collided = false;

  for (let i = 1; i < units.length; i++) {
    Object.assign(units[i - 1], measureUnit(ctx, units[i - 1].personIds));
    Object.assign(units[i], measureUnit(ctx, units[i].personIds));
    const overlap = units[i - 1].rightEdge + COUPLE_GAP_CELLS - units[i].leftEdge;
    if (overlap <= 0.01) continue;

    collided = true;
    const totalShift = Math.max(overlap, pairShift);
    splitUnitsSymmetrically(ctx, units[i - 1], units[i], layer, totalShift);
  }

  return collided;
}

/** Гарантированно разводит юниты на слое симметрично. */
export function spreadLayerFromCenter(ctx: LayoutContext, layer: number): boolean {
  const units = buildLayerUnits(ctx, layer);
  if (units.length < 2) return false;

  const { pairShift } = shiftAmountsForLayer(ctx, layer);
  let moved = false;

  for (let i = 1; i < units.length; i++) {
    Object.assign(units[i - 1], measureUnit(ctx, units[i - 1].personIds));
    Object.assign(units[i], measureUnit(ctx, units[i].personIds));
    const overlap = units[i - 1].rightEdge + COUPLE_GAP_CELLS - units[i].leftEdge;
    if (overlap <= 0.01) continue;

    moved = true;
    const totalShift = Math.max(overlap, pairShift);
    splitUnitsSymmetrically(ctx, units[i - 1], units[i], layer, totalShift);
  }

  return moved;
}

/** Итеративно устраняет наложения на всех слоях (шаг 5 + финальное разведение). */
export function resolveAllLayerCollisions(ctx: LayoutContext, maxRounds = 64): void {
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

  for (let round = 0; round < maxRounds; round++) {
    let any = false;
    for (const layer of layers) {
      if (spreadLayerFromCenter(ctx, layer)) any = true;
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

  const min = Math.min(
    ...ancestors.map((p) => p.centerXCells - personHalfWidthCells(ctx, p.personId)),
  );
  const max = Math.max(
    ...ancestors.map((p) => p.centerXCells + personHalfWidthCells(ctx, p.personId)),
  );
  const delta = focus.centerXCells - (min + max) / 2;
  if (Math.abs(delta) < 0.01) return;

  const layers = new Set(ancestors.map((p) => p.layer));
  for (const p of ctx.placements.values()) {
    if (p.layer < 0 && layers.has(p.layer)) p.centerXCells += delta;
  }
}

/** @deprecated */
export function collectDescendantBranch(
  ctx: LayoutContext,
  rootPersonId: string,
  fromLayer: number,
): Set<string> {
  const unit: LayerUnit = {
    personIds: [rootPersonId],
    ...measureUnit(ctx, [rootPersonId]),
  };
  return collectBranchBelowUnit(ctx, unit, fromLayer);
}

/** @deprecated */
export function collectAncestorBranch(
  ctx: LayoutContext,
  rootPersonId: string,
  fromLayer: number,
): Set<string> {
  const unit: LayerUnit = {
    personIds: [rootPersonId],
    ...measureUnit(ctx, [rootPersonId]),
  };
  return collectBranchAboveUnit(ctx, unit, fromLayer);
}

/** @deprecated */
export function collectDescendantSubtree(ctx: LayoutContext, rootPersonId: string): Set<string> {
  const placement = ctx.getPlacement(rootPersonId);
  const fromLayer = placement ? placement.layer - 1 : -999;
  return collectDescendantBranch(ctx, rootPersonId, fromLayer);
}

/** @deprecated */
export function collectTowardCenterSubtree(ctx: LayoutContext, rootPersonId: string): Set<string> {
  return collectDescendantBranch(ctx, rootPersonId, -999);
}
