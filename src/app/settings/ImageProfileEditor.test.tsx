import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultImageApiProfile } from '../../domain/imageGeneration/profile';
import { ImageProfileEditor } from './ImageProfileEditor';

const NOW = '2026-07-26T00:00:00.000Z';

describe('ImageProfileEditor ComfyUI workflow parameters', () => {
  it('imports a ComfyUI API workflow file into the existing strict editor', async () => {
    const onSaveWorkflow = vi.fn(async () => undefined);
    render(<ImageProfileEditor
      profile={createDefaultImageApiProfile('comfyui-workflow', 'profile-comfy', NOW)}
      credentials={[]}
      workflows={[]}
      onChange={() => undefined}
      onSaveCredential={async () => 'credential'}
      onSaveWorkflow={onSaveWorkflow}
    />);
    const apiWorkflow = {
      '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
      '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'cop-v2' } }
    };
    const file = new File(
      [JSON.stringify(apiWorkflow)],
      'portrait-workflow.json',
      { type: 'application/json' }
    );

    fireEvent.change(
      screen.getByLabelText('导入 ComfyUI API 工作流 JSON 文件'),
      { target: { files: [file] } }
    );

    await waitFor(() =>
      expect(screen.getByLabelText('API 工作流 JSON')).toHaveValue(
        JSON.stringify(apiWorkflow, null, 2)
      )
    );
    expect(screen.getByLabelText('模板名称')).toHaveValue('portrait-workflow');
    expect(screen.getByLabelText('输出节点 ID（逗号分隔）')).toHaveValue('9');
    expect(screen.getByRole('status')).toHaveTextContent(
      '请确认提示词、输出和其他节点绑定后再保存'
    );
    expect(onSaveWorkflow).not.toHaveBeenCalled();
  });

  it('rejects a ComfyUI canvas workflow file instead of treating it as an API request', async () => {
    render(<ImageProfileEditor
      profile={createDefaultImageApiProfile('comfyui-workflow', 'profile-comfy', NOW)}
      credentials={[]}
      workflows={[]}
      onChange={() => undefined}
      onSaveCredential={async () => 'credential'}
      onSaveWorkflow={async () => undefined}
    />);
    const file = new File(
      [JSON.stringify({ nodes: [], links: [], version: 0.4 })],
      'canvas-workflow.json',
      { type: 'application/json' }
    );

    fireEvent.change(
      screen.getByLabelText('导入 ComfyUI API 工作流 JSON 文件'),
      { target: { files: [file] } }
    );

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '这看起来是 ComfyUI 画布工作流'
      )
    );
    expect(screen.getByLabelText('API 工作流 JSON')).toHaveValue('');
  });

  it('rejects an oversized workflow file before reading it into memory', async () => {
    render(<ImageProfileEditor
      profile={createDefaultImageApiProfile('comfyui-workflow', 'profile-comfy', NOW)}
      credentials={[]}
      workflows={[]}
      onChange={() => undefined}
      onSaveCredential={async () => 'credential'}
      onSaveWorkflow={async () => undefined}
    />);
    const file = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      'oversized-workflow.json',
      { type: 'application/json' }
    );

    fireEvent.change(
      screen.getByLabelText('导入 ComfyUI API 工作流 JSON 文件'),
      { target: { files: [file] } }
    );

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '工作流文件不能超过 5 MiB'
      )
    );
    expect(screen.getByLabelText('API 工作流 JSON')).toHaveValue('');
  });

  it('lets players declare a typed workflow input without arbitrary patch syntax', async () => {
    const onSaveWorkflow = vi.fn(async () => undefined);
    render(<ImageProfileEditor
      profile={createDefaultImageApiProfile('comfyui-workflow', 'profile-comfy', NOW)}
      credentials={[]}
      workflows={[]}
      onChange={() => undefined}
      onSaveCredential={async () => 'credential'}
      onSaveWorkflow={onSaveWorkflow}
    />);

    fireEvent.change(screen.getByLabelText('模板名称'), { target: { value: '身份保持工作流' } });
    fireEvent.change(screen.getByLabelText('输出节点 ID（逗号分隔）'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('API 工作流 JSON'), {
      target: {
        value: JSON.stringify({
          '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
          '3': { class_type: 'KSampler', inputs: { denoise: 0.55 } },
          '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'output' } }
        })
      }
    });
    fireEvent.change(screen.getByLabelText('正向提示词节点 ID（必填）'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '新增开放参数' }));
    fireEvent.change(screen.getByLabelText('开放参数 1 参数键'), { target: { value: 'denoise' } });
    fireEvent.change(screen.getByLabelText('开放参数 1 显示名称'), { target: { value: '重绘幅度' } });
    fireEvent.change(screen.getByLabelText('开放参数 1 节点 ID'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('开放参数 1 输入名'), { target: { value: 'denoise' } });
    const parameterGroup = screen.getByRole('group', { name: '开放参数 1' });
    fireEvent.change(parameterGroup.querySelector('input[type="number"]')!, { target: { value: '0' } });
    const numericInputs = parameterGroup.querySelectorAll('input[type="number"]');
    fireEvent.change(numericInputs[1], { target: { value: '1' } });
    fireEvent.change(numericInputs[2], { target: { value: '0.01' } });
    fireEvent.click(screen.getByRole('button', { name: '校验并保存工作流' }));

    await waitFor(() => expect(onSaveWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      name: '身份保持工作流',
      bindings: expect.objectContaining({
        positivePrompt: { nodeId: '1', inputName: 'text' }
      }),
      exposedParameters: [{
        key: 'denoise',
        label: '重绘幅度',
        description: undefined,
        binding: { nodeId: '3', inputName: 'denoise' },
        valueType: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        options: undefined
      }],
      outputNodeIds: ['9']
    })));
    expect(screen.queryByLabelText(/JSON Patch/i)).not.toBeInTheDocument();
  });
});
