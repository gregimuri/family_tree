import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLayout } from '../layout';
import { projectToZip, zipToProject } from '../services/project-io/zip-project';
import { createEmptyProject } from '../models/defaults';
import { loadProjectFromDamagedZipBytes, parseZipLocalEntries } from '../services/project-io/zip-recovery';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');
const shevchenkoPath = path.join(fixturesDir, 'Shevchenko-Vtelinskie.drevo');
const titkovyPath = 'c:/Users/Gregor/Downloads/Titkovy_6.drevo';

describe('zip project recovery', () => {
  it('validates generated zip before returning', async () => {
    const project = createEmptyProject();
    const blob = await projectToZip(project, new Map());
    const loaded = await zipToProject(blob);
    expect(loaded.project.meta.name).toBe(project.meta.name);
  });

  it('loads truncated zip when central directory is missing', async () => {
    if (!fs.existsSync(shevchenkoPath)) return;
    const bytes = new Uint8Array(fs.readFileSync(shevchenkoPath));
    const truncated = bytes.slice(0, bytes.length - 22);
    const loaded = await loadProjectFromDamagedZipBytes(truncated);
    expect(Object.keys(loaded.project.persons).length).toBeGreaterThan(10);
  });

  it('loads Shevchenko sample project and builds layout', async () => {
    if (!fs.existsSync(shevchenkoPath)) return;
    const file = new Blob([fs.readFileSync(shevchenkoPath)]);
    const { project } = await zipToProject(file);
    expect(Object.keys(project.persons).length).toBeGreaterThan(10);
    const layout = buildLayout(project);
    expect(layout.nodes.length).toBeGreaterThan(10);
    expect(layout.edges.length).toBeGreaterThan(0);
  });

  it('recovers damaged Titkovy project from local zip headers', async () => {
    if (!fs.existsSync(titkovyPath)) return;
    const bytes = new Uint8Array(fs.readFileSync(titkovyPath));
    expect(parseZipLocalEntries(bytes).length).toBeGreaterThan(0);
    const { project } = await loadProjectFromDamagedZipBytes(bytes);
    expect(Object.keys(project.persons).length).toBe(86);
    const layout = buildLayout(project);
    expect(layout.nodes.length).toBeGreaterThan(50);
  }, 15_000);
});
