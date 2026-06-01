import { describe, it, expect } from 'vitest';
import type { Person } from '../types';
import {
  formatResidenceLabel,
  migratePersonResidences,
  residenceCardSource,
} from '../models/residences';

function basePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    gender: 'male',
    surname: 'Иванов',
    givenName: 'Иван',
    patronymic: '',
    nicknamePriority: false,
    biography: '',
    cardLocationSource: 'birth',
    parentUnionIds: [],
    unionIds: [],
    mediaIds: [],
    ...overrides,
  };
}

describe('migratePersonResidences', () => {
  it('merges legacy residence fields into dated address list', () => {
    const person = basePerson({
      mainResidence: { name: 'Москва' },
      currentResidence: { name: 'Санкт-Петербург' },
      cardLocationSource: 'current' as unknown as Person['cardLocationSource'],
    });

    const migrated = migratePersonResidences(person);

    expect(migrated.mainResidence).toBeUndefined();
    expect(migrated.currentResidence).toBeUndefined();
    expect(migrated.longestResidence).toBeUndefined();
    expect(migrated.residences).toHaveLength(2);
    expect(migrated.residences?.[0].place.name).toBe('Москва');
    expect(migrated.residences?.[1].place.name).toBe('Санкт-Петербург');
    expect(migrated.cardLocationSource).toBe(residenceCardSource(migrated.residences![1].id));
  });

  it('maps longestResidence card source to last address', () => {
    const person = basePerson({
      longestResidence: { name: 'Казань' },
      mainResidence: { name: 'Москва' },
      cardLocationSource: 'longestResidence' as unknown as Person['cardLocationSource'],
    });

    const migrated = migratePersonResidences(person);
    const last = migrated.residences!.at(-1)!;

    expect(last.place.name).toBe('Казань');
    expect(migrated.cardLocationSource).toBe(residenceCardSource(last.id));
  });
});

describe('formatResidenceLabel', () => {
  it('shows open-ended residence as current', () => {
    const label = formatResidenceLabel({
      id: 'r1',
      place: { name: 'Москва' },
      fromDate: { year: 1990 },
    });
    expect(label).toBe('Москва (1990 — н.в.)');
  });
});
