import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VisualRepository } from '../../domain/imageGeneration/visualRepository';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { GameTime, MemoryItem, RuntimeState } from '../../domain/runtime/types';
import { PlayerDossierModal } from './PlayerDossierModal';

const baseTime: GameTime = {
  year: 1988,
  month: 9,
  day: 13,
  hour: 10,
  minute: 0
};

function memory(overrides: Partial<MemoryItem>): MemoryItem {
  return {
    memoryId: overrides.memoryId ?? 'memory_player_1',
    text: overrides.text ?? '玩家在旺角警署完成了一次关键交接。',
    kind: overrides.kind ?? 'player',
    tier: overrides.tier ?? 'long_term',
    relatedActorIds: overrides.relatedActorIds ?? ['player'],
    relatedCaseIds: overrides.relatedCaseIds ?? [],
    relatedPlaceIds: overrides.relatedPlaceIds ?? [],
    relatedOrganizationIds: overrides.relatedOrganizationIds ?? [],
    relatedTurnId: overrides.relatedTurnId,
    gameTime: overrides.gameTime ?? baseTime,
    importance: overrides.importance ?? 70,
    visibility: overrides.visibility ?? 'player_known',
    certainty: overrides.certainty ?? 'fact',
    embeddingText: overrides.embeddingText ?? overrides.text ?? '玩家在旺角警署完成了一次关键交接。'
  };
}

function createDossierState(): RuntimeState {
  const state = createInitialRuntimeState();
  state.time = baseTime;
  state.player = {
    ...state.player,
    name: '梁志文',
    englishName: 'Vincent Leung',
    gender: 'male',
    policeNumber: '7788',
    birthDate: '1964-03-12',
    personality: '谨慎，观察欲强，做事重程序。',
    appearance: '二十四岁左右，眼神疲惫但清醒。',
    clothing: '旧夹克外罩警署便装。',
    progression: {
      level: 3,
      experience: 45,
      unspentAttributePoints: 2
    },
    originBackground: {
      originBackgroundId: 'estate_kid',
      name: '屋邨子弟',
      definition: '在公屋或旧式屋邨长大。',
      backgroundSummary: '熟悉街坊、人情、补习、家用和邻里纠纷。'
    }
  };
  state.actors.player = {
    ...state.actors.player,
    name: '梁志文',
    englishName: 'Vincent Leung',
    birthDate: '1964-03-12',
    computedAge: 24,
    publicIdentity: '旺角军装警员',
    actualIdentitySummary: '皇家香港警察基层警员，正在学习街面规矩。',
    positionSummary: '旺角警署军装巡逻警员',
    profileSummary: '屋邨出身的新丁警员，靠观察和文书细节补足经验。',
    appearance: '二十四岁左右，眼神疲惫但清醒。',
    clothing: '旧夹克外罩警署便装。',
    personality: '谨慎，观察欲强，做事重程序。',
    speechStyle: '对白带中等粤语风味，语气克制。',
    motivation: '想在不越权的情况下把案子办稳。',
    longTermGoal: '在警队站稳脚跟，保护身边街坊。',
    values: '重程序，也重街坊情面。',
    currentPlaceId: 'place_mong_kok_police_station',
    currentSceneId: 'scene_report_room'
  };
  state.lawIdentity = {
    ...state.lawIdentity,
    rank: 'Constable (PC)',
    stationOrPost: 'Mong Kok Police Station（旺角警署）',
    department: 'Uniform Branch（军装巡逻）',
    assignmentSummary: '日常值班与街面巡逻'
  };
  state.finance.bankBalance = 9999;
  state.player.reputation.summary = '这段文本不应在主角资料中显示。';
  state.memories = {
    memory_player_1: memory({
      memoryId: 'memory_player_1',
      text: '玩家把信德中心储物柜钥匙列为下一阶段重点。',
      gameTime: { ...baseTime, hour: 10, minute: 0 },
      importance: 80
    }),
    memory_player_2: memory({
      memoryId: 'memory_player_2',
      text: '玩家在观塘码头保护了阿玲和兰姐。',
      gameTime: { ...baseTime, hour: 8, minute: 30 },
      importance: 75
    }),
    memory_short_term: memory({
      memoryId: 'memory_short_term',
      text: '短期现场提示不应显示在长期记录。',
      tier: 'short_term'
    }),
    memory_hidden: memory({
      memoryId: 'memory_hidden',
      text: '隐藏记忆不应显示。',
      visibility: 'hidden'
    }),
    memory_other: memory({
      memoryId: 'memory_other',
      text: '其他人物的无关记忆不应显示。',
      kind: 'actor',
      relatedActorIds: ['actor_other']
    })
  };
  return state;
}

describe('PlayerDossierModal', () => {
  it('opens the visual editor immediately when entered from the portrait shortcut', async () => {
    const state = createDossierState();
    const repository = {
      loadSnapshot: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        saveId: 'save-player-avatar-shortcut',
        characterAnchors: {},
        scenePlans: {},
        tasks: {},
        characterBatches: {},
        assets: {},
        bindings: {},
        storySceneDisplayStates: {}
      })
    } as unknown as VisualRepository;

    render(
      <PlayerDossierModal
        state={state}
        onClose={vi.fn()}
        onStateChange={vi.fn()}
        visualSaveId="save-player-avatar-shortcut"
        visualRepository={repository}
        initialVisualEditorOpen
      />
    );

    const summary = screen.getByText('生成、导入或更换主角头像');
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(await screen.findByText('当前唯一角色锚点')).toBeInTheDocument();
  });

  it('renders only the approved identity, profile and long-record sections', () => {
    render(<PlayerDossierModal state={createDossierState()} onStateChange={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '主角资料' });
    expect(dialog).toHaveTextContent('PLAYER DOSSIER');
    expect(dialog).toHaveTextContent('梁志文');
    expect(dialog).toHaveTextContent('Vincent Leung');
    expect(dialog).toHaveTextContent('男');
    expect(dialog).toHaveTextContent('24岁');
    expect(dialog).toHaveTextContent('7788');
    expect(dialog).toHaveTextContent('Constable (PC)');
    expect(dialog).toHaveTextContent('旺角警署');
    expect(dialog).toHaveTextContent('报案室');

    expect(within(dialog).getByRole('heading', { name: '人物档案' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('屋邨子弟');
    expect(dialog).toHaveTextContent('屋邨出身的新丁警员');
    expect(dialog).toHaveTextContent('旧夹克外罩警署便装');
    expect(dialog).toHaveTextContent('在警队站稳脚跟');
    expect(dialog).not.toHaveTextContent('说话风格');
    expect(dialog).not.toHaveTextContent('对白带中等粤语风味');
    expect(within(dialog).getByRole('heading', { name: '等级成长' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Lv.3');
    expect(dialog).toHaveTextContent('可用属性点 2');
    expect(dialog).toHaveTextContent('45 / 300');

    expect(within(dialog).getByRole('heading', { name: '长期记录' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('玩家把信德中心储物柜钥匙列为下一阶段重点。');
    expect(dialog).toHaveTextContent('玩家在观塘码头保护了阿玲和兰姐。');
    expect(dialog).not.toHaveTextContent('短期现场提示不应显示在长期记录。');
    expect(dialog).not.toHaveTextContent('隐藏记忆不应显示');
    expect(dialog).not.toHaveTextContent('其他人物的无关记忆不应显示');

    expect(dialog).not.toHaveTextContent('固定资产');
    expect(dialog).not.toHaveTextContent('月净额');
    expect(dialog).not.toHaveTextContent('整体口碑');
  });

  it('uses scoped dossier field rows instead of definition-list layout', () => {
    render(<PlayerDossierModal state={createDossierState()} onStateChange={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '主角资料' });
    expect(dialog.querySelectorAll('.player-dossier-field-row').length).toBeGreaterThan(8);
    expect(dialog.querySelector('dl')).toBeNull();
    expect(dialog.querySelector('dt')).toBeNull();
    expect(dialog.querySelector('dd')).toBeNull();
  });

  it('uses the canonical law identity rank when a legacy actor profile is stale', () => {
    const state = createDossierState();
    state.lawIdentity.rank = 'Inspector（督察 IP）';
    if (state.actors.player.roleProfiles.police) {
      state.actors.player.roleProfiles.police.rank = 'Constable (PC)';
    }

    render(<PlayerDossierModal state={state} onStateChange={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '主角资料' });
    expect(dialog).toHaveTextContent('Inspector（督察 IP）');
    expect(dialog).not.toHaveTextContent('Constable (PC)');
  });

  it('spends a free point and keeps the player actor attributes synchronized', () => {
    const state = createDossierState();
    const onStateChange = vi.fn();
    const bodyBefore = state.player.attributes.body;

    render(<PlayerDossierModal state={state} onStateChange={onStateChange} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '提升体魄' }));

    expect(onStateChange).toHaveBeenCalledTimes(1);
    const nextState = onStateChange.mock.calls[0]?.[0] as RuntimeState;
    expect(nextState.player.attributes.body).toBe(bodyBefore + 1);
    expect(nextState.player.progression.unspentAttributePoints).toBe(1);
    expect(nextState.actors.player.attributes.body).toBe(bodyBefore + 1);
  });

  it('shows only the current triad shell while keeping player-known secrets in a clearly private section', () => {
    const state = createDossierState();
    state.player.currentIdentity = 'gang_member';
    state.player.originIdentity = 'police';
    state.actors.player.currentIdentity = 'gang_member';
    state.actors.player.publicIdentity = '和胜和庙街外围跑腿';
    state.actors.player.roleProfiles.triad = {
      status: 'cover',
      organizationId: 'org_wo_shing_wo',
      societyName: '和胜和',
      roleTitle: '庙街外围跑腿',
      rankSummary: '外围新人',
      territorySummary: '庙街与油麻地一带',
      patronActorIds: [],
      peerActorIds: [],
      rivalActorIds: [],
      obligationSummary: '替上线传话。',
      riskSummary: '需要应对内部试探。'
    };
    state.lawIdentity.status = 'hidden';
    state.secretFacts.secret_known_undercover = {
      secretId: 'secret_known_undercover',
      ownerType: 'player',
      ownerId: 'player',
      kind: 'identity',
      summary: '玩家实际为警队派入社团的卧底警员。',
      playerCharacterKnown: true,
      publicKnown: false,
      knownByActorIds: ['actor_handler'],
      revealState: 'known_to_some_actors',
      revealConditions: ['身份暴露。'],
      visibility: 'player_known',
      importance: 100,
      createdAt: baseTime,
      updatedAt: baseTime
    };
    state.secretFacts.secret_director_only = {
      ...state.secretFacts.secret_known_undercover,
      secretId: 'secret_director_only',
      summary: '联络人已经被内部调查，但主角尚不知情。',
      playerCharacterKnown: false,
      visibility: 'hidden'
    };

    render(<PlayerDossierModal state={state} onStateChange={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '主角资料' });
    const identityHeader = within(dialog).getByRole('region', { name: '身份头部' });
    expect(dialog).toHaveTextContent('和胜和庙街外围跑腿');
    expect(dialog).toHaveTextContent('外围新人');
    expect(dialog).toHaveTextContent('主角已知 · 未公开');
    expect(dialog).toHaveTextContent('玩家实际为警队派入社团的卧底警员。');
    expect(identityHeader).not.toHaveTextContent('7788');
    expect(identityHeader).not.toHaveTextContent('Constable (PC)');
    expect(within(identityHeader).queryByText('警署', { selector: '.player-dossier-field-label' })).toBeNull();
    expect(dialog).not.toHaveTextContent('联络人已经被内部调查');
  });

  it('shows the police shell for a triad operative embedded in the police without exposing the hidden triad profile', () => {
    const state = createDossierState();
    state.player.currentIdentity = 'police';
    state.player.originIdentity = 'gang_member';
    state.actors.player.currentIdentity = 'police';
    state.actors.player.publicIdentity = '旺角警署军装巡逻警员';
    state.actors.player.roleProfiles.triad = {
      status: 'hidden',
      organizationId: 'org_wo_shing_wo',
      societyName: '和胜和',
      roleTitle: '社团暗线',
      rankSummary: '外围成员',
      territorySummary: '油麻地',
      patronActorIds: [],
      peerActorIds: [],
      rivalActorIds: [],
      obligationSummary: '向上线传递消息。',
      riskSummary: '身份一旦暴露将被拘捕。'
    };

    render(<PlayerDossierModal state={state} onStateChange={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '主角资料' });
    expect(dialog).toHaveTextContent('旺角警署军装巡逻警员');
    expect(dialog).toHaveTextContent('7788');
    expect(dialog).toHaveTextContent('Constable (PC)');
    expect(dialog).not.toHaveTextContent('和胜和');
    expect(dialog).not.toHaveTextContent('社团暗线');
  });
});
