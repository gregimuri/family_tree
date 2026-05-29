import { describe, it, expect } from 'vitest';
import {
  getWheelPanDelta,
  shouldRemapShiftWheel,
  isZoomWheel,
} from '../hooks/tree-wheel';

function wheel(partial: Partial<WheelEvent>): WheelEvent {
  return {
    deltaX: 0,
    deltaY: 0,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    ...partial,
  } as WheelEvent;
}

describe('tree wheel', () => {
  it('vertical scroll pans vertically', () => {
    const d = getWheelPanDelta(wheel({ deltaY: 100 }));
    expect(d.dx).toEqual(0);
    expect(d.dy).toBe(-100);
  });

  it('shift+wheel pans horizontally via deltaX', () => {
    const d = getWheelPanDelta(wheel({ shiftKey: true, deltaX: 50, deltaY: 0 }));
    expect(d).toEqual({ dx: -50, dy: 0 });
  });

  it('shift+wheel remaps deltaY to horizontal', () => {
    const e = wheel({ shiftKey: true, deltaY: 80, deltaX: 0 });
    expect(shouldRemapShiftWheel(e)).toBe(true);
    expect(getWheelPanDelta(e)).toEqual({ dx: -80, dy: 0 });
  });

  it('ctrl+wheel is zoom not pan', () => {
    expect(isZoomWheel(wheel({ ctrlKey: true, deltaY: 100 }))).toBe(true);
    expect(getWheelPanDelta(wheel({ ctrlKey: true, deltaY: 100 }))).toEqual({ dx: 0, dy: 0 });
  });
});
