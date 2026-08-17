import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  parseGeneratedCustomEventProjectDraft
} from '../../domain/customContent/eventProjectCreation';
import type { CustomEventRoleSlotDraft } from '../../domain/customContent/eventProjectCreation';
import { CustomEventProjectEditor } from './CustomEventProjectEditor';

function draftFixture() {
  return parseGeneratedCustomEventProjectDraft({
    project: {
      title: '证物封条疑云',
      summary: '一个轻量项目。',
      conversionMode: 'structural_adaptation'
    },
    characterCandidates: [],
    eventGroups: [
      {
        eventGroupKey: 'seal-arc',
        title: '封条异常',
        summary: '封条编号不一致。',
        invariantCore: ['封条存在异常'],
        mutableSlots: [],
        forbiddenAdaptations: [],
        characterCandidateKeys: [],
        roleSlots: [],
        stages: [
          {
            stageKey: 'discover',
            title: '发现',
            summary: '核对时发现异常。',
            establishedSourceFacts: [],
            continuationSourceFacts: [],
            hardSourceConstraints: [],
            foreshadowingOptions: [],
            eventNodes: [
              {
                nodeKey: 'check',
                title: '核对登记册',
                summary: '检查编号。',
                prerequisites: [],
                entryConditions: [],
                blockers: [],
                characterUsages: [],
                knowledgeBoundary: {
                  knownBy: [],
                  hiddenFrom: [],
                  readerOnly: false
                },
                possibleOutcomes: ['发现差异'],
                downstreamEffects: []
              }
            ],
            completionHints: [],
            nextStageHints: []
          }
        ],
        entryMode: 'asap',
        reusePolicy: 'save_single_use',
        inheritProjectDeployments: true
      }
    ]
  });
}

function reusableCharacterOption() {
  return {
    candidate: {
      candidateKey: 'character-shared',
      revisionRef: {
        assetKind: 'character' as const,
        assetId: 'character-shared',
        revision: 3,
        checksum: 'checksum-shared-3'
      },
      character: {
        displayName: '郑子豪',
        aliases: [],
        gender: '男',
        profileSummary: '可在多个事件中复用的全局人物。',
        backgroundSummary: '人物资料由人物库维护。',
        corePersonality: ['谨慎'],
        values: ['承诺'],
        coreMotivations: ['保护家人'],
        majorRelationships: [],
        entryMode: 'natural' as const,
        adaptationPolicy: {
          temporalPolicy: 'preserve_life_stage' as const,
          lockedFields: [],
          adaptableFields: [],
          identityAnchors: [],
          permittedTransformations: [],
          forbiddenTransformations: [],
          conflictNotes: []
        }
      }
    }
  };
}

describe('CustomEventProjectEditor', () => {
  it('shows the route, structure phase, validation phase, and elapsed time while waiting', async () => {
    let resolveGeneration!: (draft: ReturnType<typeof draftFixture>) => void;
    const generation = new Promise<ReturnType<typeof draftFixture>>(
      (resolve) => {
        resolveGeneration = resolve;
      }
    );
    render(
      <CustomEventProjectEditor
        profileReady
        generationRouteLabel="SiliconFlow · DeepSeek V4 Flash"
        onGenerate={vi.fn(() => generation)}
        onConsistencyReview={vi.fn()}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('自然语言短事件设定'), {
      target: { value: '创作一个证物封条异常事件。' }
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'AI 生成短事件草稿' })
    );

    const status = screen.getByRole('status', {
      name: 'AI 短事件生成状态'
    });
    expect(status).toHaveTextContent('AI 正在生成短事件草稿');
    expect(status).toHaveTextContent(
      '项目、人物候选、事件组、阶段与事件节点'
    );
    expect(status).toHaveTextContent('阶段 2/2');
    expect(status).toHaveTextContent('Schema、稳定键与引用关系');
    expect(status).toHaveTextContent(
      'SiliconFlow · DeepSeek V4 Flash'
    );
    expect(status).toHaveTextContent('已等待 0 秒');
    expect(
      screen.getByRole('button', { name: '正在生成…' })
    ).toBeDisabled();

    await act(async () => {
      resolveGeneration(draftFixture());
      await generation;
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('status', { name: 'AI 短事件生成状态' })
      ).not.toBeInTheDocument()
    );
  });

  it('generates multiple structured layers and reports issues without overwriting edits', async () => {
    const onGenerate = vi.fn().mockResolvedValue(draftFixture());
    const onConsistencyReview = vi.fn().mockResolvedValue([
      {
        code: 'stage_boundary',
        severity: 'warning',
        path: 'eventGroups[0].stages[0]',
        summary: '阶段结束条件需要确认。'
      }
    ]);
    render(
      <CustomEventProjectEditor
        profileReady
        onGenerate={onGenerate}
        onConsistencyReview={onConsistencyReview}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('自然语言短事件设定'), {
      target: { value: '创作一个证物封条异常事件。' }
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'AI 生成短事件草稿' })
    );
    expect(await screen.findByDisplayValue('证物封条疑云')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('项目摘要'), {
      target: { value: '玩家审核后的项目摘要。' }
    });
    fireEvent.click(screen.getByRole('button', { name: '让 AI 检查' }));
    expect(
      await screen.findByText('阶段结束条件需要确认。')
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('玩家审核后的项目摘要。')
    ).toBeInTheDocument();
  });

  it('supports manual project, stage, node, and deployment review before publish', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CustomEventProjectEditor
        profileReady={false}
        onGenerate={vi.fn()}
        onConsistencyReview={vi.fn()}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '手动填写' }));
    fireEvent.change(screen.getByLabelText('项目标题'), {
      target: { value: '夜班证物疑云' }
    });
    fireEvent.change(screen.getByLabelText('项目摘要'), {
      target: { value: '夜班发现封条异常。' }
    });
    fireEvent.change(screen.getByLabelText('事件组标题'), {
      target: { value: '封条异常' }
    });
    fireEvent.change(screen.getByLabelText('事件组摘要'), {
      target: { value: '证物封条编号不一致。' }
    });
    fireEvent.change(screen.getByLabelText('核心不变量'), {
      target: { value: '封条存在异常' }
    });
    fireEvent.change(screen.getByLabelText('阶段标题'), {
      target: { value: '发现异常' }
    });
    fireEvent.change(screen.getByLabelText('阶段摘要'), {
      target: { value: '核对登记册。' }
    });
    fireEvent.change(screen.getByLabelText('节点标题'), {
      target: { value: '检查编号' }
    });
    fireEvent.change(screen.getByLabelText('节点摘要'), {
      target: { value: '逐项检查登记编号。' }
    });
    fireEvent.change(screen.getByLabelText('可能结果'), {
      target: { value: '确认编号差异' }
    });
    fireEvent.change(
      screen.getByRole('combobox', { name: '香港 1988投放方式' }),
      { target: { value: 'native' } }
    );
    fireEvent.click(screen.getByRole('button', { name: '确认发布' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'publish',
        draft: expect.objectContaining({
          project: expect.objectContaining({ title: '夜班证物疑云' }),
          eventGroups: [
            expect.objectContaining({
              title: '封条异常',
              stages: [
                expect.objectContaining({
                  title: '发现异常',
                  eventNodes: [
                    expect.objectContaining({ title: '检查编号' })
                  ]
                })
              ]
            })
          ]
        }),
        projectDeployments: [
          expect.objectContaining({
            worldpackId: 'hk_1988',
            mode: 'native'
          })
        ]
      })
    );
  });

  it('reuses a published library character and binds information boundaries through a visible role slot', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CustomEventProjectEditor
        profileReady={false}
        initialState={{
          draft: draftFixture(),
          projectDeployments: [
            {
              worldpackId: 'hk_1988',
              mode: 'native',
              defaultEnabledForNewGame: true
            }
          ],
          eventDeploymentOverrides: {}
        }}
        reusableCharacters={[reusableCharacterOption()]}
        onGenerate={vi.fn()}
        onConsistencyReview={vi.fn()}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('复用人物库已有角色'), {
      target: { value: 'character-shared' }
    });
    fireEvent.click(screen.getByRole('button', { name: '引用到本项目' }));
    expect(screen.getByText('引用人物库 · revision 3')).toBeInTheDocument();
    expect(
      screen.getByText(/锁定具体人物 revision/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '添加角色槽' }));
    fireEvent.change(screen.getByLabelText('角色槽标题'), {
      target: { value: '被保护人' }
    });
    fireEvent.change(screen.getByLabelText('角色槽摘要'), {
      target: { value: '事件中的固定当事人。' }
    });
    fireEvent.change(screen.getByLabelText('角色槽绑定模式'), {
      target: { value: 'fixed_character' }
    });
    fireEvent.change(screen.getByLabelText('角色槽固定人物'), {
      target: { value: 'character-shared' }
    });
    fireEvent.click(screen.getByText('信息边界'));
    const knownBy = screen.getByRole('group', { name: '谁知道' });
    fireEvent.click(
      within(knownBy).getByRole('checkbox', {
        name: '被保护人（郑子豪）'
      })
    );

    fireEvent.click(screen.getByRole('button', { name: '确认发布' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const savedDraft = onSave.mock.calls[0][0].draft;
    expect(savedDraft.characterCandidates).toEqual([
      expect.objectContaining({
        candidateKey: 'character-shared',
        revisionRef: expect.objectContaining({
          assetId: 'character-shared',
          revision: 3
        })
      })
    ]);
    expect(
      savedDraft.eventGroups[0].stages[0].eventNodes[0].knowledgeBoundary.knownBy
    ).toEqual([savedDraft.eventGroups[0].roleSlots[0].roleSlotKey]);
  });

  it('binds a role slot to the current save protagonist without a character candidate', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CustomEventProjectEditor
        profileReady={false}
        initialState={{
          draft: draftFixture(),
          projectDeployments: [],
          eventDeploymentOverrides: {}
        }}
        reusableCharacters={[]}
        onGenerate={vi.fn()}
        onConsistencyReview={vi.fn()}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '添加角色槽' }));
    fireEvent.change(screen.getByLabelText('角色槽标题'), {
      target: { value: '本局主角' }
    });
    fireEvent.change(screen.getByLabelText('角色槽摘要'), {
      target: { value: '事件必须围绕当前存档玩家展开。' }
    });
    fireEvent.change(screen.getByLabelText('角色槽绑定模式'), {
      target: { value: 'current_player' }
    });
    fireEvent.click(
      screen.getByRole('button', { name: '添加主角用途' })
    );
    fireEvent.change(screen.getByLabelText('人物用途摘要'), {
      target: { value: '由当前存档主角推动该节点。' }
    });

    fireEvent.click(screen.getByRole('button', { name: '确认发布' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const savedGroup: ReturnType<typeof draftFixture>['eventGroups'][number] =
      onSave.mock.calls[0][0].draft.eventGroups[0];
    const savedSlot = savedGroup.roleSlots[0];
    expect(savedSlot).toMatchObject({
      title: '本局主角',
      bindingMode: 'current_player'
    });
    expect(savedGroup.roleSlots).toHaveLength(1);
    expect(
      savedGroup.stages[0].eventNodes[0].characterUsages[0]
        .roleSlotKey
    ).toBe(savedSlot.roleSlotKey);
    expect(savedSlot.fixedCharacterKey).toBeUndefined();
  });

  it('adds a current-save protagonist directly to a node usage and keeps the late-bound role reference', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CustomEventProjectEditor
        profileReady={false}
        initialState={{
          draft: draftFixture(),
          projectDeployments: [],
          eventDeploymentOverrides: {}
        }}
        reusableCharacters={[]}
        onGenerate={vi.fn()}
        onConsistencyReview={vi.fn()}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: '添加主角用途' })
    );

    const roleSlotSelect = screen.getByLabelText('人物用途角色槽');
    expect(roleSlotSelect).toHaveDisplayValue(
      '当前存档主角｜当前存档主角'
    );
    expect(screen.getByLabelText('人物用途固定人物')).toBeDisabled();
    expect(screen.getByText(/自动绑定玩家正在游玩的那名主角/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('人物用途摘要'), {
      target: { value: '由本局主角接触证物并推动节点。' }
    });

    fireEvent.click(screen.getByRole('button', { name: '确认发布' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const savedGroup: ReturnType<typeof draftFixture>['eventGroups'][number] =
      onSave.mock.calls[0][0].draft.eventGroups[0];
    const playerSlot = savedGroup.roleSlots.find(
      (slot: CustomEventRoleSlotDraft) =>
        slot.bindingMode === 'current_player'
    );
    expect(playerSlot).toBeDefined();
    const savedUsage =
      savedGroup.stages[0].eventNodes[0].characterUsages[0];
    expect(savedUsage).toMatchObject({
      roleSlotKey: playerSlot?.roleSlotKey,
      usageSummary: '由本局主角接触证物并推动节点。'
    });
    expect(savedUsage.characterCandidateKey).toBeUndefined();
  });

  it('upgrades a referenced character revision in place without clearing configured event references', async () => {
    const latest = reusableCharacterOption();
    const draft = draftFixture();
    draft.characterCandidates = [
      {
        ...structuredClone(latest.candidate),
        revisionRef: {
          assetKind: 'character',
          assetId: 'character-shared',
          revision: 1,
          checksum: 'checksum-shared-1'
        },
        character: {
          ...structuredClone(latest.candidate.character),
          profileSummary: '旧 revision 的人物摘要。'
        }
      }
    ];
    draft.eventGroups[0].characterCandidateKeys = ['character-shared'];
    draft.eventGroups[0].roleSlots = [
      {
        roleSlotKey: 'role-protected',
        title: '被保护人',
        summary: '固定使用人物库人物。',
        bindingMode: 'fixed_character',
        fixedCharacterKey: 'character-shared',
        requirements: []
      }
    ];
    draft.eventGroups[0].stages[0].eventNodes[0].characterUsages = [
      {
        usageKey: 'usage-protected',
        roleSlotKey: 'role-protected',
        characterCandidateKey: 'character-shared',
        usageSummary: '在现场提供关键证词。',
        required: true
      }
    ];
    draft.eventGroups[0].stages[0].eventNodes[0].knowledgeBoundary.knownBy = [
      'role-protected'
    ];
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CustomEventProjectEditor
        profileReady={false}
        initialState={{
          draft,
          projectDeployments: [],
          eventDeploymentOverrides: {}
        }}
        reusableCharacters={[latest]}
        onGenerate={vi.fn()}
        onConsistencyReview={vi.fn()}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/人物库已有 revision 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '升级到 revision 3' }));
    expect(screen.getByText(latest.candidate.character.profileSummary)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认发布' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());

    const savedDraft = onSave.mock.calls[0][0].draft;
    expect(savedDraft.characterCandidates[0].revisionRef).toMatchObject({
      revision: 3,
      checksum: 'checksum-shared-3'
    });
    expect(savedDraft.eventGroups[0].characterCandidateKeys).toEqual([
      'character-shared'
    ]);
    expect(savedDraft.eventGroups[0].roleSlots[0]).toMatchObject({
      roleSlotKey: 'role-protected',
      fixedCharacterKey: 'character-shared'
    });
    expect(
      savedDraft.eventGroups[0].stages[0].eventNodes[0].characterUsages[0]
    ).toMatchObject({
      roleSlotKey: 'role-protected',
      characterCandidateKey: 'character-shared'
    });
    expect(
      savedDraft.eventGroups[0].stages[0].eventNodes[0].knowledgeBoundary.knownBy
    ).toEqual(['role-protected']);
  });
});
