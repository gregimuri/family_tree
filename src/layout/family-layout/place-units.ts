import type { Project } from '../../types';
import type { GraphResult } from '../graph-builder';
import { COUPLE_GAP, getCardScale } from '../graph-builder';
import { getCardDimensions } from '../card-dimensions';
import type { FamilyLayoutGraph, FamilyUnit } from './types';
import { GROUP_GAP, SIBLING_GAP, MAIN_SIDE_GAP, SIDE_BRANCH_GAP } from './types';
import { childrenForParentAlignment, snapCrossUnionSpouses, realignCrossUnionParentUnits } from './cross-union';

/** Ширина блока в px. */
export function computeUnitWidth(
  unit: FamilyUnit,
  project: Project,
  personOrder?: string[],
): number {
  const settings = project.viewSettings;
  const order = personOrder ?? unit.personIds;
  const widths = order.map((pid) => {
    const person = project.persons[pid];
    const scale = getCardScale(unit.layer, unit.isSideBranch, 0, settings.cardSizeMode);
    if (person) {
      return getCardDimensions(project, person, settings, scale).w;
    }
    return COUPLE_GAP;
  });

  if (unit.kind === 'couple' && widths.length >= 2) {
    return widths[0] + COUPLE_GAP + widths[1];
  }
  if (unit.kind === 'siblings') {
    let total = widths.reduce((a, b) => a + b, 0);
    total += SIBLING_GAP * Math.max(0, widths.length - 1);
    return total;
  }
  return widths[0] ?? 120;
}

/** Центр main-линии (слой 0). */
function mainLineCenterX(layout: FamilyLayoutGraph, centers: Map<string, number>): number {
  const main0 = (layout.layers.get(0) ?? []).filter((u) => u.branchSide === 'main');
  if (main0.length === 0) return 0;
  return main0.reduce((s, u) => s + (centers.get(u.id) ?? 0), 0) / main0.length;
}

/** Предки центра (для выравнивания вверх от focus). */
function lineageAncestorPersonIds(project: Project): Set<string> | null {
  if (project.center.type !== 'person') return null;
  const centerId = project.center.id;
  const result = new Set<string>();
  const queue = [centerId];
  const seen = new Set<string>([centerId]);
  while (queue.length > 0) {
    const pid = queue.shift()!;
    for (const puid of project.persons[pid]?.parentUnionIds ?? []) {
      for (const parentId of project.unions[puid]?.partnerIds ?? []) {
        if (seen.has(parentId)) continue;
        seen.add(parentId);
        result.add(parentId);
        queue.push(parentId);
      }
    }
  }
  return result;
}

/** Центр фокуса на слое 0 (персона-центр или среднее main-линии). */
function focusCenterX(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  project: Project,
): number {
  if (project.center.type === 'person') {
    const unitId = layout.personToUnit.get(project.center.id);
    if (unitId) return centers.get(unitId) ?? 0;
  }
  return mainLineCenterX(layout, centers);
}

/** Сдвинуть ancestor-слои так, чтобы предки центра были над main-линией. */
function centerAncestryBlockOverMainLine(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  widths: Map<string, number>,
  project: Project,
): void {
  const mainCenter = focusCenterX(layout, centers, project);
  const lineageIds = lineageAncestorPersonIds(project);
  const ancestorLayers = layout.sortedLayers.filter((l) => l < 0);
  if (ancestorLayers.length === 0) return;

  let minX = Infinity;
  let maxX = -Infinity;
  for (const layer of ancestorLayers) {
    for (const u of layout.layers.get(layer) ?? []) {
      if (u.branchSide !== 'main') continue;
      if (lineageIds && !u.personIds.some((pid) => lineageIds.has(pid))) continue;
      const cx = centers.get(u.id) ?? 0;
      const w = widths.get(u.id) ?? 120;
      minX = Math.min(minX, cx - w / 2);
      maxX = Math.max(maxX, cx + w / 2);
    }
  }
  if (!Number.isFinite(minX)) return;

  const delta = mainCenter - (minX + maxX) / 2;
  if (Math.abs(delta) < 1) return;

  const affectedLayers = new Set<number>();
  for (const layer of ancestorLayers) {
    for (const u of layout.layers.get(layer) ?? []) {
      if (u.branchSide !== 'main') continue;
      if (lineageIds && !u.personIds.some((pid) => lineageIds.has(pid))) continue;
      affectedLayers.add(layer);
    }
  }

  for (const u of layout.units) {
    if (u.layer >= 0 || !affectedLayers.has(u.layer)) continue;
    centers.set(u.id, (centers.get(u.id) ?? 0) + delta);
  }
}

function childRowCenterForUnit(
  parent: FamilyUnit,
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  widths: Map<string, number>,
  project: Project,
  childLayer: number,
): number | null {
  const allChildren = parent.childUnitIds
    .map((id) => layout.unitById.get(id))
    .filter((u): u is FamilyUnit => Boolean(u && u.layer === childLayer));
  const children = childrenForParentAlignment(parent, allChildren, project);
  if (children.length === 0) return null;
  const childMin = Math.min(
    ...children.map((c) => (centers.get(c.id) ?? 0) - (widths.get(c.id) ?? 120) / 2),
  );
  const childMax = Math.max(
    ...children.map((c) => (centers.get(c.id) ?? 0) + (widths.get(c.id) ?? 120) / 2),
  );
  return (childMin + childMax) / 2;
}

/** Упаковать слои предков над центром их детей (bottom-up), без стягивания всего в одну точку. */
function repackAncestryLayersBottomUp(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  widths: Map<string, number>,
  project: Project,
): void {
  const ancestorLayers = layout.sortedLayers.filter((l) => l < 0).sort((a, b) => b - a);
  for (const layer of ancestorLayers) {
    const units = [...(layout.layers.get(layer) ?? [])];
    if (units.length === 0) continue;
    const childLayer = layer + 1;
    units.sort((a, b) => {
      const ca =
        childRowCenterForUnit(a, layout, centers, widths, project, childLayer) ??
        (centers.get(a.id) ?? 0);
      const cb =
        childRowCenterForUnit(b, layout, centers, widths, project, childLayer) ??
        (centers.get(b.id) ?? 0);
      return ca - cb || a.id.localeCompare(b.id);
    });
    layout.layers.set(layer, units);

    for (const u of units) {
      const cc = childRowCenterForUnit(u, layout, centers, widths, project, childLayer);
      if (cc !== null) centers.set(u.id, cc);
    }
    resolveCollisionsOnLayer(layout, centers, widths, layer);
  }
}

function resolveCollisionsOnLayer(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  widths: Map<string, number>,
  layer: number,
): void {
  const units = layout.layers.get(layer) ?? [];
  if (units.length < 2) return;

  for (let round = 0; round < 24; round++) {
    const sorted = [...units].sort(
      (a, b) =>
        (centers.get(a.id) ?? 0) - (centers.get(b.id) ?? 0) || a.id.localeCompare(b.id),
    );
    let moved = 0;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const prevR = (centers.get(prev.id) ?? 0) + (widths.get(prev.id) ?? 120) / 2;
      const currL = (centers.get(curr.id) ?? 0) - (widths.get(curr.id) ?? 120) / 2;
      const need = prevR + gapBetweenUnits(prev, curr);
      const delta = need - currL;
      if (delta > 0.4) {
        const half = delta / 2;
        for (let j = 0; j < i; j++) {
          const id = sorted[j].id;
          centers.set(id, (centers.get(id) ?? 0) - half);
        }
        for (let j = i; j < sorted.length; j++) {
          const id = sorted[j].id;
          centers.set(id, (centers.get(id) ?? 0) + half);
        }
        moved = Math.max(moved, delta);
      }
    }
    if (moved < 0.4) break;
  }
}

/** RT-style: уточнить центры блоков с учётом реальных ширин. */
export function refineUnitPlacements(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  widths: Map<string, number>,
  project: Project,
  graph: GraphResult,
  personOrder: Map<string, string[]>,
  options?: { skipCrossUnionSnap?: boolean },
): void {
  for (const unit of layout.units) {
    widths.set(unit.id, computeUnitWidth(unit, project));
  }

  for (const layer of layout.sortedLayers.filter((l) => l >= 0)) {
    packLayerWithWidths(layout.layers.get(layer) ?? [], centers, widths, 0);
  }

  for (let pass = 0; pass < 6; pass++) {
    alignParentsOverChildren(layout, centers, widths, project);
  }

  repackAncestryLayersBottomUp(layout, centers, widths, project);

  centerAncestryBlockOverMainLine(layout, centers, widths, project);
  for (let pass = 0; pass < 4; pass++) {
    alignParentsOverChildren(layout, centers, widths, project);
  }
  resolveUnitLayerCollisions(layout, centers, widths);
  anchorFocusToZero(layout, centers, project);
  if (!options?.skipCrossUnionSnap) {
    snapCrossUnionSpouses(layout, centers, widths, project, graph, personOrder);
    realignCrossUnionParentUnits(layout, centers, widths, project);
    snapCrossUnionSpouses(layout, centers, widths, project, graph, personOrder);
    resolveUnitLayerCollisions(layout, centers, widths);
    for (let pass = 0; pass < 2; pass++) {
      alignParentsOverChildren(layout, centers, widths, project);
    }
  }
}

function packLayerWithWidths(
  units: FamilyUnit[],
  centers: Map<string, number>,
  widths: Map<string, number>,
  targetX: number,
): void {
  const main = units.filter((u) => u.branchSide === 'main');
  const left = units.filter((u) => u.branchSide === 'left');
  const right = units.filter((u) => u.branchSide === 'right');

  const mainGap = GROUP_GAP;
  const sideGap = SIDE_BRANCH_GAP;
  const mainSideGap = MAIN_SIDE_GAP;

  const mainW =
    main.reduce((s, u) => s + (widths.get(u.id) ?? 120), 0) +
    Math.max(0, main.length - 1) * mainGap;
  let x = targetX - mainW / 2;

  for (let i = 0; i < main.length; i++) {
    const w = widths.get(main[i].id) ?? 120;
    centers.set(main[i].id, x + w / 2);
    x += w + (i < main.length - 1 ? mainGap : 0);
  }
  const mainEnd = x;

  if (left.length > 0) {
    const leftW =
      left.reduce((s, u) => s + (widths.get(u.id) ?? 120), 0) +
      Math.max(0, left.length - 1) * sideGap;
    let lx = targetX - mainW / 2 - mainSideGap - leftW;
    for (let i = 0; i < left.length; i++) {
      const w = widths.get(left[i].id) ?? 120;
      centers.set(left[i].id, lx + w / 2);
      lx += w + (i < left.length - 1 ? sideGap : 0);
    }
  }

  if (right.length > 0) {
    let rx = mainEnd + mainSideGap;
    for (let i = 0; i < right.length; i++) {
      const w = widths.get(right[i].id) ?? 120;
      centers.set(right[i].id, rx + w / 2);
      rx += w + (i < right.length - 1 ? sideGap : 0);
    }
  }
}

function alignParentsOverChildren(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  widths: Map<string, number>,
  project: Project,
): void {
  for (const layer of layout.sortedLayers) {
    const nextLayer = layer + 1;
    if (!layout.layers.has(nextLayer)) continue;

    for (const parent of layout.layers.get(layer) ?? []) {
      const allChildren = parent.childUnitIds
        .map((id) => layout.unitById.get(id))
        .filter((u): u is FamilyUnit => Boolean(u && u.layer === nextLayer));
      const children = childrenForParentAlignment(parent, allChildren, project);
      if (children.length === 0) continue;

      const parentCx = centers.get(parent.id) ?? 0;
      const childMin = Math.min(
        ...children.map((c) => (centers.get(c.id) ?? 0) - (widths.get(c.id) ?? 120) / 2),
      );
      const childMax = Math.max(
        ...children.map((c) => (centers.get(c.id) ?? 0) + (widths.get(c.id) ?? 120) / 2),
      );
      const childCenter = (childMin + childMax) / 2;
      const delta = childCenter - parentCx;
      if (Math.abs(delta) < 0.4) continue;

      centers.set(parent.id, parentCx + delta);
    }
  }
}

function shiftUnitSubtree(
  layout: FamilyLayoutGraph,
  rootUnitIds: string[],
  delta: number,
  centers: Map<string, number>,
): void {
  if (Math.abs(delta) < 0.01) return;
  const toMove = new Set<string>();
  const queue = [...rootUnitIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (toMove.has(id)) continue;
    toMove.add(id);
    const unit = layout.unitById.get(id);
    if (unit) queue.push(...unit.childUnitIds);
  }
  for (const id of toMove) {
    centers.set(id, (centers.get(id) ?? 0) + delta);
  }
}

function gapBetweenUnits(left: FamilyUnit, right: FamilyUnit): number {
  if (left.branchSide !== right.branchSide) return MAIN_SIDE_GAP;
  if (left.branchSide === 'main') return GROUP_GAP;
  return SIDE_BRANCH_GAP;
}

/** Устраняет горизонтальные наложения unit-ов на одном слое (без сдвига поддеревьев). */
export function resolveUnitLayerCollisions(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  widths: Map<string, number>,
): void {
  for (const layer of layout.sortedLayers) {
    if (layer < 0) {
      resolveCollisionsOnLayer(layout, centers, widths, layer);
      continue;
    }

    const units = layout.layers.get(layer) ?? [];
    if (units.length < 2) continue;

    for (let round = 0; round < 24; round++) {
      const sorted = [...units].sort(
        (a, b) =>
          (centers.get(a.id) ?? 0) - (centers.get(b.id) ?? 0) || a.id.localeCompare(b.id),
      );
      let moved = 0;
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const prevR = (centers.get(prev.id) ?? 0) + (widths.get(prev.id) ?? 120) / 2;
        const currL = (centers.get(curr.id) ?? 0) - (widths.get(curr.id) ?? 120) / 2;
        const need = prevR + gapBetweenUnits(prev, curr);
        const delta = need - currL;
        if (delta > 0.4) {
          const prevMain = prev.branchSide === 'main';
          const currMain = curr.branchSide === 'main';
          if (!prevMain && currMain) {
            if (prev.branchSide === 'left') {
              shiftUnitSubtree(layout, [prev.id], -delta, centers);
            } else {
              shiftUnitSubtree(layout, [prev.id], delta, centers);
            }
          } else if (prevMain && !currMain) {
            if (curr.branchSide === 'right') {
              shiftUnitSubtree(layout, [curr.id], delta, centers);
            } else {
              shiftUnitSubtree(layout, [curr.id], -delta, centers);
            }
          } else {
            shiftUnitSubtree(layout, [curr.id], delta, centers);
          }
          moved = Math.max(moved, delta);
        }
      }
      if (moved < 0.4) break;
    }
  }
}

function anchorFocusToZero(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  project: Project,
): void {
  const cx = focusCenterX(layout, centers, project);
  if (Math.abs(cx) < 0.4) return;
  for (const unit of layout.units) {
    centers.set(unit.id, (centers.get(unit.id) ?? 0) - cx);
  }
}
