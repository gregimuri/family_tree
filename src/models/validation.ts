import type { ViewSettings } from '../types';
import { normalizeCardFields } from './defaults';

export function validateViewSettings(settings: ViewSettings): ViewSettings {
  const next = { ...settings };
  if (next.generationsUp < 0) next.generationsUp = 0;
  if (next.generationsDown < 0) next.generationsDown = 0;
  if (next.sideBranchDepth < 0) next.sideBranchDepth = 0;
  if (next.showAllPersons === undefined) next.showAllPersons = false;
  if (next.allowExternalMedia === undefined) next.allowExternalMedia = false;
  if (next.smartLayoutEnabled === undefined) next.smartLayoutEnabled = true;
  if (next.layoutEngine === undefined) next.layoutEngine = 'family';
  next.cardFields = normalizeCardFields(next.cardFields);
  return next;
}

export function canUseUniformCards(): boolean {
  return true;
}
