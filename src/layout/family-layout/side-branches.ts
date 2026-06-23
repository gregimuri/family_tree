import type { Project } from '../../types';
import type { BranchSide } from '../graph-builder';
import type { FamilyLayoutGraph, FamilyUnit } from './types';
import { MAIN_SIDE_GAP, SIDE_BRANCH_GAP } from './types';
import { computeUnitWidth } from './place-units';

function genderPreferredSide(unit: FamilyUnit, project: Project): BranchSide {
  if (!unit.parentUnionId) return unit.branchSide;
  const union = project.unions[unit.parentUnionId];
  if (!union) return unit.branchSide;

  for (const pid of union.partnerIds) {
    const person = project.persons[pid];
    if (person?.gender === 'female') return 'left';
    if (person?.gender === 'male') return 'right';
  }
  return 'right';
}

function mainCorridorBounds(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  widths: Map<string, number>,
): { min: number; max: number } {
  const mainUnits = layout.units.filter((u) => u.branchSide === 'main');
  if (mainUnits.length === 0) return { min: -200, max: 200 };

  let min = Infinity;
  let max = -Infinity;
  for (const u of mainUnits) {
    const cx = centers.get(u.id) ?? 0;
    const w = widths.get(u.id) ?? 120;
    min = Math.min(min, cx - w / 2);
    max = Math.max(max, cx + w / 2);
  }
  return { min, max };
}

function scoreSidePlacement(
  unit: FamilyUnit,
  side: BranchSide,
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  widths: Map<string, number>,
  project: Project,
): number {
  const corridor = mainCorridorBounds(layout, centers, widths);
  const unitW = widths.get(unit.id) ?? computeUnitWidth(unit, project);
  const parent = unit.parentUnitId ? layout.unitById.get(unit.parentUnitId) : undefined;
  const parentCx = parent ? (centers.get(parent.id) ?? 0) : 0;

  let cx: number;
  if (side === 'left') {
    cx = corridor.min - MAIN_SIDE_GAP - unitW / 2;
  } else if (side === 'right') {
    cx = corridor.max + MAIN_SIDE_GAP + unitW / 2;
  } else {
    cx = centers.get(unit.id) ?? 0;
  }

  const distToParent = parent ? Math.abs(cx - parentCx) : 0;
  const treeSpan =
    Math.max(corridor.max, cx + unitW / 2) - Math.min(corridor.min, cx - unitW / 2);

  let overlapPenalty = 0;
  if (side === 'left' && cx + unitW / 2 > corridor.min - 4) overlapPenalty = 500;
  if (side === 'right' && cx - unitW / 2 < corridor.max + 4) overlapPenalty = 500;

  const genderSide = genderPreferredSide(unit, project);
  const genderPenalty = side === genderSide ? 0 : 8;

  return treeSpan * 0.3 + distToParent * 0.5 + overlapPenalty + genderPenalty;
}

function resolveCollateralOverlaps(
  units: FamilyUnit[],
  centers: Map<string, number>,
  widths: Map<string, number>,
  gap: number,
): void {
  const left = units
    .filter((u) => u.branchSide === 'left')
    .sort((a, b) => (centers.get(a.id) ?? 0) - (centers.get(b.id) ?? 0));
  const right = units
    .filter((u) => u.branchSide === 'right')
    .sort((a, b) => (centers.get(a.id) ?? 0) - (centers.get(b.id) ?? 0));

  for (const group of [left, right]) {
    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1];
      const curr = group[i];
      const prevR = (centers.get(prev.id) ?? 0) + (widths.get(prev.id) ?? 120) / 2;
      const currL = (centers.get(curr.id) ?? 0) - (widths.get(curr.id) ?? 120) / 2;
      const need = prevR + gap;
      if (currL < need) {
        const delta = need - currL;
        for (let j = i; j < group.length; j++) {
          const u = group[j];
          centers.set(u.id, (centers.get(u.id) ?? 0) + delta);
        }
      }
    }
  }
}

/** Мягкий выбор left/right для collateral unit-ов. */
export function assignSoftCollateralSides(
  layout: FamilyLayoutGraph,
  centers: Map<string, number>,
  widths: Map<string, number>,
  chosenSide: Map<string, BranchSide>,
  project: Project,
): void {
  const collateral = layout.units.filter((u) => u.isSideBranch);

  for (const unit of collateral) {
    const scoreLeft = scoreSidePlacement(unit, 'left', layout, centers, widths, project);
    const scoreRight = scoreSidePlacement(unit, 'right', layout, centers, widths, project);
    const side: BranchSide = scoreLeft <= scoreRight ? 'left' : 'right';
    chosenSide.set(unit.id, side);
    unit.branchSide = side;

    const corridor = mainCorridorBounds(layout, centers, widths);
    const unitW = widths.get(unit.id) ?? computeUnitWidth(unit, project);
    if (side === 'left') {
      centers.set(unit.id, corridor.min - MAIN_SIDE_GAP - unitW / 2);
    } else {
      centers.set(unit.id, corridor.max + MAIN_SIDE_GAP + unitW / 2);
    }
  }

  resolveCollateralOverlaps(collateral, centers, widths, SIDE_BRANCH_GAP);
}
