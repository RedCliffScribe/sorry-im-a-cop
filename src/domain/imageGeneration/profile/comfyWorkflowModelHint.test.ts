import { describe, expect, it } from 'vitest';
import type { ComfyWorkflowTemplate } from './types';
import { readComfyWorkflowCheckpointName } from './comfyWorkflowModelHint';

const workflow: ComfyWorkflowTemplate = {
  workflowTemplateId: 'workflow_illustrious',
  name: 'Illustrious',
  apiWorkflow: {
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: 'asianBlendIllustrious_v10.safetensors' }
    }
  },
  workflowHash: 'a'.repeat(64),
  bindings: {
    positivePrompt: { nodeId: '6', inputName: 'text' },
    checkpoint: { nodeId: '4', inputName: 'ckpt_name' }
  },
  outputNodeIds: ['9'],
  revision: 1,
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z'
};

describe('readComfyWorkflowCheckpointName', () => {
  it('reads only the explicitly declared checkpoint binding', () => {
    expect(readComfyWorkflowCheckpointName(workflow))
      .toBe('asianBlendIllustrious_v10.safetensors');
    expect(readComfyWorkflowCheckpointName({
      ...workflow,
      bindings: { positivePrompt: workflow.bindings.positivePrompt }
    })).toBeUndefined();
  });
});
