import type { DateValue, Gender, LocationDisplaySource, Person, Place, ResidenceEntry } from '../../types';
import { dateToText } from '../../models/person-utils';
import {
  formatResidenceLabel,
  getPersonResidences,
  isResidenceSource,
  placeHasContent,
  residenceCardSource,
  residenceSourceId,
} from '../../models/residences';
import { createId } from '../../utils/create-id';
import { setDateJulianFlag } from '../../utils/julian-calendar';

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
    onChange(setDateJulianFlag(value, checked));
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
  person: Person;
  value: LocationDisplaySource;
  onChange: (value: LocationDisplaySource) => void;
}

const STATIC_LOCATION_SOURCES: { value: LocationDisplaySource; label: string }[] = [
  { value: 'birth', label: 'Место рождения' },
  { value: 'death', label: 'Место смерти' },
  { value: 'burial', label: 'Место захоронения' },
];

export function LocationSourceSelect({ person, value, onChange }: LocationSourceSelectProps) {
  const residences = getPersonResidences(person).filter((entry) => placeHasContent(entry.place));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as LocationDisplaySource)}>
      {STATIC_LOCATION_SOURCES.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
      {residences.length > 0 && (
        <optgroup label="Адреса проживания">
          {residences.map((entry) => (
            <option key={entry.id} value={residenceCardSource(entry.id)}>
              {formatResidenceLabel(entry)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

interface ResidencesEditorProps {
  entries: ResidenceEntry[];
  onChange: (entries: ResidenceEntry[]) => void;
}

export function ResidencesEditor({ entries, onChange }: ResidencesEditorProps) {
  const updateEntry = (id: string, patch: Partial<ResidenceEntry>) => {
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((entry) => entry.id !== id));
  };

  const addEntry = () => {
    onChange([
      ...entries,
      { id: createId(), place: { name: '' } },
    ]);
  };

  return (
    <div className="residences-editor">
      {entries.map((entry, index) => (
        <div key={entry.id} className="residence-entry">
          <div className="residence-entry__header">
            <span className="residence-entry__title">Адрес {index + 1}</span>
            <button type="button" className="btn tiny" onClick={() => removeEntry(entry.id)} title="Удалить адрес">
              ×
            </button>
          </div>
          <PlaceField
            value={entry.place}
            onChange={(place) => {
              if (!place || !placeHasContent(place)) {
                removeEntry(entry.id);
                return;
              }
              updateEntry(entry.id, { place });
            }}
            namePlaceholder="Населённый пункт, адрес"
          />
          <DateField
            label="Переезд (с)"
            value={entry.fromDate}
            onChange={(fromDate) => updateEntry(entry.id, { fromDate })}
          />
          <DateField
            label="Переезд (по)"
            value={entry.toDate}
            onChange={(toDate) => updateEntry(entry.id, { toDate })}
          />
        </div>
      ))}
      <div className="residences-editor__add">
        <span>Добавить адрес</span>
        <button type="button" className="btn tiny" onClick={addEntry} title="Добавить адрес">
          +
        </button>
      </div>
    </div>
  );
}

function hasPlace(p?: Place): boolean {
  return placeHasContent(p);
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
  if (isResidenceSource(source)) {
    const id = residenceSourceId(source);
    if (!id) return undefined;
    return getPersonResidences(person).find((entry) => entry.id === id)?.place;
  }
  switch (source) {
    case 'birth':
      return person.birth?.place;
    case 'death':
      return person.death?.place;
    case 'burial':
      return person.burial;
    default:
      return undefined;
  }
}

export function getLocationSourceLabel(person: Person, source: LocationDisplaySource): string {
  if (isResidenceSource(source)) {
    const id = residenceSourceId(source);
    const entry = id ? getPersonResidences(person).find((item) => item.id === id) : undefined;
    return entry ? formatResidenceLabel(entry) : 'Адрес проживания';
  }
  const labels: Record<'birth' | 'death' | 'burial', string> = {
    birth: 'Место рождения',
    death: 'Место смерти',
    burial: 'Место захоронения',
  };
  return labels[source as 'birth' | 'death' | 'burial'] ?? 'Место на карточке';
}

export function personHasResidences(person: Person): boolean {
  return getPersonResidences(person).some((entry) => placeHasContent(entry.place));
}

export function reconcileCardLocationSource(
  person: Person,
  residences: ResidenceEntry[] | undefined,
): LocationDisplaySource {
  const list = residences ?? [];
  if (isResidenceSource(person.cardLocationSource)) {
    const id = residenceSourceId(person.cardLocationSource);
    if (id && list.some((entry) => entry.id === id)) return person.cardLocationSource;
  }
  if (person.cardLocationSource === 'birth' || person.cardLocationSource === 'death' || person.cardLocationSource === 'burial') {
    return person.cardLocationSource;
  }
  if (list.length > 0) return residenceCardSource(list[list.length - 1].id);
  return 'birth';
}
