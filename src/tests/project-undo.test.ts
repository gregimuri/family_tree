import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyPerson } from '../models/defaults';
import { buildLayout } from '../layout';
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

  it('groups manual layout drags into one undo step', () => {
    const store = useProjectStore.getState();
    const personId = Object.keys(store.project!.persons)[0];

    store.setManualLayoutMode(true);
    const stackAfterEnter = useProjectStore.getState().undoStack.length;

    store.setManualPosition(personId, 100, 200);
    store.setManualPosition(personId, 120, 220);
    store.setManualPosition(personId, 140, 240);

    expect(useProjectStore.getState().undoStack.length).toBe(stackAfterEnter);

    store.undo();
    expect(useProjectStore.getState().project!.manualLayout?.[personId]).toBeUndefined();
  });

  it('undoes manual edge route edit gesture', () => {
    const store = useProjectStore.getState();
    store.setManualLayoutMode(true);
    const layout = buildLayout(store.project!);
    const edge = layout.edges.find((e) => e.points.length >= 2) ?? layout.edges[0];
    expect(edge).toBeTruthy();

    const custom = edge.points.map((p) => ({ ...p }));
    custom[0] = { x: custom[0].x + 40, y: custom[0].y + 40 };

    store.beginLayoutEditGesture();
    store.setManualEdgeRoute(edge.id, custom);
    store.endLayoutEditGesture();

    expect(useProjectStore.getState().project!.manualEdgeRoutes?.[edge.id]).toBeTruthy();

    store.undo();
    expect(useProjectStore.getState().project!.manualEdgeRoutes?.[edge.id]).toBeUndefined();
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
