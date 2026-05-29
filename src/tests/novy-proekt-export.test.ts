import { describe, it, expect } from 'vitest';
import type { Project } from '../types';
import { buildLayout } from '../layout';
import { getSymmetricTreeFrame } from '../layout/center-focus';
import { getTreeSheetBounds } from '../layout/content-bounds';
import { LAYER_GAP } from '../layout/graph-builder';
import {
  computeExportViewport,
  configureSvgForExport,
  resolveExportResolution,
} from '../services/export/image-export';
import { CARD_H_TEXT } from '../layout/card-dimensions';
import { TREE_SHEET_PAD } from '../layout/tree-sheet';
import { repairProjectRelationships } from '../models/person-utils';
import projectJson from './fixtures/novy-proekt/project.json';

describe('novy-proekt export viewport', () => {
  it('viewport is roughly square, not an ultra-wide strip', () => {
    const project = repairProjectRelationships(projectJson as Project);
    const layout = buildLayout(project);
    const frame = getSymmetricTreeFrame(project, layout, TREE_SHEET_PAD)!;
    const sheet = getTreeSheetBounds(layout);
    const viewport = computeExportViewport(frame, layout);
    const resolution = resolveExportResolution({ format: 'png', sizeMode: 'tree', quality: 'high' }, viewport);

    const layers = layout.nodes.map((n) => n.layer);
    const spread = Math.max(...layers) - Math.min(...layers);
    const minH = spread * LAYER_GAP + CARD_H_TEXT;

    expect(sheet.maxY - sheet.minY).toBeGreaterThanOrEqual(minH - 1);
    expect(viewport.width / viewport.height).toBeGreaterThan(0.5);
    expect(viewport.width / viewport.height).toBeLessThan(2.15);
    expect(resolution.widthPx / resolution.heightPx).toBeGreaterThan(0.5);
    expect(resolution.widthPx / resolution.heightPx).toBeLessThan(2.15);
  });

  it('export SVG background matches viewport crop', () => {
    const project = repairProjectRelationships(projectJson as Project);
    const layout = buildLayout(project);
    const frame = getSymmetricTreeFrame(project, layout, TREE_SHEET_PAD)!;
    const viewport = computeExportViewport(frame, layout);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    svg.appendChild(rect);

    configureSvgForExport(svg, viewport, 1200, 1200);

    expect(svg.getAttribute('viewBox')).toBe(
      `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`,
    );
    expect(rect.getAttribute('width')).toBe(String(viewport.width));
    expect(rect.getAttribute('height')).toBe(String(viewport.height));
  });
});
