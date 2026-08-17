import { defaultDramaticContentSettings, resolveDramaMaterialBudget } from './settings';
import {
  buildNarrativeArcWritebackReferenceAudit,
  detectNarrativeArcProgressConflicts,
  evaluateNarrativeArcProgress
} from './narrativeArcProgressValidation';
import type {
  DramaPlanningContext,
  NarrativeArcInstance,
  PlanningSource
} from './types';

const officialRef = {
  providerId: 'official-dlc',
  sourceType: 'official_dlc_event',
  sourceId: 'urban_legends_alpha:midnight_bus',
  dlcId: 'urban_legends_alpha'
};

const contract = {
  stageIds: ['street_rumor', 'first_clues', 'interest_conflict'],
  nodeIdsByStage: {
    street_rumor: ['rumor_node'],
    first_clues: ['clue_node'],
    interest_conflict: ['conflict_node']
  },
  allowedNextStageIds: {
    street_rumor: ['first_clues'],
    first_clues: ['interest_conflict'],
    interest_conflict: []
  },
  completionStageIds: ['interest_conflict']
};

const source: PlanningSource = {
  ref: officialRef,
  title: '午夜末班车',
  plannerSummary: '香港夜间巴士传闻。',
  sourceStatus: 'active_process',
  reusePolicy: 'context_reusable',
  priorityClass: 'user_requested',
  channelIds: ['city_news'],
  softAffinities: {},
  mandatory: false,
  score: 90,
  relatedActorIds: [],
  relatedOrganizationIds: [],
  relatedPlaceIds: [],
  relatedCaseIds: [],
  arcKey: 'official-dlc:urban_legends_alpha:midnight_bus',
  arcProgressContract: contract
};

const context: DramaPlanningContext = {
  planningScope: 'turn',
  planningMode: 'official_dlc_only',
  planningRoute: 'official_dlc_only',
  turnCounter: 12,
  currentTime: { year: 1988, month: 9, day: 12, hour: 22, minute: 0 },
  playerInput: '核对车次记录',
  playerRoleContext: {
    identity: 'police',
    publicRole: '警员',
    stableContactActorIds: [],
    activeMatterIds: []
  },
  currentPlaceId: 'place_bus_terminal',
  settings: defaultDramaticContentSettings,
  pacing: defaultDramaticContentSettings.pacing,
  materialBudget: resolveDramaMaterialBudget(defaultDramaticContentSettings),
  recentTurnSummaries: [],
  requiredContextSources: [],
  userPrioritySources: [],
  optionalDynamicSources: [],
  staticSeedSources: [],
  officialDlcSources: [source],
  recentExecutions: [],
  filterRuleIds: []
};

const arc: NarrativeArcInstance = {
  arcInstanceId: 'arc_midnight_bus',
  sourceRef: officialRef,
  arcType: 'official_dlc',
  status: 'active',
  currentStageId: 'street_rumor',
  usedNodeIds: ['rumor_node'],
  createdTurn: 10,
  lastProgressTurn: 11,
  writebackRefs: [{ kind: 'current_matter', id: 'matter_bus' }]
};

const writeback = buildNarrativeArcWritebackReferenceAudit({
  rawResponseRefs: [{ kind: 'current_matter', id: 'matter_bus' }],
  schemaValidatedRefs: [{ kind: 'current_matter', id: 'matter_bus' }],
  acceptedWritebackRefs: [{ kind: 'current_matter', id: 'matter_bus' }]
});

const selected = new Set(['official-dlc:official_dlc_event:urban_legends_alpha:midnight_bus']);

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    arcInstanceId: 'arc_midnight_bus',
    sourceRef: officialRef,
    decision: 'advance_stage',
    currentStageId: 'street_rumor',
    previousStageId: 'street_rumor',
    nextStageId: 'first_clues',
    usedNodeIds: ['rumor_node'],
    supportingWritebackRefs: [{ kind: 'current_matter', id: 'matter_bus' }],
    ...overrides
  };
}

function evaluate(overrides: Record<string, unknown> = {}, options: Partial<Parameters<typeof evaluateNarrativeArcProgress>[0]> = {}) {
  return evaluateNarrativeArcProgress({
    candidate: candidate(overrides),
    context,
    existingNarrativeArcs: [arc],
    status: 'used_persistently',
    selectedSourceKeys: selected,
    usedSourceKeys: selected,
    writebackAudit: writeback,
    ...options
  });
}

describe('Narrative Arc progress rejection forensics', () => {
  it('distinguishes no progress from invalid progress', () => {
    const result = evaluateNarrativeArcProgress({
      candidate: undefined,
      context,
      existingNarrativeArcs: [arc],
      status: 'used_persistently',
      selectedSourceKeys: selected,
      usedSourceKeys: selected,
      writebackAudit: writeback
    });
    expect(result.accepted).toBe(true);
    expect(result.diagnostic.classification).toBe('no_progress_candidate');
    expect(result.diagnostic.rejectionReasons).toEqual([]);
  });

  it('accepts remain without treating it as a rejection', () => {
    const result = evaluate({ decision: 'remain', nextStageId: undefined });
    expect(result.accepted).toBe(true);
    expect(result.diagnostic.classification).toBe('remain');
    expect(result.diagnostic.rejectionReasons).toEqual([]);
  });

  it('accepts a texture-only remain without writeback evidence', () => {
    const result = evaluate({
      decision: 'remain',
      nextStageId: undefined,
      usedNodeIds: [],
      supportingWritebackRefs: []
    }, {
      status: 'used_as_texture',
      writebackAudit: buildNarrativeArcWritebackReferenceAudit({
        rawResponseRefs: [],
        schemaValidatedRefs: [],
        acceptedWritebackRefs: []
      })
    });

    expect(result.accepted).toBe(true);
    expect(result.normalizedProgress?.supportingWritebackRefs).toEqual([]);
    expect(result.diagnostic.classification).toBe('remain');
    expect(result.diagnostic.rejectionReasons).toEqual([]);
  });

  it('does not let an irrelevant bad evidence ref turn remain into an advance rejection', () => {
    const result = evaluate({
      decision: 'remain',
      nextStageId: undefined,
      supportingWritebackRefs: [{ kind: 'current_matter', id: 'missing_matter' }]
    });

    expect(result.accepted).toBe(true);
    expect(result.normalizedProgress?.supportingWritebackRefs).toEqual([]);
    expect(result.diagnostic.classification).toBe('remain');
    expect(result.diagnostic.rejectionReasons).toEqual([]);
  });

  it('uses the locally derived canonical arc id for a first progress receipt', () => {
    const result = evaluate({
      arcInstanceId: 'official_dlc_urban_legends_alpha_midnight_bus',
      decision: 'remain',
      nextStageId: undefined
    }, {
      existingNarrativeArcs: []
    });

    expect(result.accepted).toBe(true);
    expect(result.normalizedProgress?.arcInstanceId).toBe(
      'arc_official-dlc_urban_legends_alpha_midnight_bus'
    );
  });

  it('preserves an already persisted legacy arc id for the same source', () => {
    const legacyArc = {
      ...arc,
      arcInstanceId: 'legacy_arc_midnight_bus'
    };
    const result = evaluate({
      arcInstanceId: 'new_model_arc_id',
      decision: 'remain',
      nextStageId: undefined
    }, {
      existingNarrativeArcs: [legacyArc]
    });

    expect(result.accepted).toBe(true);
    expect(result.normalizedProgress?.arcInstanceId).toBe('legacy_arc_midnight_bus');
  });

  it('accepts Urban Legends street_rumor to first_clues', () => {
    const result = evaluate();
    expect(result.accepted).toBe(true);
    expect(result.diagnostic.classification).toBe('advance_accepted');
    expect(result.diagnostic.writebackReferenceAudit).toEqual(expect.objectContaining({
      rawResponseRefs: [{ kind: 'current_matter', id: 'matter_bus' }],
      schemaValidatedRefs: [{ kind: 'current_matter', id: 'matter_bus' }],
      acceptedWritebackRefs: [{ kind: 'current_matter', id: 'matter_bus' }],
      appliedWritebackRefs: []
    }));
  });

  it('restores canonical official DLC provenance when the model omits optional source metadata', () => {
    const result = evaluate({
      sourceRef: {
        providerId: officialRef.providerId,
        sourceType: officialRef.sourceType,
        sourceId: officialRef.sourceId
      }
    });

    expect(result.accepted).toBe(true);
    expect(result.normalizedProgress?.sourceRef).toEqual(officialRef);
  });

  it('reports an absent arc instance', () => {
    const result = evaluate({ arcInstanceId: '' });
    expect(result.diagnostic.rejectionReasons).toContain('progress_schema_invalid');
    expect(result.diagnostic.rejectionReasons).toContain('arc_instance_missing');
  });

  it('reports source and Arc mismatch', () => {
    const otherRef = { ...officialRef, sourceId: 'urban_legends_alpha:other' };
    const result = evaluate({ sourceRef: otherRef }, {
      selectedSourceKeys: new Set(['official-dlc:official_dlc_event:urban_legends_alpha:other']),
      usedSourceKeys: new Set(['official-dlc:official_dlc_event:urban_legends_alpha:other'])
    });
    expect(result.accepted).toBe(false);
    expect(result.diagnostic.rejectionReasons).toContain('arc_source_mismatch');
  });

  it('reports a source omitted from the selected plan', () => {
    const result = evaluate({}, { selectedSourceKeys: new Set(), usedSourceKeys: new Set() });
    expect(result.diagnostic.rejectionReasons).toContain('source_not_selected');
  });

  it('reports a selected source that was not used', () => {
    const result = evaluate({}, { usedSourceKeys: new Set() });
    expect(result.diagnostic.rejectionReasons).toContain('source_not_used');
  });

  it('reports a current stage mismatch', () => {
    const result = evaluate({ previousStageId: 'first_clues' });
    expect(result.diagnostic.rejectionReasons).toContain('current_stage_mismatch');
  });

  it('reports a missing next stage', () => {
    const result = evaluate({ nextStageId: undefined });
    expect(result.diagnostic.rejectionReasons).toContain('next_stage_missing');
  });

  it('reports an unknown next stage', () => {
    const result = evaluate({ nextStageId: 'not_a_stage' });
    expect(result.diagnostic.rejectionReasons).toContain('next_stage_unknown');
  });

  it('reports a disallowed transition', () => {
    const result = evaluate({ nextStageId: 'interest_conflict' });
    expect(result.diagnostic.rejectionReasons).toContain('transition_not_allowed');
  });

  it('reports completion outside the provider-declared terminal stage', () => {
    const rejected = evaluate({ decision: 'complete', nextStageId: undefined });
    expect(rejected.accepted).toBe(false);
    expect(rejected.diagnostic.classification).toBe('complete_rejected');
    expect(rejected.diagnostic.rejectionReasons).toContain('transition_not_allowed');

    const terminalArc = { ...arc, currentStageId: 'interest_conflict' };
    const accepted = evaluate({
      decision: 'complete',
      currentStageId: 'interest_conflict',
      previousStageId: 'interest_conflict',
      nextStageId: undefined,
      usedNodeIds: ['conflict_node']
    }, {
      existingNarrativeArcs: [terminalArc]
    });
    expect(accepted.accepted).toBe(true);
    expect(accepted.diagnostic.classification).toBe('complete_accepted');
  });

  it('reports an unknown node', () => {
    const result = evaluate({ usedNodeIds: ['not_a_node'] });
    expect(result.diagnostic.rejectionReasons).toContain('node_id_unknown');
  });

  it('reports a node outside the current stage contract', () => {
    const result = evaluate({ usedNodeIds: ['clue_node'] });
    expect(result.diagnostic.rejectionReasons).toContain('node_not_in_current_contract');
  });

  it('reports malformed supporting refs', () => {
    const result = evaluate({ supportingWritebackRefs: [{ kind: 'current_matter' }] });
    expect(result.diagnostic.rejectionReasons).toContain('progress_schema_invalid');
    expect(result.diagnostic.rejectionReasons).toContain('supporting_writeback_ref_invalid');
  });

  it('reports a ref absent from the raw response', () => {
    const result = evaluate({ supportingWritebackRefs: [{ kind: 'signal', id: 'missing' }] });
    expect(result.diagnostic.rejectionReasons).toContain('supporting_writeback_ref_not_in_raw_response');
  });

  it('reports a ref dropped by Schema validation', () => {
    const result = evaluate({}, {
      writebackAudit: buildNarrativeArcWritebackReferenceAudit({
        rawResponseRefs: [{ kind: 'current_matter', id: 'matter_bus' }],
        schemaValidatedRefs: [],
        acceptedWritebackRefs: []
      })
    });
    expect(result.diagnostic.rejectionReasons).toContain('supporting_writeback_ref_dropped_by_validation');
  });

  it('reports a ref outside the accepted writeback subset', () => {
    const result = evaluate({}, {
      writebackAudit: buildNarrativeArcWritebackReferenceAudit({
        rawResponseRefs: [{ kind: 'current_matter', id: 'matter_bus' }],
        schemaValidatedRefs: [{ kind: 'current_matter', id: 'matter_bus' }],
        acceptedWritebackRefs: []
      })
    });
    expect(result.diagnostic.rejectionReasons).toContain('supporting_writeback_ref_not_subset');
  });

  it('reports a ref that was not applied at runtime', () => {
    const result = evaluate({}, {
      writebackAudit: buildNarrativeArcWritebackReferenceAudit({
        rawResponseRefs: [{ kind: 'current_matter', id: 'matter_bus' }],
        schemaValidatedRefs: [{ kind: 'current_matter', id: 'matter_bus' }],
        acceptedWritebackRefs: [{ kind: 'current_matter', id: 'matter_bus' }],
        appliedWritebackRefs: [],
        appliedCheckAvailable: true
      })
    });
    expect(result.diagnostic.rejectionReasons).toContain('supporting_writeback_ref_not_applied');
  });

  it('accepts canonical writeback aliases without losing the ref', () => {
    const result = evaluate({}, {
      writebackAudit: buildNarrativeArcWritebackReferenceAudit({
        rawResponseRefs: [{ kind: 'currentMatterPatches', id: 'matter_bus' }],
        schemaValidatedRefs: [{ kind: 'currentMatterPatches', id: 'matter_bus' }],
        acceptedWritebackRefs: [{ kind: 'currentMatterPatches', id: 'matter_bus' }]
      })
    });
    expect(result.accepted).toBe(true);
    expect(result.diagnostic.supportingWritebackRefs[0]?.passedSchemaValidation).toBe(true);
  });

  it('accepts an actor ref after an explicit stable-ID canonicalization', () => {
    const temporaryActorId = 'npc_generated_bus_driver';
    const canonicalActorId = 'npc_canonical_bus_driver';
    const result = evaluate({
      supportingWritebackRefs: [{ kind: 'actor', id: temporaryActorId }]
    }, {
      writebackAudit: buildNarrativeArcWritebackReferenceAudit({
        rawResponseRefs: [{ kind: 'actor', id: canonicalActorId }],
        schemaValidatedRefs: [{ kind: 'actor', id: canonicalActorId }],
        acceptedWritebackRefs: [{ kind: 'actor', id: canonicalActorId }],
        appliedWritebackRefs: [{ kind: 'actor', id: canonicalActorId }],
        appliedCheckAvailable: true
      }),
      canonicalizeWritebackRef: (ref) => (
        ref.kind === 'actor' && ref.id === temporaryActorId
          ? { ...ref, id: canonicalActorId }
          : ref
      )
    });

    expect(result.accepted).toBe(true);
    expect(result.diagnostic.advisoryReasons).toContain(
      'writeback_ref_canonicalization_mismatch'
    );
    expect(result.diagnostic.supportingWritebackRefs[0]).toEqual(
      expect.objectContaining({
        originalRefId: temporaryActorId,
        normalizedRefId: canonicalActorId,
        appliedToRuntime: true
      })
    );
  });

  it('does not canonicalize an unrelated writeback kind through an actor alias', () => {
    const result = evaluate({
      supportingWritebackRefs: [{ kind: 'current_matter', id: 'npc_generated_bus_driver' }]
    }, {
      writebackAudit: buildNarrativeArcWritebackReferenceAudit({
        rawResponseRefs: [{ kind: 'current_matter', id: 'npc_canonical_bus_driver' }],
        schemaValidatedRefs: [{ kind: 'current_matter', id: 'npc_canonical_bus_driver' }],
        acceptedWritebackRefs: [{ kind: 'current_matter', id: 'npc_canonical_bus_driver' }]
      }),
      canonicalizeWritebackRef: (ref) => (
        ref.kind === 'actor' && ref.id === 'npc_generated_bus_driver'
          ? { ...ref, id: 'npc_canonical_bus_driver' }
          : ref
      )
    });

    expect(result.accepted).toBe(false);
    expect(result.diagnostic.rejectionReasons).toContain(
      'supporting_writeback_ref_not_in_raw_response'
    );
    expect(result.diagnostic.advisoryReasons ?? []).not.toContain(
      'writeback_ref_canonicalization_mismatch'
    );
  });

  it('classifies duplicate and conflicting candidates without changing the gate', () => {
    const duplicate = candidate();
    const conflict = candidate({ nextStageId: 'interest_conflict' });
    expect(detectNarrativeArcProgressConflicts([candidate(), duplicate])).toEqual([
      { index: 1, reasons: ['duplicate_progress_candidate'] }
    ]);
    expect(detectNarrativeArcProgressConflicts([candidate(), conflict])).toEqual([
      { index: 1, reasons: ['conflicting_progress_candidate'] }
    ]);
    expect(evaluate({}).accepted).toBe(true);
  });

  it('accepts a custom long-event Arc through the same evaluator', () => {
    const customRef = {
      providerId: 'custom-event-group',
      sourceType: 'custom_event_group_instance',
      sourceId: 'custom-instance:long-arc'
    };
    const customSource: PlanningSource = {
      ...source,
      ref: customRef,
      arcProgressContract: {
        stageIds: ['stage_a', 'stage_b'],
        nodeIdsByStage: { stage_a: ['node_a'], stage_b: ['node_b'] },
        allowedNextStageIds: { stage_a: ['stage_b'], stage_b: [] }
      }
    };
    const customContext = { ...context, officialDlcSources: [], requiredContextSources: [customSource] };
    const result = evaluateNarrativeArcProgress({
      candidate: {
        ...candidate(),
        arcInstanceId: 'arc_custom',
        sourceRef: customRef,
        currentStageId: 'stage_a',
        previousStageId: undefined,
        nextStageId: 'stage_b',
        usedNodeIds: ['node_a']
      },
      context: customContext,
      existingNarrativeArcs: [],
      status: 'used_persistently',
      selectedSourceKeys: new Set(['custom-event-group:custom_event_group_instance:custom-instance:long-arc']),
      usedSourceKeys: new Set(['custom-event-group:custom_event_group_instance:custom-instance:long-arc']),
      writebackAudit: writeback
    });
    expect(result.accepted).toBe(true);
  });
});
