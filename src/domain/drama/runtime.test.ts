import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { recordDramaTurn } from './runtime';

describe('dramatic runtime records', () => {
  it('durably records an actually used official DLC source even without a persistent writeback', () => {
    const state = createInitialRuntimeState();
    const ref = {
      providerId: 'official-dlc',
      sourceType: 'official_dlc_event',
      sourceId: 'official_dlc_urban_legends_hk1988_midnight_char_siu_bun',
      dlcId: 'urban_legends'
    };

    const first = recordDramaTurn(state, {
      planId: 'plan_char_siu_texture',
      status: 'used_as_texture',
      usedSourceRefs: [ref],
      resultingWritebackRefs: []
    }, []);
    const second = recordDramaTurn({ ...first, turnCounter: 30 }, {
      planId: 'plan_char_siu_repeat_receipt',
      status: 'used_as_texture',
      usedSourceRefs: [ref],
      resultingWritebackRefs: []
    }, []);

    expect(first.dramaticContent?.instances).toEqual([]);
    expect(second.dramaticContent?.exposedOfficialDlcSourceRefs).toEqual([ref]);
  });

  it('only creates a bounded instance when a used source produced a persistent writeback', () => {
    const state = createInitialRuntimeState();
    const ref = {
      providerId: 'runtime-dynamic',
      sourceType: 'current_matter' as const,
      sourceId: 'matter_1'
    };
    const textureOnly = recordDramaTurn(state, {
      planId: 'plan_texture',
      status: 'used_as_texture',
      usedSourceRefs: [ref],
      resultingWritebackRefs: []
    }, []);
    const once = recordDramaTurn(textureOnly, {
      planId: 'plan_persistent',
      status: 'used_persistently',
      usedSourceRefs: [ref],
      resultingWritebackRefs: [{ kind: 'current_matter', id: 'matter_1' }]
    }, []);

    expect(textureOnly.dramaticContent?.instances).toEqual([]);
    expect(once.dramaticContent?.instances).toEqual([{
      instanceId: 'plan_persistent:turn_0',
      sourceRefs: [ref],
      resultingWritebackRefs: [{ kind: 'current_matter', id: 'matter_1' }],
      createdTurnId: 'turn_0',
      status: 'active'
    }]);
  });

  it('keeps diagnostics and source history bounded', () => {
    let state = createInitialRuntimeState();
    for (let index = 0; index < 130; index += 1) {
      state = recordDramaTurn(
        { ...state, turnCounter: index },
        {
          planId: `plan_${index}`,
          status: 'used_persistently',
          usedSourceRefs: [{
            providerId: 'runtime-dynamic',
            sourceType: 'signal',
            sourceId: `signal_${index}`
          }],
          resultingWritebackRefs: [{ kind: 'signal', id: `signal_${index}` }]
        },
        [{
          code: 'planning_failed',
          message: `failure ${index}`,
          turnCounter: index
        }]
      );
    }

    expect(state.dramaticContent?.instances).toHaveLength(120);
    expect(state.dramaticContent?.recentDiagnostics).toHaveLength(20);
    expect(state.dramaticContent?.recentDiagnostics[0]?.turnCounter).toBe(110);
  });

  it('reuses the same active arc and records continuity lifecycle instead of duplicating instances', () => {
    const state = createInitialRuntimeState();
    const ref = {
      providerId: 'runtime-dynamic',
      sourceType: 'current_matter' as const,
      sourceId: 'matter_1'
    };
    const contract = {
      planId: 'plan_first',
      mode: 'continue_existing' as const,
      origin: 'main_two_pass' as const,
      primaryArcKey: 'matter:matter_1',
      selectedSourceRefs: [ref],
      evidenceSourceRefs: [ref],
      mandatorySourceRefs: [],
      allowedActorIds: [],
      allowedOrganizationIds: [],
      allowedPlaceIds: [],
      allowedCaseIds: [],
      allowedMatterIds: ['matter_1'],
      allowedRelationshipThreadIds: [],
      allowedCityTrackIds: [],
      maxForegroundArcs: 1,
      maxNewActors: 0,
      maxNewDurableThreads: 1
    };
    const first = recordDramaTurn(
      state,
      {
        planId: 'plan_first',
        status: 'used_persistently',
        usedSourceRefs: [ref],
        resultingWritebackRefs: [{ kind: 'current_matter', id: 'matter_1' }]
      },
      [],
      undefined,
      contract
    );
    const second = recordDramaTurn(
      { ...first, turnCounter: 1 },
      {
        planId: 'plan_second',
        status: 'used_as_texture',
        usedSourceRefs: [ref],
        resultingWritebackRefs: []
      },
      [],
      undefined,
      { ...contract, planId: 'plan_second' }
    );

    expect(second.dramaticContent?.instances).toHaveLength(1);
    expect(second.dramaticContent?.instances[0]).toMatchObject({
      arcKey: 'matter:matter_1',
      lastPlannedTurn: 1,
      lastUsedTurn: 1,
      surfaceCount: 2,
      cooldownUntilTurn: 3
    });
  });

  it('keeps execution receipts bounded without storing prompts or raw model output', () => {
    let state = createInitialRuntimeState();
    for (let index = 0; index < 25; index += 1) {
      state = recordDramaTurn(state, undefined, [], {
        turnCounter: index,
        pacing: 'balanced',
        planningRoute: 'follow-main',
        materialLevel: 'standard',
        storypackInfluence: 'high',
        screenCharacterSeedsEnabled: true,
        planningCalled: false,
        planningSucceeded: true,
        planningDurationMs: 0,
        inputCandidateCount: 0,
        inputCharacterCount: 0,
        estimatedInputTokens: 0,
        supportSourceRefs: [],
        usedSourceRefs: [],
        persistentWriteCount: 0,
        filterRuleIds: []
      });
    }

    expect(state.dramaticContent?.recentExecutions).toHaveLength(20);
    expect(state.dramaticContent?.recentExecutions?.[0]?.turnCounter).toBe(5);
  });
});
