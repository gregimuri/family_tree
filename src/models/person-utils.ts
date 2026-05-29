import type { DateValue, Person, Place, Project, ProjectCenter, Union } from '../types';
import { createId } from '../utils/create-id';

export function formatPersonName(person: Person, useNickname = false): string {
  if (useNickname && person.nickname && person.nicknamePriority) {
    return person.nickname;
  }
  const parts = [person.surname, person.givenName, person.patronymic].filter(Boolean);
  const base = parts.join(' ');
  if (useNickname && person.nickname && !person.nicknamePriority) {
    return `${base} («${person.nickname}»)`;
  }
  return base || 'Без имени';
}

export function formatBirthName(person: Person): string | null {
  const parts = [
    person.birthSurname ?? person.surname,
    person.birthGivenName ?? person.givenName,
    person.birthPatronymic ?? person.patronymic,
  ].filter(Boolean);
  const birth = parts.join(' ');
  const current = [person.surname, person.givenName, person.patronymic].filter(Boolean).join(' ');
  return birth && birth !== current ? birth : null;
}

/** Birth-name suffix for a single card line when it differs from the current value. */
export function getCardBirthSuffix(
  current: string | undefined,
  birth: string | undefined,
  showBirth: boolean,
): string | null {
  if (!showBirth) return null;
  const birthValue = birth?.trim();
  if (!birthValue) return null;
  const currentValue = (current ?? '').trim();
  if (birthValue === currentValue) return null;
  return birthValue;
}

function yearFromDate(date?: DateValue): number | undefined {
  return date?.year;
}

export function dateToText(date?: DateValue): string {
  if (!date) return '';
  const suffix = date.julian ? ' ст.' : '';
  if (date.text) return `${date.text}${suffix}`;
  const { day, month, year } = date;
  let base = '';
  if (day && month && year) base = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
  else if (month && year) base = `${String(month).padStart(2, '0')}.${year}`;
  else if (year) base = String(year);
  return base ? `${base}${suffix}` : '';
}

export function formatLifeDates(
  person: Person,
  format: 'full' | 'years' | 'hidden',
): string {
  if (format === 'hidden') return '';
  const birth = dateToText(person.birth?.date);
  const death = dateToText(person.death?.date);
  if (!birth && !death) return '';
  if (format === 'years') {
    const by = yearFromDate(person.birth?.date);
    const dy = yearFromDate(person.death?.date);
    if (by && dy) return `${by}–${dy}`;
    if (by) return `${by}–`;
    if (dy) return `–${dy}`;
    const birth = dateToText(person.birth?.date);
    const death = dateToText(person.death?.date);
    if (birth && death) return `${birth}–${death}`;
    return birth || death;
  }
  if (birth && death) return `${birth} – ${death}`;
  return birth ? `${birth} –` : `– ${death}`;
}

export function calcAge(person: Person, atYear = new Date().getFullYear()): number | null {
  const by = person.birth?.date?.year;
  if (!by) return null;
  const dy = person.death?.date?.year ?? atYear;
  return dy - by;
}

export function diedBefore18(person: Person): boolean {
  const age = calcAge(person);
  return age !== null && age < 18 && !!person.death?.date;
}

export function getPersonLocation(person: Person): Place | undefined {
  switch (person.cardLocationSource) {
    case 'birth':
      return person.birth?.place;
    case 'death':
      return person.death?.place;
    case 'burial':
      return person.burial;
    case 'current':
      return person.currentResidence ?? person.mainResidence;
    case 'longestResidence':
      return person.longestResidence ?? person.mainResidence;
    default:
      return person.mainResidence;
  }
}

export function getParents(project: Project, person: Person): Person[] {
  const seen = new Set<string>();
  const parents: Person[] = [];
  for (const unionId of person.parentUnionIds) {
    const u = project.unions[unionId];
    if (!u) continue;
    for (const pid of u.partnerIds) {
      if (seen.has(pid)) continue;
      const p = project.persons[pid];
      if (p) {
        seen.add(pid);
        parents.push(p);
      }
    }
  }
  return parents.sort((a, b) => {
    if (a.gender === 'male' && b.gender !== 'male') return -1;
    if (b.gender === 'male' && a.gender !== 'male') return 1;
    return 0;
  });
}

export function getUnions(project: Project, person: Person): Union[] {
  return person.unionIds.map((id) => project.unions[id]).filter(Boolean);
}

export function getChildren(project: Project, union: Union): Person[] {
  return union.childIds.map((id) => project.persons[id]).filter(Boolean);
}

export type LinkKind = 'parent' | 'partner' | 'child';

/** Все потомки персоны (для запрета циклических связей). */
export function getDescendantIds(project: Project, personId: string): Set<string> {
  const seen = new Set<string>();
  const queue = [personId];

  while (queue.length) {
    const id = queue.shift()!;
    const person = project.persons[id];
    if (!person) continue;

    for (const unionId of person.unionIds) {
      const union = project.unions[unionId];
      if (!union) continue;
      for (const childId of union.childIds) {
        if (seen.has(childId)) continue;
        seen.add(childId);
        queue.push(childId);
      }
    }
  }

  return seen;
}

/** Кого нельзя выбирать при привязке (уже связан, сам, циклы). */
export function getExcludedIdsForLink(project: Project, personId: string, kind: LinkKind): string[] {
  const excluded = new Set<string>([personId]);
  const person = project.persons[personId];
  if (!person) return [...excluded];

  if (kind === 'parent') {
    getParents(project, person).forEach((p) => excluded.add(p.id));
    getDescendantIds(project, personId).forEach((id) => excluded.add(id));
    return [...excluded];
  }

  if (kind === 'partner') {
    for (const union of getUnions(project, person)) {
      union.partnerIds.forEach((id) => excluded.add(id));
      getChildren(project, union).forEach((c) => excluded.add(c.id));
    }
    getParents(project, person).forEach((p) => excluded.add(p.id));
    getDescendantIds(project, personId).forEach((id) => excluded.add(id));
    return [...excluded];
  }

  for (const union of getUnions(project, person)) {
    getChildren(project, union).forEach((c) => excluded.add(c.id));
  }
  getParents(project, person).forEach((p) => excluded.add(p.id));
  return [...excluded];
}

export function sortChildrenByAge(children: Person[]): Person[] {
  return [...children].sort((a, b) => {
    const ay = a.birth?.date?.year ?? 9999;
    const by = b.birth?.date?.year ?? 9999;
    return ay - by;
  });
}

export function touchProjectMeta(project: Project): Project {
  return {
    ...project,
    meta: { ...project.meta, modifiedAt: new Date().toISOString() },
  };
}

function shouldRemoveUnion(partnerIds: string[], childIds: string[]): boolean {
  if (partnerIds.length === 0 && childIds.length === 0) return true;
  return partnerIds.length <= 1 && childIds.length === 0;
}

function cleanupRemovedUnions(
  project: Project,
  unions: Record<string, Union>,
  removedUnionIds: Set<string>,
): Project {
  if (removedUnionIds.size === 0) return { ...project, unions };

  const persons = { ...project.persons };
  for (const [id, p] of Object.entries(persons)) {
    const unionIds = p.unionIds.filter((uid) => !removedUnionIds.has(uid));
    const parentUnionIds = p.parentUnionIds.filter((uid) => !removedUnionIds.has(uid));
    if (unionIds.length !== p.unionIds.length || parentUnionIds.length !== p.parentUnionIds.length) {
      persons[id] = { ...p, unionIds, parentUnionIds };
    }
  }

  return { ...project, persons, unions };
}

function compactRedundantParentUnions(
  project: Project,
  childId: string,
  primaryUnionId: string,
): Project {
  const primary = project.unions[primaryUnionId];
  const child = project.persons[childId];
  if (!primary || primary.partnerIds.length < 2 || !child) return project;

  const unions = { ...project.unions };
  const removed = new Set<string>();

  for (const uid of child.parentUnionIds) {
    if (uid === primaryUnionId) continue;
    const u = unions[uid];
    if (!u || !u.childIds.includes(childId)) continue;
    if (!u.partnerIds.every((pid) => primary.partnerIds.includes(pid))) continue;

    const newChildIds = u.childIds.filter((id) => id !== childId);
    if (shouldRemoveUnion(u.partnerIds, newChildIds)) {
      delete unions[uid];
      removed.add(uid);
    } else {
      unions[uid] = { ...u, childIds: newChildIds };
    }
  }

  if (removed.size === 0) return project;

  const persons = { ...project.persons };
  const parentUnionIds = child.parentUnionIds.filter((id) => !removed.has(id));
  if (!parentUnionIds.includes(primaryUnionId)) parentUnionIds.push(primaryUnionId);
  persons[childId] = { ...child, parentUnionIds };

  return cleanupRemovedUnions({ ...project, persons, unions }, unions, removed);
}

function sanitizeChildParentUnionIds(
  persons: Record<string, Person>,
  unions: Record<string, Union>,
  childId: string,
): void {
  const child = persons[childId];
  if (!child) return;
  const parentUnionIds = child.parentUnionIds.filter((uid) => {
    const u = unions[uid];
    return u && u.childIds.includes(childId);
  });
  if (parentUnionIds.length !== child.parentUnionIds.length) {
    persons[childId] = { ...child, parentUnionIds };
  }
}

/** When both spouses are already parents, store the child in their marriage union. */
function mergeMarriedParentsForChild(project: Project, childId: string): Project {
  const child = project.persons[childId];
  if (!child) return project;

  const parents = getParents(project, child);
  const parentIds = new Set(parents.map((p) => p.id));
  if (parentIds.size < 2) return project;

  for (const parent of parents) {
    for (const marriageId of parent.unionIds) {
      const marriage = project.unions[marriageId];
      if (!marriage || marriage.partnerIds.length < 2) continue;
      if (!marriage.partnerIds.every((id) => parentIds.has(id))) continue;

      const unions = { ...project.unions };
      const persons = { ...project.persons };
      const marriageUnion = {
        ...marriage,
        childIds: marriage.childIds.includes(childId)
          ? marriage.childIds
          : [...marriage.childIds, childId],
      };
      unions[marriageId] = marriageUnion;

      const removed = new Set<string>();
      for (const uid of child.parentUnionIds) {
        if (uid === marriageId) continue;
        const u = unions[uid];
        if (!u || !u.childIds.includes(childId)) continue;
        if (!u.partnerIds.every((id) => marriageUnion.partnerIds.includes(id))) continue;

        const newChildIds = u.childIds.filter((id) => id !== childId);
        if (shouldRemoveUnion(u.partnerIds, newChildIds)) {
          delete unions[uid];
          removed.add(uid);
        } else {
          unions[uid] = { ...u, childIds: newChildIds };
        }
      }

      const parentUnionIds = child.parentUnionIds.filter((id) => !removed.has(id));
      if (!parentUnionIds.includes(marriageId)) parentUnionIds.push(marriageId);
      persons[childId] = { ...child, parentUnionIds };

      for (const pid of marriageUnion.partnerIds) {
        const partner = persons[pid] ?? project.persons[pid];
        if (partner && !partner.unionIds.includes(marriageId)) {
          persons[pid] = { ...partner, unionIds: [...partner.unionIds, marriageId] };
        }
      }

      return touchProjectMeta(
        cleanupRemovedUnions({ ...project, persons, unions }, unions, removed),
      );
    }
  }

  return project;
}

function pickFallbackCenter(project: Project): ProjectCenter {
  const firstUnion = Object.values(project.unions)[0];
  if (firstUnion) return { type: 'family', id: firstUnion.id };
  const firstPerson = Object.values(project.persons)[0];
  if (firstPerson) return { type: 'person', id: firstPerson.id };
  return project.center;
}

export function removePersonFromProject(project: Project, personId: string): Project {
  if (!project.persons[personId]) return project;

  const person = project.persons[personId];
  const affectedUnionIds = new Set([...person.unionIds, ...person.parentUnionIds]);
  const removedUnionIds = new Set<string>();

  const persons = { ...project.persons };
  delete persons[personId];

  const unions = { ...project.unions };
  for (const unionId of affectedUnionIds) {
    const union = unions[unionId];
    if (!union) continue;

    const partnerIds = union.partnerIds.filter((id) => id !== personId);
    const childIds = union.childIds.filter((id) => id !== personId);

    if (shouldRemoveUnion(partnerIds, childIds)) {
      delete unions[unionId];
      removedUnionIds.add(unionId);
      continue;
    }

    unions[unionId] = { ...union, partnerIds, childIds };
  }

  for (const [id, p] of Object.entries(persons)) {
    let unionIds = p.unionIds.filter((uid) => !removedUnionIds.has(uid));
    const parentUnionIds = p.parentUnionIds.filter((uid) => !removedUnionIds.has(uid));

    for (const unionId of p.unionIds) {
      if (removedUnionIds.has(unionId)) continue;
      const union = unions[unionId];
      if (!union) continue;
      if (!union.partnerIds.includes(id)) {
        unionIds = unionIds.filter((uid) => uid !== unionId);
      }
    }

    if (unionIds.length !== p.unionIds.length || parentUnionIds.length !== p.parentUnionIds.length) {
      persons[id] = { ...p, unionIds, parentUnionIds };
    }
  }

  const media = { ...project.media };
  for (const [id, item] of Object.entries(media)) {
    const personIds = item.personIds.filter((pid) => pid !== personId);
    if (personIds.length !== item.personIds.length) {
      media[id] = { ...item, personIds };
    }
  }

  const manualLayout = project.manualLayout ? { ...project.manualLayout } : undefined;
  if (manualLayout) delete manualLayout[personId];

  let center = project.center;
  if (center.type === 'person' && center.id === personId) {
    center = pickFallbackCenter({ ...project, persons, unions });
  } else if (center.type === 'family' && removedUnionIds.has(center.id)) {
    center = pickFallbackCenter({ ...project, persons, unions });
  }

  return {
    ...project,
    persons,
    unions,
    media,
    manualLayout,
    center,
  };
}

function resolveParentChildUnion(
  project: Project,
  unions: Record<string, Union>,
  childId: string,
  parentId: string,
  options: { unionId?: string; preferMarriageUnion?: boolean },
): string | undefined {
  const { unionId, preferMarriageUnion } = options;
  if (unionId && unions[unionId]) return unionId;

  const child = project.persons[childId];
  const parent = project.persons[parentId];
  if (!child || !parent) return undefined;

  const existingWithParent = child.parentUnionIds.find((id) => {
    const u = unions[id];
    return u?.partnerIds.includes(parentId);
  });
  if (existingWithParent) return existingWithParent;

  const existingOnParent = parent.unionIds.find((id) => {
    const u = unions[id];
    return u?.partnerIds.includes(parentId) && u.childIds.includes(childId);
  });
  if (existingOnParent) return existingOnParent;

  if (preferMarriageUnion) {
    const marriageUnion = parent.unionIds.find((id) => {
      const u = unions[id];
      return u && u.partnerIds.length >= 2 && u.partnerIds.includes(parentId);
    });
    if (marriageUnion) return marriageUnion;
  }

  const singleParentUnion = parent.unionIds.find((id) => {
    const u = unions[id];
    return u && u.partnerIds.length === 1 && u.partnerIds[0] === parentId;
  });
  if (singleParentUnion) return singleParentUnion;

  return undefined;
}

function applyParentChildLink(
  project: Project,
  childId: string,
  parentId: string,
  options: { unionId?: string; preferMarriageUnion?: boolean },
): Project {
  if (childId === parentId) return project;
  const child = project.persons[childId];
  const parent = project.persons[parentId];
  if (!child || !parent) return project;

  const unions = { ...project.unions };
  const persons = { ...project.persons };
  sanitizeChildParentUnionIds(persons, unions, childId);

  let uid = resolveParentChildUnion(project, unions, childId, parentId, options);
  if (!uid) {
    uid = createId();
    unions[uid] = { id: uid, partnerIds: [parentId], childIds: [childId] };
  } else {
    const union = unions[uid] ?? { id: uid, partnerIds: [parentId], childIds: [] };
    unions[uid] = {
      ...union,
      partnerIds: union.partnerIds.includes(parentId) ? union.partnerIds : [...union.partnerIds, parentId],
      childIds: union.childIds.includes(childId) ? union.childIds : [...union.childIds, childId],
    };
  }

  const childPerson = persons[childId] ?? child;
  if (!childPerson.parentUnionIds.includes(uid)) {
    persons[childId] = { ...childPerson, parentUnionIds: [...childPerson.parentUnionIds, uid] };
  }
  sanitizeChildParentUnionIds(persons, unions, childId);

  const linkedUnion = unions[uid]!;
  for (const partnerId of linkedUnion.partnerIds) {
    const partner = persons[partnerId] ?? project.persons[partnerId];
    if (!partner) continue;
    if (!partner.unionIds.includes(uid)) {
      persons[partnerId] = { ...partner, unionIds: [...partner.unionIds, uid] };
    }
  }

  let next = touchProjectMeta({ ...project, persons, unions });
  if (linkedUnion.partnerIds.length >= 2) {
    next = compactRedundantParentUnions(next, childId, uid);
  }
  return next;
}

export function linkParent(project: Project, childId: string, parentId: string, unionId?: string): Project {
  let next = applyParentChildLink(project, childId, parentId, { unionId, preferMarriageUnion: false });
  next = mergeMarriedParentsForChild(next, childId);
  return next;
}

export function linkChild(project: Project, parentId: string, childId: string, unionId?: string): Project {
  return applyParentChildLink(project, childId, parentId, { unionId, preferMarriageUnion: false });
}

export function unlinkParent(project: Project, childId: string, parentId: string): Project {
  const child = project.persons[childId];
  if (!child) return project;

  let result = project;

  for (const unionId of [...child.parentUnionIds]) {
    const union = result.unions[unionId];
    if (!union?.partnerIds.includes(parentId) || !union.childIds.includes(childId)) continue;

    const otherPartners = union.partnerIds.filter((id) => id !== parentId);
    const newChildIds = union.childIds.filter((id) => id !== childId);
    const unions = { ...result.unions };

    if (shouldRemoveUnion(union.partnerIds, newChildIds)) {
      delete unions[unionId];
      result = cleanupRemovedUnions({ ...result, unions }, unions, new Set([unionId]));
    } else {
      unions[unionId] = { ...union, childIds: newChildIds };
      result = { ...result, unions };
    }

    const persons = { ...result.persons };
    const currentChild = persons[childId];
    if (currentChild) {
      persons[childId] = {
        ...currentChild,
        parentUnionIds: currentChild.parentUnionIds.filter((uid) => {
          const u = unions[uid] ?? result.unions[uid];
          return u?.childIds.includes(childId);
        }),
      };
      result = { ...result, persons };
    }

    for (const otherId of otherPartners) {
      if (!result.persons[otherId]) continue;
      result = applyParentChildLink(result, childId, otherId, { preferMarriageUnion: false });
    }
  }

  return touchProjectMeta(result);
}

export function linkPartner(project: Project, personAId: string, personBId: string): Project {
  if (personAId === personBId) return project;
  const a = project.persons[personAId];
  const b = project.persons[personBId];
  if (!a || !b) return project;

  const shared = a.unionIds.find((uid) => b.unionIds.includes(uid) && project.unions[uid]);
  if (shared) return project;

  const unions = { ...project.unions };
  const persons = { ...project.persons };
  const uid = createId();
  unions[uid] = { id: uid, partnerIds: [personAId, personBId], childIds: [] };
  persons[personAId] = { ...a, unionIds: [...a.unionIds, uid] };
  persons[personBId] = { ...b, unionIds: [...b.unionIds, uid] };

  return touchProjectMeta({ ...project, persons, unions });
}

export function unlinkPartner(project: Project, personAId: string, personBId: string): Project {
  const a = project.persons[personAId];
  const b = project.persons[personBId];
  if (!a || !b) return project;

  const unions = { ...project.unions };
  const persons = { ...project.persons };
  const removedUnionIds = new Set<string>();

  for (const unionId of a.unionIds) {
    if (!b.unionIds.includes(unionId)) continue;
    const union = unions[unionId];
    if (!union) continue;

    const partnerIds = union.partnerIds.filter((id) => id !== personAId && id !== personBId);
    const childIds = union.childIds;

    if (shouldRemoveUnion(partnerIds, childIds)) {
      delete unions[unionId];
      removedUnionIds.add(unionId);
    } else {
      unions[unionId] = { ...union, partnerIds };
    }
  }

  for (const [id, p] of Object.entries(persons)) {
    const unionIds = p.unionIds.filter((uid) => !removedUnionIds.has(uid));
    const parentUnionIds = p.parentUnionIds.filter((uid) => !removedUnionIds.has(uid));
    if (unionIds.length !== p.unionIds.length || parentUnionIds.length !== p.parentUnionIds.length) {
      persons[id] = { ...p, unionIds, parentUnionIds };
    }
  }

  return touchProjectMeta({ ...project, persons, unions });
}

export function unlinkChild(project: Project, unionId: string, childId: string): Project {
  const union = project.unions[unionId];
  const child = project.persons[childId];
  if (!union || !child) return project;

  const unions = { ...project.unions };
  const persons = { ...project.persons };
  const childIds = union.childIds.filter((id) => id !== childId);

  if (shouldRemoveUnion(union.partnerIds, childIds)) {
    delete unions[unionId];
    for (const [id, p] of Object.entries(persons)) {
      persons[id] = {
        ...p,
        unionIds: p.unionIds.filter((uid) => uid !== unionId),
        parentUnionIds: p.parentUnionIds.filter((uid) => uid !== unionId),
      };
    }
  } else {
    unions[unionId] = { ...union, childIds };
    persons[childId] = {
      ...child,
      parentUnionIds: child.parentUnionIds.filter((id) => id !== unionId),
    };
  }

  return touchProjectMeta({ ...project, persons, unions });
}

export function getAllChildren(project: Project, person: Person): Person[] {
  const seen = new Set<string>();
  const children: Person[] = [];
  for (const unionId of person.unionIds) {
    const u = project.unions[unionId];
    if (!u) continue;
    for (const cid of u.childIds) {
      if (seen.has(cid)) continue;
      const c = project.persons[cid];
      if (c) {
        seen.add(cid);
        children.push(c);
      }
    }
  }
  return sortChildrenByAge(children);
}

export function formatMarriageDates(union: Union): string {
  const start = dateToText(union.marriageStart);
  const end = dateToText(union.marriageEnd);
  if (!start && !end) return '';
  return `${start || '—'} – ${end || 'н.в.'}`;
}
