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
