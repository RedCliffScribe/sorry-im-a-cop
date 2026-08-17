import type {
  CustomCharacterDraft,
  CustomCharacterGenerationDiagnostics,
  CustomCharacterGenerationIssue,
  CustomCharacterGenerationRecovery
} from './characterCreation';
import type { CustomContentWorldDeployment } from './worldAdaptation';

export interface CustomCharacterWorkingDraftRecord {
  workingDraftId: string;
  sourceCharacterAssetId?: string;
  description: string;
  draft: CustomCharacterDraft;
  deployments: CustomContentWorldDeployment[];
  global: boolean;
  projectIds: string[];
  generationIssues: CustomCharacterGenerationIssue[];
  generationRecovery?: CustomCharacterGenerationRecovery;
  generationDiagnostics?: CustomCharacterGenerationDiagnostics;
  createdAt: string;
  updatedAt: string;
}
