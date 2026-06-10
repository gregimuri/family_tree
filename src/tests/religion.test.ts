import { describe, it, expect } from 'vitest';
import { formatReligion, normalizeReligion } from '../models/religion';

describe('religion', () => {
  it('formats known denominations', () => {
    expect(formatReligion('orthodox')).toBe('Православные');
    expect(formatReligion('none')).toBe('Отсутствует');
  });

  it('normalizes unknown values to none', () => {
    expect(normalizeReligion(undefined)).toBe('none');
    expect(normalizeReligion('invalid')).toBe('none');
  });
});
