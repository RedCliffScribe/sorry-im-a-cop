import type {
  ComfyInputBinding,
  ComfyWorkflowExposedParameter,
  ComfyWorkflowParameterValue,
  ComfyWorkflowTemplate
} from './types';

export interface ResolvedComfyWorkflowParameter {
  key: string;
  binding: ComfyInputBinding;
  value: ComfyWorkflowParameterValue;
}

function assertParameterValue(
  parameter: ComfyWorkflowExposedParameter,
  value: ComfyWorkflowParameterValue
): void {
  const label = parameter.label || parameter.key;
  switch (parameter.valueType) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`ComfyUI 参数“${label}”必须是数值。`);
      }
      break;
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error(`ComfyUI 参数“${label}”必须是整数。`);
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new Error(`ComfyUI 参数“${label}”必须是开关值。`);
      }
      break;
    case 'text':
      if (typeof value !== 'string') {
        throw new Error(`ComfyUI 参数“${label}”必须是文本。`);
      }
      break;
    case 'select':
      if (typeof value !== 'string' || !parameter.options?.some((option) => option.value === value)) {
        throw new Error(`ComfyUI 参数“${label}”不是允许的选项。`);
      }
      break;
  }
  if (typeof value === 'number') {
    if (parameter.min !== undefined && value < parameter.min) {
      throw new Error(`ComfyUI 参数“${label}”不能小于 ${parameter.min}。`);
    }
    if (parameter.max !== undefined && value > parameter.max) {
      throw new Error(`ComfyUI 参数“${label}”不能大于 ${parameter.max}。`);
    }
  }
}

export function resolveComfyWorkflowParameterOverrides(
  workflow: ComfyWorkflowTemplate,
  overrides: Record<string, ComfyWorkflowParameterValue> | undefined
): ResolvedComfyWorkflowParameter[] {
  if (!overrides || Object.keys(overrides).length === 0) return [];
  const definitions = new Map(
    (workflow.exposedParameters ?? []).map((parameter) => [parameter.key, parameter] as const)
  );
  return Object.entries(overrides).map(([key, value]) => {
    const parameter = definitions.get(key);
    if (!parameter) {
      throw new Error(`ComfyUI 预设字段 ${key} 没有对应的开放参数声明。`);
    }
    assertParameterValue(parameter, value);
    return { key, binding: parameter.binding, value };
  });
}
