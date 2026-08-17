import type { ImageGenerationProbeAdapter } from '../probe';
import { AlibabaModelStudioProbeAdapter } from './AlibabaModelStudioProbeAdapter';
import { ComfyUiWorkflowProbeAdapter } from './ComfyUiWorkflowProbeAdapter';
import { GeminiImageProbeAdapter } from './GeminiImageProbeAdapter';
import { NovelAiImageProbeAdapter } from './NovelAiImageProbeAdapter';
import { OpenAiImagesProbeAdapter } from './OpenAiImagesProbeAdapter';
import { SdWebUiProbeAdapter } from './SdWebUiProbeAdapter';
import { XaiImagesProbeAdapter } from './XaiImagesProbeAdapter';

export * from './AlibabaModelStudioProbeAdapter';
export * from './ComfyUiWorkflowProbeAdapter';
export * from './GeminiImageProbeAdapter';
export * from './NovelAiImageProbeAdapter';
export * from './OpenAiImagesProbeAdapter';
export * from './providerSchemas';
export * from './SdWebUiProbeAdapter';
export * from './XaiImagesProbeAdapter';

export function createPhase0ImageProbeAdapters(): ImageGenerationProbeAdapter[] {
  return [
    new OpenAiImagesProbeAdapter(),
    new XaiImagesProbeAdapter(),
    new GeminiImageProbeAdapter(),
    new AlibabaModelStudioProbeAdapter(),
    new NovelAiImageProbeAdapter(),
    new ComfyUiWorkflowProbeAdapter(),
    new SdWebUiProbeAdapter()
  ];
}
