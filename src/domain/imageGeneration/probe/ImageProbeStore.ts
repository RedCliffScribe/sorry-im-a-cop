import type { ImageApiProfileId, ImageProbeArtifact, ImageProbeOutcome } from './types';
import type { ImageGenerationVerificationRecord } from './types';

export interface ImageProbeStore {
  saveOutcome(outcome: ImageProbeOutcome): Promise<void>;
  listRecords(profileId: ImageApiProfileId): Promise<ImageGenerationVerificationRecord[]>;
  getLatestArtifact(profileId: ImageApiProfileId): Promise<ImageProbeArtifact | null>;
  clearProfile(profileId: ImageApiProfileId): Promise<void>;
  clearAll(): Promise<void>;
}
