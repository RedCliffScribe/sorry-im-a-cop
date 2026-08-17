import type {
  OpeningSessionDraft,
  OpeningSessionStage
} from './openingSessionDraft';

export interface OpeningSessionSummary {
  openingSessionId: string;
  setupHash: string;
  worldpackId: string;
  stage: OpeningSessionStage;
  createdAt: string;
  updatedAt: string;
}

export interface OpeningSessionRepository {
  list(): Promise<OpeningSessionSummary[]>;
  load(openingSessionId: string): Promise<OpeningSessionDraft | null>;
  findLatestResumable(setupHash: string): Promise<OpeningSessionDraft | null>;
  save(draft: OpeningSessionDraft): Promise<void>;
  delete(openingSessionId: string): Promise<void>;
  clearAll(): Promise<void>;
}
