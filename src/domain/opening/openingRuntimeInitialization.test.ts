import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import {
  applyOpeningRuntimeDomainRepair,
  createOpeningRuntimeDomainRepairPrompt,
  validateOpeningRuntimeCandidate
} from './openingRuntimeInitialization';
import type { OpeningBlueprint } from './openingBlueprintSchema';

function candidate() {
  return {
    openingSessionId: 'opening_runtime',
    playerPresentationPatch: {
      clothing: '整齐便装。',
      equipment: [],
      statusSummary: '精神清醒。'
    },
    playerStatePatch: {
      economy: {
        cashOnHand: 500,
        bankBalance: 1200,
        monthlyPressure: 30,
        financeSummary: '收入有限但尚有存款。'
      },
      homeBase: {
        placeId: 'place_home_player_opening',
        placeName: '湾仔唐楼住所',
        regionId: 'region_wan_chai',
        housingType: '唐楼分租房',
        summary: '靠近警署的旧式分租房。',
        householdSummary: '独自居住。'
      }
    },
    memories: [
      {
        text: '玩家完成开局交更。',
        kind: 'turn',
        relatedActorIds: ['player'],
        relatedCaseIds: [],
        relatedPlaceIds: ['place_wan_chai_police_station'],
        relatedOrganizationIds: ['org_hk_police'],
        importance: 70,
        visibility: 'player_known',
        certainty: 'fact'
      }
    ]
  };
}

function blueprint(
  actors: Array<{
    actorId: string;
    name: string;
    playerRoleRelation?: string;
    organizationIds?: string[];
  }> = []
): OpeningBlueprint {
  return {
    openingSessionId: 'opening_runtime',
    openingFacts: {
      placeId: 'place_wan_chai_police_station',
      sceneId: 'scene_opening',
      situationSummary: '开局现场已经锁定。',
      centralMatter: '玩家需要处理眼前事项。',
      playerDecisionBoundary: '玩家自行决定下一步。'
    },
    initialActors: actors.map((actor) => ({
      ...actor,
      organizationIds: actor.organizationIds ?? []
    })),
    actionIntents: []
  } as never;
}

describe('opening runtime initialization', () => {
  it('keeps valid economy and home when only another domain is invalid', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const raw = {
      ...candidate(),
      currentMatterPatches: [
        {
          id: 'matter_opening_police',
          title: '当值工作',
          summary: '完成交更。',
          status: 'active',
          priority: '高'
        }
      ]
    };
    const result = validateOpeningRuntimeCandidate(
      raw,
      'opening_runtime',
      state,
      blueprint()
    );

    expect(result.value).toBeUndefined();
    expect(result.acceptedDomains.economy).toEqual(
      candidate().playerStatePatch.economy
    );
    expect(result.acceptedDomains.homeBase).toEqual(
      candidate().playerStatePatch.homeBase
    );
    expect(result.issues.map((issue) => issue.domain)).toEqual([
      'currentMatter'
    ]);
  });

  it('applies only requested domain repairs and preserves accepted required domains', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const raw = {
      ...candidate(),
      memories: [{ kind: 'turn' }, { kind: 'turn' }]
    };
    const first = validateOpeningRuntimeCandidate(
      raw,
      'opening_runtime',
      state,
      blueprint()
    );
    const repaired = applyOpeningRuntimeDomainRepair(
      raw,
      {
        domains: {
          memory: candidate().memories
        }
      },
      first.issues
    );
    const final = validateOpeningRuntimeCandidate(
      repaired,
      'opening_runtime',
      state,
      blueprint()
    );

    expect(final.value?.playerStatePatch.economy.bankBalance).toBe(1200);
    expect(final.value?.memories).toHaveLength(1);
  });

  it('normalizes numeric economy strings locally and merges only a repaired field', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const raw = candidate();
    raw.playerStatePatch.economy = {
      cashOnHand: '500',
      bankBalance: 1200,
      monthlyPressure: 30,
      financeSummary: ''
    } as never;
    const first = validateOpeningRuntimeCandidate(
      raw,
      'opening_runtime',
      state,
      blueprint()
    );

    expect(first.issues.map((issue) => issue.domain)).toContain('economy');
    expect(first.normalizedPaths).toContain(
      'playerStatePatch.economy.cashOnHand'
    );

    const repaired = applyOpeningRuntimeDomainRepair(
      raw,
      { domains: { economy: { financeSummary: '收入有限但尚有存款。' } } },
      first.issues.filter((issue) => issue.domain === 'economy')
    );
    const final = validateOpeningRuntimeCandidate(
      repaired,
      'opening_runtime',
      state,
      blueprint()
    );

    expect(final.value?.playerStatePatch.economy).toEqual({
      cashOnHand: 500,
      bankBalance: 1200,
      monthlyPressure: 30,
      financeSummary: '收入有限但尚有存款。'
    });
  });

  it('locally wraps one complete current-matter object without an AI repair', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    const base = candidate();
    const currentMatter = {
      id: 'matter_opening_civilian',
      title: '确认一项生活联络',
      summary: '街坊已把误投信件交还给玩家。',
      status: 'active',
      priority: 25,
      visibility: 'known',
      source: 'opening_livelihood',
      matterKind: 'livelihood',
      relatedActorIds: ['actor_opening_civilian_social_relation'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedOrganizationIds: []
    };
    const result = validateOpeningRuntimeCandidate(
      {
        ...base,
        currentMatterPatches: currentMatter
      },
      'opening_session_test',
      state,
      blueprint([
        {
          actorId: 'actor_opening_civilian_social_relation',
          name: '街坊',
          playerRoleRelation: 'civilian_social_relation'
        }
      ])
    );

    expect(result.issues).toEqual([]);
    expect(result.normalizedPaths).toContain('currentMatterPatches');
    expect(result.value?.currentMatterPatches).toEqual([currentMatter]);
  });

  it('keeps a valid current matter unchanged', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const currentMatter = {
      id: 'matter_opening_police',
      title: '当值工作',
      summary: '完成交更并核对当日任务。',
      status: 'active',
      priority: 70,
      visibility: 'known',
      source: 'opening_police_duty',
      matterKind: 'police_work',
      pressureLevel: 1,
      responseWindow: 'today',
      relatedActorIds: [],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      relatedOrganizationIds: []
    };
    const result = validateOpeningRuntimeCandidate(
      {
        ...candidate(),
        currentMatterPatches: [currentMatter]
      },
      'opening_runtime',
      state,
      blueprint()
    );

    expect(result.issues).toEqual([]);
    expect(result.value?.currentMatterPatches).toEqual([currentMatter]);
    expect(
      result.normalizedPaths.filter((path) =>
        path.startsWith('currentMatterPatches.0')
      )
    ).toEqual([]);
  });

  it('normalizes safe current-matter aliases and numeric strings locally', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const result = validateOpeningRuntimeCandidate(
      {
        ...candidate(),
        currentMatterPatches: [
          {
            id: 'matter_opening_police',
            title: '当值工作',
            summary: '完成交更并核对当日任务。',
            status: '进行中',
            priority: '70',
            visibility: '玩家已知',
            source: 'opening_police_duty',
            matterKind: 'police duty',
            pressureLevel: '2',
            responseWindow: '今天'
          }
        ]
      },
      'opening_runtime',
      state,
      blueprint()
    );

    expect(result.issues).toEqual([]);
    expect(result.value?.currentMatterPatches?.[0]).toEqual(
      expect.objectContaining({
        status: 'active',
        priority: 70,
        visibility: 'known',
        matterKind: 'police_work',
        pressureLevel: 2,
        responseWindow: 'today'
      })
    );
    expect(result.normalizedPaths).toEqual(
      expect.arrayContaining([
        'currentMatterPatches.0.status',
        'currentMatterPatches.0.priority',
        'currentMatterPatches.0.visibility',
        'currentMatterPatches.0.matterKind',
        'currentMatterPatches.0.pressureLevel',
        'currentMatterPatches.0.responseWindow'
      ])
    );
  });

  it('sends ambiguous first-act matter fields to scoped repair instead of guessing', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const result = validateOpeningRuntimeCandidate(
      {
        ...candidate(),
        currentMatterPatches: [
          {
            id: 'matter_opening_character',
            title: '人物接触',
            summary: '第一幕人物出现在现场。',
            status: 'active',
            priority: '紧急',
            visibility: '公开',
            source: 'opening_custom_character',
            matterKind: 'character_encounter'
          }
        ]
      },
      'opening_runtime',
      state,
      blueprint()
    );

    expect(result.value).toBeUndefined();
    expect(result.issues).toEqual([
      expect.objectContaining({
        domain: 'currentMatter',
        paths: expect.arrayContaining([
          '0.priority',
          '0.visibility',
          '0.matterKind'
        ])
      })
    ]);
    expect(result.normalizedPaths).not.toContain(
      'currentMatterPatches.0.priority'
    );
    expect(result.normalizedPaths).not.toContain(
      'currentMatterPatches.0.matterKind'
    );
  });

  it('does not clamp an out-of-range numeric priority', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const result = validateOpeningRuntimeCandidate(
      {
        ...candidate(),
        currentMatterPatches: [
          {
            id: 'matter_opening_police',
            title: '当值工作',
            summary: '完成交更并核对当日任务。',
            status: 'active',
            priority: '101',
            visibility: 'known',
            source: 'opening_police_duty',
            matterKind: 'police_work'
          }
        ]
      },
      'opening_runtime',
      state,
      blueprint()
    );

    expect(result.value).toBeUndefined();
    expect(result.issues[0]).toEqual(
      expect.objectContaining({
        domain: 'currentMatter',
        paths: expect.arrayContaining(['0.priority'])
      })
    );
    expect(result.normalizedPaths).not.toContain(
      'currentMatterPatches.0.priority'
    );
  });

  it('locally turns one gang matter into the locked triad responsibility', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'gang_member'
    });
    const patronId = 'actor_triad_patron';
    const peerId = 'actor_triad_peer';
    const raw = {
      ...candidate(),
      currentMatterPatches: [
        {
          id: 'matter_opening_triad',
          title: '处理堂口差事',
          summary: '上线要求玩家和同组成员跟进一项事务。',
          status: '处理中',
          priority: 70,
          visibility: '公开',
          source: 'opening',
          matterKind: '堂口任务',
          relatedActorIds: []
        }
      ]
    };
    const result = validateOpeningRuntimeCandidate(
      raw,
      'opening_runtime',
      state,
      blueprint([
        {
          actorId: patronId,
          name: '直属上线',
          playerRoleRelation: 'triad_patron'
        },
        {
          actorId: peerId,
          name: '同组成员',
          playerRoleRelation: 'triad_peer'
        }
      ])
    );

    expect(result.issues).toEqual([]);
    expect(result.value?.currentMatterPatches).toEqual([
      expect.objectContaining({
        source: 'triad_responsibility',
        matterKind: 'social',
        status: 'active',
        visibility: 'known',
        relatedActorIds: [patronId, peerId]
      })
    ]);
    expect(result.normalizedPaths).toContain(
      'currentMatterPatches.0.source'
    );
  });

  it('pre-normalizes a civilian identity matter before strict parsing while preserving a first-act actor reference', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    const socialRelationId = 'actor_opening_civilian_social_relation';
    const customActorId = 'npc_custom_first_act_stable';
    const result = validateOpeningRuntimeCandidate(
      {
        ...candidate(),
        currentMatterPatches: [
          {
            id: 'matter_opening_civilian',
            title: '维持日常营生',
            summary: '玩家既要处理日常生计，也在第一幕遇见一名新人物。',
            status: '处理中',
            priority: '65',
            visibility: '公开',
            source: 'opening',
            matterKind: 'character_encounter',
            relatedActorIds: [customActorId]
          }
        ]
      },
      'opening_runtime',
      state,
      {
        ...blueprint([
          {
            actorId: socialRelationId,
            name: '稳定社会关系人物',
            playerRoleRelation: 'civilian_social_relation'
          },
          {
            actorId: customActorId,
            name: '第一幕自定义人物'
          }
        ]),
        dramaPlan: {
          dramaticOpeningId: 'classic_hong_kong',
          selectedSources: [
            {
              ref: {
                providerId: 'custom-character',
                sourceType: 'custom_character_binding',
                sourceId: 'binding_first_act'
              },
              sourceStatus: 'undecided_suggestion',
              mandatory: false,
              confirmedFacts: []
            }
          ]
        }
      } as never
    );

    expect(result.issues).toEqual([]);
    expect(result.value?.currentMatterPatches?.[0]).toEqual(
      expect.objectContaining({
        status: 'active',
        priority: 65,
        visibility: 'known',
        matterKind: 'livelihood',
        relatedActorIds: [customActorId, socialRelationId]
      })
    );
    expect(result.value?.currentMatterPatches?.[0].source).toBe('opening');
    expect(result.normalizedPaths).toEqual(
      expect.arrayContaining([
        'currentMatterPatches.0.status',
        'currentMatterPatches.0.priority',
        'currentMatterPatches.0.visibility',
        'currentMatterPatches.0.matterKind',
        'currentMatterPatches.0.relatedActorIds'
      ])
    );
  });

  it('tells a current-matter repair to return one array instead of a string or wrapper', () => {
    const prompt = createOpeningRuntimeDomainRepairPrompt({
      blueprint: {
        openingSessionId: 'opening_runtime',
        openingFacts: {
          placeId: 'place_wan_chai_police_station'
        },
        initialActors: []
      } as never,
      narrative: {
        openingSessionId: 'opening_runtime',
        narrativeText: '街坊把一封误投信件交给玩家。',
        suggestedActions: [
          { actionId: 'opening_action_1', text: '询问信件来处。' },
          { actionId: 'opening_action_2', text: '先核对门牌。' }
        ]
      },
      state: createInitialRuntimeState({ currentIdentity: 'civilian' }),
      rawRuntime: {
        currentMatterPatches: '一项无法解析的事项'
      },
      acceptedDomains: {},
      issue: {
        domain: 'currentMatter',
        paths: ['currentMatterPatches'],
        message: 'expected array'
      }
    });

    expect(prompt).toContain(
      'domains.currentMatter 必须是 JSON 数组'
    );
    expect(prompt).toContain('matterKind="livelihood"');
    expect(prompt).toContain('不能是字符串');
    expect(prompt).toContain(
      'status 只允许 active|dormant|resolved|archived'
    );
    expect(prompt).toContain('priority 只允许 0–100 整数');
    expect(prompt).toContain('visibility 只允许 known|hidden');
    expect(prompt).toContain(
      'matterKind 只允许 personal|police_work|livelihood|relationship|family|social|risk|opportunity|case|world'
    );
    expect(prompt).toContain(
      '"pressureLevel":1,"responseWindow":"soon"'
    );
  });

  it('keeps repair context compact and never serializes accepted domains', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const common = {
      blueprint: blueprint(),
      narrative: {
        openingSessionId: 'opening_runtime',
        narrativeText: `${'正文'.repeat(3_000)}TAIL_MARKER`,
        suggestedActions: [
          { actionId: 'opening_action_1', text: '继续。' },
          { actionId: 'opening_action_2', text: '观察。' }
        ]
      },
      state,
      rawRuntime: candidate(),
      acceptedDomains: {
        homeBase: { secretAcceptedDomainMarker: 'DO_NOT_SERIALIZE' }
      },
      issue: {
        domain: 'economy' as const,
        paths: ['financeSummary'],
        message: 'Required'
      }
    };
    const regular = createOpeningRuntimeDomainRepairPrompt(common);
    const compact = createOpeningRuntimeDomainRepairPrompt({
      ...common,
      compact: true
    });

    expect(regular).not.toContain('DO_NOT_SERIALIZE');
    expect(regular).not.toContain('TAIL_MARKER');
    expect(compact.length).toBeLessThan(regular.length);
  });
});
