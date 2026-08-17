import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbCustomContentRepository } from '../../domain/customContent/IndexedDbCustomContentRepository';
import { createCustomContentRevisionRef } from '../../domain/customContent/assetFoundation';
import { saveCustomCharacterRevision } from '../../domain/customContent/characterManagement';
import { createDefaultCustomCharacterAdaptationPolicy } from '../../domain/customContent/worldAdaptation';
import { IndexedDbSaveRepository } from '../../domain/persistence/IndexedDbSaveRepository';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import {
  AI_SETTINGS_STORAGE_KEY
} from '../../domain/settings/LocalStorageSettingsRepository';
import { CustomContentWorkshopPage } from './CustomContentWorkshopPage';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('database deletion blocked'));
  });
}

beforeEach(async () => {
  localStorage.clear();
  window.history.replaceState({}, '', '/custom-content');
  await Promise.all([
    deleteDatabase('sorry-im-a-cop-v2-custom-content'),
    deleteDatabase('sorry-im-a-cop-v2-saves')
  ]);
});

describe('CustomContentWorkshopPage', () => {
  it('uses the existing Hong Kong Traditional locale pipeline', async () => {
    const settings = createDefaultAiSettings();
    settings.game.language = 'zh-Hant-HK';
    localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));

    render(<CustomContentWorkshopPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', {
        name: '自定義內容工坊'
      })).toBeInTheDocument()
    );
    expect(document.documentElement.lang).toBe('zh-Hant-HK');
    expect(screen.getByRole('tab', { name: '當前存檔' })).toBeInTheDocument();
  });

  it('creates and publishes a manually reviewed character through the real local repository', async () => {
    render(<CustomContentWorkshopPage />);

    await screen.findByRole('heading', { name: '自定义内容工坊' });
    fireEvent.click(screen.getByRole('button', { name: '新建人物' }));
    fireEvent.click(screen.getByRole('button', { name: '手动填写' }));
    fireEvent.change(screen.getByLabelText('姓名'), {
      target: { value: '林若晴' }
    });
    fireEvent.change(screen.getByLabelText('性别'), {
      target: { value: '女' }
    });
    fireEvent.change(screen.getByLabelText('人物摘要'), {
      target: { value: '一名法证人员。' }
    });
    fireEvent.change(screen.getByLabelText('背景摘要'), {
      target: { value: '熟悉证物流程。' }
    });
    fireEvent.change(screen.getByLabelText('核心性格'), {
      target: { value: '冷静' }
    });
    fireEvent.change(screen.getByLabelText('价值观'), {
      target: { value: '真相' }
    });
    fireEvent.change(screen.getByLabelText('核心动机'), {
      target: { value: '保护证据' }
    });
    const deploymentSelect = screen
      .getAllByRole('combobox', { name: '香港 1988投放方式' })
      .find((element) => !(element as HTMLSelectElement).disabled);
    expect(deploymentSelect).toBeDefined();
    fireEvent.change(deploymentSelect!, {
      target: { value: 'native' }
    });
    fireEvent.click(screen.getByRole('button', { name: '确认发布' }));

    expect(await screen.findByRole('button', { name: /林若晴/ }))
      .toBeInTheDocument();
    const repository = new IndexedDbCustomContentRepository();
    const assets = await repository.listCharacterAssets();
    expect(assets).toHaveLength(1);
    expect(
      await repository.getCharacterRevision(
        assets[0].characterAssetId,
        assets[0].latestRevision
      )
    ).toMatchObject({
      displayName: '林若晴',
      lifecycle: {
        reviewStatus: 'approved',
        availabilityStatus: 'enabled'
      }
    });

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '删除人物' }));
    expect(
      await screen.findByText('人物“林若晴”已永久删除。')
    ).toBeInTheDocument();
    expect(await repository.listCharacterAssets()).toEqual([]);
    confirm.mockRestore();
  });

  it('creates a light project and publishes its manually reviewed event group atomically', async () => {
    render(<CustomContentWorkshopPage />);

    await screen.findByRole('heading', { name: '自定义内容工坊' });
    fireEvent.click(screen.getByRole('button', { name: /事件.*0 个事件组/ }));
    fireEvent.click(screen.getByRole('button', { name: '快速创建事件' }));
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
      target: { value: '证物封条编号与登记册不一致。' }
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
    const eventDeploymentSelect = screen
      .getAllByRole('combobox', { name: '香港 1988投放方式' })
      .find((element) => !(element as HTMLSelectElement).disabled);
    expect(eventDeploymentSelect).toBeDefined();
    fireEvent.change(eventDeploymentSelect!, {
      target: { value: 'native' }
    });
    fireEvent.click(screen.getByRole('button', { name: '确认发布' }));

    expect(
      await screen.findByRole('button', { name: /封条异常/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '导入内容包' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '导出单事件' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '导出项目分享包' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '作者备份（含原文）' })
    ).toBeDisabled();
    const repository = new IndexedDbCustomContentRepository();
    const [projects, eventGroups] = await Promise.all([
      repository.listProjectAssets(),
      repository.listEventGroupAssets()
    ]);
    expect(projects).toHaveLength(1);
    expect(eventGroups).toHaveLength(1);
    expect(eventGroups[0].projectId).toBe(projects[0].projectId);
    expect(
      await repository.getEventGroupRevision(
        eventGroups[0].eventGroupId,
        eventGroups[0].latestRevision
      )
    ).toMatchObject({
      title: '封条异常',
      lifecycle: {
        reviewStatus: 'approved',
        availabilityStatus: 'enabled'
      }
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: '编辑所属项目为新 revision'
      })
    );
    expect(
      await screen.findByRole('heading', { name: '编辑 夜班证物疑云' })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('事件组摘要'), {
      target: { value: '玩家复核后补充了登记册时间。' }
    });
    fireEvent.click(screen.getByRole('button', { name: '保存为待审核' }));

    await waitFor(async () => {
      const latestEventAssets = await repository.listEventGroupAssets();
      expect(latestEventAssets[0].latestRevision).toBe(2);
    });
    expect(
      await repository.getEventGroupRevision(eventGroups[0].eventGroupId, 2)
    ).toMatchObject({
      summary: '玩家复核后补充了登记册时间。',
      lifecycle: {
        reviewStatus: 'needs_review',
        availabilityStatus: 'disabled'
      }
    });
    expect((await repository.listProjectAssets())[0].latestRevision).toBe(2);

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '删除事件' }));
    expect(
      await screen.findByText('事件“封条异常”已永久删除。')
    ).toBeInTheDocument();
    expect(await repository.listEventGroupAssets()).toEqual([]);
    expect(await repository.listProjectAssets()).toHaveLength(1);
    confirm.mockRestore();
  });

  it('binds an approved revision to an explicit save and manages its local intent', async () => {
    window.history.replaceState(
      {},
      '',
      '/custom-content?saveId=save-phase6-ui'
    );
    const contentRepository = new IndexedDbCustomContentRepository();
    await saveCustomCharacterRevision({
      repository: contentRepository,
      input: {
        draft: {
          displayName: '周静仪',
          aliases: [],
          gender: '女',
          profileSummary: '熟悉档案流程的书记员。',
          backgroundSummary: '长期负责纸质档案整理。',
          corePersonality: ['细致'],
          values: ['责任'],
          coreMotivations: ['保护档案'],
          majorRelationships: [],
          entryMode: 'natural',
          adaptationPolicy:
            createDefaultCustomCharacterAdaptationPolicy()
        },
        deployments: [
          {
            worldpackId: 'hk_1988',
            mode: 'native',
            defaultEnabledForNewGame: true
          }
        ],
        global: true,
        projectIds: [],
        mode: 'publish'
      },
      dependencies: {
        createId: () => 'character-save-ui',
        now: () => '2026-07-26T03:30:00.000Z'
      }
    });
    const runtimeState = createInitialRuntimeState();
    const saveRepository = new IndexedDbSaveRepository();
    await saveRepository.save({
      saveId: 'save-phase6-ui',
      saveName: 'Phase 6 浏览器存档',
      saveKind: 'manual',
      createdAt: '2026-07-26T03:30:00.000Z',
      updatedAt: '2026-07-26T03:30:00.000Z',
      playerName: runtimeState.player.name,
      worldpackId: runtimeState.world.worldpackId,
      gameDateLabel: '1988年9月12日',
      turnCounter: runtimeState.turnCounter,
      runtimeState
    });

    render(<CustomContentWorkshopPage />);

    await screen.findByRole('heading', { name: '自定义内容工坊' });
    await screen.findByRole('button', { name: /周静仪/ });
    expect(
      await screen.findByText('当前存档：Phase 6 浏览器存档')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '加入当前存档' }));
    expect(
      await screen.findByText('人物 revision 与适配快照已加入当前存档。')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '当前存档' }));

    expect(await screen.findByText('Phase 6 浏览器存档')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByText('否')).toBeInTheDocument();
    expect(
      screen.getByText('custom-actor:character-save-ui')
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: '暂停主动推进' })
    );
    expect(await screen.findByText('已暂停主动推进。')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: '恢复主动推进' })
    );
    expect(await screen.findByText('已恢复主动推进。')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: '取消本局重点' })
    );
    expect(
      await screen.findByText('已取消本局重点，绑定 revision 保持不变。')
    ).toBeInTheDocument();

    const restored = await saveRepository.load('save-phase6-ui');
    expect(restored?.runtimeState.customContent?.characterBindings).toHaveLength(
      1
    );
    expect(restored?.runtimeState.customContent?.priorityItems).toHaveLength(0);
    expect(restored?.runtimeState.actors).toEqual(runtimeState.actors);

    fireEvent.click(screen.getByRole('tab', { name: '全局内容库' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '删除人物' }));
    expect(
      await screen.findByText(/无法删除人物“周静仪”：仍被 1 个存档引用/)
    ).toBeInTheDocument();
    expect(
      await contentRepository.getCharacterAsset('character-save-ui')
    ).not.toBeNull();
    confirm.mockRestore();
  });

  it('protects a character that is still referenced by the current project revision', async () => {
    const contentRepository = new IndexedDbCustomContentRepository();
    const character = await saveCustomCharacterRevision({
      repository: contentRepository,
      input: {
        draft: {
          displayName: '项目引用人物',
          aliases: [],
          gender: '女',
          profileSummary: '仍被当前项目引用。',
          backgroundSummary: '用于验证受保护删除。',
          corePersonality: ['谨慎'],
          values: ['完整性'],
          coreMotivations: ['避免悬空引用'],
          majorRelationships: [],
          entryMode: 'natural',
          adaptationPolicy:
            createDefaultCustomCharacterAdaptationPolicy()
        },
        deployments: [
          {
            worldpackId: 'hk_1988',
            mode: 'native',
            defaultEnabledForNewGame: true
          }
        ],
        global: true,
        projectIds: [],
        mode: 'publish'
      },
      dependencies: {
        createId: () => 'character-project-reference',
        now: () => '2026-07-28T10:00:00.000Z'
      }
    });
    const projectRevision = {
      projectId: 'project-reference',
      revision: 1,
      checksum: 'project-reference-checksum',
      title: '仍在使用人物的项目',
      summary: '当前 revision 仍引用人物。',
      conversionMode: 'structural_adaptation' as const,
      characterAssetIds: [character.asset.characterAssetId],
      eventGroupIds: [],
      deployments: [
        {
          worldpackId: 'hk_1988',
          mode: 'native' as const,
          defaultEnabledForNewGame: true
        }
      ],
      sourceDocumentIds: [],
      lifecycle: {
        generationStatus: 'ready' as const,
        reviewStatus: 'approved' as const,
        availabilityStatus: 'enabled' as const
      }
    };
    await contentRepository.saveRevisionBundle({
      assetKind: 'content_project',
      asset: {
        projectId: projectRevision.projectId,
        latestRevision: 1,
        revisionCount: 1,
        createdAt: '2026-07-28T10:00:00.000Z',
        updatedAt: '2026-07-28T10:00:00.000Z'
      },
      revision: projectRevision,
      dependencies: [
        {
          dependencyId: 'project-reference-to-character',
          owner: createCustomContentRevisionRef(projectRevision),
          target: createCustomContentRevisionRef(character.revision),
          kind: 'required'
        }
      ]
    });

    render(<CustomContentWorkshopPage />);
    await screen.findByRole('button', { name: /项目引用人物/ });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '删除人物' }));
    expect(
      await screen.findByText(
        /无法删除人物“项目引用人物”：仍被当前内容引用（仍在使用人物的项目）/
      )
    ).toBeInTheDocument();
    expect(
      await contentRepository.getCharacterAsset(
        character.asset.characterAssetId
      )
    ).not.toBeNull();
    confirm.mockRestore();
  });
});
