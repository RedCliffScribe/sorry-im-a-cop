import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf8');

function ruleBlock(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  return match?.[1] ?? '';
}

describe('combat visual animation pacing', () => {
  it('keeps the main character and result animations in a 3-5 second presentation window', () => {
    expect(ruleBlock('.combat-visual-player')).toContain('combatPlayerAct 3600ms');
    expect(ruleBlock('.combat-result-success .combat-visual-enemy')).toContain('combatEnemySubdued 2400ms ease-out 1100ms');
    expect(ruleBlock('.combat-visual-result-stamp')).toContain('combatResultStamp 900ms ease-out 3600ms');
  });

  it('uses multi-beat gunfire and impact effects instead of one-frame flashes', () => {
    expect(ruleBlock('.combat-effect-gunfire .combat-visual-flash')).toContain('combatGunFlash 2400ms');
    expect(css).toMatch(/\.combat-effect-impact \.combat-visual-flash,[\s\S]*combatImpactPulse 2200ms/);
  });
});
