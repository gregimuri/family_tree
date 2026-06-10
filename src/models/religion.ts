export type Religion =
  | 'none'
  | 'anglican'
  | 'jewish'
  | 'catholic'
  | 'lutheran'
  | 'muslim'
  | 'orthodox'
  | 'old_believer';

export const RELIGION_OPTIONS: { value: Religion; label: string }[] = [
  { value: 'none', label: 'Отсутствует' },
  { value: 'anglican', label: 'Англикане' },
  { value: 'jewish', label: 'Иудеи' },
  { value: 'catholic', label: 'Католики' },
  { value: 'lutheran', label: 'Лютеране' },
  { value: 'muslim', label: 'Мусульмане' },
  { value: 'orthodox', label: 'Православные' },
  { value: 'old_believer', label: 'Старообрядцы' },
];

export function formatReligion(value: Religion | undefined): string {
  return RELIGION_OPTIONS.find((o) => o.value === (value ?? 'none'))?.label ?? 'Отсутствует';
}

export function normalizeReligion(value: unknown): Religion {
  if (typeof value === 'string' && RELIGION_OPTIONS.some((o) => o.value === value)) {
    return value as Religion;
  }
  return 'none';
}
