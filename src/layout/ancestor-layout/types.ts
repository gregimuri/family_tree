import type { BranchSide } from '../graph-builder';

export interface PlacementState {
  personId: string;
  layer: number;
  /** Центр карточки в клетках сетки. */
  centerXCells: number;
  branchSide: BranchSide;
  isSideBranch: boolean;
  graphNodeId: string;
}
