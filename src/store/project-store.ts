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
import {
  finalizeRelationshipChanges,
  linkChild as linkChildInProject,
  linkParent as linkParentInProject,
  linkPartner as linkPartnerInProject,
  removeMediaFromProject,
  removePersonFromProject,
  repairProjectRelationships,
  touchProjectMeta,
  unlinkChild as unlinkChildInProject,
  unlinkParent as unlinkParentInProject,
  unlinkPartner as unlinkPartnerInProject,
  type LinkKind,
} from '../models/person-utils';
import { buildLayout, collectMissingLayoutPositions } from '../layout';
import { addRecent, saveProjectToDb } from '../services/project-io/db';
import { saveProjectToHandle, saveProjectAs } from '../services/project-io/zip-project';
import { isExternalMediaUrl } from '../utils/media-url';
import {
  cloneMediaBlobs,
  cloneProject,
  createMediaUrls,
  HISTORY_DEBOUNCE_MS,
  type ProjectSnapshot,
  trimUndoStack,
} from './project-history';

type HistoryMode = 'debounced' | 'immediate' | 'skip';

interface ProjectState {
  project: Project | null;
  mode: AppMode;
  blobKey: string | null;
  fileHandle: FileSystemFileHandle | null;
  fileName: string | null;
  mediaBlobs: Map<string, Blob>;
  mediaUrls: Map<string, string>;
  dirty: boolean;
  selection: SelectionTarget;
  dossierPersonId: string | null;
  mediaViewerId: string | null;
  manualLayoutMode: boolean;
  undoStack: ProjectSnapshot[];
  redoStack: ProjectSnapshot[];

  newProject: (name?: string, edit?: boolean) => void;
  loadProject: (
    project: Project,
    blobKey: string,
    mediaBlobs?: Map<string, Blob>,
    mode?: AppMode,
    fileHandle?: FileSystemFileHandle | null,
    fileName?: string | null,
  ) => void;
  setMode: (mode: AppMode) => void;
  updateProject: (updater: (p: Project) => Project, options?: { history?: HistoryMode }) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => void;
  redo: () => void;
  captureProjectSnapshot: () => ProjectSnapshot | null;
  restoreProjectSnapshot: (snapshot: ProjectSnapshot) => void;
  setProjectName: (name: string) => void;
  setViewSettings: (settings: ViewSettings) => void;
  setCenter: (center: ProjectCenter) => void;
  setSelection: (selection: SelectionTarget) => void;
  openDossier: (personId: string) => void;
  closeDossier: () => void;
  openMediaViewer: (mediaId: string) => void;
  closeMediaViewer: () => void;
  setManualLayoutMode: (enabled: boolean) => void;

  addPerson: (person?: Partial<Person>) => Person;
  addPersonWithLink: (
    partial: Partial<Person> | undefined,
    link: { kind: LinkKind; personId: string; unionId?: string },
  ) => Person;
  updatePerson: (person: Person) => void;
  deletePerson: (personId: string) => void;
  addUnion: (union: Union) => void;
  updateUnion: (union: Union) => void;
  linkParent: (childId: string, parentId: string) => void;
  unlinkParent: (childId: string, parentId: string) => void;
  linkPartner: (personAId: string, personBId: string) => void;
  unlinkPartner: (personAId: string, personBId: string) => void;
  linkChild: (parentId: string, childId: string, unionId?: string) => void;
  unlinkChild: (unionId: string, childId: string) => void;
  placeNewPersonNear: (newPersonId: string, nearPersonId: string) => void;
  addMedia: (item: MediaItem, blob: Blob) => void;
  replaceMediaBlob: (filename: string, blob: Blob) => void;
  updateMedia: (item: MediaItem) => void;
  deleteMedia: (mediaId: string) => void;
  getMediaUrl: (filename: string) => string | undefined;
  autosave: () => Promise<void>;
  saveProject: () => Promise<boolean>;
  saveProjectAs: () => Promise<boolean>;
  setManualPosition: (personId: string, x: number, y: number) => void;
  clearManualPosition: (personId: string) => void;
  clearManualLayout: () => void;
  setManualEdgeRoute: (edgeId: string, points: { x: number; y: number }[]) => void;
  clearManualEdgeRoute: (edgeId: string) => void;
  clearManualEdgeRoutes: () => void;
  syncLayoutPositions: (personIds?: string[]) => void;
}

function layoutHistoryMode(get: () => ProjectState): HistoryMode {
  return get().manualLayoutMode ? 'skip' : 'immediate';
}
let historyMuted = false;
let lastHistoryPushAt = 0;
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

function createSnapshot(state: ProjectState): ProjectSnapshot {
  return {
    project: cloneProject(state.project!),
    mediaBlobs: cloneMediaBlobs(state.mediaBlobs),
    dossierPersonId: state.dossierPersonId,
    selection: state.selection,
  };
}

function sanitizeUiAfterRestore(snapshot: ProjectSnapshot): {
  dossierPersonId: string | null;
  selection: SelectionTarget;
  mediaViewerId: string | null;
} {
  const { project } = snapshot;
  let dossierPersonId = snapshot.dossierPersonId;
  if (dossierPersonId && !project.persons[dossierPersonId]) dossierPersonId = null;

  let selection = snapshot.selection;
  if (selection?.type === 'person' && !project.persons[selection.id]) selection = null;
  if (selection?.type === 'family' && !project.unions[selection.id]) selection = null;

  const mediaViewerId: string | null = null;
  return { dossierPersonId, selection, mediaViewerId };
}

function recordHistory(get: () => ProjectState, set: (partial: Partial<ProjectState>) => void, mode: HistoryMode) {
  if (mode === 'skip' || historyMuted || !get().project) return;
  if (mode === 'debounced') {
    const now = Date.now();
    if (now - lastHistoryPushAt < HISTORY_DEBOUNCE_MS) return;
    lastHistoryPushAt = now;
  } else {
    lastHistoryPushAt = Date.now();
  }

  const snapshot = createSnapshot(get());
  set({
    undoStack: trimUndoStack([...get().undoStack, snapshot]),
    redoStack: [],
  });
}

function applySnapshot(
  snapshot: ProjectSnapshot,
  get: () => ProjectState,
  set: (partial: Partial<ProjectState> | ((state: ProjectState) => Partial<ProjectState>)) => void,
) {
  revokeUrls(get().mediaUrls);
  const mediaBlobs = cloneMediaBlobs(snapshot.mediaBlobs);
  const mediaUrls = createMediaUrls(mediaBlobs);
  const ui = sanitizeUiAfterRestore(snapshot);

  set({
    project: cloneProject(snapshot.project),
    mediaBlobs,
    mediaUrls,
    dossierPersonId: ui.dossierPersonId,
    selection: ui.selection,
    mediaViewerId: ui.mediaViewerId,
    dirty: true,
  });
  scheduleAutosave(get);
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  mode: 'view',
  blobKey: null,
  fileHandle: null,
  fileName: null,
  mediaBlobs: new Map(),
  mediaUrls: new Map(),
  dirty: false,
  selection: null,
  dossierPersonId: null,
  mediaViewerId: null,
  manualLayoutMode: false,
  undoStack: [],
  redoStack: [],

  newProject: (name, edit = true) => {
    lastHistoryPushAt = 0;
    const project = createEmptyProject(name);
    const blobKey = createId();
    set({
      project,
      blobKey,
      fileHandle: null,
      fileName: null,
      mode: edit ? 'edit' : 'view',
      mediaBlobs: new Map(),
      mediaUrls: new Map(),
      dirty: true,
      selection: null,
      dossierPersonId: null,
      manualLayoutMode: false,
      undoStack: [],
      redoStack: [],
    });
    scheduleAutosave(get);
  },

  loadProject: (project, blobKey, mediaBlobs = new Map(), mode = 'view', fileHandle = null, fileName = null) => {
    const state = get();
    revokeUrls(state.mediaUrls);
    lastHistoryPushAt = 0;
    const mediaUrls = new Map<string, string>();
    for (const [filename, blob] of mediaBlobs) {
      mediaUrls.set(filename, URL.createObjectURL(blob));
    }
    const repaired = repairProjectRelationships(project);
    set({
      project: repaired,
      blobKey,
      fileHandle: fileHandle ?? null,
      fileName: fileName ?? (fileHandle ? project.meta.name + '.drevo' : null),
      mode,
      mediaBlobs,
      mediaUrls,
      dirty: false,
      selection: null,
      dossierPersonId: null,
      manualLayoutMode: false,
      undoStack: [],
      redoStack: [],
    });
    void addRecent({
      id: blobKey,
      name: project.meta.name,
      openedAt: new Date().toISOString(),
      blobKey,
    });
    void saveProjectToDb(blobKey, repaired);
  },

  setMode: (mode) => set({ mode }),

  updateProject: (updater, options) => {
    const current = get().project;
    if (!current) return;
    recordHistory(get, set, options?.history ?? 'debounced');
    set({ project: touchProjectMeta(updater(current)), dirty: true });
    scheduleAutosave(get);
  },

  canUndo: () => get().undoStack.length > 0,

  canRedo: () => get().redoStack.length > 0,

  undo: () => {
    const { undoStack, redoStack } = get();
    if (undoStack.length === 0) return;

    historyMuted = true;
    const current = createSnapshot(get());
    const snapshot = undoStack[undoStack.length - 1];
    applySnapshot(snapshot, get, set);
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: trimUndoStack([...redoStack, current]),
    });
    historyMuted = false;
  },

  redo: () => {
    const { undoStack, redoStack } = get();
    if (redoStack.length === 0) return;

    historyMuted = true;
    const current = createSnapshot(get());
    const snapshot = redoStack[redoStack.length - 1];
    applySnapshot(snapshot, get, set);
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: trimUndoStack([...undoStack, current]),
    });
    historyMuted = false;
  },

  captureProjectSnapshot: () => {
    const state = get();
    if (!state.project) return null;
    return createSnapshot(state);
  },

  restoreProjectSnapshot: (snapshot) => {
    historyMuted = true;
    applySnapshot(snapshot, get, set);
    historyMuted = false;
  },

  setProjectName: (name) => {
    get().updateProject((p) => ({ ...p, meta: { ...p.meta, name } }));
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
  setManualLayoutMode: (enabled) => {
    if (enabled && !get().manualLayoutMode) {
      recordHistory(get, set, 'immediate');
    }
    set({ manualLayoutMode: enabled });
  },

  addPerson: (partial) => {
    const person = createEmptyPerson(partial);
    get().updateProject(
      (p) => ({
        ...p,
        persons: { ...p.persons, [person.id]: person },
      }),
      { history: 'immediate' },
    );
    return person;
  },

  addPersonWithLink: (partial, link) => {
    const person = createEmptyPerson(partial);
    get().updateProject(
      (p) => {
        let next = { ...p, persons: { ...p.persons, [person.id]: person } };
        if (link.kind === 'parent') next = linkParentInProject(next, link.personId, person.id);
        else if (link.kind === 'partner') next = linkPartnerInProject(next, link.personId, person.id);
        else next = linkChildInProject(next, link.personId, person.id, link.unionId);
        return finalizeRelationshipChanges(next);
      },
      { history: 'immediate' },
    );
    get().setSelection({ type: 'person', id: person.id });
    get().syncLayoutPositions([person.id]);
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

    recordHistory(get, set, 'immediate');
    const nextProject = finalizeRelationshipChanges(removePersonFromProject(state.project, personId));
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

    get().updateProject(() => nextProject, { history: 'skip' });
  },

  addUnion: (union) => {
    get().updateProject((p) => ({ ...p, unions: { ...p.unions, [union.id]: union } }));
  },

  updateUnion: (union) => {
    get().updateProject((p) => ({ ...p, unions: { ...p.unions, [union.id]: union } }), {
      history: 'immediate',
    });
  },

  linkParent: (childId, parentId) => {
    get().updateProject(
      (p) => finalizeRelationshipChanges(linkParentInProject(p, childId, parentId)),
      { history: 'immediate' },
    );
  },

  unlinkParent: (childId, parentId) => {
    get().updateProject(
      (p) => finalizeRelationshipChanges(unlinkParentInProject(p, childId, parentId)),
      { history: 'immediate' },
    );
  },

  linkPartner: (personAId, personBId) => {
    get().updateProject(
      (p) => finalizeRelationshipChanges(linkPartnerInProject(p, personAId, personBId)),
      { history: 'immediate' },
    );
  },

  unlinkPartner: (personAId, personBId) => {
    get().updateProject(
      (p) => finalizeRelationshipChanges(unlinkPartnerInProject(p, personAId, personBId)),
      { history: 'immediate' },
    );
  },

  linkChild: (parentId, childId, unionId) => {
    get().updateProject(
      (p) => finalizeRelationshipChanges(linkChildInProject(p, parentId, childId, unionId)),
      { history: 'immediate' },
    );
  },

  unlinkChild: (unionId, childId) => {
    get().updateProject(
      (p) => finalizeRelationshipChanges(unlinkChildInProject(p, unionId, childId)),
      { history: 'immediate' },
    );
  },

  placeNewPersonNear: (newPersonId, nearPersonId) => {
    void nearPersonId;
    get().syncLayoutPositions([newPersonId]);
    get().setSelection({ type: 'person', id: newPersonId });
  },

  addMedia: (item, blob) => {
    recordHistory(get, set, 'immediate');
    const state = get();
    const mediaBlobs = new Map(state.mediaBlobs);
    const mediaUrls = new Map(state.mediaUrls);
    mediaBlobs.set(item.filename, blob);
    mediaUrls.set(item.filename, URL.createObjectURL(blob));
    get().updateProject(
      (p) => ({
        ...p,
        media: { ...p.media, [item.id]: item },
      }),
      { history: 'skip' },
    );
    set({ mediaBlobs, mediaUrls });
  },

  replaceMediaBlob: (filename, blob) => {
    recordHistory(get, set, 'immediate');
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
    recordHistory(get, set, 'immediate');
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
    get().updateProject((p) => removeMediaFromProject(p, mediaId), { history: 'skip' });
    set({ dirty: true, mediaViewerId: state.mediaViewerId === mediaId ? null : state.mediaViewerId });
    scheduleAutosave(get);
  },

  getMediaUrl: (filename) => {
    const state = get();
    if (isExternalMediaUrl(filename) && !state.project?.viewSettings.allowExternalMedia) {
      return undefined;
    }
    if (isExternalMediaUrl(filename)) return filename;
    return state.mediaUrls.get(filename);
  },

  autosave: async () => {
    const { project, blobKey } = get();
    if (!project || !blobKey) return;
    await saveProjectToDb(blobKey, project);
    set({ dirty: false });
  },

  saveProject: async () => {
    const { project, mediaBlobs, fileHandle, fileName } = get();
    if (!project) return false;
    if (fileHandle) {
      const ok = await saveProjectToHandle(project, mediaBlobs, fileHandle);
      if (ok) set({ dirty: false });
      return ok;
    }
    const result = await saveProjectAs(project, mediaBlobs, fileName ?? undefined);
    if (result) {
      set({ fileHandle: result.handle, fileName: result.name, dirty: false });
      return true;
    }
    return false;
  },

  saveProjectAs: async () => {
    const { project, mediaBlobs, fileName } = get();
    if (!project) return false;
    const result = await saveProjectAs(project, mediaBlobs, fileName ?? undefined);
    if (result) {
      set({ fileHandle: result.handle, fileName: result.name, dirty: false });
      return true;
    }
    return false;
  },

  setManualPosition: (personId, x, y) => {
    get().updateProject(
      (p) => ({
        ...p,
        manualLayout: { ...(p.manualLayout ?? {}), [personId]: { x, y } },
      }),
      { history: layoutHistoryMode(get) },
    );
  },

  clearManualPosition: (personId) => {
    get().updateProject(
      (p) => {
        if (!p.manualLayout?.[personId]) return p;
        const manualLayout = { ...p.manualLayout };
        delete manualLayout[personId];
        return {
          ...p,
          manualLayout: Object.keys(manualLayout).length > 0 ? manualLayout : undefined,
        };
      },
      { history: layoutHistoryMode(get) },
    );
  },

  clearManualLayout: () => {
    get().updateProject(
      (p) => ({ ...p, manualLayout: undefined, manualEdgeRoutes: undefined }),
      { history: layoutHistoryMode(get) },
    );
  },

  setManualEdgeRoute: (edgeId, points) => {
    get().updateProject(
      (p) => ({
        ...p,
        manualEdgeRoutes: { ...(p.manualEdgeRoutes ?? {}), [edgeId]: points.map((pt) => ({ ...pt })) },
      }),
      { history: layoutHistoryMode(get) },
    );
  },

  clearManualEdgeRoute: (edgeId) => {
    get().updateProject(
      (p) => {
        if (!p.manualEdgeRoutes?.[edgeId]) return p;
        const manualEdgeRoutes = { ...p.manualEdgeRoutes };
        delete manualEdgeRoutes[edgeId];
        return {
          ...p,
          manualEdgeRoutes: Object.keys(manualEdgeRoutes).length > 0 ? manualEdgeRoutes : undefined,
        };
      },
      { history: layoutHistoryMode(get) },
    );
  },

  clearManualEdgeRoutes: () => {
    get().updateProject(
      (p) => ({ ...p, manualEdgeRoutes: undefined }),
      { history: layoutHistoryMode(get) },
    );
  },

  syncLayoutPositions: (personIds) => {
    const project = get().project;
    if (!project) return;
    const layout = buildLayout(project);
    const patch = collectMissingLayoutPositions(project, layout, personIds);
    if (Object.keys(patch).length === 0) return;
    get().updateProject(
      (p) => ({
        ...p,
        manualLayout: { ...(p.manualLayout ?? {}), ...patch },
      }),
      { history: 'skip' },
    );
  },
}));

export { defaultViewSettings };
