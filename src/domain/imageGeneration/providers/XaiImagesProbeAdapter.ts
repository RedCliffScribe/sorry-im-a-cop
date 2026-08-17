import type { ImageGenerationProbeAdapter, ImageProbeAdapterContext, ImageProbeGenerationInput } from '../probe';
import { combineImagePrompts } from './adapterSupport';
import { normalizeOpenAiFamilyImages } from './OpenAiImagesProbeAdapter';
import {
  apiKeyCredentialSchema,
  validateProbeInput,
  xaiProbeProfileSchema,
  type ApiKeyCredential,
  type XaiProbeProfile
} from './providerSchemas';
import {
  parseProviderRequest,
  xaiImageEditRequestSchema,
  xaiImagesRequestSchema
} from './providerPayloadSchemas';
import {
  fetchProviderResponse,
  extractProviderRequestId,
  joinProviderUrl,
  jsonRequestHeaders,
  readProviderJson,
  requireImages,
  referenceImageDataUrl
} from './providerProtocol';

export class XaiImagesProbeAdapter implements ImageGenerationProbeAdapter {
  readonly providerType = 'xai-images' as const;

  validate(input: ImageProbeGenerationInput) {
    return validateProbeInput(input, xaiProbeProfileSchema, apiKeyCredentialSchema);
  }

  async generate(input: ImageProbeGenerationInput, context: ImageProbeAdapterContext) {
    const profile = xaiProbeProfileSchema.parse(input.profile) as XaiProbeProfile;
    const credential = apiKeyCredentialSchema.parse(input.credential) as ApiKeyCredential;
    const requestFields: Record<string, unknown> = {
      model: profile.model,
      prompt: combineImagePrompts(input.prompt, input.negativePrompt),
      n: profile.n,
      response_format: 'b64_json'
    };
    if (profile.aspectRatio) requestFields.aspect_ratio = profile.aspectRatio;
    if (profile.resolution) requestFields.resolution = profile.resolution;
    const references = input.referenceImages ?? [];
    if (references.length > 1) throw new Error('Grok 图片编辑只允许一张参考图。');
    const body = references.length
      ? parseProviderRequest(xaiImageEditRequestSchema, {
        model: profile.model,
        prompt: combineImagePrompts(input.prompt, input.negativePrompt),
        image: { url: referenceImageDataUrl(references[0]), type: 'image_url' }
      }, 'Grok image edit')
      : parseProviderRequest(xaiImagesRequestSchema, requestFields, 'Grok');

    context.reportStage('authentication');
    context.reportStage('submit');
    const response = await fetchProviderResponse(
      context,
      joinProviderUrl(profile.apiBaseUrl, references.length ? '/images/edits' : '/images/generations'),
      { method: 'POST', headers: jsonRequestHeaders(credential.apiKey), body: JSON.stringify(body) },
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
    const images = requireImages(await normalizeOpenAiFamilyImages(payload, context, {}), 'Grok');
    context.reportStage('download');
    context.reportStage('decode');
    return { images, providerRequestId };
  }
}
