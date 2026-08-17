import { describe, expect, it } from 'vitest';
import {
  DEFAULT_API_MAX_TOKENS,
  resolveOpeningRepairStageBudget,
  resolveRequestOutputBudget
} from './narratorLimits';

describe('resolveRequestOutputBudget', () => {
  it('uses the stage budget below a larger player route limit', () => {
    expect(
      resolveRequestOutputBudget({
        configuredMaxTokens: 32_768,
        stageMaxTokens: 4_096
      })
    ).toEqual({
      configuredMaxTokens: 32_768,
      configuredMaxTokensSource: 'player_route',
      stageMaxTokens: 4_096,
      requestedMaxTokens: 4_096,
      limitingSource: 'stage_budget'
    });
  });

  it('never lets an opening stage exceed a smaller player route limit', () => {
    expect(
      resolveRequestOutputBudget({
        configuredMaxTokens: 2_048,
        stageMaxTokens: 12_288
      }).requestedMaxTokens
    ).toBe(2_048);
  });

  it('applies a declared provider capability after both local limits', () => {
    expect(
      resolveRequestOutputBudget({
        configuredMaxTokens: 32_768,
        stageMaxTokens: 12_288,
        providerMaxOutputTokens: 8_192
      })
    ).toMatchObject({
      providerMaxOutputTokens: 8_192,
      requestedMaxTokens: 8_192,
      limitingSource: 'provider_capability'
    });
  });

  it('uses the system default when the route does not declare a limit', () => {
    expect(resolveRequestOutputBudget({ stageMaxTokens: 40_000 })).toMatchObject(
      {
        configuredMaxTokens: DEFAULT_API_MAX_TOKENS,
        configuredMaxTokensSource: 'system_default',
        requestedMaxTokens: DEFAULT_API_MAX_TOKENS,
        limitingSource: 'configured_max_tokens'
      }
    );
  });

  it.each([32_768, 65_536])(
    'lets opening repairs inherit a configured route limit of %i',
    (configuredMaxTokens) => {
      expect(resolveOpeningRepairStageBudget(configuredMaxTokens)).toBe(
        configuredMaxTokens
      );
      expect(
        resolveRequestOutputBudget({
          configuredMaxTokens,
          stageMaxTokens:
            resolveOpeningRepairStageBudget(configuredMaxTokens)
        })
      ).toMatchObject({
        configuredMaxTokens,
        stageMaxTokens: configuredMaxTokens,
        requestedMaxTokens: configuredMaxTokens,
        limitingSource: 'configured_max_tokens'
      });
    }
  );

  it('uses the system route default for repairs when no route limit is declared', () => {
    expect(resolveOpeningRepairStageBudget()).toBe(DEFAULT_API_MAX_TOKENS);
  });
});
