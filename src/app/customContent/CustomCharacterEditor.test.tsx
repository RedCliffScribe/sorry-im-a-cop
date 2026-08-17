import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  parseGeneratedCustomCharacterDraft
} from '../../domain/customContent/characterCreation';
import { CustomCharacterEditor } from './CustomCharacterEditor';

function draftFixture() {
  return parseGeneratedCustomCharacterDraft({
    displayName: '林若晴',
    aliases: ['阿晴'],
    gender: '女',
    profileSummary: '一名法证人员。',
    backgroundSummary: '熟悉证物流程。',
    corePersonality: ['冷静'],
    values: ['真相'],
    coreMotivations: ['保护证据'],
    majorRelationships: [],
    temporalPolicy: 'preserve_life_stage',
    lockedFields: [],
    adaptableFields: []
  });
}

function generationResult() {
  return {
    draft: draftFixture(),
    issues: [],
    recovery: 'none' as const,
    diagnostics: {
      attemptCount: 1,
      rawTextLength: 100,
      localJsonRepairApplied: false,
      normalizedFieldCount: 0,
      removedPaths: [],
      formatRepairAttempted: false,
      recovery: 'none' as const
    }
  };
}

describe('CustomCharacterEditor', () => {
  it('shows the route, generation phase, validation phase, and elapsed time while waiting', async () => {
    let resolveGeneration!: (draft: ReturnType<typeof generationResult>) => void;
    const generation = new Promise<ReturnType<typeof generationResult>>(
      (resolve) => {
        resolveGeneration = resolve;
      }
    );
    render(
      <CustomCharacterEditor
        projects={[]}
        profileReady
        generationRouteLabel="Yuqing · Gemini 3 Flash"
        onGenerate={vi.fn(() => generation)}
        onConsistencyReview={vi.fn()}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('自然语言人物设定'), {
      target: { value: '创建一名冷静的法证人员。' }
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'AI 生成人物草稿' })
    );

    const status = screen.getByRole('status', {
      name: 'AI 人物生成状态'
    });
    expect(status).toHaveTextContent('AI 正在生成人物草稿');
    expect(status).toHaveTextContent('阶段 1/3');
    expect(status).toHaveTextContent('最终一定进入可编辑草稿');
    expect(status).toHaveTextContent('Yuqing · Gemini 3 Flash');
    expect(status).toHaveTextContent('已等待 0 秒');
    expect(
      screen.getByRole('button', { name: '正在生成…' })
    ).toBeDisabled();

    await act(async () => {
      resolveGeneration(generationResult());
      await generation;
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('status', { name: 'AI 人物生成状态' })
      ).not.toBeInTheDocument()
    );
  });

  it('opens a locally normalized draft with a visible non-blocking warning', async () => {
    render(
      <CustomCharacterEditor
        projects={[]}
        profileReady
        onGenerate={vi.fn().mockResolvedValue({
          ...generationResult(),
          issues: [
            {
              code: 'field_coerced',
              path: 'corePersonality',
              summary: '核心性格已从文本整理为列表。'
            }
          ],
          recovery: 'local_normalization',
          diagnostics: {
            ...generationResult().diagnostics,
            normalizedFieldCount: 1,
            recovery: 'local_normalization'
          }
        })}
        onConsistencyReview={vi.fn()}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('自然语言人物设定'), {
      target: { value: '创建一名法证人员。' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'AI 生成人物草稿' }));

    expect(await screen.findByDisplayValue('林若晴')).toBeInTheDocument();
    expect(screen.getByText('草稿已生成，已自动整理 1 处')).toBeInTheDocument();
    expect(screen.getByText('核心性格已从文本整理为列表。')).toBeInTheDocument();
  });

  it('preserves the player description and can convert provider failure into a manual draft', async () => {
    render(
      <CustomCharacterEditor
        projects={[]}
        profileReady
        onGenerate={vi.fn().mockRejectedValue(new Error('供应商暂时限流（429）。'))}
        onConsistencyReview={vi.fn()}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('自然语言人物设定'), {
      target: { value: '一名不愿透露姓名的线人。' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'AI 生成人物草稿' }));
    expect(await screen.findByText('供应商暂时限流（429）。')).toBeInTheDocument();
    expect(screen.getByDisplayValue('一名不愿透露姓名的线人。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '转为手动草稿' }));
    expect(screen.getByLabelText('姓名').closest('label')).toHaveAttribute(
      'data-missing',
      'true'
    );
    expect(
      screen.getAllByDisplayValue('一名不愿透露姓名的线人。')
    ).toHaveLength(3);
  });

  it('generates a validated draft, reports consistency issues, and never overwrites fields', async () => {
    const onGenerate = vi.fn().mockResolvedValue(generationResult());
    const onConsistencyReview = vi.fn().mockResolvedValue([
      {
        code: 'timeline',
        severity: 'warning',
        summary: '履历时间需要确认。',
        suggestion: '补充培训阶段。'
      }
    ]);
    render(
      <CustomCharacterEditor
        projects={[]}
        profileReady
        onGenerate={onGenerate}
        onConsistencyReview={onConsistencyReview}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('自然语言人物设定'), {
      target: { value: '创建一名冷静的法证人员。' }
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'AI 生成人物草稿'
    }));
    expect(await screen.findByDisplayValue('林若晴')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('人物摘要'), {
      target: { value: '玩家修改后的人物摘要。' }
    });
    fireEvent.click(screen.getByRole('button', { name: '让 AI 检查' }));
    expect(await screen.findByText('履历时间需要确认。')).toBeInTheDocument();
    expect(screen.getByDisplayValue('玩家修改后的人物摘要。')).toBeInTheDocument();
  });

  it('supports manual review and passes explicit scope and deployment choices to publish', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CustomCharacterEditor
        projects={[]}
        profileReady={false}
        onGenerate={vi.fn()}
        onConsistencyReview={vi.fn()}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '手动填写' }));
    fireEvent.change(screen.getByLabelText('姓名'), {
      target: { value: '何志明' }
    });
    fireEvent.change(screen.getByLabelText('性别'), {
      target: { value: '男' }
    });
    fireEvent.change(screen.getByLabelText('人物摘要'), {
      target: { value: '夜班探员。' }
    });
    fireEvent.change(screen.getByLabelText('背景摘要'), {
      target: { value: '长期处理街头案件。' }
    });
    fireEvent.change(screen.getByLabelText('核心性格'), {
      target: { value: '耐心' }
    });
    fireEvent.change(screen.getByLabelText('价值观'), {
      target: { value: '责任' }
    });
    fireEvent.change(screen.getByLabelText('核心动机'), {
      target: { value: '找出真相' }
    });
    fireEvent.change(screen.getByRole('combobox', {
      name: '香港 1988投放方式'
    }), {
      target: { value: 'native' }
    });
    fireEvent.click(screen.getByRole('button', { name: '确认发布' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        global: true,
        projectIds: [],
        mode: 'publish',
        deployments: [
          {
            worldpackId: 'hk_1988',
            mode: 'native',
            defaultEnabledForNewGame: false
          }
        ],
        draft: expect.objectContaining({
          displayName: '何志明',
          corePersonality: ['耐心']
        })
      })
    );
  });
});
