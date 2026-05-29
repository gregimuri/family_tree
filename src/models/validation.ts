import type { ViewSettings } from '../types';

export function validateViewSettings(settings: ViewSettings): ViewSettings {
  let next = { ...settings };
  if (next.sideBranchesAt >= 3 && next.cardSizeMode === 'uniform') {
    next = { ...next, cardSizeMode: 'diminish' };
  }
  if (next.generationsUp < 1) next.generationsUp = 1;
  if (next.generationsDown < 1) next.generationsDown = 1;
  if (next.sideBranchDepth < 0) next.sideBranchDepth = 0;
  return next;
}

export function canUseUniformCards(sideBranchesAt: number): boolean {
  return sideBranchesAt < 3;
}
