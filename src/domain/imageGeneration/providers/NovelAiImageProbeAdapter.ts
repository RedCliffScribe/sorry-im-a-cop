import {
  type ImageGenerationProbeAdapter,
  type ImageProbeAdapterContext,
  type ImageProbeGeneratedImage,
  type ImageProbeGenerationInput
} from '../probe';
import {
  apiKeyCredentialSchema,
  novelAiProbeProfileSchema,
  validateProbeInput,
  type ApiKeyCredential,
  type NovelAiProbeProfile
} from './providerSchemas';
import {
  novelAiRequestSchema,
  novelAiResponseSchema,
  parseProviderRequest,
  parseProviderResponse
} from './providerPayloadSchemas';
import {
  decodeBase64Image,
  createGeneratedImage,
  downloadTemporaryImage,
  extractZipImages,
  extractProviderRequestId,
  fetchProviderResponse,
  joinProviderUrl,
  readProviderJson,
  requireImages,
  encodeBase64Bytes
} from './providerProtocol';
import {
  createRandomNovelAiSeed,
  isNovelAiV4Model,
  resolveNovelAiProtocolDefaults
} from './novelAiRequestContract';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function normalizeNovelAiJson(
  payload: unknown,
  context: ImageProbeAdapterContext,
  dimensions: { width: number; height: number }
): Promise<ImageProbeGeneratedImage[]> {
  const record = parseProviderResponse(novelAiResponseSchema, payload, 'NovelAI');
  const values = Array.isArray(record?.images)
    ? record.images
    : Array.isArray(record?.data)
      ? record.data
      : [];
  const images: ImageProbeGeneratedImage[] = [];
  for (const value of values) {
    if (typeof value === 'string') {
      images.push(decodeBase64Image(value, 'image/png', dimensions));
      continue;
    }
    const item = asRecord(value);
    if (!item) continue;
    const encoded = item.base64 ?? item.b64_json ?? item.data;
    const url = item.url;
    const mimeType = typeof item.mime_type === 'string' ? item.mime_type : 'image/png';
    if (typeof encoded === 'string' && encoded.trim()) {
      images.push(decodeBase64Image(encoded, mimeType, dimensions));
    } else if (typeof url === 'string' && url.trim()) {
      images.push(await downloadTemporaryImage(context, url, dimensions));
    }
  }
  return images;
}

function createNovelAiBody(
  profile: NovelAiProbeProfile,
  input: ImageProbeGenerationInput,
  createSeed: () => number = createRandomNovelAiSeed
): Record<string, unknown> {
  const positivePrompt = input.prompt.trim();
  const negativePrompt = input.negativePrompt?.trim() ?? '';
  const defaults = resolveNovelAiProtocolDefaults(profile.model);
  const parameters: Record<string, unknown> = {
    params_version: defaults.paramsVersion,
    width: profile.width,
    height: profile.height,
    n_samples: profile.nSamples,
    uc: negativePrompt,
    steps: profile.steps ?? defaults.steps,
    scale: profile.scale ?? defaults.scale,
    cfg_rescale: profile.cfgRescale ?? defaults.cfgRescale,
    sampler: profile.sampler ?? defaults.sampler,
    seed: profile.seed ?? createSeed(),
    noise_schedule: profile.noiseSchedule ?? defaults.noiseSchedule,
    qualityToggle: profile.qualityToggle ?? defaults.qualityToggle,
    ucPreset: profile.undesiredContentPreset ?? defaults.undesiredContentPreset,
    sm: profile.smea ?? defaults.smea,
    sm_dyn: profile.smeaDynamic ?? defaults.smeaDynamic,
    legacy_v3_extend: defaults.legacyV3Extend,
    dynamic_thresholding: defaults.dynamicThresholding
  };
  if (isNovelAiV4Model(profile.model)) {
    parameters.v4_prompt = {
      caption: { base_caption: positivePrompt, char_captions: [] },
      use_coords: false,
      use_order: true,
      legacy_uc: false
    };
    parameters.v4_negative_prompt = {
      caption: { base_caption: negativePrompt, char_captions: [] },
      use_coords: false,
      use_order: false,
      legacy_uc: false
    };
  }
  const references = input.referenceImages ?? [];
  if (references.length > 1) throw new Error('NovelAI Image2Image 只允许一张参考图。');
  if (references.length) {
    parameters.image = encodeBase64Bytes(references[0].bytes);
    parameters.strength = profile.imageToImageStrength ?? 0.65;
    parameters.noise = profile.imageToImageNoise ?? 0.1;
  }
  return parseProviderRequest(novelAiRequestSchema, {
    input: positivePrompt,
    model: profile.model,
    action: 'generate',
    parameters
  }, 'NovelAI');
}

export class NovelAiImageProbeAdapter implements ImageGenerationProbeAdapter {
  readonly providerType = 'novelai-image' as const;

  validate(input: ImageProbeGenerationInput) {
    return validateProbeInput(input, novelAiProbeProfileSchema, apiKeyCredentialSchema);
  }

  async generate(input: ImageProbeGenerationInput, context: ImageProbeAdapterContext) {
    const profile = novelAiProbeProfileSchema.parse(input.profile) as NovelAiProbeProfile;
    const credential = apiKeyCredentialSchema.parse(input.credential) as ApiKeyCredential;
    const accept = profile.responseFormat === 'json-base64'
      ? 'application/json'
      : profile.responseFormat === 'zip'
        ? 'application/zip, application/octet-stream, binary/octet-stream'
        : 'application/json, application/zip, application/octet-stream, binary/octet-stream, image/*';
    const headers = new Headers({
      Accept: accept,
      Authorization: `Bearer ${credential.apiKey}`,
      'Content-Type': 'application/json'
    });

    context.reportStage('authentication');
    context.reportStage('submit');
    const response = await fetchProviderResponse(
      context,
      joinProviderUrl(profile.apiBaseUrl, '/ai/generate-image'),
      { method: 'POST', headers, body: JSON.stringify(createNovelAiBody(profile, input)) },
      [credential.apiKey],
      'generation-submit'
    );
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    const dimensions = { width: profile.width, height: profile.height };
    const headerRequestId = extractProviderRequestId(response);
    let providerRequestId = headerRequestId;
    if (headerRequestId) await context.reportRemoteTask?.(headerRequestId);
    let images: ImageProbeGeneratedImage[];
    if (contentType === 'application/json' || contentType.endsWith('+json')) {
      const payload = await readProviderJson(response, [credential.apiKey]);
      const payloadRequestId = extractProviderRequestId(response, payload);
      providerRequestId = payloadRequestId ?? providerRequestId;
      if (payloadRequestId && payloadRequestId !== headerRequestId) {
        await context.reportRemoteTask?.(payloadRequestId);
      }
      images = await normalizeNovelAiJson(payload, context, dimensions);
    } else {
      if (!response.ok) await readProviderJson(response, [credential.apiKey]);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const isZip = contentType === 'application/zip'
        || contentType === 'application/x-zip-compressed'
        || (bytes[0] === 0x50 && bytes[1] === 0x4b);
      images = isZip
        ? extractZipImages(bytes, dimensions)
        : [createGeneratedImage(bytes, contentType, dimensions)];
    }
    context.reportStage('download');
    context.reportStage('decode');
    return { images: requireImages(images, 'NovelAI'), providerRequestId };
  }
}

export { createNovelAiBody, normalizeNovelAiJson };
