import { useMemo, useState } from 'react';
import type { Project } from '../../types';
import { browsePersons, searchPersons } from '../../services/search/search-index';
import './PersonSearchDialog.css';

interface PersonSearchDialogProps {
  project: Project;
  excludeIds?: string[];
  title: string;
  hint?: string;
  onSelect: (personId: string) => void;
  onClose: () => void;
}

export function PersonSearchDialog({
  project,
  excludeIds = [],
  title,
  hint,
  onSelect,
  onClose,
}: PersonSearchDialogProps) {
  const [query, setQuery] = useState('');
  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed) {
      return searchPersons(project, trimmed)
        .filter((r) => !excluded.has(r.personId))
        .slice(0, 20);
    }
    return browsePersons(project, excluded, 25);
  }, [project, query, excluded]);

  return (
    <div className="person-search-overlay" onClick={onClose}>
      <div className="person-search-dialog" onClick={(e) => e.stopPropagation()}>
        <h4>{title}</h4>
        {hint && <p className="person-search-hint">{hint}</p>}
        <input
          type="search"
          className="panel-input"
          placeholder="Поиск по ФИО, годам, месту..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <p className="person-search-list-label">
          {query.trim() ? 'Результаты поиска' : 'Все персоны проекта'}
        </p>
        <ul className="person-search-results">
          {results.map((r) => (
            <li key={r.personId}>
              <button type="button" onClick={() => onSelect(r.personId)}>
                <strong>{r.label}</strong>
                {r.snippet && <span>{r.snippet}</span>}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="muted">
              {query.trim() ? 'Ничего не найдено' : 'Нет доступных персон для привязки'}
            </li>
          )}
        </ul>
        <button type="button" className="btn" onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  );
}
