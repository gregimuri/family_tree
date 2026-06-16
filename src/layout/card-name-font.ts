import { buildCardNameLines, cardNameLineHeight, type CardNameLine } from './card-display-lines';

const ROW_GAP = 1;
const MIN_FONT_SIZE = 5.5;
const DETAILS_GAP = 4;

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
  const heightFactor = lineCount > 6 ? 0.78 : lineCount > 4 ? 0.86 : lineCount > 3 ? 0.92 : 1;
  const widthMaxScale = Math.min(1.35, 1.05 + cardScale * 0.25);
  return lines.map(({ text, base }) => {
    if (!text.trim()) return base * cardScale;
    const scaledBase = base * cardScale;
    return Math.round(
      scaleCardLineFontSize(text, scaledBase, innerWidth, 0.65, widthMaxScale) * heightFactor * 10,
    ) / 10;
  });
}

export interface CardFooterFlags {
  hasDates: boolean;
  hasAge: boolean;
  hasReligion: boolean;
  hasLocation: boolean;
}

export interface CardTypography {
  lineSizes: number[];
  meta: number;
  secondary: number;
  /** @deprecated use lineSizes */
  surname: number;
  /** @deprecated use lineSizes */
  given: number;
  /** @deprecated use lineSizes */
  patronymic: number;
  /** @deprecated use lineSizes */
  nickname: number;
}

export function cardBodyTextHeight(cardHeight: number, hasPhoto: boolean): number {
  const bodyHeight = hasPhoto ? (cardHeight * 5) / 12 : cardHeight;
  const padding = hasPhoto ? 10 : 10;
  return Math.max(28, bodyHeight - padding);
}

export function estimateCardTextHeight(
  nameLines: CardNameLine[],
  lineSizes: number[],
  footer: CardFooterFlags,
  typo: Pick<CardTypography, 'meta' | 'secondary'>,
): number {
  let h = 0;
  nameLines.forEach((line, index) => {
    const size = lineSizes[index] ?? line.base;
    if (h > 0) h += ROW_GAP;
    h += size * cardNameLineHeight(line.emphasis);
  });

  if (footer.hasDates || footer.hasAge || footer.hasReligion || footer.hasLocation) {
    if (nameLines.length > 0) h += DETAILS_GAP;
  }
  if (footer.hasDates || footer.hasAge) h += typo.meta * 1.2;
  if (footer.hasLocation) h += ROW_GAP + typo.secondary * 1.18;

  return h;
}

function scaleTypography(typo: CardTypography, factor: number): CardTypography {
  const scale = (value: number) => Math.max(MIN_FONT_SIZE, Math.round(value * factor * 10) / 10);
  const lineSizes = typo.lineSizes.map(scale);
  return {
    lineSizes,
    surname: lineSizes[0] ?? scale(typo.surname),
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
    showNickname: boolean;
    nicknameAsPrimary: boolean;
    width: number;
    height: number;
    hasPhoto: boolean;
    cardScale: number;
    footer: CardFooterFlags;
  },
): CardTypography {
  const { showBirth, showNickname, nicknameAsPrimary, width, height, hasPhoto, cardScale, footer } =
    options;
  const nameLines = buildCardNameLines(fields, { showBirth, showNickname, nicknameAsPrimary });
  const nameFontSizes = computeCardNameFontSizes(nameLines, width, cardScale);

  let typo: CardTypography = {
    lineSizes: nameFontSizes,
    surname: nameFontSizes[0] ?? 11 * cardScale,
    given: nameFontSizes.find((_, i) => nameLines[i]?.emphasis === 'name') ?? 10 * cardScale,
    patronymic: nameFontSizes.find((_, i) => nameLines[i]?.kind === 'patronymic') ?? 10 * cardScale,
    nickname: nameFontSizes.find((_, i) => nameLines[i]?.kind === 'nickname') ?? 9 * cardScale,
    meta: 9 * cardScale,
    secondary: 8 * cardScale,
  };

  const available = cardBodyTextHeight(height, hasPhoto);
  const used = estimateCardTextHeight(nameLines, nameFontSizes, footer, typo);
  if (used > available && used > 0) {
    typo = scaleTypography(typo, available / used);
  }

  return typo;
}

export { buildCardNameLines };
