import { describe, it, expect } from 'vitest';
import { computeNuclearTreeLayout, type LayoutPerson } from '../layout/nuclear-tree-layout';

function pos(layout: ReturnType<typeof computeNuclearTreeLayout>, id: string) {
  const p = layout.positions.get(id);
  expect(p).toBeTruthy();
  return p!;
}

function noBoxOverlap(layout: ReturnType<typeof computeNuclearTreeLayout>, nodeWidth = 120, nodeHeight = 60): void {
  const entries = [...layout.positions.entries()];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [idA, a] = entries[i];
      const [idB, b] = entries[j];
      const overlapX = Math.abs(a.x - b.x) < nodeWidth;
      const overlapY = Math.abs(a.y - b.y) < nodeHeight;
      if (overlapX && overlapY) {
        expect.fail(`Nodes ${idA} and ${idB} overlap`);
      }
    }
  }
}

describe('computeNuclearTreeLayout (nuclear tree)', () => {
  it('places couple above centered child', () => {
    const persons: LayoutPerson[] = [
      { id: 'f', name: 'Father', fatherId: null, motherId: null, spouseIds: ['m'] },
      { id: 'm', name: 'Mother', fatherId: null, motherId: null, spouseIds: ['f'] },
      { id: 'c', name: 'Child', fatherId: 'f', motherId: 'm', spouseIds: [] },
    ];
    const layout = computeNuclearTreeLayout(persons, 'f');
    const f = pos(layout, 'f');
    const m = pos(layout, 'm');
    const c = pos(layout, 'c');

    expect(f.y).toBe(m.y);
    expect(c.y).toBeGreaterThan(f.y);
    expect(c.x).toBeCloseTo((f.x + m.x) / 2, 0);
    noBoxOverlap(layout);
  });

  it('places siblings side by side without overlap', () => {
    const persons: LayoutPerson[] = [
      { id: 'f', name: 'F', fatherId: null, motherId: null, spouseIds: ['m'] },
      { id: 'm', name: 'M', fatherId: null, motherId: null, spouseIds: ['f'] },
      { id: 'c1', name: 'C1', fatherId: 'f', motherId: 'm', spouseIds: [] },
      { id: 'c2', name: 'C2', fatherId: 'f', motherId: 'm', spouseIds: [] },
    ];
    const layout = computeNuclearTreeLayout(persons, 'f');
    const c1 = pos(layout, 'c1');
    const c2 = pos(layout, 'c2');

    expect(c1.y).toBe(c2.y);
    expect(Math.abs(c1.x - c2.x)).toBeGreaterThan(100);
    noBoxOverlap(layout);
  });

  it('handles single known parent', () => {
    const persons: LayoutPerson[] = [
      { id: 'm', name: 'Mother', fatherId: null, motherId: null, spouseIds: [] },
      { id: 'c', name: 'Child', fatherId: null, motherId: 'm', spouseIds: [] },
    ];
    const layout = computeNuclearTreeLayout(persons, 'm');
    const m = pos(layout, 'm');
    const c = pos(layout, 'c');

    expect(c.y).toBeGreaterThan(m.y);
    expect(c.x).toBeCloseTo(m.x, 0);
  });

  it('lays out multiple marriages horizontally', () => {
    const persons: LayoutPerson[] = [
      { id: 'p', name: 'Peter', fatherId: null, motherId: null, spouseIds: ['a', 'b'] },
      { id: 'a', name: 'Anna', fatherId: null, motherId: null, spouseIds: ['p'] },
      { id: 'b', name: 'Bella', fatherId: null, motherId: null, spouseIds: ['p'] },
      { id: 'c1', name: 'Child1', fatherId: 'p', motherId: 'a', spouseIds: [] },
      { id: 'c2', name: 'Child2', fatherId: 'p', motherId: 'b', spouseIds: [] },
    ];
    const layout = computeNuclearTreeLayout(persons, 'p');
    const a = pos(layout, 'a');
    const b = pos(layout, 'b');
    const c1 = pos(layout, 'c1');
    const c2 = pos(layout, 'c2');

    expect(c1.y).toBe(c2.y);
    expect(Math.abs(c1.x - c2.x)).toBeGreaterThan(100);
    expect(a.y).toBe(b.y);
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(100);
    noBoxOverlap(layout);
  });

  it('returns spouse and parent-child edges', () => {
    const persons: LayoutPerson[] = [
      { id: 'f', name: 'F', fatherId: null, motherId: null, spouseIds: ['m'] },
      { id: 'm', name: 'M', fatherId: null, motherId: null, spouseIds: ['f'] },
      { id: 'c', name: 'C', fatherId: 'f', motherId: 'm', spouseIds: [] },
    ];
    const layout = computeNuclearTreeLayout(persons, 'f');
    expect(layout.edges.some((e) => e.type === 'spouse' && e.from === 'f' && e.to === 'm')).toBe(true);
    expect(layout.edges.filter((e) => e.type === 'parent-child' && e.to === 'c')).toHaveLength(2);
  });

  it('does not mutate input', () => {
    const persons: LayoutPerson[] = [
      { id: 'r', name: 'Root', fatherId: null, motherId: null, spouseIds: [] },
    ];
    const copy = structuredClone(persons);
    computeNuclearTreeLayout(persons, 'r');
    expect(persons).toEqual(copy);
  });

  it('respects custom gaps and node size', () => {
    const persons: LayoutPerson[] = [
      { id: 'f', name: 'F', fatherId: null, motherId: null, spouseIds: ['m'] },
      { id: 'm', name: 'M', fatherId: null, motherId: null, spouseIds: ['f'] },
      { id: 'c', name: 'C', fatherId: 'f', motherId: 'm', spouseIds: [] },
    ];
    const tight = computeNuclearTreeLayout(persons, 'f', { verticalGap: 40, nodeHeight: 40 });
    const loose = computeNuclearTreeLayout(persons, 'f', { verticalGap: 200, nodeHeight: 40 });
    expect(pos(loose, 'c').y - pos(loose, 'f').y).toBeGreaterThan(pos(tight, 'c').y - pos(tight, 'f').y);
  });

  it('returns empty layout for unknown root', () => {
    const layout = computeNuclearTreeLayout([], 'missing');
    expect(layout.positions.size).toBe(0);
    expect(layout.edges).toEqual([]);
  });
});
