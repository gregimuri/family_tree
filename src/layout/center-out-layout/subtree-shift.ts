import type { LayoutContext } from './layout-context';
import { cardLeftEdge, cardRightEdge, COUPLE_GAP_CELLS, UNIT_GAP_CELLS, boxesOverlap } from './grid-math';

/** Собрать personId + всех потомков (вниз по union.childIds) и супругов на том же layer. */
export function collectDescendantSubtree(
  ctx: LayoutContext,
  rootPersonId: string,
): Set<string> {
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
        const partnerGn = ctx.graphNode(partnerId);
        const partnerPlaced = ctx.getPlacement(partnerId);
        if (
          partnerGn &&
          partnerPlaced &&
          partnerGn.layer === placement.layer &&
          partnerPlaced.layer === placement.layer
        ) {
          result.add(partnerId);
        }
      }
    }
  }
  return result;
}

/** Собрать personId + предков вниз к центру (layer > root.layer) — «поддерево в сторону центра». */
export function collectTowardCenterSubtree(
  ctx: LayoutContext,
  rootPersonId: string,
): Set<string> {
  const result = new Set<string>();
  const root = ctx.getPlacement(rootPersonId);
  if (!root) return result;

  const queue = [rootPersonId];
  while (queue.length > 0) {
    const pid = queue.shift()!;
    if (result.has(pid)) continue;
    result.add(pid);

    const placement = ctx.getPlacement(pid);
    if (!placement) continue;

    for (const puid of ctx.project.persons[pid]?.parentUnionIds ?? []) {
      for (const childId of ctx.project.unions[puid]?.childIds ?? []) {
        if (childId === pid) continue;
        const childPlaced = ctx.getPlacement(childId);
        if (childPlaced && childPlaced.layer > placement.layer) {
          queue.push(childId);
        }
      }
    }

    for (const puid of ctx.project.persons[pid]?.parentUnionIds ?? []) {
      for (const childId of ctx.project.unions[puid]?.childIds ?? []) {
        if (childId !== pid) continue;
        for (const parentId of ctx.project.unions[puid]?.partnerIds ?? []) {
          if (parentId === pid) continue;
          const parentPlaced = ctx.getPlacement(parentId);
          if (parentPlaced && parentPlaced.layer > placement.layer) {
            queue.push(parentId);
          }
        }
      }
    }
  }
  return result;
}

export function shiftPersons(
  ctx: LayoutContext,
  personIds: Iterable<string>,
  deltaCells: number,
): void {
  if (Math.abs(deltaCells) < 0.001) return;
  for (const pid of personIds) {
    const p = ctx.getPlacement(pid);
    if (p) p.centerXCells += deltaCells;
  }
}

export function resolveLayerOverlapAfterExpand(
  ctx: LayoutContext,
  layer: number,
  _expandedPersonIds: string[],
  scale = 1,
): void {
  const onLayer = ctx.personsOnLayer(layer).sort(
    (a, b) => a.centerXCells - b.centerXCells,
  );
  if (onLayer.length < 2) return;

  for (let round = 0; round < 24; round++) {
    let moved = 0;
    for (let i = 1; i < onLayer.length; i++) {
      const prev = onLayer[i - 1];
      const curr = onLayer[i];
      const prevR = cardRightEdge(prev.centerXCells, scale);
      const currL = cardLeftEdge(curr.centerXCells, scale);
      const gap = prev.isSideBranch || curr.isSideBranch ? UNIT_GAP_CELLS : COUPLE_GAP_CELLS;
      const need = prevR + gap;
      const delta = need - currL;
      if (delta <= 0.01) continue;

      const half = delta / 2;
      for (let j = 0; j < i; j++) {
        onLayer[j].centerXCells -= half;
      }
      for (let j = i; j < onLayer.length; j++) {
        onLayer[j].centerXCells += half;
      }

      moved = Math.max(moved, delta);
      onLayer.sort((a, b) => a.centerXCells - b.centerXCells);
    }
    if (moved < 0.01) break;
  }
}

export function recenterCoupleOverChild(
  ctx: LayoutContext,
  unionId: string,
  partnerIds: string[],
  childIds: string[],
): void {
  const childCenter = childIds.reduce(
    (s, id) => s + (ctx.getPlacement(id)?.centerXCells ?? 0),
    0,
  ) / Math.max(1, childIds.filter((id) => ctx.isPlaced(id)).length);

  const union = ctx.project.unions[unionId];
  if (!union) return;

  const sorted = [...partnerIds].sort((a, b) => {
    const pa = ctx.getPlacement(a);
    const pb = ctx.getPlacement(b);
    return (pa?.centerXCells ?? 0) - (pb?.centerXCells ?? 0);
  });

  if (sorted.length >= 2) {
    const w = 6;
    const span = w * 2 + COUPLE_GAP_CELLS;
    const leftCenter = childCenter - span / 2 + w / 2;
    ctx.placePerson(sorted[0], leftCenter, { layer: ctx.getPlacement(sorted[0])!.layer });
    ctx.placePerson(sorted[1], leftCenter + w + COUPLE_GAP_CELLS, {
      layer: ctx.getPlacement(sorted[1])!.layer,
    });
  } else if (sorted.length === 1) {
    ctx.placePerson(sorted[0], childCenter, { layer: ctx.getPlacement(sorted[0])!.layer });
  }
}

export function bboxForPersons(
  ctx: LayoutContext,
  personIds: string[],
  scale = 1,
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const pid of personIds) {
    const p = ctx.getPlacement(pid);
    if (!p) continue;
    min = Math.min(min, cardLeftEdge(p.centerXCells, scale));
    max = Math.max(max, cardRightEdge(p.centerXCells, scale));
  }
  if (!Number.isFinite(min)) return null;
  return { min, max };
}

export function checkOverlapWithNeighbors(
  ctx: LayoutContext,
  layer: number,
  bbox: { min: number; max: number },
  excludeIds: Set<string>,
  scale = 1,
): number {
  let maxPush = 0;
  for (const p of ctx.personsOnLayer(layer)) {
    if (excludeIds.has(p.personId)) continue;
    const other = {
      min: cardLeftEdge(p.centerXCells, scale),
      max: cardRightEdge(p.centerXCells, scale),
    };
    if (boxesOverlap(bbox.min, bbox.max, other.min, other.max, COUPLE_GAP_CELLS)) {
      const push = other.max + COUPLE_GAP_CELLS - bbox.min;
      maxPush = Math.max(maxPush, push);
    }
  }
  return maxPush;
}
