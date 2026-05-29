import { useState } from 'react';
import type { Gender } from '../../types';
import { useProjectStore } from '../../store/project-store';
import { useUiStore } from '../../store/ui-store';
import { CollapsiblePanel } from './CollapsiblePanel';
import { Icons } from '../ui/Icons';

export function AddPersonPanel() {
  const project = useProjectStore((s) => s.project);
  const mode = useProjectStore((s) => s.mode);
  const addPerson = useProjectStore((s) => s.addPerson);
  const placeNewPersonNear = useProjectStore((s) => s.placeNewPersonNear);
  const addPersonOpen = useUiStore((s) => s.addPersonOpen);
  const toggleAddPerson = useUiStore((s) => s.toggleAddPerson);

  const [surname, setSurname] = useState('');
  const [givenName, setGivenName] = useState('');
  const [patronymic, setPatronymic] = useState('');
  const [gender, setGender] = useState<Gender>('unknown');

  if (mode !== 'edit') return null;

  const handleAdd = () => {
    const person = addPerson({ surname, givenName, patronymic, gender });
    const anchorId =
      project?.center.type === 'person'
        ? project.center.id
        : Object.keys(project?.persons ?? {})[0];
    if (anchorId) placeNewPersonNear(person.id, anchorId);
    setSurname('');
    setGivenName('');
    setPatronymic('');
  };

  return (
    <CollapsiblePanel
      title="Новая персона"
      icon={<Icons.UserPlus size={16} />}
      open={addPersonOpen}
      onToggle={toggleAddPerson}
      position="top-left"
      docked
    >
      <div className="panel-form">
        <input
          className="panel-input"
          placeholder="Фамилия"
          value={surname}
          onChange={(e) => setSurname(e.target.value)}
        />
        <input
          className="panel-input"
          placeholder="Имя"
          value={givenName}
          onChange={(e) => setGivenName(e.target.value)}
        />
        <input
          className="panel-input"
          placeholder="Отчество"
          value={patronymic}
          onChange={(e) => setPatronymic(e.target.value)}
        />
        <select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
          <option value="unknown">Пол не указан</option>
          <option value="male">Мужчина</option>
          <option value="female">Женщина</option>
        </select>
        <button type="button" className="btn primary panel-form__submit" onClick={handleAdd}>
          Добавить
        </button>
      </div>
    </CollapsiblePanel>
  );
}
