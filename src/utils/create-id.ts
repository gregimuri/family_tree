import { v4 as uuidv4 } from 'uuid';

function uuidV4Fallback(): string {
  // Pass options so uuid does not delegate back to crypto.randomUUID.
  return uuidv4({});
}

/** UUID that works over HTTP on LAN (crypto.randomUUID needs a secure context). */
export function createId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === 'function') {
    try {
      return randomUuid.call(globalThis.crypto);
    } catch {
      // Native API may refuse to run outside a secure context.
    }
  }
  return uuidV4Fallback();
}
