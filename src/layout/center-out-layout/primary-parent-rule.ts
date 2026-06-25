import type { Project } from '../../types';

/** При подъёме: для отца — мать, для матери — отец. */
export function pickPrimaryParentId(
  childId: string,
  parentUnionId: string,
  project: Project,
): string | undefined {
  const union = project.unions[parentUnionId];
  const child = project.persons[childId];
  if (!union || !child || union.partnerIds.length === 0) return undefined;

  const partners = union.partnerIds
    .map((id) => project.persons[id])
    .filter(Boolean);

  if (partners.length === 1) return partners[0]!.id;

  const childGender = child.gender;
  if (childGender === 'male') {
    const mother = partners.find((p) => p!.gender === 'female');
    if (mother) return mother.id;
  }
  if (childGender === 'female') {
    const father = partners.find((p) => p!.gender === 'male');
    if (father) return father.id;
  }

  return union.partnerIds[0];
}

export function pickSecondaryParentId(
  _childId: string,
  parentUnionId: string,
  project: Project,
  primaryId: string,
): string | undefined {
  const union = project.unions[parentUnionId];
  if (!union) return undefined;
  return union.partnerIds.find((id) => id !== primaryId);
}

export function sortPartnersMaleLeft(
  partnerIds: string[],
  project: Project,
): string[] {
  return [...partnerIds].sort((a, b) => {
    const ga = project.persons[a]?.gender;
    const gb = project.persons[b]?.gender;
    if (ga === 'male' && gb !== 'male') return -1;
    if (gb === 'male' && ga !== 'male') return 1;
    return a.localeCompare(b);
  });
}

export function genderRoleInCouple(
  personId: string,
  unionPartnerIds: string[],
  project: Project,
): 'father' | 'mother' | 'unknown' {
  const gender = project.persons[personId]?.gender;
  if (gender === 'male') return 'father';
  if (gender === 'female') return 'mother';
  const sorted = sortPartnersMaleLeft(unionPartnerIds, project);
  const idx = sorted.indexOf(personId);
  if (idx === 0) return 'father';
  if (idx === 1) return 'mother';
  return 'unknown';
}

export function isMaleLine(personId: string, project: Project): boolean {
  const g = project.persons[personId]?.gender;
  return g === 'male';
}
