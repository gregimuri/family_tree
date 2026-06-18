import type { CardFieldSettings, Person, Project, ViewSettings } from '../types';
import { createId } from '../utils/create-id';

export const PROJECT_VERSION = 1;

export const defaultCardFields = (): CardFieldSettings => ({
  showBirthName: true,
  showNickname: true,
  nicknamePriority: false,
  dateFormat: 'full',
  showAge: false,
  showLocation: true,
  showPhoto: true,
  showReligion: false,
  marriageDateFormat: 'full',
});

/** Migrates legacy showMarriageYears and fills missing card field keys. */
export function normalizeCardFields(raw: Partial<CardFieldSettings> & { showMarriageYears?: boolean }): CardFieldSettings {
  const base = defaultCardFields();
  const merged: CardFieldSettings = { ...base, ...raw };

  if (raw.marriageDateFormat === undefined && raw.showMarriageYears !== undefined) {
    merged.marriageDateFormat = raw.showMarriageYears ? 'years' : 'hidden';
  }

  if (!merged.marriageDateFormat) {
    merged.marriageDateFormat = 'hidden';
  }

  delete merged.showMarriageYears;
  return merged;
}

export const defaultViewSettings = (): ViewSettings => ({
  generationsUp: 3,
  generationsDown: 3,
  sideBranchesAt: 2,
  sideBranchDepth: 1,
  cardSizeMode: 'uniform',
  showAllPersons: false,
  showDiedBefore18: true,
  theme: 'clean',
  cardFields: defaultCardFields(),
  allowExternalMedia: false,
  smartLayoutEnabled: true,
});

export const createEmptyPerson = (partial?: Partial<Person>): Person => ({
  id: partial?.id ?? createId(),
  gender: partial?.gender ?? 'unknown',
  surname: partial?.surname ?? '',
  givenName: partial?.givenName ?? '',
  patronymic: partial?.patronymic ?? '',
  nicknamePriority: partial?.nicknamePriority ?? false,
  biography: partial?.biography ?? '',
  parentUnionIds: partial?.parentUnionIds ?? [],
  unionIds: partial?.unionIds ?? [],
  mediaIds: partial?.mediaIds ?? [],
  cardLocationSource: partial?.cardLocationSource ?? 'birth',
  ...partial,
  religion: partial?.religion ?? 'none',
});

export const createEmptyProject = (name = 'Новый проект'): Project => {
  const now = new Date().toISOString();
  const root = createEmptyPerson({
    surname: 'Иванов',
    givenName: 'Иван',
    patronymic: 'Иванович',
    gender: 'male',
    birth: { date: { year: 1980 }, place: { name: 'Москва' } },
  });
  const spouse = createEmptyPerson({
    surname: 'Иванова',
    givenName: 'Мария',
    patronymic: 'Петровна',
    gender: 'female',
    birth: { date: { year: 1982 }, place: { name: 'Санкт-Петербург' } },
  });
  const unionId = createId();
  const union = {
    id: unionId,
    partnerIds: [root.id, spouse.id],
    childIds: [] as string[],
    marriageStart: { year: 2005 },
  };
  root.unionIds = [unionId];
  spouse.unionIds = [unionId];

  return {
    version: PROJECT_VERSION,
    meta: { name, createdAt: now, modifiedAt: now },
    persons: { [root.id]: root, [spouse.id]: spouse },
    unions: { [unionId]: union },
    media: {},
    viewSettings: defaultViewSettings(),
    center: { type: 'family', id: unionId },
  };
};
