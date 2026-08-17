import { describe, expect, it } from 'vitest';
import {
  getNextPoliceRankTarget,
  isPoliceCommandRank,
  normalizePoliceRankDisplay,
  resolvePoliceRankCode
} from './policeRankCatalog';

describe('policeRankCatalog', () => {
  it.each([
    ['Commissioner of Police（警务处长 CP）', 'cp'],
    ['Deputy Commissioner of Police（副处长 DCP）', 'dcp'],
    ['Senior Assistant Commissioner（高级助理处长 SACP）', 'sacp'],
    ['Assistant Commissioner（助理处长 ACP）', 'acp'],
    ['Chief Superintendent（总警司 CSP）', 'csp'],
    ['Senior Superintendent（高级警司 SSP）', 'ssp'],
    ['Superintendent（警司 SP）', 'sp'],
    ['Chief Inspector（总督察 CIP）', 'cip']
  ] as const)('resolves %s without collapsing it into a broader rank', (rank, code) => {
    expect(resolvePoliceRankCode(rank)).toBe(code);
  });

  it.each([
    ['总督察', '警司'],
    ['警司', '高级警司'],
    ['高级警司', '总警司'],
    ['总警司', '助理处长'],
    ['助理处长', '高级助理处长'],
    ['高级助理处长', '副处长'],
    ['副处长', '警务处长'],
    ['警务处长', undefined]
  ] as const)('keeps the senior promotion chain complete from %s', (rank, target) => {
    expect(getNextPoliceRankTarget(rank)).toBe(target);
  });

  it('treats sergeants and every commissioned rank as command-uniform ranks', () => {
    expect(isPoliceCommandRank('高级警员（SPC）')).toBe(false);
    expect(isPoliceCommandRank('警长（SGT）')).toBe(true);
    expect(isPoliceCommandRank('总督察（CIP）')).toBe(true);
    expect(isPoliceCommandRank('警司（SP）')).toBe(true);
    expect(isPoliceCommandRank('警务处长（CP）')).toBe(true);
  });

  it('returns the canonical bilingual display for senior ranks', () => {
    expect(normalizePoliceRankDisplay('Deputy Commissioner of Police（副处长 DCP）')).toEqual({
      code: 'dcp',
      zh: '副处长',
      en: 'Deputy Commissioner',
      label: '副处长 / Deputy Commissioner'
    });
  });
});
