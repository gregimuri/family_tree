import type { DateValue, Person, Place, Project, ProjectCenter, Union } from '../types';

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

export function dateToText(date?: DateValue): string {
  if (!date) return '';
  if (date.text) return date.text;
  const { day, month, year } = date;
  if (day && month && year) return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
  if (month && year) return `${String(month).padStart(2, '0')}.${year}`;
  if (year) return String(year);
  return '';
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
    const by = person.birth?.date?.year;
    const dy = person.death?.date?.year;
    if (by && dy) return `${by}–${dy}`;
    if (by) return `${by}–`;
    if (dy) return `–${dy}`;
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
  const parents: Person[] = [];
  for (const unionId of person.parentUnionIds) {
    const u = project.unions[unionId];
    if (!u) continue;
    for (const pid of u.partnerIds) {
      const p = project.persons[pid];
      if (p) parents.push(p);
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
    let parentUnionIds = p.parentUnionIds.filter((uid) => !removedUnionIds.has(uid));

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
