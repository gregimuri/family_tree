import { describe, it, expect, beforeEach, vi } from 'vitest';
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

  it('shows media controls only while editing the dossier', () => {
    const personId = openDefaultDossier();
    const store = useProjectStore.getState();
    const mediaId = 'media-test-1';
    store.updateProject((p) => ({
      ...p,
      media: {
        ...p.media,
        [mediaId]: {
          id: mediaId,
          type: 'photo',
          filename: 'portrait.jpg',
          description: 'Портрет',
          personIds: [personId],
        },
      },
      persons: {
        ...p.persons,
        [personId]: { ...p.persons[personId], mediaIds: [mediaId] },
      },
    }));

    render(<PersonDossier personId={personId} />);

    expect(screen.queryByText('Добавить файл')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Удалить из проекта' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));

    expect(screen.getByText('Добавить файл')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Удалить из проекта' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Описание')).toBeTruthy();
  });

  it('keeps newly added media after finishing edit', () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:test-url'),
      revokeObjectURL: vi.fn(),
    });

    const personId = openDefaultDossier();

    render(<PersonDossier personId={personId} />);

    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));

    const input = document.querySelector('.media-upload input[type="file"]') as HTMLInputElement;
    const file = new File(['photo'], 'portrait.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));

    const project = useProjectStore.getState().project!;
    expect(project.persons[personId].mediaIds).toHaveLength(1);
    expect(Object.keys(project.media)).toHaveLength(1);
    expect(screen.getByText(/portrait\.jpg/)).toBeTruthy();

    vi.unstubAllGlobals();
  });
});
