import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import type { AiSettings } from '../../domain/settings/types';
import { FeatureConfigPanel } from './FeatureConfigPanel';

describe('FeatureConfigPanel API capabilities', () => {
  it.each([
    ['writebackRepair', '写回修复模型建议', '轻量 / 中档结构化模型'],
    ['npcSimulation', 'NPC 动态模拟模型建议', '中高档通用模型'],
    ['backgroundEvolution', '远场演化模型建议', '中档 / 中高档通用模型'],
    ['auxiliaryGeneration', '辅助生成 API模型建议', '轻量 / 中档生成模型']
  ] as const)('shows a practical model recommendation on the %s page', (page, accessibleName, tier) => {
    render(
      <FeatureConfigPanel
        page={page}
        settings={createDefaultAiSettings()}
        onChange={vi.fn()}
        onOpenApiConfig={vi.fn()}
      />
    );

    const recommendation = screen.getByRole('complementary', { name: accessibleName });
    expect(recommendation).toHaveTextContent(tier);
    expect(within(recommendation).getAllByRole('listitem')).toHaveLength(3);
  });

  it('distinguishes memory summarization from embedding recommendations', () => {
    render(
      <FeatureConfigPanel
        page="memorySummary"
        settings={createDefaultAiSettings()}
        onChange={vi.fn()}
        onOpenApiConfig={vi.fn()}
      />
    );

    const summaryRecommendation = screen.getByRole('complementary', { name: '记忆压缩/摘要模型建议' });
    const vectorRecommendation = screen.getByRole('complementary', { name: '向量检索模型建议' });
    expect(summaryRecommendation).toHaveTextContent('中档通用模型');
    expect(summaryRecommendation).toHaveTextContent('Claude Sonnet 5');
    expect(vectorRecommendation).toHaveTextContent('0.6B–4B');
    expect(vectorRecommendation).toHaveTextContent('Qwen3-Embedding-0.6B');
    expect(within(vectorRecommendation).getAllByRole('listitem')).toHaveLength(3);
  });

  it('keeps unadapted profiles visible but disables them for auxiliary narration', () => {
    const settings: AiSettings = {
      ...createDefaultAiSettings(),
      apiProfiles: [
        {
          id: 'api_anthropic',
          name: 'Anthropic API',
          providerLabel: 'Anthropic',
          interfaceType: 'anthropic',
          baseUrl: 'https://api.anthropic.com/v1',
          apiKey: 'sk-test',
          models: ['claude'],
          createdAt: '2026-07-11T00:00:00.000Z',
          updatedAt: '2026-07-11T00:00:00.000Z'
        }
      ]
    };

    render(
      <FeatureConfigPanel
        page="auxiliaryGeneration"
        settings={settings}
        onChange={vi.fn()}
        onOpenApiConfig={vi.fn()}
      />
    );

    const routeSelect = screen.getByLabelText('辅助生成 API API 配置') as HTMLSelectElement;
    const unsupportedOption = Array.from(routeSelect.options).find((option) => option.value === 'api_anthropic');
    expect(unsupportedOption).toBeDisabled();
    expect(unsupportedOption).toHaveTextContent('Anthropic API（暂不支持叙事调用）');
  });

  it('exposes the post-main background evolution route and its failure boundary', () => {
    render(
      <FeatureConfigPanel
        page="backgroundEvolution"
        settings={createDefaultAiSettings()}
        onChange={vi.fn()}
        onOpenApiConfig={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: '远场演化' })).toBeInTheDocument();
    expect(screen.getByText(/主剧情结算后/)).toBeInTheDocument();
    expect(screen.getByText('主回合优先')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument();
  });
});
