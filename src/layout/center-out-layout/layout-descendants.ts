import type { LayoutContext } from './layout-context';
import { layer0PersonIds, lineageDescendantIds } from './layout-context';
import { placeCoupleAtCenter } from './layout-couple';
import { pickPrimaryChildId, pickSecondaryChildIds } from './primary-child-rule';
import { resolveLayerOverlapAfterExpand, shiftPersons, collectDescendantSubtree } from './subtree-shift';
import { CARD_WIDTH_CELLS, SIBLING_GAP_CELLS } from './grid-math';

const partialChildUnions = new Map<
  string,
  { unionId: string; placedChildId: string; parentIds: string[] }
>();

/** Фаза C.1: спуск — дети и первичные потомки. */
export function layoutDescendantsDown(ctx: LayoutContext): void {
  partialChildUnions.clear();
  const lineage = lineageDescendantIds(ctx);
  const seedIds = layer0PersonIds(ctx);

  const processedUnions = new Set<string>();

  for (const personId of seedIds) {
    for (const unionId of ctx.project.persons[personId]?.unionIds ?? []) {
      if (processedUnions.has(unionId)) continue;
      processedUnions.add(unionId);

      const union = ctx.project.unions[unionId];
      if (!union) continue;

      const visibleChildren = union.childIds.filter((id) => ctx.personToNode.has(id));
      if (visibleChildren.length === 0) continue;

      const parentPlacement = ctx.getPlacement(personId);
      if (!parentPlacement) continue;

      const childLayer = parentPlacement.layer + 1;

      if (visibleChildren.length === 1) {
        const childId = visibleChildren[0];
        placeChildWithSpouse(ctx, childId, parentPlacement.centerXCells, childLayer);
        continue;
      }

      const n = visibleChildren.length;
      const totalSpan = n * CARD_WIDTH_CELLS + (n - 1) * SIBLING_GAP_CELLS;
      const startCenter =
        parentPlacement.centerXCells - totalSpan / 2 + CARD_WIDTH_CELLS / 2;

      for (let i = 0; i < visibleChildren.length; i++) {
        const childId = visibleChildren[i];
        const cx = startCenter + i * (CARD_WIDTH_CELLS + SIBLING_GAP_CELLS);
        placeChildWithSpouse(ctx, childId, cx, childLayer);
      }

      resolveLayerOverlapAfterExpand(ctx, childLayer, visibleChildren);
    }
  }

  const maxLayer = Math.max(...[...ctx.personToNode.values()].map((n) => n.layer), 0);

  for (let layer = 1; layer < maxLayer; layer++) {
    const onLayer = ctx.personsOnLayer(layer).filter((p) => lineage.has(p.personId));

    for (const person of onLayer) {
      for (const unionId of ctx.project.persons[person.personId]?.unionIds ?? []) {
        if (partialChildUnions.has(unionId)) continue;

        const union = ctx.project.unions[unionId];
        if (!union || union.childIds.length === 0) continue;

        const visibleChildren = union.childIds.filter((id) => ctx.personToNode.has(id));
        if (visibleChildren.length === 0) continue;

        const primaryId = pickPrimaryChildId(unionId, ctx.project);
        if (!primaryId || ctx.isPlaced(primaryId)) continue;

        const childLayer = person.layer + 1;
        if (childLayer > maxLayer) continue;

        const centerX = person.centerXCells;
        ctx.placePerson(primaryId, centerX, { layer: childLayer });
        partialChildUnions.set(unionId, {
          unionId,
          placedChildId: primaryId,
          parentIds: [person.personId],
        });
      }
    }

    resolveLayerOverlapAfterExpand(
      ctx,
      layer + 1,
      ctx.personsOnLayer(layer + 1).map((p) => p.personId),
    );
  }
}

function placeChildWithSpouse(
  ctx: LayoutContext,
  childId: string,
  centerXCells: number,
  layer: number,
): void {
  if (ctx.isPlaced(childId)) return;

  const child = ctx.project.persons[childId];
  if (!child) return;

  let spouseId: string | undefined;
  for (const uid of child.unionIds) {
    const u = ctx.project.unions[uid];
    if (!u || u.partnerIds.length < 2) continue;
    const partner = u.partnerIds.find((id) => id !== childId);
    const partnerGn = partner ? ctx.graphNode(partner) : undefined;
    if (partner && partnerGn && partnerGn.layer === layer) {
      spouseId = partner;
      break;
    }
  }

  if (spouseId) {
    placeCoupleAtCenter(ctx, [childId, spouseId], centerXCells, layer);
  } else {
    ctx.placePerson(childId, centerXCells, { layer });
  }
}

/** Фаза C.2: подъём — дорисовка оставшихся детей в union. */
export function layoutDescendantsComplete(ctx: LayoutContext): void {
  const maxLayer = Math.max(...[...ctx.personToNode.values()].map((n) => n.layer), 0);

  for (let layer = maxLayer; layer >= 1; layer--) {
    for (const [unionId, state] of partialChildUnions) {
      const union = ctx.project.unions[unionId];
      if (!union) continue;

      const secondaryIds = pickSecondaryChildIds(unionId, ctx.project, state.placedChildId);
      const parentCenter = state.parentIds
        .map((id) => ctx.getPlacement(id))
        .filter(Boolean)[0]?.centerXCells;
      if (parentCenter === undefined) continue;

      const placedPrimary = ctx.getPlacement(state.placedChildId);
      if (!placedPrimary || placedPrimary.layer !== layer) continue;

      let xCursor = placedPrimary.centerXCells + CARD_WIDTH_CELLS + SIBLING_GAP_CELLS;

      for (const childId of secondaryIds) {
        if (ctx.isPlaced(childId)) continue;
        placeChildWithSpouse(ctx, childId, xCursor, layer);
        xCursor += CARD_WIDTH_CELLS + SIBLING_GAP_CELLS;
      }

      const allChildren = union.childIds.filter((id) => ctx.isPlaced(id));
      if (allChildren.length >= 2) {
        const xs = allChildren.map((id) => ctx.getPlacement(id)!.centerXCells);
        const rowCenter = (Math.min(...xs) + Math.max(...xs)) / 2;
        const delta = parentCenter - rowCenter;
        if (Math.abs(delta) > 0.01) {
          shiftPersons(
            ctx,
            allChildren.flatMap((id) => [...collectDescendantSubtree(ctx, id)]),
            delta,
          );
        }
      }

      resolveLayerOverlapAfterExpand(ctx, layer, allChildren);
    }
  }

  partialChildUnions.clear();
}

export function layoutDescendants(ctx: LayoutContext): void {
  layoutDescendantsDown(ctx);
  layoutDescendantsComplete(ctx);
}
