import { describe, expect, it } from 'vitest';
import {
  urbanLegendsAlphaToFormalIdentityAudit,
  urbanLegendsFormalCharacters,
  urbanLegendsFormalIds,
  urbanLegendsFormalPlaces
} from './content';
import {
  getUrbanLegendsFormalNodeContract,
  getUrbanLegendsFormalStageContract,
  urbanLegendsFormalStageContracts
} from './stageContracts';

describe('Urban Legends formal Phase 2C stage contracts', () => {
  it('defines five formal stages and fifteen formal nodes with unique stable IDs', () => {
    const stages = urbanLegendsFormalStageContracts;
    const nodes = stages.flatMap((stage) => stage.nodes);
    expect(stages).toHaveLength(5);
    expect(nodes).toHaveLength(15);
    expect(new Set(stages.map((stage) => stage.stageId)).size).toBe(5);
    expect(new Set(nodes.map((node) => node.nodeId)).size).toBe(15);
    expect(stages.map((stage) => stage.semanticKey)).toEqual([
      'street_rumor',
      'first_clues',
      'interest_conflict',
      'truth_investigation',
      'aftermath'
    ]);
  });

  it('maps every frozen Alpha Stage and Node to a distinct formal counterpart', () => {
    const stageAudit = urbanLegendsAlphaToFormalIdentityAudit.filter(
      (entry) => entry.assetType === 'stage'
    );
    const nodeAudit = urbanLegendsAlphaToFormalIdentityAudit.filter(
      (entry) => entry.assetType === 'node'
    );
    expect(stageAudit.map((entry) => entry.formalId)).toEqual(
      urbanLegendsFormalStageContracts.map((stage) => stage.stageId)
    );
    expect(nodeAudit.map((entry) => entry.formalId)).toEqual(
      urbanLegendsFormalStageContracts.flatMap((stage) =>
        stage.nodes.map((node) => node.nodeId)
      )
    );
    expect(
      [...stageAudit, ...nodeAudit].every(
        (entry) => entry.alphaId !== entry.formalId && entry.formalId?.includes('hk1988')
      )
    ).toBe(true);
  });

  it('allows only the linear narrative-function transition chain without skip-ahead', () => {
    expect(urbanLegendsFormalStageContracts.map((stage) => stage.allowedNextStageIds)).toEqual([
      [urbanLegendsFormalIds.stages.firstClues],
      [urbanLegendsFormalIds.stages.interestConflict],
      [urbanLegendsFormalIds.stages.truthInvestigation],
      [urbanLegendsFormalIds.stages.aftermath],
      []
    ]);
  });

  it('requires structured world evidence and rejects counters, prose and judgement-only progress', () => {
    for (const stage of urbanLegendsFormalStageContracts) {
      expect(stage.narrativeFunction.length).toBeGreaterThan(20);
      expect(stage.permittedFactKinds.length).toBeGreaterThan(2);
      expect(stage.advanceEvidence.requiresStructuredWorldChange).toBe(true);
      expect(stage.advanceEvidence.signals.length).toBeGreaterThan(2);
      expect(stage.advanceEvidence.insufficientOnTheirOwn.length).toBeGreaterThan(2);
      expect(stage.progressDecisionGuidance.remainWhen.length).toBeGreaterThan(1);
      expect(stage.progressDecisionGuidance.advanceOrCompleteWhen.length).toBeGreaterThan(1);
      expect(stage.progressDecisionGuidance.transitionMeaning.length).toBeGreaterThan(20);
      expect(stage.forbiddenConfirmations.length).toBeGreaterThan(2);
      expect(stage.nodes).toHaveLength(3);
    }
    const insufficientEvidence = urbanLegendsFormalStageContracts
      .flatMap((stage) => stage.advanceEvidence.insufficientOnTheirOwn)
      .join('\n');
    expect(insufficientEvidence).toMatch(/回合|节点/);
    expect(insufficientEvidence).toMatch(/判定|世界事实/);
    expect(insufficientEvidence).toMatch(/旁白|模型/);
  });

  it('keeps identity adaptations distinct while all identities remain represented', () => {
    for (const stage of urbanLegendsFormalStageContracts) {
      expect(Object.keys(stage.identityAdaptationHints)).toEqual([
        'police',
        'civilian',
        'gang_member'
      ]);
      expect(stage.identityAdaptationHints.police.join('\n')).not.toBe(
        stage.identityAdaptationHints.civilian.join('\n')
      );
      expect(stage.identityAdaptationHints.civilian.join('\n')).not.toBe(
        stage.identityAdaptationHints.gang_member.join('\n')
      );
    }
  });

  it('never auto-creates cases and never lets a stage block formally grounded case work', () => {
    for (const stage of urbanLegendsFormalStageContracts) {
      expect(stage.caseBoundary).toMatchObject({
        automaticFromStageEntry: false,
        stageBlocksFormalProcedure: false,
        requiresExistingRuntimeGates: true
      });
      expect(stage.caseBoundary.allowedConditions.length).toBeGreaterThan(0);
      expect(stage.caseBoundary.forbiddenConditions.length).toBeGreaterThan(0);
    }
    const streetRumor = urbanLegendsFormalStageContracts[0];
    expect(streetRumor?.allowedWritebackKinds).toContain('case');
    expect(streetRumor?.caseBoundary.allowedConditions.join('\n')).toMatch(/正式报案|立案|既有案件/);
    expect(streetRumor?.caseBoundary.forbiddenConditions.join('\n')).toMatch(/进入 DLC|听到传闻|street_rumor/);
  });

  it('keeps every node inside known actor, place, stage and writeback boundaries', () => {
    const actorIds = new Set(urbanLegendsFormalCharacters.map((character) => character.actorId));
    const placeIds = new Set(urbanLegendsFormalPlaces.map((place) => place.placeId));
    for (const stage of urbanLegendsFormalStageContracts) {
      const stageWritebacks = new Set(stage.allowedWritebackKinds);
      for (const node of stage.nodes) {
        expect(node.compatibleIdentities.length).toBeGreaterThan(0);
        expect(node.relevantActorIds.every((actorId) => actorIds.has(actorId))).toBe(true);
        expect(node.relevantPlaceIds.every((placeId) => placeIds.has(placeId))).toBe(true);
        expect(node.allowedWritebackKinds.every((kind) => stageWritebacks.has(kind))).toBe(true);
        expect(node.permittedFactKinds.length).toBeGreaterThan(1);
        expect(node.progressSignals.length).toBeGreaterThan(1);
        expect(node.forbiddenConfirmations.length).toBeGreaterThan(1);
      }
    }
  });

  it('preserves ambiguity, era boundaries and player exit throughout the contracts', () => {
    const contractText = JSON.stringify(urbanLegendsFormalStageContracts);
    expect(
      urbanLegendsFormalStageContracts.every(
        (stage) =>
          !stage.caseBoundary.automaticFromStageEntry &&
          !stage.caseBoundary.stageBlocksFormalProcedure
      )
    ).toBe(true);
    expect(contractText).toMatch(/手机定位|现代联网监控/);
    expect(contractText).toMatch(/忽略|离开|退出|停止调查/);
    expect(contractText).toMatch(/不.*超自然|鬼魂|灵异/);
    expect(contractText).not.toContain('超自然已被客观证实');
  });

  it('resolves formal stage and node contracts by exact stable ID only', () => {
    expect(getUrbanLegendsFormalStageContract(urbanLegendsFormalIds.stages.firstClues)).toMatchObject({
      semanticKey: 'first_clues'
    });
    expect(getUrbanLegendsFormalNodeContract(urbanLegendsFormalIds.nodes.driverTestimony)).toMatchObject({
      semanticKey: 'driver_testimony'
    });
    expect(getUrbanLegendsFormalStageContract('first_clues')).toBeUndefined();
    expect(getUrbanLegendsFormalNodeContract('driver_testimony')).toBeUndefined();
  });
});
