import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyPerson } from '../models/defaults';
import { useProjectStore } from '../store/project-store';

describe('project undo', () => {
  beforeEach(() => {
    useProjectStore.getState().newProject('Undo test');
  });

  it('undoes person deletion', () => {
    const store = useProjectStore.getState();
    const id = Object.keys(store.project!.persons)[0];
    const person = store.project!.persons[id];

    store.deletePerson(id);
    expect(useProjectStore.getState().project!.persons[id]).toBeUndefined();

    store.undo();
    expect(useProjectStore.getState().project!.persons[id]?.givenName).toBe(person.givenName);
  });

  it('redoes after undo', () => {
    const store = useProjectStore.getState();
    const id = Object.keys(store.project!.persons)[0];

    store.deletePerson(id);
    store.undo();
    expect(useProjectStore.getState().project!.persons[id]).toBeDefined();

    store.redo();
    expect(useProjectStore.getState().project!.persons[id]).toBeUndefined();
  });

  it('clears redo stack on new change after undo', () => {
    const store = useProjectStore.getState();
    const id = Object.keys(store.project!.persons)[0];

    store.deletePerson(id);
    store.undo();
    expect(useProjectStore.getState().canRedo()).toBe(true);

    store.addPerson({ givenName: 'Новая' });
    expect(useProjectStore.getState().canRedo()).toBe(false);
  });

  it('groups rapid text edits into one undo step', () => {
    const store = useProjectStore.getState();
    const id = Object.keys(store.project!.persons)[0];
    const person = store.project!.persons[id];

    store.updatePerson({ ...person, givenName: 'A' });
    store.updatePerson({ ...useProjectStore.getState().project!.persons[id], givenName: 'AB' });

    expect(useProjectStore.getState().undoStack.length).toBe(1);

    store.undo();
    expect(useProjectStore.getState().project!.persons[id].givenName).toBe(person.givenName);
  });

  it('records structural link changes separately', () => {
    const store = useProjectStore.getState();
    const child = createEmptyPerson({ givenName: 'Ребёнок' });
    store.addPerson(child);
    const parentId = Object.keys(useProjectStore.getState().project!.persons).find(
      (id) => id !== child.id,
    )!;

    store.linkParent(child.id, parentId);
    expect(useProjectStore.getState().undoStack.length).toBeGreaterThanOrEqual(2);

    store.undo();
    const parents = useProjectStore.getState().project!.persons[child.id].parentUnionIds;
    expect(parents.length).toBe(0);
  });
});
