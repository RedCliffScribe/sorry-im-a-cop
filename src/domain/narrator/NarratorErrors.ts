import type { NarratorAttemptRecord } from './NarratorClient';

export class NarratorAttemptError extends Error {
  readonly attempt: NarratorAttemptRecord;

  constructor(message: string, attempt: NarratorAttemptRecord) {
    super(message);
    this.name = 'NarratorAttemptError';
    this.attempt = attempt;
  }
}

export class NarratorTruncatedError extends NarratorAttemptError {
  constructor(attempt: NarratorAttemptRecord) {
    super(
      `输出长度不足，JSON 被截断（最大输出 ${attempt.requestedMaxTokens ?? '未指定'} tokens）。`,
      attempt
    );
    this.name = 'NarratorTruncatedError';
  }
}
