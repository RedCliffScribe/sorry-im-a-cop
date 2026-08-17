import type {
  ImageGenerationProbeAdapter,
  ImageProbeAdapterContext,
  ImageProbeGeneratedImage,
  ImageProbeGenerationInput
} from '../probe';
import { combineImagePrompts } from './adapterSupport';
import {
  apiKeyCredentialSchema,
  geminiProbeProfileSchema,
  validateProbeInput,
  type ApiKeyCredential,
  type GeminiProbeProfile
} from './providerSchemas';
import {
  geminiInteractionsRequestSchema,
  geminiInteractionsResponseSchema,
  geminiLegacyRequestSchema,
  geminiLegacyResponseSchema,
  parseProviderRequest,
  parseProviderResponse
} from './providerPayloadSchemas';
import {
  decodeBase64Image,
  downloadTemporaryImage,
  extractProviderRequestId,
  fetchProviderResponse,
  joinProviderUrl,
  readProviderJson,
  requireImages,
  encodeBase64Bytes
} from './providerProtocol';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
}

async function normalizeGeminiInteractions(
  payload: unknown,
  context: ImageProbeAdapterContext
): Promise<ImageProbeGeneratedImage[]> {
  const record = parseProviderResponse(geminiInteractionsResponseSchema, payload, 'Gemini Interactions');
  const blocks = asRecordArray(record?.steps)
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => asRecordArray(step.content));
  const convenience = asRecord(record?.output_image);
  if (convenience) blocks.push(convenience);
  const images: ImageProbeGeneratedImage[] = [];
  for (const block of blocks) {
    if (block.type !== undefined && block.type !== 'image') continue;
    const mimeType = typeof block.mime_type === 'string' ? block.mime_type : 'image/png';
    if (typeof block.data === 'string' && block.data.trim()) {
      images.push(decodeBase64Image(block.data, mimeType));
    } else if (typeof block.uri === 'string' && block.uri.trim()) {
      images.push(await downloadTemporaryImage(context, block.uri));
    }
  }
  return images;
}

function normalizeGeminiLegacy(payload: unknown): ImageProbeGeneratedImage[] {
  const parsed = parseProviderResponse(geminiLegacyResponseSchema, payload, 'Gemini generateContent');
  const candidates = asRecordArray(parsed.candidates);
  return candidates.flatMap((candidate) => {
    const parts = asRecordArray(asRecord(candidate.content)?.parts);
    return parts.flatMap((part) => {
      const inline = asRecord(part.inlineData) ?? asRecord(part.inline_data);
      if (!inline || typeof inline.data !== 'string') return [];
      const mimeType = typeof inline.mimeType === 'string'
        ? inline.mimeType
        : typeof inline.mime_type === 'string'
          ? inline.mime_type
          : 'image/png';
      return [decodeBase64Image(inline.data, mimeType)];
    });
  });
}

export class GeminiImageProbeAdapter implements ImageGenerationProbeAdapter {
  readonly providerType = 'gemini-image' as const;

  validate(input: ImageProbeGenerationInput) {
    return validateProbeInput(input, geminiProbeProfileSchema, apiKeyCredentialSchema);
  }

  async generate(input: ImageProbeGenerationInput, context: ImageProbeAdapterContext) {
    const profile = geminiProbeProfileSchema.parse(input.profile) as GeminiProbeProfile;
    const credential = apiKeyCredentialSchema.parse(input.credential) as ApiKeyCredential;
    const headers = new Headers({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-goog-api-key': credential.apiKey
    });
    const prompt = combineImagePrompts(input.prompt, input.negativePrompt, 'gemini-image');
    const references = input.referenceImages ?? [];
    if (references.length > 3) throw new Error('Gemini 参考图保守上限为 3 张。');
    const encodedReferences = references.map((reference) => ({
      mimeType: reference.mimeType,
      data: encodeBase64Bytes(reference.bytes)
    }));
    const imageFormat: Record<string, unknown> = { type: 'image', mime_type: profile.mimeType };
    if (profile.aspectRatio) imageFormat.aspect_ratio = profile.aspectRatio;
    if (profile.imageSize) imageFormat.image_size = profile.imageSize;
    const legacyImageConfig: Record<string, unknown> = {};
    if (profile.aspectRatio) legacyImageConfig.aspectRatio = profile.aspectRatio;
    if (profile.imageSize) legacyImageConfig.imageSize = profile.imageSize;
    const interactions = profile.apiMode === 'interactions';
    const url = interactions
      ? joinProviderUrl(profile.apiBaseUrl, '/interactions')
      : joinProviderUrl(profile.apiBaseUrl, `/models/${encodeURIComponent(profile.model.replace(/^models\//, ''))}:generateContent`);
    const body = interactions
      ? parseProviderRequest(geminiInteractionsRequestSchema, {
          model: profile.model,
          input: [
            ...encodedReferences.map((reference) => ({
              type: 'image' as const,
              mime_type: reference.mimeType,
              data: reference.data
            })),
            { type: 'text', text: prompt }
          ],
          response_format: imageFormat,
          store: false
        }, 'Gemini Interactions')
      : parseProviderRequest(geminiLegacyRequestSchema, {
          contents: [{
            role: 'user',
            parts: [
              ...encodedReferences.map((reference) => ({
                inlineData: { mimeType: reference.mimeType, data: reference.data }
              })),
              { text: prompt }
            ]
          }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            ...(Object.keys(legacyImageConfig).length > 0 ? { imageConfig: legacyImageConfig } : {})
          }
        }, 'Gemini generateContent');

    context.reportStage('authentication');
    context.reportStage('submit');
    const response = await fetchProviderResponse(
      context,
      url,
      { method: 'POST', headers, body: JSON.stringify(body) },
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
    const images = requireImages(
      interactions ? await normalizeGeminiInteractions(payload, context) : normalizeGeminiLegacy(payload),
      'Gemini'
    );
    context.reportStage('download');
    context.reportStage('decode');
    return { images, providerRequestId };
  }
}

export { normalizeGeminiInteractions, normalizeGeminiLegacy };
