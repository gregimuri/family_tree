import type { LayoutContext } from './layout-context';
import {
  mainPartnerId,
  sortPartnersMaleLeft,
  visiblePartners,
  childCenterXCells,
} from './layout-context';
import { CARD_WIDTH_CELLS, COUPLE_GAP_CELLS } from './grid-math';
import { placeCoupleAtCenter, placeParentCoupleOverChild } from './layout-couple';
import {
  centerLineageAncestorsOverFocus,
  resolveLayerCollisionStep5,
  buildLayerUnits,
  measureUnit,
} from './subtree-shift';
import type { Union } from '../../types';

function unionMarriageKey(union: Union): number {
  const y = union.marriageStart?.year ?? 9999;
  const m = union.marriageStart?.month ?? 0;
  const d = union.marriageStart?.day ?? 0;
  return y * 10000 + m * 100 + d;
}

function unionsWithChildren(ctx: LayoutContext, personId: string): string[] {
  return (ctx.project.persons[personId]?.unionIds ?? []).filter((uid) => {
    const u = ctx.project.unions[uid];
    return u && u.childIds.some((cid) => ctx.personToNode.has(cid));
  });
}

/** Шаги 1–2: центральная персона и партнёры. */
export function alignCenterLayer(ctx: LayoutContext): void {
  const focusId = ctx.focusPersonId;
  if (!ctx.personToNode.has(focusId)) return;

  if (ctx.project.center.type === 'family') {
    const partners = visiblePartners(ctx, ctx.project.center.id);
    if (partners.length >= 2) placeCoupleAtCenter(ctx, partners, 0, 0);
    else if (partners.length === 1) ctx.placePerson(partners[0], 0, { layer: 0 });
    return;
  }

  ctx.placePerson(focusId, 0, { layer: 0 });

  const allPartners = (ctx.project.persons[focusId]?.unionIds ?? [])
    .flatMap((uid) => visiblePartners(ctx, uid))
    .filter((id, i, arr) => id !== focusId && arr.indexOf(id) === i);

  if (allPartners.length === 0) {
    for (const puid of ctx.project.persons[focusId]?.parentUnionIds ?? []) {
      placeParentCoupleOverChild(ctx, focusId, puid);
    }
    return;
  }

  if (allPartners.length === 1 && unionsWithChildren(ctx, focusId).length <= 1) {
    placeCoupleAtCenter(ctx, sortPartnersMaleLeft([focusId, allPartners[0]], ctx.project), 0, 0);
    return;
  }

  const childUnions = unionsWithChildren(ctx, focusId);
  if (childUnions.length >= 2) {
    const sorted = [...childUnions].sort(
      (a, b) => unionMarriageKey(ctx.project.unions[a]!) - unionMarriageKey(ctx.project.unions[b]!),
    );
    const firstTwo: string[] = [];
    for (let i = 0; i < Math.min(2, sorted.length); i++) {
      const p = visiblePartners(ctx, sorted[i]).find((id) => id !== focusId);
      if (p) firstTwo.push(p);
    }
    if (firstTwo.length >= 2) {
      const sortedPeople = sortPartnersMaleLeft([focusId, ...firstTwo], ctx.project);
      const w = CARD_WIDTH_CELLS;
      const left = -((w * 3 + COUPLE_GAP_CELLS * 2) / 2) + w / 2;
      ctx.placePerson(sortedPeople[0], left, { layer: 0 });
      ctx.placePerson(sortedPeople[1], left + w + COUPLE_GAP_CELLS, { layer: 0 });
      ctx.placePerson(sortedPeople[2], left + (w + COUPLE_GAP_CELLS) * 2, { layer: 0 });
      let rx = left + (w + COUPLE_GAP_CELLS) * 3;
      for (let i = 2; i < sorted.length; i++) {
        const p = visiblePartners(ctx, sorted[i]).find((id) => id !== focusId);
        if (!p || ctx.isPlaced(p)) continue;
        ctx.placePerson(p, rx, { layer: 0 });
        rx += w + COUPLE_GAP_CELLS;
      }
      return;
    }
  }

  const mainPid = mainPartnerId(ctx);
  if (mainPid) {
    placeCoupleAtCenter(ctx, sortPartnersMaleLeft([focusId, mainPid], ctx.project), 0, 0);
    const side = allPartners.filter((id) => id !== mainPid);
    const mainPlaced = ctx.getPlacement(mainPid)!;
    const mainRight = mainPlaced.centerXCells > 0;
    let chainX =
      mainPlaced.centerXCells +
      (mainRight ? CARD_WIDTH_CELLS + COUPLE_GAP_CELLS : -(CARD_WIDTH_CELLS + COUPLE_GAP_CELLS));
    for (const pid of side) {
      if (!ctx.isPlaced(pid)) ctx.placePerson(pid, chainX, { layer: 0 });
      chainX += mainRight ? CARD_WIDTH_CELLS + COUPLE_GAP_CELLS : -(CARD_WIDTH_CELLS + COUPLE_GAP_CELLS);
    }
    return;
  }

  placeCoupleAtCenter(ctx, sortPartnersMaleLeft([focusId, allPartners[0]], ctx.project), 0, 0);
}

function fatherLineTarget(ctx: LayoutContext): string {
  const mainPid = mainPartnerId(ctx);
  if (mainPid && ctx.project.persons[mainPid]?.gender === 'male') return mainPid;
  if (ctx.project.persons[ctx.focusPersonId]?.gender === 'male') return ctx.focusPersonId;
  for (const puid of ctx.project.persons[ctx.focusPersonId]?.parentUnionIds ?? []) {
    const father = visiblePartners(ctx, puid).find((id) => ctx.project.persons[id]?.gender === 'male');
    if (father) return father;
    const sorted = sortPartnersMaleLeft(visiblePartners(ctx, puid), ctx.project);
    if (sorted[0]) return sorted[0];
  }
  return ctx.focusPersonId;
}

function motherLineTarget(ctx: LayoutContext): string | undefined {
  const mainPid = mainPartnerId(ctx);
  if (mainPid) return mainPid;
  for (const puid of ctx.project.persons[ctx.focusPersonId]?.parentUnionIds ?? []) {
    const mother = visiblePartners(ctx, puid).find((id) => ctx.project.persons[id]?.gender === 'female');
    if (mother) return mother;
    const sorted = sortPartnersMaleLeft(visiblePartners(ctx, puid), ctx.project);
    if (sorted[1]) return sorted[1];
  }
  return undefined;
}

interface BranchAnchor {
  personId: string;
  direction: 'left' | 'right';
}

function findCollisionAnchors(ctx: LayoutContext, layer: number): BranchAnchor[] {
  const units = buildLayerUnits(ctx, layer);
  const anchors: BranchAnchor[] = [];
  for (let i = 1; i < units.length; i++) {
    Object.assign(units[i - 1], measureUnit(ctx, units[i - 1].personIds));
    Object.assign(units[i], measureUnit(ctx, units[i].personIds));
    const overlap = units[i - 1].rightEdge + COUPLE_GAP_CELLS - units[i].leftEdge;
    if (overlap <= 0.01) continue;
    anchors.push({ personId: units[i - 1].personIds[0], direction: 'left' });
    anchors.push({ personId: units[i].personIds[0], direction: 'right' });
  }
  return anchors;
}

function expandFromAnchors(ctx: LayoutContext, anchors: BranchAnchor[]): void {
  for (const anchor of anchors) {
    let personId: string | undefined = anchor.personId;
    while (personId && ctx.isPlaced(personId)) {
      let placed = false;
      for (const puid of ctx.project.persons[personId]?.parentUnionIds ?? []) {
        if (visiblePartners(ctx, puid).length === 0) continue;
        placeParentCoupleOverChild(ctx, personId, puid);
        placed = true;
      }
      if (!placed) break;

      const parentLayer = ctx.getPlacement(personId)!.layer - 1;
      const partners: string[] = (ctx.project.persons[personId]?.parentUnionIds ?? [])
        .flatMap((puid) => visiblePartners(ctx, puid))
        .filter((id) => ctx.getPlacement(id)?.layer === parentLayer);
      if (partners.length === 0) break;
      const sorted: string[] = [...partners].sort(
        (a, b) =>
          (ctx.getPlacement(a)?.centerXCells ?? 0) - (ctx.getPlacement(b)?.centerXCells ?? 0),
      );
      personId = anchor.direction === 'left' ? sorted[sorted.length - 1] : sorted[0];
    }
  }
}

/** Шаги 3–7: построение предков. */
export function buildAncestry(ctx: LayoutContext): void {
  const minLayer = Math.min(
    ...[...ctx.personToNode.values()].map((n) => n.layer).filter((l) => l < 0),
    -1,
  );

  if (!mainPartnerId(ctx)) {
    for (const puid of ctx.project.persons[ctx.focusPersonId]?.parentUnionIds ?? []) {
      placeParentCoupleOverChild(ctx, ctx.focusPersonId, puid);
    }
  }

  let fatherFirst = true;
  for (let layer = -1; layer >= minLayer; layer--) {
    const childLayer = layer + 1;
    for (const placement of ctx.personsOnLayer(childLayer)) {
      for (const puid of ctx.project.persons[placement.personId]?.parentUnionIds ?? []) {
        placeParentCoupleOverChild(ctx, placement.personId, puid);
      }
    }

    const targets = fatherFirst
      ? [fatherLineTarget(ctx), motherLineTarget(ctx)].filter(Boolean) as string[]
      : [motherLineTarget(ctx), fatherLineTarget(ctx)].filter(Boolean) as string[];

    for (const personId of targets) {
      if (!ctx.isPlaced(personId)) continue;
      for (const puid of ctx.project.persons[personId]?.parentUnionIds ?? []) {
        placeParentCoupleOverChild(ctx, personId, puid);
      }
    }

    let hadCollision = false;
    for (let round = 0; round < 6; round++) {
      if (resolveLayerCollisionStep5(ctx, layer)) hadCollision = true;
      else break;
    }

    if (hadCollision) {
      expandFromAnchors(ctx, findCollisionAnchors(ctx, layer));
    }

    centerLineageAncestorsOverFocus(ctx);
    fatherFirst = !fatherFirst;
  }
}

export function alignAllParentsOverChildren(ctx: LayoutContext): void {
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
