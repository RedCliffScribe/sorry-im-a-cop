import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState, withRuntimeDefaults } from './initialState';
import type { CaseEvidence, DeferredEvent, RuntimeState } from './types';

describe('case runtime state', () => {
  it('creates empty case, deferred-event, and background-evolution stores for new runtime states', () => {
    const state = createInitialRuntimeState();

    expect(state.cases).toEqual({});
    expect(state.caseEvidence).toEqual({});
    expect(state.deferredEvents).toEqual({});
    expect(state.backgroundEvolution).toEqual({
      npcTracks: {},
      organizationTracks: {},
      npcReviewCooldownUntil: {},
      recentOutcomes: [],
      chronicle: [],
      lastAppliedAt: undefined,
      lastOrganizationReviewAt: undefined
    });
  });

  it('preserves existing case evidence and deferred events when applying runtime defaults', () => {
    const state = createInitialRuntimeState();
    const evidence: CaseEvidence = {
      evidenceId: 'evidence_bar_statement',
      caseId: 'case_bar_assault',
      title: 'Witness statement from the bar owner',
      evidenceType: 'statement',
      sourceSummary: 'Recorded by the player after questioning the bar owner.',
      summary: 'The owner saw two men leave through the back door after the assault.',
      submittedByActorId: 'player',
      submittedAt: state.time,
      relatedActorIds: ['player'],
      relatedPlaceIds: ['place_mong_kok_police_station'],
      relatedAssetItemId: 'asset_statement_bar_owner',
      visibility: 'player_known',
      createdAt: state.time,
      updatedAt: state.time
    };
    const deferredEvent: DeferredEvent = {
      eventId: 'deferred_prosecution_reply',
      sourceModule: 'case',
      relatedIds: {
        caseId: 'case_bar_assault'
      },
      title: 'Prosecutions Division reply',
      summary: 'The submitted opinion is waiting for prosecutorial review.',
      triggerAt: { ...state.time, day: state.time.day + 3 },
      visibility: 'hidden',
      promptInstruction: 'When due, decide whether prosecutors accept, request more evidence, or return the file.',
      status: 'pending',
      createdAt: state.time
    };

    const normalized = withRuntimeDefaults({
      ...state,
      caseEvidence: {
        [evidence.evidenceId]: evidence
      },
      deferredEvents: {
        [deferredEvent.eventId]: deferredEvent
      }
    } as RuntimeState);

    expect(normalized.caseEvidence[evidence.evidenceId]).toEqual(evidence);
    expect(normalized.deferredEvents[deferredEvent.eventId]).toEqual(deferredEvent);
  });

  it('fills a missing background evolution store without changing existing case state', () => {
    const state = createInitialRuntimeState();
    const legacyLikeState = { ...state } as Omit<RuntimeState, 'backgroundEvolution'> & {
      backgroundEvolution?: RuntimeState['backgroundEvolution'];
    };
    delete legacyLikeState.backgroundEvolution;

    const normalized = withRuntimeDefaults(legacyLikeState as RuntimeState);

    expect(normalized.backgroundEvolution).toEqual({
      npcTracks: {},
      organizationTracks: {},
      npcReviewCooldownUntil: {},
      recentOutcomes: [],
      chronicle: [],
      lastAppliedAt: undefined,
      lastOrganizationReviewAt: undefined
    });
    expect(normalized.cases).toEqual(state.cases);
  });

  it('repairs legacy lead cases that did not persist the player as lead actor', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.actors[state.player.actorId].name = '陈厚生';
    state.cases.case_legacy_lead = {
      caseId: 'case_legacy_lead',
      title: '旧存档主办案件',
      caseType: 'organized_financial_crime',
      status: 'investigating',
      playerRole: 'lead',
      summary: '玩家已经获授权主办。',
      currentFocus: '追查资金流向。',
      playerVisibleProgress: '玩家已成为主办者。',
      internalProgressSummary: '等待下一步行动。',
      relatedActorIds: [state.player.actorId],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      evidenceIds: [],
      activityLog: [],
      unreadActivityCount: 0,
      visibility: 'player_known',
      createdAt: state.time,
      updatedAt: state.time
    };

    const normalized = withRuntimeDefaults(state);

    expect(normalized.cases.case_legacy_lead).toMatchObject({
      playerRole: 'lead',
      leadActorId: state.player.actorId,
      leadActorName: '陈厚生'
    });
  });
});
