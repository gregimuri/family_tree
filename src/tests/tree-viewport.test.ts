import { describe, it, expect } from 'vitest';
import { createEmptyProject } from '../models/defaults';
import { buildLayout } from '../layout';
import { getSymmetricTreeFrame } from '../layout/center-focus';
import {
  computeFitTransform,
  getTreeContentRect,
  TREE_CONTENT_PAD,
} from '../hooks/tree-viewport';

describe('tree viewport', () => {
  it('content rect covers layout bounds inside svg frame', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const frame = getSymmetricTreeFrame(project, layout, 80)!;
    const rect = getTreeContentRect(frame, layout);

    expect(rect.x).toBeLessThanOrEqual(frame.offsetX + layout.bounds.minX);
    expect(rect.y).toBeLessThanOrEqual(frame.offsetY + layout.bounds.minY);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(frame.offsetX + layout.bounds.maxX);
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(frame.offsetY + layout.bounds.maxY);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  it('content rect is smaller than full svg canvas', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const frame = getSymmetricTreeFrame(project, layout, 80)!;
    const rect = getTreeContentRect(frame, layout);

    expect(rect.width).toBeLessThan(frame.svgW);
    expect(rect.height).toBeLessThan(frame.svgH);
  });

  it('computeFitTransform centers content in viewport', () => {
    const rect = { x: 200, y: 100, width: 400, height: 300 };
    const transform = computeFitTransform({
      wrapperWidth: 1000,
      wrapperHeight: 800,
      contentRect: rect,
      padding: 1,
    })!;

    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const screenCenterX = transform.positionX + centerX * transform.scale;
    const screenCenterY = transform.positionY + centerY * transform.scale;

    expect(screenCenterX).toBeCloseTo(500, 0);
    expect(screenCenterY).toBeCloseTo(400, 0);
    expect(transform.scale).toBeGreaterThan(0);
  });

  it('computeFitTransform scales down large content', () => {
    const transform = computeFitTransform({
      wrapperWidth: 800,
      wrapperHeight: 600,
      contentRect: { x: 0, y: 0, width: 4000, height: 3000 },
    })!;

    expect(transform.scale).toBeLessThan(1);
  });

  it('uses padding around cards', () => {
    const project = createEmptyProject();
    const layout = buildLayout(project);
    const frame = getSymmetricTreeFrame(project, layout, 80)!;
    const tight = getTreeContentRect(frame, layout, 0);
    const padded = getTreeContentRect(frame, layout, TREE_CONTENT_PAD);

    expect(padded.width).toBeGreaterThan(tight.width);
    expect(padded.height).toBeGreaterThan(tight.height);
  });
});
