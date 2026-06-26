import type { Union } from '../../types';
import type { LayoutContext } from './layout-context';
import { childCenterXCells, lineageAncestorIds } from './layout-context';
import { placeCoupleAtCenter } from './layout-couple';
import { centerAncestorLayersOverFocus } from './layout-collateral';
import {
  CARD_WIDTH_CELLS,
  COUPLE_GAP_CELLS,
  cardLeftEdge,
  cardRightEdge,
} from './grid-math';
import { sortPartnersMaleLeft } from './primary-parent-rule';
import {
  collectDescendantSubtree,
  collectTowardCenterSubtree,
  shiftPersons,
} from './subtree-shift';

function mainChildUnionId(ctx: LayoutContext): string | undefined {
  if (ctx.project.center.type === 'family') {
    return ctx.project.center.id;
  }
  const focusId = ctx.focusPersonId;
  for (const uid of ctx.project.persons[focusId]?.unionIds ?? []) {
    const u = ctx.project.unions[uid];
    if (u?.childIds.some((cid) => ctx.personToNode.has(cid))) return uid;
  }
  return undefined;
}

function mainPartnerId(ctx: LayoutContext): string | undefined {
  const uid = mainChildUnionId(ctx);
  if (!uid) return undefined;
  return ctx.project.unions[uid]?.partnerIds.find(
    (id) => id !== ctx.focusPersonId && ctx.personToNode.has(id),
  );
}

function unionMarriageKey(union: Union): number {
  const y = union.marriageStart?.year ?? 9999;
  const m = union.marriageStart?.month ?? 0;
  const d = union.marriageStart?.day ?? 0;
  return y * 10000 + m * 100 + d;
}

function visiblePartnersInUnion(ctx: LayoutContext, unionId: string): string[] {
  const union = ctx.project.unions[unionId];
  if (!union) return [];
  return union.partnerIds.filter((id) => ctx.personToNode.has(id));
}

function unionsWithVisibleChildren(ctx: LayoutContext, personId: string): string[] {
  return (ctx.project.persons[personId]?.unionIds ?? []).filter((uid) => {
    const u = ctx.project.unions[uid];
    return u && u.childIds.some((cid) => ctx.personToNode.has(cid));
  });
}

/** Шаги 1–2: минимальная правка layer 0 без перестройки remarriage-цепочек. */
function alignCenterLayerMinimal(ctx: LayoutContext): void {
  const focusId = ctx.focusPersonId;
  if (!ctx.personToNode.has(focusId)) return;

  if (ctx.project.center.type === 'family') {
    const partners = visiblePartnersInUnion(ctx, ctx.project.center.id);
    if (partners.length >= 2 && !ctx.isPlaced(partners[0])) {
      placeCoupleAtCenter(ctx, partners, 0, 0);
    }
    return;
  }

  if (!ctx.isPlaced(focusId)) {
    ctx.placePerson(focusId, 0, { layer: 0 });
  }

  const partners = (ctx.project.persons[focusId]?.unionIds ?? [])
    .flatMap((uid) => visiblePartnersInUnion(ctx, uid))
    .filter((id, i, arr) => id !== focusId && arr.indexOf(id) === i);

  if (partners.length === 1 && unionsWithVisibleChildren(ctx, focusId).length <= 1) {
    const sorted = sortPartnersMaleLeft([focusId, partners[0]], ctx.project);
    placeCoupleAtCenter(ctx, sorted, ctx.getPlacement(focusId)!.centerXCells, 0);
    return;
  }

  const mainPid = mainPartnerId(ctx);
  if (mainPid && ctx.isPlaced(mainPid)) {
    const sorted = sortPartnersMaleLeft([focusId, mainPid], ctx.project);
    const centerX = ctx.getPlacement(focusId)!.centerXCells;
    placeCoupleAtCenter(ctx, sorted, centerX, 0);

    const childUnions = unionsWithVisibleChildren(ctx, focusId);
    if (childUnions.length >= 2) {
      const extraUnions = childUnions
        .filter((uid) => uid !== mainChildUnionId(ctx))
        .sort((a, b) => unionMarriageKey(ctx.project.unions[a]!) - unionMarriageKey(ctx.project.unions[b]!));

      const mainRight = ctx.getPlacement(mainPid)!.centerXCells > ctx.getPlacement(focusId)!.centerXCells;
      let chainX =
        ctx.getPlacement(mainPid)!.centerXCells +
        (mainRight ? CARD_WIDTH_CELLS + COUPLE_GAP_CELLS : -(CARD_WIDTH_CELLS + COUPLE_GAP_CELLS));

      for (const uid of extraUnions) {
        const p = visiblePartnersInUnion(ctx, uid).find((id) => id !== focusId);
        if (!p) continue;
        if (!ctx.isPlaced(p)) ctx.placePerson(p, chainX, { layer: 0 });
        chainX += mainRight ? CARD_WIDTH_CELLS + COUPLE_GAP_CELLS : -(CARD_WIDTH_CELLS + COUPLE_GAP_CELLS);
      }
    }
  }
}

function placeParentCoupleOverChild(
  ctx: LayoutContext,
  childId: string,
  parentUnionId: string,
): void {
  const child = ctx.getPlacement(childId);
  if (!child) return;

  const partners = visiblePartnersInUnion(ctx, parentUnionId);
  if (partners.length === 0) return;

  const parentLayer = child.layer - 1;
  const centerX = child.centerXCells;

  if (partners.length >= 2) {
    placeCoupleAtCenter(ctx, partners, centerX, parentLayer);
  } else {
    ctx.placePerson(partners[0], centerX, { layer: parentLayer });
  }
}

function fatherLineTargets(ctx: LayoutContext): string[] {
  const mainPid = mainPartnerId(ctx);
  if (mainPid) {
    const g = ctx.project.persons[mainPid]?.gender;
    if (g === 'male') return [mainPid];
    if (ctx.project.persons[ctx.focusPersonId]?.gender === 'male') return [ctx.focusPersonId];
    return [ctx.focusPersonId];
  }
  const focusId = ctx.focusPersonId;
  for (const puid of ctx.project.persons[focusId]?.parentUnionIds ?? []) {
    const partners = visiblePartnersInUnion(ctx, puid);
    const father = partners.find((id) => ctx.project.persons[id]?.gender === 'male');
    if (father) return [father];
    const sorted = sortPartnersMaleLeft(partners, ctx.project);
    if (sorted[0]) return [sorted[0]];
  }
  return [focusId];
}

function motherLineTargets(ctx: LayoutContext): string[] {
  const mainPid = mainPartnerId(ctx);
  if (mainPid) return [mainPid];

  const focusId = ctx.focusPersonId;
  for (const puid of ctx.project.persons[focusId]?.parentUnionIds ?? []) {
    const partners = visiblePartnersInUnion(ctx, puid);
    const mother = partners.find((id) => ctx.project.persons[id]?.gender === 'female');
    if (mother) return [mother];
    const sorted = sortPartnersMaleLeft(partners, ctx.project);
    if (sorted[1]) return [sorted[1]];
  }
  return [];
}

function placeDirectParentsOverCenter(ctx: LayoutContext): void {
  const focusId = ctx.focusPersonId;
  if (mainPartnerId(ctx) && ctx.isPlaced(mainPartnerId(ctx)!)) return;

  for (const puid of ctx.project.persons[focusId]?.parentUnionIds ?? []) {
    placeParentCoupleOverChild(ctx, focusId, puid);
  }
}

function countGenerationRepresentatives(ctx: LayoutContext, layer: number): number {
  return ctx.personsOnLayer(layer).filter((p) => !p.isSideBranch).length;
}

function shiftAmountsForLayer(ctx: LayoutContext, layer: number): {
  pairShift: number;
  descendantShift: number;
} {
  const count = countGenerationRepresentatives(ctx, layer);
  if (count >= 4) {
    return { pairShift: CARD_WIDTH_CELLS, descendantShift: CARD_WIDTH_CELLS / 2 };
  }
  return { pairShift: CARD_WIDTH_CELLS / 2, descendantShift: CARD_WIDTH_CELLS / 4 };
}

function findCouplePartnerIds(ctx: LayoutContext, personId: string, layer: number): string[] {
  for (const uid of ctx.project.persons[personId]?.unionIds ?? []) {
    const partners = visiblePartnersInUnion(ctx, uid).filter(
      (id) => ctx.getPlacement(id)?.layer === layer,
    );
    if (partners.includes(personId) && partners.length >= 2) return partners;
  }
  for (const puid of ctx.project.persons[personId]?.parentUnionIds ?? []) {
    const partners = visiblePartnersInUnion(ctx, puid).filter(
      (id) => ctx.getPlacement(id)?.layer === layer,
    );
    if (partners.includes(personId)) return partners.length > 0 ? partners : [personId];
  }
  return [personId];
}

function findChildrenBelowCouple(
  ctx: LayoutContext,
  partnerIds: string[],
  parentLayer: number,
): string[] {
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

/** Шаг 5: сдвиг самой правой пары вправо + потомок на половину. */
function resolveLayerCollisionStep5(ctx: LayoutContext, layer: number): boolean {
  const onLayer = ctx
    .personsOnLayer(layer)
    .filter((p) => !p.isSideBranch)
    .sort((a, b) => a.centerXCells - b.centerXCells);

  if (onLayer.length < 2) return false;

  let collided = false;
  for (let i = 1; i < onLayer.length; i++) {
    const prev = onLayer[i - 1];
    const curr = onLayer[i];
    const overlap = cardRightEdge(prev.centerXCells) + COUPLE_GAP_CELLS - cardLeftEdge(curr.centerXCells);
    if (overlap <= 0.01) continue;

    collided = true;
    const { pairShift, descendantShift } = shiftAmountsForLayer(ctx, layer);
    const shift = Math.max(overlap, pairShift);

    const rightPartnerIds = findCouplePartnerIds(ctx, curr.personId, layer);
    shiftPersons(ctx, rightPartnerIds, shift);

    const descendantIds = new Set<string>();
    for (const cid of findChildrenBelowCouple(ctx, rightPartnerIds, layer)) {
      collectDescendantSubtree(ctx, cid).forEach((id) => descendantIds.add(id));
      collectTowardCenterSubtree(ctx, cid).forEach((id) => descendantIds.add(id));
    }
    for (const pid of rightPartnerIds) {
      collectTowardCenterSubtree(ctx, pid).forEach((id) => descendantIds.add(id));
    }
    rightPartnerIds.forEach((id) => descendantIds.delete(id));
    shiftPersons(ctx, descendantIds, descendantShift);
  }

  return collided;
}

function placeParentsForTargets(ctx: LayoutContext, targets: string[]): boolean {
  let placed = false;
  for (const personId of targets) {
    if (!ctx.isPlaced(personId)) continue;
    for (const puid of ctx.project.persons[personId]?.parentUnionIds ?? []) {
      const partners = visiblePartnersInUnion(ctx, puid);
      if (partners.length === 0) continue;
      placeParentCoupleOverChild(ctx, personId, puid);
      placed = true;
    }
  }
  return placed;
}

interface BranchAnchor {
  personId: string;
  direction: 'left' | 'right';
}

function findCollisionAnchors(ctx: LayoutContext, layer: number): BranchAnchor[] {
  const onLayer = ctx
    .personsOnLayer(layer)
    .filter((p) => !p.isSideBranch)
    .sort((a, b) => a.centerXCells - b.centerXCells);

  const anchors: BranchAnchor[] = [];
  for (let i = 1; i < onLayer.length; i++) {
    const prev = onLayer[i - 1];
    const curr = onLayer[i];
    if (cardRightEdge(prev.centerXCells) + COUPLE_GAP_CELLS > cardLeftEdge(curr.centerXCells) + 0.01) {
      anchors.push({ personId: prev.personId, direction: 'left' });
      anchors.push({ personId: curr.personId, direction: 'right' });
    }
  }
  return anchors;
}

/** Шаг 7: от пересёкшихся персон — следующие поколения к центру. */
function expandFromBranchAnchors(ctx: LayoutContext, anchors: BranchAnchor[]): void {
  for (const anchor of anchors) {
    let personId: string | undefined = anchor.personId;
    while (personId && ctx.isPlaced(personId)) {
      const layer = ctx.getPlacement(personId)!.layer;
      const parentLayer = layer - 1;
      if (parentLayer < Math.min(...[...ctx.personToNode.values()].map((n) => n.layer), -99)) break;

      let placed = false;
      for (const puid of ctx.project.persons[personId]?.parentUnionIds ?? []) {
        if (visiblePartnersInUnion(ctx, puid).length === 0) continue;
        placeParentCoupleOverChild(ctx, personId, puid);
        placed = true;
      }
      if (!placed) break;

      resolveLayerCollisionStep5(ctx, parentLayer);
      centerAncestorLayersOverFocus(ctx);

      const partners = (ctx.project.persons[personId]?.parentUnionIds ?? [])
        .flatMap((puid) => visiblePartnersInUnion(ctx, puid))
        .filter((id) => ctx.getPlacement(id)?.layer === parentLayer);

      if (partners.length === 0) break;
      const sorted = [...partners].sort(
        (a, b) =>
          (ctx.getPlacement(a)?.centerXCells ?? 0) - (ctx.getPlacement(b)?.centerXCells ?? 0),
      );
      personId = anchor.direction === 'left' ? sorted[sorted.length - 1] : sorted[0];
    }
  }
}

/** Шаги 3–7: выравнивание предков по поколениям. */
function rebuildAncestryAlignment(ctx: LayoutContext): void {
  const lineage = lineageAncestorIds(ctx);
  const minLayer = Math.min(
    ...[...ctx.personToNode.values()].map((n) => n.layer).filter((l) => l < 0),
    -1,
  );

  placeDirectParentsOverCenter(ctx);

  let fatherFirst = true;
  for (let layer = -1; layer >= minLayer; layer--) {
    const targets = fatherFirst
      ? [...fatherLineTargets(ctx), ...motherLineTargets(ctx)]
      : [...motherLineTargets(ctx), ...fatherLineTargets(ctx)];

    placeParentsForTargets(ctx, targets);

    for (const pid of lineage) {
      const p = ctx.getPlacement(pid);
      if (!p || p.layer !== layer) continue;
      for (const puid of ctx.project.persons[pid]?.parentUnionIds ?? []) {
        placeParentCoupleOverChild(ctx, pid, puid);
      }
    }

    let hadCollision = false;
    for (let round = 0; round < 6; round++) {
      if (resolveLayerCollisionStep5(ctx, layer)) {
        hadCollision = true;
      } else {
        break;
      }
    }

    if (hadCollision) {
      expandFromBranchAnchors(ctx, findCollisionAnchors(ctx, layer));
    }

    centerAncestorLayersOverFocus(ctx);
    fatherFirst = !fatherFirst;
  }
}

function alignAllUnionsOverChildren(ctx: LayoutContext): void {
  for (const union of Object.values(ctx.project.unions)) {
    if (union.partnerIds.length === 0 || union.childIds.length === 0) continue;

    const visibleParents = union.partnerIds.filter((id) => ctx.isPlaced(id));
    const visibleChildren = union.childIds.filter((id) => ctx.isPlaced(id));
    if (visibleParents.length === 0 || visibleChildren.length === 0) continue;

    const parentLayer = Math.min(...visibleParents.map((id) => ctx.getPlacement(id)!.layer));
    const childLayer = Math.max(...visibleChildren.map((id) => ctx.getPlacement(id)!.layer));
    if (childLayer !== parentLayer + 1) continue;

    const childCenter = childCenterXCells(ctx, visibleChildren);
    if (visibleParents.length >= 2) {
      placeCoupleAtCenter(ctx, visibleParents, childCenter, parentLayer);
    } else {
      ctx.placePerson(visibleParents[0], childCenter, { layer: parentLayer });
    }
  }
}

/**
 * Post-pass после авторасположения: выравнивание персон по правилам
 * построения предков (шаги 1–7) с сохранением центрирования над фокусом.
 */
export function alignAllPersonsAfterLayout(ctx: LayoutContext): void {
  alignCenterLayerMinimal(ctx);
  rebuildAncestryAlignment(ctx);
  alignAllUnionsOverChildren(ctx);
  centerAncestorLayersOverFocus(ctx);

  const layers = [...new Set([...ctx.placements.values()].map((p) => p.layer))]
    .filter((l) => l < 0)
    .sort((a, b) => a - b);

  for (const layer of layers) {
    for (let round = 0; round < 4; round++) {
      if (!resolveLayerCollisionStep5(ctx, layer)) break;
    }
    centerAncestorLayersOverFocus(ctx);
  }

  alignAllUnionsOverChildren(ctx);
  centerAncestorLayersOverFocus(ctx);
}
