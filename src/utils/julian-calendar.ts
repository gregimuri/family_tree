import type { DateValue } from '../types';

/** Gregorian → Julian (Russia: switch 1918-02-14 → 1918-02-01). */
export function gregorianToJulian(day: number, month: number, year: number): { day: number; month: number; year: number } {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  let jdn =
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;

  if (year < 1582 || (year === 1582 && (month < 10 || (month === 10 && day < 15)))) {
    jdn += 0;
  } else {
    jdn -= 13;
  }

  const f = jdn + 1401 + Math.floor((4 * jdn + 274277) / 146097) * 3 / 4 - 38;
  const e = 4 * f + 3;
  const g = Math.floor((e % 1461) / 4);
  const h = 5 * g + 2;
  const jd = Math.floor((h % 153) / 5) + 1;
  const jm = ((Math.floor(h / 153) + 2) % 12) + 1;
  const jy = Math.floor(e / 1461) - 4716 + Math.floor((14 - jm) / 12);

  return { day: jd, month: jm, year: jy };
}

/** Julian → Gregorian. */
export function julianToGregorian(day: number, month: number, year: number): { day: number; month: number; year: number } {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  let jdn =
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    32083;

  if (year < 1582 || (year === 1582 && (month < 10 || (month === 10 && day < 5)))) {
    jdn += 0;
  } else {
    jdn += 13;
  }

  const f = jdn + 1401 + Math.floor((4 * jdn + 274277) / 146097) * 3 / 4 - 38;
  const e = 4 * f + 3;
  const g = Math.floor((e % 1461) / 4);
  const h = 5 * g + 2;
  const gd = Math.floor((h % 153) / 5) + 1;
  const gm = ((Math.floor(h / 153) + 2) % 12) + 1;
  const gy = Math.floor(e / 1461) - 4716 + Math.floor((14 - gm) / 12);

  return { day: gd, month: gm, year: gy };
}

export function convertDateCalendar(date: DateValue, toJulian: boolean): DateValue {
  if (toJulian === !!date.julian) return date;
  if (date.text?.trim()) {
    return { ...date, julian: toJulian };
  }
  const { day, month, year } = date;
  if (!year) return { ...date, julian: toJulian };
  if (day && month) {
    const converted = toJulian
      ? gregorianToJulian(day, month, year)
      : julianToGregorian(day, month, year);
    return { day: converted.day, month: converted.month, year: converted.year, julian: toJulian };
  }
  return { year, month, day, julian: toJulian };
}
