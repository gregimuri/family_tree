/** Ctrl/Cmd по физической клавише (не зависит от раскладки). */
export function isModifierShortcut(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

export function isPhysicalKey(event: KeyboardEvent, code: string): boolean {
  return event.code === code;
}
