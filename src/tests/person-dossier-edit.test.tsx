import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonDossier } from '../components/dossier/PersonDossier';
import { getParents } from '../models/person-utils';
import { useProjectStore } from '../store/project-store';

describe('PersonDossier edit session', () => {
  beforeEach(() => {
    useProjectStore.getState().newProject('Dossier edit test', true);
  });

  function openDefaultDossier() {
    const personId = Object.keys(useProjectStore.getState().project!.persons)[0];
    useProjectStore.getState().openDossier(personId);
    return personId;
  }

  it('keeps relationships after finishing edit', () => {
    const personId = openDefaultDossier();
    const beforeCount = Object.keys(useProjectStore.getState().project!.persons).length;

    render(<PersonDossier personId={personId} />);

    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Создать родителя' }));
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));

    const project = useProjectStore.getState().project!;
    expect(Object.keys(project.persons).length).toBe(beforeCount + 1);
    expect(getParents(project, project.persons[personId]).length).toBe(1);
    expect(screen.getByText('Связи')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ Создать родителя' })).toBeNull();
  });

  it('discards all changes when closing with × during edit', () => {
    const personId = openDefaultDossier();
    const beforeCount = Object.keys(useProjectStore.getState().project!.persons).length;

    render(<PersonDossier personId={personId} />);

    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Создать родителя' }));
    fireEvent.click(document.querySelector('.dossier-close')!);

    const project = useProjectStore.getState().project!;
    expect(Object.keys(project.persons).length).toBe(beforeCount);
    expect(getParents(project, project.persons[personId]).length).toBe(0);
    expect(useProjectStore.getState().dossierPersonId).toBeNull();
  });
});
