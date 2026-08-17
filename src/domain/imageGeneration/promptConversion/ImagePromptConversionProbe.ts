import type { NarratorClient } from '../../narrator/NarratorClient';
import {
  characterAnchorConversionInputSchema,
  characterAnchorConversionOutputSchema,
  characterAnchorImageExtractionInputSchema,
  characterPromptBatchInputSchema,
  characterPromptBatchOutputSchema,
  providerPromptRenderInputSchema,
  providerPromptRenderOutputSchema,
  sceneShotPromptInputSchema,
  sceneShotPromptOutputSchema,
  turnScenePlanningInputSchema,
  turnScenePlanningOutputSchema,
  type CharacterAnchorConversionInput,
  type CharacterAnchorConversionOutput,
  type CharacterAnchorImageExtractionInput,
  type CharacterPromptBatchInput,
  type CharacterPromptBatchOutput,
  type ProviderPromptRenderInput,
  type ProviderPromptRenderOutput,
  type SceneShotPromptInput,
  type SceneShotPromptOutput,
  type TurnScenePlanningInput,
  type TurnScenePlanningOutput
} from './schemas';
import {
  buildCharacterAnchorPrompt,
  buildCharacterAnchorImageExtractionPrompt,
  buildCharacterPromptBatchPrompt,
  DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS,
  buildProviderPromptRenderPrompt,
  buildSceneShotPrompt,
  buildSchemaRepairPrompt,
  buildTurnScenePlanningPrompt
} from './prompts';
import {
  PromptConversionContractError,
  type PromptConversionInstructionSet,
  type PromptConversionRunOptions,
  type PromptConversionTaskKind
} from './types';
import {
  validateCharacterAnchorOutput,
  validateCharacterPromptBatchOutput,
  validateProviderPromptRenderOutput,
  validateSceneShotPromptOutput,
  validateTurnScenePlanningOutput
} from './validation';
import { validateTurnScenePlanningInputIntegrity } from './visualProjection';
import { normalizeTurnScenePlanningCandidate } from './turnScenePlanningRecovery';
import { z } from 'zod';
import type { NarratorImageInput } from '../../narrator/NarratorClient';

type DomainValidator<I, O> = (input: I, output: O) => string[];
type InputValidator<I> = (input: I) => string[] | Promise<string[]>;

export interface ImagePromptConversionProbeConfiguration {
  inputModalities?: readonly ('text' | 'image')[];
  loadConversionInstructions?: () => Promise<PromptConversionInstructionSet>;
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : '<root>';
    return `${path}: ${issue.message}`;
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException('操作已取消', 'AbortError');
}

export class ImagePromptConversionProbe {
  readonly supportsImageInput: boolean;

  constructor(
    private readonly client: NarratorClient,
    private readonly configuration: ImagePromptConversionProbeConfiguration = {}
  ) {
    this.supportsImageInput = configuration.inputModalities?.includes('image') === true &&
      typeof client.completeWithImages === 'function';
  }

  assertImageAnchorExtractionAvailable(): void {
    if (!this.supportsImageInput) {
      throw new PromptConversionContractError(
        'image-input-not-declared',
        'character-anchor',
        '当前提示词转换模型未明确声明图片输入能力，不能从已有图片提取角色锚点。',
        [],
        0
      );
    }
  }

  generateCharacterAnchor(
    input: unknown,
    options: PromptConversionRunOptions = {}
  ): Promise<CharacterAnchorConversionOutput> {
    return this.run({
      taskKind: 'character-anchor',
      input,
      inputSchema: characterAnchorConversionInputSchema,
      outputSchema: characterAnchorConversionOutputSchema,
      buildPrompt: buildCharacterAnchorPrompt,
      validateOutput: validateCharacterAnchorOutput,
      options
    });
  }

  generateCharacterAnchorFromImages(
    input: unknown,
    images: readonly NarratorImageInput[],
    options: PromptConversionRunOptions = {}
  ): Promise<CharacterAnchorConversionOutput> {
    this.assertImageAnchorExtractionAvailable();
    return this.run({
      taskKind: 'character-anchor-from-images',
      input,
      inputSchema: characterAnchorImageExtractionInputSchema,
      outputSchema: characterAnchorConversionOutputSchema,
      buildPrompt: buildCharacterAnchorImageExtractionPrompt,
      validateInput: (parsed) => {
        if (parsed.sourceImages.length !== images.length) return ['图片元数据数量与实际请求图片数量不一致'];
        return parsed.sourceImages.flatMap((metadata, index) => {
          const image = images[index];
          return image?.mimeType === metadata.mimeType ? [] : [`来源图片 ${metadata.imageId} 的 MIME 与实际请求不一致`];
        });
      },
      validateOutput: validateCharacterAnchorOutput,
      completePrompt: (prompt, runOptions) => this.client.completeWithImages!(prompt, images, runOptions),
      options
    });
  }

  generateCharacterViewPrompts(
    input: unknown,
    options: PromptConversionRunOptions = {}
  ): Promise<CharacterPromptBatchOutput> {
    return this.run({
      taskKind: 'character-view-batch',
      input,
      inputSchema: characterPromptBatchInputSchema,
      outputSchema: characterPromptBatchOutputSchema,
      buildPrompt: buildCharacterPromptBatchPrompt,
      validateOutput: validateCharacterPromptBatchOutput,
      options
    });
  }

  planTurnScenes(input: unknown, options: PromptConversionRunOptions = {}): Promise<TurnScenePlanningOutput> {
    return this.run({
      taskKind: 'turn-scene-plan',
      input,
      inputSchema: turnScenePlanningInputSchema,
      outputSchema: turnScenePlanningOutputSchema,
      buildPrompt: buildTurnScenePlanningPrompt,
      validateInput: validateTurnScenePlanningInputIntegrity,
      validateOutput: validateTurnScenePlanningOutput,
      normalizeOutput: normalizeTurnScenePlanningCandidate,
      options
    });
  }

  generateSceneShotPrompt(
    input: unknown,
    options: PromptConversionRunOptions = {}
  ): Promise<SceneShotPromptOutput> {
    return this.run({
      taskKind: 'scene-shot-prompt',
      input,
      inputSchema: sceneShotPromptInputSchema,
      outputSchema: sceneShotPromptOutputSchema,
      buildPrompt: buildSceneShotPrompt,
      validateOutput: validateSceneShotPromptOutput,
      options
    });
  }

  renderProviderPrompt(
    input: unknown,
    options: PromptConversionRunOptions = {}
  ): Promise<ProviderPromptRenderOutput> {
    return this.run({
      taskKind: 'provider-prompt-render',
      input,
      inputSchema: providerPromptRenderInputSchema,
      outputSchema: providerPromptRenderOutputSchema,
      buildPrompt: buildProviderPromptRenderPrompt,
      validateOutput: validateProviderPromptRenderOutput,
      options
    });
  }

  private async run<I, O>({
    taskKind,
    input,
    inputSchema,
    outputSchema,
    buildPrompt,
    validateInput,
    validateOutput,
    normalizeOutput,
    completePrompt,
    options
  }: {
    taskKind: PromptConversionTaskKind;
    input: unknown;
    inputSchema: z.ZodType<I>;
    outputSchema: z.ZodType<O>;
    buildPrompt: (input: I, instruction: string) => string;
    validateInput?: InputValidator<I>;
    validateOutput: DomainValidator<I, O>;
    normalizeOutput?: (input: I, output: unknown) => unknown;
    completePrompt?: (prompt: string, options: PromptConversionRunOptions) => Promise<unknown>;
    options: PromptConversionRunOptions;
  }): Promise<O> {
    throwIfAborted(options.signal);
    const parsedInput = inputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw new PromptConversionContractError(
        'invalid-input',
        taskKind,
        `${taskKind} 输入不符合结构契约`,
        formatZodIssues(parsedInput.error),
        0
      );
    }
    const inputIssues = validateInput ? await validateInput(parsedInput.data) : [];
    throwIfAborted(options.signal);
    if (inputIssues.length) {
      throw new PromptConversionContractError(
        'invalid-input',
        taskKind,
        `${taskKind} 输入未通过内容完整性校验`,
        inputIssues,
        0
      );
    }

    let instructions: PromptConversionInstructionSet = DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS;
    if (this.configuration.loadConversionInstructions) {
      try {
        instructions = await this.configuration.loadConversionInstructions();
      } catch {
        throw new PromptConversionContractError(
          'instruction-load-failed',
          taskKind,
          '提示词转换任务指令读取失败；为避免静默改用默认模板，本次没有调用转换 API。',
          [],
          0
        );
      }
    }
    throwIfAborted(options.signal);
    const prompt = buildPrompt(parsedInput.data, instructions[taskKind]);
    const complete = completePrompt ?? ((value, runOptions) => this.client.complete(value, runOptions));
    const firstOutput = await complete(prompt, { signal: options.signal });
    throwIfAborted(options.signal);
    const firstResult = this.validateResult(
      outputSchema,
      parsedInput.data,
      normalizeOutput?.(parsedInput.data, firstOutput) ?? firstOutput,
      validateOutput
    );
    if (firstResult.success) return firstResult.data;

    const repairPrompt = buildSchemaRepairPrompt(taskKind, prompt, firstOutput, firstResult.issues);
    const repairedOutput = await complete(repairPrompt, { signal: options.signal });
    throwIfAborted(options.signal);
    const repairedResult = this.validateResult(
      outputSchema,
      parsedInput.data,
      normalizeOutput?.(parsedInput.data, repairedOutput) ?? repairedOutput,
      validateOutput
    );
    if (repairedResult.success) return repairedResult.data;

    throw new PromptConversionContractError(
      'invalid-output',
      taskKind,
      `${taskKind} 返回在一次结构修复后仍不符合契约`,
      repairedResult.issues,
      2
    );
  }

  private validateResult<I, O>(
    schema: z.ZodType<O>,
    input: I,
    value: unknown,
    validateOutput: DomainValidator<I, O>
  ): { success: true; data: O } | { success: false; issues: string[] } {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return { success: false, issues: formatZodIssues(parsed.error) };
    const domainIssues = validateOutput(input, parsed.data);
    return domainIssues.length
      ? { success: false, issues: domainIssues }
      : { success: true, data: parsed.data };
  }
}

export type {
  CharacterAnchorConversionInput,
  CharacterAnchorImageExtractionInput,
  CharacterPromptBatchInput,
  ProviderPromptRenderInput,
  SceneShotPromptInput,
  TurnScenePlanningInput
};
