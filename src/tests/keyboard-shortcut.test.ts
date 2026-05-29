import { describe, it, expect } from 'vitest';
import { isModifierShortcut, isPhysicalKey } from '../utils/keyboard-shortcut';

describe('keyboard shortcuts', () => {
  it('matches physical key regardless of layout character', () => {
    const event = {
      code: 'KeyZ',
      key: 'я',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    } as KeyboardEvent;

    expect(isModifierShortcut(event)).toBe(true);
    expect(isPhysicalKey(event, 'KeyZ')).toBe(true);
  });
});
