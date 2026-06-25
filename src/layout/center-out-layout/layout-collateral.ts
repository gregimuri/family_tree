import type { LayoutContext } from './layout-context';
import { lineageAncestorIds } from './layout-context';
import { CARD_WIDTH_CELLS } from './grid-math';

/** Сдвинуть слои предков lineage над фокусной персоной. */
export function centerAncestorLayersOverFocus(ctx: LayoutContext): void {
  const focus = ctx.getPlacement(ctx.focusPersonId);
  if (!focus) return;

  const lineage = lineageAncestorIds(ctx);
  const mainAncestors = [...ctx.placements.values()].filter(
    (p) => p.layer < 0 && !p.isSideBranch && lineage.has(p.personId),
  );
  if (mainAncestors.length === 0) return;

  const min = Math.min(...mainAncestors.map((p) => p.centerXCells - CARD_WIDTH_CELLS / 2));
  const max = Math.max(...mainAncestors.map((p) => p.centerXCells + CARD_WIDTH_CELLS / 2));
  const ancestorCenter = (min + max) / 2;
  const delta = focus.centerXCells - ancestorCenter;
  if (Math.abs(delta) < 0.01) return;

  const affectedLayers = new Set(mainAncestors.map((p) => p.layer));
  for (const p of ctx.placements.values()) {
    if (p.layer < 0 && affectedLayers.has(p.layer)) {
      p.centerXCells += delta;
    }
  }
}

import {
  CARD_WIDTH_CELLS,
  COUPLE_GAP_CELLS,
  SIBLING_GAP_CELLS,
  UNIT_GAP_CELLS,
  cardLeftEdge,
  cardRightEdge,
} from './grid-math';
import { placeCoupleAtCenter } from './layout-couple';
import { resolveLayerOverlapAfterExpand } from './subtree-shift';
import { sortPartnersMaleLeft } from './primary-parent-rule';

function crossUnionPartner(personId: string, ctx: LayoutContext): string | undefined {
  const person = ctx.project.persons[personId];
  if (!person) return undefined;

  for (const unionId of person.unionIds) {
    const union = ctx.project.unions[unionId];
    if (!union || union.partnerIds.length < 2) continue;
    const partnerId = union.partnerIds.find((id) => id !== personId);
    if (!partnerId) continue;

    const myParents = new Set(person.parentUnionIds);
    const partnerParents = ctx.project.persons[partnerId]?.parentUnionIds ?? [];
    const sameBranch = partnerParents.some((id) => myParents.has(id));
    if (!sameBranch) return partnerId;
  }
  return undefined;
}

function siblingIdsOnLayer(ctx: LayoutContext, personId: string, layer: number): string[] {
  const result: string[] = [];
  for (const puid of ctx.project.persons[personId]?.parentUnionIds ?? []) {
    for (const sid of ctx.project.unions[puid]?.childIds ?? []) {
      if (sid === personId) continue;
      const gn = ctx.graphNode(sid);
      if (gn && gn.layer === layer) result.push(sid);
    }
  }
  return result;
}

function collateralSide(ctx: LayoutContext, personId: string): 'main' | 'left' | 'right' {
  const gn = ctx.graphNode(personId);
  if (gn && gn.branchSide !== 'main') return gn.branchSide;
  const person = ctx.project.persons[personId];
  for (const puid of person?.parentUnionIds ?? []) {
    for (const pid of ctx.project.unions[puid]?.partnerIds ?? []) {
      const g = ctx.project.persons[pid]?.gender;
      if (g === 'female') return 'left';
      if (g === 'male') return 'right';
    }
  }
  return gn?.branchSide ?? 'right';
}

function placeNearRelatives(ctx: LayoutContext, personId: string): void {
  const gn = ctx.graphNode(personId);
  if (!gn || ctx.isPlaced(personId)) return;

  const layer = gn.layer;
  const side = collateralSide(ctx, personId);

  const partnerId = crossUnionPartner(personId, ctx);
  if (partnerId && ctx.isPlaced(partnerId)) {
    const partner = ctx.getPlacement(partnerId)!;
    const targetX =
      partner.centerXCells + CARD_WIDTH_CELLS + COUPLE_GAP_CELLS;
    ctx.placePerson(personId, targetX, { layer });
    return;
  }

  for (const puid of ctx.project.persons[personId]?.unionIds ?? []) {
    const union = ctx.project.unions[puid];
    if (!union || union.partnerIds.length < 2) continue;
    const other = union.partnerIds.find((id) => id !== personId);
    if (other && ctx.isPlaced(other)) {
      const sorted = sortPartnersMaleLeft(union.partnerIds, ctx.project);
      placeCoupleAtCenter(ctx, sorted, ctx.getPlacement(other)!.centerXCells, layer);
      return;
    }
  }

  const sibs = siblingIdsOnLayer(ctx, personId, layer).filter((id) => ctx.isPlaced(id));
  if (sibs.length > 0) {
    const anchorId =
      sibs.find((id) => !ctx.graphNode(id)?.isSideBranch) ?? sibs[0];
    const anchor = ctx.getPlacement(anchorId)!;
    const sibGender = ctx.project.persons[anchorId]?.gender;
    if (sibGender === 'female') {
      ctx.placePerson(
        personId,
        anchor.centerXCells - SIBLING_GAP_CELLS - CARD_WIDTH_CELLS,
        { layer },
      );
    } else {
      ctx.placePerson(
        personId,
        anchor.centerXCells + CARD_WIDTH_CELLS + SIBLING_GAP_CELLS,
        { layer },
      );
    }
    return;
  }

  const onLayer = ctx.personsOnLayer(layer);
  if (onLayer.length === 0) {
    ctx.placePerson(personId, 0, { layer });
    return;
  }

  const mainOnLayer = onLayer.filter((p) => !p.isSideBranch);
  const ref = mainOnLayer.length > 0 ? mainOnLayer : onLayer;

  if (side === 'left') {
    const minLeft = Math.min(...ref.map((p) => cardLeftEdge(p.centerXCells)));
    ctx.placePerson(personId, minLeft - UNIT_GAP_CELLS - CARD_WIDTH_CELLS / 2, { layer });
  } else {
    const maxRight = Math.max(...ref.map((p) => cardRightEdge(p.centerXCells)));
    ctx.placePerson(personId, maxRight + UNIT_GAP_CELLS + CARD_WIDTH_CELLS / 2, { layer });
  }
}

export function snapCrossUnionSpouses(ctx: LayoutContext): void {
  for (const personId of ctx.personToNode.keys()) {
    const partnerId = crossUnionPartner(personId, ctx);
    if (!partnerId) continue;

    const a = ctx.getPlacement(personId);
    const b = ctx.getPlacement(partnerId);
    if (!a || !b || a.layer !== b.layer) continue;

    const leftId = a.centerXCells <= b.centerXCells ? personId : partnerId;
    const rightId = leftId === personId ? partnerId : personId;
    const left = ctx.getPlacement(leftId)!;
    const rightCenter = left.centerXCells + CARD_WIDTH_CELLS + COUPLE_GAP_CELLS;
    if (Math.abs(ctx.getPlacement(rightId)!.centerXCells - rightCenter) > 0.5) {
      ctx.placePerson(rightId, rightCenter, { layer: left.layer });
    }
  }
}

/** Разместить персон из графа без placement (collateral, siblings). */
export function layoutCollateral(ctx: LayoutContext): void {
  const layers = [...new Set([...ctx.personToNode.values()].map((n) => n.layer))].sort(
    (a, b) => a - b,
  );

  for (const layer of layers) {
    const unplaced = [...ctx.personToNode.keys()].filter(
      (id) => !ctx.isPlaced(id) && ctx.graphNode(id)?.layer === layer,
    );
    if (unplaced.length === 0) continue;

    unplaced.sort((a, b) => {
      const ba = ctx.graphNode(a)?.birthOrder ?? 0;
      const bb = ctx.graphNode(b)?.birthOrder ?? 0;
      return ba - bb || a.localeCompare(b);
    });

    for (const personId of unplaced) {
      placeNearRelatives(ctx, personId);
    }

    resolveLayerOverlapAfterExpand(ctx, layer, unplaced);
  }

  snapCrossUnionSpouses(ctx);
}

/** Выравнивание пар родителей над рядом детей. */
export function alignAllParentsOverChildren(ctx: LayoutContext): void {
  for (const union of Object.values(ctx.project.unions)) {
    if (union.partnerIds.length === 0 || union.childIds.length === 0) continue;

    const visibleParents = union.partnerIds.filter((id) => ctx.isPlaced(id));
    const visibleChildren = union.childIds.filter((id) => ctx.isPlaced(id));
    if (visibleParents.length === 0 || visibleChildren.length === 0) continue;

    const parentLayer = Math.min(...visibleParents.map((id) => ctx.getPlacement(id)!.layer));
    const childLayer = Math.max(...visibleChildren.map((id) => ctx.getPlacement(id)!.layer));
    if (childLayer !== parentLayer + 1) continue;

    const childXs = visibleChildren.map((id) => ctx.getPlacement(id)!.centerXCells);
    const childCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2;

    if (visibleParents.length >= 2) {
      placeCoupleAtCenter(ctx, visibleParents, childCenter, parentLayer);
    } else {
      ctx.placePerson(visibleParents[0], childCenter, { layer: parentLayer });
    }
  }
}

/** Переставить collateral-сиблингов относительно main-line брата/сестры. */
export function repositionCollateralSiblings(ctx: LayoutContext): void {
  for (const personId of ctx.personToNode.keys()) {
    const gn = ctx.graphNode(personId);
    if (!gn?.isSideBranch) continue;
    if (crossUnionPartner(personId, ctx)) continue;

    const layer = gn.layer;
    let anchorId: string | undefined;

    for (const puid of ctx.project.persons[personId]?.parentUnionIds ?? []) {
      for (const cid of ctx.project.unions[puid]?.childIds ?? []) {
        if (cid === personId) continue;
        const cgn = ctx.graphNode(cid);
        if (cgn && cgn.layer === layer && !cgn.isSideBranch && ctx.isPlaced(cid)) {
          anchorId = cid;
          break;
        }
      }
      if (anchorId) break;
    }

    if (!anchorId) continue;

    const anchor = ctx.getPlacement(anchorId)!;
    if (gn.branchSide === 'left') {
      ctx.placePerson(
        personId,
        anchor.centerXCells - SIBLING_GAP_CELLS - CARD_WIDTH_CELLS,
        { layer },
      );
    } else {
      ctx.placePerson(
        personId,
        anchor.centerXCells + CARD_WIDTH_CELLS + SIBLING_GAP_CELLS,
        { layer },
      );
    }
  }
}

/** Финальный проход: выравнивание + коллизии на всех слоях. */
export function finalizeLayout(ctx: LayoutContext): void {
  alignAllParentsOverChildren(ctx);

  const layers = [...new Set([...ctx.placements.values()].map((p) => p.layer))].sort(
    (a, b) => a - b,
  );
  for (const layer of layers) {
    resolveLayerOverlapAfterExpand(
      ctx,
      layer,
      ctx.personsOnLayer(layer).map((p) => p.personId),
    );
  }

  snapCrossUnionSpouses(ctx);
  repositionCollateralSiblings(ctx);
}
