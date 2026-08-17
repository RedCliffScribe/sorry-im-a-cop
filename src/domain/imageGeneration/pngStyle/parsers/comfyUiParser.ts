import type { ParsedPngGenerationData } from '../types';
import {
  extractLoraTokens,
  finiteNumber,
  firstText,
  integer,
  nonEmptyString,
  parsedResult,
  safeJson,
  stringifyBounded,
  type PngTextChunks
} from './parserSupport';

type NodeRecord = Record<string, {
  class_type?: unknown;
  inputs?: unknown;
}>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nodeRecord(value: unknown): NodeRecord {
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record).filter(([, node]) => node && typeof node === 'object' && !Array.isArray(node))
  ) as NodeRecord;
}

function linkedNodeId(value: unknown): string | undefined {
  return Array.isArray(value) && (typeof value[0] === 'string' || typeof value[0] === 'number')
    ? String(value[0])
    : undefined;
}

function resolveTextNode(nodes: NodeRecord, nodeId: string | undefined): string | undefined {
  if (!nodeId) return undefined;
  const node = nodes[nodeId];
  if (!node) return undefined;
  const inputs = asRecord(node.inputs);
  const direct = nonEmptyString(inputs.text ?? inputs.prompt ?? inputs.string);
  if (direct) return direct;
  const linked = linkedNodeId(inputs.text ?? inputs.prompt ?? inputs.string);
  return linked && linked !== nodeId ? resolveTextNode(nodes, linked) : undefined;
}

function findSampler(nodes: NodeRecord): {
  positivePrompt?: string;
  negativePrompt?: string;
  sampler?: string;
  steps?: number;
  cfg?: number;
  seed?: number;
} | undefined {
  for (const node of Object.values(nodes)) {
    const classType = nonEmptyString(node.class_type)?.toLocaleLowerCase('en-US') ?? '';
    if (!classType.includes('ksampler') && !classType.includes('sampler')) continue;
    const inputs = asRecord(node.inputs);
    return {
      positivePrompt: resolveTextNode(nodes, linkedNodeId(inputs.positive)),
      negativePrompt: resolveTextNode(nodes, linkedNodeId(inputs.negative)),
      sampler: nonEmptyString(inputs.sampler_name ?? inputs.sampler),
      steps: integer(inputs.steps),
      cfg: finiteNumber(inputs.cfg),
      seed: integer(inputs.seed ?? inputs.noise_seed)
    };
  }
  return undefined;
}

export function parseComfyUiMetadata(chunks: PngTextChunks): ParsedPngGenerationData | undefined {
  const promptText = firstText(chunks, 'prompt');
  const workflowText = firstText(chunks, 'workflow');
  if (!promptText && !workflowText) return undefined;
  const promptJson = safeJson(promptText);
  const nodes = nodeRecord(promptJson);
  if (!workflowText && Object.keys(nodes).length === 0) {
    return undefined;
  }
  const sampler = findSampler(nodes);
  const positivePrompt = sampler?.positivePrompt ?? '';
  const negativePrompt = sampler?.negativePrompt ?? '';
  const warnings: string[] = [];
  if (!positivePrompt && !negativePrompt) {
    warnings.push('ComfyUI 元数据存在，但无法从 API prompt 图中确定正负提示词节点；workflow 只保留为未执行元数据。');
  }
  return parsedResult({
    source: 'comfyui',
    positivePrompt,
    negativePrompt,
    parameters: {
      ...(sampler?.sampler ? { sampler: sampler.sampler } : {}),
      ...(sampler?.steps && sampler.steps > 0 ? { steps: sampler.steps } : {}),
      ...(sampler?.cfg !== undefined && sampler.cfg >= 0 ? { cfg: sampler.cfg } : {}),
      ...(sampler?.seed !== undefined && sampler.seed >= 0 ? { seed: sampler.seed } : {}),
      ...(extractLoraTokens(positivePrompt).length
        ? { loras: extractLoraTokens(positivePrompt) }
        : {})
    },
    rawMetadata: stringifyBounded({
      prompt: promptJson ?? promptText,
      workflow: safeJson(workflowText) ?? workflowText
    }),
    warnings
  });
}
