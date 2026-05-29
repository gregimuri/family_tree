import type { ViewSettings } from '../types';

export function validateViewSettings(settings: ViewSettings): ViewSettings {
  const next = { ...settings };
  if (next.generationsUp < 0) next.generationsUp = 0;
  if (next.generationsDown < 0) next.generationsDown = 0;
  if (next.sideBranchDepth < 0) next.sideBranchDepth = 0;
  if (next.allowExternalMedia === undefined) next.allowExternalMedia = false;
  return next;
}

export function canUseUniformCards(): boolean {
  return true;
}
