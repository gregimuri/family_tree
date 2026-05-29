import JSZip from 'jszip';
import type { MediaItem, Project } from '../../types';
import { PROJECT_VERSION } from '../../models/defaults';

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
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function zipToProject(
  file: Blob,
): Promise<{ project: Project; mediaBlobs: Map<string, Blob> }> {
  const zip = await JSZip.loadAsync(file);
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

export async function saveProjectFile(
  project: Project,
  mediaBlobs: Map<string, Blob>,
  suggestedName?: string,
): Promise<void> {
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
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  downloadBlob(blob, name);
}

export async function openProjectFile(): Promise<{ file: File; project: Project; mediaBlobs: Map<string, Blob> } | null> {
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
      const { project, mediaBlobs } = await zipToProject(file);
      return { file, project, mediaBlobs };
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
      const { project, mediaBlobs } = await zipToProject(file);
      resolve({ file, project, mediaBlobs });
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
