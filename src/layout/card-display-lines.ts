import { getCardBirthSuffix } from '../models/person-utils';

export type CardNameLineKind =
  | 'surname'
  | 'birthSurname'
  | 'given'
  | 'birthGiven'
  | 'patronymic'
  | 'birthPatronymic'
  | 'nickname';

export type CardNameLineEmphasis = 'surname' | 'name' | 'birth' | 'nickname';

export interface CardNameLine {
  kind: CardNameLineKind;
  text: string;
  base: number;
  emphasis: CardNameLineEmphasis;
}

function trim(value: string | undefined): string {
  return value?.trim() ?? '';
}

/** Visible name lines on a person card (each field on its own row). */
export function buildCardNameLines(
  fields: {
    surname?: string;
    birthSurname?: string;
    givenName?: string;
    birthGivenName?: string;
    patronymic?: string;
    birthPatronymic?: string;
    nickname?: string;
  },
  options: {
    showBirth: boolean;
    showNickname: boolean;
    nicknameAsPrimary: boolean;
  },
): CardNameLine[] {
  const { showBirth, showNickname, nicknameAsPrimary } = options;

  if (nicknameAsPrimary && fields.nickname?.trim()) {
    return [{ kind: 'nickname', text: fields.nickname.trim(), base: 11, emphasis: 'surname' }];
  }

  const lines: CardNameLine[] = [];
  const surnameMain = trim(fields.surname);
  const surnameBirth = getCardBirthSuffix(fields.surname, fields.birthSurname, showBirth);
  const givenMain = trim(fields.givenName);
  const givenBirth = getCardBirthSuffix(fields.givenName, fields.birthGivenName, showBirth);
  const patronymicMain = trim(fields.patronymic);
  const patronymicBirth = getCardBirthSuffix(fields.patronymic, fields.birthPatronymic, showBirth);

  if (!surnameMain && surnameBirth) {
    lines.push({ kind: 'birthSurname', text: `(${surnameBirth})`, base: 11, emphasis: 'surname' });
  } else {
    if (surnameMain) {
      lines.push({ kind: 'surname', text: surnameMain, base: 11, emphasis: 'surname' });
    }
    if (surnameBirth) {
      lines.push({ kind: 'birthSurname', text: surnameBirth, base: 10, emphasis: 'birth' });
    }
  }

  if (givenMain) {
    lines.push({ kind: 'given', text: givenMain, base: 10, emphasis: 'name' });
  }
  if (givenBirth) {
    lines.push({ kind: 'birthGiven', text: givenBirth, base: 10, emphasis: 'birth' });
  }

  if (patronymicMain) {
    lines.push({ kind: 'patronymic', text: patronymicMain, base: 10, emphasis: 'name' });
  }
  if (patronymicBirth) {
    lines.push({ kind: 'birthPatronymic', text: patronymicBirth, base: 10, emphasis: 'birth' });
  }

  if (showNickname && fields.nickname?.trim() && !nicknameAsPrimary) {
    lines.push({
      kind: 'nickname',
      text: `«${fields.nickname.trim()}»`,
      base: 9,
      emphasis: 'nickname',
    });
  }

  return lines;
}

export function cardNameLineHeight(emphasis: CardNameLineEmphasis): number {
  return emphasis === 'surname' ? 1.2 : 1.18;
}
