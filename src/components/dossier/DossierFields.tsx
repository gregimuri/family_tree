import type { DateValue, Gender, LocationDisplaySource, Person, Place } from '../../types';
import { dateToText } from '../../models/person-utils';
import { convertDateCalendar } from '../../utils/julian-calendar';

interface DateFieldProps {
  value?: DateValue;
  onChange: (value: DateValue | undefined) => void;
  label?: string;
}

function normalizeDateValue(value?: DateValue): DateValue | undefined {
  if (!value) return undefined;
  if (value.text?.trim()) {
    return { text: value.text.trim(), julian: value.julian };
  }
  const next = { ...value };
  delete next.text;
  if (!next.year && !next.month && !next.day) return undefined;
  return next;
}

export function DateField({ value, onChange, label }: DateFieldProps) {
  const update = (patch: Partial<DateValue>) => {
    const next = { ...value, ...patch };
    if (next.text?.trim()) {
      onChange({ text: next.text, julian: next.julian });
      return;
    }
    delete next.text;
    if (!next.year && !next.month && !next.day) {
      onChange(undefined);
      return;
    }
    onChange(next);
  };

  const clear = () => onChange(undefined);

  const toggleJulian = (checked: boolean) => {
    if (!value) {
      onChange({ julian: checked });
      return;
    }
    onChange(convertDateCalendar(value, checked));
  };

  return (
    <div className="dossier-field date-field">
      {label && <span className="field-label">{label}</span>}
      <div className="date-parts">
        <input
          type="number"
          min={1}
          max={31}
          placeholder="День"
          value={value?.text ? '' : (value?.day ?? '')}
          disabled={!!value?.text}
          onChange={(e) => update({ day: e.target.value ? +e.target.value : undefined })}
        />
        <input
          type="number"
          min={1}
          max={12}
          placeholder="Мес."
          value={value?.text ? '' : (value?.month ?? '')}
          disabled={!!value?.text}
          onChange={(e) => update({ month: e.target.value ? +e.target.value : undefined })}
        />
        <input
          type="number"
          placeholder="Год"
          value={value?.text ? '' : (value?.year ?? '')}
          disabled={!!value?.text}
          onChange={(e) => update({ year: e.target.value ? +e.target.value : undefined })}
        />
        <button type="button" className="btn tiny" onClick={clear} title="Очистить">
          ×
        </button>
      </div>
      <input
        className="date-text"
        placeholder={`Текст даты (${dateToText(value) || 'напр. ок. 1951'})`}
        value={value?.text ?? ''}
        onChange={(e) => {
          const text = e.target.value;
          if (!text) {
            onChange(
              value?.year || value?.month || value?.day
                ? { day: value.day, month: value.month, year: value.year, julian: value.julian }
                : value?.julian
                  ? { julian: value.julian }
                  : undefined,
            );
            return;
          }
          onChange({ text, julian: value?.julian });
        }}
        onBlur={() => {
          if (value?.text) onChange(normalizeDateValue(value));
        }}
      />
      <label className="dossier-checkbox date-julian">
        <input
          type="checkbox"
          checked={!!value?.julian}
          onChange={(e) => toggleJulian(e.target.checked)}
        />
        По старому стилю
      </label>
    </div>
  );
}

interface PlaceFieldProps {
  value?: Place;
  onChange: (value: Place | undefined) => void;
  label?: string;
  namePlaceholder?: string;
}

export function PlaceField({ value, onChange, label, namePlaceholder = 'Название' }: PlaceFieldProps) {
  return (
    <div className="dossier-field place-field">
      {label && <span className="field-label">{label}</span>}
      <input
        placeholder={namePlaceholder}
        value={value?.name ?? ''}
        onChange={(e) => {
          const name = e.target.value;
          if (!name.trim()) {
            onChange(value?.details ? { name: '', details: value.details } : undefined);
            return;
          }
          onChange({ ...value, name });
        }}
      />
      <input
        className="place-details"
        placeholder="Подробности (необязательно)"
        value={value?.details ?? ''}
        onChange={(e) => {
          const details = e.target.value;
          if (!value?.name && !details.trim()) {
            onChange(undefined);
            return;
          }
          onChange({ name: value?.name ?? '', details: details || undefined });
        }}
      />
    </div>
  );
}

interface GenderSelectProps {
  value: Gender;
  onChange: (value: Gender) => void;
}

export function GenderSelect({ value, onChange }: GenderSelectProps) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Gender)}>
      <option value="male">Мужской</option>
      <option value="female">Женский</option>
      <option value="unknown">Неизвестно</option>
    </select>
  );
}

interface LocationSourceSelectProps {
  value: LocationDisplaySource;
  onChange: (value: LocationDisplaySource) => void;
}

const LOCATION_SOURCES: { value: LocationDisplaySource; label: string }[] = [
  { value: 'birth', label: 'Место рождения' },
  { value: 'death', label: 'Место смерти' },
  { value: 'burial', label: 'Место захоронения' },
  { value: 'current', label: 'Текущее проживание' },
  { value: 'longestResidence', label: 'Самое длительное проживание' },
];

export function LocationSourceSelect({ value, onChange }: LocationSourceSelectProps) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as LocationDisplaySource)}>
      {LOCATION_SOURCES.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function hasPlace(p?: Place): boolean {
  return !!(p?.name?.trim() || p?.details?.trim());
}

export function placeHasValue(p?: Place): boolean {
  return hasPlace(p);
}

export function formatPlaceText(p?: Place): string | null {
  if (!hasPlace(p)) return null;
  const name = p?.name?.trim();
  const details = p?.details?.trim();
  if (name && details) return `${name} (${details})`;
  return name || details || null;
}

export function getPlaceForLocationSource(person: Person, source: LocationDisplaySource): Place | undefined {
  switch (source) {
    case 'birth':
      return person.birth?.place;
    case 'death':
      return person.death?.place;
    case 'burial':
      return person.burial;
    case 'current':
      return person.currentResidence;
    case 'longestResidence':
      return person.longestResidence;
    default:
      return undefined;
  }
}
