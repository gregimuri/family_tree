import JSZip from 'jszip';
import type { MediaItem, Project } from '../../types';
import { PROJECT_VERSION } from '../../models/defaults';
import { isZipLoadError, loadProjectFromDamagedZip, verifyZipBlob } from './zip-recovery';

const PROJECT_JSON = 'project.json';
const MEDIA_DIR = 'media/';

export async function projectToZip(project: Project, mediaBlobs?: Map<string, Blob>): Promise<Blob> {
  const zip = new JSZip();
  zip.file(PROJECT_JSON, JSON.stringify(project, null, 2));
  const mediaFolder = zip.folder('media');
  if (mediaFolder && mediaBlobs) {
    for (const [filename, blob] of mediaBlobs) {
      mediaFolder.file(filename, blob);
    }
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  await verifyZipBlob(blob);
  return blob;
}

export async function zipToProject(
  file: Blob,
): Promise<{ project: Project; mediaBlobs: Map<string, Blob>; recovered?: boolean }> {
  try {
    const zip = await JSZip.loadAsync(file);
    const result = await readProjectFromZip(zip);
    return { ...result, recovered: false };
  } catch (error) {
    if (!isZipLoadError(error)) throw error;
    const result = await loadProjectFromDamagedZip(file);
    return { ...result, recovered: true };
  }
}

async function readProjectFromZip(
  zip: JSZip,
): Promise<{ project: Project; mediaBlobs: Map<string, Blob> }> {
  const jsonFile = zip.file(PROJECT_JSON);
  if (!jsonFile) throw new Error('Неверный формат проекта: отсутствует project.json');
  const text = await jsonFile.async('text');
  const project = JSON.parse(text) as Project;
  if (!project.version) project.version = PROJECT_VERSION;

  const mediaBlobs = new Map<string, Blob>();
  const mediaFolder = zip.folder('media');
  if (mediaFolder) {
    await Promise.all(
      Object.values(project.media).map(async (item: MediaItem) => {
        const f = zip.file(`${MEDIA_DIR}${item.filename}`);
        if (f) {
          mediaBlobs.set(item.filename, await f.async('blob'));
        }
      }),
    );
  }
  return { project, mediaBlobs };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function saveProjectToHandle(
  project: Project,
  mediaBlobs: Map<string, Blob>,
  handle: FileSystemFileHandle,
): Promise<boolean> {
  try {
    const blob = await projectToZip(project, mediaBlobs);
    const writable = await handle.createWritable({ keepExistingData: false });
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (e) {
    if ((e as Error).name === 'AbortError') return false;
    throw e;
  }
}

export interface SaveAsResult {
  handle: FileSystemFileHandle | null;
  name: string;
}

export async function saveProjectAs(
  project: Project,
  mediaBlobs: Map<string, Blob>,
  suggestedName?: string,
): Promise<SaveAsResult | null> {
  const blob = await projectToZip(project, mediaBlobs);
  const name = suggestedName ?? `${project.meta.name || 'project'}.drevo`;

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: 'Проект Генеалогическое древо',
            accept: { 'application/zip': ['.drevo', '.zip'] },
          },
        ],
      });
      const writable = await handle.createWritable({ keepExistingData: false });
      await writable.write(blob);
      await writable.close();
      const savedName = (await handle.getFile()).name;
      return { handle, name: savedName };
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
    }
  }
  downloadBlob(blob, name);
  return { handle: null, name };
}

/** @deprecated use saveProject / saveProjectAs from store */
export async function saveProjectFile(
  project: Project,
  mediaBlobs: Map<string, Blob>,
  suggestedName?: string,
): Promise<void> {
  await saveProjectAs(project, mediaBlobs, suggestedName);
}

export interface OpenProjectResult {
  file: File;
  project: Project;
  mediaBlobs: Map<string, Blob>;
  handle: FileSystemFileHandle | null;
  recovered?: boolean;
}

export async function openProjectFile(): Promise<OpenProjectResult | null> {
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'Проект Генеалогическое древо',
            accept: { 'application/zip': ['.drevo', '.zip'] },
          },
        ],
        multiple: false,
      });
      const file = await handle.getFile();
      const { project, mediaBlobs, recovered } = await zipToProject(file);
      return { file, project, mediaBlobs, handle, recovered };
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.drevo,.zip';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const { project, mediaBlobs, recovered } = await zipToProject(file);
      resolve({ file, project, mediaBlobs, handle: null, recovered });
    };
    input.click();
  });
}

declare global {
  interface Window {
    showSaveFilePicker(options?: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
    }): Promise<FileSystemFileHandle>;
    showOpenFilePicker(options?: {
      types?: { description: string; accept: Record<string, string[]> }[];
      multiple?: boolean;
    }): Promise<FileSystemFileHandle[]>;
  }
}
