import type { DateValue, Gender, LocationDisplaySource, Place } from '../../types';
import { dateToText } from '../../models/person-utils';

interface DateFieldProps {
  value?: DateValue;
  onChange: (value: DateValue | undefined) => void;
  label?: string;
}

export function DateField({ value, onChange, label }: DateFieldProps) {
  const update = (patch: Partial<DateValue>) => {
    const next = { ...value, ...patch };
    if (next.text?.trim()) {
      onChange({ text: next.text.trim() });
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
          if (!text.trim()) {
            onChange(value?.year || value?.month || value?.day ? { ...value, text: undefined } : undefined);
            return;
          }
          onChange({ text: text.trim() });
        }}
      />
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
