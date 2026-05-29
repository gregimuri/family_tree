import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonRelationships } from '../components/dossier/PersonRelationships';
import { getParents } from '../models/person-utils';
import { useProjectStore } from '../store/project-store';

describe('PersonRelationships UI', () => {
  beforeEach(() => {
    useProjectStore.getState().newProject('Relationships test', true);
  });

  it('shows link actions in edit mode', () => {
    const personId = Object.keys(useProjectStore.getState().project!.persons)[0];

    render(
      <PersonRelationships personId={personId} canEdit onNavigate={() => undefined} />,
    );

    expect(screen.getByText('Связи')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Создать родителя' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Привязать…' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '+ Новый партнёр' })).toBeTruthy();
  });

  it('opens search dialog when linking existing person', () => {
    const store = useProjectStore.getState();
    const personId = Object.keys(store.project!.persons)[0];
    store.addPerson({ givenName: 'Мария', surname: 'Петрова' });

    render(
      <PersonRelationships personId={personId} canEdit onNavigate={() => undefined} />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Привязать…' })[0]);

    expect(screen.getByText('Привязать родителя')).toBeTruthy();
    expect(screen.getByPlaceholderText('Поиск по ФИО, годам, месту...')).toBeTruthy();
    expect(screen.getByText('Петрова Мария')).toBeTruthy();
  });

  it('shows view hint when editing is disabled', () => {
    const personId = Object.keys(useProjectStore.getState().project!.persons)[0];

    render(
      <PersonRelationships personId={personId} canEdit={false} onNavigate={() => undefined} />,
    );

    expect(screen.queryByRole('button', { name: '+ Создать родителя' })).toBeNull();
  });

  it('creates and links parent on button click', () => {
    const store = useProjectStore.getState();
    const personId = Object.keys(store.project!.persons)[0];
    const before = Object.keys(store.project!.persons).length;
    const centerBefore = store.project!.center;

    render(
      <PersonRelationships personId={personId} canEdit onNavigate={() => undefined} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Создать родителя' }));

    const updated = useProjectStore.getState().project!;
    expect(Object.keys(updated.persons).length).toBe(before + 1);
    expect(getParents(updated, updated.persons[personId]).length).toBe(1);
    expect(updated.center).toEqual(centerBefore);
  });

  it('hides parent actions when two parents are set', () => {
    const store = useProjectStore.getState();
    const child = store.addPerson({ givenName: 'Ребёнок' });
    const father = store.addPerson({ givenName: 'Отец', gender: 'male' });
    const mother = store.addPerson({ givenName: 'Мать', gender: 'female' });
    store.linkParent(child.id, father.id);
    store.linkParent(child.id, mother.id);

    render(
      <PersonRelationships personId={child.id} canEdit onNavigate={() => undefined} />,
    );

    expect(screen.queryByRole('button', { name: '+ Создать родителя' })).toBeNull();
    expect(screen.getByText(/Указаны оба родителя/)).toBeTruthy();
  });

  it('does not change tree center when adding linked person', () => {
    const store = useProjectStore.getState();
    const centerBefore = store.project!.center;
    const anchorId = Object.keys(store.project!.persons)[0];
    const person = store.addPerson({ givenName: 'Новая' });
    store.placeNewPersonNear(person.id, anchorId);

    expect(useProjectStore.getState().project!.center).toEqual(centerBefore);
    expect(useProjectStore.getState().selection).toEqual({ type: 'person', id: person.id });
  });
});
