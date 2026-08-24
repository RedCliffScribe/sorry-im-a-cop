import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { createActorDefaults } from '../runtime/actorFactory';
import { applyManualActorProfileEdit, createManualActorProfileDraft } from '../runtime/manualActorProfile';
import { PLAYER_POLICE_SALARY_CASHFLOW_ID } from '../finance/playerSalaryCashflow';
import { recoverCaseWritebackIntents } from '../cases/caseWritebackIntent';
import { findFixedActorIdentityDescriptors } from '../identity/fixedActorIdentityGuard';
import { applyNarratorResponse } from './applyWriteback';
import { validateNarratorResponse as validateNarratorResponseStrict } from './validateWriteback';
import { collectUnresolvedPartialWritebackDiagnostics } from './writebackDiagnostics';

function validateNarratorResponse(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return validateNarratorResponseStrict(value);
  }
  const record = value as Record<string, unknown>;
  return validateNarratorResponseStrict({
    ...record,
    turnSummary: record.turnSummary ?? '测试回合事实摘要。'
  });
}

describe('writeback protocol', () => {
  it('preserves an existing actor interaction score when the model proposes an unexplained decrease', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_qiu_shuk_zhen = createActorDefaults({
      actorId: 'npc_qiu_shuk_zhen',
      name: '邱淑贞',
      currentIdentity: 'civilian',
      interactionScore: 48,
      relationshipSummary: '已经与玩家建立持续合作和信任。',
      presence: 'present',
      visibility: 'player_known'
    });
    const response = validateNarratorResponse({
      narrativeText: '双方继续愉快商谈合约，邱淑贞对玩家的安排更加放心。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_qiu_shuk_zhen',
            interactionScore: 12,
            relationshipSummary: '双方继续推进合作，信任更加稳定。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const diagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(next.actors.npc_qiu_shuk_zhen.interactionScore).toBe(48);
    expect(next.actors.npc_qiu_shuk_zhen.relationshipSummary).toBe('双方继续推进合作，信任更加稳定。');
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'actorPatches', 0, 'interactionScore'],
        code: 'actor_interaction_score_decrease_preserved',
        message: expect.stringContaining('48 -> 12')
      })
    );
    expect(collectUnresolvedPartialWritebackDiagnostics(diagnostics)).toEqual([]);
  });

  it('accepts a higher interaction score for an existing actor after further contact', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_returning_contact = createActorDefaults({
      actorId: 'npc_returning_contact',
      name: '持续往来的联系人',
      currentIdentity: 'civilian',
      interactionScore: 48,
      presence: 'present',
      visibility: 'player_known'
    });
    const response = validateNarratorResponse({
      narrativeText: '双方完成新的共同事务，往来和牵连进一步加深。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_returning_contact',
            interactionScore: 55
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_returning_contact.interactionScore).toBe(55);
    expect(
      next.storyLog.at(-1)?.writebackDiagnostics?.some(
        (issue) => issue.code === 'actor_interaction_score_decrease_preserved'
      )
    ).not.toBe(true);
  });

  it('does not teleport an existing remote actor into the visible scene without a location anchor', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_remote_contact = createActorDefaults({
      actorId: 'npc_remote_contact',
      name: '远场联系人',
      currentIdentity: 'civilian',
      currentPlaceId: 'place_remote_district',
      presence: 'mentioned',
      visibility: 'player_known',
      statusSummary: '仍在外区办事。'
    });
    const response = validateNarratorResponse({
      narrativeText: '玩家想起远场联系人仍在外区办事。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_remote_contact',
            presence: 'present',
            statusSummary: '已经回复了玩家的留言。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_remote_contact).toMatchObject({
      presence: 'mentioned',
      currentPlaceId: 'place_remote_district',
      statusSummary: '已经回复了玩家的留言。'
    });
    expect(next.scenes[state.location.currentSceneId!].presentActorIds).not.toContain('npc_remote_contact');
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'actorPatches', 0, 'presence'],
        code: 'actor_present_requires_location_anchor'
      })
    );
  });

  it('allows an existing remote actor to enter when the patch anchors the actor to the current scene', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_arriving_contact = createActorDefaults({
      actorId: 'npc_arriving_contact',
      name: '赶来现场的联系人',
      currentIdentity: 'civilian',
      currentPlaceId: 'place_remote_district',
      presence: 'mentioned',
      visibility: 'player_known'
    });
    const response = validateNarratorResponse({
      narrativeText: '联系人推门进入当前房间。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_arriving_contact',
            presence: 'present',
            currentPlaceId: state.location.currentPlaceId,
            currentSceneId: state.location.currentSceneId
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_arriving_contact).toMatchObject({
      presence: 'present',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId
    });
    expect(next.scenes[state.location.currentSceneId!].presentActorIds).toContain('npc_arriving_contact');
    expect(
      (next.storyLog.at(-1)?.writebackDiagnostics ?? []).some(
        (issue) => issue.code === 'actor_present_requires_location_anchor'
      )
    ).toBe(false);
  });

  it('allows a nearby actor already anchored to the current place to enter the visible scene', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_nearby_contact = createActorDefaults({
      actorId: 'npc_nearby_contact',
      name: '门外同事',
      currentIdentity: 'police',
      currentPlaceId: state.location.currentPlaceId,
      presence: 'nearby',
      visibility: 'player_known'
    });
    const response = validateNarratorResponse({
      narrativeText: '门外同事走进当前房间。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_nearby_contact',
            presence: 'present'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_nearby_contact).toMatchObject({
      presence: 'present',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId
    });
  });

  it('drops cross-person fixed actor patches and memories without failing the turn', () => {
    const state = createInitialRuntimeState();
    const zhou = findFixedActorIdentityDescriptors('周慧敏')[0]!;
    state.actors[zhou.runtimeActorId] = createActorDefaults({
      actorId: zhou.runtimeActorId,
      name: zhou.displayName,
      englishName: zhou.englishName,
      aliases: [...zhou.aliases],
      currentIdentity: 'civilian',
      publicIdentity: zhou.publicIdentity,
      actualIdentitySummary: zhou.actualIdentitySummary,
      profileSummary: zhou.profileSummary,
      statusSummary: '正在电台完成节目。',
      stableIdentityRef: zhou.ref
    });
    const response = validateNarratorResponse({
      narrativeText: '周慧敏继续完成电台节目。',
      writeback: {
        actorPatches: [{
          actorId: zhou.runtimeActorId,
          name: '周慧敏',
          englishName: 'Vivian Chow',
          aliases: ['叶玉卿', 'Veronica Yip', '叶子楣', 'Amy Yip'],
          profileSummary: '模型把数位艺人错误融合成同一人物。',
          statusSummary: '错误覆盖。'
        }],
        actorMemories: [{
          actorId: zhou.runtimeActorId,
          actorName: '叶玉卿',
          text: '叶玉卿刚刚被玩家帮回了钱包。',
          visibility: 'player_known'
        }]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors[zhou.runtimeActorId]).toMatchObject({
      name: '周慧敏',
      englishName: 'Vivian Chow',
      profileSummary: zhou.profileSummary,
      statusSummary: '正在电台完成节目。'
    });
    expect(Object.values(next.memories).some((memory) => memory.text.includes('帮回了钱包'))).toBe(false);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'actor_fixed_identity_conflict' }),
        expect.objectContaining({ code: 'actor_memory_identity_conflict' })
      ])
    );
  });

  it('preserves player-corrected stable actor fields while allowing dynamic actor updates', () => {
    let state = createInitialRuntimeState();
    state.actors.npc_manual_profile = createActorDefaults({
      actorId: 'npc_manual_profile',
      name: '原姓名',
      currentIdentity: 'civilian',
      profileSummary: '原简介',
      personality: '原性格',
      clothing: '原衣着',
      relationshipSummary: '原关系',
      presence: 'present',
      visibility: 'player_known'
    });
    const draft = createManualActorProfileDraft(state.actors.npc_manual_profile);
    draft.name = '玩家确认姓名';
    draft.personality = '玩家确认性格';
    state = applyManualActorProfileEdit(state, 'npc_manual_profile', draft);

    const response = validateNarratorResponse({
      narrativeText: '人物换上外套，并与玩家建立新的合作默契。',
      writeback: {
        actorPatches: [{
          actorId: 'npc_manual_profile',
          name: '模型误改姓名',
          personality: '模型误改性格',
          clothing: '深色新外套',
          relationshipSummary: '与玩家形成合作关系'
        }]
      }
    });

    const next = applyNarratorResponse(state, response);
    expect(next.actors.npc_manual_profile.name).toBe('玩家确认姓名');
    expect(next.actors.npc_manual_profile.personality).toBe('玩家确认性格');
    expect(next.actors.npc_manual_profile.clothing).toBe('深色新外套');
    expect(next.actors.npc_manual_profile.relationshipSummary).toBe('与玩家形成合作关系');
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'actor_manual_profile_override_preserved' })
    );
  });

  it('recovers a case intent with legacy access and locally normalizable list fields', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const response = validateNarratorResponse({
      narrativeText: '玩家正式接手案件并登记第一项调查进展。',
      writeback: {
        casePatches: [
          {
            caseId: 'case_recovered_intent',
            title: '油麻地伤人案',
            summary: '报案室已经登记伤人案件，玩家负责初步调查。',
            status: 'open',
            playerAccessLevel: 'assigned',
            relatedActorIds: 'player',
            activityLog: {
              kind: '进展',
              summary: '玩家接收报案材料。',
              relatedActorIds: 'player'
            }
          }
        ]
      }
    });

    expect(response.writeback.casePatches).toEqual([]);
    const recovered = recoverCaseWritebackIntents(state, response);

    expect(recovered.response.writeback.casePatches).toEqual([
      expect.objectContaining({
        caseId: 'case_recovered_intent',
        status: 'investigating',
        playerRole: 'execute',
        relatedActorIds: ['player'],
        activityLog: [
          expect.objectContaining({
            kind: 'note',
            relatedActorIds: ['player']
          })
        ]
      })
    ]);
    expect(recovered.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'case_intent_recovered' })
    );
  });

  it('applies tens-of-billions balances exactly and keeps the player mirror synchronized', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '银行完成家族信托款项的账户确认。',
      writeback: {
        financePatch: {
          cashSet: 50_000,
          bankSet: 50_000_000_000,
          summary: '账户已按银行结单更新。'
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.finance.cashOnHand).toBe(50_000);
    expect(next.finance.bankBalance).toBe(50_000_000_000);
    expect(next.player.economy.cashOnHand).toBe(50_000);
    expect(next.player.economy.bankBalance).toBe(50_000_000_000);
  });

  it('preserves structured local judgement factor source metadata', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.6',
      narrativeText: '玩家借助警棍控制距离。',
      writeback: {
        judgementCheckPatches: [
          {
            rulesetVersion: 'v1.1-local-d100',
            checkId: 'check_grounded_equipment',
            turnId: 'turn_1',
            gameTime: state.time,
            title: '控制近身距离',
            category: 'melee',
            relatedActorIds: ['player'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            primaryAttribute: 'action',
            difficultyTier: 'standard',
            presetRoll: 42,
            effectiveTarget: 55,
            outcome: 'success',
            shortSummary: '玩家控制住近身距离。',
            factors: [
              {
                sourceType: 'equipment',
                sourceId: 'asset_baton',
                label: '警棍在手',
                value: 5,
                reason: '已装备的警棍有助于保持控制距离。'
              }
            ],
            visibility: 'player_known'
          }
        ]
      }
    });

    expect(response.writeback.judgementCheckPatches[0]?.factors).toEqual([
      {
        sourceType: 'equipment',
        sourceId: 'asset_baton',
        label: '警棍在手',
        value: 5,
        reason: '已装备的警棍有助于保持控制距离。'
      }
    ]);
  });

  it('drops only an overflowing money field and records its exact writeback path', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '银行职员重新核对了现金和存款。',
      writeback: {
        financePatch: {
          cashSet: 50_000,
          bankSet: 100_000_000_000,
          summary: '银行结单存在一项异常大数。'
        }
      }
    });
    const next = applyNarratorResponse(state, response);

    expect(response.writeback.financePatch?.cashSet).toBe(50_000);
    expect(response.writeback.financePatch?.bankSet).toBeUndefined();
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'financePatch', 'bankSet']
      })
    );
    expect(next.finance.cashOnHand).toBe(50_000);
    expect(next.finance.bankBalance).toBe(state.finance.bankBalance);
  });

  it('keeps an empty suggested action list recoverable but records a diagnostic warning', () => {
    const result = validateNarratorResponseStrict({
      narrativeText: '正文已经正常生成。',
      turnSummary: '本回合正文已经完成，但主剧情没有给出行动选项。',
      suggestedActions: [],
      writeback: {}
    });

    expect(result.suggestedActions).toEqual([]);
    expect(result.validationWarnings).toContainEqual({
      path: ['suggestedActions'],
      message: '主剧情没有返回本回合行动选项；界面将清空旧选项，避免误用上一回合内容。',
      code: 'missing_suggested_actions'
    });
  });

  it('preserves the structured player vitals review in a valid narrator response', () => {
    const result = validateNarratorResponseStrict({
      writebackVersion: '1.6',
      narrativeText: '玩家留在桌边核对记录。',
      turnSummary: '玩家核对了值班记录。',
      suggestedActions: ['继续核对'],
      playerVitalsReview: {
        changed: false,
        reason: '玩家本回合只进行了静态文书工作，身体状态没有变化。'
      },
      writeback: {}
    });

    expect(result.playerVitalsReview).toEqual({
      changed: false,
      reason: '玩家本回合只进行了静态文书工作，身体状态没有变化。'
    });
  });

  it('promotes known writeback modules misplaced at the narrator response top level', () => {
    const result = validateNarratorResponseStrict({
      writebackVersion: '1.6',
      narrativeText: '玩家下班后回到种植道住所休息。',
      turnSummary: '玩家离开警署，回到种植道住所并换上居家衣物。',
      suggestedActions: ['在家休息'],
      playerVitalsReview: {
        changed: false,
        reason: '玩家乘车回家，没有生命或体力变化。'
      },
      writeback: {},
      locationPatch: {
        currentPlaceId: 'place_player_home',
        reason: '玩家已经回家。'
      },
      playerPatch: {
        clothing: {
          currentSummary: '居家衣物。',
          mode: 'off_duty_plain',
          lastChangedReason: '回家后换装。'
        }
      },
      currentMatterPatches: [
        {
          id: 'matter_wait_for_reply',
          title: '等待回音',
          summary: '玩家已经留下字条，等待同事回音。',
          status: 'dormant',
          priority: 30,
          visibility: 'known',
          source: 'writeback'
        }
      ]
    });

    expect(result.writeback.locationPatch?.currentPlaceId).toBe('place_player_home');
    expect(result.writeback.playerPatch?.clothing).toMatchObject({
      currentSummary: '居家衣物。',
      mode: 'off_duty_plain'
    });
    expect(result.writeback.currentMatterPatches).toHaveLength(1);
    expect(result.validationWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['writeback', 'locationPatch'],
          code: 'misplaced_writeback_promoted'
        }),
        expect.objectContaining({
          path: ['writeback', 'playerPatch'],
          code: 'misplaced_writeback_promoted'
        }),
        expect.objectContaining({
          path: ['writeback', 'currentMatterPatches'],
          code: 'misplaced_writeback_promoted'
        })
      ])
    );
  });

  it('salvages the turn and records a diagnostic when playerVitalsReview is malformed', () => {
    const result = validateNarratorResponseStrict({
      writebackVersion: '1.6',
      narrativeText: '玩家留在桌边核对记录。',
      turnSummary: '玩家核对了值班记录。',
      suggestedActions: ['继续核对'],
      playerVitalsReview: {
        changed: 'no',
        reason: ''
      },
      writeback: {}
    });

    expect(result.playerVitalsReview).toBeUndefined();
    expect(result.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: ['playerVitalsReview', 'changed'],
        code: 'invalid_type'
      })
    );
  });

  it('preserves a valid turn summary while sanitizing an invalid writeback child', () => {
    const result = validateNarratorResponseStrict({
      writebackVersion: '1.6',
      narrativeText: '正文。',
      turnSummary: '玩家已经把小说前三章寄往报社。',
      suggestedActions: [],
      playerVitalsReview: {
        changed: true,
        reason: '玩家搬运了沉重的稿件箱，体力有所下降。'
      },
      dramaPlan: {
        planId: 'drama_plan_turn_1',
        planningScope: 'turn',
        mode: 'quiet',
        primarySource: null,
        supportSources: [],
        sceneFunction: 'rest',
        intensity: 'none',
        playerMayIgnore: true,
        maxNewActors: 0,
        reasonSummary: '本回合保持安静。'
      },
      dramaExecutionTrace: {
        planId: 'drama_plan_turn_1',
        status: 'not_used',
        usedSourceRefs: [],
        resultingWritebackRefs: []
      },
      writeback: { actorPatches: [{ actorId: 42 }] }
    });

    expect(result.turnSummary).toBe('玩家已经把小说前三章寄往报社。');
    expect(result.playerVitalsReview).toEqual({
      changed: true,
      reason: '玩家搬运了沉重的稿件箱，体力有所下降。'
    });
    expect(result.dramaPlan).toMatchObject({
      planId: 'drama_plan_turn_1',
      mode: 'quiet'
    });
    expect(result.dramaExecutionTrace).toEqual({
      planId: 'drama_plan_turn_1',
      status: 'not_used',
      usedSourceRefs: [],
      resultingWritebackRefs: []
    });
    expect(result.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'actorPatches', 0, 'actorId']
      })
    );
  });

  it('normalizes a valid nested drama execution trace before strict validation', () => {
    const result = validateNarratorResponseStrict({
      narrativeText: '正文。',
      turnSummary: '玩家完成本回合行动。',
      suggestedActions: ['继续观察。'],
      writeback: {
        actorPatches: [],
        dramaExecutionTrace: {
          planId: 'drama_plan_turn_1',
          status: 'not_used',
          usedSourceRefs: [],
          resultingWritebackRefs: []
        }
      }
    });

    expect(result.dramaExecutionTrace).toEqual({
      planId: 'drama_plan_turn_1',
      status: 'not_used',
      usedSourceRefs: [],
      resultingWritebackRefs: []
    });
  });

  it('keeps valid equipment when a neighboring player clothing field is invalid', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponseStrict({
      narrativeText: '玩家换上军装，并从枪房领出配枪、警棍和对讲机。',
      turnSummary: '玩家回到警署接更并领取执勤装备。',
      suggestedActions: [],
      writeback: {
        playerPatch: {
          clothing: {
            currentSummary: '夏季军装制服，外加透明防雨风衣。',
            mode: 'uniform',
            lastChangedReason: '回到警署接更。'
          },
          equipment: ['史密斯威森M10左轮手枪', '警棍', '对讲机']
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.playerPatch?.clothing).toBeUndefined();
    expect(response.writeback.playerPatch?.equipment).toEqual(['史密斯威森M10左轮手枪', '警棍', '对讲机']);
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: expect.arrayContaining(['writeback', 'playerPatch', 'clothing'])
      })
    );
    expect(next.player.equipment).toEqual(['史密斯威森M10左轮手枪', '警棍', '对讲机']);
    expect(next.assets.equippedItemIds).toHaveLength(0);
  });

  it('rejects a legacy clothing string instead of preserving a stale clothing mode', () => {
    const state = createInitialRuntimeState();
    state.player.clothing = '便服。';
    state.player.clothingState = {
      currentSummary: '便服。',
      mode: 'off_duty_plain',
      lastChangedAt: { ...state.time }
    };

    const response = validateNarratorResponseStrict({
      narrativeText: '玩家换上军装，并领出配枪、警棍和对讲机。',
      turnSummary: '玩家换上军装并领取执勤装备。',
      suggestedActions: [],
      writeback: {
        playerPatch: {
          clothing: '夏季军装制服。',
          equipment: ['史密斯威森M10左轮手枪', '警棍', '对讲机']
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.playerPatch?.clothing).toBeUndefined();
    expect(response.writeback.playerPatch?.equipment).toEqual(['史密斯威森M10左轮手枪', '警棍', '对讲机']);
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: expect.arrayContaining(['writeback', 'playerPatch', 'clothing'])
      })
    );
    expect(next.player.clothing).toBe('便服。');
    expect(next.player.clothingState?.mode).toBe('off_duty_plain');
    expect(next.player.equipment).toEqual(['史密斯威森M10左轮手枪', '警棍', '对讲机']);
  });

  it('rejects a narrator response that still lacks a turn summary', () => {
    expect(() =>
      validateNarratorResponseStrict({
        narrativeText: '正文。',
        suggestedActions: [],
        writeback: {}
      })
    ).toThrow();
  });

  it('accepts structured writeback and advances state from explicit fields only', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player enters the report room.',
      suggestedActions: ['Answer the phone', 'Ask the duty sergeant what happened'],
      timePatch: { elapsedMinutes: 5, reason: 'Briefly entering the report room and observing the area' },
      writeback: {
        memories: [
          {
            text: 'The player entered the report room at the start of the morning shift.',
            kind: 'world',
            importance: 40,
            visibility: 'player_known',
            certainty: 'fact'
          }
        ],
        actorMemories: [
          {
            actorId: 'player',
            text: 'The player felt the station rhythm at the start of morning shift.',
            importance: 30,
            visibility: 'player_known'
          }
        ],
        traitProgress: [
          {
            actorId: 'player',
            traitId: 'trait_station_rhythm',
            name: 'Station Rhythm',
            delta: 10,
            maxProgress: 100,
            reason: 'Started adapting to daily station operations'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.time.minute).toBe(35);
    expect(Object.values(next.memories)[0]?.text).toContain('report room');
    expect(next.actors.player.traitProgress[0]?.name).toBe('Station Rhythm');
    expect(next.storyLog.at(-1)?.text).toBe('The player enters the report room.');
  });

  it('persists story blocks after same-turn actors exist while preserving narrativeText exactly', () => {
    const state = createInitialRuntimeState();
    const narrativeText =
      '【旁白】证人走进报案室。\n【陈伟强】“我昨晚一直在家。”\n【内心】他避开了时间问题。';
    const response = validateNarratorResponse({
      narrativeText,
      presentationHints: {
        dialogueEmotions: ['serious'],
        innerMonologueEmotions: ['worried']
      },
      suggestedActions: ['继续核对时间。', '先查看登记记录。'],
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_new_witness',
            name: '陈伟强',
            gender: 'male',
            computedAge: 29,
            currentIdentity: 'civilian',
            profileSummary: '刚进入报案室接受询问的证人。',
            presence: 'present',
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const entry = next.storyLog.at(-1);
    expect(entry?.text).toBe(narrativeText);
    expect(entry?.dialogueSpeakerActorIds).toEqual({ 陈伟强: 'npc_new_witness' });
    expect(entry?.blocks).toEqual([
      { type: 'narration', text: '证人走进报案室。', sourceStyle: 'tagged' },
      {
        type: 'dialogue',
        text: '“我昨晚一直在家。”',
        speakerLabel: '陈伟强',
        speakerActorId: 'npc_new_witness',
        emotion: 'serious'
      },
      {
        type: 'inner_monologue',
        text: '他避开了时间问题。',
        actorId: state.player.actorId,
        emotion: 'worried'
      }
    ]);
  });

  it('normalizes invalid presentation emotion metadata without rejecting the turn', () => {
    const response = validateNarratorResponse({
      narrativeText: '【值日警长】收队。',
      presentationHints: { dialogueEmotions: ['furious'] },
      writeback: {}
    });
    expect(response.presentationHints).toEqual({ dialogueEmotions: ['neutral'] });
  });

  it('normalizes female profile alias fields and relationship network edges from actor writeback', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_may = createActorDefaults({
      actorId: 'npc_may',
      name: '周嘉敏',
      englishName: 'May Chow',
      gender: 'female',
      birthDate: '1965-05-20',
      computedAge: 23,
      currentIdentity: 'civilian',
      publicIdentity: '玩家女友',
      profileSummary: '在制衣厂工作的年轻女性。',
      presence: 'nearby',
      interactionScore: 45,
      importance: 80,
      visibility: 'player_known'
    });

    const response = validateNarratorResponse({
      narrativeText: '周嘉敏在电话里提醒玩家别太晚回家。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_may',
            femaleProfile: {
              对主角称呼: '阿May',
              外貌描写: '说话时会自然压低声线，显得亲近。',
              身材描写: '个子不高，动作利落。',
              衣着风格: '下班后常穿简单衬衫和半身裙。',
              核心性格特征: '温柔但有主见，重视安稳生活。',
              好感度突破条件: '主角能稳定兑现承诺。',
              关系突破条件: '主角在家庭和警队压力之间表现出可靠担当。',
              关系网变量: [
                {
                  对象姓名: '周母',
                  关系: '母女',
                  备注: '父母健在，母亲担心女儿和警察拍拖压力太大。'
                }
              ],
              adultPrivateProfile: {
                女性扩展档案状态: 'ready',
                子宫: {
                  状态: '未受孕',
                  宫口状态: '紧闭',
                  内射记录: []
                },
                香闺秘档部位档案: {
                  胸部: { 描述: '乳房饱满柔软，乳晕色泽自然，乳头敏感。' },
                  小穴: { 描述: '阴唇紧致细嫩，穴口收敛，阴蒂敏感。' },
                  屁穴: { 描述: '臀缝紧窄，屁穴小而紧闭，周围皱褶细密。' }
                },
                性癖: '偏好强势但有分寸的挑逗、贴身掌控和身体赞美。',
                敏感点: '敏感点集中在乳尖、阴蒂、颈侧、腰侧、大腿内侧和臀缝。'
              }
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const profile = next.actors.npc_may?.femaleProfile;

    expect(profile?.addressToPlayer).toBe('阿May');
    expect(profile?.appearanceDescription).toContain('压低声线');
    expect(profile?.bodyDescription).toContain('个子不高');
    expect(profile?.clothingStyle).toContain('半身裙');
    expect(profile?.personalityCore).toContain('温柔但有主见');
    expect(profile?.affectionProgressionCondition).toContain('兑现承诺');
    expect(profile?.relationshipProgressionCondition).toContain('可靠担当');
    expect(profile?.relationshipNetworkEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetName: '周母',
          relation: '母女',
          note: expect.stringContaining('父母健在')
        })
      ])
    );
    expect(profile?.adultPrivateProfile?.profileStatus).toBe('ready');
    expect(profile?.adultPrivateProfile?.womb).toMatchObject({
      status: '未受孕',
      cervixStatus: '紧闭',
      records: []
    });
    expect(profile?.adultPrivateProfile?.partProfiles?.胸部?.description).toBe('乳房饱满柔软，乳晕色泽自然，乳头敏感。');
    expect(profile?.adultPrivateProfile?.partProfiles?.小穴?.description).toBe('阴唇紧致细嫩，穴口收敛，阴蒂敏感。');
    expect(profile?.adultPrivateProfile?.partProfiles?.屁穴?.description).toBe('臀缝紧窄，屁穴小而紧闭，周围皱褶细密。');
    expect(profile?.adultPrivateProfile?.fetishNotes).toBe('偏好强势但有分寸的挑逗、贴身掌控和身体赞美。');
    expect(profile?.adultPrivateProfile?.sensitivePoints).toBe('敏感点集中在乳尖、阴蒂、颈侧、腰侧、大腿内侧和臀缝。');
  });

  it('accepts absolute turn end time for long-span actions', () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 9, day: 12, hour: 22, minute: 35 };
    const response = validateNarratorResponse({
      narrativeText: 'Seven routine duty days pass before the player reads the evening paper.',
      suggestedActions: ['Read the entertainment page'],
      timePatch: {
        targetTime: { year: 1988, month: 9, day: 19, hour: 19, minute: 0 },
        reason: 'The player explicitly waited through a week of routine shifts.'
      },
      writeback: {
        memories: [
          {
            text: 'The player spent a quiet week on routine shifts before reading the evening paper.',
            kind: 'turn',
            importance: 25,
            visibility: 'player_known',
            certainty: 'fact'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.validationWarnings?.some((warning) => warning.path.includes('timePatch'))).not.toBe(true);
    expect(next.time).toEqual({ year: 1988, month: 9, day: 19, hour: 19, minute: 0 });
    expect(next.storyLog.at(-1)?.gameTime).toEqual(next.time);
    expect(Object.values(next.memories)[0]?.gameTime).toEqual(next.time);
  });

  it('applies explicit location writeback without requiring actor or matter inference', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player takes a taxi from Mong Kok station to Central and steps out near Des Voeux Road.',
      suggestedActions: ['Enter the bank lobby', 'Call the station from a payphone'],
      timePatch: { elapsedMinutes: 25, reason: 'Taxi travel from Mong Kok to Central.' },
      writeback: {
        locationPatch: {
          currentPlaceId: 'place_hang_seng_bank_headquarters',
          reason: 'The narrative explicitly moved the player from Mong Kok to Central.'
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.location.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.location.currentSceneId).toBeUndefined();
    expect(next.actors.player.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.actors.player.currentSceneId).toBeUndefined();
    expect(next.map.lastMovement).toMatchObject({
      fromPlaceId: 'place_mong_kok_police_station',
      fromSceneId: 'scene_report_room',
      toPlaceId: 'place_hang_seng_bank_headquarters',
      elapsedMinutes: 25
    });
  });

  it('does not derive durable location directly from narrative text when location writeback is omitted', () => {
    const state = createInitialRuntimeState();
    state.location = { currentPlaceId: 'place_hang_seng_bank_headquarters' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_hang_seng_bank_headquarters',
      currentSceneId: undefined
    };
    const response = validateNarratorResponse({
      narrativeText:
        '上午九点四十五分，旺角警署的男更衣室里弥漫着浓重的肥皂味和旧制服的汗气。你推开属于自己的铁皮储物柜，开始整理下一步报告。',
      suggestedActions: ['回家睡觉', '找 CID 继续申请录像'],
      timePatch: { elapsedMinutes: 15, reason: 'Wrapping up the night shift in the station locker room.' },
      writeback: {}
    });

    const next = applyNarratorResponse(state, response);

    expect(next.location.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.location.currentSceneId).toBeUndefined();
    expect(next.actors.player.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.actors.player.currentSceneId).toBeUndefined();
    expect(next.map.lastMovement).toBeUndefined();
  });

  it('does not treat a future lead mention as the current location when location writeback is omitted', () => {
    const state = createInitialRuntimeState();
    state.location = { currentPlaceId: 'place_hang_seng_bank_headquarters' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_hang_seng_bank_headquarters',
      currentSceneId: undefined
    };
    const response = validateNarratorResponse({
      narrativeText:
        '你坐在值班桌前写下下一步计划：正式申请渣打银行大厦的闭路电视录像，再追查信德中心储物柜钥匙的来源。',
      suggestedActions: ['睡醒后申请公函', '整理证据目录'],
      timePatch: { elapsedMinutes: 10, reason: 'Writing the next lead list without moving.' },
      writeback: {}
    });

    const next = applyNarratorResponse(state, response);

    expect(next.location.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.actors.player.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.map.lastMovement).toBeUndefined();
  });

  it('applies dynamic current matter, signal and newspaper writebacks', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '街面风声和报纸同时更新。',
      writeback: {
        currentMatterPatches: [
          {
            id: 'matter_mongkok_media_heat',
            title: '报馆盯上旺角冲突',
            summary: '本地报馆开始追问旺角街面冲突的警队处理。',
            status: 'active',
            priority: 70,
            visibility: 'known',
            source: 'media',
            relatedActorIds: ['player'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            relatedOrganizationIds: ['org_evening_post']
          }
        ],
        signalPatches: [
          {
            id: 'signal_teahouse_rumor',
            title: '茶餐厅里的收风',
            summary: '街坊说今晚有人会去游戏机中心找麻烦。',
            signalType: 'street',
            reliability: 'unknown',
            status: 'active',
            visibility: 'known',
            relatedActorIds: ['player'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            relatedOrganizationIds: []
          }
        ],
        newsIssuePatches: [
          {
            id: 'news_1988_09_12_evening',
            date: state.time,
            outletName: '星岛日报',
            headline: '旺角夜色未静',
            summary: '本地治安、娱乐和社会消息混在同一期报纸里。',
            read: false,
            articles: [
              {
                id: 'article_mongkok_public_order',
                section: 'local',
                headline: '旺角街头再起争执',
                body: '警方称事件仍在了解中，街坊则议论纷纷。',
                tone: '谨慎',
                playerRelated: false,
                relatedActorIds: [],
                relatedPlaceIds: [state.location.currentPlaceId],
                relatedCaseIds: [],
                relatedOrganizationIds: []
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.dynamicEvents.currentMatters.matter_mongkok_media_heat.title).toBe('报馆盯上旺角冲突');
    expect(next.dynamicEvents.signals.signal_teahouse_rumor.signalType).toBe('street');
    expect(next.dynamicEvents.newsIssues.news_1988_09_12_evening.articles[0]?.headline).toContain('旺角');
  });

  it('does not persist a newspaper issue made only from an ordinary player private purchase', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '你办妥手续，把新车停进车位。',
      writeback: {
        playerPatch: {
          reputation: {
            notorietyDelta: 250,
            summary: '模型错误地把普通购车当成全城关注。',
            reason: '购车。',
            circlePatches: [
              {
                circle: 'neighborhoodMedia',
                visibilityDelta: 250,
                summary: '模型错误地声称媒体已经关注。',
                reason: '购车。'
              }
            ]
          }
        },
        newsIssuePatches: [
          {
            id: 'news_private_purchase',
            date: state.time,
            outletName: '明报',
            headline: `${state.player.name}购入新车`,
            summary: '一名普通市民购入私家车。',
            articles: [
              {
                id: 'article_private_purchase',
                section: 'local',
                headline: '普通市民购入新车',
                body: `${state.player.name}今天买下一辆私家车。`,
                playerRelated: true,
                relatedActorIds: [state.player.actorId],
                relatedPlaceIds: [],
                relatedCaseIds: [],
                relatedOrganizationIds: []
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.reputation.notoriety).toBe(250);
    expect(next.dynamicEvents.newsIssues.news_private_purchase).toBeUndefined();
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'player_news_suppressed' })
      ])
    );
  });

  it('preserves local news lifecycle fields when the narrator updates an issue', () => {
    const state = createInitialRuntimeState();
    const archivedAt = { ...state.time, day: state.time.day - 1 };
    state.dynamicEvents.newsIssues.news_important = {
      id: 'news_important',
      date: state.time,
      outletName: '大公报',
      headline: '原有头条',
      summary: '原有摘要。',
      articles: [],
      createdAt: state.time,
      updatedAt: state.time,
      read: true,
      important: true
    };
    state.dynamicEvents.newsIssues.news_archived = {
      id: 'news_archived',
      date: state.time,
      outletName: '明报',
      headline: '已归档头条',
      summary: '已归档摘要。',
      articles: [],
      createdAt: state.time,
      updatedAt: state.time,
      read: true,
      archivedAt
    };
    const response = validateNarratorResponse({
      narrativeText: '报章补充了后续报道。',
      writeback: {
        newsIssuePatches: [
          { id: 'news_important', headline: '更新后的重要头条' },
          { id: 'news_archived', summary: '更新后的归档摘要。' }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.dynamicEvents.newsIssues.news_important.important).toBe(true);
    expect(next.dynamicEvents.newsIssues.news_archived.archivedAt).toEqual(archivedAt);
  });

  it('applies organization structure tree writeback as durable organization state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '线人把新义安的层级说得更清楚。',
      suggestedActions: ['记下坐馆与旺角线的层级'],
      writeback: {
        organizationPatches: [
          {
            organizationId: 'org_sun_yee_on',
            structureTree: [
              {
                nodeId: 'org_sun_yee_on_seat',
                label: '坐馆',
                role: '最高话事层',
                personName: '向天强',
                status: '传闻中仍能拍板大方向。',
                confidence: 'medium',
                children: [
                  {
                    nodeId: 'org_sun_yee_on_mong_kok_head',
                    label: '旺角线',
                    role: '地区话事人',
                    personName: '未知',
                    actorId: 'npc_temp_syo_head',
                    status: '负责夜场和街面外围，姓名未确认。',
                    confidence: 'low',
                    children: []
                  }
                ]
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.organizations.org_sun_yee_on.structureTree?.[0]).toMatchObject({
      nodeId: 'org_sun_yee_on_seat',
      label: '坐馆',
      personName: '向天强'
    });
    expect(next.organizations.org_sun_yee_on.structureTree?.[0]?.children?.[0]).toMatchObject({
      nodeId: 'org_sun_yee_on_mong_kok_head',
      label: '旺角线',
      personName: '未知',
      actorId: 'npc_temp_syo_head'
    });
  });

  it('remaps a renamed player-owned enterprise patch to its canonical organization id', () => {
    const state = createInitialRuntimeState();
    state.organizations.org_xiao_enterprise = {
      organizationId: 'org_xiao_enterprise',
      name: '萧氏企业',
      type: 'business',
      summary: '玩家持有并经营的本地企业。',
      publicKnowledge: '萧氏名下的商业机构。',
      currentState: '评估流程正在接受内部复核。',
      stanceTowardPlayer: '玩家是该企业的经营者。',
      pressureSummary: '内部评估程序承受压力。',
      relatedActorIds: ['player'],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      visibility: 'player_known',
      importance: 75
    };
    state.actors.player.organizationIds.push('org_xiao_enterprise');
    state.actors.player.organizationRelations.push({
      organizationId: 'org_xiao_enterprise',
      relationType: 'owner',
      roleTitle: '经营者',
      summary: '玩家持有并经营萧氏企业。',
      visibility: 'player_known',
      isPrimary: false
    });

    const response = validateNarratorResponse({
      narrativeText: '萧氏家族企业的内审复核继续推进。',
      writeback: {
        placePatches: [
          {
            placeId: state.location.currentPlaceId,
            owningOrganizationId: 'org_xiao_family_enterprise'
          }
        ],
        actorPatches: [
          {
            actorId: 'player',
            organizationIds: ['org_xiao_family_enterprise'],
            organizationRelations: [
              {
                organizationId: 'org_xiao_family_enterprise',
                relationType: 'owner',
                roleTitle: '经营者',
                summary: '玩家持有并经营萧氏家族企业。',
                visibility: 'player_known'
              }
            ]
          }
        ],
        organizationPatches: [
          {
            organizationId: 'org_xiao_family_enterprise',
            name: '萧氏家族企业',
            type: 'business',
            currentState: '内审部门对行政拨款的交叉比对正在延滞。',
            relatedActorIds: ['player']
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.organizations.org_xiao_family_enterprise).toBeUndefined();
    expect(next.organizations.org_xiao_enterprise).toMatchObject({
      organizationId: 'org_xiao_enterprise',
      name: '萧氏企业',
      currentState: '内审部门对行政拨款的交叉比对正在延滞。',
      aliases: expect.arrayContaining(['萧氏家族企业'])
    });
    expect(next.actors.player.organizationIds).toContain('org_xiao_enterprise');
    expect(next.actors.player.organizationIds).not.toContain('org_xiao_family_enterprise');
    expect(next.places[state.location.currentPlaceId].owningOrganizationId).toBe(
      'org_xiao_enterprise'
    );
    expect(
      next.actors.player.organizationRelations.some(
        (relation) => relation.organizationId === 'org_xiao_family_enterprise'
      )
    ).toBe(false);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'organization_identity_id_remapped',
        path: ['writeback', 'organizationPatches', 0, 'organizationId']
      })
    );
  });

  it('reuses a unique stored organization alias even without a player ownership relation', () => {
    const state = createInitialRuntimeState();
    state.organizations.org_tvb.aliases = ['无线电视'];

    const response = validateNarratorResponse({
      narrativeText: '无线电视更新了新闻部的公开安排。',
      writeback: {
        organizationPatches: [
          {
            organizationId: 'org_wireless_television',
            name: '无线电视',
            currentState: '新闻部正在调整公开采访安排。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.organizations.org_wireless_television).toBeUndefined();
    expect(next.organizations.org_tvb).toMatchObject({
      organizationId: 'org_tvb',
      name: 'TVB',
      aliases: expect.arrayContaining(['无线电视']),
      currentState: '新闻部正在调整公开采访安排。'
    });
  });

  it('does not merge a genuinely distinct player-owned enterprise by surname alone', () => {
    const state = createInitialRuntimeState();
    state.organizations.org_xiao_enterprise = {
      organizationId: 'org_xiao_enterprise',
      name: '萧氏企业',
      type: 'business',
      summary: '玩家持有并经营的本地企业。',
      publicKnowledge: '萧氏名下的商业机构。',
      currentState: '经营稳定。',
      stanceTowardPlayer: '玩家是该企业的经营者。',
      pressureSummary: '暂无明确压力。',
      relatedActorIds: ['player'],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      visibility: 'player_known',
      importance: 75
    };
    state.actors.player.organizationRelations.push({
      organizationId: 'org_xiao_enterprise',
      relationType: 'owner',
      roleTitle: '经营者',
      summary: '玩家持有并经营萧氏企业。',
      visibility: 'player_known'
    });

    const response = validateNarratorResponse({
      narrativeText: '玩家另行成立了一家物流公司。',
      writeback: {
        organizationPatches: [
          {
            organizationId: 'org_xiao_logistics',
            name: '萧氏物流企业',
            type: 'business',
            summary: '独立经营的物流企业。',
            relatedActorIds: ['player']
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.organizations.org_xiao_enterprise.name).toBe('萧氏企业');
    expect(next.organizations.org_xiao_logistics).toMatchObject({
      organizationId: 'org_xiao_logistics',
      name: '萧氏物流企业'
    });
  });

  it('updates only known society activity areas while preserving the immutable profile', () => {
    const state = createInitialRuntimeState();
    const originalProfile = state.organizations.org_sun_yee_on.triadProfile;
    const response = validateNarratorResponse({
      narrativeText: '旺角线开始收紧夜场联络。',
      writeback: {
        organizationPatches: [
          {
            organizationId: 'org_sun_yee_on',
            triadState: {
              leadership: {
                phase: 'contested',
                visibleSummary: '两条地区线对夜场事务的处理办法出现分歧。',
                nextMilestone: '等待核心主事层协调。',
                confidence: 'low'
              },
              activityAreas: [
                {
                  placeId: 'place_portland_street',
                  statusSummary: '夜场线暂缓扩大人手。',
                  pressureSummary: '警方巡查增加。',
                  confidence: 'medium'
                },
                {
                  placeId: 'place_unknown_claimed_territory',
                  statusSummary: '不应写入的新地盘。',
                  pressureSummary: '无来源。',
                  confidence: 'high'
                }
              ]
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.organizations.org_sun_yee_on.triadProfile).toEqual(originalProfile);
    expect(next.organizations.org_sun_yee_on.triadState?.leadership).toMatchObject({
      phase: 'contested',
      visibleSummary: '两条地区线对夜场事务的处理办法出现分歧。'
    });
    expect(next.organizations.org_sun_yee_on.triadState?.activityAreas).toContainEqual(
      expect.objectContaining({ placeId: 'place_portland_street', statusSummary: '夜场线暂缓扩大人手。' })
    );
    expect(next.organizations.org_sun_yee_on.triadState?.activityAreas).not.toContainEqual(
      expect.objectContaining({ placeId: 'place_unknown_claimed_territory' })
    );
  });

  it('applies weather writeback as environment state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '雨势压下来。',
      writeback: {
        weatherPatch: {
          condition: 'heavy_rain',
          label: '大雨',
          intensity: 80,
          impactSummary: '路面湿滑，霓虹反光，巡逻视线受影响。',
          validForMinutes: 90,
          tags: ['wet_road']
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.environment.weather.condition).toBe('heavy_rain');
    expect(next.environment.weather.source).toBe('llm');
    expect(next.environment.weather.tags).toContain('wet_road');
  });

  it('drops malformed weather writeback without failing the turn', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '天气描述漂了一下。',
      writeback: {
        weatherPatch: {
          condition: 'snowstorm',
          intensity: 500
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.validationWarnings?.some((warning) => warning.path.includes('weatherPatch'))).toBe(true);
    expect(next.storyLog.at(-1)?.text).toBe('天气描述漂了一下。');
  });

  it('drops a weather patch without condition without failing the turn', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '当前天气继续影响街面，但没有发生变化。',
      writeback: {
        weatherPatch: {
          impactSummary: '路面仍然湿滑。',
          validForMinutes: 1440
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.weatherPatch).toBeUndefined();
    expect(
      response.validationWarnings?.some((warning) =>
        warning.path.includes('weatherPatch')
      )
    ).toBe(true);
    expect(next.storyLog.at(-1)?.text).toContain('没有发生变化');
  });

  it('keeps the original expiry when the model repeats the current condition', () => {
    const state = createInitialRuntimeState();
    const current = state.environment.weather;
    const response = validateNarratorResponse({
      narrativeText: '当前天气仍在影响巡逻。',
      writeback: {
        weatherPatch: {
          condition: current.condition,
          impactSummary: '模型只是再次描述当前天气。',
          validForMinutes: 1440
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.environment.weather.startedAt).toEqual(current.startedAt);
    expect(next.environment.weather.validUntil).toEqual(current.validUntil);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'weather_same_condition_not_extended',
        path: ['environment', 'weather']
      })
    );
  });

  it('persists current matter semantic fields for player-facing current matters', () => {
    const state = createInitialRuntimeState();
    const dueAt = { year: 1988, month: 9, day: 12, hour: 23, minute: 0 };
    const response = validateNarratorResponse({
      narrativeText: 'A known personal pressure is recorded for later projection.',
      writeback: {
        currentMatterPatches: [
          {
            id: 'matter_call_girlfriend',
            title: 'Call Mary back tonight',
            summary: 'Mary asked the player to call back before the night shift ends.',
            status: 'active',
            priority: 65,
            visibility: 'known',
            source: 'npc',
            matterKind: 'relationship',
            pressureLevel: 2,
            responseWindow: 'today',
            consequenceHint: 'If the player ignores it tonight, Mary may think he is avoiding her.',
            dueAt,
            currentHook: 'Mary is waiting for a phone call after 23:00.',
            unread: true,
            relatedActorIds: ['actor_mary'],
            relatedPlaceIds: [],
            relatedCaseIds: [],
            relatedOrganizationIds: []
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const matter = next.dynamicEvents.currentMatters.matter_call_girlfriend as any;

    expect(matter.matterKind).toBe('relationship');
    expect(matter.pressureLevel).toBe(2);
    expect(matter.responseWindow).toBe('today');
    expect(matter.consequenceHint).toContain('avoiding');
    expect(matter.dueAt).toEqual(dueAt);
    expect(matter.currentHook).toContain('23:00');
    expect(matter.unread).toBe(true);
  });

  it('does not permanently resolve a dormant current matter from narrative outcome text', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '街面隐患已经处理完毕。',
      writeback: {
        currentMatterPatches: [
          {
            id: 'matter_luen_ying_revenge',
            title: '联英马仔街头寻仇（已瓦解）',
            summary: '残余马仔受到叔父辈警告及警方高压，已彻底丧失斗志。',
            status: 'dormant',
            priority: 80,
            visibility: 'known',
            source: 'street',
            matterKind: 'social',
            pressureLevel: 0,
            responseWindow: 'open',
            currentHook: '玩家确认残余马仔见警即逃，该隐患暂时解除。',
            relatedActorIds: ['player'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            relatedOrganizationIds: ['org_14k']
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.dynamicEvents.currentMatters.matter_luen_ying_revenge.status).toBe('dormant');
  });

  it('soft-drops malformed current matter semantic fields without losing valid siblings', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'Only valid current matter writes should survive.',
      writeback: {
        currentMatterPatches: [
          {
            id: 'matter_valid',
            title: 'Valid known pressure',
            summary: 'A valid matter remains available for projection.',
            status: 'active',
            priority: 50,
            visibility: 'known',
            source: 'npc',
            pressureLevel: 1,
            responseWindow: 'soon'
          },
          {
            id: 'matter_bad',
            title: 'Bad pressure',
            summary: 'This item should be dropped because pressureLevel is outside the supported range.',
            status: 'active',
            priority: 50,
            visibility: 'known',
            source: 'npc',
            pressureLevel: 9,
            responseWindow: 'soon'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.dynamicEvents.currentMatters.matter_valid).toBeDefined();
    expect(next.dynamicEvents.currentMatters.matter_bad).toBeUndefined();
    expect(response.validationWarnings?.some((warning) => warning.path.includes('currentMatterPatches'))).toBe(true);
  });

  it('normalizes the unambiguous player_known alias on current matter visibility', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '玩家把夜班车传闻登记为待核对事项。',
      writeback: {
        currentMatterPatches: [
          {
            id: 'matter_midnight_bus_rumor',
            title: '核对午夜巴士传闻',
            summary: '玩家准备核对司机、车次与报案记录。',
            status: 'active',
            priority: 55,
            visibility: 'player_known',
            source: 'official_dlc'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.currentMatterPatches).toEqual([
      expect.objectContaining({
        id: 'matter_midnight_bus_rumor',
        visibility: 'known'
      })
    ]);
    expect(next.dynamicEvents.currentMatters.matter_midnight_bus_rumor?.visibility).toBe('known');
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'currentMatterPatches', 0, 'visibility'],
        code: 'current_matter_visibility_alias_normalized'
      })
    );
  });

  it('preserves a texture-only remain receipt without requiring world writeback evidence', () => {
    const result = validateNarratorResponseStrict({
      narrativeText: '街坊闲谈中再次提到夜班车，但没有形成新的世界事实。',
      turnSummary: '午夜巴士传闻只作为本回合背景出现。',
      suggestedActions: ['继续原本行动'],
      dramaExecutionTrace: {
        planId: 'drama_plan_turn_1',
        status: 'used_as_texture',
        usedSourceRefs: [{
          providerId: 'official-dlc',
          sourceType: 'official_dlc_event',
          sourceId: 'urban_legends_alpha:midnight_bus',
          dlcId: 'urban_legends_alpha'
        }],
        resultingWritebackRefs: [],
        narrativeArcProgress: [{
          arcInstanceId: 'arc_official-dlc_urban_legends_alpha_midnight_bus',
          sourceRef: {
            providerId: 'official-dlc',
            sourceType: 'official_dlc_event',
            sourceId: 'urban_legends_alpha:midnight_bus',
            dlcId: 'urban_legends_alpha'
          },
          decision: 'remain',
          currentStageId: 'street_rumor',
          usedNodeIds: [],
          supportingWritebackRefs: [],
          summary: '传闻仍在街坊闲谈中存在。'
        }]
      },
      writeback: {}
    });

    expect(result.dramaExecutionTrace?.narrativeArcProgress).toEqual([
      expect.objectContaining({
        decision: 'remain',
        supportingWritebackRefs: []
      })
    ]);
    expect(result.validationWarnings ?? []).not.toContainEqual(
      expect.objectContaining({ code: 'narrative_arc_progress_schema_invalid' })
    );
  });

  it('ignores malformed remain evidence without dropping the safe remain receipt', () => {
    const result = validateNarratorResponseStrict({
      narrativeText: '夜班车传闻被顺带提及，但没有形成新的世界事实。',
      turnSummary: '剧情弧保持当前阶段。',
      suggestedActions: ['继续原本行动'],
      dramaExecutionTrace: {
        planId: 'drama_plan_turn_1',
        status: 'used_as_texture',
        usedSourceRefs: [{
          providerId: 'official-dlc',
          sourceType: 'official_dlc_event',
          sourceId: 'urban_legends_alpha:midnight_bus',
          dlcId: 'urban_legends_alpha'
        }],
        resultingWritebackRefs: [],
        narrativeArcProgress: [{
          arcInstanceId: 'arc_official-dlc_urban_legends_alpha_midnight_bus',
          sourceRef: {
            providerId: 'official-dlc',
            sourceType: 'official_dlc_event',
            sourceId: 'urban_legends_alpha:midnight_bus',
            dlcId: 'urban_legends_alpha'
          },
          decision: 'remain',
          currentStageId: 'street_rumor',
          usedNodeIds: [],
          supportingWritebackRefs: [{ kind: 'current_matter' }],
          summary: '传闻没有产生新进展。'
        }]
      },
      writeback: {}
    });

    expect(result.dramaExecutionTrace?.narrativeArcProgress).toEqual([
      expect.objectContaining({
        decision: 'remain',
        supportingWritebackRefs: []
      })
    ]);
    expect(result.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: ['dramaExecutionTrace', 'narrativeArcProgress', 0, 'supportingWritebackRefs'],
        code: 'narrative_arc_remain_evidence_ignored'
      })
    );
  });

  it('soft-drops malformed dynamic writeback items without losing valid siblings', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '只有合法的风声会进入本地状态。',
      writeback: {
        signalPatches: [
          {
            id: 'signal_valid',
            title: '报摊旁的消息',
            summary: '有人说记者在找当晚巡逻警员。',
            signalType: 'media',
            reliability: 'low',
            status: 'active',
            visibility: 'known'
          },
          {
            id: '',
            title: '坏风声',
            summary: '这条不应该拖死整个回合。',
            signalType: 'invalid_type',
            reliability: 'certain'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.dynamicEvents.signals.signal_valid.summary).toContain('记者');
    expect(Object.keys(next.dynamicEvents.signals)).toEqual(['signal_valid']);
    expect(response.validationWarnings?.some((warning) => warning.path.includes('signalPatches'))).toBe(true);
  });

  it('accepts city situation track writeback patches', () => {
    const response = validateNarratorResponse({
      writebackVersion: '1.7',
      narrativeText: 'The entertainment reporter mentions a film crew still shooting at night.',
      writeback: {
        citySituationTrackPatches: [
          {
            operation: 'upsert',
            trackId: 'track_test_film_night_shoot',
            title: '金禾片场夜戏压力',
            trackType: 'film_production',
            status: 'active',
            pressureLevel: 2,
            visibility: 'rumor',
            cadenceDays: 14,
            relatedOrganizationIds: ['org_golden_harvest'],
            relatedPlaceIds: ['place_golden_harvest_studio'],
            relatedActorIds: [],
            relatedPowerFigureIds: [],
            summary: '片场正在赶警匪片夜戏，道具枪和外景保安让记者有话题可追。',
            currentBeat: '外景组今晚还在补拍巷口追逐。',
            possibleDevelopments: ['杀青新闻', '记者追访问责'],
            nextReviewAt: { year: 1988, month: 9, day: 26, hour: 9, minute: 0 }
          }
        ]
      }
    });

    expect(response.writeback.citySituationTrackPatches).toHaveLength(1);
    expect(response.writeback.citySituationTrackPatches[0]?.trackId).toBe('track_test_film_night_shoot');
  });

  it('soft-drops malformed city situation track writeback items', () => {
    const response = validateNarratorResponse({
      narrativeText: 'The model returns one valid city track and one malformed item.',
      writeback: {
        citySituationTrackPatches: [
          {
            operation: 'upsert',
            trackId: 'track_valid_market_pressure',
            title: '股灾余波',
            trackType: 'market_pressure',
            summary: '券商和地下钱庄还在消化去年的股灾。',
            currentBeat: '财经版继续追问散户损失。',
            possibleDevelopments: ['财经新闻'],
            nextReviewAt: { year: 1988, month: 9, day: 30, hour: 8, minute: 0 }
          },
          {
            operation: 'upsert',
            trackId: '',
            trackType: 'bad_type'
          }
        ]
      }
    });

    expect(response.writeback.citySituationTrackPatches.map((patch) => patch.trackId)).toEqual([
      'track_valid_market_pressure'
    ]);
    expect(
      response.validationWarnings?.some(
        (warning) => warning.path.join('.') === 'writeback.citySituationTrackPatches.1.trackId'
      )
    ).toBe(true);
  });

  it('applies city situation track writeback as durable runtime state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.7',
      narrativeText: 'A reporter says the old factory dispute will keep developing.',
      writeback: {
        citySituationTrackPatches: [
          {
            operation: 'upsert',
            trackId: 'track_test_factory_dispute',
            title: '旧厂劳资争议',
            trackType: 'labor_dispute',
            summary: '旧厂欠薪风声开始传到报馆。',
            currentBeat: '工人代表在找记者。',
            possibleDevelopments: ['报馆报道', '警署接到滋扰投诉'],
            visibility: 'rumor',
            relatedPlaceIds: []
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.citySituationTracks.track_test_factory_dispute).toMatchObject({
      trackId: 'track_test_factory_dispute',
      trackType: 'labor_dispute',
      visibility: 'rumor'
    });
  });

  it('soft-drops malformed judgement and combat writeback items without losing valid siblings', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.6',
      narrativeText: 'A tense arrest attempt requires a judgement and records a short fight.',
      writeback: {
        judgementCheckPatches: [
          {
            checkId: 'check_valid_arrest',
            turnId: 'turn_1',
            gameTime: state.time,
            title: 'Control the suspect before he reaches the alley',
            category: 'melee',
            targetSummary: 'A panicked young man trying to break away.',
            relatedActorIds: ['player', 'npc_suspect'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            difficulty: 62,
            score: 71,
            outcome: 'success',
            shortSummary: 'The player keeps control after a brief struggle.',
            factors: [
              {
                label: 'Action',
                value: 8,
                reason: 'The player reacts before the suspect fully turns.'
              }
            ],
            visibility: 'player_known'
          },
          {
            checkId: 'check_bad_category',
            turnId: 'turn_1',
            gameTime: state.time,
            title: 'Bad judgement category',
            category: 'magic',
            relatedActorIds: [],
            relatedPlaceIds: [],
            relatedCaseIds: [],
            difficulty: 40,
            score: 50,
            outcome: 'success',
            shortSummary: 'This item should be dropped.',
            factors: [],
            visibility: 'player_known'
          }
        ],
        combatEventPatches: [
          {
            combatId: 'combat_valid_arrest',
            turnId: 'turn_1',
            gameTime: state.time,
            title: 'Alley arrest struggle',
            type: 'melee',
            locationSummary: 'A wet side alley behind the arcade.',
            participants: [
              {
                actorId: 'player',
                name: 'Player',
                side: 'player',
                roleSummary: 'Uniformed constable trying to control the suspect.'
              },
              {
                actorId: 'npc_suspect',
                name: 'Suspect',
                side: 'opponent',
                roleSummary: 'Panicked young man trying to run.'
              }
            ],
            outcome: 'opponent_subdued',
            intensity: 68,
            combatText:
              'The suspect twists toward the alley, slips on the wet pavement, and the player pins his wrist before the crowd closes in.',
            resultSummary: 'The suspect is controlled.',
            consequenceSummary: 'Bystanders now watch the player closely.',
            judgementCheckIds: ['check_valid_arrest'],
            relatedActorIds: ['player', 'npc_suspect'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            visibility: 'player_known',
            unread: true,
            createdAt: state.time
          },
          {
            combatId: 'combat_bad_outcome',
            turnId: 'turn_1',
            gameTime: state.time,
            title: 'Bad combat outcome',
            type: 'melee',
            locationSummary: 'Nowhere',
            participants: [],
            outcome: 'instant_win',
            intensity: 50,
            combatText: 'This item should be dropped.',
            resultSummary: 'Bad item.',
            consequenceSummary: 'Bad item.',
            judgementCheckIds: [],
            relatedActorIds: [],
            relatedPlaceIds: [],
            relatedCaseIds: [],
            visibility: 'player_known',
            unread: true,
            createdAt: state.time
          }
        ]
      }
    });

    expect((response.writeback as any).judgementCheckPatches).toHaveLength(1);
    expect((response.writeback as any).judgementCheckPatches[0]?.checkId).toBe('check_valid_arrest');
    expect((response.writeback as any).combatEventPatches).toHaveLength(1);
    expect((response.writeback as any).combatEventPatches[0]?.combatId).toBe('combat_valid_arrest');
    expect(response.validationWarnings?.some((warning) => warning.path.includes('judgementCheckPatches'))).toBe(true);
    expect(response.validationWarnings?.some((warning) => warning.path.includes('combatEventPatches'))).toBe(true);
  });

  it('applies judgement and combat writebacks to the current local story turn', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.6',
      narrativeText: 'A knife comes out near the arcade and the player commits to a close arrest.',
      timePatch: { elapsedMinutes: 10, reason: 'Brief struggle and immediate scene control.' },
      writeback: {
        judgementCheckPatches: [
          {
            checkId: 'check_close_arrest',
            turnId: 'model_guessed_turn',
            gameTime: state.time,
            title: 'Close the distance before the suspect runs',
            category: 'melee',
            targetSummary: 'A suspect half-turned toward a side alley.',
            relatedActorIds: ['player', 'npc_suspect'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            difficulty: 61,
            score: 72,
            outcome: 'success',
            shortSummary: 'The player closes the gap and controls the suspect.',
            consequenceSummary: 'The watching crowd now focuses on the player.',
            factors: [
              {
                label: '行动',
                value: 8,
                reason: '玩家先一步封住巷口。'
              }
            ],
            visibility: 'player_known'
          }
        ],
        combatEventPatches: [
          {
            combatId: 'combat_close_arrest',
            turnId: 'model_guessed_turn',
            gameTime: state.time,
            title: 'Arcade side-alley arrest',
            type: 'melee',
            locationSummary: 'A damp side alley beside the arcade.',
            participants: [
              {
                actorId: 'player',
                name: 'Player',
                side: 'player',
                roleSummary: 'Uniformed officer making the arrest.'
              },
              {
                actorId: 'npc_suspect',
                name: 'Suspect',
                side: 'opponent',
                roleSummary: 'Panicked suspect trying to break away.'
              }
            ],
            outcome: 'opponent_subdued',
            intensity: 66,
            animationKey: 'alley_grapple',
            combatText:
              'The suspect drives his shoulder toward the alley mouth, but the player catches his wrist against the shutter and forces him down before the crowd can surge.',
            resultSummary: 'The suspect is subdued.',
            consequenceSummary: 'The player spends stamina and draws attention from bystanders.',
            judgementCheckIds: ['check_close_arrest'],
            relatedActorIds: ['player', 'npc_suspect'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            visibility: 'player_known',
            unread: true,
            createdAt: state.time
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const storyEntry = next.storyLog.at(-1);

    expect(storyEntry?.turnId).not.toBe('model_guessed_turn');
    expect(next.judgementChecks.check_close_arrest.turnId).toBe(storyEntry?.turnId);
    expect(next.combatEvents.combat_close_arrest.turnId).toBe(storyEntry?.turnId);
    expect(next.judgementChecks.check_close_arrest.gameTime).toEqual(next.time);
    expect(next.combatEvents.combat_close_arrest.gameTime).toEqual(next.time);
    expect(next.judgementChecks.check_close_arrest.margin).toBe(11);
    expect(next.judgementChecks.check_close_arrest.relatedCombatEventId).toBe('combat_close_arrest');
    expect(storyEntry?.judgementCheckIds).toEqual(['check_close_arrest']);
    expect(storyEntry?.combatEventIds).toEqual(['combat_close_arrest']);
  });

  it('accepts deferred narrative events from dynamic and institution-facing modules', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '后台事件进入时间队列。',
      writeback: {
        deferredEventPatches: [
          {
            eventId: 'deferred_news_followup',
            sourceModule: 'dynamic',
            title: '报馆后续追访',
            summary: '记者会在两日后继续追问旺角冲突。',
            triggerAt: { ...state.time, day: state.time.day + 2 },
            promptInstruction: '到期时让记者或报章以合理方式推进这条后续。'
          },
          {
            eventId: 'deferred_org_notice',
            sourceModule: 'organization',
            title: '机构内部通知',
            summary: '某机构准备内部讨论玩家相关事件。',
            triggerAt: { ...state.time, day: state.time.day + 1 },
            promptInstruction: '到期时以机构态度变化或人物对接体现。'
          },
          {
            eventId: 'deferred_relationship_call',
            sourceModule: 'relationship',
            title: '旧识来电',
            summary: '一名旧识会在稍后打电话给玩家。',
            triggerAt: { ...state.time, hour: state.time.hour + 2 },
            promptInstruction: '到期时让这名旧识以自然方式进入正文。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.deferredEvents.deferred_news_followup.sourceModule).toBe('dynamic');
    expect(next.deferredEvents.deferred_org_notice.sourceModule).toBe('organization');
    expect(next.deferredEvents.deferred_relationship_call.sourceModule).toBe('relationship');
  });

  it('applies relationship thread writebacks as durable relationship state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '华叔这条街坊线被记录下来。',
      writeback: {
        relationshipThreadPatches: [
          {
            threadId: 'rel_uncle_wah',
            kind: 'network',
            title: '华叔这条街坊线',
            summary: '华叔愿意在街坊层面提醒玩家，但不会公开替玩家出头。',
            relatedActorIds: ['player'],
            relationshipRole: '街坊长辈',
            status: 'active',
            trustSummary: '愿意给提醒，但保留距离。',
            currentPull: '华叔希望玩家别把小事闹大。',
            creationBasis: 'debt_or_promise',
            evidenceRefs: [
              {
                kind: 'current_turn',
                refId: 'current_turn',
                summary: '华叔在当前回合明确承诺会继续替玩家留意街坊消息。'
              }
            ],
            importance: 65,
            milestoneUpdates: [
              {
                milestoneId: 'ms_wah_warning',
                summary: '华叔提醒玩家，旺角茶餐厅最近有人盯梢。',
                importance: 55,
                relatedActorIds: ['player'],
                visibility: 'player_known'
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.relationshipThreads.rel_uncle_wah).toMatchObject({
      kind: 'network',
      title: '华叔这条街坊线',
      relationshipRole: '街坊长辈',
      importance: 65
    });
    expect(next.relationshipThreads.rel_uncle_wah.milestones[0]?.summary).toContain('旺角茶餐厅');
  });

  it('keeps a relationship out of runtime when its NPC archive is missing', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '一名尚未建档的联系人向玩家作出承诺。',
      writeback: {
        relationshipThreadPatches: [
          {
            threadId: 'rel_orphan_contact',
            kind: 'network',
            title: '尚未建档的联系人',
            summary: '这条关系必须等待对应人物建档成功后再写入。',
            relatedActorIds: ['npc_orphan_contact'],
            primaryActorId: 'npc_orphan_contact',
            relationshipRole: '联系人',
            creationBasis: 'debt_or_promise',
            evidenceRefs: [
              {
                kind: 'current_turn',
                refId: 'current_turn',
                summary: '本回合明确形成承诺。'
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.relationshipThreads.rel_orphan_contact).toBeUndefined();
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'relationship_missing_actor_rejected',
        path: ['writeback', 'relationshipThreadPatches', 0]
      })
    );
  });

  it('atomically creates a new actor archive and its relationship in the same writeback', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '茶档老板娘王婶正式认识了玩家，并答应继续留意街坊消息。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_atomic_auntie_wong',
            name: '王婶',
            gender: 'female',
            computedAge: 52,
            currentIdentity: 'civilian',
            publicIdentity: '茶档老板娘',
            presence: 'present',
            visibility: 'player_known',
            importance: 65
          }
        ],
        relationshipThreadPatches: [
          {
            threadId: 'rel_atomic_auntie_wong',
            kind: 'network',
            title: '王婶这条街坊线',
            summary: '王婶愿意替玩家留意街坊消息。',
            relatedActorIds: ['npc_atomic_auntie_wong'],
            primaryActorId: 'npc_atomic_auntie_wong',
            relationshipRole: '街坊联系人',
            creationBasis: 'debt_or_promise',
            evidenceRefs: [
              {
                kind: 'current_turn',
                refId: 'current_turn',
                summary: '王婶本回合明确答应继续提供消息。'
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_atomic_auntie_wong?.name).toBe('王婶');
    expect(next.relationshipThreads.rel_atomic_auntie_wong?.primaryActorId).toBe('npc_atomic_auntie_wong');
    expect(
      next.storyLog.at(-1)?.writebackDiagnostics?.some(
        (issue) => issue.code === 'relationship_missing_actor_rejected'
      )
    ).not.toBe(true);
  });

  it('does not infer a fate thread from female profile prose without an explicit relationship writeback', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_girlfriend = createActorDefaults({
      actorId: 'npc_girlfriend',
      name: '周嘉敏',
      englishName: 'May Chow',
      gender: 'female',
      birthDate: '1965-05-20',
      computedAge: 23,
      currentIdentity: 'civilian',
      publicIdentity: '玩家女友',
      profileSummary: '在百货公司工作的年轻女性。',
      relationshipSummary: '玩家的女友。',
      attitudeTowardPlayer: '信任玩家，也担心他的警察工作。',
      presence: 'nearby',
      interactionScore: 80,
      importance: 85,
      visibility: 'player_known'
    });

    const response = validateNarratorResponse({
      narrativeText: '周嘉敏和玩家在下班后有了一次更亲密的相处。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_girlfriend',
            femaleProfile: {
              relationshipNotes: '玩家的女友，关系已经进入稳定亲密阶段。',
              publicIntimacyNotes: '两人已经多次亲密相处，彼此信任并开始把这段关系当成长期牵挂。'
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const fateThread = Object.values(next.relationshipThreads).find(
      (thread) => thread.kind === 'fate' && thread.primaryActorId === 'npc_girlfriend'
    );

    expect(fateThread).toBeUndefined();
  });

  it('soft-drops malformed relationship thread items without losing valid siblings', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '只有合法的人脉线进入本地状态。',
      writeback: {
        relationshipThreadPatches: [
          {
            threadId: '',
            kind: 'network',
            title: '坏数据',
            summary: '缺少合法 ID。',
            relatedActorIds: ['player'],
            relationshipRole: '坏数据'
          },
          {
            threadId: 'rel_valid_neighbor',
            kind: 'network',
            title: '邻里熟人',
            summary: '楼下士多老板知道玩家常在夜里回家。',
            relatedActorIds: ['player'],
            relationshipRole: '邻里熟人',
            creationBasis: 'debt_or_promise',
            evidenceRefs: [
              {
                kind: 'current_turn',
                refId: 'current_turn',
                summary: '士多老板在当前回合明确答应日后继续替玩家留意夜间动静。'
              }
            ],
            importance: 35
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.relationshipThreads.rel_valid_neighbor.summary).toContain('士多老板');
    expect(Object.keys(next.relationshipThreads)).toEqual(['rel_valid_neighbor']);
    expect(response.validationWarnings?.some((warning) => warning.path.includes('relationshipThreadPatches'))).toBe(true);
  });

  it('keeps a relationship intent when one evidence kind needs normalization or removal', () => {
    const response = validateNarratorResponse({
      narrativeText: '张秀兰在本回合明确作出承诺。关系证据需要本地整理。',
      writeback: {
        relationshipThreadPatches: [
          {
            threadId: 'rel_zhang_xiulan_fate',
            kind: 'fate',
            title: '张秀兰的承诺',
            summary: '两人形成一项明确承诺。',
            relatedActorIds: ['player'],
            relationshipRole: '承诺对象',
            creationBasis: 'debt_or_promise',
            evidenceRefs: [
              {
                kind: 'currentTurn',
                refId: 'current_turn',
                summary: '本回合明确形成承诺。'
              },
              {
                kind: 'unknown_value',
                refId: 'memory_missing',
                summary: '无法核验的模型字段。'
              }
            ]
          }
        ]
      }
    });

    expect(response.writeback.relationshipThreadPatches).toHaveLength(1);
    expect(response.writeback.relationshipThreadPatches[0].evidenceRefs).toEqual([
      {
        kind: 'current_turn',
        refId: 'current_turn',
        summary: '本回合明确形成承诺。'
      }
    ]);
    expect(response.rawRelationshipThreadPatches).toHaveLength(1);
    expect(response.validationWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'relationship_evidence_kind_normalized' }),
        expect.objectContaining({ code: 'relationship_evidence_ref_removed' })
      ])
    );
  });

  it('records relationship patch diagnostics when a new thread is incomplete', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '不完整关系线不应拖死回合。',
      writeback: {
        relationshipThreadPatches: [
          {
            threadId: 'rel_incomplete',
            summary: '缺少新关系线必需字段。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.relationshipThreads.rel_incomplete).toBeUndefined();
    expect(
      next.storyLog.at(-1)?.writebackDiagnostics?.some((issue) => issue.code === 'relationship_creation_rejected')
    ).toBe(true);
  });

  it('preserves an invalid raw combat record for local envelope recovery', () => {
    const response = validateNarratorResponse({
      narrativeText: '持刀者翻入室内，双方发生短促交锋。',
      turnSummary: '玩家与持刀者发生冲突。',
      writeback: {
        combatEventPatches: [
          {
            combatId: 'combat_raw_recovery',
            turnId: 'turn_0001',
            gameTime: {
              year: 1988,
              month: 9,
              day: 12,
              hour: 21,
              minute: 30
            },
            title: '室内持械冲突',
            type: 'armed',
            locationId: 'place_opening',
            participants: [
              {
                actorId: 'player',
                name: '玩家',
                side: 'player',
                roleSummary: '保护现场人物'
              }
            ],
            outcome: 'opponent_escaped',
            intensity: 65,
            combatText: '玩家贴近夺刀时被迫侧身，对方借机翻窗逃离。',
            resultSummary: '对方逃离现场。',
            consequenceSummary: '现场留下伤情与追查线索。',
            judgementCheckIds: ['check_turn_0001_1']
          }
        ]
      }
    });

    expect(response.writeback.combatEventPatches).toEqual([]);
    expect(response.rawCombatEventPatches).toHaveLength(1);
    expect(response.validationWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.arrayContaining(['combatEventPatches'])
        })
      ])
    );
  });

  it('allows an existing relationship thread update without re-running the creation evidence gate', () => {
    const state = createInitialRuntimeState();
    const created = applyNarratorResponse(
      state,
      validateNarratorResponse({
        narrativeText: '玩家与士多老板形成一项明确承诺。',
        writeback: {
          relationshipThreadPatches: [
            {
              threadId: 'rel_existing_neighbor',
              kind: 'network',
              title: '邻里承诺',
              summary: '士多老板答应替玩家留意夜间动静。',
              relatedActorIds: ['player'],
              relationshipRole: '邻里联系人',
              creationBasis: 'debt_or_promise',
              evidenceRefs: [
                {
                  kind: 'current_turn',
                  refId: 'current_turn',
                  summary: '本回合明确形成承诺。'
                }
              ]
            }
          ]
        }
      })
    );

    const updated = applyNarratorResponse(
      created,
      validateNarratorResponse({
        narrativeText: '士多老板后来补充了一条消息。',
        writeback: {
          relationshipThreadPatches: [
            {
              threadId: 'rel_existing_neighbor',
              summary: '士多老板继续替玩家留意夜间动静，并补充了一条消息。',
              currentPull: '下次路过士多时可以自然问起后续。'
            }
          ]
        }
      })
    );

    expect(updated.relationshipThreads.rel_existing_neighbor.summary).toContain('补充了一条消息');
    expect(updated.relationshipThreads.rel_existing_neighbor.evidenceRefs).toEqual(
      created.relationshipThreads.rel_existing_neighbor.evidenceRefs
    );
    expect(
      updated.storyLog.at(-1)?.writebackDiagnostics?.some((issue) => issue.code === 'relationship_creation_rejected')
    ).not.toBe(true);
  });

  it('keeps the old relationship when a new actor reuses its threadId', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_old_contact = createActorDefaults({
      actorId: 'npc_old_contact',
      name: '旧联系人',
      currentIdentity: 'civilian',
      presence: 'absent'
    });
    state.actors.npc_new_contact = createActorDefaults({
      actorId: 'npc_new_contact',
      name: '新联系人',
      currentIdentity: 'civilian',
      presence: 'absent'
    });
    state.relationshipThreads.rel_contact = {
      threadId: 'rel_contact',
      kind: 'network',
      title: '旧联系人这条线',
      summary: '这条关系属于旧联系人。',
      relatedActorIds: ['player', 'npc_old_contact'],
      primaryActorId: 'npc_old_contact',
      relationshipRole: '旧联系人',
      status: 'active',
      milestones: [],
      visibility: 'player_known',
      importance: 60,
      createdAt: state.time,
      updatedAt: state.time
    };

    const next = applyNarratorResponse(
      state,
      validateNarratorResponse({
        narrativeText: '新联系人明确答应与玩家保持联络。',
        writeback: {
          relationshipThreadPatches: [
            {
              threadId: 'rel_contact',
              kind: 'network',
              title: '新联系人这条线',
              summary: '新联系人答应与玩家保持联络。',
              relatedActorIds: ['player', 'npc_new_contact'],
              primaryActorId: 'npc_new_contact',
              relationshipRole: '新联系人',
              creationBasis: 'debt_or_promise',
              evidenceRefs: [
                {
                  kind: 'current_turn',
                  refId: 'current_turn',
                  summary: '本回合明确形成持续联络承诺。'
                }
              ]
            }
          ]
        }
      })
    );

    expect(next.relationshipThreads.rel_contact).toMatchObject({
      title: '旧联系人这条线',
      primaryActorId: 'npc_old_contact'
    });
    expect(Object.values(next.relationshipThreads)).toContainEqual(
      expect.objectContaining({ title: '新联系人这条线', primaryActorId: 'npc_new_contact' })
    );
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'relationship_thread_id_collision_reassigned' })
    );
  });

  it('applies police panel progress from structured player writeback', () => {
    const state = createInitialRuntimeState({
      lawIdentity: {
        rank: 'Senior Constable (SPC)',
        stationOrPost: 'Wan Chai Police Station',
        department: 'Uniform Branch',
        assignmentSummary: 'Street patrol'
      }
    });
    const response = validateNarratorResponse({
      narrativeText: 'The duty sergeant comments on promotion prospects after patrol.',
      writeback: {
        playerPatch: {
          policePanel: {
            careerPath: {
              dynamicAssessment: {
                supervisor: 'The duty sergeant considers him steady but not yet proven.',
                performance: 'One clean street patrol report is now on record.'
              },
              opportunities: ['Request more documented patrol duties before the next review.']
            },
            climate: [
              {
                key: 'supervisor_attitude',
                label: 'Supervisor attitude',
                level: 'cautious',
                summary: 'Direct supervisors are watching whether he can handle routine pressure.'
              }
            ],
            actionHints: ['Ask the duty sergeant what record helps a future Sergeant recommendation.']
          }
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.policePanel.careerPath.dynamicAssessment.supervisor).toContain('steady');
    expect(next.policePanel.careerPath.dynamicAssessment.performance).toContain('street patrol');
    expect(next.policePanel.climate.find((entry) => entry.key === 'supervisor_attitude')?.summary).toContain(
      'routine pressure'
    );
    expect(next.policePanel.actionHints[0]).toContain('Sergeant recommendation');
  });

  it('does not infer state from narrative text when writeback is empty', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'You train with a pistol until your shooting feels stable.',
      suggestedActions: [],
      writeback: {}
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.activeTraits).toHaveLength(0);
    expect(next.actors.player.traitProgress).toHaveLength(0);
  });

  it('applies finance money changes and mirrors canonical money back to player economy', () => {
    const state = createInitialRuntimeState();
    state.finance.cashOnHand = 1200;
    state.finance.bankBalance = 5000;
    state.player.economy.cashOnHand = 1200;
    state.player.economy.bankBalance = 5000;
    const response = validateNarratorResponse({
      narrativeText: 'The player pays a late-night taxi fare after following a lead.',
      writeback: {
        financePatch: {
          cashDelta: -80,
          summary: '现金减少，主要来自夜间交通开销。',
          ledgerEntries: [
            {
              direction: 'expense',
              amount: 80,
              account: 'cash',
              title: '的士车费',
              summary: '为追线索临时坐车。',
              source: 'writeback'
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.finance.cashOnHand).toBe(1120);
    expect(next.finance.bankBalance).toBe(5000);
    expect(next.player.economy.cashOnHand).toBe(1120);
    expect(next.player.economy.bankBalance).toBe(5000);
    expect(next.player.economy.financeSummary).toBe('现金减少，主要来自夜间交通开销。');
    expect(next.finance.ledger[0]).toMatchObject({
      direction: 'expense',
      amount: 80,
      account: 'cash',
      title: '的士车费',
      source: 'writeback'
    });
    expect(next.finance.ledger[0]?.gameTime).toEqual(next.time);
  });

  it('locally restores a ledger detail when tolerant validation drops a malformed model entry', () => {
    const state = createInitialRuntimeState();
    state.finance.cashOnHand = 200;
    state.player.economy.cashOnHand = 200;
    const response = validateNarratorResponse({
      narrativeText: '玩家在德记茶餐厅吃过午饭后离开。',
      writeback: {
        financePatch: {
          cashDelta: -48,
          summary: '在德记茶餐厅支付了午餐与冻柠茶费用。',
          ledgerEntries: [
            {
              direction: 'expense',
              amount: 48,
              account: 'cash',
              title: '德记午餐',
              summary: null
            }
          ]
        }
      }
    });

    expect(response.writeback.financePatch?.ledgerEntries).toEqual([]);
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'financePatch', 'ledgerEntries', 0, 'summary']
      })
    );

    const next = applyNarratorResponse(state, response);

    expect(next.finance.cashOnHand).toBe(152);
    expect(next.finance.ledger.at(-1)).toMatchObject({
      direction: 'expense',
      amount: 48,
      account: 'cash',
      title: '现金支出补记',
      summary: '在德记茶餐厅支付了午餐与冻柠茶费用。',
      source: 'local_recovery'
    });
  });

  it('treats model-only experience as a capped proposal and records the award', () => {
    const state = createInitialRuntimeState();
    state.player.progression = {
      level: 1,
      experience: 90,
      unspentAttributePoints: 0
    };
    const response = validateNarratorResponse({
      narrativeText: 'The player completes a difficult arrest and learns from the encounter.',
      writeback: {
        playerPatch: {
          progression: {
            experienceGain: 220,
            reason: '完成高风险拘捕并妥善处理现场。'
          }
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.progression).toEqual({
      level: 1,
      experience: 98,
      unspentAttributePoints: 0
    });
    expect(next.storyLog.at(-1)?.experienceAward).toMatchObject({
      awardId: 'xp:turn_0001',
      total: 8,
      modelSuggestedGain: 220,
      capped: true
    });
  });

  it('awards canonical local judgement experience even when progression is omitted', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '玩家在压力下完成现场观察。',
      writeback: {
        judgementCheckPatches: [
          {
            rulesetVersion: 'v1.1-local-d100',
            checkId: 'check_xp_hard_success',
            turnId: 'model_turn',
            gameTime: state.time,
            title: '辨认可疑车辆',
            category: 'observation',
            relatedActorIds: ['player'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            primaryAttribute: 'thinking',
            primaryAttributeValue: 55,
            difficultyTier: 'hard',
            difficultyModifier: -10,
            gameDifficultyModifier: 0,
            contextModifierTotal: 0,
            effectiveTarget: 45,
            presetRoll: 30,
            difficulty: 45,
            score: 30,
            margin: 15,
            outcome: 'success',
            shortSummary: '玩家认出了车辆特征。',
            factors: [],
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.progression.experience).toBe(10);
    expect(next.storyLog.at(-1)?.experienceAward).toMatchObject({
      total: 10,
      sources: [
        expect.objectContaining({
          sourceId: 'judgement:check_xp_hard_success',
          amount: 10
        })
      ]
    });
  });

  it('ignores an invalid model progression proposal without discarding local judgement intent', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '玩家继续完成现场观察。',
      writeback: {
        playerPatch: {
          progression: {
            experienceGain: 'not-a-number'
          }
        },
        judgementCheckPatches: [
          {
            rulesetVersion: 'v1.1-local-d100',
            checkId: 'check_progression_tolerant',
            turnId: 'model_turn',
            gameTime: state.time,
            title: '核对现场细节',
            category: 'observation',
            relatedActorIds: ['player'],
            relatedPlaceIds: [],
            relatedCaseIds: [],
            primaryAttribute: 'thinking',
            difficultyTier: 'standard',
            outcome: 'success',
            shortSummary: '玩家确认了现场细节。',
            factors: []
          }
        ]
      }
    });

    expect(response.writeback.playerPatch?.progression).toBeUndefined();
    expect(response.rawJudgementCheckPatches).toHaveLength(1);
    expect(
      response.validationWarnings?.some(
        (warning) => warning.code === 'progression_model_proposal_ignored'
      )
    ).toBe(true);
  });

  it('normalizes common finance ledger aliases from model output', () => {
    const state = createInitialRuntimeState();
    state.finance.cashOnHand = 300;
    state.finance.bankBalance = 900;
    state.player.economy.cashOnHand = 300;
    state.player.economy.bankBalance = 900;
    const response = validateNarratorResponse({
      narrativeText: 'The player buys cigarettes from a newsstand.',
      writeback: {
        financePatch: {
          moneyDelta: -35,
          ledgerEntries: [
            {
              type: '支出',
              amount: -35,
              category: '买烟',
              description: '在报摊买了一包烟。'
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.validationWarnings?.some((warning) => warning.path.includes('ledgerEntries'))).not.toBe(true);
    expect(next.finance.cashOnHand).toBe(265);
    expect(next.finance.bankBalance).toBe(900);
    expect(next.finance.ledger[0]).toMatchObject({
      direction: 'expense',
      amount: 35,
      account: 'cash',
      title: '买烟',
      summary: '在报摊买了一包烟。'
    });
  });

  it('upserts and removes recurring finance cashflow items from structured writeback', () => {
    const state = createInitialRuntimeState();
    state.finance.bankBalance = 2000;
    state.player.economy.bankBalance = 2000;
    const response = validateNarratorResponse({
      narrativeText: 'The player confirms rent and a side stipend as monthly items.',
      writeback: {
        financePatch: {
          upsertCashflows: [
            {
              itemId: 'cashflow_rent_1984',
              direction: 'expense',
              kind: 'rent',
              title: '深水埗房租',
              amount: 850,
              summary: '每月交给房东的劏房租金。',
              activeFromMonth: '1984-12'
            },
            {
              itemId: 'cashflow_family_support',
              direction: 'income',
              kind: 'family_support',
              title: '家用补贴',
              amount: 200,
              summary: '母亲偶尔补贴伙食。',
              activeFromMonth: '1984-12'
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);
    expect(next.finance.cashflows.cashflow_rent_1984).toMatchObject({
      direction: 'expense',
      kind: 'rent',
      status: 'active',
      source: 'writeback',
      visibility: 'player_known'
    });

    const removeResponse = validateNarratorResponse({
      narrativeText: 'The rent item ends after the player moves out.',
      writeback: {
        financePatch: {
          removeCashflowItemIds: ['cashflow_rent_1984']
        }
      }
    });
    const afterRemove = applyNarratorResponse(next, removeResponse);

    expect(afterRemove.finance.cashflows.cashflow_rent_1984.status).toBe('ended');
    expect(afterRemove.finance.cashflows.cashflow_family_support.status).toBe('active');
  });

  it('accepts debt payment as a recurring finance cashflow kind', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player confirms a monthly debt repayment.',
      writeback: {
        financePatch: {
          upsertCashflows: [
            {
              itemId: 'cashflow_family_debt',
              direction: 'expense',
              kind: 'debt_payment',
              title: '家中欠债还款',
              amount: 600,
              summary: '每月替家里偿还一笔旧债。',
              activeFromMonth: '1988-09'
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.finance.cashflows.cashflow_family_debt.kind).toBe('debt_payment');
  });

  it('records gray ledger entries without changing money unless finance writeback changes money', () => {
    const state = createInitialRuntimeState();
    state.finance.bankBalance = 500;
    state.player.economy.bankBalance = 500;
    const response = validateNarratorResponse({
      narrativeText: 'A nightclub boss sends the player a gold watch.',
      writeback: {
        grayLedgerPatch: {
          entries: [
            {
              kind: 'gift',
              itemSummary: '夜总会老板送来的金表。',
              fromSummary: '尖沙咀夜总会老板',
              relatedActorIds: ['npc_club_boss'],
              summary: '玩家收下来源暧昧的金表，可能留下人情风险。',
              exposureRisk: 45,
              status: 'hidden'
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.finance.bankBalance).toBe(500);
    expect(next.player.economy.bankBalance).toBe(500);
    expect(next.grayLedger).toHaveLength(1);
    expect(next.grayLedger[0]).toMatchObject({
      kind: 'gift',
      itemSummary: '夜总会老板送来的金表。',
      fromSummary: '尖沙咀夜总会老板',
      exposureRisk: 45,
      status: 'hidden'
    });
    expect(next.grayLedger[0]?.gameTime).toEqual(next.time);
  });

  it('applies valid gray network patches to runtime state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player hears structured street-network context.',
      writeback: {
        grayNetworkPatches: [
          {
            areaId: 'area_mong_kok',
            areaName: 'Mong Kok',
            climate: [
              {
                key: 'night_market_pressure',
                label: 'Night market pressure',
                level: 'rising',
                summary: 'Street collectors are becoming more visible after dark.',
                confidence: 'medium',
                lastUpdatedTurn: 2
              }
            ],
            knownOrganizations: [
              {
                organizationId: 'org_wo_luen_shing',
                name: 'Wo Luen Shing',
                visibleName: 'Wo Luen Shing runners',
                summary: 'A visible street-facing circle rather than confirmed leadership.',
                knownScope: 'night market protection rumors',
                confidence: 'low',
                visibility: { police: 'known', gang_member: 'rumor', civilian: 'hidden' },
                relatedActorIds: ['player'],
                relatedPlaceIds: [state.location.currentPlaceId],
                relatedCaseIds: [],
                updatedAtTurn: 2
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.grayNetworks.byAreaId.area_mong_kok.areaName).toBe('Mong Kok');
    expect(next.grayNetworks.byAreaId.area_mong_kok.climate[0]).toMatchObject({
      key: 'night_market_pressure',
      level: 'rising'
    });
    expect(next.grayNetworks.byAreaId.area_mong_kok.knownOrganizations[0]?.relatedActorIds).toEqual(['player']);
  });

  it('does not merge gray network related people into an existing actor by matching name alone', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_ho_001 = {
      ...state.actors.player,
      actorId: 'actor_ho_001',
      name: 'Ho Ka Keung',
      englishName: 'Ho Ka Keung',
      aliases: ['Ah Keung'],
      currentIdentity: 'gang_member',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId
    };
    const response = validateNarratorResponse({
      narrativeText: 'The player recognizes a known street runner under a temporary label.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_temp_keung',
            name: 'Ho Ka Keung',
            statusSummary: 'Nervous after being recognized near the market.'
          }
        ],
        grayNetworkPatches: [
          {
            areaId: 'area_mong_kok',
            relatedPeople: [
              {
                actorId: 'npc_temp_keung',
                visibleRole: 'street runner',
                knownTieSummary: 'Connected to night-market message carrying.',
                confidence: 'medium',
                visibility: { police: 'known', gang_member: 'known', civilian: 'rumor' },
                relatedPlaceIds: [state.location.currentPlaceId],
                relatedOrganizationIds: ['org_wo_luen_shing'],
                relatedCaseIds: [],
                updatedAtTurn: 3
              }
            ],
            relationClues: [
              {
                clueId: 'clue_keung_runner',
                summary: 'Ho Ka Keung may pass messages for a Wo Luen Shing street circle.',
                certainty: 'claim',
                confidence: 'medium',
                visibility: { police: 'known', gang_member: 'rumor', civilian: 'hidden' },
                relatedActorIds: ['npc_temp_keung'],
                relatedPlaceIds: [state.location.currentPlaceId],
                relatedOrganizationIds: ['org_wo_luen_shing'],
                relatedCaseIds: [],
                updatedAtTurn: 3
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const profile = next.grayNetworks.byAreaId.area_mong_kok;

    expect(profile.relatedPeople[0]?.actorId).toBe('npc_temp_keung');
    expect(profile.relationClues[0]?.relatedActorIds).toEqual(['npc_temp_keung']);
    expect(next.actors.actor_ho_001?.statusSummary).not.toBe('Nervous after being recognized near the market.');
    expect(next.storyLog.at(-1)?.writebackDiagnostics?.some((issue) => issue.code === 'remapped_actor_reference')).toBe(false);
  });

  it('drops malformed optional gray network nested items and records validation warnings', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A mixed gray-network writeback includes one malformed clue.',
      writeback: {
        grayNetworkPatches: [
          {
            areaId: 'area_mong_kok',
            climate: [
              {
                key: 'tea_house_rumors',
                label: 'Tea house rumors',
                level: 'rumor',
                summary: 'Regulars are whispering about protection pressure.',
                confidence: 'low'
              }
            ],
            relationClues: [
              {
                clueId: 'clue_valid',
                summary: 'A tea-house regular claims runners are watching the door.',
                certainty: 'rumor',
                confidence: 'low',
                visibility: { police: 'rumor', gang_member: 'rumor', civilian: 'hidden' },
                relatedActorIds: ['player'],
                relatedPlaceIds: [state.location.currentPlaceId],
                relatedOrganizationIds: [],
                relatedCaseIds: []
              },
              {
                clueId: 'clue_bad',
                certainty: 'impossible',
                confidence: 'low',
                visibility: { police: 'rumor' },
                relatedActorIds: ['player'],
                relatedPlaceIds: [],
                relatedOrganizationIds: [],
                relatedCaseIds: []
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.grayNetworkPatches[0]?.relationClues).toHaveLength(1);
    expect(response.validationWarnings?.some((warning) => warning.path.join('.') === 'writeback.grayNetworkPatches.0.relationClues.1.summary')).toBe(
      true
    );
    expect(next.grayNetworks.byAreaId.area_mong_kok.climate[0]?.key).toBe('tea_house_rumors');
    expect(next.grayNetworks.byAreaId.area_mong_kok.relationClues.map((clue) => clue.clueId)).toEqual(['clue_valid']);
  });

  it('keeps gray network patches when fallback validation drops a malformed neighboring module', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A bad actor patch should not discard valid gray-network writeback.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_bad_gender',
            name: 'Bad Gender',
            gender: 'robot'
          }
        ],
        grayNetworkPatches: [
          {
            areaId: 'area_mong_kok',
            areaName: 'Mong Kok',
            climate: [
              {
                key: 'market_collection_rumor',
                label: 'Market collection rumor',
                level: 'rumor',
                summary: 'Market stallholders mention collectors moving after midnight.',
                confidence: 'low'
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.actorPatches).toHaveLength(0);
    expect(response.writeback.grayNetworkPatches).toHaveLength(1);
    expect(response.validationWarnings?.some((warning) => warning.path.join('.') === 'writeback.actorPatches.0.gender')).toBe(true);
    expect(next.grayNetworks.byAreaId.area_mong_kok.climate[0]?.key).toBe('market_collection_rumor');
  });

  it('keeps valid gray network scalar fields when an optional removal field is malformed', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A malformed removal field should not move the patch into the current default area.',
      writeback: {
        grayNetworkPatches: [
          {
            areaId: 'area_tsim_sha_tsui',
            areaName: 'Tsim Sha Tsui',
            climate: [
              {
                key: 'pier_rumors',
                label: 'Pier rumors',
                level: 'rumor',
                summary: 'Dockside rumors are getting louder.',
                confidence: 'low'
              }
            ],
            removeIds: {
              actorIds: 'not-an-array'
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.grayNetworks.byAreaId.area_tsim_sha_tsui.areaName).toBe('Tsim Sha Tsui');
    expect(next.grayNetworks.byAreaId.area_tsim_sha_tsui.climate[0]?.key).toBe('pier_rumors');
    expect(next.grayNetworks.byAreaId[state.location.currentPlaceId]).toBeUndefined();
    expect(response.validationWarnings?.some((warning) => warning.path.join('.') === 'writeback.grayNetworkPatches.0.removeIds.actorIds')).toBe(
      true
    );
  });

  it('does not remove a canonical gray-network actor through an unverified same-name temporary id', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_ho_001 = {
      ...state.actors.player,
      actorId: 'actor_ho_001',
      name: 'Ho Ka Keung',
      englishName: 'Ho Ka Keung',
      aliases: [],
      currentIdentity: 'gang_member'
    };
    state.grayNetworks.byAreaId.area_mong_kok = {
      areaId: 'area_mong_kok',
      areaName: 'Mong Kok',
      climate: [],
      knownOrganizations: [],
      keyPlaces: [],
      relatedPeople: [
        {
          actorId: 'actor_ho_001',
          visibleRole: 'runner',
          knownTieSummary: 'Known street runner.',
          confidence: 'medium',
          visibility: { police: 'known' },
          relatedPlaceIds: [],
          relatedOrganizationIds: [],
          relatedCaseIds: []
        }
      ],
      relationClues: [],
      actionRisks: [],
      suggestedActions: []
    };
    const response = validateNarratorResponse({
      narrativeText: 'The same person is referenced by a temporary label and removed from the visible gray-network list.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_temp_keung',
            name: 'Ho Ka Keung',
            statusSummary: 'No longer relevant to this area projection.'
          }
        ],
        grayNetworkPatches: [
          {
            areaId: 'area_mong_kok',
            removeIds: {
              actorIds: ['npc_temp_keung']
            },
            relationClues: [
              {
                clueId: 'clue_unknown_refs',
                summary: 'The rumor mentions a new society name and a back room the player has not confirmed.',
                certainty: 'rumor',
                confidence: 'low',
                visibility: { police: 'rumor' },
                relatedActorIds: ['actor_missing_gray_ref'],
                relatedPlaceIds: ['place_missing_gray_ref'],
                relatedOrganizationIds: ['org_missing_gray_ref'],
                relatedCaseIds: ['case_missing_gray_ref']
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.grayNetworks.byAreaId.area_mong_kok.relatedPeople).toEqual([
      expect.objectContaining({ actorId: 'actor_ho_001' })
    ]);
    expect(next.actors.actor_missing_gray_ref).toBeUndefined();
    expect(next.places.place_missing_gray_ref).toBeUndefined();
    expect(next.organizations.org_missing_gray_ref).toBeUndefined();
    expect(next.cases.case_missing_gray_ref).toBeUndefined();
    expect(Object.values(next.memories).some((memory) => memory.text.includes('back room'))).toBe(false);
    expect(next.grayNetworks.byAreaId.area_mong_kok.relationClues[0]?.relatedActorIds).toEqual(['actor_missing_gray_ref']);
  });

  it('does not create gray network state from narrative text alone', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'Rumors say a hidden gray network controls the market, but no structured writeback is provided.',
      writeback: {}
    });

    const next = applyNarratorResponse(state, response);

    expect(next.grayNetworks.byAreaId).toEqual({});
  });

  it('runs monthly settlement when a turn advances into a later month', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'unemployed',
      startTime: { year: 1988, month: 8, day: 31, hour: 23, minute: 50 }
    });
    state.finance.bankBalance = 1000;
    state.player.economy.bankBalance = 1000;
    state.finance.cashflows.salary_spc_1988 = {
      itemId: 'salary_spc_1988',
      direction: 'income',
      kind: 'salary',
      title: '警队月薪',
      amount: 4200,
      account: 'bank',
      summary: '高级警员固定月薪。',
      activeFromMonth: '1988-08',
      relatedAssetItemIds: [],
      relatedActorIds: [],
      relatedPlaceIds: [],
      source: 'opening',
      status: 'active',
      visibility: 'private'
    };
    const response = validateNarratorResponse({
      narrativeText: 'The player finishes a late-night duty and enters a new month.',
      timePatch: { elapsedMinutes: 20, reason: 'Crosses midnight into next month.' },
      writeback: {}
    });

    const next = applyNarratorResponse(state, response);

    expect(next.time.month).toBe(9);
    expect(next.finance.bankBalance).toBe(5200);
    expect(next.player.economy.bankBalance).toBe(5200);
    expect(next.finance.reports[0]?.monthKey).toBe('1988-08');
  });

  it('accepts minimal memory writeback and fills safe defaults', () => {
    const response = validateNarratorResponse({
      narrativeText: 'The player listens to a rumor in the report room.',
      writeback: {
        memories: [
          {
            text: 'Someone mentioned a suspicious car near the station.'
          }
        ],
        actorMemories: [
          {
            actorId: 'player',
            text: 'The player heard a rumor but has not verified it.'
          }
        ]
      }
    });

    expect(response.writeback.memories[0]).toMatchObject({
      kind: 'world',
      importance: 50,
      visibility: 'player_known',
      certainty: 'claim'
    });
    expect(response.writeback.actorMemories[0]).toMatchObject({
      importance: 50,
      visibility: 'player_known'
    });
  });

  it('normalizes common memory kind aliases in regular writeback', () => {
    const response = validateNarratorResponse({
      narrativeText: 'The station talks about yesterday’s political news.',
      writeback: {
        memories: [
          {
            text: 'The Sino-British Joint Declaration was signed yesterday.',
            kind: 'historical',
            importance: 100,
            visibility: 'player_known',
            certainty: 'fact'
          }
        ]
      }
    });

    expect(response.writeback.memories[0]?.kind).toBe('world');
  });

  it('upserts a new NPC actor from structured actor patches without adding NPC vitals', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player meets a tea stall owner who has heard about a late-night quarrel.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_uncle_wah',
            name: 'Uncle Wah',
            englishName: 'Wah Lee',
            gender: 'male',
            computedAge: 58,
            currentIdentity: 'civilian',
            publicIdentity: 'Tea stall owner',
            actualIdentitySummary: 'A late-night tea stall owner who hears street talk around Mong Kok.',
            positionSummary: 'Runs a tea stall near Mong Kok Police Station.',
            profileSummary: 'An older streetwise shopkeeper who talks carefully when police are nearby.',
            appearance: 'Thin, grey-haired, always wiping a cup with a towel.',
            clothing: 'Old short-sleeved shirt and dark trousers.',
            equipment: ['Tea towel', 'Cash tin'],
            personality: 'Careful, observant, reluctant to offend either side.',
            speechStyle: 'Uses short Cantonese-flavored street phrases.',
            motivation: 'Keep the stall peaceful and avoid trouble.',
            longTermGoal: 'Stay useful enough that both police and locals leave him alone.',
            values: 'Practical survival and neighborhood face.',
            attributes: { body: 35, action: 40, perception: 65, thinking: 55, negotiation: 60, will: 50 },
            relationshipSummary: 'He knows the player by uniform, not personally.',
            attitudeTowardPlayer: 'Polite but guarded.',
            interactionScore: 8,
            trustTendency: 'Will talk about public rumors but withholds sensitive names.',
            entanglementSummary: 'May know a few night-shift drivers and local shopkeepers.',
            longTermMemorySummary: 'He remembers which officers behave fairly on the street.',
            recentInteractionMemory: 'He noticed the player asking about a late-night quarrel.',
            keyMemories: [
              {
                text: 'He heard two men arguing near the tea stall after midnight.',
                importance: 65,
                visibility: 'player_known'
              }
            ],
            statusSummary: 'Alert and cautious.',
            bodyConditionSummary: 'Tired from the night shift but otherwise fine.',
            currentPlaceId: 'place_mong_kok_police_station',
            currentSceneId: 'scene_report_room',
            presence: 'present',
            visibility: 'player_known',
            importance: 60,
            worldpackActorData: {
              hk1988: {
                generationSource: 'rumor_scene'
              }
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const actor = next.actors.npc_uncle_wah;

    expect(actor.name).toBe('Uncle Wah');
    expect(actor.vitals).toBeUndefined();
    expect(actor.actualIdentitySummary).toContain('tea stall owner');
    expect(actor.relationshipSummary).toContain('uniform');
    expect(actor.attitudeTowardPlayer).toBe('Polite but guarded.');
    expect(actor.interactionScore).toBe(8);
    expect(actor.bodyConditionSummary).toContain('Tired');
    expect(actor.keyMemories).toHaveLength(0);
    expect(Object.values(next.memories).find((memory) => memory.text.includes('arguing'))).toMatchObject({
      kind: 'actor',
      relatedActorIds: ['npc_uncle_wah'],
      relatedTurnId: 'turn_0001'
    });
    expect(actor.worldpackActorData?.hk1988).toEqual({ generationSource: 'rumor_scene' });
    expect(next.scenes.scene_report_room.presentActorIds).toContain('npc_uncle_wah');
  });

  it('remaps a public figure creation to one stable canonical actor while keeping real names', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player meets a rising singer at the radio corridor.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_zhang_xueyou',
            name: '张学友',
            gender: 'male',
            computedAge: 27,
            currentIdentity: 'civilian',
            publicIdentity: '正在快速上升的男歌手',
            actualIdentitySummary: '张学友是被唱片公司和电台宣传围绕的上升期歌手。',
            positionSummary: '在电台走廊等候访问。',
            profileSummary: '张学友唱功突出，正被唱片合约和宣传压力推着往前走。',
            appearance: '年轻、干净，神情带一点紧张。',
            clothing: '浅色衬衫和深色西裤。',
            equipment: ['访问通行证'],
            personality: '礼貌、敏感，对记者保持距离。',
            speechStyle: '回答谨慎，语气温和。',
            motivation: '完成访问，同时避免卷入不必要的麻烦。',
            longTermGoal: '靠唱功在歌坛站稳。',
            values: '专业、守信，不愿拖累身边工作人员。',
            attributes: { body: 42, action: 45, perception: 58, thinking: 55, negotiation: 54, will: 60 },
            relationshipSummary: '刚与玩家在电台后台短暂接触。',
            attitudeTowardPlayer: '礼貌但戒备。',
            interactionScore: 12,
            trustTendency: '只会谈公开行程，除非玩家给出可信保护。',
            entanglementSummary: '唱片公司、电台、粉丝信和校园演出都可能牵连他。',
            longTermMemorySummary: '记得警察曾在电台后台询问粉丝信。',
            recentInteractionMemory: '刚被玩家问起粉丝信夹带线索。',
            statusSummary: '准备进入直播间。',
            bodyConditionSummary: '正常，只是略显疲惫。',
            currentPlaceId: 'place_kln_tang_broadcast_drive',
            presence: 'mentioned',
            visibility: 'player_known',
            importance: 78
          }
        ],
        actorMemories: [
          {
            actorId: 'npc_zhang_xueyou',
            actorName: '张学友',
            text: '张学友记得玩家问过粉丝信夹带线索。',
            importance: 55,
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const actor = next.actors.npc_seed_fig_jacky_crooner_rising;

    expect(next.actors.npc_zhang_xueyou).toBeUndefined();
    expect(actor).toMatchObject({
      actorId: 'npc_seed_fig_jacky_crooner_rising',
      name: '张学友',
      englishName: 'Jacky Cheung',
      worldpackActorData: {
        hk1988: {
          eraSeedIdentity: {
            canonicalSeedId: 'fig_jacky_crooner_rising',
            seedFigureId: 'fig_jacky_crooner_rising',
            displayName: '张学友',
            englishName: 'Jacky Cheung'
          }
        }
      }
    });
    expect(actor.aliases).toEqual(expect.arrayContaining(['学友仔', '新晋唱将']));
    expect(JSON.stringify(actor)).not.toMatch(/张学佑|张学仁/u);
    expect(Object.values(next.memories).find((memory) => memory.relatedActorIds.includes(actor.actorId))?.text).toContain('张学友');
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'seed_identity_actor_remapped',
          path: ['writeback', 'actorPatches', 0, 'actorId']
        })
      ])
    );
  });

  it('recovers an uninstantiated mismatched seed id through agreeing exact names and remaps dependent data', () => {
    const state = createInitialRuntimeState();
    const incorrectActorId = 'npc_seed_fig_hk_ent_q715330';
    const canonicalActorId = 'npc_seed_fig_hk_ent_q838209';
    const response = validateNarratorResponse({
      narrativeText: '玩家在电视台后台正式认识邱淑贞，并约定日后保持联系。',
      writeback: {
        actorPatches: [
          {
            actorId: incorrectActorId,
            name: '邱淑贞',
            englishName: 'Chingmy Yau',
            gender: 'female',
            computedAge: 20,
            currentIdentity: 'civilian',
            publicIdentity: '香港演艺圈新人',
            presence: 'present',
            visibility: 'player_known',
            importance: 72
          }
        ],
        actorMemories: [
          {
            actorId: incorrectActorId,
            actorName: '邱淑贞',
            text: '邱淑贞记得玩家在电视台后台提供过帮助。',
            importance: 55,
            visibility: 'player_known'
          }
        ],
        relationshipThreadPatches: [
          {
            threadId: 'rel_chingmy_yau_contact',
            kind: 'network',
            title: '电视台后台的联系',
            summary: '邱淑贞愿意和玩家保持联系。',
            relatedActorIds: ['player', incorrectActorId],
            primaryActorId: incorrectActorId,
            relationshipRole: '演艺圈联系人',
            creationBasis: 'debt_or_promise',
            evidenceRefs: [
              {
                kind: 'current_turn',
                refId: 'current_turn',
                summary: '本回合双方明确约定保持联系。'
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors[incorrectActorId]).toBeUndefined();
    expect(next.actors[canonicalActorId]).toMatchObject({
      actorId: canonicalActorId,
      name: '邱淑贞',
      englishName: 'Chingmy Yau'
    });
    expect(next.relationshipThreads.rel_chingmy_yau_contact).toMatchObject({
      primaryActorId: canonicalActorId,
      relatedActorIds: ['player', canonicalActorId]
    });
    expect(
      Object.values(next.memories).find((memory) => memory.relatedActorIds.includes(canonicalActorId))
    ).toMatchObject({
      kind: 'actor'
    });
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'seed_identity_actor_remapped',
        path: ['writeback', 'actorPatches', 0, 'actorId']
      })
    );
  });

  it('does not redirect or attach a relationship when the conflicting seed actor already exists', () => {
    const state = createInitialRuntimeState();
    const existingIdentity = findFixedActorIdentityDescriptors('刘伟强')[0]!;
    state.actors[existingIdentity.runtimeActorId] = createActorDefaults({
      actorId: existingIdentity.runtimeActorId,
      name: existingIdentity.displayName,
      englishName: existingIdentity.englishName,
      aliases: [...existingIdentity.aliases],
      currentIdentity: 'civilian',
      publicIdentity: existingIdentity.publicIdentity,
      profileSummary: existingIdentity.profileSummary,
      statusSummary: '正在片场筹备拍摄。',
      stableIdentityRef: existingIdentity.ref
    });
    const response = validateNarratorResponse({
      narrativeText: '模型错误地把另一位艺人的资料写到了刘伟强的稳定身份上。',
      writeback: {
        actorPatches: [
          {
            actorId: existingIdentity.runtimeActorId,
            name: '邱淑贞',
            englishName: 'Chingmy Yau',
            statusSummary: '错误覆盖。'
          }
        ],
        relationshipThreadPatches: [
          {
            threadId: 'rel_conflicting_seed_identity',
            kind: 'network',
            title: '错误人物关系',
            summary: '这条关系不应绑定到刘伟强。',
            relatedActorIds: [existingIdentity.runtimeActorId],
            primaryActorId: existingIdentity.runtimeActorId,
            relationshipRole: '演艺圈联系人',
            creationBasis: 'debt_or_promise',
            evidenceRefs: [
              {
                kind: 'current_turn',
                refId: 'current_turn',
                summary: '模型声称本回合形成联系。'
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors[existingIdentity.runtimeActorId]).toMatchObject({
      name: '刘伟强',
      statusSummary: '正在片场筹备拍摄。'
    });
    expect(next.actors.npc_seed_fig_hk_ent_q838209).toBeUndefined();
    expect(next.relationshipThreads.rel_conflicting_seed_identity).toBeUndefined();
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'actor_fixed_identity_conflict' }),
        expect.objectContaining({ code: 'relationship_actor_identity_conflict_rejected' })
      ])
    );
  });

  it('remaps a city power public figure to one stable canonical actor while keeping real names', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player hears a senior police command name in a briefing.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_real_police_commissioner',
            name: '李君夏',
            englishName: 'Li Kwan-ha',
            aliases: ['一哥李Sir', 'Li Kwan-ha'],
            gender: 'male',
            computedAge: 54,
            currentIdentity: 'police',
            publicIdentity: '皇家香港警察高层指挥人物',
            actualIdentitySummary: '李君夏在总部记者会前调整警队口径。',
            positionSummary: '警队高层办公室。',
            profileSummary: '李君夏以纪律、舆论和政治压力影响基层案件处理。',
            appearance: '西装整洁，神情严肃。',
            clothing: '深色西装。',
            equipment: ['简报文件'],
            personality: '克制、强硬、重视秩序。',
            speechStyle: '简短、正式。',
            motivation: '控制警队公开口径。',
            longTermGoal: '维持警队形象。',
            values: '纪律、秩序、政治敏感度。',
            attributes: { body: 45, action: 48, perception: 70, thinking: 78, negotiation: 76, will: 82 },
            relationshipSummary: '玩家只通过内部通告听见他。',
            attitudeTowardPlayer: '无直接关系。',
            interactionScore: 0,
            trustTendency: '不会直接接触基层警员。',
            entanglementSummary: '记者会、投诉科和廉署压力都围绕他转动。',
            longTermMemorySummary: '李君夏被提到与旺角行动压力有关。',
            recentInteractionMemory: '李君夏的名字出现在简报里。',
            statusSummary: '只作为总部压力存在。',
            bodyConditionSummary: '正常。',
            currentPlaceId: 'place_police_headquarters_wan_chai',
            presence: 'mentioned',
            visibility: 'player_known',
            importance: 96
          }
        ],
        actorMemories: [
          {
            actorId: 'npc_real_police_commissioner',
            actorName: '李君夏',
            text: '李君夏在简报里被提到，旺角行动可能受到总部压力。',
            importance: 70,
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const actor = next.actors.npc_power_power_police_commissioner_li_man_bun;

    expect(next.actors.npc_real_police_commissioner).toBeUndefined();
    expect(actor).toMatchObject({
      actorId: 'npc_power_power_police_commissioner_li_man_bun',
      name: '李君夏',
      englishName: 'Li Kwan-ha',
      worldpackActorData: {
        hk1988: {
          cityPowerIdentity: {
            canonicalSeedId: 'power_police_commissioner_li_man_bun',
            displayName: '李君夏',
            englishName: 'Li Kwan-ha'
          }
        }
      }
    });
    expect(actor.aliases).toEqual(expect.arrayContaining(['李处长', '一哥李Sir']));
    expect(JSON.stringify(actor)).not.toMatch(/李文彬爵士|Sir Raymond Lee/u);
    expect(Object.values(next.memories).find((memory) => memory.relatedActorIds.includes(actor.actorId))?.text).toContain(
      '李君夏'
    );
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'city_power_identity_actor_remapped',
          path: ['writeback', 'actorPatches', 0, 'actorId']
        })
      ])
    );
  });

  it('updates an existing seed actor instead of creating a later real-name duplicate', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_seed_fig_jacky_crooner_rising = createActorDefaults({
      actorId: 'npc_seed_fig_jacky_crooner_rising',
      name: '张学友',
      englishName: 'Jacky Cheung',
      aliases: ['学友仔', '新晋唱将'],
      gender: 'male',
      computedAge: 27,
      currentIdentity: 'civilian',
      publicIdentity: '正在快速上升的男歌手',
      positionSummary: '电台和唱片公司之间奔走的歌手。',
      profileSummary: '唱功突出，仍在上升期。',
      statusSummary: '暂未在场。',
      worldpackActorData: {
        hk1988: {
          eraSeedIdentity: {
            canonicalSeedId: 'fig_jacky_crooner_rising',
            seedFigureId: 'fig_jacky_crooner_rising',
            displayName: '张学友',
            englishName: 'Jacky Cheung'
          }
        }
      }
    });

    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'A later turn tries to introduce the same singer with the source name.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_zhang_xueyou',
            name: '张学友',
            statusSummary: '刚在电台走廊被人提起。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_zhang_xueyou).toBeUndefined();
    expect(next.actors.npc_seed_fig_jacky_crooner_rising?.name).toBe('张学友');
    expect(next.actors.npc_seed_fig_jacky_crooner_rising?.statusSummary).toBe('刚在电台走廊被人提起。');
    expect(Object.values(next.actors).filter((actor) => actor.name === '张学友')).toHaveLength(1);
    expect(JSON.stringify(next.actors.npc_seed_fig_jacky_crooner_rising)).not.toMatch(/张学佑|张学仁/u);
  });

  it('normalizes out-of-range interactionScore without dropping the actor patch', () => {
    const response = validateNarratorResponse({
      narrativeText: 'The player confronts a resentful street youth.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_chen_zijian',
            name: '陈子健',
            englishName: 'Derek Chan',
            gender: 'male',
            computedAge: 21,
            currentIdentity: 'gang_member',
            publicIdentity: '街面青年',
            actualIdentitySummary: '旺角街面边缘青年，替社团跑腿但不是核心成员。',
            positionSummary: '在旺角游戏机中心附近逗留。',
            profileSummary: '年轻、好面子，遇到警察时会先硬撑。',
            appearance: '瘦削，头发略长，眼神闪避。',
            clothing: '旧牛仔外套和深色裤子。',
            equipment: ['打火机', '香烟'],
            personality: '逞强、防备心重，但压力大时容易露怯。',
            speechStyle: '带街头粤语，语速偏快。',
            motivation: '保住面子，同时避免真的被带回警署。',
            longTermGoal: '在街面站稳脚跟，不再被人当小弟使唤。',
            values: '讲义气但更怕吃亏。',
            attributes: { body: 45, action: 52, perception: 50, thinking: 42, negotiation: 38, will: 46 },
            relationshipSummary: '刚被玩家盘问，对玩家有敌意但仍会保持距离。',
            attitudeTowardPlayer: '恼怒、戒备。',
            interactionScore: -10,
            trustTendency: '不会主动交代，只会在压力下吐出边角信息。',
            entanglementSummary: '可能与附近社团头目和游戏机中心有关联。',
            longTermMemorySummary: '记得玩家曾在街面截查他。',
            recentInteractionMemory: '刚被玩家按住盘问。',
            statusSummary: '紧张且愤懑。',
            bodyConditionSummary: '正常，但手心冒汗。',
            currentPlaceId: 'place_mongkok_street',
            currentSceneId: 'scene_patrol_interrogation',
            presence: 'present',
            visibility: 'player_known',
            importance: 55
          }
        ]
      }
    });

    expect(response.writeback.actorPatches).toHaveLength(1);
    expect(response.writeback.actorPatches[0]?.interactionScore).toBe(0);
  });

  it('keeps actor memories for actors created in the same writeback response', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player confronts a resentful street youth and remembers his reaction.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_chen_zijian',
            name: '陈子健',
            englishName: 'Derek Chan',
            gender: 'male',
            computedAge: 21,
            currentIdentity: 'gang_member',
            publicIdentity: '街面青年',
            actualIdentitySummary: '旺角街面边缘青年，替社团跑腿但不是核心成员。',
            positionSummary: '在旺角游戏机中心附近逗留。',
            profileSummary: '年轻、好面子，遇到警察时会先硬撑。',
            appearance: '瘦削，头发略长，眼神闪避。',
            clothing: '旧牛仔外套和深色裤子。',
            equipment: ['打火机', '香烟'],
            personality: '逞强、防备心重，但压力大时容易露怯。',
            speechStyle: '带街头粤语，语速偏快。',
            motivation: '保住面子，同时避免真的被带回警署。',
            longTermGoal: '在街面站稳脚跟，不再被人当小弟使唤。',
            values: '讲义气但更怕吃亏。',
            attributes: { body: 45, action: 52, perception: 50, thinking: 42, negotiation: 38, will: 46 },
            relationshipSummary: '刚被玩家盘问，对玩家有敌意但仍会保持距离。',
            attitudeTowardPlayer: '恼怒、戒备。',
            interactionScore: -10,
            trustTendency: '不会主动交代，只会在压力下吐出边角信息。',
            entanglementSummary: '可能与附近社团头目和游戏机中心有关联。',
            longTermMemorySummary: '记得玩家曾在街面截查他。',
            recentInteractionMemory: '刚被玩家按住盘问。',
            statusSummary: '紧张且愤懑。',
            bodyConditionSummary: '正常，但手心冒汗。',
            currentPlaceId: 'place_mongkok_street',
            currentSceneId: 'scene_patrol_interrogation',
            presence: 'present',
            visibility: 'player_known',
            importance: 55
          }
        ],
        actorMemories: [
          {
            actorId: 'npc_chen_zijian',
            text: '他记得玩家在游戏机中心外截查过他，并因此对玩家保持敌意。',
            importance: 65,
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const actorMemory = Object.values(next.memories).find((memory) => memory.text.includes('游戏机中心外截查'));

    expect(next.actors.npc_chen_zijian.interactionScore).toBe(0);
    expect(next.actors.npc_chen_zijian.recentInteractionMemory).toContain('游戏机中心外截查');
    expect(actorMemory).toMatchObject({
      kind: 'actor',
      relatedActorIds: ['npc_chen_zijian'],
      importance: 50
    });
    expect((next.storyLog.at(-1)?.writebackDiagnostics ?? []).some((issue) => issue.code === 'missing_actor_reference')).toBe(false);
  });

  it('keeps NPC aliases, call names, and opening-style traits when creating a new actor patch', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player meets a named street contact with a stable nickname.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_big_fai',
            name: '梁辉',
            englishName: 'Fai Leung',
            aliases: ['大辉', 'Big Fai'],
            callName: '辉哥',
            gender: 'male',
            computedAge: 32,
            visualAgeAnchor: '三十出头',
            currentIdentity: 'gang_member',
            publicIdentity: '蓝灯笼边缘人物',
            actualIdentitySummary: '和联胜外围跑腿，常在旺角夜场一带收风。',
            roleProfiles: {
              triad: {
                status: 'active',
                societyName: '和联胜',
                roleTitle: '外围跑腿',
                rankSummary: '未扎职，只替人传话。',
                territorySummary: '旺角夜场与后巷。',
                patronActorIds: [],
                peerActorIds: [],
                rivalActorIds: [],
                obligationSummary: '替上面的人传话和盯场。',
                riskSummary: '容易被上级牺牲。'
              }
            },
            organizationIds: ['org_wo_luen_shing'],
            positionSummary: '和联胜外围跑腿。',
            profileSummary: '有点虚张声势，但知道夜场消息。',
            appearance: '三十出头，瘦高，左眉有旧疤。',
            clothing: '花衬衫和廉价皮鞋。',
            equipment: ['打火机', '传呼机'],
            personality: '嘴硬、好面子，遇到警察会先试探。',
            speechStyle: '街头粤语口吻，喜欢用反问。',
            motivation: '在社团边缘混出一点位置。',
            longTermGoal: '得到扎职机会。',
            values: '面子、义气和现实利益。',
            attributes: { body: 52, action: 60, perception: 58, thinking: 45, negotiation: 55, will: 48 },
            activeTraits: [
              {
                traitId: 'trait_streetwise_runner',
                name: '街面跑腿',
                source: 'llm_generated',
                description: '熟悉夜场后巷和街头传话规矩。',
                effectSummary: '夜场、社团边缘和街面消息判断更稳定。',
                scopes: ['underworld', 'street'],
                visibility: 'player_known'
              }
            ],
            relationshipSummary: '刚认识玩家，知道玩家是警察。',
            attitudeTowardPlayer: '虚张声势但戒备。',
            interactionScore: 4,
            trustTendency: '不会主动交出上级名字。',
            entanglementSummary: '牵连旺角夜场、社团传话和街坊压力。',
            longTermMemorySummary: '记得哪些警察喜欢追问社团线索。',
            recentInteractionMemory: '第一次被玩家叫住盘问。',
            statusSummary: '强装镇定。',
            currentPlaceId: 'place_mong_kok_police_station',
            currentSceneId: 'scene_report_room',
            presence: 'present',
            visibility: 'player_known',
            importance: 62
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const actor = next.actors.npc_big_fai;

    expect(actor.aliases).toEqual(['大辉', 'Big Fai']);
    expect(actor.callName).toBe('辉哥');
    expect(actor.visualAgeAnchor).toBe('三十出头');
    expect(actor.organizationIds).toEqual(['org_wo_luen_shing']);
    expect(actor.activeTraits[0]).toMatchObject({
      traitId: 'trait_streetwise_runner',
      name: '街面跑腿',
      status: 'active'
    });
  });

  it('applies actor organization relations and syncs visible organization ids', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player learns a reporter has a steady TVB desk role.',
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            organizationRelations: [
              {
                organizationId: 'org_tvb',
                relationType: 'informal_contact',
                roleTitle: '采访联络',
                departmentOrUnit: '新闻部',
                summary: '玩家通过报案室认识一名无线电视新闻部联络人。',
                visibility: 'player_known',
                isPrimary: false
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.organizationIds).toContain('org_tvb');
    expect(next.actors.player.organizationRelations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId: 'org_tvb',
          relationType: 'informal_contact',
          roleTitle: '采访联络',
          departmentOrUnit: '新闻部',
          summary: '玩家通过报案室认识一名无线电视新闻部联络人。'
        })
      ])
    );
  });

  it('updates duplicate actor organization relations by organization, relation type, and role title', () => {
    const state = createInitialRuntimeState();
    const first = applyNarratorResponse(
      state,
      validateNarratorResponse({
        narrativeText: 'The player first records a loose TVB contact.',
        writeback: {
          actorPatches: [
            {
              actorId: 'player',
              organizationRelations: [
                {
                  organizationId: 'org_tvb',
                  relationType: 'informal_contact',
                  roleTitle: '采访联络',
                  summary: '只是知道有这样一条线。',
                  visibility: 'player_known'
                }
              ]
            }
          ]
        }
      })
    );
    const next = applyNarratorResponse(
      first,
      validateNarratorResponse({
        narrativeText: 'The contact becomes clearer after a follow-up call.',
        writeback: {
          actorPatches: [
            {
              actorId: 'player',
              organizationRelations: [
                {
                  organizationId: 'org_tvb',
                  relationType: 'informal_contact',
                  roleTitle: '采访联络',
                  departmentOrUnit: '新闻部',
                  summary: '无线新闻部有人愿意听玩家说明街面情况。',
                  visibility: 'player_known'
                }
              ]
            }
          ]
        }
      })
    );
    const relations = next.actors.player.organizationRelations.filter(
      (relation) =>
        relation.organizationId === 'org_tvb' &&
        relation.relationType === 'informal_contact' &&
        relation.roleTitle === '采访联络'
    );

    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({
      departmentOrUnit: '新闻部',
      summary: '无线新闻部有人愿意听玩家说明街面情况。'
    });
  });

  it('keeps hidden actor organization relations out of ordinary organization ids', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A covert contact is recorded as hidden relation data.',
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            organizationRelations: [
              {
                organizationId: 'org_icac',
                relationType: 'source',
                roleTitle: '秘密接触',
                summary: '玩家私下收到廉署人员试探，但这不是公开事实。',
                visibility: 'hidden'
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.organizationRelations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId: 'org_icac',
          relationType: 'source',
          visibility: 'hidden'
        })
      ])
    );
    expect(next.actors.player.organizationIds).not.toContain('org_icac');
  });

  it('drops bad actor organization relation items without dropping the actor patch', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'One good organization relation and one malformed relation are returned.',
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            name: '测试警员',
            organizationRelations: [
              {
                organizationId: 'org_tvb',
                relationType: 'informal_contact',
                roleTitle: '采访联络',
                summary: '玩家认识一名电视台新闻联系人。',
                visibility: 'player_known'
              },
              {
                organizationId: 'org_icac',
                summary: '缺少 relationType 的坏关系。'
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.name).toBe('测试警员');
    expect(next.actors.player.organizationIds).toContain('org_tvb');
    expect(next.actors.player.organizationRelations.some((relation) => relation.organizationId === 'org_icac')).toBe(false);
    expect(
      response.validationWarnings?.some(
        (warning) => warning.path.join('.') === 'writeback.actorPatches.0.organizationRelations.1.relationType'
      )
    ).toBe(true);
  });

  it('applies a developing private dossier incrementally without adding NPC vitals', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player meets a nightclub hostess who knows the local entertainment circuit.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_lily_ho',
            name: '何丽莲',
            englishName: 'Lily Ho',
            gender: 'female',
            birthDate: '1962-02-18',
            computedAge: 26,
            currentIdentity: 'civilian',
            publicIdentity: '夜总会公关',
            actualIdentitySummary: '尖沙咀夜总会公关，熟悉片场、酒吧和社团边缘人物。',
            roleProfiles: {
              civilian: {
                status: 'active',
                publicOccupation: '夜总会公关',
                communitySummary: '与娱乐圈、夜场和街面消息有联系。'
              }
            },
            positionSummary: '夜总会公关。',
            profileSummary: '精明、会观察警察反应的年轻女性。',
            appearance: '二十多岁，妆容精致，眼神警觉。',
            clothing: '深色连衣裙和短外套。',
            equipment: ['小手袋', '名片夹'],
            personality: '圆滑、戒备、懂得用沉默保护自己。',
            speechStyle: '轻快但留有余地的港式口吻。',
            motivation: '保住工作和熟客关系。',
            longTermGoal: '离开夜场，做一份更稳定的生意。',
            values: '自保、现实、重视人情债。',
            attributes: { body: 44, action: 55, perception: 70, thinking: 60, negotiation: 72, will: 58 },
            relationshipSummary: '刚认识玩家，知道玩家是警察。',
            attitudeTowardPlayer: '礼貌但戒备。',
            interactionScore: 8,
            trustTendency: '只愿意说不牵连自己的消息。',
            entanglementSummary: '可能牵连夜场、娱乐圈和社团人情。',
            longTermMemorySummary: '记得哪些警员会照规矩办事。',
            recentInteractionMemory: '第一次被玩家问起夜场消息。',
            statusSummary: '谨慎观察。',
            currentPlaceId: 'place_mong_kok_police_station',
            currentSceneId: 'scene_report_room',
            presence: 'present',
            visibility: 'player_known',
            importance: 65,
            femaleProfile: {
              birthday: '2月18日',
              addressToPlayer: '王Sir',
              relationshipNotes: '把玩家视作需要谨慎应对的警察。',
              publicIntimacyNotes: '公开场合保持距离，只用礼貌称呼。',
              appearanceDescription: '妆容精致，神情克制。',
              bodyDescription: '身形匀称，动作谨慎。',
              clothingStyle: '夜场工作服偏精致，但外套遮掩明显。',
              personalityCore: '现实、戒备，懂得在危险关系中留后路。',
              emotionalBoundary: '不轻易交出私人住址和熟客名单。',
              adultPrivateProfile: {
                enabled: true,
                ageConfirmedAdult: true,
                profileStatus: 'ready',
                womb: {
                  status: '未受孕',
                  cervixStatus: '紧闭',
                  records: []
                },
                partProfiles: {
                  胸部: { description: '乳房饱满柔软，乳晕色泽自然，乳头敏感。' },
                  小穴: { description: '阴唇紧致细嫩，穴口收敛，阴蒂敏感。' },
                  屁穴: { description: '臀缝紧窄，屁穴小而紧闭，周围皱褶细密。' }
                }
              }
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const actor = next.actors.npc_lily_ho;

    expect(actor.vitals).toBeUndefined();
    expect(actor.femaleProfile?.addressToPlayer).toBe('王Sir');
    expect(actor.femaleProfile?.adultPrivateProfile?.profileStatus).toBe('developing');
    expect(actor.femaleProfile?.adultPrivateProfile?.womb?.status).toBe('未受孕');
    expect(actor.femaleProfile?.adultPrivateProfile?.partProfiles?.胸部?.description).toBe('乳房饱满柔软，乳晕色泽自然，乳头敏感。');

    const followUp = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'Later interactions establish two additional durable private facts.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_lily_ho',
            femaleProfile: {
              adultPrivateProfile: {
                profileStatus: 'ready',
                fetishNotes: '已经确认她偏好带有掌控感的挑逗，但会主动说明边界。',
                sensitivePoints: '颈侧、乳尖与腰侧是已经明确表现出的敏感点。'
              }
            }
          }
        ]
      }
    });
    const matured = applyNarratorResponse(next, followUp);

    expect(matured.actors.npc_lily_ho.femaleProfile?.adultPrivateProfile?.profileStatus).toBe('ready');
    expect(matured.actors.npc_lily_ho.femaleProfile?.adultPrivateProfile?.partProfiles?.胸部?.description).toBe(
      '乳房饱满柔软，乳晕色泽自然，乳头敏感。'
    );
    expect(matured.actors.npc_lily_ho.femaleProfile?.adultPrivateProfile?.fetishNotes).toContain('掌控感');
  });

  it('accepts a cervix-only update for an existing private dossier without creating a new dossier', () => {
    const state = createInitialRuntimeState();
    const actorBase = {
      gender: 'female' as const,
      birthDate: '1962-03-08',
      computedAge: 26,
      currentIdentity: 'civilian' as const,
      publicIdentity: '市民',
      roleProfiles: {},
      positionSummary: '市民',
      profileSummary: '成年女性。',
      appearance: '成年女性。',
      clothing: '日常衣着。',
      personality: '谨慎。',
      speechStyle: '直接。',
      motivation: '维持生活。',
      longTermGoal: '生活安定。',
      values: '重视承诺。',
      visibility: 'player_known' as const
    };
    state.actors.npc_existing_private = createActorDefaults({
      ...actorBase,
      actorId: 'npc_existing_private',
      name: '已有档案人物',
      femaleProfile: {
        adultPrivateProfile: {
          enabled: true,
          ageConfirmedAdult: true,
          profileStatus: 'developing',
          womb: {
            status: '未受孕',
            cervixStatus: '紧闭',
            records: [{ date: '1988-09-10', description: '既有结构化记录。' }]
          }
        }
      }
    });
    state.actors.npc_without_private = createActorDefaults({
      ...actorBase,
      actorId: 'npc_without_private',
      name: '尚无档案人物'
    });

    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: '本回合只形成一项有剧情依据的短期身体变化。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_existing_private',
            femaleProfile: {
              adultPrivateProfile: {
                womb: {
                  cervixStatus: '本回合形成的短期状态'
                }
              }
            }
          },
          {
            actorId: 'npc_without_private',
            femaleProfile: {
              adultPrivateProfile: {
                womb: {
                  cervixStatus: '不应据此新建档案'
                }
              }
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const existingWomb = next.actors.npc_existing_private.femaleProfile?.adultPrivateProfile?.womb;

    expect(existingWomb?.status).toBe('未受孕');
    expect(existingWomb?.records).toEqual([{ date: '1988-09-10', description: '既有结构化记录。' }]);
    expect(existingWomb?.cervixStatus).toBe('本回合形成的短期状态');
    expect(existingWomb?.cervixStatusUpdatedAt).toEqual(state.time);
    expect(next.actors.npc_without_private.femaleProfile?.adultPrivateProfile).toBeUndefined();
  });

  it('does not create an adult private profile from adulthood or public female fields alone', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_may = createActorDefaults({
      actorId: 'npc_may',
      name: '周嘉敏',
      englishName: 'May Chow',
      gender: 'female',
      birthDate: '1965-02-14',
      computedAge: 23,
      currentIdentity: 'civilian',
      publicIdentity: '玩家女友',
      profileSummary: '在医院工作的年轻女性。',
      presence: 'mentioned',
      interactionScore: 80,
      importance: 85,
      visibility: 'player_known'
    });
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player remembers May waiting outside the station.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_may',
            femaleProfile: {
              birthday: '2月14日',
              addressToPlayer: '阿星',
              appearanceDescription: '笑起来眉眼弯弯。',
              relationshipNotes: '稳定女友，关心玩家夜班安全。'
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const profile = next.actors.npc_may?.femaleProfile;

    expect(profile?.addressToPlayer).toBe('阿星');
    expect(profile?.adultPrivateProfile).toBeUndefined();
  });

  it('rejects adult private profile text that leaks public biography or romance notes into NSFW fields', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_may = createActorDefaults({
      actorId: 'npc_may',
      name: '周嘉敏',
      englishName: 'May Chow',
      gender: 'female',
      birthDate: '1965-02-14',
      computedAge: 23,
      currentIdentity: 'civilian',
      publicIdentity: '玩家女友',
      profileSummary: '在医院工作的年轻女性。',
      presence: 'mentioned',
      interactionScore: 80,
      importance: 85,
      visibility: 'player_known'
    });
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The narrator writes a corrupted adult private profile.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_may',
            femaleProfile: {
              birthday: '2月14日',
              addressToPlayer: '阿星',
              appearanceDescription: '笑起来眉眼弯弯。',
              relationshipNotes: '稳定女友，关心玩家夜班安全。',
              adultPrivateProfile: {
                enabled: true,
                ageConfirmedAdult: true,
                profileStatus: 'ready',
                womb: {
                  status: '未受孕',
                  cervixStatus: '紧闭',
                  records: []
                },
                partProfiles: {
                  胸部: {
                    description:
                      '周嘉敏胸部轮廓柔和，面容清秀带点市井烟火气，经常帮家里做家务，非常关心男友的安全。'
                  },
                  小穴: {
                    description: '周嘉敏私处像隐秘甬道，肤色与体态相称，整体干净细腻。'
                  },
                  屁穴: {
                    description: '周嘉敏臀间肌肤细致，屁穴小而紧闭，和身形气质相称。'
                  }
                },
                fetishNotes:
                  '非常信任和爱慕周星星，周星星职级提升带来稳定收入，或者正式向她求婚。',
                sensitivePoints: '敏感点集中在颈侧、乳尖、腰侧、大腿内侧和坚硬巨物带来的压迫感。'
              }
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    expect(next.actors.npc_may?.femaleProfile?.adultPrivateProfile).toBeUndefined();
  });

  it('keeps public female profile but ignores adult private writeback for underage female NPCs', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    });
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player meets a teenage witness outside the station.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_teen_witness',
            name: '林小敏',
            englishName: 'Mandy Lam',
            gender: 'female',
            birthDate: '1973-01-01',
            computedAge: 15,
            currentIdentity: 'civilian',
            publicIdentity: '学生目击者',
            actualIdentitySummary: '住在附近的学生，偶然目击街角争执。',
            positionSummary: '学生目击者。',
            profileSummary: '紧张的少女目击者。',
            appearance: '十五岁，校服整齐，神情害怕。',
            clothing: '中学校服。',
            equipment: ['书包'],
            personality: '紧张、怕惹麻烦。',
            speechStyle: '小声、断续。',
            motivation: '尽快回家。',
            longTermGoal: '避免被卷进麻烦。',
            values: '听家人话，害怕陌生成年人。',
            attributes: { body: 35, action: 48, perception: 60, thinking: 45, negotiation: 30, will: 35 },
            relationshipSummary: '第一次见到玩家。',
            attitudeTowardPlayer: '害怕但愿意回答简单问题。',
            interactionScore: 1,
            trustTendency: '高度戒备。',
            entanglementSummary: '可能牵连街角争执。',
            longTermMemorySummary: '记得自己看到过几个人在街角吵架。',
            recentInteractionMemory: '刚被玩家安抚。',
            statusSummary: '惊慌。',
            presence: 'present',
            visibility: 'player_known',
            importance: 55,
            femaleProfile: {
              relationshipNotes: '未成年目击者，只能保留普通人物档案。',
              personalityCore: '害怕、依赖家人。',
              adultPrivateProfile: {
                enabled: true,
                ageConfirmedAdult: true,
                summary: '这个字段必须被本地门禁忽略。'
              }
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const actor = next.actors.npc_teen_witness;

    expect(actor.femaleProfile?.relationshipNotes).toContain('未成年目击者');
    expect(actor.femaleProfile?.adultPrivateProfile).toBeUndefined();
  });

  it('accepts a minimum-valid actor without interpreting a relationship-like name', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A triad underling watches the player from across the street.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_sang_biu_underling',
            name: '丧彪的手下',
            gender: 'male',
            birthDate: '1960-05-01',
            currentIdentity: 'triad',
            publicIdentity: '社团边缘成员',
            actualIdentitySummary: '和联胜丧彪派出的收数小弟。',
            profileSummary: 'A young triad underling watching the player family shop.',
            appearance: 'Long hair and a cheap leather jacket.',
            personality: 'Aggressive but nervous around uniformed police.',
            speechStyle: 'Short, provocative street slang.',
            motivation: 'Warn the shop owner without drawing police attention.',
            relationshipSummary: 'He knows the player only as the shop owner son in uniform.',
            attitudeTowardPlayer: 'Provocative and wary.',
            trustTendency: 'Hostile and evasive.',
            statusSummary: 'Watching from across the street.',
            presence: 'present'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_sang_biu_underling).toMatchObject({
      name: '丧彪的手下',
      currentIdentity: 'gang_member',
      publicIdentity: '社团边缘成员'
    });
    expect((next.storyLog.at(-1)?.writebackDiagnostics ?? []).some((issue) => issue.code === 'invalid_actor_name')).toBe(
      false
    );
  });

  it('creates a lean NPC when it satisfies every core creation field', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A named street contact appears but the model only gives a thin patch.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_ah_chuen',
            name: 'Ah Chuen',
            gender: 'male',
            computedAge: 31,
            currentIdentity: 'civilian',
            publicIdentity: 'Street contact'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_ah_chuen).toMatchObject({
      name: 'Ah Chuen',
      gender: 'male',
      computedAge: 31,
      currentIdentity: 'civilian',
      publicIdentity: 'Street contact',
      personality: '',
      interactionScore: 0,
      importance: 50
    });
  });

  it('rejects a new NPC when the minimum identity contract is missing', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A name is heard, but no stable identity is available yet.',
      writeback: {
        actorPatches: [{ actorId: 'npc_ah_ming', name: '阿明', gender: 'male', computedAge: 27 }]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_ah_ming).toBeUndefined();
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'incomplete_new_actor_patch',
        path: ['writeback', 'actorPatches', 0]
      })
    );
  });

  it('rejects a new NPC without an age anchor instead of filling a default age', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A named shop assistant appears, but the model omitted all age information.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_shop_assistant_no_age',
            name: '阿杰',
            gender: 'male',
            currentIdentity: 'civilian',
            publicIdentity: '药房店员'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_shop_assistant_no_age).toBeUndefined();
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'incomplete_new_actor_patch',
        message: expect.stringContaining('birthDate|computedAge')
      })
    );
  });

  it('rejects a new NPC without an explicit gender instead of accepting unknown', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A contact is mentioned without a confirmed gender.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_contact_unknown_gender',
            name: '阿岚',
            gender: 'unknown',
            computedAge: 29,
            currentIdentity: 'civilian',
            publicIdentity: '街坊联络人'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_contact_unknown_gender).toBeUndefined();
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'incomplete_new_actor_patch',
        message: expect.stringContaining('gender')
      })
    );
  });

  it('rejects a future birth date when no valid computed age is available', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A contact is mentioned with an impossible future birth date.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_contact_future_birth',
            name: '阿伦',
            gender: 'male',
            birthDate: '2099-01-01',
            currentIdentity: 'civilian',
            publicIdentity: '运输公司文员'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_contact_future_birth).toBeUndefined();
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'incomplete_new_actor_patch',
        message: expect.stringContaining('birthDate|computedAge')
      })
    );
  });

  it('does not merge an invented actorId into an existing NPC by name alone', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_opening_0002 = {
      ...state.actors.player,
      actorId: 'actor_opening_0002',
      name: 'Chan Keung',
      englishName: 'Keung',
      currentIdentity: 'police',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId,
      presence: 'present',
      longTermMemorySummary: 'He has mentored the player for three months.',
      recentInteractionMemory: 'He went out to buy late-night snacks.',
      keyMemories: [],
      vitals: undefined
    };

    const response = validateNarratorResponse({
      narrativeText: 'Chan Keung teaches the player an old street lesson.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_keung_4921',
            name: 'Chan Keung',
            recentInteractionMemory: 'He warned the player not to casually break the street balance.',
            statusSummary: 'Eating fish balls while teaching the rookie.'
          }
        ],
        actorMemories: [
          {
            actorId: 'npc_keung_4921',
            text: 'He remembers warning the player about street retaliation.',
            importance: 70
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.actor_opening_0002.recentInteractionMemory).toBe('He went out to buy late-night snacks.');
    expect(next.actors.actor_opening_0002.statusSummary).not.toContain('fish balls');
    expect(next.actors.actor_opening_0002.keyMemories).toHaveLength(0);
    expect(Object.values(next.memories).some((memory) => memory.text.includes('street retaliation'))).toBe(false);
    expect(next.actors.npc_keung_4921).toBeUndefined();
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'incomplete_new_actor_patch',
        path: ['writeback', 'actorPatches', 0]
      })
    );
    expect(next.storyLog.at(-1)?.writebackDiagnostics?.some((issue) => issue.code === 'remapped_actor_reference')).toBe(
      false
    );
  });

  it('uses actorId as the sole runtime reference instead of guessing identity from names', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_opening_0003 = {
      ...state.actors.player,
      actorId: 'actor_opening_0003',
      name: 'May Lan',
      englishName: 'May Lan',
      aliases: ['Auntie May'],
      gender: 'female',
      birthDate: '1942-03-15',
      computedAge: 52,
      visualAgeAnchor: 'early fifties',
      currentIdentity: 'civilian',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId,
      presence: 'present',
      profileSummary: 'A diner owner who knows the neighborhood.',
      recentInteractionMemory: 'She complained about night noise near the stall.',
      interactionScore: 0,
      keyMemories: [],
      vitals: undefined
    };
    state.actors.actor_ho_001 = {
      ...state.actors.player,
      actorId: 'actor_ho_001',
      name: 'Ho Ka Keung',
      englishName: 'Ho Ka Keung',
      aliases: ['Ah Ho'],
      gender: 'male',
      computedAge: 22,
      currentIdentity: 'civilian',
      currentPlaceId: 'place_mongkok_street',
      currentSceneId: 'scene_patrol_interrogation',
      presence: 'present',
      profileSummary: 'A young man loitering near the arcade.',
      recentInteractionMemory: 'He was stopped by the player on patrol.',
      interactionScore: 0,
      keyMemories: [],
      vitals: undefined
    };

    const response = validateNarratorResponse({
      narrativeText: 'Ho Ka Keung gives the player a reluctant answer.',
      writeback: {
        actorPatches: [
          {
            actorId: 'actor_opening_0003',
            name: 'Ho Ka Keung',
            englishName: 'A Ho',
            currentIdentity: 'gang_member',
            recentInteractionMemory: 'He admitted he was waiting near the arcade for a gang message.',
            interactionScore: 18,
            statusSummary: 'Nervous and cooperative.'
          }
        ],
        actorMemories: [
          {
            actorId: 'actor_opening_0003',
            actorName: 'Ho Ka Keung',
            text: 'He remembers being pressured by the player during the patrol stop.',
            importance: 70
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.actor_opening_0003.name).toBe('Ho Ka Keung');
    expect(next.actors.actor_opening_0003.aliases).toEqual(['Auntie May']);
    expect(next.actors.actor_opening_0003.birthDate).toBe('1942-03-15');
    expect(next.actors.actor_opening_0003.currentIdentity).toBe('gang_member');
    expect(next.actors.actor_opening_0003.statusSummary).toContain('cooperative');
    expect(next.actors.actor_opening_0003.interactionScore).toBe(18);
    expect(next.actors.actor_ho_001.statusSummary).not.toContain('cooperative');
    expect(next.actors.actor_ho_001.interactionScore).not.toBe(18);
    expect(next.actors.actor_ho_001.keyMemories).toHaveLength(0);
    expect(
      Object.values(next.memories).some(
        (memory) => memory.relatedActorIds.includes('actor_opening_0003') && memory.text.includes('patrol stop')
      )
    ).toBe(true);
    expect((next.storyLog.at(-1)?.writebackDiagnostics ?? []).some((issue) => issue.code === 'conflicting_actor_identity')).toBe(
      false
    );
    expect((next.storyLog.at(-1)?.writebackDiagnostics ?? []).some((issue) => issue.code === 'ambiguous_actor_reference')).toBe(
      false
    );
    expect((next.storyLog.at(-1)?.writebackDiagnostics ?? []).some((issue) => issue.code === 'remapped_actor_reference')).toBe(
      false
    );
  });

  it('does not classify a new actor name with local semantic rules', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A street youth known only as Ah Keung appears.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_thug_ah_keung',
            name: '阿强',
            gender: 'male',
            computedAge: 22,
            currentIdentity: 'gang_member',
            publicIdentity: '街头青年',
            actualIdentitySummary: '在外区活动的社团外围青年。',
            positionSummary: '外围跑腿。',
            profileSummary: '对警察戒备，遇到压力容易退缩。',
            appearance: '二十出头，短发，身形偏瘦。',
            clothing: '旧夹克和牛仔裤。',
            personality: '虚张声势，胆量不足。',
            speechStyle: '街头口吻，回答简短。',
            motivation: '避免被捕。',
            longTermGoal: '在社团里混到稳定位置。',
            values: '面子和自保。',
            relationshipSummary: '刚被玩家接触。',
            attitudeTowardPlayer: '畏惧和戒备。',
            interactionScore: 10,
            trustTendency: '不会轻易透露上线。',
            entanglementSummary: '与外区街头社团有联系。',
            longTermMemorySummary: '记得曾被警察盘问。',
            recentInteractionMemory: '第一次被玩家截停。',
            statusSummary: '紧张。',
            presence: 'present',
            visibility: 'player_known',
            importance: 35,
            attributes: { body: 42, action: 48, perception: 38, thinking: 34, negotiation: 32, will: 30 }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_thug_ah_keung?.name).toBe('阿强');
    expect(
      (next.storyLog.at(-1)?.writebackDiagnostics ?? []).some((issue) => issue.code?.includes('canonical') === true)
    ).toBe(false);
    expect(
      (next.storyLog.at(-1)?.writebackDiagnostics ?? []).some((issue) => issue.code?.includes('nickname') === true)
    ).toBe(false);
  });

  it('stores actor memory writeback only in the unified local memory ledger', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_opening_0002 = {
      ...state.actors.player,
      actorId: 'actor_opening_0002',
      name: 'Chan Keung',
      englishName: 'Keung Chan',
      currentIdentity: 'police',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId,
      presence: 'present',
      keyMemories: [],
      vitals: undefined
    };

    const response = validateNarratorResponse({
      narrativeText: 'Chan Keung remembers a useful street lesson.',
      writeback: {
        actorMemories: [
          {
            actorId: 'actor_opening_0002',
            text: 'He remembers teaching the player how to read a tea stall rumor.',
            importance: 72,
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const localMemory = Object.values(next.memories).find((memory) =>
      memory.text.includes('tea stall rumor')
    );

    expect(next.actors.actor_opening_0002.keyMemories).toHaveLength(0);
    expect(next.actors.actor_opening_0002.recentInteractionMemory).toContain('tea stall rumor');
    expect(localMemory).toMatchObject({
      kind: 'actor',
      text: 'He remembers teaching the player how to read a tea stall rumor.',
      relatedActorIds: ['actor_opening_0002'],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      relatedTurnId: 'turn_0001',
      importance: 50,
      visibility: 'player_known',
      certainty: 'claim',
      embeddingText: 'He remembers teaching the player how to read a tea stall rumor.'
    });
  });

  it('stores at most one unified actor memory per actor and softly drops extra same-turn memories', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_peer = {
      ...state.actors.player,
      actorId: 'actor_peer',
      name: 'Peer Officer'
    };
    const duplicateText = 'He remembers the player warning him about the same alley.';
    const distinctText = 'He remembers the player asking a separate question about the mahjong shop.';
    const response = validateNarratorResponse({
      narrativeText: 'A turn returns both legacy and current actor memory fields.',
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            keyMemories: [
              {
                text: duplicateText,
                importance: 55,
                visibility: 'player_known'
              }
            ]
          }
        ],
        actorMemories: [
          {
            actorId: 'player',
            text: duplicateText,
            importance: 70,
            visibility: 'player_known'
          },
          {
            actorId: 'player',
            text: distinctText,
            importance: 60,
            visibility: 'player_known'
          },
          {
            actorId: 'actor_peer',
            text: duplicateText,
            importance: 60,
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const memories = Object.values(next.memories);

    expect(
      memories.filter((memory) => memory.relatedActorIds.includes('player') && memory.text === duplicateText)
    ).toHaveLength(1);
    expect(memories.find((memory) => memory.relatedActorIds.includes('player') && memory.text === duplicateText)?.importance).toBe(50);
    expect(
      memories.filter((memory) => memory.relatedActorIds.includes('player') && memory.text === distinctText)
    ).toHaveLength(0);
    expect(
      memories.filter((memory) => memory.relatedActorIds.includes('actor_peer') && memory.text === duplicateText)
    ).toHaveLength(1);
    expect(
      (next.storyLog.at(-1)?.writebackDiagnostics ?? []).filter((issue) => issue.code === 'extra_actor_memory_ignored')
    ).toHaveLength(2);
  });

  it('treats empty optional actor role profiles as omitted in writeback patches', () => {
    const response = validateNarratorResponse({
      narrativeText: 'The player meets a police constable who has no gang or civilian profile.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_constable_lam',
            name: 'Lam',
            roleProfiles: {
              police: {
                rank: 'Constable',
                department: 'Uniform Branch'
              },
              triad: {
                societyName: '',
                roleTitle: '',
                territorySummary: ''
              },
              civilian: {
                publicOccupation: ''
              }
            }
          }
        ]
      }
    });

    const profiles = response.writeback.actorPatches[0]?.roleProfiles;

    expect(profiles?.police?.rank).toBe('Constable');
    expect(profiles?.triad).toBeUndefined();
    expect(profiles?.civilian).toBeUndefined();
  });

  it('normalizes common human labels for actor current identity in writeback patches', () => {
    const response = validateNarratorResponse({
      narrativeText: 'The player identifies several people around the street corner.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_snake_ming',
            name: 'Snake Ming',
            currentIdentity: 'triad'
          },
          {
            actorId: 'npc_shop_owner',
            name: 'Shop Owner',
            currentIdentity: '市民'
          },
          {
            actorId: 'npc_pc_chan',
            name: 'Chan',
            currentIdentity: '警员'
          },
          {
            actorId: 'npc_unknown',
            name: 'Unknown Man',
            currentIdentity: 'unknown'
          }
        ]
      }
    });

    expect(response.writeback.actorPatches[0]?.currentIdentity).toBe('gang_member');
    expect(response.writeback.actorPatches[1]?.currentIdentity).toBe('civilian');
    expect(response.writeback.actorPatches[2]?.currentIdentity).toBe('police');
    expect(response.writeback.actorPatches[3]?.currentIdentity).toBeUndefined();
  });

  it('keeps valid response content when one writeback item is invalid', () => {
    const response = validateNarratorResponse({
      narrativeText: 'The player watches a nervous man leave the tea stall.',
      suggestedActions: ['Follow him', 'Ask the shopkeeper what happened'],
      timePatch: { elapsedMinutes: 8, reason: 'Observed the scene and asked a brief question' },
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_invalid',
            name: 'Invalid Person',
            gender: 'robot',
            currentIdentity: 'civilian'
          },
          {
            actorId: 'npc_shopkeeper',
            name: 'Shopkeeper',
            gender: 'male',
            currentIdentity: 'civilian',
            positionSummary: 'A tea stall owner.',
            profileSummary: 'A cautious shopkeeper who hears street talk.'
          }
        ],
        memories: [
          {
            text: 'A nervous man left the tea stall after seeing the player.',
            importance: 55
          }
        ]
      }
    });

    expect(response.narrativeText).toContain('tea stall');
    expect(response.suggestedActions).toEqual(['Follow him', 'Ask the shopkeeper what happened']);
    expect(response.timePatch?.elapsedMinutes).toBe(8);
    expect(response.writeback.actorPatches).toHaveLength(1);
    expect(response.writeback.actorPatches[0]?.actorId).toBe('npc_shopkeeper');
    expect(response.writeback.memories).toHaveLength(1);
    expect(response.validationWarnings?.[0]).toMatchObject({
      path: ['writeback', 'actorPatches', 0, 'gender']
    });
  });

  it('applies and clamps player vitals patches from structured writeback', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player runs through the alley and catches his breath.',
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            vitalsPatch: {
              healthDelta: -8,
              staminaDelta: -35,
              conditionSummary: '左肩擦伤，刚跑完一段路，呼吸还没稳。'
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.vitals.health).toBe(92);
    expect(next.player.vitals.stamina).toBe(65);
    expect(next.player.vitals.conditionSummary).toContain('左肩擦伤');
    expect(next.player.vitals.conditionLifecycle).toEqual({
      persistence: 'unknown',
      establishedAt: next.time,
      lastReviewedAt: next.time
    });
    expect(next.actors.player.vitals).toEqual(next.player.vitals);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'player_vitals_lifecycle_updated' })
    );
  });

  it('applies writeback v1.5 player patches for economy, home, clothing, equipment, and reputation', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player comes home with a new impression left in the neighborhood.',
      writeback: {
        playerPatch: {
          economy: {
            moneyDelta: 500,
            monthlyPressureSet: 70,
            financeSummary: '刚收了薪水，但家里接下来还要交租和还债。'
          },
          homeBase: {
            placeId: 'place_sham_shui_po_tenement_room',
            placeName: '深水埗唐楼住处',
            housingType: '唐楼分租房',
            summary: '一间靠近楼梯口的狭窄分租房。',
            householdSummary: '母亲同住，弟弟偶尔回来借钱。'
          },
          clothing: {
            currentSummary: '夏季军装制服，皮带束得很紧。',
            mode: 'duty_uniform',
            lastChangedReason: '玩家明确换上军装制服。'
          },
          equipment: ['点三八左轮', '木制警棍', '手提无线电'],
          reputation: {
            notorietyDelta: 25,
            overallReputationDelta: 8,
            summary: '旺角附近开始有人知道他肯听人说话，但警队内部仍在观察。',
            reason: '本回合玩家在街坊面前处理得体。',
            circlePatches: [
              {
                circle: 'neighborhoodMedia',
                visibilityDelta: 20,
                standingDelta: 15,
                summary: '附近街坊开始知道他肯听人说话。',
                reason: '玩家耐心听完投诉。'
              },
              {
                circle: 'police',
                standingSet: -10,
                summary: '部分上级觉得他还不太服管。',
                reason: '他没有完全按上级期待的方式收口。'
              }
            ]
          }
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writebackVersion).toBe('1.5');
    expect(next.player.economy.bankBalance).toBe(500);
    expect(next.player.economy.monthlyPressure).toBe(70);
    expect(next.player.economy.financeSummary).toContain('交租');
    expect(next.player.homeBase.placeId).toBe('place_sham_shui_po_tenement_room');
    expect(next.player.homeBase.householdSummary).toContain('弟弟');
    expect(next.player.clothing).toContain('夏季军装');
    expect(next.player.equipment).toEqual(['点三八左轮', '木制警棍', '手提无线电']);
    expect(next.actors.player.clothing).toBe(next.player.clothing);
    expect(next.actors.player.equipment).toEqual(next.player.equipment);
    expect(next.player.reputation.notoriety).toBe(25);
    expect(next.player.reputation.overallReputation).toBe(2);
    expect(next.player.reputation.summary).toContain('旺角附近');
    expect(next.player.reputation.circles.neighborhoodMedia.visibility).toBe(20);
    expect(next.player.reputation.circles.neighborhoodMedia.standing).toBe(15);
    expect(next.player.reputation.circles.police.standing).toBe(-10);
    expect(next.player.reputation.logs).toHaveLength(3);
    expect(next.player.reputation.logs[2]).toMatchObject({
      kind: 'overall',
      notorietyDelta: 25,
      overallReputationDelta: 2
    });
  });

  it('derives overall reputation when the model only returns a valid circle change', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    const response = validateNarratorResponse({
      narrativeText: '街坊开始认可玩家处理纠纷的方式。',
      writeback: {
        playerPatch: {
          reputation: {
            summary: '附近街坊开始形成正面印象。',
            reason: '玩家公开化解了一次纠纷。',
            circlePatches: [
              {
                circle: 'neighborhoodMedia',
                visibilitySet: 100,
                standingSet: 50,
                summary: '附近街坊认为玩家处事公道。',
                reason: '玩家在多人见证下化解纠纷。'
              }
            ]
          }
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.reputation.circles.neighborhoodMedia).toMatchObject({
      visibility: 100,
      standing: 50
    });
    expect(next.player.reputation.overallReputation).toBe(25);
    expect(next.player.reputation.logs).toContainEqual(
      expect.objectContaining({
        kind: 'overall',
        overallReputationDelta: 25,
        reason: '玩家公开化解了一次纠纷。'
      })
    );
  });

  it('uses local circle aggregation instead of a model-proposed overall score', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    const response = validateNarratorResponse({
      narrativeText: '只有少量商业人士对玩家留下好印象。',
      writeback: {
        playerPatch: {
          reputation: {
            overallReputationSet: 90,
            summary: '小范围商业评价有所改善。',
            reason: '一场小型会面顺利结束。',
            circlePatches: [
              {
                circle: 'business',
                visibilitySet: 10,
                standingSet: 50,
                summary: '少量商人觉得玩家可靠。',
                reason: '玩家兑现了一次小型会面承诺。'
              }
            ]
          }
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.reputation.overallReputation).toBe(5);
    expect(next.player.reputation.overallReputation).not.toBe(90);
  });

  it('preserves valid circle patches when an overall reputation field is malformed', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    const response = validateNarratorResponse({
      narrativeText: '警队内部评价出现变化。',
      writeback: {
        playerPatch: {
          reputation: {
            overallReputationDelta: '明显上升',
            summary: '警队内部开始认可玩家。',
            reason: '玩家完成了一项可靠工作。',
            circlePatches: [
              {
                circle: 'police',
                visibilitySet: 100,
                standingSet: 40,
                summary: '同僚开始认可玩家的可靠性。',
                reason: '本回合工作得到同僚确认。'
              }
            ]
          }
        }
      }
    });

    expect(response.writeback.playerPatch?.reputation?.overallReputationDelta).toBeUndefined();
    expect(response.writeback.playerPatch?.reputation?.circlePatches).toHaveLength(1);

    const next = applyNarratorResponse(state, response);
    expect(next.player.reputation.circles.police.standing).toBe(40);
    expect(next.player.reputation.overallReputation).toBe(20);
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'playerPatch', 'reputation', 'overallReputationDelta']
      })
    );
  });

  it('ignores reputation patches without both summary and reason', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'Ordinary talk should not change reputation without clear audit fields.',
      writeback: {
        playerPatch: {
          reputation: {
            notorietyDelta: 30,
            overallReputationDelta: -10,
            summary: 'Missing reason should not apply.',
            circlePatches: [
              {
                circle: 'police',
                visibilityDelta: 20,
                standingDelta: -5,
                reason: 'Missing summary should not apply.'
              },
              {
                circle: 'neighborhoodMedia',
                visibilityDelta: 15,
                standingDelta: -10,
                summary: 'Missing reason should not apply.'
              },
              {
                circle: 'business',
                visibilityDelta: 12,
                standingDelta: 4,
                summary: 'Shopkeepers appreciate his restraint.',
                reason: 'He calmed a dispute without embarrassing the shop.'
              }
            ]
          }
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.reputation.notoriety).toBe(state.player.reputation.notoriety);
    expect(next.player.reputation.overallReputation).toBe(state.player.reputation.overallReputation);
    expect(next.player.reputation.circles.police.visibility).toBe(state.player.reputation.circles.police.visibility);
    expect(next.player.reputation.circles.neighborhoodMedia.visibility).toBe(
      state.player.reputation.circles.neighborhoodMedia.visibility
    );
    expect(next.player.reputation.circles.business.visibility).toBe(12);
    expect(next.player.reputation.circles.business.standing).toBe(4);
    expect(next.player.reputation.logs).toHaveLength(1);
    expect(next.player.reputation.logs[0]).toMatchObject({ kind: 'circle', circle: 'business' });
  });

  it('applies assetPatch upserts and removals as structured item ownership state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player keeps a watch and an old rental room becomes relevant.',
      writeback: {
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_gold_watch_001',
              category: 'valuable',
              name: 'Gold watch',
              summary: 'A gold watch received from a nightclub owner after closing time.',
              detail: 'The source is socially risky, but the item is already in the player owned property list.',
              evidence: {
                caseId: 'case_nightclub_fight',
                caseTitle: 'Nightclub fight',
                summary: 'The watch may connect the nightclub owner to the later complaint.',
                disputed: true,
                disputeSummary: 'Its relevance is disputed because it was given before the complaint was filed.'
              }
            },
            {
              itemId: 'asset_home_sham_shui_po_room',
              category: 'fixedAsset',
              name: 'Sham Shui Po rented room',
              summary: 'A cramped rented room used as the player home.',
              fixedAssetType: 'residence',
              holdingRelation: 'rented',
              primaryUse: 'home',
              locationSummary: 'A subdivided room in Sham Shui Po.',
              ownershipSummary: 'Rented under a verbal arrangement with the landlord.',
              accessSummary: 'The player can return there unless family or landlord pressure changes it.'
            },
            {
              itemId: 'asset_motorcycle_001',
              category: 'vehicle',
              name: 'Borrowed motorcycle',
              summary: 'A motorcycle sometimes borrowed from a cousin.',
              vehicleType: 'motorcycle',
              holdingRelation: 'borrowed',
              condition: 'usable',
              locationSummary: 'Usually parked near the family building.',
              accessSummary: 'Available only when the cousin is not using it.',
              mobilityProfile: {
                mode: 'motorcycle',
                timeMultiplier: 0.7,
                availabilitySummary: 'Fast for short urban movement, but not always available.'
              }
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.assets.items.asset_gold_watch_001).toMatchObject({
      category: 'valuable',
      name: 'Gold watch',
      evidence: {
        caseId: 'case_nightclub_fight',
        disputed: true
      }
    });
    expect(next.assets.items.asset_home_sham_shui_po_room).toMatchObject({
      category: 'fixedAsset',
      fixedAssetType: 'residence',
      holdingRelation: 'rented'
    });
    expect(next.assets.items.asset_motorcycle_001).toMatchObject({
      category: 'vehicle',
      vehicleType: 'motorcycle',
      mobilityProfile: {
        mode: 'motorcycle',
        timeMultiplier: 0.7
      }
    });

    const removeResponse = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player hands the gold watch to the case file.',
      writeback: {
        assetPatch: {
          removeItems: [
            {
              itemId: 'asset_gold_watch_001',
              reason: 'Moved into the case material list.',
              movedToCaseId: 'case_nightclub_fight'
            }
          ]
        }
      }
    });
    const afterRemove = applyNarratorResponse(next, removeResponse);

    expect(afterRemove.assets.items.asset_gold_watch_001).toBeUndefined();
    expect(afterRemove.assets.items.asset_home_sham_shui_po_room).toBeDefined();
  });

  it('keeps spendable cash in finance while preserving cheque-like instruments as items', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: '玩家收下五千港元现金和一张尚未兑现的银行本票。',
      writeback: {
        financePatch: {
          cashDelta: 5_000,
          reason: '收到现金报酬。'
        },
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_cash_reward',
              category: 'valuable',
              name: '5000港元现金',
              summary: '刚收到的一笔现金报酬。'
            },
            {
              itemId: 'asset_bank_draft',
              category: 'document',
              name: '五千港元银行本票',
              summary: '尚未兑现的银行本票，可作为凭据保留。'
            }
          ],
          equippedItemIds: ['asset_cash_reward']
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.assetPatch?.upsertItems.map((item) => item.itemId)).toEqual([
      'asset_bank_draft'
    ]);
    expect(response.writeback.assetPatch?.equippedItemIds).toEqual([]);
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({
        code: 'cash_asset_rejected',
        path: ['writeback', 'assetPatch', 'upsertItems', 'asset_cash_reward']
      })
    );
    expect(next.finance.cashOnHand).toBe(state.finance.cashOnHand + 5_000);
    expect(next.assets.items.asset_cash_reward).toBeUndefined();
    expect(next.assets.items.asset_bank_draft).toBeDefined();
  });

  it('uses structured equipped item ids as the equipment source of truth', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: '玩家把警棍和对讲机挂回执勤腰带。',
      writeback: {
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_baton',
              category: 'equipment',
              name: '警棍',
              summary: '执勤使用的标准警棍。'
            },
            {
              itemId: 'asset_radio',
              category: 'equipment',
              name: '对讲机',
              summary: '用于当值联络的警用对讲机。'
            }
          ],
          equippedItemIds: ['asset_baton', 'asset_radio']
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.assets.equippedItemIds).toEqual(['asset_baton', 'asset_radio']);
    expect(next.player.equipment).toEqual(['警棍', '对讲机']);
    expect(next.actors.player.equipment).toEqual(['警棍', '对讲机']);
  });

  it('does not manufacture item records from legacy equipment display names', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: '玩家口头确认随身带着警棍和对讲机。',
      writeback: {
        playerPatch: {
          equipment: ['警棍', '对讲机']
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.equipment).toEqual(['警棍', '对讲机']);
    expect(next.assets.equippedItemIds).toEqual([]);
    expect(Object.keys(next.assets.items)).toEqual([]);
  });

  it('mirrors asset evidence links into the case evidence store', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The pager is kept as material for an intimidation case.',
      writeback: {
        casePatches: [
          {
            caseId: 'case_pager_intimidation',
            title: 'Pager intimidation',
            caseType: 'intimidation',
            status: 'investigating',
            playerRole: 'assist',
            summary: 'A pager may connect the intimidation calls to a known debt collector.',
            currentFocus: 'Preserve the pager and match the callback numbers.',
            playerVisibleProgress: 'The player has retained the pager.',
            internalProgressSummary: 'The case still needs number verification.',
            relatedActorIds: ['player'],
            relatedPlaceIds: [state.location.currentPlaceId]
          }
        ],
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_pager_sun',
              category: 'equipment',
              name: 'Motorola pager',
              summary: 'A pager taken from Sun Yiu-fai after the intimidation report.',
              relatedActorIds: ['player'],
              relatedCaseIds: ['case_pager_intimidation'],
              relatedPlaceIds: [state.location.currentPlaceId],
              evidence: {
                caseId: 'case_pager_intimidation',
                caseTitle: 'Pager intimidation',
                summary: 'The pager directly links Sun Yiu-fai to the callback number used in the threat.',
                disputed: false
              }
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);
    const evidenceId = 'evidence_asset_asset_pager_sun';

    expect(next.caseEvidence[evidenceId]).toMatchObject({
      evidenceId,
      caseId: 'case_pager_intimidation',
      title: 'Motorola pager',
      evidenceType: 'physical',
      sourceSummary: '物品与资产：Motorola pager',
      summary: 'The pager directly links Sun Yiu-fai to the callback number used in the threat.',
      relatedAssetItemId: 'asset_pager_sun',
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId]
    });
    expect(next.cases.case_pager_intimidation.evidenceIds).toContain(evidenceId);
  });

  it('tracks special clothing as wearable owned property without using equipment slots', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        asset_old_baton: {
          itemId: 'asset_old_baton',
          category: 'equipment',
          name: 'Old baton',
          summary: 'A standard baton.',
          relatedActorIds: [],
          relatedCaseIds: [],
          relatedPlaceIds: [],
          importance: 10,
          visibility: 'player_known'
        }
      },
      equippedItemIds: ['asset_old_baton']
    };
    state.player.equipment = ['Old baton'];
    state.actors.player.equipment = ['Old baton'];
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player changes before going to dinner.',
      writeback: {
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_girlfriend_sweater',
              category: 'general',
              name: 'Girlfriend sweater',
              summary: 'A dark wool sweater the player keeps at home.',
              detail: 'It is meaningful because May bought it after the first month together.',
              relatedActorIds: ['npc_may'],
              relatedCaseIds: [],
              relatedPlaceIds: [],
              importance: 25,
              visibility: 'player_known',
              wearable: {
                wearSummary: 'Dark wool sweater from May.',
                significance: 'May bought it for the player, so wearing it can affect intimate and social scenes.'
              }
            }
          ]
        },
        playerPatch: {
          clothing: {
            currentSummary: 'Dark wool sweater from May, plain trousers, off-duty shoes.',
            mode: 'special',
            sourceItemId: 'asset_girlfriend_sweater',
            sourceItemSignificance: 'May bought it for the player before this date.',
            lastChangedReason: 'The player explicitly wore it to meet May.'
          }
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.assets.items.asset_girlfriend_sweater).toMatchObject({
      category: 'general',
      name: 'Girlfriend sweater',
      wearable: {
        wearSummary: 'Dark wool sweater from May.',
        significance: 'May bought it for the player, so wearing it can affect intimate and social scenes.'
      }
    });
    expect(next.player.clothing).toBe('Dark wool sweater from May, plain trousers, off-duty shoes.');
    expect((next.player as any).clothingState).toMatchObject({
      currentSummary: 'Dark wool sweater from May, plain trousers, off-duty shoes.',
      mode: 'special',
      sourceItemId: 'asset_girlfriend_sweater',
      sourceItemSignificance: 'May bought it for the player before this date.',
      lastChangedReason: 'The player explicitly wore it to meet May.'
    });
    expect((next.player as any).clothingState.lastChangedAt).toEqual(next.time);
    expect(next.actors.player.clothing).toBe(next.player.clothing);
    expect(next.player.equipment).toEqual(['Old baton']);
    expect(next.assets.equippedItemIds).toEqual(['asset_old_baton']);
  });

  it('keeps valid assetPatch entries when neighboring asset entries are malformed', () => {
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player pockets a file while another malformed item is ignored.',
      writeback: {
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_valid_file',
              category: 'document',
              name: 'Valid file',
              summary: 'A properly described file that should survive tolerant validation.'
            },
            {
              itemId: 'asset_bad_file',
              category: 'document',
              name: 'Missing summary'
            },
            {
              itemId: 'asset_valid_baton',
              category: 'equipment',
              name: 'Valid baton',
              summary: 'A properly described equipment item.'
            }
          ],
          removeItems: [
            {
              itemId: 'asset_old_file',
              reason: 'Moved out of the player inventory.'
            },
            {
              itemId: 'asset_bad_remove'
            }
          ]
        }
      }
    });

    expect(response.writeback.assetPatch?.upsertItems.map((item) => item.itemId)).toEqual([
      'asset_valid_file',
      'asset_valid_baton'
    ]);
    expect(response.writeback.assetPatch?.removeItems.map((item) => item.itemId)).toEqual(['asset_old_file']);
    expect(response.validationWarnings?.some((warning) => warning.path.join('.') === 'writeback.assetPatch.upsertItems.1.summary')).toBe(
      true
    );
    expect(response.validationWarnings?.some((warning) => warning.path.join('.') === 'writeback.assetPatch.removeItems.1.reason')).toBe(
      true
    );
  });

  it('keeps legacy reputationPatches usable by normalizing old circle ids into the new reputation state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A legacy style patch updates local public reputation.',
      writeback: {
        playerPatch: {
          reputationPatches: [
            {
              circle: 'localPublic',
              visibilitySet: 120,
              standingSet: -25,
              summary: '附近街坊听过他，但觉得他手法太硬。',
              reason: 'Legacy local public reputation writeback still has an explicit reason.'
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.reputation.circles.neighborhoodMedia.visibility).toBe(120);
    expect(next.player.reputation.circles.neighborhoodMedia.standing).toBe(-25);
    expect(next.player.reputation.overallReputation).toBe(-13);
    expect(next.player.reputation.logs[0]).toMatchObject({
      kind: 'circle',
      circle: 'neighborhoodMedia'
    });
    expect(next.player.reputation.logs[1]).toMatchObject({
      kind: 'overall',
      overallReputationDelta: -13
    });
  });

  it('upserts writeback v1.5 places, scenes, cases, and organizations as durable state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'A teahouse, a film company, and a complaint record become durable facts.',
      writeback: {
        placePatches: [
          {
            placeId: 'place_yau_ma_tei_teahouse',
            name: '庙街旧茶餐厅',
            regionId: 'region_yau_ma_tei',
            type: 'teahouse',
            summary: '靠近庙街的一间旧茶餐厅，熟客和巡警都会经过。',
            publicKnowledge: '街坊知道老板消息灵通。',
            currentState: '晚市刚过，柜台后面仍在点账。',
            relatedActorIds: ['player']
          }
        ],
        scenePatches: [
          {
            sceneId: 'scene_yau_ma_tei_teahouse_counter',
            placeId: 'place_yau_ma_tei_teahouse',
            name: '柜台旁',
            summary: '收银机旁能听到厨房和街口的声音。',
            temporaryState: '老板压低声音说话。',
            presentActorIds: ['player']
          }
        ],
        casePatches: [
          {
            caseId: 'case_noise_complaint_001',
            title: '庙街夜间滋扰投诉',
            type: 'public_order_complaint',
            status: 'open',
            playerAccessLevel: 'assigned',
            summary: '几名住户投诉夜间噪音与恐吓。',
            officialRecordSummary: '报案室记录为噪音滋扰。',
            publicNarrativeSummary: '街坊认为有人借噪音投诉逼走旧租客。',
            playerKnownSummary: '玩家只知道投诉背后可能有人情压力。',
            conflictSummary: '住户、商户与疑似社团中间人互相牵扯。',
            involvedActorIds: ['player'],
            relatedPlaceIds: ['place_yau_ma_tei_teahouse'],
            openQuestions: ['投诉是否被人利用？'],
            currentLeads: ['茶餐厅老板可能知道谁在收风。']
          }
        ],
        organizationPatches: [
          {
            organizationId: 'org_harbour_view_films',
            name: '海景影业',
            type: 'entertainment_company',
            summary: '一家与夜场和片场都有关系的小型电影公司。',
            stanceTowardPlayer: '暂未注意到玩家。',
            pressureSummary: '公司传闻和社团资金有交集。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.places.place_yau_ma_tei_teahouse.name).toBe('庙街旧茶餐厅');
    expect(next.scenes.scene_yau_ma_tei_teahouse_counter.placeId).toBe('place_yau_ma_tei_teahouse');
    expect(next.cases.case_noise_complaint_001.title).toBe('庙街夜间滋扰投诉');
    expect(next.cases.case_noise_complaint_001.status).toBe('investigating');
    expect(next.cases.case_noise_complaint_001.caseType).toBe('public_order_complaint');
    expect(next.cases.case_noise_complaint_001.relatedActorIds).toContain('player');
    expect(next.organizations.org_harbour_view_films.name).toBe('海景影业');
    expect(next.organizations.org_harbour_view_films.pressureSummary).toContain('社团资金');
  });

  it('applies case V1 evidence and deferred events as separate runtime stores', () => {
    const state = createInitialRuntimeState();
    const triggerAt = { ...state.time, day: state.time.day + 3 };
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'Case writeback lands evidence and a delayed prosecution reply.',
      writeback: {
        casePatches: [
          {
            caseId: 'case_bar_assault',
            title: 'Bar assault',
            caseType: 'assault',
            status: 'investigating',
            playerRole: 'assist',
            leadActorName: 'Sergeant Lam',
            summary: 'A bar assault may involve local triad pressure.',
            currentFocus: 'Find witnesses and preserve basic evidence.',
            playerVisibleProgress: 'The player has interviewed one witness.',
            internalProgressSummary: 'The lead officer is still checking CCTV.',
            relatedActorIds: ['player'],
            relatedPlaceIds: [state.location.currentPlaceId],
            activityLog: [
              {
                kind: 'created',
                summary: 'The player was assigned to assist the bar assault case.',
                relatedActorIds: ['player'],
                relatedPlaceIds: [state.location.currentPlaceId],
                visibleToPlayer: true
              }
            ]
          }
        ],
        caseEvidencePatches: [
          {
            evidenceId: 'evidence_bar_owner_statement',
            caseId: 'case_bar_assault',
            title: 'Bar owner statement',
            evidenceType: 'statement',
            sourceSummary: 'Recorded by the player.',
            summary: 'The owner saw two men leave through the back door.',
            submittedByActorId: 'player',
            relatedActorIds: ['player'],
            relatedPlaceIds: [state.location.currentPlaceId]
          }
        ],
        deferredEventPatches: [
          {
            eventId: 'deferred_case_bar_assault_review',
            sourceModule: 'case',
            relatedIds: {
              caseId: 'case_bar_assault'
            },
            title: 'Lead officer review',
            summary: 'The lead officer will review the statement later.',
            triggerAt,
            promptInstruction: 'When due, decide how the lead officer responds to the new statement.'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.cases.case_bar_assault.playerRole).toBe('assist');
    expect(next.cases.case_bar_assault.evidenceIds).toContain('evidence_bar_owner_statement');
    expect(next.cases.case_bar_assault.unreadActivityCount).toBe(1);
    expect(next.caseEvidence.evidence_bar_owner_statement.evidenceType).toBe('statement');
    expect(next.caseEvidence.evidence_bar_owner_statement.submittedByActorId).toBe('player');
    expect(next.deferredEvents.deferred_case_bar_assault_review.triggerAt).toEqual(triggerAt);
    expect(next.deferredEvents.deferred_case_bar_assault_review.status).toBe('pending');
  });

  it('normalizes ISO string triggerAt values for deferred event patches', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The lead officer pushes the review slightly later.',
      writeback: {
        deferredEventPatches: [
          {
            eventId: 'deferred_case_bar_assault_review',
            sourceModule: 'case',
            relatedIds: { caseId: 'case_bar_assault' },
            title: 'Lead officer review',
            summary: 'The lead officer will review the statement later.',
            triggerAt: '1988-09-12T21:20:00',
            promptInstruction: 'When due, decide how the lead officer responds to the new statement.'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.validationWarnings?.some((issue) => issue.path.includes('triggerAt'))).not.toBe(true);
    expect(next.deferredEvents.deferred_case_bar_assault_review.triggerAt).toEqual({
      year: 1988,
      month: 9,
      day: 12,
      hour: 21,
      minute: 20
    });
  });

  it('resolves an existing deferred case event without losing the case activity update', () => {
    const state = createInitialRuntimeState();
    const triggerAt = { ...state.time };
    state.cases.case_bar_assault = {
      caseId: 'case_bar_assault',
      title: 'Bar assault',
      caseType: 'assault',
      status: 'investigating',
      playerRole: 'assist',
      leadActorName: 'Sergeant Lam',
      summary: 'A bar assault may involve local triad pressure.',
      currentFocus: 'Wait for the lead officer review.',
      playerVisibleProgress: 'The player has submitted one witness statement.',
      internalProgressSummary: 'The lead officer needs to respond.',
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedOrganizationIds: [],
      evidenceIds: ['evidence_bar_owner_statement'],
      activityLog: [],
      unreadActivityCount: 0,
      visibility: 'player_known',
      createdAt: state.time,
      updatedAt: state.time
    };
    state.deferredEvents.deferred_case_bar_assault_review = {
      eventId: 'deferred_case_bar_assault_review',
      sourceModule: 'case',
      relatedIds: { caseId: 'case_bar_assault' },
      title: 'Lead officer review',
      summary: 'The lead officer will review the statement later.',
      triggerAt,
      visibility: 'hidden',
      promptInstruction: 'When due, decide how the lead officer responds to the new statement.',
      status: 'pending',
      createdAt: state.time
    };

    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The lead officer has reviewed the submitted statement.',
      writeback: {
        casePatches: [
          {
            caseId: 'case_bar_assault',
            playerVisibleProgress: 'The lead officer accepted the statement and asked the player to find one more witness.',
            activityLog: [
              {
                kind: 'status_changed',
                summary: 'Sergeant Lam accepted the statement and gave a follow-up direction.',
                visibleToPlayer: true
              }
            ]
          }
        ],
        deferredEventPatches: [
          {
            eventId: 'deferred_case_bar_assault_review',
            summary: 'Sergeant Lam accepted the statement and gave a follow-up direction.',
            status: 'resolved'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.deferredEvents.deferred_case_bar_assault_review.status).toBe('resolved');
    expect(next.deferredEvents.deferred_case_bar_assault_review.resolvedAt).toEqual(state.time);
    expect(next.cases.case_bar_assault.activityLog.at(-1)?.summary).toContain('Sergeant Lam accepted');
    expect(next.cases.case_bar_assault.unreadActivityCount).toBe(1);
  });

  it('keeps valid case evidence and deferred event patches when another writeback item is invalid', () => {
    const state = createInitialRuntimeState();
    const triggerAt = { ...state.time, hour: state.time.hour + 2 };
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'A mixed writeback includes one bad actor patch and valid case follow-up data.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_bad_gender',
            name: 'Bad Gender',
            gender: 'robot'
          }
        ],
        caseEvidencePatches: [
          {
            evidenceId: 'evidence_valid_statement',
            caseId: 'case_bar_assault',
            title: 'Witness statement',
            evidenceType: 'statement',
            summary: 'The witness saw two men leave through the back alley.'
          }
        ],
        deferredEventPatches: [
          {
            eventId: 'deferred_valid_followup',
            sourceModule: 'case',
            relatedIds: { caseId: 'case_bar_assault' },
            title: 'Lead officer follow-up',
            summary: 'The lead officer will respond after checking the statement.',
            triggerAt,
            promptInstruction: 'When due, decide how the lead officer responds.'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.validationWarnings?.some((warning) => warning.path.join('.') === 'writeback.actorPatches.0.gender')).toBe(
      true
    );
    expect(next.actors.npc_bad_gender).toBeUndefined();
    expect(next.caseEvidence.evidence_valid_statement.summary).toContain('back alley');
    expect(next.deferredEvents.deferred_valid_followup.triggerAt).toEqual(triggerAt);
  });

  it('ignores unknown future writeback modules without losing the narrative turn', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The turn includes an unsupported future module.',
      writeback: {
        futureImageAnchorPatches: [
          {
            actorId: 'player',
            promptAnchor: 'future field not consumed yet'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.storyLog.at(-1)?.text).toBe('The turn includes an unsupported future module.');
    expect(next.turnCounter).toBe(state.turnCounter + 1);
  });

  it('mirrors player actor name and location patches into canonical player state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player moves to a different room under a new name.',
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            name: 'Renamed Player',
            englishName: 'Johnny Wong',
            currentPlaceId: 'place_interview_room',
            currentSceneId: 'scene_interview_room'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.name).toBe('Renamed Player');
    expect(next.actors.player.englishName).toBe('Johnny Wong');
    expect(next.actors.player.currentPlaceId).toBe('place_interview_room');
    expect(next.actors.player.currentSceneId).toBe('scene_interview_room');
    expect(next.player.name).toBe('Renamed Player');
    expect(next.player.englishName).toBe('Johnny Wong');
    expect(next.location.currentPlaceId).toBe('place_interview_room');
    expect(next.location.currentSceneId).toBe('scene_interview_room');
  });

  it('records the latest map movement when player location changes through actor writeback', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player drives from Mong Kok Police Station to Yau Ma Tei Police Station.',
      timePatch: { elapsedMinutes: 18, reason: 'Short cross-district police vehicle movement.' },
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            currentPlaceId: 'place_yau_ma_tei_police_station',
            currentSceneId: 'scene_yau_ma_tei_report_room'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect((next as any).map.lastMovement).toEqual({
      turnId: 'turn_0001',
      fromPlaceId: 'place_mong_kok_police_station',
      fromSceneId: 'scene_report_room',
      toPlaceId: 'place_yau_ma_tei_police_station',
      toSceneId: 'scene_yau_ma_tei_report_room',
      startedAt: state.time,
      arrivedAt: next.time,
      elapsedMinutes: 18
    });
  });

  it('infers player movement from a player-related current matter at a newly generated place', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player follows the nightclub trouble into the VIP corridor.',
      timePatch: { elapsedMinutes: 12, reason: 'Walk from the station to Portland Street and enter the nightclub.' },
      writeback: {
        placePatches: [
          {
            placeId: 'place_new_dong_lok_nightclub',
            name: '新东乐夜总会',
            nameZh: '新东乐夜总会',
            nameEn: 'New Dong Lok Nightclub',
            regionId: 'region_kowloon',
            districtId: 'district_mong_kok',
            type: 'nightclub',
            category: 'nightlife',
            summary: '钵兰街一带的夜总会，江湖看场和影视圈老板常在此出没。',
            currentState: '警方从后门进入，贵宾房走廊气氛紧绷。',
            source: 'runtime_generated',
            confidence: 'high',
            visualAnchor: {
              mapId: 'hk_1988_main',
              x: 0.552,
              y: 0.438,
              precision: 'approximate',
              source: 'runtime_inferred',
              basisPlaceIds: ['place_portland_street']
            }
          }
        ],
        currentMatterPatches: [
          {
            id: 'matter_new_dong_lok_raid',
            title: '新东乐夜总会的警方查牌行动',
            summary: '警员3821进入新东乐夜总会贵宾房走廊，拦截试图报信的看场领头。',
            status: 'active',
            priority: 80,
            visibility: 'known',
            source: 'street',
            matterKind: 'world',
            relatedActorIds: ['player'],
            relatedPlaceIds: ['place_portland_street', 'place_new_dong_lok_nightclub'],
            relatedCaseIds: [],
            relatedOrganizationIds: []
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.location.currentPlaceId).toBe('place_new_dong_lok_nightclub');
    expect(next.actors.player.currentPlaceId).toBe('place_new_dong_lok_nightclub');
    expect((next as any).map.lastMovement).toMatchObject({
      fromPlaceId: 'place_mong_kok_police_station',
      toPlaceId: 'place_new_dong_lok_nightclub',
      elapsedMinutes: 12
    });
  });

  it('promotes current matter actors at the inferred player place into present scene context', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_dong_ge = createActorDefaults({
      actorId: 'npc_dong_ge',
      name: '东哥',
      currentIdentity: 'civilian',
      publicIdentity: '影视投资老板',
      currentPlaceId: 'place_new_dong_lok_nightclub',
      presence: 'mentioned',
      importance: 80
    });
    state.actors.npc_wah = createActorDefaults({
      actorId: 'npc_wah',
      name: '梁志华',
      currentIdentity: 'police',
      publicIdentity: '旺角警署值日警长',
      currentPlaceId: 'place_mong_kok_police_station',
      currentSceneId: 'scene_report_room',
      presence: 'present',
      importance: 80
    });
    state.scenes.scene_report_room = {
      ...state.scenes.scene_report_room,
      presentActorIds: ['player', 'npc_wah']
    };
    const response = validateNarratorResponse({
      narrativeText: '东哥打开V8包房门，和玩家在走廊正面对上。',
      writeback: {
        placePatches: [
          {
            placeId: 'place_new_dong_lok_nightclub',
            name: '新东乐夜总会',
            regionId: 'region_kowloon',
            districtId: 'district_mong_kok',
            type: 'nightclub',
            summary: '钵兰街一带的夜总会。',
            source: 'runtime_generated'
          }
        ],
        scenePatches: [
          {
            sceneId: 'scene_new_dong_lok_vip_corridor',
            placeId: 'place_new_dong_lok_nightclub',
            name: 'V8包房走廊',
            summary: '隔音门外的贵宾区走廊。',
            temporaryState: '东哥刚开门，玩家控制住看场领头。'
          }
        ],
        currentMatterPatches: [
          {
            id: 'matter_new_dong_lok_raid',
            title: '新东乐夜总会的警方查牌行动',
            summary: '东哥已经出现在V8包房门口，梁志华只通过电台施压。',
            status: 'active',
            priority: 80,
            visibility: 'known',
            source: 'street',
            relatedActorIds: ['player', 'npc_dong_ge', 'npc_wah'],
            relatedPlaceIds: ['place_new_dong_lok_nightclub'],
            relatedCaseIds: [],
            relatedOrganizationIds: []
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.location).toMatchObject({
      currentPlaceId: 'place_new_dong_lok_nightclub',
      currentSceneId: 'scene_new_dong_lok_vip_corridor'
    });
    expect(next.actors.npc_dong_ge.presence).toBe('present');
    expect(next.actors.npc_dong_ge.currentSceneId).toBe('scene_new_dong_lok_vip_corridor');
    expect(next.scenes.scene_new_dong_lok_vip_corridor.presentActorIds).toContain('npc_dong_ge');
    expect(next.actors.npc_wah.presence).toBe('mentioned');
    expect(next.scenes.scene_report_room.presentActorIds).not.toContain('npc_wah');
  });

  it('inherits the current scene when an existing actor is anchored to the current place and marked present', () => {
    const state = createInitialRuntimeState();
    const sceneId = state.location.currentSceneId!;
    state.actors.npc_returning_contact = createActorDefaults({
      actorId: 'npc_returning_contact',
      name: '回场人物',
      currentIdentity: 'civilian',
      presence: 'absent',
      visibility: 'player_known'
    });
    const response = validateNarratorResponse({
      narrativeText: '回场人物已经站在玩家面前。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_returning_contact',
            presence: 'present',
            currentPlaceId: state.location.currentPlaceId,
            statusSummary: '正在和玩家当面交谈。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_returning_contact).toMatchObject({
      presence: 'present',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: sceneId
    });
    expect(next.scenes[sceneId].presentActorIds).toContain('npc_returning_contact');
  });

  it('does not create a case from an ordinary police current matter without explicit case classification', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const response = validateNarratorResponse({
      narrativeText: 'The player answers a shopkeeper nuisance call during patrol.',
      writeback: {
        placePatches: [
          {
            placeId: 'place_tung_choi_store',
            name: '通菜街便利店',
            regionId: 'region_kowloon',
            districtId: 'district_mong_kok',
            type: 'convenience_store',
            summary: '通菜街一间普通便利店。',
            source: 'runtime_generated'
          }
        ],
        currentMatterPatches: [
          {
            id: 'matter_tung_choi_store_nuisance',
            title: '通菜街便利店门口滋扰',
            summary: '便利店店员现场求助：两名醉汉在门口滋扰和踢纸箱，暂未构成正式立案材料。',
            status: 'active',
            priority: 35,
            visibility: 'known',
            source: 'street',
            matterKind: 'police_work',
            relatedActorIds: ['player'],
            relatedPlaceIds: ['place_tung_choi_store'],
            relatedCaseIds: [],
            relatedOrganizationIds: []
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.cases.case_matter_tung_choi_store_nuisance).toBeUndefined();
    expect(next.dynamicEvents.currentMatters.matter_tung_choi_store_nuisance.relatedCaseIds).toEqual([]);
  });

  it('creates a lightweight case from an explicitly case-classified current matter when no case patch is supplied', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const response = validateNarratorResponse({
      narrativeText: 'The player turns the nightclub dispute into a formal police action.',
      writeback: {
        placePatches: [
          {
            placeId: 'place_new_dong_lok_nightclub',
            name: '新东乐夜总会',
            regionId: 'region_kowloon',
            districtId: 'district_mong_kok',
            type: 'nightclub',
            summary: '钵兰街一带的夜总会。',
            source: 'runtime_generated'
          }
        ],
        currentMatterPatches: [
          {
            id: 'matter_new_dong_lok_raid',
            title: '新东乐夜总会的正式查牌案件',
            summary: '事件涉及疑似袭击、勒索和警员呼叫增援后的正式查牌案件，已按程序准备记录。',
            status: 'active',
            priority: 80,
            visibility: 'known',
            source: 'street',
            matterKind: 'case',
            relatedActorIds: ['player'],
            relatedPlaceIds: ['place_new_dong_lok_nightclub'],
            relatedCaseIds: [],
            relatedOrganizationIds: []
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const autoCase = next.cases.case_matter_new_dong_lok_raid;

    expect(autoCase).toBeDefined();
    expect(autoCase.title).toBe('新东乐夜总会的正式查牌案件');
    expect(autoCase.status).toBe('intake');
    expect(autoCase.playerRole).toBe('execute');
    expect(autoCase.relatedPlaceIds).toEqual(['place_new_dong_lok_nightclub']);
    expect(autoCase.activityLog[0]?.summary).toContain('事件涉及疑似袭击');
    expect(next.dynamicEvents.currentMatters.matter_new_dong_lok_raid.relatedCaseIds).toContain(autoCase.caseId);
  });

  it('clears stale scene presence when player movement reuses a scene from another place', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_old_contact = {
      ...state.actors.player,
      actorId: 'npc_old_contact',
      name: 'Old Contact',
      englishName: 'Old Contact',
      currentPlaceId: 'place_mong_kok_police_station',
      currentSceneId: 'scene_report_room',
      presence: 'present',
      importance: 55
    };
    state.scenes.scene_report_room = {
      ...state.scenes.scene_report_room,
      presentActorIds: ['player', 'npc_old_contact']
    };
    const response = validateNarratorResponse({
      narrativeText: 'The player drives to Yau Ma Tei but the model repeats the old report room scene id.',
      timePatch: { elapsedMinutes: 12, reason: 'Short police vehicle movement to another station.' },
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            currentPlaceId: 'place_yau_ma_tei_police_station',
            currentSceneId: 'scene_report_room'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.location.currentPlaceId).toBe('place_yau_ma_tei_police_station');
    expect(next.location.currentSceneId).toBeUndefined();
    expect(next.actors.player.currentPlaceId).toBe('place_yau_ma_tei_police_station');
    expect(next.actors.player.currentSceneId).toBeUndefined();
    expect(next.actors.npc_old_contact.presence).toBe('mentioned');
    expect(next.actors.npc_old_contact.lastSeenPlaceId).toBe('place_mong_kok_police_station');
    expect(next.scenes.scene_report_room.presentActorIds).not.toContain('player');
    expect(next.scenes.scene_report_room.presentActorIds).not.toContain('npc_old_contact');
    expect((next as any).map.lastMovement).toMatchObject({
      turnId: 'turn_0001',
      fromPlaceId: 'place_mong_kok_police_station',
      fromSceneId: 'scene_report_room',
      toPlaceId: 'place_yau_ma_tei_police_station',
      elapsedMinutes: 12
    });
    expect((next as any).map.lastMovement.toSceneId).toBeUndefined();
  });

  it('mirrors player trait progress and gains into canonical player state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player earns a steady hand.',
      writeback: {
        traitProgress: [
          {
            actorId: 'player',
            traitId: 'trait_steady_hand',
            name: 'Steady Hand',
            delta: 25,
            maxProgress: 100,
            reason: 'Handled pressure calmly'
          }
        ],
        traitGains: [
          {
            actorId: 'player',
            traitId: 'trait_calm_under_pressure',
            name: 'Calm Under Pressure',
            source: 'story_earned',
            description: 'Keeps composure during stressful incidents.',
            effectSummary: 'Improves responses during tense police work.',
            scopes: ['pressure']
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.traitProgress[0]?.traitId).toBe('trait_steady_hand');
    expect(next.player.traitProgress[0]?.traitId).toBe('trait_steady_hand');
    expect(next.player.traitProgress[0]?.progress).toBe(25);
    expect(next.actors.player.activeTraits[0]?.traitId).toBe('trait_calm_under_pressure');
    expect(next.player.activeTraits[0]?.traitId).toBe('trait_calm_under_pressure');
  });

  it('clamps new negative trait progress to zero', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A difficult moment slows progress.',
      writeback: {
        traitProgress: [
          {
            actorId: 'player',
            traitId: 'trait_patience',
            name: 'Patience',
            delta: -10,
            maxProgress: 100,
            reason: 'Setback'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.traitProgress[0]?.progress).toBe(0);
  });

  it('clamps new over-max trait progress to maxProgress', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A breakthrough pushes progress.',
      writeback: {
        traitProgress: [
          {
            actorId: 'player',
            traitId: 'trait_focus',
            name: 'Focus',
            delta: 100,
            maxProgress: 50,
            reason: 'Breakthrough'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.traitProgress[0]?.progress).toBe(50);
  });

  it('isolates cloned game time objects across state, memories, actor memories, and story log', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The turn records several time-bearing entries.',
      writeback: {
        memories: [
          {
            text: 'A general memory.',
            kind: 'world',
            importance: 10,
            visibility: 'player_known',
            certainty: 'fact'
          }
        ],
        actorMemories: [
          {
            actorId: 'player',
            text: 'An actor memory.',
            importance: 10,
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const memoryTime = Object.values(next.memories)[0]?.gameTime;
    const actorMemoryTime = Object.values(next.memories).find((memory) => memory.text === 'An actor memory.')?.gameTime;
    const storyTime = next.storyLog.at(-1)?.gameTime;

    expect(next.time).not.toBe(state.time);
    expect(memoryTime).not.toBe(next.time);
    expect(actorMemoryTime).not.toBe(next.time);
    expect(storyTime).not.toBe(next.time);
    expect(memoryTime).not.toBe(actorMemoryTime);
    expect(memoryTime).not.toBe(storyTime);
    expect(actorMemoryTime).not.toBe(storyTime);

    next.time.minute = 1;
    expect(state.time.minute).toBe(30);
    expect(memoryTime?.minute).toBe(30);
    expect(actorMemoryTime?.minute).toBe(30);
    expect(storyTime?.minute).toBe(30);

    if (memoryTime) memoryTime.hour = 9;
    expect(next.time.hour).toBe(8);
    expect(actorMemoryTime?.hour).toBe(8);
    expect(storyTime?.hour).toBe(8);
  });

  it('does not share omitted writeback default arrays across parsed responses', () => {
    const first = validateNarratorResponse({ narrativeText: 'First response.' });
    const second = validateNarratorResponse({ narrativeText: 'Second response.' });

    first.writeback.memories.push({
      text: 'Mutation after parsing.',
      kind: 'turn',
      importance: 1,
      visibility: 'player_known',
      certainty: 'fact'
    });

    expect(second.writeback.memories).toHaveLength(0);
  });

  it('does not overwrite sparse existing memory ids when adding memories', () => {
    const state = createInitialRuntimeState();
    state.memories.memory_0002 = {
      memoryId: 'memory_0002',
      text: 'Imported sparse memory.',
      kind: 'turn',
      relatedActorIds: [],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      relatedTurnId: 'turn_imported',
      gameTime: { ...state.time },
      importance: 50,
      visibility: 'player_known',
      certainty: 'fact',
      embeddingText: 'Imported sparse memory.'
    };
    const response = validateNarratorResponse({
      narrativeText: 'A new memory is written.',
      writeback: {
        memories: [
          {
            text: 'Fresh memory.',
            kind: 'world',
            importance: 10,
            visibility: 'player_known',
            certainty: 'fact'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.memories.memory_0002.text).toBe('Imported sparse memory.');
    expect(Object.values(next.memories).map((memory) => memory.memoryId)).toContain('memory_0003');
    expect(next.memories.memory_0003?.text).toBe('Fresh memory.');
  });

  it('stores turn summary as story summary and short-term turn memory', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player confirms the manuscript has already been delivered to the newspaper desk.',
      turnSummary: '玩家已经把小说初稿投给报社；后续只能写编辑回音、退稿、采用或报馆联系，不要再次要求投稿。',
      writeback: {}
    });

    const next = applyNarratorResponse(state, response, {
      playerInput: '把小说初稿送去报社投稿。'
    });
    const latestStory = next.storyLog.at(-1);
    const turnMemory = Object.values(next.memories).find(
      (memory) => memory.relatedTurnId === latestStory?.turnId && memory.kind === 'turn'
    );

    expect(latestStory?.summaryText).toContain('小说初稿投给报社');
    expect(next.storyLog.at(-2)).toMatchObject({
      speaker: 'player',
      text: '把小说初稿送去报社投稿。'
    });
    expect(turnMemory).toMatchObject({
      text: expect.stringContaining('后续只能写编辑回音'),
      tier: 'short_term',
      certainty: 'fact'
    });
    expect(turnMemory?.embeddingText).toContain('玩家输入：把小说初稿送去报社投稿。');
    expect(turnMemory?.embeddingText).toContain('回合摘要：玩家已经把小说初稿投给报社');
    expect(turnMemory?.embeddingText).not.toContain(response.narrativeText);
    expect(latestStory?.embeddingText).toBeUndefined();
  });

  it('keeps turnSummary as the only player turn memory while preserving non-turn facts', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player files the report and leaves the desk.',
      turnSummary: '玩家已经提交报告并离开报案室。',
      writeback: {
        memories: [
          {
            text: '这条重复回合摘要不应另建主角记忆。',
            kind: 'turn',
            importance: 90,
            visibility: 'player_known',
            certainty: 'fact'
          },
          {
            text: '报案室夜班登记册由值日警长保管。',
            kind: 'world',
            importance: 40,
            visibility: 'player_known',
            certainty: 'fact'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const latestTurnId = next.storyLog.at(-1)?.turnId;
    const turnMemories = Object.values(next.memories).filter(
      (memory) => memory.kind === 'turn' && memory.relatedTurnId === latestTurnId
    );
    const worldMemory = Object.values(next.memories).find((memory) => memory.kind === 'world');

    expect(turnMemories).toHaveLength(1);
    expect(turnMemories[0]?.text).toBe('玩家已经提交报告并离开报案室。');
    expect(worldMemory?.text).toBe('报案室夜班登记册由值日警长保管。');
    expect(worldMemory?.tier).toBeUndefined();
  });

  it('keeps heavy narrator diagnostics only on the latest ten narrator turns', () => {
    const state = createInitialRuntimeState();
    state.turnCounter = 12;
    state.storyLog = Array.from({ length: 12 }, (_, index) => ({
      turnId: `turn_${String(index + 1).padStart(4, '0')}`,
      speaker: 'narrator' as const,
      text: `Narrative ${index + 1}`,
      summaryText: `Summary ${index + 1}`,
      gameTime: { ...state.time },
      rawNarratorResponse: `Raw ${index + 1}`,
      writebackDiagnostics: [{ path: ['writeback'], message: `Diagnostic ${index + 1}` }]
    }));
    const response = validateNarratorResponse({
      narrativeText: 'Narrative 13',
      turnSummary: 'Summary 13',
      writeback: {}
    });

    const next = applyNarratorResponse(state, response, {
      rawNarratorResponse: 'Raw 13',
      writebackDiagnostics: [{ path: ['writeback'], message: 'Diagnostic 13' }]
    });
    const narratorEntries = next.storyLog.filter((entry) => entry.speaker === 'narrator');

    expect(narratorEntries).toHaveLength(13);
    expect(narratorEntries.map((entry) => entry.text)).toEqual(
      Array.from({ length: 13 }, (_, index) => `Narrative ${index + 1}`)
    );
    expect(narratorEntries.slice(0, 3).every((entry) => !entry.rawNarratorResponse && !entry.writebackDiagnostics)).toBe(true);
    expect(narratorEntries.slice(3).every((entry) => entry.rawNarratorResponse && entry.writebackDiagnostics)).toBe(true);
  });

  it('stores exactly one player action beside the narrator entry for a completed turn', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player walks into the tea restaurant.',
      turnSummary: '玩家走进茶餐厅。',
      writeback: {}
    });

    const next = applyNarratorResponse(state, response, {
      playerInput: '走进茶餐厅。'
    });
    const narratorEntry = next.storyLog.find((entry) => entry.speaker === 'narrator' && entry.text === response.narrativeText);
    const turnEntries = next.storyLog.filter((entry) => entry.turnId === narratorEntry?.turnId);

    expect(turnEntries).toEqual([
      expect.objectContaining({ speaker: 'player', text: '走进茶餐厅。' }),
      expect.objectContaining({ speaker: 'narrator', text: response.narrativeText })
    ]);
    expect(next.storyLog.filter((entry) => entry.speaker === 'player')).toHaveLength(1);
  });

  it('synchronizes an inspector promotion across the player police state and salary', () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 10, day: 1, hour: 9, minute: 0 };

    expect(state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.amount).toBe(4200);

    const response = validateNarratorResponse({
      narrativeText: 'The formal notice confirms the player has been promoted to inspector.',
      writeback: {
        playerPatch: {
          policePanel: {
            careerPath: {
              currentRank: 'Inspector（督察 IP）',
              targetRank: 'Senior Inspector（高级督察 SIP）',
              routeSummary: '正式晋升后，下一步需要在督察岗位留下稳定记录。'
            }
          }
        }
      }
    });

    const next = applyNarratorResponse(state, response);
    const salary = next.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID];

    expect(next.lawIdentity.rank).toBe('Inspector（督察 IP）');
    expect(next.policePanel.careerPath.currentRank).toBe('Inspector（督察 IP）');
    expect(next.actors.player.roleProfiles.police?.rank).toBe('Inspector（督察 IP）');
    expect(salary?.amount).toBe(6500);
    expect(salary?.activeFromMonth).toBe('1988-10');
    expect(salary?.summary).toContain('Inspector');
  });

  it('records the player actor as case lead when a case patch promotes the player to lead', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.actors[state.player.actorId].name = '陈厚生';
    const response = validateNarratorResponse({
      narrativeText: '上级正式授权陈厚生全权主办这宗案件。',
      writeback: {
        casePatches: [
          {
            caseId: 'case_cross_district_money_laundering',
            title: '大角咀及九龙塘跨区非法集资与高利贷洗钱案',
            caseType: 'organized_financial_crime',
            status: 'investigating',
            playerRole: 'lead',
            summary: '案件已正式纳入跨区侦查。',
            currentFocus: '追查紧急跨区线报。',
            playerVisibleProgress: '玩家已获正式授权全权主办。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.cases.case_cross_district_money_laundering).toMatchObject({
      playerRole: 'lead',
      leadActorId: state.player.actorId,
      leadActorName: '陈厚生'
    });
  });

  it('preserves another lead investigator when the player is only assisting', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.actors.actor_lau = createActorDefaults({
      actorId: 'actor_lau',
      name: '刘启',
      currentIdentity: 'police',
      publicIdentity: '便衣探员'
    });
    const response = validateNarratorResponse({
      narrativeText: '刘启继续主办案件，玩家负责协助查证。',
      writeback: {
        casePatches: [
          {
            caseId: 'case_assist_control',
            title: '协查案件',
            caseType: 'assault',
            status: 'investigating',
            playerRole: 'assist',
            leadActorId: 'actor_lau',
            leadActorName: '刘启',
            summary: '刘启主办，玩家协查。',
            currentFocus: '核对证人口供。',
            playerVisibleProgress: '玩家已完成第一轮协查。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.cases.case_assist_control).toMatchObject({
      playerRole: 'assist',
      leadActorId: 'actor_lau',
      leadActorName: '刘启'
    });
  });

  it('synchronizes a chief superintendent promotion across every police rank mirror and salary', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 10, day: 1, hour: 9, minute: 0 },
      lawIdentity: {
        rank: 'Senior Superintendent（高级警司 SSP）',
        stationOrPost: 'Police Headquarters',
        department: 'Force Headquarters',
        assignmentSummary: 'Senior command duties'
      }
    });
    const response = validateNarratorResponse({
      narrativeText: '警队正式公布晋升令，玩家获晋升为总警司。',
      writeback: {
        playerPatch: {
          policePanel: {
            careerPath: {
              currentRank: 'Chief Superintendent（总警司 CSP）',
              targetRank: 'Assistant Commissioner of Police（助理处长 ACP）',
              routeSummary: '晋升后负责更高层级的警队指挥工作。'
            }
          }
        }
      }
    });

    const next = applyNarratorResponse(state, response);
    const salary = next.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID];

    expect(next.lawIdentity.rank).toBe('Chief Superintendent（总警司 CSP）');
    expect(next.policePanel.careerPath.currentRank).toBe(
      'Chief Superintendent（总警司 CSP）'
    );
    expect(next.actors.player.roleProfiles.police?.rank).toBe(
      'Chief Superintendent（总警司 CSP）'
    );
    expect(salary?.amount).toBe(12500);
    expect(salary?.summary).toContain('Chief Superintendent');
  });

  it('synchronizes a formal PTU-to-CID transfer without creating an identity transition', () => {
    const state = createInitialRuntimeState({
      lawIdentity: {
        rank: 'Police Constable（警员 PC）',
        stationOrPost: 'Police Tactical Unit（警察机动部队 PTU）',
        department: 'Police Tactical Unit（警察机动部队 PTU）',
        assignmentSummary: '机动部队大队日常训练与行动候命'
      }
    });
    const identityHistory = [...state.player.identityHistory];
    const response = validateNarratorResponse({
      narrativeText: '正式调令已经生效，玩家离开机动部队，转到九龙总区刑事侦缉部门报到。',
      turnSummary: '玩家的警察身份没有改变，所属单位正式由机动部队转为 CID。',
      writeback: {
        policeRoleProfilePatch: {
          reason: '正式调令已经生效并完成 CID 报到。',
          stationOrPost: 'Kowloon Regional Headquarters（九龙总区总部）',
          department: 'Criminal Investigation Department（刑事侦缉处 CID）',
          assignmentSummary: '刑事侦缉队调查员，负责案件调查与侦缉工作',
          postRole: 'CID Detective（刑事侦缉队调查员）',
          dutySummary: '负责案件调查、证人联络、线索核查与行动支援。'
        }
      }
    });

    const next = applyNarratorResponse(state, response);
    const policeProfile = next.actors.player.roleProfiles.police;
    const policeRelation = next.actors.player.organizationRelations.find(
      (relation) => relation.organizationId === 'org_hk_police' && relation.isPrimary
    );

    expect(next.player.identityHistory).toEqual(identityHistory);
    expect(next.player.currentIdentity).toBe('police');
    expect(next.lawIdentity).toMatchObject({
      stationOrPost: 'Kowloon Regional Headquarters（九龙总区总部）',
      department: 'Criminal Investigation Department（刑事侦缉处 CID）',
      assignmentSummary: '刑事侦缉队调查员，负责案件调查与侦缉工作',
      dutySummary: '负责案件调查、证人联络、线索核查与行动支援。'
    });
    expect(policeProfile).toMatchObject({
      stationOrPost: 'Kowloon Regional Headquarters（九龙总区总部）',
      department: 'Criminal Investigation Department（刑事侦缉处 CID）',
      assignmentSummary: '刑事侦缉队调查员，负责案件调查与侦缉工作',
      postRole: 'CID Detective（刑事侦缉队调查员）'
    });
    expect(policeRelation).toMatchObject({
      roleTitle: 'CID Detective（刑事侦缉队调查员）',
      departmentOrUnit: 'Criminal Investigation Department（刑事侦缉处 CID）',
      summary: '刑事侦缉队调查员，负责案件调查与侦缉工作'
    });
    expect(next.policePanel.unitName).toContain('刑事侦缉处');
    expect(next.policePanel.unitSummary).toContain('刑事侦缉处');
    expect(next.policePanel.unitName).not.toContain('机动部队');
  });

  it('sanitizes pregnancy patches independently so one invalid item does not discard a valid risk', () => {
    const response = validateNarratorResponseStrict({
      narrativeText: '正文。',
      turnSummary: '本回合发生了需要登记的成人受孕风险。',
      suggestedActions: [],
      writeback: {
        pregnancyRiskPatches: [
          {
            actorId: 'npc_adult_female',
            riskType: 'unprotected',
            summary: '明确的无保护受孕风险。',
            fatherActorId: 'player',
            paternityCandidates: [
              { actorId: 'player', name: '玩家', visibility: 'player_known' },
              { actorId: 'npc_other_candidate', name: '陈先生', visibility: 'player_known' }
            ]
          },
          {
            actorId: 'npc_invalid',
            riskType: 'invented_type',
            summary: '无效条目。'
          }
        ]
      }
    });

    expect(response.writeback.pregnancyRiskPatches).toEqual([
      expect.objectContaining({
        actorId: 'npc_adult_female',
        riskType: 'unprotected',
        paternityCandidates: [
          expect.objectContaining({ actorId: 'player' }),
          expect.objectContaining({ actorId: 'npc_other_candidate' })
        ]
      })
    ]);
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: expect.arrayContaining(['writeback', 'pregnancyRiskPatches', 1])
      })
    );
  });

  it('records pregnancy risk through structured writeback and protects engine truth from generic womb patches', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_adult_female = createActorDefaults({
      actorId: 'npc_adult_female',
      name: '阿玲',
      gender: 'female',
      birthDate: '1962-03-08',
      computedAge: 22,
      currentIdentity: 'civilian',
      publicIdentity: '市民',
      roleProfiles: {},
      positionSummary: '市民',
      profileSummary: '成年女性。',
      appearance: '成年女性。',
      clothing: '日常衣着。',
      personality: '谨慎。',
      speechStyle: '直接。',
      motivation: '照顾生活。',
      longTermGoal: '维持安稳生活。',
      values: '重视承诺。',
      visibility: 'player_known'
    });
    const riskResponse = validateNarratorResponse({
      narrativeText: '正文明确发生了成人无保护行为。',
      turnSummary: '阿玲经历了一次明确的受孕风险。',
      writeback: {
        pregnancyRiskPatches: [
          {
            actorId: 'npc_adult_female',
            riskType: 'unprotected',
            summary: '阿玲经历了一次明确的无保护受孕风险。',
            paternityCandidates: [
              { actorId: 'player', name: '玩家', visibility: 'player_known' },
              { actorId: 'npc_other_candidate', name: '陈先生', visibility: 'player_known' }
            ],
            fatherActorId: 'player',
            fatherName: '玩家',
            fatherVisibility: 'player_known'
          }
        ]
      }
    });
    const registered = applyNarratorResponse(state, riskResponse, { pregnancyMode: 'standard' });
    const registeredWomb = registered.actors.npc_adult_female.femaleProfile?.adultPrivateProfile?.womb;
    const pregnancyId = registeredWomb?.pregnancy?.pregnancyId;

    expect(registeredWomb).toMatchObject({
      status: '待验孕',
      pregnancy: {
        status: 'pending_check',
        paternityCandidates: [
          expect.objectContaining({ actorId: 'player', visibility: 'player_known' }),
          expect.objectContaining({ actorId: 'npc_other_candidate', visibility: 'player_known' })
        ]
      }
    });
    expect(registeredWomb?.records.at(-1)?.paternityCandidates).toEqual(
      registeredWomb?.pregnancy?.paternityCandidates
    );
    expect(registered.actors.npc_adult_female.femaleProfile?.adultPrivateProfile).toMatchObject({
      enabled: true,
      ageConfirmedAdult: true,
      profileStatus: 'developing',
      source: 'writeback'
    });
    expect(registered.actors.npc_adult_female.femaleProfile?.adultPrivateProfile?.partProfiles).toBeUndefined();
    expect(registered.actors.npc_adult_female.femaleProfile?.adultPrivateProfile?.fetishNotes).toBeUndefined();
    expect(registered.actors.npc_adult_female.femaleProfile?.adultPrivateProfile?.sensitivePoints).toBeUndefined();

    const overwriteResponse = validateNarratorResponse({
      narrativeText: '后续回合没有新的验孕事实。',
      turnSummary: '本回合没有改变既有怀孕生命周期。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_adult_female',
            femaleProfile: {
              adultPrivateProfile: {
                womb: {
                  status: '模型擅自宣布未受孕',
                  cervixStatus: '模型可更新的稳定字段',
                  records: [{ description: '模型试图覆盖引擎记录。' }],
                  pregnancy: { status: '模型伪造状态' },
                  pregnancyHistory: [{ outcome: '模型伪造历史' }]
                }
              }
            }
          }
        ]
      }
    });
    const protectedState = applyNarratorResponse(registered, overwriteResponse, { pregnancyMode: 'standard' });
    const protectedWomb = protectedState.actors.npc_adult_female.femaleProfile?.adultPrivateProfile?.womb;

    expect(protectedWomb?.status).toBe('待验孕');
    expect(protectedWomb?.pregnancy?.pregnancyId).toBe(pregnancyId);
    expect(protectedWomb?.pregnancy?.status).toBe('pending_check');
    expect(protectedWomb?.records).toEqual(registeredWomb?.records);
    expect(protectedWomb?.cervixStatus).toBe('模型可更新的稳定字段');
  });

  it('applies a structured identity context patch and its secret facts as one transition', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    const response = validateNarratorResponse({
      narrativeText: '玩家正式跟随和胜和庙街一名上线做事。',
      turnSummary: '玩家以庙街外围跑腿身份进入和胜和关系网。',
      writeback: {
        identityContextPatch: {
          transitionId: 'transition_join_wo_shing_wo_1',
          kind: 'join',
          fromIdentity: 'civilian',
          toIdentity: 'gang_member',
          publicIdentity: '和胜和庙街外围跑腿',
          reason: '接受上线安排并开始承担固定跑腿义务。',
          targetRoleProfile: {
            identity: 'gang_member',
            profile: {
              status: 'active',
              organizationId: 'org_wo_shing_wo',
              societyName: '和胜和',
              roleTitle: '庙街外围跑腿',
              rankSummary: '外围新人',
              territorySummary: '庙街与油麻地一带',
              patronActorIds: [],
              peerActorIds: [],
              rivalActorIds: [],
              obligationSummary: '传话、跑腿并按规矩交代。',
              riskSummary: '会受到警方、对头与内部规矩夹击。'
            }
          },
          secretFactPatches: [
            {
              operation: 'upsert',
              fact: {
                secretId: 'secret_player_handler_1',
                ownerType: 'player',
                ownerId: 'player',
                kind: 'relationship',
                summary: '玩家与上线的真实联络方式尚未公开。',
                playerCharacterKnown: true,
                publicKnown: false,
                knownByActorIds: ['actor_handler'],
                revealState: 'known_to_some_actors',
                revealConditions: ['联络被跟踪或主动公开。'],
                visibility: 'player_known',
                importance: 80
              }
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.currentIdentity).toBe('gang_member');
    expect(next.actors.player.currentIdentity).toBe('gang_member');
    expect(next.actors.player.roleProfiles.triad?.status).toBe('active');
    expect(next.actors.player.organizationIds).toContain('org_wo_shing_wo');
    expect(next.secretFacts.secret_player_handler_1?.visibility).toBe('player_known');
    expect(next.player.identityHistory[0]?.transitionId).toBe('transition_join_wo_shing_wo_1');
  });

  it('remaps reviewed actor ids inside a triad role profile and identity secret facts', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    state.actors.actor_canonical_patron = {
      ...state.actors.player,
      actorId: 'actor_canonical_patron',
      name: '阿成',
      currentIdentity: 'gang_member',
      publicIdentity: '庙街地区线联络人'
    };
    const response = validateNarratorResponse({
      narrativeText: '阿成正式带玩家进入和胜和庙街关系网。',
      turnSummary: '玩家成为和胜和庙街外围成员，阿成是直属上线。',
      writeback: {
        identityContextPatch: {
          transitionId: 'transition_join_wo_shing_wo_reviewed_patron',
          kind: 'join',
          fromIdentity: 'civilian',
          toIdentity: 'gang_member',
          publicIdentity: '和胜和庙街外围成员',
          reason: '阿成正式接纳玩家进入地区线。',
          targetRoleProfile: {
            identity: 'gang_member',
            profile: {
              status: 'active',
              organizationId: 'org_wo_shing_wo',
              societyName: '和胜和',
              roleTitle: '庙街外围成员',
              rankSummary: '外围新人',
              territorySummary: '庙街与油麻地一带',
              patronActorIds: ['actor_temporary_patron'],
              peerActorIds: [],
              rivalActorIds: [],
              obligationSummary: '按规矩向直属上线交代。',
              riskSummary: '不可越权或公开借组织名义。'
            }
          },
          secretFactPatches: [
            {
              operation: 'upsert',
              fact: {
                secretId: 'secret_reviewed_patron_link',
                ownerType: 'player',
                ownerId: 'player',
                kind: 'relationship',
                summary: '阿成是玩家未公开的直属上线。',
                playerCharacterKnown: true,
                publicKnown: false,
                knownByActorIds: ['actor_temporary_patron'],
                revealState: 'known_to_some_actors',
                revealConditions: ['联络关系暴露。'],
                visibility: 'player_known',
                importance: 80
              }
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response, {
      actorIdAliases: { actor_temporary_patron: 'actor_canonical_patron' }
    });

    expect(next.actors.player.roleProfiles.triad?.patronActorIds).toEqual(['actor_canonical_patron']);
    expect(next.secretFacts.secret_reviewed_patron_link?.knownByActorIds).toEqual(['actor_canonical_patron']);
    expect(next.actorIdAliases).toMatchObject({
      actor_temporary_patron: 'actor_canonical_patron'
    });
  });

  it('accepts a structured pregnancy lifecycle review and medical confirmation patch', () => {
    const response = validateNarratorResponseStrict({
      writebackVersion: '1.7',
      narrativeText: '医院检查明确确认已有妊娠。',
      turnSummary: '医生完成检查并确认阿玲怀孕。',
      suggestedActions: [],
      playerVitalsReview: { changed: false, reason: '玩家身体状态没有变化。' },
      pregnancyLifecycleReview: {
        changed: true,
        events: [
          {
            actorId: 'npc_adult_female',
            event: 'pregnancy_confirmed',
            reason: '医院检查明确确认妊娠。'
          }
        ],
        reason: '本回合发生了医学确认。'
      },
      writeback: {
        pregnancyResolutionPatches: [
          {
            actorId: 'npc_adult_female',
            outcome: 'pregnancy_confirmed',
            summary: '医院检查明确确认妊娠。'
          }
        ]
      }
    });

    expect(response.pregnancyLifecycleReview).toMatchObject({
      changed: true,
      events: [expect.objectContaining({ event: 'pregnancy_confirmed' })]
    });
    expect(response.writeback.pregnancyResolutionPatches).toEqual([
      expect.objectContaining({ outcome: 'pregnancy_confirmed' })
    ]);
  });

  it('normalizes unambiguous pregnancy review aliases and string-like reasons', () => {
    const response = validateNarratorResponseStrict({
      writebackVersion: '1.7',
      narrativeText: '医院检查明确确认已有妊娠。',
      turnSummary: '医生完成检查并确认阿玲怀孕。',
      suggestedActions: ['继续听医生说明。'],
      pregnancyLifecycleReview: {
        changed: true,
        events: [
          {
            actorId: 'npc_adult_female',
            event: 'pregnancy-confirmed',
            reason: { detail: '医院检查', description: '明确确认妊娠。' }
          }
        ],
        reason: ['本回合发生了医学确认。']
      },
      writeback: {
        pregnancyResolutionPatches: [
          {
            actorId: 'npc_adult_female',
            outcome: 'pregnancy_confirmed',
            summary: '医院检查明确确认妊娠。'
          }
        ]
      }
    });

    expect(response.pregnancyLifecycleReview).toEqual({
      changed: true,
      events: [
        {
          actorId: 'npc_adult_female',
          event: 'pregnancy_confirmed',
          reason: '明确确认妊娠。'
        }
      ],
      reason: '本回合发生了医学确认。'
    });
    expect(response.validationWarnings).toBeUndefined();
  });

  it('soft-drops a contradictory pregnancy lifecycle review without discarding valid writeback', () => {
    const response = validateNarratorResponseStrict({
      writebackVersion: '1.7',
      narrativeText: '医院检查明确确认已有妊娠。',
      turnSummary: '医生完成检查并确认阿玲怀孕。',
      suggestedActions: [],
      pregnancyLifecycleReview: {
        changed: false,
        events: [
          {
            actorId: 'npc_adult_female',
            event: 'pregnancy_confirmed',
            reason: '自相矛盾的复核。'
          }
        ],
        reason: '错误地声明没有变化。'
      },
      writeback: {
        pregnancyResolutionPatches: [
          {
            actorId: 'npc_adult_female',
            outcome: 'pregnancy_confirmed',
            summary: '医院检查明确确认妊娠。'
          }
        ]
      }
    });

    expect(response.pregnancyLifecycleReview).toBeUndefined();
    expect(response.writeback.pregnancyResolutionPatches).toHaveLength(1);
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({ path: expect.arrayContaining(['pregnancyLifecycleReview']) })
    );
  });

  it('does not erase established triad relationship ids when an API correction omits those arrays', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'gang_member' });
    state.actors.player.roleProfiles.triad = {
      ...state.actors.player.roleProfiles.triad!,
      patronActorIds: ['actor_existing_patron'],
      peerActorIds: ['actor_existing_peer'],
      rivalActorIds: ['actor_existing_rival']
    };
    const response = validateNarratorResponse({
      narrativeText: '上线只重新确认了玩家在庙街地区线中的职务。',
      turnSummary: '玩家的社团职务称谓得到修正，既有组织关系没有变化。',
      writeback: {
        identityContextPatch: {
          transitionId: 'transition_triad_api_partial_correction',
          kind: 'correction',
          fromIdentity: 'gang_member',
          toIdentity: 'gang_member',
          publicIdentity: '和胜和庙街地区成员',
          reason: '修正地区线职务称谓。',
          targetRoleProfile: {
            identity: 'gang_member',
            profile: {
              organizationId: 'org_wo_shing_wo',
              societyName: '和胜和',
              roleTitle: '庙街地区成员',
              rankSummary: '正式成员'
            }
          }
        }
      }
    });

    expect(response.writeback.identityContextPatch?.targetRoleProfile).toMatchObject({
      identity: 'gang_member',
      profile: {
        patronActorIds: [],
        peerActorIds: [],
        rivalActorIds: []
      }
    });
    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.roleProfiles.triad).toMatchObject({
      roleTitle: '庙街地区成员',
      patronActorIds: ['actor_existing_patron'],
      peerActorIds: ['actor_existing_peer'],
      rivalActorIds: ['actor_existing_rival']
    });
  });

  it('normalizes explicit identity patch aliases returned by a compatible API without reading narrative prose', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    const response = validateNarratorResponse({
      narrativeText: '玩家完成了正式入门。',
      turnSummary: '玩家正式成为和胜和外围成员。',
      writeback: {
        identityContextPatch: {
          transitionId: 'transition_join_wo_shing_wo_aliases',
          kind: 'status_change',
          fromIdentity: 'civilian',
          toIdentity: 'gang_member',
          publicIdentity: '湾仔夜场侍应',
          reason: '喝下入门茶并被上线接纳。',
          targetRoleProfile: {
            identity: 'gang_member',
            profile: {
              affiliation: 'org_wo_shing_wo',
              role: '外围成员',
              territorySummary: '湾仔骆克道一带',
              coverOccupation: '湾仔夜场侍应',
              patronActorIds: ['npc_handler'],
              legalStatusSummary: '身份暴露会引来警方调查。'
            }
          },
          secretFactPatches: [
            {
              operation: 'add',
              factId: 'secret_wsw_member_aliases',
              factType: 'actual_allegiance',
              description: '玩家实际已加入和胜和。',
              knownByActorIds: ['player', 'npc_handler'],
              revealConditions: '主动暴露或被深入调查。'
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.identityContextPatch).toMatchObject({
      kind: 'join',
      targetRoleProfile: {
        identity: 'gang_member',
        profile: {
          organizationId: 'org_wo_shing_wo',
          roleTitle: '外围成员',
          coverIdentitySummary: '湾仔夜场侍应'
        }
      }
    });
    expect(next.player.currentIdentity).toBe('gang_member');
    expect(next.actors.player.roleProfiles.triad).toMatchObject({
      organizationId: 'org_wo_shing_wo',
      roleTitle: '外围成员',
      status: 'active'
    });
    expect(next.actors.player.organizationIds).toContain('org_wo_shing_wo');
    expect(next.secretFacts.secret_wsw_member_aliases).toMatchObject({
      kind: 'loyalty',
      playerCharacterKnown: true,
      visibility: 'player_known'
    });
  });

  it('normalizes a keyed police role profile and deterministic transition id for a structured cover entry', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'gang_member' });
    const response = validateNarratorResponse({
      narrativeText: '玩家完成学警训练并持四位警号到警署报到。',
      turnSummary: '玩家的当前公开身份正式转为警察，社团出身作为秘密保留。',
      writeback: {
        identityContextPatch: {
          kind: 'cover_enter',
          fromIdentity: 'gang_member',
          toIdentity: 'police',
          publicIdentity: '皇家香港警察 · 警员 (PC) · 军装巡逻小队',
          policeNumber: '6632',
          targetRoleProfile: {
            police: {
              agencyId: 'org_hk_police',
              stationOrPost: '油麻地警署',
              department: '军装巡逻小队',
              rank: '警员 (PC)',
              postRole: '巡逻警员',
              assignmentSummary: '负责油麻地分区街面巡逻与接警。'
            }
          },
          secretFactPatches: [
            {
              operation: 'upsert',
              fact: {
                secretId: 'secret_gang_origin_under_police_cover',
                ownerType: 'player',
                ownerId: 'player',
                kind: 'loyalty',
                summary: '玩家实际仍效忠原社团。',
                playerCharacterKnown: true,
                publicKnown: false,
                knownByActorIds: ['npc_handler'],
                revealState: 'known_to_some_actors',
                revealConditions: ['单线接头暴露。'],
                visibility: 'player_known',
                importance: 95
              }
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.identityContextPatch).toMatchObject({
      transitionId: expect.stringMatching(/^transition_auto_[a-z0-9]+$/),
      reason: '结构化身份转换：gang_member -> police（cover_enter）。',
      targetRoleProfile: {
        identity: 'police',
        profile: {
          agencyId: 'org_hk_police',
          rank: '警员 (PC)'
        }
      }
    });
    expect(next.player.currentIdentity).toBe('police');
    expect(next.player.originIdentity).toBe('gang_member');
    expect(next.player.policeNumber).toBe('6632');
    expect(next.actors.player.roleProfiles.police?.status).toBe('cover');
    expect(next.actors.player.roleProfiles.triad?.status).toBe('hidden');
    expect(next.secretFacts.secret_gang_origin_under_police_cover?.visibility).toBe('player_known');
  });

  it('ignores a direct player actor identity change and records a diagnostic', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    const response = validateNarratorResponse({
      narrativeText: '这一回合只更新了人物描述。',
      turnSummary: '玩家身份没有发生结构化转换。',
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            currentIdentity: 'police',
            publicIdentity: '试图伪造的警察身份',
            actualIdentitySummary: '试图覆盖的实际身份',
            roleProfiles: {
              police: {
                status: 'active',
                agencyId: 'org_hk_police',
                rank: '警员'
              }
            },
            statusSummary: '试图直接改变身份。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.currentIdentity).toBe('civilian');
    expect(next.actors.player.currentIdentity).toBe('civilian');
    expect(next.actors.player.publicIdentity).not.toBe('试图伪造的警察身份');
    expect(next.actors.player.actualIdentitySummary).not.toBe('试图覆盖的实际身份');
    expect(next.actors.player.roleProfiles.police).toBeUndefined();
    expect(next.actors.player.statusSummary).toBe('试图直接改变身份。');
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'player_identity_requires_context_patch' })
    );
  });

  it('keeps valid standalone secret facts when a neighboring secret patch is invalid', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    const response = validateNarratorResponse({
      narrativeText: '玩家得知了一条不能公开的身份线索。',
      turnSummary: '玩家记住了一条私密身份事实。',
      writeback: {
        secretFactPatches: [
          {
            operation: 'upsert',
            fact: {
              secretId: 'secret_known_identity_clue_1',
              ownerType: 'actor',
              ownerId: 'actor_unknown',
              kind: 'identity',
              summary: '此人正在使用化名。',
              playerCharacterKnown: true,
              publicKnown: false,
              knownByActorIds: [],
              revealState: 'known_to_player_character',
              revealConditions: [],
              visibility: 'player_known',
              importance: 70
            }
          },
          { operation: 'remove', secretId: '' }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.secretFactPatches).toHaveLength(1);
    expect(next.secretFacts.secret_known_identity_clue_1?.summary).toBe('此人正在使用化名。');
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({ path: expect.arrayContaining(['writeback', 'secretFactPatches', 1]) })
    );
  });
});
