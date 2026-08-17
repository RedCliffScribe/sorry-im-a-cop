export type JudgementRecoveryStage =
  | 'preflight_parse'
  | 'evidence_validation'
  | 'raw_parse'
  | 'local_normalization'
  | 'structure_repair'
  | 'local_settlement'
  | 'narrative_correction'
  | 'final_validation';

export interface JudgementRecoveryStageRecord {
  stage: JudgementRecoveryStage;
  status: 'skipped' | 'succeeded' | 'failed';
  occurredAt: string;
  detail: string;
  paths?: string[];
}

export interface JudgementRecoveryTrace {
  requestId: string;
  turnId: string;
  startedAt: string;
  finishedAt?: string;
  terminalStatus?: 'running' | 'persisted' | 'failed' | 'aborted';
  terminalError?: string;
  presetRoll: number;
  persisted: boolean;
  rawPreflight?: unknown;
  rawPreflightAttempts?: unknown[];
  rawJudgementPatches: unknown[];
  stages: JudgementRecoveryStageRecord[];
}
