import type { RuntimeState } from '../runtime/types';
import type { RuntimeRepository } from './RuntimeRepository';

export class LocalStorageRuntimeRepository implements RuntimeRepository {
  constructor(private readonly key = 'sorry-im-a-cop-v2-runtime') {}

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
