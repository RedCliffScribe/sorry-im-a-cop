import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { CaseFile, FixedAsset, GameTime, RuntimeState, StandardAssetItem } from '../runtime/types';
import { submitAssetEvidenceToCase } from './submitEvidence';

const time: GameTime = {
  year: 1988,
  month: 9,
  day: 12,
  hour: 21,
  minute: 30
};

function caseFile(caseId: string, overrides: Partial<CaseFile> = {}): CaseFile {
  return {
    caseId,
    title: 'Bar assault',
    caseType: 'assault',
    status: 'investigating',
    playerRole: 'assist',
    summary: 'A bar assault case.',
    currentFocus: 'Collect useful evidence.',
    playerVisibleProgress: 'The player is assigned to collect evidence.',
    internalProgressSummary: '',
    relatedActorIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    evidenceIds: [],
    activityLog: [],
    unreadActivityCount: 2,
    visibility: 'player_known',
    createdAt: time,
    updatedAt: time,
    ...overrides
  };
}

function documentItem(itemId: string, overrides: Partial<Omit<StandardAssetItem, 'category'>> = {}): StandardAssetItem {
  return {
    itemId,
    category: 'document',
    name: 'Bar owner statement',
    summary: 'A signed statement from the bar owner.',
    detail: 'The statement mentions two men leaving through the back door.',
    evidence: {
      caseId: 'case_bar_assault',
      caseTitle: 'Bar assault',
      summary: 'The owner saw two men leave through the back door.',
      disputed: false
    },
    relatedActorIds: ['actor_bar_owner'],
    relatedCaseIds: ['case_bar_assault'],
    relatedPlaceIds: ['place_bar'],
    visibility: 'player_known',
    importance: 70,
    ...overrides
  };
}

function equipmentItem(itemId: string, overrides: Partial<Omit<StandardAssetItem, 'category'>> = {}): StandardAssetItem {
  return {
    itemId,
    category: 'equipment',
    name: 'Bloodstained baton',
    summary: 'A baton with possible blood stains.',
    evidence: {
      caseId: 'case_bar_assault',
      summary: 'The baton may connect the fight to a patrol officer.',
      disputed: true,
      disputeSummary: 'The source of the stain has not been explained in the story.'
    },
    relatedActorIds: ['actor_patrolman'],
    relatedCaseIds: ['case_bar_assault'],
    relatedPlaceIds: ['place_bar'],
    visibility: 'player_known',
    importance: 80,
    ...overrides
  };
}

function fixedAsset(itemId: string, overrides: Partial<Omit<FixedAsset, 'category'>> = {}): FixedAsset {
  return {
    itemId,
    category: 'fixedAsset',
    name: 'Rented flat',
    summary: 'A rented flat.',
    evidence: {
      caseId: 'case_bar_assault',
      summary: 'Not valid for direct evidence submission.',
      disputed: false
    },
    relatedActorIds: [],
    relatedCaseIds: ['case_bar_assault'],
    relatedPlaceIds: ['place_flat'],
    visibility: 'player_known',
    importance: 40,
    fixedAssetType: 'residence',
    holdingRelation: 'rented',
    primaryUse: 'home',
    locationSummary: 'Mong Kok',
    ownershipSummary: 'Rented by the player.',
    accessSummary: 'Player can use it.',
    incomeSettlementItemIds: [],
    expenseSettlementItemIds: [],
    ...overrides
  };
}

function createState(): RuntimeState {
  const state = createInitialRuntimeState();
  state.time = time;
  state.cases.case_bar_assault = caseFile('case_bar_assault');
  return state;
}

describe('submitAssetEvidenceToCase', () => {
  it('submits a document item as case evidence and removes it from assets', () => {
    const state = createState();
    state.assets.items.statement = documentItem('statement');

    const next = submitAssetEvidenceToCase(state, {
      caseId: 'case_bar_assault',
      itemId: 'statement'
    });

    const evidenceIds = Object.keys(next.caseEvidence);
    expect(evidenceIds).toHaveLength(1);
    const evidence = next.caseEvidence[evidenceIds[0]];
    expect(evidence).toMatchObject({
      caseId: 'case_bar_assault',
      title: 'Bar owner statement',
      evidenceType: 'document',
      sourceSummary: 'A signed statement from the bar owner.',
      summary: 'The owner saw two men leave through the back door.',
      submittedByActorId: 'player',
      relatedActorIds: ['actor_bar_owner'],
      relatedPlaceIds: ['place_bar'],
      relatedAssetItemId: 'statement',
      visibility: 'player_known'
    });
    expect(next.assets.items.statement).toBeUndefined();
    expect(next.cases.case_bar_assault.evidenceIds).toEqual([evidence.evidenceId]);
    expect(next.cases.case_bar_assault.activityLog.at(-1)).toMatchObject({
      kind: 'evidence_added',
      summary: '提交证据：Bar owner statement',
      relatedEvidenceIds: [evidence.evidenceId],
      visibleToPlayer: true
    });
    expect(next.cases.case_bar_assault.unreadActivityCount).toBe(2);
  });

  it('removes an equipped equipment item from equipment slots and player equipment', () => {
    const state = createState();
    state.assets.items.baton = equipmentItem('baton');
    state.assets.equippedItemIds = ['baton'];
    state.player.equipment = ['Bloodstained baton'];
    state.actors.player.equipment = ['Bloodstained baton'];

    const next = submitAssetEvidenceToCase(state, {
      caseId: 'case_bar_assault',
      itemId: 'baton'
    });

    const evidence = Object.values(next.caseEvidence)[0];
    expect(evidence.evidenceType).toBe('physical');
    expect(evidence.disputeSummary).toBe('The source of the stain has not been explained in the story.');
    expect(next.assets.items.baton).toBeUndefined();
    expect(next.assets.equippedItemIds).toEqual([]);
    expect(next.player.equipment).toEqual([]);
    expect(next.actors.player.equipment).toEqual([]);
  });

  it('rejects fixed assets and vehicles', () => {
    const state = createState();
    state.assets.items.flat = fixedAsset('flat');

    expect(() =>
      submitAssetEvidenceToCase(state, {
        caseId: 'case_bar_assault',
        itemId: 'flat'
      })
    ).toThrow('Only standard asset items can be submitted as case evidence.');
  });

  it('rejects item evidence linked to a different case', () => {
    const state = createState();
    state.assets.items.statement = documentItem('statement', {
      evidence: {
        caseId: 'case_other',
        summary: 'Different case.',
        disputed: false
      }
    });

    expect(() =>
      submitAssetEvidenceToCase(state, {
        caseId: 'case_bar_assault',
        itemId: 'statement'
      })
    ).toThrow('Asset evidence case does not match target case.');
  });
});
