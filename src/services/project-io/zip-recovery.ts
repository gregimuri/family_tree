import type { MediaItem, Project } from '../../types';
import { PROJECT_VERSION } from '../../models/defaults';

const LOCAL_FILE_HEADER = 0x04034b50;
const PROJECT_JSON = 'project.json';
const MEDIA_DIR = 'media/';

interface ZipLocalEntry {
  name: string;
  compression: number;
  compressedSize: number;
  dataOffset: number;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0;
}

/** Parses local ZIP headers when central directory is missing (truncated save). */
export function parseZipLocalEntries(bytes: Uint8Array): ZipLocalEntry[] {
  const entries: ZipLocalEntry[] = [];
  let pos = 0;

  while (pos + 30 <= bytes.length) {
    if (readUint32(bytes, pos) !== LOCAL_FILE_HEADER) {
      pos += 1;
      continue;
    }

    const compression = readUint16(bytes, pos + 8);
    const compressedSize = readUint32(bytes, pos + 18);
    const nameLength = readUint16(bytes, pos + 26);
    const extraLength = readUint16(bytes, pos + 28);
    const nameStart = pos + 30;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.length) break;

    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameEnd));
    const dataOffset = nameEnd + extraLength;
    const dataEnd = dataOffset + compressedSize;
    if (dataEnd > bytes.length) break;

    entries.push({
      name,
      compression,
      compressedSize,
      dataOffset,
    });

    pos = dataEnd;
  }

  return entries;
}

async function readBlobBytes(file: Blob): Promise<Uint8Array> {
  const raw: unknown = file;
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    return new Uint8Array(raw as Buffer);
  }
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer());
  }
  return new Uint8Array(await new Response(file as BodyInit).arrayBuffer());
}

async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  const canUseWebStreams =
    typeof DecompressionStream !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof Blob.prototype.stream === 'function';

  if (canUseWebStreams) {
    const copy = compressed.slice();
    const stream = new Blob([copy as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  }

  if (typeof process !== 'undefined' && process.versions?.node) {
    const { promisify } = await import('node:util');
    const { inflateRaw: nodeInflateRaw } = await import('node:zlib');
    const inflated = await promisify(nodeInflateRaw)(Buffer.from(compressed));
    return new Uint8Array(inflated);
  }

  throw new Error('Не удалось распаковать повреждённый архив: нет поддержки распаковки.');
}

async function extractEntryData(bytes: Uint8Array, entry: ZipLocalEntry): Promise<Uint8Array> {
  const slice = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (entry.compression === 0) return slice;
  if (entry.compression === 8) return inflateRaw(slice);
  throw new Error(`Неподдерживаемый метод сжатия ZIP: ${entry.compression}`);
}

export function loadProjectFromDamagedZipBytes(
  bytes: Uint8Array,
): Promise<{ project: Project; mediaBlobs: Map<string, Blob> }> {
  return loadProjectFromBytes(bytes);
}

async function loadProjectFromBytes(
  bytes: Uint8Array,
): Promise<{ project: Project; mediaBlobs: Map<string, Blob> }> {
  const entries = parseZipLocalEntries(bytes);
  if (entries.length === 0) {
    throw new Error('Не удалось прочитать архив проекта: файл повреждён или пуст.');
  }

  const projectEntry = entries.find((entry) => entry.name === PROJECT_JSON);
  if (!projectEntry) {
    throw new Error('Неверный формат проекта: отсутствует project.json');
  }

  const projectBytes = await extractEntryData(bytes, projectEntry);
  const project = JSON.parse(new TextDecoder().decode(projectBytes)) as Project;
  if (!project.version) project.version = PROJECT_VERSION;

  const mediaBlobs = new Map<string, Blob>();
  await Promise.all(
    Object.values(project.media).map(async (item: MediaItem) => {
      const entry = entries.find((e) => e.name === `${MEDIA_DIR}${item.filename}`);
      if (!entry) return;
      const data = await extractEntryData(bytes, entry);
      mediaBlobs.set(item.filename, new Blob([data.slice() as BlobPart]));
    }),
  );

  return { project, mediaBlobs };
}

export async function loadProjectFromDamagedZip(
  file: Blob,
): Promise<{ project: Project; mediaBlobs: Map<string, Blob> }> {
  const bytes = await readBlobBytes(file);
  return loadProjectFromBytes(bytes);
}

export async function verifyZipBlob(blob: Blob): Promise<void> {
  const JSZip = (await import('jszip')).default;
  await JSZip.loadAsync(blob);
}

export function isZipLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('corrupted zip') ||
    message.includes("can't find end of central directory") ||
    message.includes('end of central directory')
  );
}
