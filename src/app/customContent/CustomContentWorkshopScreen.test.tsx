import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import type { AiSettings } from '../../domain/settings/types';
import {
  CUSTOM_CONTENT_GENERATION_ROUTE_STORAGE_KEY,
  CustomContentWorkshopScreen
} from './CustomContentWorkshopScreen';
import type { CustomContentWorkshopLibrary } from './workshopLibrary';

function settingsFixture(): AiSettings {
  const settings = createDefaultAiSettings();
  settings.apiProfiles = [
    {
      id: 'profile_primary',
      name: '创作线路',
      providerLabel: 'OpenAI Compatible',
      interfaceType: 'openai-compatible',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'secret-must-not-render',
      models: ['model-primary', 'model-backup'],
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z'
    },
    {
      id: 'profile_secondary',
      name: '备用线路',
      providerLabel: 'Local',
      interfaceType: 'ollama',
      baseUrl: 'http://localhost:11434',
      apiKey: '',
      models: ['local-model'],
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z'
    }
  ];
  settings.mainNarrator = {
    apiProfileId: 'profile_primary',
    model: 'model-backup'
  };
  return settings;
}

const library: CustomContentWorkshopLibrary = {
  characters: [
    {
      id: 'character_1',
      kind: 'characters',
      title: '梁静仪',
      summary: '在广播机构工作的项目人物。',
      revision: 2,
      lifecycle: {
        generationStatus: 'ready',
        reviewStatus: 'approved',
        availabilityStatus: 'enabled'
      },
      deployments: [
        {
          worldpackId: 'hk_1988',
          mode: 'native',
          defaultEnabledForNewGame: true
        }
      ],
      projectIds: ['project_1'],
      global: false,
      updatedAt: '2026-07-26T02:00:00.000Z',
      incomingReferences: [],
      characterAsset: {
        characterAssetId: 'character_1',
        latestRevision: 2,
        revisionCount: 2,
        global: false,
        projectIds: ['project_1'],
        createdAt: '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T02:00:00.000Z'
      },
      characterRevision: {
        characterAssetId: 'character_1',
        revision: 2,
        checksum: 'character_checksum',
        displayName: '梁静仪',
        aliases: [],
        gender: '女',
        profileSummary: '在广播机构工作的项目人物。',
        backgroundSummary: '负责整理新闻录音。',
        corePersonality: ['冷静'],
        values: ['事实'],
        coreMotivations: ['保存证据'],
        majorRelationships: [],
        entryMode: 'follow_project',
        adaptationPolicy: {
          temporalPolicy: 'preserve_life_stage',
          lockedFields: ['displayName'],
          adaptableFields: ['occupation']
        },
        deployments: [
          {
            worldpackId: 'hk_1988',
            mode: 'native',
            defaultEnabledForNewGame: true
          }
        ],
        sourceSpans: [],
        lifecycle: {
          generationStatus: 'ready',
          reviewStatus: 'approved',
          availabilityStatus: 'enabled'
        }
      }
    }
  ],
  events: [
    {
      id: 'event_1',
      kind: 'events',
      title: '遗失的录音带',
      summary: '一段来源不明的录音进入新闻部。',
      revision: 1,
      lifecycle: {
        generationStatus: 'ready',
        reviewStatus: 'needs_review',
        availabilityStatus: 'disabled'
      },
      deployments: [
        {
          worldpackId: 'hk_1988',
          mode: 'ai_adapted',
          defaultEnabledForNewGame: false
        }
      ],
      projectIds: ['project_1'],
      updatedAt: '2026-07-26T01:00:00.000Z',
      incomingReferences: []
    }
  ],
  projects: [
    {
      id: 'project_1',
      title: '录音带项目',
      revision: 1
    }
  ],
  projectCount: 1
};

describe('CustomContentWorkshopScreen', () => {
  beforeEach(() => {
    localStorage.removeItem(CUSTOM_CONTENT_GENERATION_ROUTE_STORAGE_KEY);
  });

  it('reuses configured profiles and never renders API keys', () => {
    render(
      <CustomContentWorkshopScreen
        settings={settingsFixture()}
        library={library}
        isLoading={false}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByRole('combobox', { name: '生成接口' })).toHaveValue(
      'profile_primary'
    );
    expect(screen.getByRole('combobox', { name: '生成模型' })).toHaveValue(
      'model-backup'
    );
    expect(screen.queryByText('secret-must-not-render')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: '生成接口' }), {
      target: { value: 'profile_secondary' }
    });
    expect(screen.getByRole('combobox', { name: '生成模型' })).toHaveValue(
      'local-model'
    );
  });

  it('filters obvious non-text character models and can refresh or reveal them', async () => {
    const settings = settingsFixture();
    settings.apiProfiles[0].models = [
      'model-primary',
      'speech-asr',
      'mimo-tts-v2'
    ];
    settings.mainNarrator = {
      apiProfileId: 'profile_primary',
      model: 'model-primary'
    };
    const onRefreshCharacterModels = vi
      .fn()
      .mockResolvedValue(['model-primary', 'new-text-model', 'image-generation']);
    render(
      <CustomContentWorkshopScreen
        settings={settings}
        library={library}
        isLoading={false}
        onBack={vi.fn()}
        onRefreshCharacterModels={onRefreshCharacterModels}
      />
    );

    const modelSelect = screen.getByRole('combobox', { name: '生成模型' });
    expect(modelSelect).toHaveTextContent('model-primary');
    expect(modelSelect).not.toHaveTextContent('speech-asr');
    expect(modelSelect).not.toHaveTextContent('mimo-tts-v2');

    fireEvent.click(screen.getByRole('checkbox', { name: '显示全部模型' }));
    expect(modelSelect).toHaveTextContent('speech-asr');
    expect(modelSelect).toHaveTextContent('mimo-tts-v2');

    fireEvent.click(screen.getByRole('button', { name: '刷新人物模型' }));
    await waitFor(() =>
      expect(onRefreshCharacterModels).toHaveBeenCalledWith('profile_primary')
    );
    expect(
      await screen.findByText(/人物生成模型列表已刷新/)
    ).toBeInTheDocument();
  });

  it('remembers the selected generation profile and model after remounting', async () => {
    const firstView = render(
      <CustomContentWorkshopScreen
        settings={settingsFixture()}
        library={library}
        isLoading={false}
        onBack={vi.fn()}
      />
    );

    fireEvent.change(screen.getByRole('combobox', { name: '生成模型' }), {
      target: { value: 'model-primary' }
    });
    firstView.unmount();

    const secondView = render(
      <CustomContentWorkshopScreen
        settings={settingsFixture()}
        library={library}
        isLoading={false}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByRole('combobox', { name: '生成接口' })).toHaveValue(
      'profile_primary'
    );
    expect(screen.getByRole('combobox', { name: '生成模型' })).toHaveValue(
      'model-primary'
    );

    fireEvent.change(screen.getByRole('combobox', { name: '生成接口' }), {
      target: { value: 'profile_secondary' }
    });
    secondView.unmount();

    render(
      <CustomContentWorkshopScreen
        settings={settingsFixture()}
        library={library}
        isLoading={false}
        onBack={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: '生成接口' })).toHaveValue(
        'profile_secondary'
      )
    );
    expect(screen.getByRole('combobox', { name: '生成模型' })).toHaveValue(
      'local-model'
    );
  });

  it('falls back to a valid generation route when the saved profile disappears', async () => {
    localStorage.setItem(
      CUSTOM_CONTENT_GENERATION_ROUTE_STORAGE_KEY,
      JSON.stringify({
        profileId: 'profile_removed',
        model: 'model-removed'
      })
    );

    render(
      <CustomContentWorkshopScreen
        settings={settingsFixture()}
        library={library}
        isLoading={false}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByRole('combobox', { name: '生成接口' })).toHaveValue(
      'profile_primary'
    );
    expect(screen.getByRole('combobox', { name: '生成模型' })).toHaveValue(
      'model-backup'
    );
    await waitFor(() =>
      expect(
        JSON.parse(
          localStorage.getItem(
            CUSTOM_CONTENT_GENERATION_ROUTE_STORAGE_KEY
          ) ?? '{}'
        )
      ).toEqual({
        profileId: 'profile_primary',
        model: 'model-backup'
      })
    );
  });

  it('switches content types, searches entries, and exposes read-only deployment data', () => {
    render(
      <CustomContentWorkshopScreen
        settings={settingsFixture()}
        library={library}
        isLoading={false}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /梁静仪/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', {
      name: '香港 1988投放方式'
    })).toHaveValue('native');

    fireEvent.click(screen.getByRole('button', { name: /事件.*1 个事件组/ }));
    expect(screen.getByRole('button', {
      name: /遗失的录音带/
    })).toBeInTheDocument();
    expect(screen.getByRole('combobox', {
      name: '香港 1988投放方式'
    })).toHaveValue('ai_adapted');

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索内容' }), {
      target: { value: '不存在' }
    });
    expect(screen.getByText('没有匹配内容')).toBeInTheDocument();
  });

  it('keeps the current-save surface inert when no save is loaded', () => {
    render(
      <CustomContentWorkshopScreen
        settings={settingsFixture()}
        library={library}
        isLoading={false}
        onBack={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: '当前存档' }));
    expect(screen.getByText('尚未加载存档')).toBeInTheDocument();
    expect(screen.getByText(/不会暗中修改任何存档/)).toBeInTheDocument();
  });

  it('imports event/project packages through an explicit file control', async () => {
    const onImportContentPackage = vi.fn().mockResolvedValue({
      importedRevisionCount: 3,
      skippedRevisionCount: 0,
      remapped: false,
      packageKind: 'event_group'
    });
    render(
      <CustomContentWorkshopScreen
        settings={settingsFixture()}
        library={library}
        isLoading={false}
        onBack={vi.fn()}
        onImportContentPackage={onImportContentPackage}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /事件.*1 个事件组/ }));
    expect(
      screen.getByRole('button', { name: '导入内容包' })
    ).toBeInTheDocument();
    const file = new File(['{}'], 'event.cop-event-group.json', {
      type: 'application/json'
    });
    fireEvent.change(screen.getByLabelText('选择事件或项目内容包'), {
      target: { files: [file] }
    });

    await waitFor(() => expect(onImportContentPackage).toHaveBeenCalledWith(file));
    expect(
      await screen.findByText(
        '事件包已导入 3 个 revision；全部保持待审核、停用状态。'
      )
    ).toBeInTheDocument();
  });

  it('opens the long-form source workspace without leaving the content studio', () => {
    render(
      <CustomContentWorkshopScreen
        settings={settingsFixture()}
        library={library}
        sourceLibrary={[]}
        isLoading={false}
        onBack={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /导入长篇/ }));
    expect(
      screen.getByRole('dialog', { name: '导入长篇内容' })
    ).toBeInTheDocument();
    expect(screen.getByText('还没有长篇来源')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭长篇导入' }));
    expect(
      screen.queryByRole('dialog', { name: '导入长篇内容' })
    ).not.toBeInTheDocument();
  });

  it('opens revision editing, exposes references, and keeps batch operations explicit', async () => {
    const onSetManyCharacterAvailability = vi.fn().mockResolvedValue(undefined);
    render(
      <CustomContentWorkshopScreen
        settings={settingsFixture()}
        library={library}
        isLoading={false}
        onBack={vi.fn()}
        onSaveCharacter={vi.fn().mockResolvedValue(undefined)}
        onGenerateCharacter={vi.fn()}
        onReviewCharacter={vi.fn()}
        onSetManyCharacterAvailability={onSetManyCharacterAvailability}
      />
    );

    expect(screen.getByText('录音带项目')).toBeInTheDocument();
    expect(screen.getByText('character_1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', {
      name: '批量选择梁静仪'
    }));
    fireEvent.click(screen.getByRole('button', { name: '批量停用' }));
    expect(onSetManyCharacterAvailability).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'character_1' })],
      'disabled'
    );
    await waitFor(() =>
      expect(screen.getByRole('button', {
        name: '编辑为新 revision'
      })).toBeEnabled()
    );

    fireEvent.click(screen.getByRole('button', {
      name: '编辑为新 revision'
    }));
    expect(screen.getByRole('dialog', {
      name: '编辑 梁静仪'
    })).toBeInTheDocument();
    expect(screen.getByText('保存时创建 revision 3')).toBeInTheDocument();
  });

  it('visually distinguishes enabled and disabled reviewed assets', () => {
    const disabledCharacter = {
      ...library.characters[0],
      id: 'character_2',
      title: '陈慧敏',
      lifecycle: {
        ...library.characters[0].lifecycle,
        availabilityStatus: 'disabled' as const
      },
      characterAsset: {
        ...library.characters[0].characterAsset!,
        characterAssetId: 'character_2'
      },
      characterRevision: {
        ...library.characters[0].characterRevision!,
        characterAssetId: 'character_2',
        displayName: '陈慧敏',
        lifecycle: {
          ...library.characters[0].characterRevision!.lifecycle,
          availabilityStatus: 'disabled' as const
        }
      }
    };
    render(
      <CustomContentWorkshopScreen
        settings={settingsFixture()}
        library={{
          ...library,
          characters: [...library.characters, disabledCharacter]
        }}
        isLoading={false}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText('已启用')).toHaveClass('ccw-lifecycle-enabled');
    expect(screen.getByText('已启用')).toHaveAttribute(
      'data-availability',
      'enabled'
    );
    expect(screen.getByText('已停用')).toHaveClass('ccw-lifecycle-disabled');
    expect(screen.getByText('已停用')).toHaveAttribute(
      'data-availability',
      'disabled'
    );
    expect(screen.getByRole('button', { name: '停用' })).toHaveClass(
      'ccw-action-disable'
    );
    fireEvent.click(screen.getByRole('button', { name: /陈慧敏/ }));
    expect(screen.getByRole('button', { name: '启用' })).toHaveClass(
      'ccw-action-enable'
    );
  });

  it('requires confirmation before deleting characters and events', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDeleteCharacter = vi.fn().mockResolvedValue(undefined);
    const onDeleteEvent = vi.fn().mockResolvedValue(undefined);
    render(
      <CustomContentWorkshopScreen
        settings={settingsFixture()}
        library={library}
        isLoading={false}
        onBack={vi.fn()}
        onDeleteCharacter={onDeleteCharacter}
        onDeleteEvent={onDeleteEvent}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '删除人物' }));
    await waitFor(() =>
      expect(onDeleteCharacter).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'character_1' })
      )
    );
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('确定永久删除人物“梁静仪”')
    );

    fireEvent.click(
      screen.getByRole('button', { name: /事件.*1 个事件组/ })
    );
    fireEvent.click(screen.getByRole('button', { name: '删除事件' }));
    await waitFor(() =>
      expect(onDeleteEvent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'event_1' })
      )
    );
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('确定永久删除事件“遗失的录音带”')
    );
    confirm.mockRestore();
  });
});
