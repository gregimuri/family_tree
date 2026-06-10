import { getCardBirthSuffix } from '../models/person-utils';

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
): number[] {
  const visible = lines.filter((l) => l.text.trim());
  const lineCount = visible.length;
  const heightFactor = lineCount > 4 ? 0.82 : lineCount > 3 ? 0.9 : 1;
  return lines.map(({ text, base }) => {
    if (!text.trim()) return base;
    return Math.round(scaleCardLineFontSize(text, base, innerWidth) * heightFactor * 10) / 10;
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
    { text: cardLineText(fields.givenName, fields.birthGivenName, showBirth), base: 10 },
    { text: cardLineText(fields.patronymic, fields.birthPatronymic, showBirth), base: 9 },
  );

  return lines;
}
