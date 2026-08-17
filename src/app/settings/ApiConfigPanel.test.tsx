import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import type { AiSettings } from '../../domain/settings/types';
import { ApiConfigPanel } from './ApiConfigPanel';

describe('ApiConfigPanel', () => {
  it('explains the recommended capability tier for the main narrator', () => {
    render(<ApiConfigPanel settings={createDefaultAiSettings()} onChange={vi.fn()} />);

    const recommendation = screen.getByRole('complementary', { name: '主剧情模型建议' });
    expect(recommendation).toHaveTextContent('旗舰级 / 高阶通用模型');
    expect(recommendation).toHaveTextContent('中等即可');
    expect(within(recommendation).getAllByRole('listitem')).toHaveLength(3);
    expect(recommendation).toHaveTextContent('GPT-5.6 Sol');
    expect(recommendation).toHaveTextContent('Claude Opus 4.8');
    expect(recommendation).toHaveTextContent('Gemini 3.1 Pro Preview');
  });

  it('explains V2 stage budgets and repair inheritance under the main route cap', () => {
    render(
      <ApiConfigPanel
        settings={createDefaultAiSettings()}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByText(/主剧情最大输出是本线路的请求上限/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/各主阶段使用不超过线路上限的独立预算/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/局部修复会继承本线路的最大输出上限/)
    ).toBeInTheDocument();
    expect(screen.getByText(/避免固定 4K/)).toBeInTheDocument();
    expect(screen.queryByText(/新开局分为两次主剧情生成/)).not.toBeInTheDocument();
    expect(screen.queryByText(/开局两个阶段受保护最低输出/)).not.toBeInTheDocument();
  });

  it('shows API import/export controls with a local secret warning', () => {
    render(<ApiConfigPanel settings={createDefaultAiSettings()} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: '导出 API 设置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导入 API 设置' })).toBeInTheDocument();
    expect(screen.getByLabelText('导入 API 设置文件')).toBeInTheDocument();
    expect(screen.getByText('导出的 JSON 包含 API Key，只用于本机测试和私有备份。')).toBeInTheDocument();
  });

  it('imports an API settings JSON file and replaces API routes only', async () => {
    const onChange = vi.fn();
    const payload = JSON.stringify({
      app: 'sorry-im-a-cop-v2',
      schemaVersion: 1,
      exportedAt: '2026-07-04T10:00:00.000Z',
      apiProfiles: [
        {
          id: 'api_imported',
          name: 'Imported API',
          providerLabel: 'OpenAI 兼容',
          interfaceType: 'openai-compatible',
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'sk-imported',
          models: ['story-model', 'summary-model'],
          defaultMaxTokens: 32768,
          defaultTemperature: 0.7,
          createdAt: '2026-07-04T10:00:00.000Z',
          updatedAt: '2026-07-04T10:00:00.000Z'
        }
      ],
      mainNarrator: {
        apiProfileId: 'api_imported',
        model: 'story-model',
        maxTokens: 32768,
        temperature: 0.7
      },
      featureRoutes: {
        writebackRepair: { mode: 'follow-main' },
        memorySummary: {
          mode: 'custom',
          apiProfileId: 'api_imported',
          model: 'summary-model'
        },
        memoryVector: { mode: 'disabled' },
        npcSimulation: { mode: 'follow-main' }
      }
    });

    render(<ApiConfigPanel settings={createDefaultAiSettings()} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('导入 API 设置文件'), {
      target: {
        files: [new File([payload], 'local-api-settings.json', { type: 'application/json' })]
      }
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const imported = onChange.mock.calls[0][0] as AiSettings;
    expect(imported.apiProfiles[0].apiKey).toBe('sk-imported');
    expect(imported.mainNarrator?.model).toBe('story-model');
    expect(imported.featureRoutes.memorySummary).toEqual({
      mode: 'custom',
      apiProfileId: 'api_imported',
      model: 'summary-model'
    });
    expect(screen.getByRole('status')).toHaveTextContent('API 设置已导入。');
  });

  it('keeps unadapted profiles visible but disables them for main narration', () => {
    const settings: AiSettings = {
      ...createDefaultAiSettings(),
      apiProfiles: [
        {
          id: 'api_supported',
          name: 'Supported API',
          providerLabel: 'OpenAI compatible',
          interfaceType: 'openai-compatible',
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'sk-test',
          models: ['story-model'],
          createdAt: '2026-07-11T00:00:00.000Z',
          updatedAt: '2026-07-11T00:00:00.000Z'
        },
        {
          id: 'api_ollama',
          name: 'Local Ollama',
          providerLabel: 'Ollama',
          interfaceType: 'ollama',
          baseUrl: 'http://127.0.0.1:11434',
          apiKey: '',
          models: ['qwen3'],
          createdAt: '2026-07-11T00:00:00.000Z',
          updatedAt: '2026-07-11T00:00:00.000Z'
        }
      ]
    };

    render(<ApiConfigPanel settings={settings} onChange={vi.fn()} />);

    const mainSelect = screen.getByLabelText('主剧情 API') as HTMLSelectElement;
    const unsupportedOption = Array.from(mainSelect.options).find((option) => option.value === 'Local Ollama');
    expect(unsupportedOption).toBeDisabled();
    expect(unsupportedOption).toHaveTextContent('Local Ollama（暂不支持叙事调用）');
    fireEvent.click(screen.getByRole('button', { name: /Local Ollama/ }));
    expect(screen.getByText('当前接口类型暂不支持叙事调用。')).toBeInTheDocument();
  });

  it('saves a keyless Ollama profile without auto-selecting it for main narration', () => {
    const onChange = vi.fn();
    function Harness() {
      const [settings, setSettings] = useState(createDefaultAiSettings());
      return (
        <ApiConfigPanel
          settings={settings}
          onChange={(next) => {
            onChange(next);
            setSettings(next);
          }}
        />
      );
    }
    render(<Harness />);

    fireEvent.change(screen.getByLabelText('配置名称'), { target: { value: 'Local Ollama' } });
    fireEvent.change(screen.getByLabelText('接口类型'), { target: { value: 'ollama' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'http://127.0.0.1:11434' } });
    fireEvent.change(screen.getByLabelText('模型列表'), { target: { value: 'qwen3' } });
    fireEvent.click(screen.getByRole('button', { name: '保存 API 档案' }));

    expect(onChange).toHaveBeenCalled();
    expect((onChange.mock.calls[0][0] as AiSettings).apiProfiles[0].apiKey).toBe('');
    expect(screen.getByLabelText('主剧情 API')).toHaveValue('');
  });

  it('keeps three newly created profiles separate when different names normalize to the same id slug', () => {
    const onChange = vi.fn();
    function Harness() {
      const [settings, setSettings] = useState(createDefaultAiSettings());
      return (
        <ApiConfigPanel
          settings={settings}
          onChange={(next) => {
            onChange(next);
            setSettings(next);
          }}
        />
      );
    }
    render(<Harness />);

    ['GG Chan', 'GG-Chan', 'GG_Chan'].forEach((name, index) => {
      if (index > 0) {
        fireEvent.click(screen.getByRole('button', { name: '新建 API 配置' }));
      }
      fireEvent.change(screen.getByLabelText('配置名称'), { target: { value: name } });
      fireEvent.change(screen.getByLabelText('Base URL'), {
        target: { value: `https://api-${index + 1}.example.com/v1` }
      });
      fireEvent.change(screen.getByLabelText('API Key'), { target: { value: `sk-test-${index + 1}` } });
      fireEvent.click(screen.getByRole('button', { name: '保存 API 档案' }));
    });

    const latestSettings = onChange.mock.calls.at(-1)?.[0] as AiSettings;
    expect(latestSettings.apiProfiles).toHaveLength(3);
    expect(latestSettings.apiProfiles.map((profile) => profile.id)).toEqual([
      'api_gg_chan',
      'api_gg_chan_2',
      'api_gg_chan_3'
    ]);
    expect(latestSettings.apiProfiles.map((profile) => profile.name)).toEqual([
      'GG Chan',
      'GG-Chan',
      'GG_Chan'
    ]);
    const profileList = within(screen.getByRole('complementary', { name: 'API 档案列表' }));
    expect(profileList.getAllByRole('button')).toHaveLength(3);

    fireEvent.click(profileList.getByRole('button', { name: /GG ChanOpenAI/ }));
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://api-1-edited.example.com/v1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存 API 档案' }));

    const editedSettings = onChange.mock.calls.at(-1)?.[0] as AiSettings;
    expect(editedSettings.apiProfiles).toHaveLength(3);
    expect(editedSettings.apiProfiles[0]).toMatchObject({
      id: 'api_gg_chan',
      name: 'GG Chan',
      baseUrl: 'https://api-1-edited.example.com/v1'
    });
  });
});
