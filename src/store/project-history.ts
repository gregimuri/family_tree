import type { Project, SelectionTarget } from '../types';

export const MAX_UNDO_STACK = 50;
export const HISTORY_DEBOUNCE_MS = 450;

export interface ProjectSnapshot {
  project: Project;
  mediaBlobs: Map<string, Blob>;
  dossierPersonId: string | null;
  selection: SelectionTarget;
}

export function cloneProject(project: Project): Project {
  return structuredClone(project);
}

export function cloneMediaBlobs(source: Map<string, Blob>): Map<string, Blob> {
  return new Map(source);
}

export function createMediaUrls(mediaBlobs: Map<string, Blob>): Map<string, string> {
  const mediaUrls = new Map<string, string>();
  for (const [filename, blob] of mediaBlobs) {
    mediaUrls.set(filename, URL.createObjectURL(blob));
  }
  return mediaUrls;
}

export function trimUndoStack<T>(stack: T[], max = MAX_UNDO_STACK): T[] {
  if (stack.length <= max) return stack;
  return stack.slice(stack.length - max);
}
