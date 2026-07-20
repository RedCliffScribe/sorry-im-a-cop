import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { runPlayerTurn } from '../domain/turn/TurnEngine';
import { createTurnRollbackSnapshot } from '../domain/turn/TurnRollback';
import { createInitialRuntimeState } from '../domain/runtime/initialState';
import type { RuntimeState } from '../domain/runtime/types';
import { IndexedDbSaveRepository } from '../domain/persistence/IndexedDbSaveRepository';
import { IndexedDbTurnSnapshotRepository } from '../domain/persistence/IndexedDbTurnSnapshotRepository';
import type { RuntimeSaveKind, RuntimeSaveRecord } from '../domain/persistence/SaveRepository';
import { createDefaultAiSettings } from '../domain/settings/defaultSettings';
import type { AiSettings } from '../domain/settings/types';
import {
  OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY,
  OPENING_LEGAL_DISCLAIMER_VERSION
} from './legal/openingLegalDisclaimer';

vi.mock('../domain/turn/TurnEngine', () => ({
  runPlayerTurn: vi.fn()
}));

const runPlayerTurnMock = vi.mocked(runPlayerTurn);
const aiSettingsStorageKey = 'sorry-im-a-cop-v2-ai-settings';

function createStoredSave(saveId: string, rollbackChainId: string, saveKind: RuntimeSaveKind = 'manual'): RuntimeSaveRecord {
  const runtimeState = createInitialRuntimeState();
  runtimeState.player.name = `玩家${saveId}`;
  return {
    saveId,
    rollbackChainId,
    saveName: saveId,
    saveKind,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: saveKind === 'manual' ? '2026-07-10T00:00:00.000Z' : '2026-07-10T00:01:00.000Z',
    playerName: runtimeState.player.name,
    worldpackId: runtimeState.world.worldpackId,
    gameDateLabel: '1988-09-12 星期一 21:15',
    turnCounter: runtimeState.turnCounter,
    runtimeState
  };
}

async function seedSnapshot(chainId: string): Promise<IndexedDbTurnSnapshotRepository> {
  const repository = new IndexedDbTurnSnapshotRepository();
  const beforeState = createInitialRuntimeState();
  await repository.saveTurnSnapshot({
    chainId,
    turnNumber: 1,
    snapshot: createTurnRollbackSnapshot({ beforeState, actionText: '测试行动' }),
    maxDepth: 20
  });
  return repository;
}

function deleteDatabase(name: string) {
  return new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function createTurnResult(
  state: RuntimeState,
  narrativeText = '报案室的电话线里传来一点杂音。',
  playerInput?: string
) {
  const turnId = `turn_${state.turnCounter + 1}`;
  return {
    ...state,
    storyLog: [
      ...state.storyLog,
      ...(playerInput
        ? [
            {
              turnId,
              speaker: 'player' as const,
              text: playerInput,
              gameTime: state.time
            }
          ]
        : []),
      {
        turnId,
        speaker: 'narrator' as const,
        text: narrativeText,
        suggestedActions: ['追问来电人的位置', '叫值班长一起听'],
        gameTime: state.time
      }
    ],
    turnCounter: state.turnCounter + 1
  };
}

function defer<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function seedMainNarratorSettings(gameOverrides: Partial<AiSettings['game']> = {}) {
  const settings: AiSettings = {
    ...createDefaultAiSettings(),
    apiProfiles: [
      {
        id: 'api_main',
        name: 'Main API',
        providerLabel: 'OpenAI compatible',
        interfaceType: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        models: ['story-model'],
        defaultMaxTokens: 4096,
        defaultTemperature: 0.7,
        createdAt: '2026-06-23T00:00:00.000Z',
        updatedAt: '2026-06-23T00:00:00.000Z'
      }
    ],
    mainNarrator: {
      apiProfileId: 'api_main',
      model: 'story-model',
      maxTokens: 4096,
      temperature: 0.7
    },
    featureRoutes: {
      writebackRepair: { mode: 'follow-main' },
      memorySummary: { mode: 'follow-main' },
      memoryVector: { mode: 'disabled' },
      npcSimulation: { mode: 'follow-main' },
      backgroundEvolution: { mode: 'follow-main' },
      auxiliaryGeneration: { mode: 'follow-main' }
    },
    game: {
      storyRenderLimit: 30,
      narrativeLengthLevel: 'standard',
      narrativePerspective: 'second_person',
      autoSaveLimit: 20,
      autoSaveIntervalTurns: 1,
      ...gameOverrides,
      rollbackSnapshotLimit: gameOverrides.rollbackSnapshotLimit ?? 20,
      pregnancyMode: gameOverrides.pregnancyMode ?? 'standard'
    },
    memory: createDefaultAiSettings().memory
  };

  localStorage.setItem(aiSettingsStorageKey, JSON.stringify(settings));
}

function mockOpeningFetch(narrativeText = '真正开局：旺角警署的早班刚交接完。') {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
                content: JSON.stringify({
                narrativeText,
                suggestedActions: ['先观察报案室'],
                playerPatch: {
                  name: '陈启明',
                  englishName: 'Michael Chan',
                  policeNumber: '9527'
                },
                initialActors: [
                  {
                    name: '梁志强',
                    englishName: 'Tony Leung',
                    gender: 'male',
                    birthDate: '1948-05-12',
                    computedAge: 40,
                    visualAgeAnchor: '四十岁左右',
                    currentIdentity: 'police',
                    publicIdentity: '值日警长',
                    actualIdentitySummary: '旺角警署军装部值日警长。',
                    roleProfiles: {
                      police: {
                        status: 'active',
                        rank: 'Sergeant',
                        department: 'Uniform Branch',
                        stationOrPost: 'Mong Kok Police Station',
                        assignmentSummary: 'Report Room Duty Sergeant'
                      }
                    },
                    positionSummary: '旺角警署值日警长',
                    profileSummary: '老资格军装警长，熟悉街面和报案室人情。',
                    appearance: '四十岁左右，眼袋重，制服整洁。',
                    clothing: '夏季军装制服。',
                    equipment: ['警棍', '对讲机', '值日簿'],
                    personality: '老练、圆滑、怕麻烦但知道底线。',
                    speechStyle: '夹杂粤语口吻，常用短句催促新人。',
                    motivation: '维持今晚值班平稳，不想惹麻烦。',
                    longTermGoal: '安稳退休。',
                    values: '实用主义，重视街坊秩序多过漂亮报告。',
                    relationshipSummary: '刚认识主角，把主角当成需要看管的新同僚。',
                    attitudeTowardPlayer: '观察、试探，但暂时没有敌意。',
                    interactionScore: 10,
                    trustTendency: '中等戒备。',
                    entanglementSummary: '可能掌握警署和街坊间的旧人情。',
                    longTermMemorySummary: '熟悉警署报案室与旺角街面关系。',
                    recentInteractionMemory: '开局时安排主角留意今晚辖区状况。',
                    statusSummary: '疲惫但状态正常。',
                    presence: 'present',
                    visibility: 'player_known',
                    importance: 70
                  }
                ],
                memories: [
                  {
                    text: '主角第一天以警员编号9527在警署值班。',
                    kind: 'player',
                    relatedActorIds: ['player'],
                    importance: 90,
                    visibility: 'player_known',
                    certainty: 'fact'
                  }
                ],
                pressureSeeds: []
              })
            }
        }
      ]
    })
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function createOpeningApiResponse(content: unknown) {
  return {
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify(content)
          }
        }
      ]
    })
  };
}

function encodeOpenAiStreamDelta(delta: string) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`;
}

async function startDefaultGameThroughOpening(gameOverrides?: Partial<AiSettings['game']>, settingsOverride?: AiSettings) {
  if (settingsOverride) {
    localStorage.setItem(aiSettingsStorageKey, JSON.stringify(settingsOverride));
  } else {
    seedMainNarratorSettings(gameOverrides);
  }
  mockOpeningFetch();

  fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));
  expect(await screen.findByRole('heading', { name: '开局向导' })).toBeInTheDocument();

  for (let i = 0; i < 4; i += 1) {
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
  }

  fireEvent.click(screen.getByRole('button', { name: '生成开局' }));
  await screen.findByRole('heading', { name: '对唔住，我系差人' });
  await screen.findByText('陈启明');
  await waitFor(() => {
    expect(screen.getByRole('button', { name: '执行行动' })).not.toBeDisabled();
  });
}

beforeEach(async () => {
  await deleteDatabase('sorry-im-a-cop-v2-saves');
  await deleteDatabase('sorry-im-a-cop-v2-turn-snapshots');
  localStorage.setItem(
    OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY,
    JSON.stringify({ version: OPENING_LEGAL_DISCLAIMER_VERSION, acceptedAt: '2026-07-19T00:00:00.000Z' })
  );
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('App', () => {
  it('renders the home menu before entering the game', () => {
    render(<App />);

    const chineseTitle = screen.getByRole('heading', { name: '对唔住，我系差人' });
    const englishTitle = screen.getByText("Sorry, I'm a Cop");

    expect(chineseTitle).toBeInTheDocument();
    expect(englishTitle).toBeInTheDocument();
    expect(chineseTitle.nextElementSibling).toBe(englishTitle);
    expect(englishTitle).toHaveClass('home-english-title');
    expect(screen.getByRole('button', { name: '开始游戏' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '读取游戏' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^新手引导$/ })).toBeInTheDocument();
    const releaseInfo = screen.getByRole('group', { name: '版本、版权与法律信息' });
    expect(within(releaseInfo).getByText('v1.0.0')).toBeInTheDocument();
    expect(within(releaseInfo).getByText('简体中文')).toBeInTheDocument();
    expect(within(releaseInfo).getByText('© 2026 RedCliffScribe · 非商业本地互动叙事游戏')).toBeInTheDocument();
    expect(within(releaseInfo).getByRole('button', { name: '法律声明' })).toBeInTheDocument();
    expect(within(releaseInfo).getByRole('link', { name: '源码' })).toHaveAttribute(
      'href',
      'https://github.com/RedCliffScribe/sorry-im-a-cop'
    );
    expect(within(releaseInfo).getByRole('link', { name: '纠错与权利通知' })).toHaveAttribute(
      'href',
      'mailto:kale014@gmail.com'
    );
  });

  it('opens the full legal notice from the homepage without changing consent', () => {
    localStorage.removeItem(OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY);
    render(<App />);

    const releaseInfo = screen.getByRole('group', { name: '版本、版权与法律信息' });
    fireEvent.click(within(releaseInfo).getByRole('button', { name: '法律声明' }));

    const dialog = screen.getByRole('dialog', { name: '《对唔住，我系差人》' });
    expect(within(dialog).getByText('法律声明、人工智能动态内容说明及使用条款')).toBeInTheDocument();
    expect(within(dialog).getByText('kale014@gmail.com')).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /同意/ })).not.toBeInTheDocument();
    expect(localStorage.getItem(OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY)).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: '关闭法律声明' }));
    expect(screen.queryByRole('dialog', { name: '《对唔住，我系差人》' })).not.toBeInTheDocument();
    expect(localStorage.getItem(OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY)).toBeNull();
  });

  it('offers a non-blocking first-use hint and explains the main and auxiliary API routes', async () => {
    render(<App />);

    const hint = await screen.findByRole('complementary', { name: '首次使用提示' });
    expect(within(hint).getByText(/主剧情 API 尚未配置/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始游戏' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '设置' })).toBeEnabled();

    fireEvent.click(within(hint).getByRole('button', { name: '打开新手引导' }));
    const dialog = screen.getByRole('dialog', { name: '首次使用引导' });
    expect(within(dialog).getByText('一份 API 档案可以复用')).toBeInTheDocument();
    expect(within(dialog).getByText('尚未完成')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: '写回修复' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: '记忆总结' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: '向量检索' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'NPC 模拟' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: '远场演化' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: '辅助生成' })).toBeInTheDocument();
    expect(within(dialog).getAllByText('当前：待主剧情配置')).toHaveLength(5);
    expect(within(dialog).getByText('当前：未启用')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '前往主剧情 API 配置' }));
    expect(
      await screen.findByRole('heading', { name: 'API 配置' }, { timeout: 5_000 })
    ).toBeInTheDocument();
  });

  it('keeps the guide reopenable and routes an auxiliary card to its feature settings page', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^新手引导$/ }));
    const dialog = screen.getByRole('dialog', { name: '首次使用引导' });
    fireEvent.click(within(dialog).getByRole('button', { name: '配置远场演化' }));

    expect(await screen.findByRole('heading', { name: '远场演化' })).toBeInTheDocument();
  });

  it('requires the important AI-content notice before entering a new opening', async () => {
    localStorage.removeItem(OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));

    let dialog = screen.getByRole('dialog', { name: '重要说明' });
    expect(screen.queryByRole('heading', { name: '开局向导' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('本游戏依据公开历史与人物资料构建时代背景。')).toBeInTheDocument();
    expect(within(dialog).getByText(/动态事件、人物言行、关系与剧情/)).toBeInTheDocument();
    const acceptButton = within(dialog).getByRole('button', { name: '同意并进入开局' });
    expect(acceptButton).toBeDisabled();

    fireEvent.click(within(dialog).getByRole('button', { name: '查看完整法律声明' }));
    dialog = screen.getByRole('dialog', { name: '《对唔住，我系差人》' });
    expect(within(dialog).getByText('kale014@gmail.com')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '返回重要说明' }));

    dialog = screen.getByRole('dialog', { name: '重要说明' });
    fireEvent.click(within(dialog).getByRole('button', { name: '暂不进入' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));
    dialog = screen.getByRole('dialog', { name: '重要说明' });
    fireEvent.click(
      within(dialog).getByRole('checkbox', {
        name: '我已阅读并理解上述重要说明，并同意《法律声明、人工智能动态内容说明及使用条款》。'
      })
    );
    fireEvent.click(within(dialog).getByRole('button', { name: '同意并进入开局' }));

    expect(await screen.findByRole('heading', { name: '开局向导' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY) ?? '{}')).toMatchObject({
      version: OPENING_LEGAL_DISCLAIMER_VERSION,
      acceptedAt: expect.any(String)
    });
  });

  it('opens the save manager modal from the home menu in load mode', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '读取游戏' }));

    const dialog = await screen.findByRole('dialog', { name: '存档管理' });
    expect(within(dialog).getByRole('heading', { name: '读取进度' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '保存当前进度' })).not.toBeInTheDocument();
  });

  it('opens settings and shows API configuration as one page', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '设置' }));

    expect(
      await screen.findByRole('heading', { name: '设置' }, { timeout: 5_000 }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'API 配置' }));

    expect(screen.getByRole('heading', { name: 'API 配置' })).toBeInTheDocument();
    expect(screen.getByLabelText('配置名称')).toBeInTheDocument();
    expect(screen.getByLabelText('接口类型')).toBeInTheDocument();
    expect(screen.queryByLabelText('服务商备注')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'API 档案' })).getByRole('button', { name: '获取模型' })).toBeInTheDocument();
    expect(screen.getByLabelText('主剧情模型')).toBeInTheDocument();
  });

  it('applies and persists the interface font independently from story fonts', async () => {
    const { container } = render(<App />);
    const appRoot = container.querySelector<HTMLElement>('.app-font-root');

    expect(appRoot?.style.getPropertyValue('--font-interface')).toContain('Microsoft JhengHei');

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    await screen.findByRole('heading', { name: '设置' }, { timeout: 5_000 });
    fireEvent.click(screen.getByRole('button', { name: '显示设置' }));
    fireEvent.change(screen.getByLabelText('界面字体'), { target: { value: 'serif' } });

    await waitFor(() => {
      expect(appRoot?.style.getPropertyValue('--font-interface')).toContain('Noto Serif SC');
    });
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(aiSettingsStorageKey) ?? '{}') as AiSettings;
      expect(stored.display.interfaceFontFamily).toBe('serif');
      expect(stored.display.narrationFontFamily).toBe('system');
      expect(stored.display.dialogueFontFamily).toBe('system');
    });
  });

  it('fetches model ids into the API profile form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [{ id: 'pro' }, { id: 'flash' }] })
      }))
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(await screen.findByRole('button', { name: 'API 配置' }));
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://gcli.ggchan.dev/v1' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-test' } });
    fireEvent.click(within(screen.getByRole('region', { name: 'API 档案' })).getByRole('button', { name: '获取模型' }));

    await waitFor(() => {
      expect(screen.getByLabelText('模型列表')).toHaveValue('pro, flash');
    });
  });

  it('fetches models for main narrator and feature routes before saving model choices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [{ id: 'pro' }, { id: 'flash' }] })
      }))
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(await screen.findByRole('button', { name: 'API 配置' }));
    fireEvent.change(screen.getByLabelText('配置名称'), { target: { value: 'siliconflow' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://api.siliconflow.cn/v1' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByRole('button', { name: '保存 API 档案' }));

    const mainRoutePanel = await screen.findByRole('region', { name: '主剧情模型配置' });
    fireEvent.change(within(mainRoutePanel).getByLabelText('主剧情 API'), { target: { value: 'siliconflow' } });
    fireEvent.click(within(mainRoutePanel).getByRole('button', { name: '获取模型' }));
    await waitFor(() => {
      expect(within(mainRoutePanel).getByLabelText('主剧情模型')).toHaveValue('pro');
    });
    fireEvent.change(within(mainRoutePanel).getByLabelText('主剧情模型'), { target: { value: 'flash' } });
    fireEvent.click(within(mainRoutePanel).getByRole('button', { name: '保存主剧情模型' }));

    fireEvent.click(screen.getByRole('button', { name: '功能配置' }));
    const memoryRoutePanel = screen.getByRole('region', { name: '记忆压缩/摘要 API 路由' });
    fireEvent.change(within(memoryRoutePanel).getByLabelText('记忆压缩/摘要 API 配置'), {
      target: { value: 'api_siliconflow' }
    });
    fireEvent.click(within(memoryRoutePanel).getByRole('button', { name: '获取模型' }));
    await waitFor(() => {
      expect(within(memoryRoutePanel).getByLabelText('记忆压缩/摘要 模型')).toHaveValue('pro');
    });
    fireEvent.change(within(memoryRoutePanel).getByLabelText('记忆压缩/摘要 模型'), { target: { value: 'flash' } });
    fireEvent.click(within(memoryRoutePanel).getByRole('button', { name: '保存' }));
    expect(screen.getByText('当前：siliconflow / flash')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '写回修复' }));
    const repairRoutePanel = screen.getByRole('region', { name: '写回修复 API 路由' });
    fireEvent.change(within(repairRoutePanel).getByLabelText('写回修复 API 配置'), {
      target: { value: 'api_siliconflow' }
    });
    fireEvent.click(within(repairRoutePanel).getByRole('button', { name: '获取模型' }));
    await waitFor(() => {
      expect(within(repairRoutePanel).getByLabelText('写回修复 模型')).toHaveValue('pro');
    });
    fireEvent.click(within(repairRoutePanel).getByRole('button', { name: '保存' }));
    expect(screen.getByText('当前：siliconflow / pro')).toBeInTheDocument();
  });

  it('saves an API profile and keeps feature routes following the main LLM by default', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(await screen.findByRole('button', { name: 'API 配置' }));
    fireEvent.change(screen.getByLabelText('配置名称'), { target: { value: 'ggchan' } });
    fireEvent.change(screen.getByLabelText('接口类型'), { target: { value: 'openai-compatible' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://gcli.ggchan.dev/v1' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-test' } });
    fireEvent.change(screen.getByLabelText('模型列表'), { target: { value: 'pro\nflash' } });
    fireEvent.click(screen.getByRole('button', { name: '保存 API 档案' }));

    const profileList = screen.getByRole('complementary', { name: 'API 档案列表' });
    expect(await within(profileList).findByText('ggchan')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('主剧情 API'), { target: { value: 'ggchan' } });
    fireEvent.change(screen.getByLabelText('主剧情模型'), { target: { value: 'pro' } });
    fireEvent.click(screen.getByRole('button', { name: '保存主剧情模型' }));

    fireEvent.click(screen.getByRole('button', { name: '功能配置' }));
    expect(screen.getByRole('button', { name: '写回修复' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '记忆总结' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '向量检索配置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'NPC建档配置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'NPC动态模拟配置' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '记忆总结' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '功能 API 路由' })).toBeInTheDocument();
    expect(screen.getByText('当前：跟随主剧情')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '正文回忆分层' })).toBeInTheDocument();
    expect(screen.getByText('自动分层压缩')).toBeInTheDocument();
    expect(screen.getByLabelText('近期原文回合数')).toHaveValue(12);
    expect(screen.getByLabelText('短期合并数量')).toHaveValue(20);
    expect(screen.getByLabelText('中期合并数量')).toHaveValue(15);
    expect(screen.getByLabelText('长期投喂上限')).toHaveValue(24000);
    expect(screen.getByRole('region', { name: '记忆总结设置内容' })).toHaveClass('settings-page-scroll');

    fireEvent.click(screen.getByRole('button', { name: '写回修复' }));
    expect(screen.getByRole('heading', { name: '写回修复' })).toBeInTheDocument();
    expect(screen.getByText('当前：跟随主剧情')).toBeInTheDocument();
  });

  it('creates a new game through a paginated opening guide', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));

    expect(await screen.findByRole('heading', { name: '开局向导' })).toBeInTheDocument();
    expect(screen.getByText('步骤 1/5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '01 世界与剧本' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: '1988 纪律与人情' })).toBeInTheDocument();
    expect(screen.getByText('1980-1996 香港')).toBeInTheDocument();
    const worldpackSetup = screen.getByRole('region', { name: '世界包与剧情包设置' });
    expect(within(worldpackSetup).getByText('1980-1996 香港')).toBeInTheDocument();
    expect(within(worldpackSetup).getByLabelText('剧情素材影响')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /19\d\d / })).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: '1988 纪律与人情' }));

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('步骤 2/5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '身份选择' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '普通市民' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '警察' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '社团分子' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '警察' }));

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('步骤 3/5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '基础档案' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('玩家姓名'), { target: { value: '陈启明' } });
    expect(screen.getByLabelText('英文名')).toHaveAttribute('placeholder', '留空后按中文名生成');
    expect(screen.getByLabelText('英文名')).toHaveAttribute('title', '留空则按中文名、性别和80-90年代香港习惯生成');
    fireEvent.change(screen.getByLabelText('英文名'), { target: { value: 'Michael Chan' } });
    fireEvent.change(screen.getByLabelText('年龄'), { target: { value: '25' } });
    expect(screen.getByLabelText('出生月')).toHaveValue('4');
    expect(screen.getByLabelText('出生日')).toHaveValue('18');
    expect(screen.getByText('推导出生日期：1963-04-18')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('出生月'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('出生日'), { target: { value: '23' } });
    fireEvent.change(screen.getByLabelText('警员编号'), { target: { value: '95A278' } });
    expect(screen.getByText('推导出生日期：1963-07-23')).toBeInTheDocument();
    expect(screen.getByLabelText('警员编号')).toHaveValue('9527');
    expect(screen.queryByLabelText('家庭与经济')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '出身与背景' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择大陆新移民家庭' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '选择大陆新移民家庭' }));
    expect(screen.getByLabelText('部门')).toHaveValue('uniform');
    expect(screen.getByLabelText('驻点')).toHaveValue('mong_kok_police_station');
    fireEvent.change(screen.getByLabelText('驻点'), { target: { value: 'central_police_station' } });
    expect(screen.getByLabelText('岗位')).toHaveValue('patrol_constable');
    fireEvent.change(screen.getByLabelText('警阶'), { target: { value: 'inspector' } });
    expect(screen.getByLabelText('部门')).toHaveValue('cid');
    expect(screen.getByLabelText('驻点')).toHaveValue('central_police_station');
    fireEvent.change(screen.getByLabelText('驻点'), { target: { value: 'cid_headquarters' } });
    fireEvent.change(screen.getByLabelText('岗位'), { target: { value: 'case_officer' } });
    fireEvent.change(screen.getByLabelText('部门'), { target: { value: 'station_duty' } });
    expect(screen.getByLabelText('驻点')).toHaveValue('central_police_station');
    fireEvent.change(screen.getByLabelText('驻点'), { target: { value: 'central_police_station' } });
    expect(screen.getByLabelText('驻点')).toHaveValue('central_police_station');
    expect(screen.queryByText('当前职务锚点')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '粤语风味' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '轻微' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '中等' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '较多' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全粤语' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '较多' }));

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('步骤 4/5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '稳健新人' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '街头实干' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '会做人' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查案脑' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '枪法训练' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '硬骨头' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '街头实干' }));
    expect(screen.getByText(/剩余自由点/)).toBeInTheDocument();
    expect(screen.getByText('影响体力消耗、负伤承受、搏斗和长时间执勤的稳定性')).toBeInTheDocument();
    expect(screen.getByText('影响盘问谈判、安抚街坊、周旋人情与压住场面的能力')).toBeInTheDocument();
    expect(screen.getByText('影响抗压坚持、抵抗诱惑、承受威胁与灰色压力的韧性')).toBeInTheDocument();
    expect(screen.getByText('体魄').closest('label')).toHaveAttribute(
      'title',
      '体魄：影响体力消耗、负伤承受、搏斗和长时间执勤的稳定性'
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(20);
    expect(screen.getByText('最多选择 3 项')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('枪法稳'));
    fireEvent.click(screen.getByLabelText('会看场面'));
    fireEvent.click(screen.getByLabelText('街坊底'));
    expect(screen.getByLabelText('守规矩')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(screen.getByText('步骤 5/5')).toBeInTheDocument();
    const openingPressureSelect = screen.getByLabelText('开局压力');
    expect(openingPressureSelect).toHaveValue('relaxed');
    expect(within(openingPressureSelect).getAllByRole('option')).toHaveLength(5);
    fireEvent.change(screen.getByLabelText('开局额外要求'), {
      target: { value: '希望开局就有一个旧同学牵出的麻烦。' }
    });
    expect(screen.getByText('陈启明')).toBeInTheDocument();
    expect(screen.getByText('Michael Chan')).toBeInTheDocument();
    expect(screen.getByText('9527')).toBeInTheDocument();
    expect(screen.getByText(/枪法稳/)).toBeInTheDocument();
    expect(screen.getByText(/会看场面/)).toBeInTheDocument();
    expect(screen.getByText(/街坊底/)).toBeInTheDocument();
    expect(screen.getByText('较多')).toBeInTheDocument();
    expect(screen.getByText('大陆新移民家庭')).toBeInTheDocument();
    expect(screen.getByText(/Central Police Station/)).toBeInTheDocument();

    seedMainNarratorSettings();
    const fetchMock = mockOpeningFetch('真正开局：陈启明在中区警署报到，报案室里已经有人等他。');
    fireEvent.click(screen.getByRole('button', { name: '生成开局' }));
    expect(
      await screen.findByRole('heading', { name: '对唔住，我系差人' }, { timeout: 5_000 })
    ).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('1963-07-23');
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('开局压力：轻松开局');
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('普通日常开局');
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('正文禁用“暗流”一词');
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('阴谋、黑幕、幕后安排不是禁题');
    expect(await screen.findByText('陈启明')).toBeInTheDocument();
    expect(await screen.findByText('Michael Chan')).toBeInTheDocument();
    expect(await screen.findByText('9527')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '← 返回首页' }));

    fireEvent.click(screen.getByRole('button', { name: '读取游戏' }));
    const loadDialog = await screen.findByRole('dialog', { name: '存档管理' });
    expect(await within(loadDialog).findByText(/陈启明/)).toBeInTheDocument();
    fireEvent.click(within(loadDialog).getByRole('button', { name: '读取存档' }));

    expect(await screen.findByRole('heading', { name: '对唔住，我系差人' })).toBeInTheDocument();
    expect(screen.getByText('陈启明')).toBeInTheDocument();
  });

  it('saves edits and deletes custom origin backgrounds in localStorage', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));
    expect(await screen.findByRole('heading', { name: '开局向导' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    fireEvent.click(screen.getByRole('button', { name: '新建自定义' }));
    fireEvent.change(screen.getByLabelText('自定义名称'), { target: { value: '油尖旺旧楼家庭' } });
    fireEvent.change(screen.getByLabelText('成长环境'), { target: { value: '一家人挤在唐楼劏房，靠散工和小买卖维持生活。' } });
    fireEvent.change(screen.getByLabelText('早年牵连'), {
      target: { value: 'LLM 可生成房东、邻居、欠租压力、失踪亲属或街坊担保关系。' }
    });
    fireEvent.click(screen.getByRole('button', { name: '保存自定义出身' }));

    expect(screen.getByRole('button', { name: '选择油尖旺旧楼家庭' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('sorry-im-a-cop-v2-custom-origin-backgrounds') ?? '[]')[0]).toMatchObject({
      name: '油尖旺旧楼家庭'
    });

    fireEvent.click(screen.getByRole('button', { name: '编辑油尖旺旧楼家庭' }));
    fireEvent.change(screen.getByLabelText('自定义名称'), { target: { value: '庙街旧楼家庭' } });
    fireEvent.click(screen.getByRole('button', { name: '保存自定义出身' }));

    expect(screen.queryByRole('button', { name: '选择油尖旺旧楼家庭' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择庙街旧楼家庭' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除庙街旧楼家庭' }));
    expect(screen.queryByRole('button', { name: '选择庙街旧楼家庭' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('sorry-im-a-cop-v2-custom-origin-backgrounds') ?? '[]')).toEqual([]);
  });

  it('creates a save when starting a new game and can load it from the load screen', async () => {
    render(<App />);

    await startDefaultGameThroughOpening();
    fireEvent.click(screen.getByRole('button', { name: '← 返回首页' }));

    fireEvent.click(screen.getByRole('button', { name: '读取游戏' }));
    const dialog = await screen.findByRole('dialog', { name: '存档管理' });
    expect(await within(dialog).findByText('陈启明 · 回合 0')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '读取存档' }));

    expect(await screen.findByText('陈启明')).toBeInTheDocument();
  });

  it('opens the same save manager in save mode from gameplay and creates a manual save', async () => {
    render(<App />);
    await startDefaultGameThroughOpening();

    fireEvent.click(screen.getByRole('button', { name: '保存进度' }));

    const dialog = await screen.findByRole('dialog', { name: '存档管理' });
    expect(within(dialog).getByRole('heading', { name: '保存进度' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '保存当前进度' })).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: '手动存档' })).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: '自动存档' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '保存当前进度' }));

    const manualSection = within(dialog).getByRole('region', { name: '手动存档' });
    expect(await within(manualSection).findByText('陈启明 · 回合 0')).toBeInTheDocument();
    expect(within(manualSection).getByText('游戏时间：1988-09-12 星期一 21:15')).toBeInTheDocument();
    expect(within(manualSection).getByText(/保存时间：/)).toBeInTheDocument();
    expect(within(manualSection).queryByText(/手动保存 1988-09-12/)).not.toBeInTheDocument();
  });

  it('assigns new local save and rollback chain ids when importing a save archive', async () => {
    const externalRecord = createStoredSave('external_save', 'external_chain');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '读取游戏' }));
    const dialog = await screen.findByRole('dialog', { name: '存档管理' });
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const archive = { version: 1, saves: [externalRecord] };
    const file = new File([JSON.stringify(archive)], 'saves.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue(JSON.stringify(archive))
    });

    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    expect(await within(dialog).findByText('已导入 1 个存档。')).toBeInTheDocument();
    const imported = (await new IndexedDbSaveRepository().list())[0];
    expect(imported.saveId).not.toBe('external_save');
    expect(imported.rollbackChainId).toBeTruthy();
    expect(imported.rollbackChainId).not.toBe('external_chain');
  });

  it('cleans a rollback chain after its final save reference is deleted', async () => {
    const saveRepository = new IndexedDbSaveRepository();
    const snapshotRepository = await seedSnapshot('chain_orphan');
    await saveRepository.save(createStoredSave('save_orphan', 'chain_orphan'));

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '读取游戏' }));
    const dialog = await screen.findByRole('dialog', { name: '存档管理' });
    fireEvent.click(await within(dialog).findByRole('button', { name: '删除存档' }));

    await waitFor(async () => {
      expect(await snapshotRepository.listTurnSnapshots('chain_orphan')).toEqual([]);
    });
  });

  it('keeps a rollback chain while another save still references it', async () => {
    const saveRepository = new IndexedDbSaveRepository();
    const snapshotRepository = await seedSnapshot('chain_shared');
    await saveRepository.save(createStoredSave('save_manual', 'chain_shared', 'manual'));
    await saveRepository.save(createStoredSave('save_auto', 'chain_shared', 'auto'));

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '读取游戏' }));
    const dialog = await screen.findByRole('dialog', { name: '存档管理' });
    const manualSection = within(dialog).getByRole('region', { name: '手动存档' });
    fireEvent.click(await within(manualSection).findByRole('button', { name: '删除存档' }));

    await waitFor(async () => {
      expect((await saveRepository.list()).map((save) => save.saveId)).toEqual(['save_auto']);
    });
    expect((await snapshotRepository.listTurnSnapshots('chain_shared')).map((item) => item.turnNumber)).toEqual([1]);
  });

  it('keeps a rollback chain used by the currently running game after deleting its save', async () => {
    const saveRepository = new IndexedDbSaveRepository();
    const snapshotRepository = await seedSnapshot('chain_running');
    await saveRepository.save(createStoredSave('save_running', 'chain_running'));

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '读取游戏' }));
    let dialog = await screen.findByRole('dialog', { name: '存档管理' });
    fireEvent.click(await within(dialog).findByRole('button', { name: '读取存档' }));
    expect(await screen.findByText('玩家save_running')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '读取进度' }));
    dialog = await screen.findByRole('dialog', { name: '存档管理' });
    fireEvent.click(await within(dialog).findByRole('button', { name: '删除存档' }));

    await waitFor(async () => {
      expect(await saveRepository.list()).toEqual([]);
    });
    expect((await snapshotRepository.listTurnSnapshots('chain_running')).map((item) => item.turnNumber)).toEqual([1]);
  });

  it('cleans a previously running orphan chain after loading a different game', async () => {
    const saveRepository = new IndexedDbSaveRepository();
    const snapshotRepository = await seedSnapshot('chain_previous');
    await seedSnapshot('chain_next');
    await saveRepository.save(createStoredSave('save_previous', 'chain_previous'));
    await saveRepository.save(createStoredSave('save_next', 'chain_next'));

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '读取游戏' }));
    let dialog = await screen.findByRole('dialog', { name: '存档管理' });
    const previousSave = (await within(dialog).findByText('玩家save_previous · 回合 0')).closest('li');
    expect(previousSave).not.toBeNull();
    fireEvent.click(within(previousSave as HTMLElement).getByRole('button', { name: '读取存档' }));
    expect(await screen.findByText('玩家save_previous')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '读取进度' }));
    dialog = await screen.findByRole('dialog', { name: '存档管理' });
    const loadedPrevious = within(dialog).getByText('玩家save_previous · 回合 0').closest('li');
    fireEvent.click(within(loadedPrevious as HTMLElement).getByRole('button', { name: '删除存档' }));
    await waitFor(() => expect(within(dialog).queryByText('玩家save_previous · 回合 0')).not.toBeInTheDocument());

    const nextSave = within(dialog).getByText('玩家save_next · 回合 0').closest('li');
    fireEvent.click(within(nextSave as HTMLElement).getByRole('button', { name: '读取存档' }));
    expect(await screen.findByText('玩家save_next')).toBeInTheDocument();

    await waitFor(async () => {
      expect(await snapshotRepository.listTurnSnapshots('chain_previous')).toEqual([]);
    });
    expect((await snapshotRepository.listTurnSnapshots('chain_next')).map((item) => item.turnNumber)).toEqual([1]);
  });

  it('starts the opening profile with blank name, male-only default gender choices, and generated English name', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));
    expect(await screen.findByRole('heading', { name: '开局向导' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    expect(screen.getByLabelText('玩家姓名')).toHaveValue('');
    expect(screen.getByLabelText('英文名')).toHaveAttribute('placeholder', '留空后按中文名生成');

    const genderSelect = screen.getByLabelText('性别');
    expect(genderSelect).toHaveValue('male');
    expect(within(genderSelect).getByRole('option', { name: '男性' })).toBeInTheDocument();
    expect(within(genderSelect).getByRole('option', { name: '女性' })).toBeInTheDocument();
    expect(within(genderSelect).queryByRole('option', { name: '未指定' })).not.toBeInTheDocument();
    expect(within(genderSelect).queryByRole('option', { name: '非二元' })).not.toBeInTheDocument();
  });

  it('keeps the player in opening setup when the main narrator is not configured', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));
    expect(await screen.findByRole('heading', { name: '开局向导' })).toBeInTheDocument();

    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    }

    fireEvent.click(screen.getByRole('button', { name: '生成开局' }));

    expect(await screen.findByText(/请先在设置里配置主剧情 API 和模型/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '对唔住，我系差人' })).not.toBeInTheDocument();
  });

  it('shows streamed opening text while the true opening is generating', async () => {
    seedMainNarratorSettings();
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const stream = new ReadableStream<Uint8Array>({
          start(nextController) {
            controller = nextController;
          }
        });
        return new Response(stream, { status: 200 });
      })
    );

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));
    expect(await screen.findByRole('heading', { name: '开局向导' })).toBeInTheDocument();

    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    }

    fireEvent.click(screen.getByRole('button', { name: '生成开局' }));
    expect(await screen.findByRole('heading', { name: '对唔住，我系差人' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '开局向导' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(controller).toBeDefined();
    });
    controller.enqueue(encoder.encode(encodeOpenAiStreamDelta('{"narrativeText":"电话声从')));
    controller.enqueue(encoder.encode(encodeOpenAiStreamDelta('报案室深处响起"')));

    expect(await screen.findByText('电话声从报案室深处响起')).toBeInTheDocument();

    controller.enqueue(
      encoder.encode(
        encodeOpenAiStreamDelta(
          ',"suggestedActions":["先观察报案室"],"playerPatch":{"name":"陈启明","englishName":"Michael Chan","policeNumber":"9527"},"initialActors":[],"memories":[],"pressureSeeds":[]}'
        )
      )
    );
    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    controller.close();

    expect(screen.getByText('电话声从报案室深处响起')).toBeInTheDocument();
  });

  it('lets the player retry a failed opening without returning to setup', async () => {
    seedMainNarratorSettings();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createOpeningApiResponse({
          narrativeText: '',
          suggestedActions: [],
          initialActors: [],
          memories: [],
          pressureSeeds: []
        })
      )
      .mockResolvedValueOnce(
        createOpeningApiResponse({
          narrativeText: '重试后的开局正文：报案室的灯终于稳定下来。',
          suggestedActions: ['重新观察报案室'],
          playerPatch: {
            name: '陈启明',
            englishName: 'Michael Chan',
            policeNumber: '9527'
          },
          initialActors: [],
          memories: [],
          pressureSeeds: []
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));
    expect(await screen.findByRole('heading', { name: '开局向导' })).toBeInTheDocument();

    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    }

    fireEvent.click(screen.getByRole('button', { name: '生成开局' }));
    expect(await screen.findByRole('heading', { name: '对唔住，我系差人' })).toBeInTheDocument();
    expect(await screen.findByText(/开局生成失败/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '导出原文' }));
    const diagnosticDialog = await screen.findByRole('dialog', { name: '诊断导出' });
    const diagnosticText = within(diagnosticDialog).getByLabelText('诊断导出原文') as HTMLTextAreaElement;
    expect(diagnosticText.value).toContain('## 最近原始返回');
    expect(diagnosticText.value).not.toContain('最近模型原文');
    expect(diagnosticText.value).toContain('"narrativeText":""');
    fireEvent.click(within(diagnosticDialog).getByRole('button', { name: '关闭' }));

    fireEvent.click(screen.getByRole('button', { name: '重试开局' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('button', { name: '执行行动' })).not.toBeDisabled();
    });
    expect(screen.getByText(/重试后的开局正文/)).toBeInTheDocument();
  });

  it('exports current narrative diagnostics and copies them with one click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    });

    render(<App />);
    await startDefaultGameThroughOpening();

    fireEvent.click(screen.getByRole('button', { name: '导出原文' }));

    const dialog = await screen.findByRole('dialog', { name: '诊断导出' });
    const diagnosticText = within(dialog).getByLabelText('诊断导出原文') as HTMLTextAreaElement;
    expect(diagnosticText.value).toContain('## 剧情正文');
    expect(diagnosticText.value).toContain('## Runtime State Snapshot');
    expect(diagnosticText.value).not.toContain('"embeddingVector"');

    fireEvent.click(within(dialog).getByRole('button', { name: '复制全部' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('## 剧情正文'));
    });
    expect(within(dialog).getByText('已复制。')).toBeInTheDocument();
  });

  it('renders player-facing panels and runs a mock turn', async () => {
    runPlayerTurnMock.mockImplementation(async ({ state, playerInput }) => createTurnResult(state, undefined, playerInput));

    render(<App />);
    await startDefaultGameThroughOpening();

    expect(screen.getByRole('heading', { name: '对唔住，我系差人' })).toBeInTheDocument();
    expect(screen.getByLabelText('当前时间地点')).toBeInTheDocument();
    expect(screen.getByLabelText(/^天气：/)).toHaveAttribute('aria-describedby', 'game-weather-detail');
    expect(screen.getByRole('tooltip')).toHaveTextContent('·');
    expect(screen.getByRole('button', { name: '重掷开局' })).toBeInTheDocument();
    expect(screen.getByText('陈启明')).toBeInTheDocument();
    expect(screen.getByText('旺角警署')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('玩家行动'), {
      target: { value: '我接起电话。' }
    });
    fireEvent.click(screen.getByRole('button', { name: '执行行动' }));

    await waitFor(() => {
      expect(screen.getByText('我接起电话。')).toBeInTheDocument();
      expect(screen.getByText(/报案室的电话线里传来一点杂音/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: '重掷开局' })).not.toBeInTheDocument();
  });

  it('fills the action input from suggested actions without submitting immediately', async () => {
    runPlayerTurnMock.mockImplementation(async ({ state, playerInput }) => createTurnResult(state, undefined, playerInput));

    render(<App />);
    await startDefaultGameThroughOpening();

    fireEvent.click(screen.getByRole('button', { name: '先观察报案室' }));

    expect(screen.getByLabelText('玩家行动')).toHaveValue('先观察报案室');
    expect(runPlayerTurnMock).not.toHaveBeenCalled();
  });

  it('shows streamed turn text while waiting for the final structured response', async () => {
    const pendingTurn = defer<RuntimeState>();
    runPlayerTurnMock.mockImplementation((input) => {
      const streamable = input as typeof input & { onNarrativeDelta?: (delta: string) => void };
      streamable.onNarrativeDelta?.('电话线里传来');
      streamable.onNarrativeDelta?.('断续杂音。');
      return pendingTurn.promise;
    });

    render(<App />);
    await startDefaultGameThroughOpening();

    fireEvent.change(screen.getByLabelText('玩家行动'), {
      target: { value: '我接起电话。' }
    });
    fireEvent.click(screen.getByRole('button', { name: '执行行动' }));

    expect(await screen.findByText('电话线里传来断续杂音。')).toBeInTheDocument();

    const submittedState = runPlayerTurnMock.mock.calls[0][0].state;
    pendingTurn.resolve(createTurnResult(submittedState, '报案室的电话线里传来一点杂音，最后完整接通。', '我接起电话。'));

    await waitFor(() => {
      expect(screen.getByText('报案室的电话线里传来一点杂音，最后完整接通。')).toBeInTheDocument();
    });
  });

  it('uses the configured main narrator for gameplay turns', async () => {
    const pendingTurn = defer<RuntimeState>();
    runPlayerTurnMock.mockReturnValue(pendingTurn.promise);

    render(<App />);
    await startDefaultGameThroughOpening();

    fireEvent.change(screen.getByLabelText('玩家行动'), {
      target: { value: '我先看一眼报案室里谁在。' }
    });
    fireEvent.click(screen.getByRole('button', { name: '执行行动' }));

    await waitFor(() => {
      expect(runPlayerTurnMock).toHaveBeenCalled();
    });

    expect(runPlayerTurnMock.mock.calls[0][0].narrator.constructor.name).toBe('OpenAiCompatibleNarratorClient');
    pendingTurn.reject(new Error('stop pending test turn'));
  });

  it('passes the configured memory vector client into gameplay turns', async () => {
    const settings: AiSettings = {
      ...createDefaultAiSettings(),
      version: 1,
      apiProfiles: [
        {
          id: 'api_main',
          name: 'Main API',
          providerLabel: 'OpenAI compatible',
          interfaceType: 'openai-compatible',
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'sk-test',
          models: ['story-model', 'embedding-model'],
          defaultMaxTokens: 4096,
          defaultTemperature: 0.7,
          createdAt: '2026-06-23T00:00:00.000Z',
          updatedAt: '2026-06-23T00:00:00.000Z'
        }
      ],
      mainNarrator: {
        apiProfileId: 'api_main',
        model: 'story-model',
        maxTokens: 4096,
        temperature: 0.7
      },
      featureRoutes: {
        writebackRepair: { mode: 'follow-main' },
        memorySummary: { mode: 'follow-main' },
        memoryVector: {
          mode: 'custom',
          apiProfileId: 'api_main',
          model: 'embedding-model'
        },
        npcSimulation: { mode: 'follow-main' },
        backgroundEvolution: { mode: 'follow-main' },
        auxiliaryGeneration: { mode: 'follow-main' }
      },
      game: {
        storyRenderLimit: 30,
        narrativeLengthLevel: 'standard',
        narrativePerspective: 'second_person',
        autoSaveLimit: 20,
        autoSaveIntervalTurns: 1,
        rollbackSnapshotLimit: 20,
        pregnancyMode: 'standard'
      },
      memory: {
        autoCompressionEnabled: true,
        recentRawTurnLimit: 12,
        shortTermBatchSize: 20,
        midTermBatchSize: 15,
        longTermPromptTokenBudget: 24000
      }
    };
    const pendingTurn = defer<RuntimeState>();
    runPlayerTurnMock.mockReturnValue(pendingTurn.promise);

    render(<App />);
    await startDefaultGameThroughOpening(undefined, settings);
    const actionInput = screen.getAllByRole('textbox').find((element) => element.id === 'player-action');
    expect(actionInput).toBeDefined();
    fireEvent.change(actionInput as HTMLElement, { target: { value: 'semantic query' } });
    fireEvent.submit((actionInput as HTMLElement).closest('form') as HTMLFormElement);

    await waitFor(() => {
      expect(runPlayerTurnMock).toHaveBeenCalled();
    });
    expect(runPlayerTurnMock.mock.calls[0][0].memoryEmbedding?.constructor.name).toBe('OpenAiCompatibleMemoryEmbeddingClient');
    pendingTurn.reject(new Error('stop pending test turn'));
  });

  it('auto-saves the current save after a successful gameplay turn', async () => {
    runPlayerTurnMock.mockImplementation(async ({ state, playerInput }) => createTurnResult(state, undefined, playerInput));

    render(<App />);
    await startDefaultGameThroughOpening();

    fireEvent.change(screen.getByLabelText('玩家行动'), {
      target: { value: '我先看一眼报案室里谁在。' }
    });
    fireEvent.click(screen.getByRole('button', { name: '执行行动' }));

    await waitFor(() => {
      expect(screen.getByText(/报案室的电话线里传来一点杂音/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '执行行动' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '← 返回首页' }));
    fireEvent.click(screen.getByRole('button', { name: '读取游戏' }));

    const dialog = await screen.findByRole('dialog', { name: '存档管理' });
    const autoSection = within(dialog).getByRole('region', { name: '自动存档' });
    const latestAutoTitle = await within(autoSection).findByText('陈启明 · 回合 1');
    const latestAutoItem = latestAutoTitle.closest('li') as HTMLElement;
    expect(within(latestAutoItem).getByText('游戏时间：1988-09-12 星期一 21:15')).toBeInTheDocument();
    expect(within(latestAutoItem).getByText(/保存时间：/)).toBeInTheDocument();
    expect(within(latestAutoItem).queryByText(/自动存档 1988-09-12/)).not.toBeInTheDocument();
  });

  it('respects the configured automatic save interval', async () => {
    runPlayerTurnMock.mockImplementation(async ({ state, playerInput }) => createTurnResult(state, undefined, playerInput));

    render(<App />);
    await startDefaultGameThroughOpening({ autoSaveIntervalTurns: 2 });

    fireEvent.change(screen.getByLabelText('玩家行动'), {
      target: { value: '我先记录一下报案室情况。' }
    });
    fireEvent.click(screen.getByRole('button', { name: '执行行动' }));
    await waitFor(() => {
      expect(screen.getByText(/报案室的电话线里传来一点杂音/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '执行行动' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '读取进度' }));
    let dialog = await screen.findByRole('dialog', { name: '存档管理' });
    let autoSection = within(dialog).getByRole('region', { name: '自动存档' });
    expect(within(autoSection).queryByText(/回合 1/)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭存档' }));

    fireEvent.change(screen.getByLabelText('玩家行动'), {
      target: { value: '我继续留意柜台电话。' }
    });
    fireEvent.click(screen.getByRole('button', { name: '执行行动' }));
    await waitFor(() => {
      expect(screen.getByText(/报案室的电话线里传来一点杂音/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '执行行动' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '读取进度' }));
    dialog = await screen.findByRole('dialog', { name: '存档管理' });
    autoSection = within(dialog).getByRole('region', { name: '自动存档' });
    expect(await within(autoSection).findByText(/回合 2/)).toBeInTheDocument();
  });

  it('prunes old automatic saves beyond the configured retention count', async () => {
    runPlayerTurnMock.mockImplementation(async ({ state, playerInput }) => createTurnResult(state, undefined, playerInput));

    render(<App />);
    await startDefaultGameThroughOpening({ autoSaveLimit: 1 });

    fireEvent.change(screen.getByLabelText('玩家行动'), { target: { value: '我检查值班记录。' } });
    fireEvent.click(screen.getByRole('button', { name: '执行行动' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '执行行动' })).not.toBeDisabled();
    });

    fireEvent.change(screen.getByLabelText('玩家行动'), { target: { value: '我继续听电话。' } });
    fireEvent.click(screen.getByRole('button', { name: '执行行动' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '执行行动' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '读取进度' }));
    const dialog = await screen.findByRole('dialog', { name: '存档管理' });
    const autoSection = within(dialog).getByRole('region', { name: '自动存档' });
    expect(await within(autoSection).findByText(/回合 2/)).toBeInTheDocument();
    expect(within(autoSection).queryByText(/回合 1/)).not.toBeInTheDocument();
  });

  it('disables command controls and prevents duplicate submissions while a turn is running', async () => {
    const pendingTurn = defer<RuntimeState>();
    runPlayerTurnMock.mockReturnValue(pendingTurn.promise);

    render(<App />);
    await startDefaultGameThroughOpening();

    const actionInput = screen.getByLabelText('玩家行动');
    const actionButton = screen.getByRole('button', { name: '执行行动' });

    fireEvent.change(actionInput, {
      target: { value: '我接起电话。' }
    });
    fireEvent.click(actionButton);

    await waitFor(() => {
      expect(actionInput).toBeDisabled();
      expect(screen.getByRole('button', { name: '中止生成' })).not.toBeDisabled();
    });

    expect(runPlayerTurnMock).toHaveBeenCalledTimes(1);

    const submittedState = runPlayerTurnMock.mock.calls[0][0].state;
    pendingTurn.resolve(createTurnResult(submittedState, undefined, '我接起电话。'));

    await waitFor(() => {
      expect(actionInput).not.toBeDisabled();
      expect(screen.getByRole('button', { name: '执行行动' })).not.toBeDisabled();
      expect(screen.queryByRole('button', { name: '中止生成' })).not.toBeInTheDocument();
    });
  });

  it('shows a minimal player-facing error and re-enables controls when a turn fails', async () => {
    runPlayerTurnMock.mockRejectedValue(new Error('接口响应超时（120 秒）。'));

    render(<App />);
    await startDefaultGameThroughOpening();

    const actionInput = screen.getByLabelText('玩家行动');
    const actionButton = screen.getByRole('button', { name: '执行行动' });

    fireEvent.change(actionInput, {
      target: { value: '我接起电话。' }
    });
    fireEvent.click(actionButton);

    await waitFor(() => {
      expect(screen.getByText('行动未完成：接口响应超时。行动内容已放回输入框。')).toBeInTheDocument();
      expect(actionInput).not.toBeDisabled();
      expect(actionButton).not.toBeDisabled();
      expect(actionInput).toHaveValue('我接起电话。');
    });
  });

  it('rolls back a failed player entry before a successful retry', async () => {
    runPlayerTurnMock
      .mockRejectedValueOnce(new Error('turn failed'))
      .mockImplementationOnce(async ({ state, playerInput }) =>
        createTurnResult(state, '报案室的电话线里传来一点杂音。第二次接通了。', playerInput)
      );

    render(<App />);
    await startDefaultGameThroughOpening();

    const actionInput = screen.getByLabelText('玩家行动');
    const actionButton = screen.getByRole('button', { name: '执行行动' });

    fireEvent.change(actionInput, {
      target: { value: '我接起电话。' }
    });
    fireEvent.click(actionButton);

    await waitFor(() => {
      expect(screen.getByText('行动未完成：系统处理异常。行动内容已放回输入框。')).toBeInTheDocument();
      expect(screen.queryByText('我接起电话。')).not.toBeInTheDocument();
    });

    fireEvent.change(actionInput, {
      target: { value: '我重新接起电话。' }
    });
    fireEvent.click(actionButton);

    await waitFor(() => {
      expect(screen.queryByText('我接起电话。')).not.toBeInTheDocument();
      expect(screen.getAllByText('我重新接起电话。')).toHaveLength(1);
      expect(screen.getByText(/第二次接通了/)).toBeInTheDocument();
    });
  });

  it('renders the player-facing game layout without developer JSON', async () => {
    render(<App />);
    await startDefaultGameThroughOpening();

    expect(screen.getByRole('button', { name: '← 返回首页' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存进度' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '读取进度' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '人物志' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '人物志' }));
    const characterDialog = await screen.findByRole('dialog', { name: '人物志' });
    expect(within(characterDialog).getByText('梁志强')).toBeInTheDocument();
    fireEvent.click(within(characterDialog).getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('dialog', { name: '人物志' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '剧情正文' })).toBeInTheDocument();
    expect(screen.getByText('现金')).toBeInTheDocument();
    expect(screen.getByText('存款')).toBeInTheDocument();
    expect(screen.getAllByText(/HK\$/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('住所')).toBeInTheDocument();
    expect(screen.queryByText('开发者视图')).not.toBeInTheDocument();
    expect(screen.queryByText(/"runtimeVersion"/)).not.toBeInTheDocument();
  });

  it('closes settings back to gameplay when opened from the game screen', async () => {
    render(<App />);
    await startDefaultGameThroughOpening();

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    expect(
      await screen.findByRole('heading', { name: '设置' }, { timeout: 5_000 }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭设置' }));

    expect(await screen.findByRole('region', { name: '剧情正文' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存进度' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← 返回首页' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始游戏' })).not.toBeInTheDocument();
  });
});
