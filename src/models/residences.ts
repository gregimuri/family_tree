import type { DateValue, LocationDisplaySource, Person, Place, ResidenceEntry } from '../types';
import { createId } from '../utils/create-id';
import { dateToText } from './person-utils';

const RESIDENCE_PREFIX = 'residence:';

export function residenceCardSource(id: string): LocationDisplaySource {
  return `${RESIDENCE_PREFIX}${id}`;
}

export function residenceSourceId(source: LocationDisplaySource): string | null {
  if (!source.startsWith(RESIDENCE_PREFIX)) return null;
  return source.slice(RESIDENCE_PREFIX.length) || null;
}

export function isResidenceSource(source: LocationDisplaySource): boolean {
  return source.startsWith(RESIDENCE_PREFIX);
}

export function placeHasContent(p?: Place): boolean {
  return !!(p?.name?.trim() || p?.details?.trim());
}

export function getPersonResidences(person: Person): ResidenceEntry[] {
  return person.residences ?? [];
}

export function getResidenceById(person: Person, id: string): ResidenceEntry | undefined {
  return getPersonResidences(person).find((entry) => entry.id === id);
}

export function formatResidencePeriod(fromDate?: DateValue, toDate?: DateValue): string | null {
  const from = fromDate ? dateToText(fromDate) : '';
  const to = toDate ? dateToText(toDate) : '';
  if (from && to) return `${from} — ${to}`;
  if (from) return `с ${from}`;
  if (to) return `до ${to}`;
  return null;
}

export function formatResidenceLabel(entry: ResidenceEntry): string {
  const name = entry.place.name?.trim() || entry.place.details?.trim() || 'Адрес';
  const from = entry.fromDate ? dateToText(entry.fromDate) : '';
  const to = entry.toDate ? dateToText(entry.toDate) : '';
  if (from && to) return `${name} (${from} — ${to})`;
  if (from && !to) return `${name} (${from} — н.в.)`;
  if (to) return `${name} (до ${to})`;
  return name;
}

export function formatResidenceCardText(entry: ResidenceEntry): string {
  const name = entry.place.name?.trim();
  if (name) return name;
  return entry.place.details?.trim() ?? '';
}

function legacyEntry(place?: Place, fromDate?: DateValue, toDate?: DateValue): ResidenceEntry | null {
  if (!placeHasContent(place)) return null;
  return {
    id: createId(),
    place: { name: place!.name ?? '', details: place!.details },
    fromDate,
    toDate,
  };
}

function pickCardSourceAfterMigration(
  source: LocationDisplaySource | string,
  entries: ResidenceEntry[],
): LocationDisplaySource {
  if (entries.length === 0) {
    if (source === 'birth' || source === 'death' || source === 'burial') return source;
    return 'birth';
  }

  if (source === 'current') {
    const open = [...entries].reverse().find((e) => !e.toDate);
    return residenceCardSource((open ?? entries[entries.length - 1]).id);
  }
  if (source === 'longestResidence') {
    return residenceCardSource(entries[entries.length - 1].id);
  }
  if (isResidenceSource(source as LocationDisplaySource)) {
    const id = residenceSourceId(source as LocationDisplaySource);
    if (id && entries.some((e) => e.id === id)) return source as LocationDisplaySource;
  }
  if (source === 'birth' || source === 'death' || source === 'burial') return source;
  return 'birth';
}

/** Migrate legacy residence fields to dated address list. */
export function migratePersonResidences(person: Person): Person {
  if (person.residences?.length) {
    let cardLocationSource = person.cardLocationSource;
    const legacySource = person.cardLocationSource as string;
    if (legacySource === 'current' || legacySource === 'longestResidence') {
      cardLocationSource = pickCardSourceAfterMigration(legacySource, person.residences);
    } else if (isResidenceSource(cardLocationSource)) {
      cardLocationSource = pickCardSourceAfterMigration(cardLocationSource, person.residences);
    }
    const next = { ...person, cardLocationSource };
    delete next.mainResidence;
    delete next.currentResidence;
    delete next.longestResidence;
    return next;
  }

  const entries: ResidenceEntry[] = [];
  const seen = new Set<string>();
  const push = (entry: ResidenceEntry | null) => {
    if (!entry) return;
    const key = `${entry.place.name}|${entry.place.details}|${dateToText(entry.fromDate)}|${dateToText(entry.toDate)}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  push(legacyEntry(person.mainResidence));
  push(legacyEntry(person.currentResidence));
  push(legacyEntry(person.longestResidence));

  const cardLocationSource = pickCardSourceAfterMigration(
    person.cardLocationSource as string,
    entries,
  );
  const next: Person = {
    ...person,
    residences: entries.length > 0 ? entries : undefined,
    cardLocationSource,
  };
  delete next.mainResidence;
  delete next.currentResidence;
  delete next.longestResidence;
  return next;
}

export function migrateProjectResidences(project: { persons: Record<string, Person> }): {
  persons: Record<string, Person>;
} {
  const persons: Record<string, Person> = {};
  for (const [id, person] of Object.entries(project.persons)) {
    persons[id] = migratePersonResidences(person);
  }
  return { persons };
}
