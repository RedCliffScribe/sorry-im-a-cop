import type { RuntimeState } from '../runtime/types';

export interface RuntimeRepository {
  load(): Promise<RuntimeState | null>;
  save(state: RuntimeState): Promise<void>;
  clear(): Promise<void>;
}
