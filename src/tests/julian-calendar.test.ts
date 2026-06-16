import { describe, it, expect } from 'vitest';
import { dateToText } from '../models/person-utils';
import { setDateJulianFlag } from '../utils/julian-calendar';

describe('julian date flag', () => {
  it('toggles old-style flag without changing date parts', () => {
    const original = { year: 1897, month: 7, day: 1 };

    const withFlag = setDateJulianFlag(original, true)!;
    expect(withFlag).toEqual({ year: 1897, month: 7, day: 1, julian: true });
    expect(dateToText(withFlag)).toBe('01.07.1897\u00a0ст.');

    const withoutFlag = setDateJulianFlag(withFlag, false)!;
    expect(withoutFlag).toEqual({ year: 1897, month: 7, day: 1 });
    expect(dateToText(withoutFlag)).toBe('01.07.1897');

    const again = setDateJulianFlag(withoutFlag, true)!;
    expect(again).toEqual({ year: 1897, month: 7, day: 1, julian: true });
  });

  it('preserves text dates and only adds suffix on display', () => {
    const textDate = { text: 'ок. 1875' };
    const flagged = setDateJulianFlag(textDate, true)!;
    expect(flagged).toEqual({ text: 'ок. 1875', julian: true });
    expect(dateToText(flagged)).toBe('ок. 1875\u00a0ст.');
    expect(setDateJulianFlag(flagged, false)).toEqual({ text: 'ок. 1875' });
  });
});
