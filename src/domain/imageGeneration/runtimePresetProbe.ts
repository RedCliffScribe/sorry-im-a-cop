import type { CharacterVisualPurpose } from './promptConversion';
import { createBuiltInCharacterDraftExecutionConfig } from './characterVisualWorkflow';
import { createImageGenerationProbeTarget } from './generationTarget';
import { createBuiltInSceneDraftExecutionConfig } from './sceneVisualWorkflow';
import {
  prepareImageGenerationProbe,
  type ComfyWorkflowTemplate,
  type ImageApiCredential,
  type ImageApiProfile,
  type PreparedImageGenerationProbe
} from './profile';
import type { ImageGenerationPreset } from './generationPresets';

export type RuntimeImagePreset =
  | { kind: 'character'; purpose: CharacterVisualPurpose }
  | { kind: 'scene' };

export async function prepareRuntimePresetProbe(input: {
  profile: ImageApiProfile;
  credential?: ImageApiCredential;
  workflow?: ComfyWorkflowTemplate;
  preset: RuntimeImagePreset;
  generationPreset?: ImageGenerationPreset;
  pageUrl?: string;
}): Promise<PreparedImageGenerationProbe> {
  const credentialSummary = input.credential
    ? { credentialId: input.credential.credentialId, revision: input.credential.revision }
    : undefined;
  const execution = input.preset.kind === 'character'
    ? await createBuiltInCharacterDraftExecutionConfig({
      profile: input.profile,
      purpose: input.preset.purpose,
      credential: credentialSummary,
      workflow: input.workflow,
      preset: input.generationPreset
    })
    : await createBuiltInSceneDraftExecutionConfig({
      profile: input.profile,
      credential: credentialSummary,
      workflow: input.workflow,
      preset: input.generationPreset
    });
  const prepared = await prepareImageGenerationProbe(
    input.profile,
    input.credential,
    createImageGenerationProbeTarget(execution, { workflow: input.workflow }),
    input.pageUrl
  );
  return { ...prepared, executionFingerprint: execution.executionFingerprint };
}
