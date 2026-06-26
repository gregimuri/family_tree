import type { LayoutContext } from './layout-context';
import { childCenterXCells, sortPartnersMaleLeft } from './layout-context';
import { CARD_WIDTH_CELLS, COUPLE_GAP_CELLS } from './grid-math';
import { placeCoupleAtCenter } from './layout-couple';
import { resolveLayerCollisionStep5 } from './subtree-shift';

const SIBLING_GAP_CELLS = COUPLE_GAP_CELLS;

function coupleBondCenterCells(ctx: LayoutContext, partnerIds: string[]): number {
  const placed = partnerIds
    .map((id) => ctx.getPlacement(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (placed.length === 0) return 0;
  if (placed.length === 1) return placed[0].centerXCells;
  const xs = placed.map((p) => p.centerXCells);
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

/** Размещение потомков: дети под серединой брака родителей. */
export function buildDescendants(ctx: LayoutContext): void {
  const maxLayer = Math.max(...[...ctx.personToNode.values()].map((n) => n.layer), 0);

  for (let layer = 0; layer < maxLayer; layer++) {
    for (const union of Object.values(ctx.project.unions)) {
      if (union.childIds.length === 0) continue;

      const visibleParents = union.partnerIds.filter((id) => ctx.isPlaced(id));
      if (visibleParents.length === 0) continue;

      const parentLayer = Math.min(...visibleParents.map((id) => ctx.getPlacement(id)!.layer));
      if (parentLayer !== layer) continue;

      const childIds = union.childIds.filter(
        (cid) => ctx.personToNode.has(cid) && ctx.graphNode(cid)!.layer === layer + 1,
      );
      if (childIds.length === 0) continue;

      const bondCenter = coupleBondCenterCells(ctx, visibleParents);
      const n = childIds.length;
      const totalSpan = n * CARD_WIDTH_CELLS + (n - 1) * SIBLING_GAP_CELLS;
      const startCenter = bondCenter - totalSpan / 2 + CARD_WIDTH_CELLS / 2;

      childIds.sort((a, b) => {
        const ba = ctx.graphNode(a)?.birthOrder ?? 0;
        const bb = ctx.graphNode(b)?.birthOrder ?? 0;
        return ba - bb || a.localeCompare(b);
      });

      for (let i = 0; i < childIds.length; i++) {
        const childId = childIds[i];
        const cx = startCenter + i * (CARD_WIDTH_CELLS + SIBLING_GAP_CELLS);
        if (ctx.isPlaced(childId)) continue;

        const spouses = (ctx.project.persons[childId]?.unionIds ?? [])
          .flatMap((u) => ctx.project.unions[u]?.partnerIds ?? [])
          .filter(
            (id) =>
              id !== childId &&
              ctx.personToNode.has(id) &&
              ctx.graphNode(id)!.layer === layer + 1,
          );

        if (spouses.length > 0 && !spouses.some((id) => ctx.isPlaced(id))) {
          placeCoupleAtCenter(
            ctx,
            sortPartnersMaleLeft([childId, spouses[0]], ctx.project),
            cx,
            layer + 1,
          );
        } else if (!ctx.isPlaced(childId)) {
          ctx.placePerson(childId, cx, { layer: layer + 1 });
        }
      }
    }

    for (let round = 0; round < 6; round++) {
      if (!resolveLayerCollisionStep5(ctx, layer + 1)) break;
    }
  }

  for (const union of Object.values(ctx.project.unions)) {
    if (union.partnerIds.length < 2 || union.childIds.length === 0) continue;
    const visibleChildren = union.childIds.filter((id) => ctx.isPlaced(id));
    if (visibleChildren.length === 0) continue;
    const childCenter = childCenterXCells(ctx, visibleChildren);
    const parentLayer = Math.min(
      ...union.partnerIds.map((id) => ctx.getPlacement(id)?.layer ?? 999).filter((l) => l !== 999),
    );
    const visibleParents = union.partnerIds.filter((id) => ctx.isPlaced(id));
    if (visibleParents.length >= 2) {
      placeCoupleAtCenter(ctx, visibleParents, childCenter, parentLayer);
    }
  }
}
