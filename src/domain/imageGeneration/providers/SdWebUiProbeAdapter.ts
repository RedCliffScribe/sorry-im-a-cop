import type {
  ImageGenerationProbeAdapter,
  ImageProbeGenerationInput
} from '../probe';
import {
  mergeValidationIssues,
  proxyAuthorizationHeaders,
  proxyCredentialSecrets,
  validateProxyMode
} from './adapterSupport';
import {
  proxyCredentialSchema,
  sdWebUiProbeProfileSchema,
  validateProbeInput,
  type ProxyCredential,
  type SdWebUiProbeProfile
} from './providerSchemas';
import {
  parseProviderRequest,
  parseProviderResponse,
  sdWebUiRequestSchema,
  sdWebUiResponseSchema
} from './providerPayloadSchemas';
import {
  decodeBase64Image,
  extractProviderRequestId,
  fetchProviderResponse,
  joinProviderUrl,
  readProviderJson,
  requireImages,
  referenceImageDataUrl
} from './providerProtocol';

function createSdWebUiBody(profile: SdWebUiProbeProfile, input: ImageProbeGenerationInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt.trim(),
    negative_prompt: input.negativePrompt?.trim() ?? '',
    width: profile.width,
    height: profile.height,
    batch_size: profile.batchSize
  };
  if (profile.steps !== undefined) body.steps = profile.steps;
  if (profile.cfgScale !== undefined) body.cfg_scale = profile.cfgScale;
  if (profile.samplerName) body.sampler_name = profile.samplerName;
  if (profile.scheduler) body.scheduler = profile.scheduler;
  if (profile.seed !== undefined) body.seed = profile.seed;
  if (profile.restoreFaces !== undefined) body.restore_faces = profile.restoreFaces;
  if (profile.tiling !== undefined) body.tiling = profile.tiling;
  if (profile.hiresFix) {
    body.enable_hr = profile.hiresFix.enabled;
    if (profile.hiresFix.scale !== undefined) body.hr_scale = profile.hiresFix.scale;
    if (profile.hiresFix.upscaler) body.hr_upscaler = profile.hiresFix.upscaler;
    if (profile.hiresFix.secondPassSteps !== undefined) body.hr_second_pass_steps = profile.hiresFix.secondPassSteps;
    if (profile.hiresFix.denoisingStrength !== undefined) body.denoising_strength = profile.hiresFix.denoisingStrength;
  }
  const references = input.referenceImages ?? [];
  if (references.length > 1) throw new Error('SD WebUI img2img 只允许一张参考图。');
  if (references.length) {
    body.init_images = [referenceImageDataUrl(references[0])];
    body.denoising_strength = profile.imageToImageDenoisingStrength ?? 0.55;
  }
  const overrideSettings: Record<string, unknown> = {};
  if (profile.checkpoint) overrideSettings.sd_model_checkpoint = profile.checkpoint;
  if (profile.clipSkip !== undefined) overrideSettings.CLIP_stop_at_last_layers = profile.clipSkip;
  if (Object.keys(overrideSettings).length > 0) body.override_settings = overrideSettings;
  return parseProviderRequest(sdWebUiRequestSchema, body, 'SD WebUI');
}

export class SdWebUiProbeAdapter implements ImageGenerationProbeAdapter {
  readonly providerType = 'sd-webui' as const;

  validate(input: ImageProbeGenerationInput) {
    const base = validateProbeInput(input, sdWebUiProbeProfileSchema, proxyCredentialSchema);
    const profile = sdWebUiProbeProfileSchema.safeParse(input.profile);
    const credential = proxyCredentialSchema.safeParse(input.credential);
    return mergeValidationIssues(
      base,
      profile.success && credential.success ? validateProxyMode(profile.data, credential.data) : []
    );
  }

  async generate(input: ImageProbeGenerationInput, context: Parameters<ImageGenerationProbeAdapter['generate']>[1]) {
    const profile = sdWebUiProbeProfileSchema.parse(input.profile) as SdWebUiProbeProfile;
    const credential = proxyCredentialSchema.parse(input.credential) as ProxyCredential;
    const secrets = proxyCredentialSecrets(credential);
    const headers = new Headers({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...proxyAuthorizationHeaders(credential)
    });

    context.reportStage('authentication');
    context.reportStage('submit');
    const response = await fetchProviderResponse(
      context,
      joinProviderUrl(profile.apiBaseUrl, input.referenceImages?.length ? '/sdapi/v1/img2img' : '/sdapi/v1/txt2img'),
      { method: 'POST', headers, body: JSON.stringify(createSdWebUiBody(profile, input)) },
      secrets,
      'generation-submit'
    );
    const headerRequestId = extractProviderRequestId(response);
    if (headerRequestId) await context.reportRemoteTask?.(headerRequestId);
    const rawPayload = await readProviderJson(response, secrets);
    const providerRequestId = extractProviderRequestId(response, rawPayload);
    if (providerRequestId && providerRequestId !== headerRequestId) {
      await context.reportRemoteTask?.(providerRequestId);
    }
    const payload = parseProviderResponse(
      sdWebUiResponseSchema,
      rawPayload,
      'SD WebUI'
    );
    const values = Array.isArray(payload?.images) ? payload.images : [];
    const dimensions = { width: profile.width, height: profile.height };
    const images = values.flatMap((value) => (
      typeof value === 'string' && value.trim()
        ? [decodeBase64Image(value, 'image/png', dimensions)]
        : []
    ));
    context.reportStage('download');
    context.reportStage('decode');
    return {
      images: requireImages(images, 'SD WebUI'),
      providerRequestId
    };
  }
}

export { createSdWebUiBody };
