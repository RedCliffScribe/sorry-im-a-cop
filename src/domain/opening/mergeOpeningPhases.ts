import type { OpeningBlueprint } from './openingBlueprintSchema';
import type { OpeningInitialization } from './openingInitializationSchema';
import {
  validateOpeningNarratorResponse,
  type OpeningNarratorResponse
} from './openingSchema';

export function mergeOpeningPhases(
  blueprint: OpeningBlueprint,
  initialization: OpeningInitialization
): OpeningNarratorResponse {
  return validateOpeningNarratorResponse({
    narrativeText: initialization.narrativeText,
    presentationHints: initialization.presentationHints,
    suggestedActions: initialization.suggestedActions.map((action) => action.text),
    playerPatch: {
      ...blueprint.playerPresentationPatch,
      ...initialization.playerStatePatch
    },
    financePatch: initialization.financePatch,
    initialActors: blueprint.initialActors,
    memories: initialization.memories ?? [],
    secretFacts: initialization.secretFacts ?? [],
    pressureSeeds: initialization.pressureSeeds ?? [],
    grayLedger: initialization.grayLedger ?? [],
    casePatches: initialization.casePatches ?? [],
    caseEvidencePatches: initialization.caseEvidencePatches ?? [],
    currentMatterPatches: initialization.currentMatterPatches ?? [],
    deferredEventPatches: initialization.deferredEventPatches ?? [],
    assetPatch: initialization.assetPatch
  });
}
