import type { ComfyWorkflowTemplate } from './types';

export const MAX_COMFY_WORKFLOW_IMPORT_BYTES = 5 * 1024 * 1024;

type ComfyApiWorkflow = ComfyWorkflowTemplate['apiWorkflow'];

export interface ParsedComfyApiWorkflow {
  apiWorkflow: ComfyApiWorkflow;
  nodeCount: number;
  suggestedOutputNodeIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseComfyApiWorkflowJson(
  source: string
): ParsedComfyApiWorkflow {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('工作流文件不是有效的 JSON。');
  }
  if (!isRecord(parsed)) {
    throw new Error('ComfyUI API 工作流必须是 JSON 对象。');
  }
  if (Array.isArray(parsed.nodes) || Array.isArray(parsed.links)) {
    throw new Error(
      '这看起来是 ComfyUI 画布工作流。请在 ComfyUI 中使用“Export Workflow (API)”后再导入。'
    );
  }

  const entries = Object.entries(parsed);
  if (!entries.length) {
    throw new Error('ComfyUI API 工作流不能为空。');
  }

  const apiWorkflow: ComfyApiWorkflow = {};
  const suggestedOutputNodeIds: string[] = [];
  for (const [nodeId, value] of entries) {
    if (!isRecord(value)) {
      throw new Error(`节点 ${nodeId} 不是有效的 API 工作流节点。`);
    }
    if (typeof value.class_type !== 'string' || !value.class_type.trim()) {
      throw new Error(`节点 ${nodeId} 缺少 class_type。`);
    }
    if (!isRecord(value.inputs)) {
      throw new Error(`节点 ${nodeId} 缺少 inputs 对象。`);
    }
    const node = value as ComfyApiWorkflow[string];
    apiWorkflow[nodeId] = node;
    if (
      node.class_type === 'SaveImage' ||
      node.class_type === 'PreviewImage'
    ) {
      suggestedOutputNodeIds.push(nodeId);
    }
  }

  return {
    apiWorkflow,
    nodeCount: entries.length,
    suggestedOutputNodeIds
  };
}

export function comfyWorkflowNameFromFile(fileName: string): string {
  const withoutExtension = fileName.replace(/\.json$/i, '').trim();
  return withoutExtension || 'ComfyUI API 工作流';
}
