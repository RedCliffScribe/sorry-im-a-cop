import {
  imageGenerationPresetSchema,
  type ImageGenerationPreset
} from '../generationPresets';
import type { PngStyleParameterDraft } from './types';

export interface AppliedPngParameterDraft {
  preset: ImageGenerationPreset;
  appliedFields: string[];
  skippedFields: string[];
}

export function applyPngParameterDraftToGenerationPreset(
  preset: ImageGenerationPreset,
  draft: PngStyleParameterDraft
): AppliedPngParameterDraft {
  const next = structuredClone(preset);
  const appliedFields: string[] = [];
  const skippedFields: string[] = [];
  const parameters = next.generationParameters;
  if (parameters.providerType === 'novelai-image') {
    if (draft.sampler) {
      parameters.sampler = draft.sampler;
      appliedFields.push('sampler');
    }
    if (draft.steps !== undefined && draft.steps <= 200) {
      parameters.steps = draft.steps;
      appliedFields.push('steps');
    } else if (draft.steps !== undefined) {
      skippedFields.push('steps');
    }
    if (draft.cfg !== undefined && draft.cfg <= 100) {
      parameters.guidanceScale = draft.cfg;
      appliedFields.push('cfg');
    } else if (draft.cfg !== undefined) {
      skippedFields.push('cfg');
    }
    if (draft.clipSkip !== undefined) skippedFields.push('clipSkip');
  } else if (parameters.providerType === 'sd-webui') {
    if (draft.sampler) {
      parameters.samplerName = draft.sampler;
      appliedFields.push('sampler');
    }
    if (draft.steps !== undefined) {
      parameters.steps = draft.steps;
      appliedFields.push('steps');
    }
    if (draft.cfg !== undefined) {
      parameters.cfgScale = draft.cfg;
      appliedFields.push('cfg');
    }
    if (draft.clipSkip !== undefined) {
      parameters.clipSkip = draft.clipSkip;
      appliedFields.push('clipSkip');
    }
  } else if (parameters.providerType === 'comfyui-workflow') {
    if (draft.sampler) {
      parameters.overrides.sampler = draft.sampler;
      appliedFields.push('sampler');
    }
    if (draft.steps !== undefined) {
      parameters.overrides.steps = draft.steps;
      appliedFields.push('steps');
    }
    if (draft.cfg !== undefined) {
      parameters.overrides.cfg = draft.cfg;
      appliedFields.push('cfg');
    }
    if (draft.clipSkip !== undefined) skippedFields.push('clipSkip');
  } else {
    for (const key of ['sampler', 'steps', 'cfg', 'clipSkip'] as const) {
      if (draft[key] !== undefined) skippedFields.push(key);
    }
  }
  return {
    preset: imageGenerationPresetSchema.parse(next),
    appliedFields,
    skippedFields
  };
}
