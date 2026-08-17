import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { applyGrayNetworkPatch } from '../../domain/grayNetwork/grayNetwork';
import { applyPlayerIdentityContextPatch } from '../../domain/identity/playerIdentityContext';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { createActorDefaults } from '../../domain/runtime/actorFactory';
import type { CaseFile, CombatEvent, GameTime, RuntimeState } from '../../domain/runtime/types';
import { GameScreen, findNewVisibleCombatEventId } from './GameScreen';

const caseTime: GameTime = {
  year: 1988,
  month: 9,
  day: 12,
  hour: 21,
  minute: 30
};

function createCaseFile(overrides: Partial<CaseFile> = {}): CaseFile {
  return {
    caseId: 'case_bar_assault',
    title: '酒吧伤人案',
    caseType: 'assault',
    status: 'investigating',
    playerRole: 'assist',
    leadActorName: '林警长',
    summary: '旺角酒吧伤人案，玩家协助补充证据。',
    currentFocus: '确认现场证词。',
    playerVisibleProgress: '玩家已取得一份证词。',
    internalProgressSummary: '主办者仍在处理其他证据。',
    relatedActorIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    evidenceIds: [],
    activityLog: [],
    unreadActivityCount: 1,
    visibility: 'player_known',
    createdAt: caseTime,
    updatedAt: caseTime,
    ...overrides
  };
}

function createCombatEvent(overrides: Partial<CombatEvent> = {}): CombatEvent {
  return {
    combatId: 'combat_alley_1',
    turnId: 'turn_1',
    gameTime: caseTime,
    title: '后巷短兵相接',
    type: 'armed',
    locationSummary: '旺角后巷',
    participants: [
      { actorId: 'player', name: '玩家', side: 'player', roleSummary: '持警棍逼近' },
      { name: '持刀男子', side: 'opponent', roleSummary: '试图脱身' }
    ],
    outcome: 'opponent_subdued',
    intensity: 74,
    combatText: '警棍与折刀在后巷里短暂相撞，围观者往后退开，对方最终被按在墙边。',
    resultSummary: '对方被制服。',
    consequenceSummary: '现场需要后续控制。',
    judgementCheckIds: [],
    relatedActorIds: ['player'],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    visibility: 'player_known',
    unread: true,
    createdAt: caseTime,
    ...overrides
  };
}

describe('GameScreen right panel', () => {
  it('does not expose the new-game custom content workshop during play', () => {
    const state = createInitialRuntimeState();
    render(
      <GameScreen
        state={state}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
        saveId="save id/phase6"
      />
    );

    expect(
      screen.queryByRole('button', { name: '自定义内容' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('自定义')).not.toBeInTheDocument();
  });

  it('clears stale suggested actions when the newest narrator turn has no actions', () => {
    const state = createInitialRuntimeState();
    state.storyLog = [
      {
        turnId: 'turn_1',
        speaker: 'narrator',
        text: '旧正文。',
        gameTime: { ...state.time },
        suggestedActions: ['沿用上一回合的旧行动。']
      },
      {
        turnId: 'turn_2',
        speaker: 'player',
        text: '执行新行动。',
        gameTime: { ...state.time }
      },
      {
        turnId: 'turn_2',
        speaker: 'narrator',
        text: '新正文。',
        gameTime: { ...state.time },
        suggestedActions: []
      }
    ];

    render(
      <GameScreen
        state={state}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    expect(screen.queryByLabelText('建议行动')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '沿用上一回合的旧行动。' })).not.toBeInTheDocument();
  });

  it('selects the newest visible combat event created by a turn', () => {
    const previous = createInitialRuntimeState();
    previous.time = caseTime;
    previous.combatEvents.combat_old = createCombatEvent({
      combatId: 'combat_old',
      title: '旧冲突',
      gameTime: { ...caseTime, hour: 20, minute: 0 },
      intensity: 40
    });

    const next = createInitialRuntimeState();
    next.time = caseTime;
    next.combatEvents.combat_old = previous.combatEvents.combat_old;
    next.combatEvents.combat_hidden_new = createCombatEvent({
      combatId: 'combat_hidden_new',
      title: '隐藏冲突',
      gameTime: { ...caseTime, hour: 22, minute: 0 },
      visibility: 'hidden',
      intensity: 99
    });
    next.combatEvents.combat_new = createCombatEvent({
      combatId: 'combat_new',
      title: '新冲突',
      gameTime: { ...caseTime, hour: 21, minute: 45 },
      intensity: 80
    });

    expect(findNewVisibleCombatEventId(previous, next)).toBe('combat_new');
  });

  it('keeps progress actions in the top bar and outside the feature navigation', () => {
    render(
      <GameScreen
        state={createInitialRuntimeState()}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    const rightRail = screen.getByLabelText('功能入口');
    const featureNav = within(rightRail).getByRole('navigation', { name: '功能面板' });
    const gameActions = screen.getByRole('group', { name: '游戏操作' });

    expect(featureNav).toContainElement(within(featureNav).getByRole('button', { name: '物品与资产' }));
    expect(within(gameActions).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
      '导出剧情',
      '诊断导出',
      '保存',
      '读取',
      '设置'
    ]);
    expect(gameActions).toContainElement(within(gameActions).getByRole('button', { name: '导出剧情' }));
    expect(gameActions).toContainElement(within(gameActions).getByRole('button', { name: '保存进度' }));
    expect(gameActions).toContainElement(within(gameActions).getByRole('button', { name: '读取进度' }));
    expect(gameActions).toContainElement(within(gameActions).getByRole('button', { name: '设置' }));
    expect(featureNav).not.toContainElement(within(gameActions).getByRole('button', { name: '保存进度' }));
    expect(rightRail).not.toHaveTextContent('保存进度');
  });

  it('opens the AI process trace from the brain button beside the turn counter', () => {
    render(
      <GameScreen
        state={createInitialRuntimeState()}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    expect(screen.queryByRole('region', { name: 'AI 处理轨迹' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看 AI 处理轨迹' }));
    expect(screen.getByRole('region', { name: 'AI 处理轨迹' })).toBeInTheDocument();
    expect(screen.getByText('尚未执行普通剧情回合。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('region', { name: 'AI 处理轨迹' })).not.toBeInTheDocument();
  });

  it('opens the player-facing story export without building a diagnostic payload', () => {
    render(
      <GameScreen
        state={createInitialRuntimeState()}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '导出剧情' }));

    expect(screen.getByRole('dialog', { name: '导出剧情' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '诊断导出' })).not.toBeInTheDocument();
  });

  it('groups feature panel entries by player workflow', () => {
    render(
      <GameScreen
        state={createInitialRuntimeState()}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    const featureNav = screen.getByRole('navigation', { name: '功能面板' });
    const groups = within(featureNav).getAllByRole('group');
    const groupNames = ['城市位置', '风险冲突', '个人资源', '视觉资料', '当前事务', '人物关系', '组织网络', '回忆'];

    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(groupNames);
    for (const groupName of groupNames) {
      expect(within(featureNav).queryByRole('heading', { name: groupName })).not.toBeInTheDocument();
    }

    expect(within(groups[0]).getAllByRole('button').map((button) => button.textContent)).toEqual(['地图']);
    expect(within(groups[1]).getAllByRole('button').map((button) => button.textContent)).toEqual(['战斗']);
    expect(within(groups[2]).getAllByRole('button').map((button) => button.textContent)).toEqual(['物品与资产', '金钱与收支']);
    expect(within(groups[3]).getAllByRole('button').map((button) => button.textContent)).toEqual(['图册']);
    expect(within(groups[4]).getAllByRole('button').map((button) => button.textContent)).toEqual(['动态', '案件', '新闻']);
    expect(within(groups[5]).getAllByRole('button').map((button) => button.textContent)).toEqual([
      '人物志',
      '人脉',
      '缘份',
      '口碑'
    ]);
    expect(within(groups[6]).getAllByRole('button').map((button) => button.textContent)).toEqual(['警队', '社团', '机构']);
    expect(within(groups[7]).getAllByRole('button').map((button) => button.textContent)).toEqual(['回忆']);
  });

  it('opens the unified image gallery from the visual group and returns to the mobile feature context', async () => {
    const onSettings = vi.fn();
    const loadSnapshot = vi.fn(async (saveId: string) => ({
      schemaVersion: 1 as const,
      saveId,
      characterAnchors: {},
      scenePlans: {},
      tasks: {},
      characterBatches: {},
      assets: {},
      bindings: {},
      storySceneDisplayStates: {}
    }));
    const visualRepository = {
      loadSnapshot,
      getStorageSummary: vi.fn(async (saveId: string) => ({
        saveId,
        metadataAssetCount: 0,
        storedBlobCount: 0,
        storedBytes: 0,
        missingBlobCount: 0,
        missingImageIds: [],
        corruptBlobCount: 0,
        corruptImageIds: [],
        orphanBlobCount: 0
      })),
      inspectStorageIntegrity: vi.fn(async () => { throw new Error('not used'); }),
      cleanupStorageIssues: vi.fn(async () => ({ removedBlobCount: 0, removedBytes: 0, affectedImageIds: [] })),
      restoreAssetBlob: vi.fn(async () => { throw new Error('not used'); }),
      saveCharacterAnchor: vi.fn(async () => undefined),
      saveScenePlan: vi.fn(async () => undefined),
      saveCharacterBatchWithTasks: vi.fn(async () => undefined),
      saveScenePlanWithTasks: vi.fn(async () => undefined),
      saveTask: vi.fn(async () => undefined),
      saveCharacterBatch: vi.fn(async () => undefined),
      saveStorySceneDisplayState: vi.fn(async () => undefined),
      bindAsset: vi.fn(async () => undefined),
      unbindAsset: vi.fn(async () => undefined),
      restoreSceneAssetToStory: vi.fn(async () => undefined),
      completeTaskWithImages: vi.fn(async () => []),
      persistLateTaskImages: vi.fn(async () => []),
      importUserImage: vi.fn(async () => { throw new Error('not used'); }),
      getBlob: vi.fn(async () => null),
      getAssetDeletionImpact: vi.fn(async (_saveId: string, imageId: string) => ({
        imageId,
        bindingIds: []
      })),
      deleteAsset: vi.fn(async () => undefined),
      exportSave: vi.fn(async () => { throw new Error('not used'); }),
      replaceSaveFromArchive: vi.fn(async () => undefined),
      clearSave: vi.fn(async () => undefined)
    };
    render(
      <GameScreen
        state={createInitialRuntimeState()}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={onSettings}
        onHome={vi.fn()}
        rollbackChainId="visual_chain"
        visualRepository={visualRepository}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '功能' }));
    fireEvent.click(within(screen.getByRole('group', { name: '视觉资料' })).getByRole('button', { name: '图册' }));

    const dialog = await screen.findByRole('dialog', { name: '图片管理' });
    expect(await within(dialog).findByRole('heading', { name: '当前存档还没有图片' })).toBeInTheDocument();
    expect(loadSnapshot).toHaveBeenCalledWith('visual_chain');
    expect(within(screen.getByRole('group', { name: '游戏操作' })).queryByRole('button', { name: '图册' })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '关闭图片管理' }));
    expect(screen.queryByRole('dialog', { name: '图片管理' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '功能' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(screen.getByRole('group', { name: '视觉资料' })).getByRole('button', { name: '图册' }));
    const reopenedDialog = await screen.findByRole('dialog', { name: '图片管理' });
    fireEvent.click(within(reopenedDialog).getByRole('button', { name: '前往文生图设置' }));
    expect(onSettings).toHaveBeenCalledWith('imageGeneration');
    expect(screen.queryByRole('dialog', { name: '图片管理' })).not.toBeInTheDocument();
  });

  it('does not expose writable image management to a partial visual repository', () => {
    const loadSnapshot = vi.fn(async (saveId: string) => ({
      schemaVersion: 1 as const,
      saveId,
      characterAnchors: {},
      scenePlans: {},
      tasks: {},
      characterBatches: {},
      assets: {},
      bindings: {},
      storySceneDisplayStates: {}
    }));
    render(
      <GameScreen
        state={createInitialRuntimeState()}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
        rollbackChainId="visual_chain"
        visualRepository={{ loadSnapshot }}
      />
    );

    fireEvent.click(within(screen.getByRole('group', { name: '视觉资料' })).getByRole('button', { name: '图册' }));
    expect(screen.queryByRole('dialog', { name: '图片管理' })).not.toBeInTheDocument();
    expect(loadSnapshot).not.toHaveBeenCalled();
  });

  it('shows livelihood only for the current civilian public identity', () => {
    const civilianState = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'hospital_nurse'
    });
    const civilianRender = render(
      <GameScreen
        state={civilianState}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    const civilianNav = screen.getByRole('navigation', { name: '功能面板' });
    const livelihoodButton = within(civilianNav).getByRole('button', { name: '营生' });
    expect(livelihoodButton).toBeInTheDocument();
    fireEvent.click(livelihoodButton);
    expect(screen.getByRole('dialog', { name: '职业与营生' })).toBeInTheDocument();
    civilianRender.unmount();

    render(
      <GameScreen
        state={createInitialRuntimeState({ currentIdentity: 'gang_member' })}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );
    expect(
      within(screen.getByRole('navigation', { name: '功能面板' })).queryByRole(
        'button',
        { name: '营生' }
      )
    ).not.toBeInTheDocument();
  });

  it('keeps the footer focused on turn count and scrolling city notices', () => {
    const state = createInitialRuntimeState();
    state.dynamicEvents.currentMatters.matter_street = {
      id: 'matter_street',
      title: '花园街小贩摊位纠纷',
      summary: '花园街摊位争执已经有人围观。',
      status: 'active',
      priority: 40,
      visibility: 'known',
      source: 'police_report',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: state.time,
      updatedAt: state.time
    };
    state.dynamicEvents.newsIssues.news_today = {
      id: 'news_today',
      date: state.time,
      outletName: '大公报',
      headline: '油麻地旧楼住户投诉噪音',
      summary: '本港版记录旧区住户投诉。',
      read: false,
      createdAt: state.time,
      updatedAt: state.time,
      articles: []
    };
    state.dynamicEvents.newsIssues.news_archived = {
      id: 'news_archived',
      date: { ...state.time, day: state.time.day - 1 },
      outletName: '明报',
      headline: '归档旧闻不再滚动',
      summary: '这份报纸已经归档。',
      read: true,
      createdAt: state.time,
      updatedAt: state.time,
      archivedAt: state.time,
      articles: []
    };
    state.dynamicEvents.newsIssues.news_important_old = {
      id: 'news_important_old',
      date: { ...state.time, day: state.time.day - 4 },
      outletName: '华侨日报',
      headline: '重要旧报只在资料库保留',
      summary: '这份旧报已标记重要，不应继续占据底部新闻条。',
      read: true,
      important: true,
      createdAt: state.time,
      updatedAt: state.time,
      articles: []
    };

    const { container } = render(
      <GameScreen
        state={state}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    const footer = container.querySelector('.game-footer');
    expect(footer).toHaveTextContent('回合：0');
    expect(footer).toHaveTextContent('动态：花园街小贩摊位纠纷');
    expect(footer).toHaveTextContent('新闻：大公报 - 油麻地旧楼住户投诉噪音');
    expect(footer).not.toHaveTextContent('归档旧闻不再滚动');
    expect(footer).not.toHaveTextContent('重要旧报只在资料库保留');
    expect(footer).not.toHaveTextContent('世界书');
    expect(footer).not.toHaveTextContent('Storypack');
  });

  it('opens the memory archive from the right panel', async () => {
    const state = createInitialRuntimeState();
    state.memories = {
      memory_short_story: {
        memoryId: 'memory_short_story',
        text: '你记得已经把小说初稿投给报社。',
        kind: 'turn',
        tier: 'short_term',
        relatedActorIds: [],
        relatedCaseIds: [],
        relatedPlaceIds: [],
        relatedOrganizationIds: [],
        gameTime: state.time,
        importance: 70,
        visibility: 'player_known',
        certainty: 'fact',
        embeddingText: '你记得已经把小说初稿投给报社。'
      }
    };

    render(
      <GameScreen
        state={state}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '回忆' }));

    const dialog = await screen.findByRole('dialog', { name: '回忆' }, { timeout: 5_000 });
    fireEvent.click(within(dialog).getByRole('tab', { name: /短期记忆/ }));

    expect(dialog).toHaveTextContent('你记得已经把小说初稿投给报社');
  });

  it('opens the player dossier by clicking the player name in the left panel', () => {
    const state = createInitialRuntimeState();
    state.player = {
      ...state.player,
      name: '梁志文',
      englishName: 'Vincent Leung',
      policeNumber: '7788'
    };
    state.actors.player = {
      ...state.actors.player,
      name: '梁志文',
      englishName: 'Vincent Leung',
      computedAge: 24,
      profileSummary: '屋邨出身的新丁警员。'
    };

    render(
      <GameScreen
        state={state}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /梁志文/ }));

    const dialog = screen.getByRole('dialog', { name: '主角资料' });
    expect(dialog).toHaveTextContent('PLAYER DOSSIER');
    expect(dialog).toHaveTextContent('Vincent Leung');
    expect(dialog).toHaveTextContent('屋邨出身的新丁警员。');
  });

  it('keeps map entry and does not render the old situation placeholder', () => {
    render(
      <GameScreen
        state={createInitialRuntimeState()}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    const panel = screen.getByRole('navigation', { name: '功能面板' });
    expect(within(panel).getByRole('button', { name: '地图' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '口碑' })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: '局势' })).not.toBeInTheDocument();
  });

  it('copies selected map destinations into the player command input', async () => {
    render(
      <GameScreen
        state={createInitialRuntimeState()}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '地图' }));
    const dialog = await screen.findByRole(
      'dialog',
      { name: '地图' },
      { timeout: 5_000 }
    );
    const placeList = within(dialog).getByLabelText('地点列表');
    fireEvent.click(within(placeList).getByRole('button', { name: /油麻地警署/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: '前往此处' }));

    expect(screen.getByLabelText('玩家行动')).toHaveValue('前往油麻地警署。');
  });

  it('shows dynamic and news entries for every player identity', () => {
    const { rerender } = render(
      <GameScreen
        state={createInitialRuntimeState({ currentIdentity: 'police' })}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    let panel = screen.getByRole('navigation', { name: '功能面板' });
    expect(within(panel).getByRole('button', { name: '动态' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '新闻' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '战斗' })).toBeInTheDocument();

    rerender(
      <GameScreen
        state={createInitialRuntimeState({ currentIdentity: 'civilian' })}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    panel = screen.getByRole('navigation', { name: '功能面板' });
    expect(within(panel).getByRole('button', { name: '动态' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '新闻' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '战斗' })).toBeInTheDocument();

    rerender(
      <GameScreen
        state={createInitialRuntimeState({ currentIdentity: 'gang_member' })}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    panel = screen.getByRole('navigation', { name: '功能面板' });
    expect(within(panel).getByRole('button', { name: '动态' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '新闻' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '战斗' })).toBeInTheDocument();
  });

  it('shows relationship network and fate entries for every player identity', () => {
    const { rerender } = render(
      <GameScreen
        state={createInitialRuntimeState({ currentIdentity: 'police' })}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    let panel = screen.getByRole('navigation', { name: '功能面板' });
    expect(within(panel).getByRole('button', { name: '人脉' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '缘份' })).toBeInTheDocument();

    rerender(
      <GameScreen
        state={createInitialRuntimeState({ currentIdentity: 'civilian' })}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    panel = screen.getByRole('navigation', { name: '功能面板' });
    expect(within(panel).getByRole('button', { name: '人脉' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '缘份' })).toBeInTheDocument();

    rerender(
      <GameScreen
        state={createInitialRuntimeState({ currentIdentity: 'gang_member' })}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    panel = screen.getByRole('navigation', { name: '功能面板' });
    expect(within(panel).getByRole('button', { name: '人脉' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '缘份' })).toBeInTheDocument();
  });

  it('opens dynamic and news panels from the right panel', () => {
    render(
      <GameScreen
        state={createInitialRuntimeState()}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '动态' }));
    expect(screen.getByRole('dialog', { name: '城市脉搏' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    fireEvent.click(screen.getByRole('button', { name: '新闻' }));
    expect(screen.getByRole('dialog', { name: '新闻' })).toBeInTheDocument();
  });

  it('archives a wind signal from the dynamic panel and force-saves the new state', async () => {
    const state = createInitialRuntimeState();
    state.dynamicEvents.signals.signal_street = {
      id: 'signal_street',
      title: '街口旧风声',
      summary: '这条消息已经没有继续追踪的价值。',
      signalType: 'street',
      reliability: 'low',
      status: 'active',
      visibility: 'known',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: { ...state.time },
      updatedAt: { ...state.time }
    };
    const onStateChange = vi.fn();
    const onAutoSave = vi.fn(async () => undefined);

    render(
      <GameScreen
        state={state}
        onStateChange={onStateChange}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={onAutoSave}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '动态' }));
    fireEvent.click(screen.getByRole('button', { name: '归档风声 街口旧风声' }));
    await Promise.resolve();

    const nextState = onStateChange.mock.calls[0]?.[0] as ReturnType<typeof createInitialRuntimeState>;
    expect(nextState.dynamicEvents.signals.signal_street.status).toBe('archived');
    expect(onAutoSave).toHaveBeenCalledWith(nextState, true);
  });

  it('opens the combat archive from the right panel', async () => {
    const state = createInitialRuntimeState();
    state.combatEvents.combat_alley_1 = createCombatEvent();

    render(
      <GameScreen
        state={state}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '战斗' }));

    const dialog = await screen.findByRole('dialog', { name: '战斗记录' });
    expect(dialog).toHaveTextContent('后巷短兵相接');
  });

  it('opens relationship network and fate panels from the right panel', () => {
    render(
      <GameScreen
        state={createInitialRuntimeState()}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '人脉' }));
    expect(screen.getByRole('dialog', { name: '人脉' })).toHaveTextContent('暂无已知人脉');
    fireEvent.click(within(screen.getByRole('dialog', { name: '人脉' })).getByRole('button', { name: '关闭' }));

    fireEvent.click(screen.getByRole('button', { name: '缘份' }));
    expect(screen.getByRole('dialog', { name: '缘份' })).toHaveTextContent('暂无已知缘份');
  });

  it('persists a confirmed relationship deletion before updating the live state', async () => {
    const state = createInitialRuntimeState();
    state.relationshipThreads.thread_contact = {
      threadId: 'thread_contact',
      kind: 'network',
      title: '待删除人脉',
      summary: '这条关系将由玩家手动删除。',
      relatedActorIds: [],
      relationshipRole: '普通联系',
      status: 'active',
      milestones: [],
      visibility: 'player_known',
      importance: 30,
      createdAt: state.time,
      updatedAt: state.time
    };
    const callOrder: string[] = [];
    const onAutoSave = vi.fn(async (_stateToSave: RuntimeState, _force?: boolean) => {
      callOrder.push('save');
    });
    const onStateChange = vi.fn(() => {
      callOrder.push('state');
    });

    render(
      <GameScreen
        state={state}
        onStateChange={onStateChange}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={onAutoSave}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '人脉' }));
    fireEvent.click(screen.getByRole('button', { name: '删除人脉：待删除人脉' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog', { name: '确认删除人脉' })).getByRole('button', {
        name: '确认删除'
      })
    );

    await waitFor(() => expect(onStateChange).toHaveBeenCalledTimes(1));
    const savedState = onAutoSave.mock.calls[0]?.[0];
    expect(savedState?.relationshipThreads.thread_contact).toBeUndefined();
    expect(onAutoSave).toHaveBeenCalledWith(savedState, true);
    expect(onStateChange).toHaveBeenCalledWith(savedState);
    expect(callOrder).toEqual(['save', 'state']);
  });

  it('persists a character archive profile edit before updating the live state', async () => {
    const state = createInitialRuntimeState();
    state.actors.npc_profile_edit = createActorDefaults({
      actorId: 'npc_profile_edit',
      name: '错误姓名',
      currentIdentity: 'civilian',
      profileSummary: '原人物资料。',
      presence: 'present',
      visibility: 'player_known',
      importance: 70,
      interactionScore: 10
    });
    const callOrder: string[] = [];
    const onAutoSave = vi.fn(async (_stateToSave: RuntimeState, _force?: boolean) => { callOrder.push('save'); });
    const onStateChange = vi.fn(() => { callOrder.push('state'); });

    render(
      <GameScreen
        state={state}
        onStateChange={onStateChange}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={onAutoSave}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '人物志' }));
    const dialog = await screen.findByRole('dialog', { name: '人物志' });
    fireEvent.click(within(dialog).getByRole('button', { name: '修改资料' }));
    fireEvent.change(within(dialog).getByLabelText('姓名 *'), { target: { value: '正确姓名' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(onStateChange).toHaveBeenCalledTimes(1));
    const savedState = onAutoSave.mock.calls[0]?.[0];
    expect(savedState?.actors.npc_profile_edit.name).toBe('正确姓名');
    expect(savedState?.actors.npc_profile_edit.manualProfileOverride?.lockedFields).toContain('name');
    expect(onAutoSave).toHaveBeenCalledWith(savedState, true);
    expect(onStateChange).toHaveBeenCalledWith(savedState);
    expect(callOrder).toEqual(['save', 'state']);
  });

  it('does not update live character data when character profile autosave fails', async () => {
    const state = createInitialRuntimeState();
    state.actors.npc_profile_failure = createActorDefaults({
      actorId: 'npc_profile_failure',
      name: '原姓名',
      currentIdentity: 'civilian',
      presence: 'present',
      visibility: 'player_known',
      importance: 70,
      interactionScore: 10
    });
    const onStateChange = vi.fn();
    const onAutoSave = vi.fn(async (_stateToSave: RuntimeState, _force?: boolean) => { throw new Error('disk full'); });

    render(
      <GameScreen
        state={state}
        onStateChange={onStateChange}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={onAutoSave}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '人物志' }));
    const dialog = await screen.findByRole('dialog', { name: '人物志' });
    fireEvent.click(within(dialog).getByRole('button', { name: '修改资料' }));
    fireEvent.change(within(dialog).getByLabelText('姓名 *'), { target: { value: '不应生效' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('自动保存失败');
    expect(onAutoSave).toHaveBeenCalledTimes(1);
    expect(onStateChange).not.toHaveBeenCalled();
    expect(state.actors.npc_profile_failure.name).toBe('原姓名');
  });

  it('shows police-only panels for police identity', () => {
    render(
      <GameScreen
        state={createInitialRuntimeState({ currentIdentity: 'police' })}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    const panel = screen.getByRole('navigation', { name: '功能面板' });
    expect(within(panel).getByRole('button', { name: '案件' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '警队' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '机构' })).toBeInTheDocument();
  });

  it('hides police-only panels for civilian and gang identities', () => {
    const civilianState = createInitialRuntimeState({ currentIdentity: 'civilian' });
    civilianState.cases.case_bar_assault = createCaseFile();
    const { rerender } = render(
      <GameScreen
        state={civilianState}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    let panel = screen.getByRole('navigation', { name: '功能面板' });
    expect(within(panel).queryByRole('button', { name: /案件/ })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: '警队' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '机构' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '人物志' })).toBeInTheDocument();

    const gangState = createInitialRuntimeState({ currentIdentity: 'gang_member' });
    gangState.cases.case_bar_assault = createCaseFile();
    rerender(
      <GameScreen
        state={gangState}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    panel = screen.getByRole('navigation', { name: '功能面板' });
    expect(within(panel).queryByRole('button', { name: /案件/ })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: '警队' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '机构' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '物品与资产' })).toBeInTheDocument();
  });

  it('routes police-only and shared dynamic panels through the active undercover shell', () => {
    const policeOrigin = createInitialRuntimeState({ currentIdentity: 'police', policeNumber: '7316' });
    const gangProfile = createInitialRuntimeState({ currentIdentity: 'gang_member' }).actors.player.roleProfiles.triad!;
    const policeUnderGangCover = applyPlayerIdentityContextPatch(policeOrigin, {
      transitionId: 'transition_ui_police_under_gang_cover',
      kind: 'cover_enter',
      fromIdentity: 'police',
      toIdentity: 'gang_member',
      publicIdentity: '和胜和庙街基层联络',
      actualIdentitySummary: '皇家香港警察卧底人员。',
      reason: '以社团公开身份执行卧底任务。',
      targetRoleProfile: { identity: 'gang_member', profile: gangProfile },
      secretFactPatches: [
        {
          operation: 'upsert',
          fact: {
            secretId: 'secret_ui_police_undercover',
            ownerType: 'player',
            ownerId: 'player',
            kind: 'identity',
            summary: '玩家真实身份是皇家香港警察。',
            playerCharacterKnown: true,
            publicKnown: false,
            knownByActorIds: ['player'],
            revealState: 'known_to_player_character',
            revealConditions: ['主动公开或身份暴露'],
            visibility: 'player_known',
            importance: 100
          }
        }
      ]
    }).state;
    const { rerender } = render(
      <GameScreen
        state={policeUnderGangCover}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    let panel = screen.getByRole('navigation', { name: '功能面板' });
    expect(within(panel).queryByRole('button', { name: /案件/ })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: '警队' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '社团' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '动态' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '机构' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '人脉' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '缘份' })).toBeInTheDocument();

    const triadOrigin = createInitialRuntimeState({ currentIdentity: 'gang_member' });
    const policeProfile = createInitialRuntimeState({ currentIdentity: 'police' }).actors.player.roleProfiles.police!;
    const triadUnderPoliceCover = applyPlayerIdentityContextPatch(triadOrigin, {
      transitionId: 'transition_ui_triad_under_police_cover',
      kind: 'cover_enter',
      fromIdentity: 'gang_member',
      toIdentity: 'police',
      publicIdentity: '旺角警署军装巡逻警员',
      actualIdentitySummary: '和胜和成员，奉命进入警队担任内线。',
      reason: '以警察公开身份维持社团内线任务。',
      targetRoleProfile: { identity: 'police', profile: policeProfile }
    }).state;
    rerender(
      <GameScreen
        state={triadUnderPoliceCover}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    panel = screen.getByRole('navigation', { name: '功能面板' });
    expect(within(panel).getByRole('button', { name: '案件' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '警队' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '社团' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '动态' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '机构' })).toBeInTheDocument();
  });

  it('opens the social institution panel from the right panel', () => {
    render(
      <GameScreen
        state={createInitialRuntimeState({ currentIdentity: 'civilian' })}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '机构' }));

    const dialog = screen.getByRole('dialog', { name: '机构' });
    expect(dialog).not.toHaveTextContent('皇家香港警察');
    expect(dialog).toHaveTextContent('廉政公署');
  });

  it('shows the gray network panel entry for police, civilian, and gang identities', () => {
    const { rerender } = render(
      <GameScreen
        state={createInitialRuntimeState({ currentIdentity: 'police' })}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '社团' })).toBeInTheDocument();

    rerender(
      <GameScreen
        state={createInitialRuntimeState({ currentIdentity: 'civilian' })}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: '社团' })).toBeInTheDocument();

    rerender(
      <GameScreen
        state={createInitialRuntimeState({ currentIdentity: 'gang_member' })}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: '社团' })).toBeInTheDocument();
  });

  it('opens the gray network panel and copies suggested actions into the command input', () => {
    const base = createInitialRuntimeState({ currentIdentity: 'police' });
    const currentPlaceId = base.location.currentPlaceId;
    const state = applyGrayNetworkPatch(base, {
      relatedPeople: [
        {
          actorId: 'player',
          visibleRole: '被街面认识的警员',
          knownTieSummary: '几个线人认得他的警员编号。',
          confidence: 'high',
          visibility: { police: 'known' },
          relatedPlaceIds: [currentPlaceId],
          relatedOrganizationIds: ['org_sun_yee_on'],
          relatedCaseIds: []
        }
      ],
      suggestedActions: [
        {
          actionId: 'ask_street_contact',
          identity: 'police',
          text: '找相熟线人打听最近街口的风声。',
          rationale: '用低风险渠道收风。',
          riskLevel: 'low',
          relatedActorIds: ['player'],
          relatedPlaceIds: [currentPlaceId]
        }
      ]
    });

    render(
      <GameScreen
        state={state}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '社团' }));
    const dialog = screen.getByRole('dialog', { name: '社团' });
    fireEvent.click(within(dialog).getByRole('button', { name: '找相熟线人打听最近街口的风声。' }));

    expect(screen.getByRole('textbox')).toHaveValue('找相熟线人打听最近街口的风声。');
  });

  it('opens the reputation archive from the right panel', () => {
    const state = createInitialRuntimeState();
    state.player.reputation = {
      ...state.player.reputation,
      notoriety: 180,
      overallReputation: -10,
      summary: '在旺角有些人听过他，但评价并不稳定。'
    };

    render(
      <GameScreen
        state={state}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '口碑' }));

    const dialog = screen.getByRole('dialog', { name: '口碑' });
    expect(dialog).toHaveTextContent('整体知名度');
    expect(dialog).toHaveTextContent('180/1000');
    expect(dialog).toHaveTextContent('整体口碑');
    expect(dialog).toHaveTextContent('-10');
  });

  it('opens the asset archive from the right panel', async () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        asset_gold_watch: {
          itemId: 'asset_gold_watch',
          category: 'valuable',
          name: 'Gold watch',
          summary: 'A gold watch received from a nightclub owner.',
          relatedActorIds: [],
          relatedCaseIds: [],
          relatedPlaceIds: [],
          importance: 60,
          visibility: 'player_known'
        }
      },
      equippedItemIds: []
    };

    render(
      <GameScreen
        state={state}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '物品与资产' }));

    const dialog = await screen.findByRole(
      'dialog',
      { name: '物品与资产' },
      { timeout: 5_000 }
    );
    expect(dialog).toHaveTextContent('Gold watch');
    expect(dialog).toHaveTextContent('贵重物品');
  });

  it('opens the finance archive from the right panel', () => {
    const state = createInitialRuntimeState();
    state.finance.cashOnHand = 100;
    state.finance.bankBalance = 2100;

    render(
      <GameScreen
        state={state}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '金钱与收支' }));

    const dialog = screen.getByRole('dialog', { name: '金钱与收支' });
    expect(dialog).toHaveTextContent('随身现金');
    expect(dialog).toHaveTextContent('银行存款');
    expect(dialog).toHaveTextContent('HK$100');
    expect(dialog).toHaveTextContent('HK$2,100');
  });

  it('opens the case archive from the right panel and clears case unread count', async () => {
    const state = createInitialRuntimeState();
    state.time = caseTime;
    state.cases.case_bar_assault = createCaseFile();
    const onStateChange = vi.fn();

    render(
      <GameScreen
        state={state}
        onStateChange={onStateChange}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /案件/ }));

    const dialog = await screen.findByRole('dialog', { name: '案件' });
    expect(dialog).toHaveTextContent('酒吧伤人案');
    expect(dialog).toHaveTextContent('未读 1');

    fireEvent.click(within(dialog).getByRole('button', { name: /酒吧伤人案/ }));

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange.mock.calls[0][0].cases.case_bar_assault.unreadActivityCount).toBe(0);
  });

  it('copies lead case formal actions into the player command input', async () => {
    const state = createInitialRuntimeState();
    state.time = caseTime;
    state.cases.case_bar_assault = createCaseFile({ playerRole: 'lead' });

    render(
      <GameScreen
        state={state}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /案件/ }));
    const dialog = await screen.findByRole('dialog', { name: '案件' });
    fireEvent.click(within(dialog).getByRole('button', { name: '提交检控意见' }));

    expect(screen.getByLabelText('玩家行动')).toHaveValue('我整理案件材料，向检控部门提交对【酒吧伤人案】的检控意见。');
  });
});
