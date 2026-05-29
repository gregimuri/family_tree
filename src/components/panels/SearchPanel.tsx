import { useMemo } from 'react';
import { useProjectStore } from '../../store/project-store';
import { useUiStore } from '../../store/ui-store';
import { searchPersons } from '../../services/search/search-index';
import { CollapsiblePanel } from './CollapsiblePanel';
import { Icons } from '../ui/Icons';

export function SearchPanel() {
  const project = useProjectStore((s) => s.project);
  const setCenter = useProjectStore((s) => s.setCenter);
  const setSelection = useProjectStore((s) => s.setSelection);
  const searchOpen = useUiStore((s) => s.searchOpen);
  const toggleSearch = useUiStore((s) => s.toggleSearch);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const setHighlightedPersonId = useUiStore((s) => s.setHighlightedPersonId);

  const results = useMemo(() => {
    if (!project || !searchQuery.trim()) return [];
    return searchPersons(project, searchQuery).slice(0, 20);
  }, [project, searchQuery]);

  const selectPerson = (personId: string) => {
    setCenter({ type: 'person', id: personId });
    setSelection({ type: 'person', id: personId });
    setHighlightedPersonId(personId);
  };

  return (
    <CollapsiblePanel
      title="Поиск"
      icon={<Icons.Search size={16} />}
      open={searchOpen}
      onToggle={toggleSearch}
      position="top-left"
      docked
    >
      <div className="search-input-wrap">
        <input
          type="search"
          placeholder="Фамилия, имя, годы, место..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="panel-input"
        />
      </div>
      <ul className="search-results">
        {results.map((r) => (
          <li key={r.personId}>
            <button type="button" onClick={() => selectPerson(r.personId)}>
              <strong>{r.label}</strong>
              {r.snippet && <span>{r.snippet}</span>}
            </button>
          </li>
        ))}
        {searchQuery && results.length === 0 && <li className="muted">Ничего не найдено</li>}
      </ul>
    </CollapsiblePanel>
  );
}
