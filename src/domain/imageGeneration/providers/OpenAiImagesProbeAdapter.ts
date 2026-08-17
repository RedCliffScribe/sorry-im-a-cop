import type {
  ImageGenerationProbeAdapter,
  ImageProbeAdapterContext,
  ImageProbeGeneratedImage,
  ImageProbeGenerationInput
} from '../probe';
import { combineImagePrompts } from './adapterSupport';
import {
  apiKeyCredentialSchema,
  openAiProbeProfileSchema,
  validateProbeInput,
  type ApiKeyCredential,
  type OpenAiProbeProfile
} from './providerSchemas';
import {
  openAiFamilyResponseSchema,
  openAiImagesRequestSchema,
  parseProviderRequest,
  parseProviderResponse
} from './providerPayloadSchemas';
import {
  decodeBase64Image,
  downloadTemporaryImage,
  extractProviderRequestId,
  fetchProviderResponse,
  joinProviderUrl,
  jsonRequestHeaders,
  readProviderJson,
  requireImages
} from './providerProtocol';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function normalizeOpenAiFamilyImages(
  payload: unknown,
  context: ImageProbeAdapterContext,
  dimensions: { width?: number; height?: number }
): Promise<ImageProbeGeneratedImage[]> {
  const data = parseProviderResponse(openAiFamilyResponseSchema, payload, 'OpenAI Images').data;
  if (!Array.isArray(data)) return [];
  const images: ImageProbeGeneratedImage[] = [];
  for (const value of data) {
    const item = asRecord(value);
    if (!item) continue;
    const mimeType = typeof item.mime_type === 'string' ? item.mime_type : undefined;
    if (typeof item.b64_json === 'string' && item.b64_json.trim()) {
      images.push(decodeBase64Image(item.b64_json, mimeType, dimensions));
    } else if (typeof item.url === 'string' && item.url.trim()) {
      images.push(await downloadTemporaryImage(context, item.url, dimensions));
    }
  }
  return images;
}

export class OpenAiImagesProbeAdapter implements ImageGenerationProbeAdapter {
  readonly providerType = 'openai-images' as const;

  validate(input: ImageProbeGenerationInput) {
    return validateProbeInput(input, openAiProbeProfileSchema, apiKeyCredentialSchema);
  }

  async generate(input: ImageProbeGenerationInput, context: ImageProbeAdapterContext) {
    const profile = openAiProbeProfileSchema.parse(input.profile) as OpenAiProbeProfile;
    const credential = apiKeyCredentialSchema.parse(input.credential) as ApiKeyCredential;
    const requestFields: Record<string, unknown> = {
      model: profile.model,
      prompt: combineImagePrompts(input.prompt, input.negativePrompt, 'openai-gpt-image'),
      n: profile.n
    };
    if (profile.responseFormat) requestFields.response_format = profile.responseFormat;
    if (profile.size) requestFields.size = profile.size;
    if (profile.quality) requestFields.quality = profile.quality;
    if (profile.outputFormat) requestFields.output_format = profile.outputFormat;
    if (profile.outputCompression !== undefined) requestFields.output_compression = profile.outputCompression;
    if (profile.background) requestFields.background = profile.background;
    const body = parseProviderRequest(openAiImagesRequestSchema, requestFields, 'OpenAI Images');
    const references = input.referenceImages ?? [];
    if (references.length > 16) throw new Error('OpenAI 图片编辑最多允许 16 张参考图。');
    if (references.length && profile.apiVariant !== 'openai-official') {
      throw new Error('OpenAI 兼容档案没有冻结统一的参考图编辑协议。');
    }
    let path = '/images/generations';
    let request: RequestInit = {
      method: 'POST',
      headers: jsonRequestHeaders(credential.apiKey),
      body: JSON.stringify(body)
    };
    if (references.length) {
      path = '/images/edits';
      const form = new FormData();
      form.set('model', profile.model);
      form.set('prompt', combineImagePrompts(input.prompt, input.negativePrompt, 'openai-gpt-image'));
      form.set('n', String(profile.n));
      if (profile.size) form.set('size', profile.size);
      if (profile.quality) form.set('quality', profile.quality);
      if (profile.outputFormat) form.set('output_format', profile.outputFormat);
      if (profile.outputCompression !== undefined) form.set('output_compression', String(profile.outputCompression));
      if (profile.background) form.set('background', profile.background);
      references.forEach((reference, index) => {
        const extension = reference.mimeType === 'image/jpeg' ? 'jpg' : reference.mimeType.split('/')[1];
        form.append('image[]', new Blob([reference.bytes], { type: reference.mimeType }), `reference-${index + 1}.${extension}`);
      });
      request = {
        method: 'POST',
        headers: new Headers({ Authorization: `Bearer ${credential.apiKey}`, Accept: 'application/json' }),
        body: form
      };
    }

    context.reportStage('authentication');
    context.reportStage('submit');
    const response = await fetchProviderResponse(
      context,
      joinProviderUrl(profile.apiBaseUrl, path),
      request,
      [credential.apiKey],
      'generation-submit'
    );
    const headerRequestId = extractProviderRequestId(response);
    if (headerRequestId) await context.reportRemoteTask?.(headerRequestId);
    const payload = await readProviderJson(response, [credential.apiKey]);
    const providerRequestId = extractProviderRequestId(response, payload);
    if (providerRequestId && providerRequestId !== headerRequestId) {
      await context.reportRemoteTask?.(providerRequestId);
    }
    const images = requireImages(await normalizeOpenAiFamilyImages(payload, context, {}), 'OpenAI Images');
    context.reportStage('download');
    context.reportStage('decode');
    return {
      images,
      providerRequestId
    };
  }
}

export { normalizeOpenAiFamilyImages };
