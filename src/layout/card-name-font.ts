import { getCardBirthSuffix } from '../models/person-utils';

const NAME_LINE_HEIGHT = 1.25;
const SURNAME_LINE_HEIGHT = 1.2;
const ROW_GAP = 1;
const MIN_FONT_SIZE = 5.5;

/** Подбор размера строки ФИО: короткие имена крупнее, длинные — мельче. */
export function scaleCardLineFontSize(
  text: string,
  baseSize: number,
  innerWidth: number,
  minScale = 0.65,
  maxScale = 1.35,
): number {
  const t = text.trim();
  if (!t) return baseSize;
  const inner = Math.max(innerWidth - 12, 40);
  const charPx = inner / Math.max(t.length, 1);
  const scaled = Math.min(baseSize * maxScale, Math.max(baseSize * minScale, charPx * 0.9));
  return Math.round(scaled * 10) / 10;
}

export function computeCardNameFontSizes(
  lines: { text: string; base: number }[],
  innerWidth: number,
  cardScale = 1,
): number[] {
  const visible = lines.filter((l) => l.text.trim());
  const lineCount = visible.length;
  const heightFactor = lineCount > 4 ? 0.82 : lineCount > 3 ? 0.9 : 1;
  const widthMaxScale = Math.min(1.35, 1.05 + cardScale * 0.25);
  return lines.map(({ text, base }) => {
    if (!text.trim()) return base * cardScale;
    const scaledBase = base * cardScale;
    return Math.round(
      scaleCardLineFontSize(text, scaledBase, innerWidth, 0.65, widthMaxScale) * heightFactor * 10,
    ) / 10;
  });
}

function cardLineText(
  current: string | undefined,
  birth: string | undefined,
  showBirth: boolean,
): string {
  const main = (current ?? '').trim();
  const suffix = getCardBirthSuffix(current, birth, showBirth);
  if (!main && suffix) return `(${suffix})`;
  if (suffix) return `${main} (${suffix})`;
  return main;
}

/** Строки ФИО для расчёта размеров шрифта (фамилия при рождении — отдельная строка). */
export function buildCardNameFontLines(
  fields: {
    surname?: string;
    birthSurname?: string;
    givenName?: string;
    birthGivenName?: string;
    patronymic?: string;
    birthPatronymic?: string;
    nickname?: string;
  },
  showBirth: boolean,
  nicknameAsPrimary: boolean,
): { text: string; base: number }[] {
  if (nicknameAsPrimary) {
    return [{ text: fields.nickname ?? '', base: 11 }];
  }

  const lines: { text: string; base: number }[] = [];
  const surnameMain = (fields.surname ?? '').trim();
  const surnameBirth = getCardBirthSuffix(fields.surname, fields.birthSurname, showBirth);

  if (!surnameMain && surnameBirth) {
    lines.push({ text: `(${surnameBirth})`, base: 11 });
  } else {
    if (surnameMain) lines.push({ text: surnameMain, base: 11 });
    if (surnameBirth) lines.push({ text: `(${surnameBirth})`, base: 10 });
  }

  lines.push(
    {
      text: [cardLineText(fields.givenName, fields.birthGivenName, showBirth),
        cardLineText(fields.patronymic, fields.birthPatronymic, showBirth)]
        .filter((t) => t.trim())
        .join(' '),
      base: 10,
    },
  );

  return lines;
}

export interface CardFooterFlags {
  hasDates: boolean;
  hasAge: boolean;
  hasReligion: boolean;
  hasLocation: boolean;
  hasNickname: boolean;
}

export interface CardTypography {
  surname: number;
  given: number;
  patronymic: number;
  nickname: number;
  meta: number;
  secondary: number;
}

export function cardBodyTextHeight(cardHeight: number, hasPhoto: boolean): number {
  const bodyHeight = hasPhoto ? (cardHeight * 4) / 12 : cardHeight;
  const padding = hasPhoto ? 10 : 12;
  return Math.max(24, bodyHeight - padding);
}

export function estimateCardTextHeight(
  typo: CardTypography,
  fields: {
    surname?: string;
    birthSurname?: string;
    givenName?: string;
    birthGivenName?: string;
    patronymic?: string;
    birthPatronymic?: string;
    nickname?: string;
  },
  showBirth: boolean,
  nicknameAsPrimary: boolean,
  footer: CardFooterFlags,
): number {
  if (nicknameAsPrimary && fields.nickname?.trim()) {
    let h = typo.nickname * NAME_LINE_HEIGHT;
    if (footer.hasNickname) h += typo.nickname * NAME_LINE_HEIGHT + ROW_GAP;
    if (footer.hasDates || footer.hasAge) h += typo.meta * NAME_LINE_HEIGHT + 2;
    if (footer.hasReligion) h += typo.secondary * NAME_LINE_HEIGHT + ROW_GAP;
    if (footer.hasLocation) h += typo.secondary * NAME_LINE_HEIGHT + ROW_GAP;
    return h;
  }

  let h = 0;
  const surnameMain = (fields.surname ?? '').trim();
  const surnameBirth = getCardBirthSuffix(fields.surname, fields.birthSurname, showBirth);
  const given = cardLineText(fields.givenName, fields.birthGivenName, showBirth);
  const patronymic = cardLineText(fields.patronymic, fields.birthPatronymic, showBirth);

  if (surnameMain) h += typo.surname * SURNAME_LINE_HEIGHT;
  else if (surnameBirth) h += typo.surname * SURNAME_LINE_HEIGHT;

  if (surnameBirth && surnameMain) {
    h += ROW_GAP + typo.surname * 0.9 * SURNAME_LINE_HEIGHT;
  }

  if (given || patronymic) {
    h += ROW_GAP + Math.max(
      given ? typo.given * NAME_LINE_HEIGHT : 0,
      patronymic ? typo.patronymic * NAME_LINE_HEIGHT : 0,
    );
  }
  if (footer.hasNickname) h += ROW_GAP + typo.nickname * NAME_LINE_HEIGHT;

  if (footer.hasDates || footer.hasAge || footer.hasReligion || footer.hasLocation) {
    h += 4;
  }
  if (footer.hasDates || footer.hasAge) h += typo.meta * NAME_LINE_HEIGHT;
  if (footer.hasReligion) h += ROW_GAP + typo.secondary * NAME_LINE_HEIGHT;
  if (footer.hasLocation) h += ROW_GAP + typo.secondary * NAME_LINE_HEIGHT;

  return h;
}

function scaleTypography(typo: CardTypography, factor: number): CardTypography {
  const scale = (value: number) => Math.max(MIN_FONT_SIZE, Math.round(value * factor * 10) / 10);
  return {
    surname: scale(typo.surname),
    given: scale(typo.given),
    patronymic: scale(typo.patronymic),
    nickname: scale(typo.nickname),
    meta: scale(typo.meta),
    secondary: scale(typo.secondary),
  };
}

/** Размеры шрифтов карточки с учётом ширины, масштаба и доступной высоты. */
export function resolveCardTypography(
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
    nicknameAsPrimary: boolean;
    width: number;
    height: number;
    hasPhoto: boolean;
    cardScale: number;
    footer: CardFooterFlags;
  },
): CardTypography {
  const { showBirth, nicknameAsPrimary, width, height, hasPhoto, cardScale, footer } = options;
  const nameLines = buildCardNameFontLines(fields, showBirth, nicknameAsPrimary);
  const nameFontSizes = computeCardNameFontSizes(nameLines, width, cardScale);

  let sizeIndex = 0;
  const surname = nicknameAsPrimary
    ? (nameFontSizes[0] ?? 11 * cardScale)
    : (nameFontSizes[sizeIndex++] ?? 11 * cardScale);
  const hasBirthSurnameLine =
    !nicknameAsPrimary &&
    Boolean(getCardBirthSuffix(fields.surname, fields.birthSurname, showBirth) &&
      (fields.surname ?? '').trim());
  if (hasBirthSurnameLine) sizeIndex++;
  const given = nicknameAsPrimary ? surname : (nameFontSizes[sizeIndex] ?? 10 * cardScale);
  const patronymic = given;

  let typo: CardTypography = {
    surname,
    given,
    patronymic,
    nickname: 9 * cardScale,
    meta: 9 * cardScale,
    secondary: 8 * cardScale,
  };

  const available = cardBodyTextHeight(height, hasPhoto);
  const used = estimateCardTextHeight(typo, fields, showBirth, nicknameAsPrimary, footer);
  if (used > available && used > 0) {
    typo = scaleTypography(typo, available / used);
  }

  return typo;
}
