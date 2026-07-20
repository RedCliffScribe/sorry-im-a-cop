import type { NarratorClient } from '../narrator/NarratorClient';
import { estimateNarrativeTokens } from '../narrator/estimateNarrativeTokens';
import { createInitialRuntimeState, type OpeningSetup } from '../runtime/initialState';
import type { RuntimeState } from '../runtime/types';
import type { NarrativeLengthLevel } from '../settings/narrativeLength';
import type { NarrativePerspective, PromptSettings } from '../settings/types';
import { applyOpeningNarratorResponse } from './applyOpeningResponse';
import { composeOpeningPrompt } from './composeOpeningPrompt';
import { validateOpeningNarratorResponse } from './openingSchema';

interface RunOpeningInput {
  setup?: OpeningSetup;
  initialState?: RuntimeState;
  narrator: NarratorClient;
  narrativeLengthLevel?: NarrativeLengthLevel;
  narrativePerspective?: NarrativePerspective;
  promptSettings?: PromptSettings;
  onNarrativeDelta?: (delta: string) => void;
  onRawText?: (rawText: string) => void;
}

export async function runOpening({
  setup = {},
  initialState,
  narrator,
  narrativeLengthLevel,
  narrativePerspective,
  promptSettings,
  onNarrativeDelta,
  onRawText
}: RunOpeningInput) {
  const openingState = initialState ?? createInitialRuntimeState(setup);
  const prompt = composeOpeningPrompt({
    setup,
    initialState: openingState,
    narrativeLengthLevel,
    narrativePerspective,
    promptSettings
  });
  let rawNarratorResponse = '';
  const requestStartedAt = Date.now();
  const rawResponse = await narrator.complete(prompt, {
    onTextDelta: onNarrativeDelta,
    onRawText: (rawText) => {
      rawNarratorResponse = rawText;
      onRawText?.(rawText);
    }
  });
  const responseMs = Date.now() - requestStartedAt;
  const response = validateOpeningNarratorResponse(rawResponse);
  return applyOpeningNarratorResponse(openingState, response, {
    rawNarratorResponse,
    turnMetrics: {
      inputTokens: estimateNarrativeTokens(prompt),
      outputTokens: estimateNarrativeTokens(rawNarratorResponse || JSON.stringify(rawResponse)),
      responseMs
    }
  });
}
