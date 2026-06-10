export class ExportAbortedError extends Error {
  constructor() {
    super('Экспорт отменён');
    this.name = 'ExportAbortedError';
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportAbortedError();
}
