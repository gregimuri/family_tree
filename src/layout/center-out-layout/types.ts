import type { BranchSide } from '../graph-builder';

export type UnionPlacementStatus = 'partial' | 'complete';

export interface PlacementState {
  personId: string;
  layer: number;
  /** Центр карточки в клетках сетки (CARD_GRID_CELL). */
  centerXCells: number;
  branchSide: BranchSide;
  isSideBranch: boolean;
  graphNodeId: string;
}

export interface UnionPlacementState {
  unionId: string;
  status: UnionPlacementStatus;
  placedPartnerIds: string[];
  /** Ребёнок(и), над которым центрируется пара (parent union). */
  childPersonIds: string[];
}

export interface SubtreeBox {
  minCenterCells: number;
  maxCenterCells: number;
}

export type GraphPersonNode = {
  id: string;
  kind: 'person';
  personId: string;
  layer: number;
  isSideBranch: boolean;
  branchSide: BranchSide;
  unionId?: string;
  parentUnionId?: string;
  birthOrder?: number;
  branchDepth?: number;
};
