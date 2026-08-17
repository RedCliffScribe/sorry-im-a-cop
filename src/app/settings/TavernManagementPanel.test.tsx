import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import type { AiSettings } from '../../domain/settings/types';
import { TavernManagementPanel } from './TavernManagementPanel';

function Harness() {
  const [settings, setSettings] = useState<AiSettings>(createDefaultAiSettings());
  return <TavernManagementPanel settings={settings} onChange={setSettings} />;
}

function createPresetFile() {
  return new File([JSON.stringify({
    name: '独立开关测试',
    prompts: [
      {
        identifier: 'first',
        name: '第一条',
        role: 'system',
        system_prompt: true,
        content: '第一条创作规则'
      },
      {
        identifier: 'second',
        name: '第二条',
        role: 'system',
        system_prompt: true,
        content: '第二条创作规则'
      }
    ],
    prompt_order: [{
      character_id: 100001,
      order: [
        { identifier: 'first', enabled: true },
        { identifier: 'second', enabled: true }
      ]
    }]
  })], 'independent-switches.json', { type: 'application/json' });
}

describe('TavernManagementPanel', () => {
  it('imports a preset and toggles each ordered item independently', async () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText('导入酒馆预设'), {
      target: { files: [createPresetFile()] }
    });

    await waitFor(() => expect(screen.getByText(/已导入“独立开关测试”/)).toBeInTheDocument());
    expect(screen.getByText('2 / 2 条启用')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '条目管理' }));

    const first = screen.getByRole('checkbox', { name: /第一条/ });
    const second = screen.getByRole('checkbox', { name: /第二条/ });
    expect(first).toBeChecked();
    expect(second).toBeChecked();

    fireEvent.click(first);

    expect(first).not.toBeChecked();
    expect(second).toBeChecked();
  });

  it('searches and filters compact rows before opening a single editor', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('导入酒馆预设'), {
      target: { files: [createPresetFile()] }
    });
    await waitFor(() => expect(screen.getByText(/已导入“独立开关测试”/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: '条目管理' }));

    expect(screen.queryByLabelText('第一条 内容')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('搜索酒馆条目'), {
      target: { value: '第二条创作规则' }
    });

    expect(screen.queryByText(/1\. 第一条/)).not.toBeInTheDocument();
    expect(screen.getByText(/2\. 第二条/)).toBeInTheDocument();
    expect(screen.getByText('筛选结果 1 条')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect(screen.getByLabelText('第二条 内容')).toHaveValue('第二条创作规则');
  });

  it('keeps custom CoT and reasoning isolation as separate controls', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('tab', { name: '自定义 CoT' }));

    expect(screen.getByRole('checkbox', { name: '启用自定义 CoT' })).not.toBeChecked();
    expect(screen.getByLabelText('接收方式')).toHaveValue('off');
    expect(screen.getByText(/不会写入正文、人物记忆或存档事实/)).toBeInTheDocument();
  });
});
