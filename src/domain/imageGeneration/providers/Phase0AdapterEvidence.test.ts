import { describe, expect, it, vi } from 'vitest';
import {
  ImageProbeRunner,
  type ImageApiProfileId,
  type ImageGenerationProbeAdapter,
  type ImageGenerationVerificationRecord,
  type ImageProbeArtifact,
  type ImageProbeOutcome,
  type ImageProbeRunInput,
  type ImageProbeStage,
  type ImageProbeStore
} from '../probe';
import { AlibabaModelStudioProbeAdapter } from './AlibabaModelStudioProbeAdapter';
import { ComfyUiWorkflowProbeAdapter } from './ComfyUiWorkflowProbeAdapter';
import { GeminiImageProbeAdapter } from './GeminiImageProbeAdapter';
import { NovelAiImageProbeAdapter } from './NovelAiImageProbeAdapter';
import { OpenAiImagesProbeAdapter } from './OpenAiImagesProbeAdapter';
import { imageResponse, jsonResponse, TEST_PNG_BASE64 } from './providerTestUtils';
import { SdWebUiProbeAdapter } from './SdWebUiProbeAdapter';
import { XaiImagesProbeAdapter } from './XaiImagesProbeAdapter';

class EvidenceStore implements ImageProbeStore {
  outcome?: ImageProbeOutcome;

  async saveOutcome(outcome: ImageProbeOutcome): Promise<void> {
    this.outcome = outcome;
  }

  async listRecords(_profileId: ImageApiProfileId): Promise<ImageGenerationVerificationRecord[]> {
    return this.outcome ? [this.outcome.record] : [];
  }

  async getLatestArtifact(_profileId: ImageApiProfileId): Promise<ImageProbeArtifact | null> {
    return this.outcome?.artifact ?? null;
  }

  async clearProfile(_profileId: ImageApiProfileId): Promise<void> {
    this.outcome = undefined;
  }

  async clearAll(): Promise<void> {
    this.outcome = undefined;
  }
}

interface EvidenceFixture {
  name: string;
  adapter: ImageGenerationProbeAdapter;
  input: Pick<ImageProbeRunInput, 'profile' | 'credential'>;
  responses: () => Response[];
  completedStages: ImageProbeStage[];
}

const synchronousCompletedStages: ImageProbeStage[] = [
  'local-validation',
  'authentication',
  'submit',
  'download',
  'decode',
  'blob-persist'
];

const asynchronousCompletedStages: ImageProbeStage[] = [
  'local-validation',
  'authentication',
  'submit',
  'poll-or-wait',
  'download',
  'decode',
  'blob-persist'
];

const fixtures: EvidenceFixture[] = [
  {
    name: 'OpenAI',
    adapter: new OpenAiImagesProbeAdapter(),
    input: {
      profile: { apiBaseUrl: 'https://openai.example/v1', model: 'image', n: 1 },
      credential: { apiKey: 'key' }
    },
    responses: () => [jsonResponse({ data: [{ b64_json: TEST_PNG_BASE64 }] })],
    completedStages: synchronousCompletedStages
  },
  {
    name: 'xAI',
    adapter: new XaiImagesProbeAdapter(),
    input: {
      profile: { apiBaseUrl: 'https://xai.example/v1', model: 'image', n: 1 },
      credential: { apiKey: 'key' }
    },
    responses: () => [jsonResponse({ data: [{ url: 'https://cdn.example/xai.png' }] }), imageResponse()],
    completedStages: synchronousCompletedStages
  },
  {
    name: 'Gemini',
    adapter: new GeminiImageProbeAdapter(),
    input: {
      profile: {
        apiBaseUrl: 'https://gemini.example/v1beta',
        model: 'gemini-image',
        apiMode: 'interactions'
      },
      credential: { apiKey: 'key' }
    },
    responses: () => [jsonResponse({
      steps: [{ type: 'model_output', content: [{ type: 'image', data: TEST_PNG_BASE64, mime_type: 'image/png' }] }]
    })],
    completedStages: synchronousCompletedStages
  },
  {
    name: 'Alibaba',
    adapter: new AlibabaModelStudioProbeAdapter(),
    input: {
      profile: {
        apiBaseUrl: 'https://alibaba.example/api/v1',
        model: 'wan',
        protocolVariant: 'multimodal-generation-sync',
        n: 1,
        pollIntervalMs: 0,
        maxPollAttempts: 1
      },
      credential: { apiKey: 'key' }
    },
    responses: () => [
      jsonResponse({ output: { results: [{ url: 'https://cdn.example/ali.png' }] } }),
      imageResponse()
    ],
    completedStages: synchronousCompletedStages
  },
  {
    name: 'NovelAI',
    adapter: new NovelAiImageProbeAdapter(),
    input: {
      profile: {
        apiBaseUrl: 'https://novelai.example',
        model: 'nai',
        responseFormat: 'json-base64',
        width: 512,
        height: 512,
        nSamples: 1
      },
      credential: { apiKey: 'key' }
    },
    responses: () => [jsonResponse({ images: [TEST_PNG_BASE64] })],
    completedStages: synchronousCompletedStages
  },
  {
    name: 'ComfyUI',
    adapter: new ComfyUiWorkflowProbeAdapter(),
    input: {
      profile: {
        apiBaseUrl: 'http://127.0.0.1:8188',
        deployment: 'core-server',
        authMode: 'none',
        workflow: {
          '1': { class_type: 'Text', inputs: { text: '' } },
          '9': { class_type: 'Output', inputs: {} }
        },
        bindings: { positivePrompt: { nodeId: '1', inputName: 'text' } },
        outputNodeIds: ['9'],
        pollIntervalMs: 0,
        maxPollAttempts: 1
      },
      credential: { mode: 'none' }
    },
    responses: () => [
      jsonResponse({ prompt_id: 'prompt-1' }),
      jsonResponse({ 'prompt-1': { outputs: { '9': { images: [{ filename: 'out.png' }] } } } }),
      imageResponse()
    ],
    completedStages: asynchronousCompletedStages
  },
  {
    name: 'SD WebUI',
    adapter: new SdWebUiProbeAdapter(),
    input: {
      profile: {
        apiBaseUrl: 'http://127.0.0.1:7860',
        authMode: 'none',
        width: 512,
        height: 512,
        batchSize: 1
      },
      credential: { mode: 'none' }
    },
    responses: () => [jsonResponse({ images: [TEST_PNG_BASE64] })],
    completedStages: synchronousCompletedStages
  }
];

describe('Phase 0 adapter evidence', () => {
  for (const fixture of fixtures) {
    it(`${fixture.name} produces an isolated mock-passed record through Blob persistence`, async () => {
      const responses = fixture.responses();
      const fetchMock = vi.fn(async () => {
        const response = responses.shift();
        if (!response) throw new Error('unexpected request');
        return response;
      });
      const store = new EvidenceStore();
      const ids = [`verification-${fixture.name}`, `artifact-${fixture.name}`];
      const runner = new ImageProbeRunner({
        store,
        fetch: fetchMock,
        wait: async () => undefined,
        createId: () => ids.shift() ?? 'unexpected-id',
        now: () => new Date('2026-07-22T00:00:00.000Z')
      });

      const record = await runner.run({
        adapter: fixture.adapter,
        scope: 'project-adapter',
        profileId: `profile-${fixture.name}`,
        environment: 'test-runner',
        adapterRevision: 'p0-c',
        executionFingerprint: `execution-${fixture.name}`,
        prompt: 'neutral test image',
        ...fixture.input
      });

      expect(record.providerType).toBe(fixture.adapter.providerType);
      expect(record.verdict).toBe('mock-passed');
      expect(record.completedStages).toEqual(fixture.completedStages);
      expect(store.outcome?.artifact?.blob.type).toBe('image/png');
      expect(responses).toHaveLength(0);
    });
  }
});
