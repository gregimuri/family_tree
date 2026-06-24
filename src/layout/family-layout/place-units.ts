import type { Project } from '../../types';
import type { GraphResult } from '../graph-builder';
import { COUPLE_GAP, getCardScale } from '../graph-builder';
import { getCardDimensions } from '../card-dimensions';
import type { FamilyLayoutGraph, FamilyUnit } from './types';
import { GROUP_GAP, SIBLING_GAP } from './types';
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

  for (let pass = 0; pass < 12; pass++) {
    alignParentsOverChildren(layout, centers, widths, project);
  }

  for (const layer of [...layout.sortedLayers].filter((l) => l < 0).reverse()) {
    packLayerWithWidths(layout.layers.get(layer) ?? [], centers, widths, 0);
    alignParentsOverChildren(layout, centers, widths, project);
  }

  anchorMainToZero(layout, centers);
  if (!options?.skipCrossUnionSnap) {
    snapCrossUnionSpouses(layout, centers, widths, project, graph, personOrder);
    realignCrossUnionParentUnits(layout, centers, widths, project, graph);
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
  const sideGap = 96;
  const mainSideGap = 88;

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
  const layersToRepack = new Set<number>();

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
      layersToRepack.add(layer);
    }
  }

  for (const layer of layersToRepack) {
    const units = layout.layers.get(layer) ?? [];
    if (units.length === 0) continue;
    const main = units.filter((u) => u.branchSide === 'main');
    const anchor =
      main.length > 0
        ? main.reduce((s, u) => s + (centers.get(u.id) ?? 0), 0) / main.length
        : 0;
    packLayerWithWidths(units, centers, widths, anchor);
  }
}

function anchorMainToZero(layout: FamilyLayoutGraph, centers: Map<string, number>): void {
  const main = (layout.layers.get(0) ?? []).filter((u) => u.branchSide === 'main');
  if (main.length === 0) return;
  const avg = main.reduce((s, u) => s + (centers.get(u.id) ?? 0), 0) / main.length;
  if (Math.abs(avg) < 0.4) return;
  for (const unit of layout.units) {
    centers.set(unit.id, (centers.get(unit.id) ?? 0) - avg);
  }
}
