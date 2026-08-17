import type { RuntimeState } from '../runtime/types';
import type { RuntimeRepository } from './RuntimeRepository';

export const LEGACY_RUNTIME_STORAGE_KEY = 'sorry-im-a-cop-v2-runtime';

export class LocalStorageRuntimeRepository implements RuntimeRepository {
  constructor(private readonly key = LEGACY_RUNTIME_STORAGE_KEY) {}

  async load(): Promise<RuntimeState | null> {
    const raw = localStorage.getItem(this.key);
    if (!raw) return null;
    return JSON.parse(raw) as RuntimeState;
  }

  async save(state: RuntimeState): Promise<void> {
    localStorage.setItem(this.key, JSON.stringify(state));
  }

  async clear(): Promise<void> {
    localStorage.removeItem(this.key);
  }
}
