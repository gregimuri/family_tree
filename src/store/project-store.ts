import { create } from 'zustand';
import type {
  AppMode,
  MediaItem,
  Person,
  Project,
  ProjectCenter,
  SelectionTarget,
  Union,
  ViewSettings,
} from '../types';
import { createEmptyPerson, createEmptyProject, defaultViewSettings } from '../models/defaults';
import { createId } from '../utils/create-id';
import { removePersonFromProject, touchProjectMeta } from '../models/person-utils';
import { addRecent, saveProjectToDb } from '../services/project-io/db';

interface ProjectState {
  project: Project | null;
  mode: AppMode;
  blobKey: string | null;
  mediaBlobs: Map<string, Blob>;
  mediaUrls: Map<string, string>;
  dirty: boolean;
  selection: SelectionTarget;
  dossierPersonId: string | null;
  mediaViewerId: string | null;
  manualLayoutMode: boolean;

  newProject: (name?: string, edit?: boolean) => void;
  loadProject: (project: Project, blobKey: string, mediaBlobs?: Map<string, Blob>, mode?: AppMode) => void;
  setMode: (mode: AppMode) => void;
  updateProject: (updater: (p: Project) => Project) => void;
  setViewSettings: (settings: ViewSettings) => void;
  setCenter: (center: ProjectCenter) => void;
  setSelection: (selection: SelectionTarget) => void;
  openDossier: (personId: string) => void;
  closeDossier: () => void;
  openMediaViewer: (mediaId: string) => void;
  closeMediaViewer: () => void;
  setManualLayoutMode: (enabled: boolean) => void;

  addPerson: (person?: Partial<Person>) => Person;
  updatePerson: (person: Person) => void;
  deletePerson: (personId: string) => void;
  addUnion: (union: Union) => void;
  updateUnion: (union: Union) => void;
  addMedia: (item: MediaItem, blob: Blob) => void;
  replaceMediaBlob: (filename: string, blob: Blob) => void;
  updateMedia: (item: MediaItem) => void;
  deleteMedia: (mediaId: string) => void;
  getMediaUrl: (filename: string) => string | undefined;
  autosave: () => Promise<void>;
  setManualPosition: (personId: string, x: number, y: number) => void;
  clearManualPosition: (personId: string) => void;
  clearManualLayout: () => void;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutosave(get: () => ProjectState) {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    void get().autosave();
  }, 1500);
}

function revokeUrls(urls: Map<string, string>) {
  for (const url of urls.values()) URL.revokeObjectURL(url);
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  mode: 'view',
  blobKey: null,
  mediaBlobs: new Map(),
  mediaUrls: new Map(),
  dirty: false,
  selection: null,
  dossierPersonId: null,
  mediaViewerId: null,
  manualLayoutMode: false,

  newProject: (name, edit = true) => {
    const project = createEmptyProject(name);
    const blobKey = createId();
    set({
      project,
      blobKey,
      mode: edit ? 'edit' : 'view',
      mediaBlobs: new Map(),
      mediaUrls: new Map(),
      dirty: true,
      selection: null,
      dossierPersonId: null,
      manualLayoutMode: false,
    });
    scheduleAutosave(get);
  },

  loadProject: (project, blobKey, mediaBlobs = new Map(), mode = 'view') => {
    const state = get();
    revokeUrls(state.mediaUrls);
    const mediaUrls = new Map<string, string>();
    for (const [filename, blob] of mediaBlobs) {
      mediaUrls.set(filename, URL.createObjectURL(blob));
    }
    set({
      project,
      blobKey,
      mode,
      mediaBlobs,
      mediaUrls,
      dirty: false,
      selection: null,
      dossierPersonId: null,
      manualLayoutMode: false,
    });
    void addRecent({
      id: blobKey,
      name: project.meta.name,
      openedAt: new Date().toISOString(),
      blobKey,
    });
    void saveProjectToDb(blobKey, project);
  },

  setMode: (mode) => set({ mode }),

  updateProject: (updater) => {
    const current = get().project;
    if (!current) return;
    set({ project: touchProjectMeta(updater(current)), dirty: true });
    scheduleAutosave(get);
  },

  setViewSettings: (settings) => {
    get().updateProject((p) => ({ ...p, viewSettings: settings }));
  },

  setCenter: (center) => {
    get().updateProject((p) => ({ ...p, center }));
    set({ selection: null });
  },

  setSelection: (selection) => set({ selection }),

  openDossier: (personId) => set({ dossierPersonId: personId }),
  closeDossier: () => set({ dossierPersonId: null }),
  openMediaViewer: (mediaId) => set({ mediaViewerId: mediaId }),
  closeMediaViewer: () => set({ mediaViewerId: null }),
  setManualLayoutMode: (enabled) => set({ manualLayoutMode: enabled }),

  addPerson: (partial) => {
    const person = createEmptyPerson(partial);
    get().updateProject((p) => ({
      ...p,
      persons: { ...p.persons, [person.id]: person },
    }));
    return person;
  },

  updatePerson: (person) => {
    get().updateProject((p) => ({
      ...p,
      persons: { ...p.persons, [person.id]: person },
    }));
  },

  deletePerson: (personId) => {
    const state = get();
    if (!state.project?.persons[personId]) return;

    const nextProject = removePersonFromProject(state.project, personId);
    const removedUnionIds = new Set(
      [...state.project.persons[personId].unionIds, ...state.project.persons[personId].parentUnionIds].filter(
        (id) => !nextProject.unions[id],
      ),
    );

    const uiPatch: Partial<ProjectState> = {};
    if (state.dossierPersonId === personId) uiPatch.dossierPersonId = null;
    if (state.selection?.type === 'person' && state.selection.id === personId) uiPatch.selection = null;
    if (state.selection?.type === 'family' && removedUnionIds.has(state.selection.id)) {
      uiPatch.selection = null;
    }
    if (Object.keys(uiPatch).length > 0) set(uiPatch);

    get().updateProject(() => nextProject);
  },

  addUnion: (union) => {
    get().updateProject((p) => ({ ...p, unions: { ...p.unions, [union.id]: union } }));
  },

  updateUnion: (union) => {
    get().updateProject((p) => ({ ...p, unions: { ...p.unions, [union.id]: union } }));
  },

  addMedia: (item, blob) => {
    const state = get();
    const mediaBlobs = new Map(state.mediaBlobs);
    const mediaUrls = new Map(state.mediaUrls);
    mediaBlobs.set(item.filename, blob);
    mediaUrls.set(item.filename, URL.createObjectURL(blob));
    get().updateProject((p) => ({
      ...p,
      media: { ...p.media, [item.id]: item },
    }));
    set({ mediaBlobs, mediaUrls });
  },

  replaceMediaBlob: (filename, blob) => {
    const state = get();
    const mediaBlobs = new Map(state.mediaBlobs);
    const mediaUrls = new Map(state.mediaUrls);
    const oldUrl = mediaUrls.get(filename);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    mediaBlobs.set(filename, blob);
    mediaUrls.set(filename, URL.createObjectURL(blob));
    set({ mediaBlobs, mediaUrls, dirty: true });
    scheduleAutosave(get);
  },

  updateMedia: (item) => {
    get().updateProject((p) => ({ ...p, media: { ...p.media, [item.id]: item } }));
  },

  deleteMedia: (mediaId) => {
    const state = get();
    const item = state.project?.media[mediaId];
    if (item) {
      const url = state.mediaUrls.get(item.filename);
      if (url) URL.revokeObjectURL(url);
      const mediaBlobs = new Map(state.mediaBlobs);
      const mediaUrls = new Map(state.mediaUrls);
      mediaBlobs.delete(item.filename);
      mediaUrls.delete(item.filename);
      set({ mediaBlobs, mediaUrls });
    }
    get().updateProject((p) => {
      const media = { ...p.media };
      delete media[mediaId];
      return { ...p, media };
    });
  },

  getMediaUrl: (filename) => {
    if (/^https?:\/\//i.test(filename)) return filename;
    return get().mediaUrls.get(filename);
  },

  autosave: async () => {
    const { project, blobKey } = get();
    if (!project || !blobKey) return;
    await saveProjectToDb(blobKey, project);
    set({ dirty: false });
  },

  setManualPosition: (personId, x, y) => {
    get().updateProject((p) => ({
      ...p,
      manualLayout: { ...(p.manualLayout ?? {}), [personId]: { x, y } },
    }));
  },

  clearManualPosition: (personId) => {
    get().updateProject((p) => {
      if (!p.manualLayout?.[personId]) return p;
      const manualLayout = { ...p.manualLayout };
      delete manualLayout[personId];
      return {
        ...p,
        manualLayout: Object.keys(manualLayout).length > 0 ? manualLayout : undefined,
      };
    });
  },

  clearManualLayout: () => {
    get().updateProject((p) => ({ ...p, manualLayout: undefined }));
  },
}));

export { defaultViewSettings };
