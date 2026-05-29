import Dexie, { type Table } from 'dexie';
import type { Project, RecentProject } from '../../types';

export interface StoredProject {
  blobKey: string;
  name: string;
  data: Project;
  savedAt: string;
}

class DrevoDatabase extends Dexie {
  projects!: Table<StoredProject, string>;
  recents!: Table<RecentProject, string>;

  constructor() {
    super('drevo');
    this.version(1).stores({
      projects: 'blobKey, name, savedAt',
      recents: 'id, openedAt',
    });
  }
}

export const db = new DrevoDatabase();

export async function saveProjectToDb(blobKey: string, project: Project): Promise<void> {
  await db.projects.put({
    blobKey,
    name: project.meta.name,
    data: project,
    savedAt: new Date().toISOString(),
  });
}

export async function loadProjectFromDb(blobKey: string): Promise<Project | null> {
  const row = await db.projects.get(blobKey);
  return row?.data ?? null;
}

export async function addRecent(recent: RecentProject): Promise<void> {
  await db.recents.put(recent);
  const all = await db.recents.orderBy('openedAt').reverse().toArray();
  if (all.length > 5) {
    await db.recents.bulkDelete(all.slice(5).map((r) => r.id));
  }
}

export async function getRecents(): Promise<RecentProject[]> {
  return db.recents.orderBy('openedAt').reverse().limit(5).toArray();
}
