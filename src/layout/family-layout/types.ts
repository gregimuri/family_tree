import type { BranchSide } from '../graph-builder';

export type FamilyUnitKind = 'couple' | 'siblings' | 'single';

/** Семейный блок для раскладки: пара, группа siblings или одиночная персона. */
export interface FamilyUnit {
  id: string;
  kind: FamilyUnitKind;
  layer: number;
  /** Персоны в блоке (партнёры, siblings или один человек). */
  personIds: string[];
  /** Graph node ids для personIds. */
  graphNodeIds: string[];
  /** Прямые дети union (person ids, layer = unit.layer + 1). */
  childIds: string[];
  /** Id родительского union-блока (если известен). */
  parentUnitId?: string;
  /** Дочерние unit ids (для дерева размещения). */
  childUnitIds: string[];
  branchSide: BranchSide;
  isSideBranch: boolean;
  birthOrder: number;
  /** union id для couple/siblings; undefined для single без union. */
  unionId?: string;
  parentUnionId?: string;
}

export interface FamilyLayoutGraph {
  units: FamilyUnit[];
  unitById: Map<string, FamilyUnit>;
  /** personId → primary unit id на его layer. */
  personToUnit: Map<string, string>;
  layers: Map<number, FamilyUnit[]>;
  sortedLayers: number[];
}

export interface UnitPlacement {
  unitId: string;
  centerX: number;
  width: number;
}

export interface FamilyLayoutState {
  graph: FamilyLayoutGraph;
  unitCenters: Map<string, number>;
  unitWidths: Map<string, number>;
  /** Выбранный порядок personIds внутри каждого unit. */
  personOrder: Map<string, string[]>;
  /** Мягко выбранная сторона для collateral unit. */
  chosenSide: Map<string, BranchSide>;
}

export const SIBLING_GAP = 24;
export const GROUP_GAP = 64;
export const SIDE_BRANCH_GAP = 96;
export const MAIN_SIDE_GAP = 88;

export const MAX_ORDER_ITERATIONS = 48;
export const CROSSING_SWAP_ROUNDS = 6;
export const CONVERGENCE_EPS = 0.4;
