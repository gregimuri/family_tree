import type { Project } from '../../types';

/** Первичный потомок при спуске: первый ребёнок union (старший в списке). */
export function pickPrimaryChildId(unionId: string, project: Project): string | undefined {
  const union = project.unions[unionId];
  if (!union || union.childIds.length === 0) return undefined;
  return union.childIds[0];
}

export function pickSecondaryChildIds(
  unionId: string,
  project: Project,
  primaryId: string,
): string[] {
  const union = project.unions[unionId];
  if (!union) return [];
  return union.childIds.filter((id) => id !== primaryId);
}
