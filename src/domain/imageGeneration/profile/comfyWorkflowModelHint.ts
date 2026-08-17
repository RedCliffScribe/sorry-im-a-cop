import type { ComfyWorkflowTemplate } from './types';

export function readComfyWorkflowCheckpointName(
  workflow?: ComfyWorkflowTemplate
): string | undefined {
  const binding = workflow?.bindings.checkpoint;
  if (!workflow || !binding) return undefined;
  const value = workflow.apiWorkflow[binding.nodeId]?.inputs[binding.inputName];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
