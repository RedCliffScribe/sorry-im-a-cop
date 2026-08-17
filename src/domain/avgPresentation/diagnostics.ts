import type { AvgPresentationSequence } from './types';

function formatOutfitSelection(
  selection: NonNullable<AvgPresentationSequence['diagnostics']>['portraits'][number]['outfitSelection']
): string {
  if (!selection) return 'resource_default';
  if (selection.type === 'resource_default') return selection.type;
  if (selection.type === 'resource_outfit') {
    return `${selection.type}:${selection.basePackId}:${selection.outfitId}`;
  }
  return `${selection.type}:${selection.outfitId}`;
}

export function formatAvgPresentationDiagnostics(sequence: AvgPresentationSequence): string {
  const lines = [
    `Turn: ${sequence.storyEntryTurnId}`,
    `Scene: ${sequence.scene?.sceneAssetId ?? 'unresolved'}`,
    `Scene reason: ${sequence.diagnostics?.scene.matchType ?? sequence.diagnostics?.scene.fallbackReason ?? 'none'}`,
    `Scene override: anchor=${sequence.diagnostics?.scene.overrideAnchor
      ? `${sequence.diagnostics.scene.overrideAnchor.type}:${sequence.diagnostics.scene.overrideAnchor.id}`
      : 'none'} | found=${sequence.diagnostics?.scene.overrideFound ?? false} | valid=${sequence.diagnostics?.scene.overrideValid ?? false} | asset=${sequence.diagnostics?.scene.overrideAssetId ?? 'none'} | underlying=${sequence.diagnostics?.scene.underlyingResolvedSceneAssetId ?? 'none'} | final=${sequence.diagnostics?.scene.finalSource ?? 'none'}`,
    `Environment: time=${sequence.environment.timePhase} | weather=${sequence.environment.weatherKind} (${sequence.environment.weatherIntensity}) | exposure=${sequence.environment.sceneExposure} | lighting=${sequence.environment.lightingProfile}`,
    `Environment grades: scene=${sequence.environment.backgroundGrade.brightness}/${sequence.environment.backgroundGrade.contrast}/${sequence.environment.backgroundGrade.saturation} | portrait=${sequence.environment.portraitGrade.brightness}/${sequence.environment.portraitGrade.contrast}/${sequence.environment.portraitGrade.saturation} | overlays=${sequence.environment.overlays.map((overlay) => overlay.kind).join(',') || 'none'}`,
    `Environment source: time=${sequence.environment.source.timeSource} | weather=${sequence.environment.source.weatherSource} | exposure=${sequence.environment.source.exposureSource}`
  ];
  for (const diagnostic of sequence.diagnostics?.portraits ?? []) {
    lines.push(
      [
        `Block ${diagnostic.blockIndex}`,
        `actor=${diagnostic.actorId ?? 'unbound'}`,
        `source=${diagnostic.source}`,
        `portrait=${diagnostic.portraitSetId ?? 'unresolved'}`,
        `emotion=${diagnostic.requestedEmotion ?? 'n/a'}`,
        `outfitSelection=${formatOutfitSelection(diagnostic.outfitSelection)}`,
        `outfit=${diagnostic.requestedOutfitId ?? 'default'}->${diagnostic.resolvedOutfitId ?? 'none'}`,
        `variant=${diagnostic.resolvedVariant ?? 'none'}`,
        `outfitOverride=${diagnostic.outfitOverrideFound ?? false}/${diagnostic.outfitOverrideValid ?? false}`,
        `outfitOverrideAsset=${diagnostic.outfitOverrideAssetId ?? 'none'}`,
        `override=${diagnostic.overrideFound ?? false}/${diagnostic.overrideValid ?? false}`,
        `overrideAsset=${diagnostic.overrideAssetId ?? 'none'}`,
        `underlying=${diagnostic.underlyingSource ?? 'none'}`,
        `final=${diagnostic.finalSource ?? 'none'}`,
        `reason=${diagnostic.reasons.join(' -> ') || 'none'}`
      ].join(' | ')
    );
  }
  if (sequence.diagnostics?.warnings.length) {
    lines.push(`Warnings: ${sequence.diagnostics.warnings.join(', ')}`);
  }
  return lines.join('\n');
}
