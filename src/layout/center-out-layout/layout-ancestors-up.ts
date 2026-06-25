import type { LayoutContext } from './layout-context';
import {
  childCenterXCells,
  childPersonIdsForParentUnion,
  layer0PersonIds,
  lineageAncestorIds,
} from './layout-context';
import { placeCoupleAtCenter } from './layout-couple';
import { pickPrimaryParentId } from './primary-parent-rule';
import { resolveLayerOverlapAfterExpand } from './subtree-shift';

/** Фаза A: подъём вверх — layer −1 полные пары, далее по одному родителю на ветку. */
export function layoutAncestorsUp(ctx: LayoutContext): void {
  const lineage = lineageAncestorIds(ctx);

  const layer0Ids = layer0PersonIds(ctx);
  const processedParentUnions = new Set<string>();

  for (const childId of layer0Ids) {
    const childPlacement = ctx.getPlacement(childId);
    if (!childPlacement) continue;

    for (const parentUnionId of ctx.project.persons[childId]?.parentUnionIds ?? []) {
      if (processedParentUnions.has(parentUnionId)) continue;
      processedParentUnions.add(parentUnionId);

      const union = ctx.project.unions[parentUnionId];
      if (!union) continue;

      const visiblePartners = union.partnerIds.filter((id) => ctx.personToNode.has(id));
      if (visiblePartners.length === 0) continue;

      const parentLayer = childPlacement.layer - 1;
      const childIds = childPersonIdsForParentUnion(ctx, parentUnionId);
      const centerX = childCenterXCells(ctx, childIds.length > 0 ? childIds : [childId]);

      if (visiblePartners.length >= 2) {
        placeCoupleAtCenter(ctx, visiblePartners, centerX, parentLayer);
        ctx.markUnionComplete(parentUnionId, childIds.length > 0 ? childIds : [childId], visiblePartners);
      } else {
        ctx.placePerson(visiblePartners[0], centerX, { layer: parentLayer });
        ctx.markUnionPartial(parentUnionId, visiblePartners[0], childIds.length > 0 ? childIds : [childId]);
      }
    }
  }

  const minLayer = Math.min(
    ...[...ctx.personToNode.values()].map((n) => n.layer),
    0,
  );

  for (let layer = -1; layer >= minLayer; layer--) {
    const onLayer = ctx.personsOnLayer(layer).filter(
      (p) => lineage.has(p.personId) || layer === -1,
    );

    for (const person of onLayer) {
      for (const parentUnionId of ctx.project.persons[person.personId]?.parentUnionIds ?? []) {
        const unionState = ctx.unionStates.get(parentUnionId);
        if (unionState) continue;

        const union = ctx.project.unions[parentUnionId];
        if (!union) continue;

        const visiblePartners = union.partnerIds.filter((id) => ctx.personToNode.has(id));
        if (visiblePartners.length === 0) continue;

        const parentLayer = person.layer - 1;
        if (parentLayer < minLayer) continue;

        const childIds = childPersonIdsForParentUnion(ctx, parentUnionId);
        const relevantChild = childIds.includes(person.personId)
          ? person.personId
          : person.personId;
        const centerX = ctx.getPlacement(relevantChild)?.centerXCells ?? person.centerXCells;

        if (visiblePartners.length === 1) {
          if (!ctx.isPlaced(visiblePartners[0])) {
            ctx.placePerson(visiblePartners[0], centerX, { layer: parentLayer });
            ctx.markUnionComplete(parentUnionId, childIds.length > 0 ? childIds : [person.personId], visiblePartners);
          }
          continue;
        }

        const primaryId = pickPrimaryParentId(person.personId, parentUnionId, ctx.project);
        if (!primaryId || ctx.isPlaced(primaryId)) continue;

        ctx.placePerson(primaryId, centerX, { layer: parentLayer });
        ctx.markUnionPartial(
          parentUnionId,
          primaryId,
          childIds.length > 0 ? childIds : [person.personId],
        );
      }
    }

    resolveLayerOverlapAfterExpand(
      ctx,
      layer - 1,
      ctx.personsOnLayer(layer - 1).map((p) => p.personId),
    );
  }
}
