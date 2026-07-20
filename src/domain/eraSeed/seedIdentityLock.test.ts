import { describe, expect, it } from 'vitest';
import { findSeedIdentityMatch, redactSeedProtectedNames, seedRuntimeActorId } from './seedIdentityLock';

describe('seed identity lock', () => {
  it('matches Chinese names, English names and aliases to one canonical seed identity', () => {
    expect(seedRuntimeActorId('fig_jacky_crooner_rising')).toBe('npc_seed_fig_jacky_crooner_rising');

    const realNameMatch = findSeedIdentityMatch('张学友');
    const englishNameMatch = findSeedIdentityMatch('Jacky Cheung');
    const safeAliasMatch = findSeedIdentityMatch('学友仔');

    expect(realNameMatch).toMatchObject({
      canonicalSeedId: 'fig_jacky_crooner_rising',
      displayName: '张学友',
      englishName: 'Jacky Cheung',
      runtimeActorId: 'npc_seed_fig_jacky_crooner_rising',
      matchedBy: 'displayName'
    });
    expect(englishNameMatch).toMatchObject({ matchedBy: 'englishName' });
    expect(safeAliasMatch?.canonicalSeedId).toBe(realNameMatch?.canonicalSeedId);
  });

  it('keeps canonical public names unchanged during legacy redaction handling', () => {
    const match = findSeedIdentityMatch('张学友');

    expect(match).toBeTruthy();
    expect(redactSeedProtectedNames('张学友在电台后台被记者追问。', match!)).toBe('张学友在电台后台被记者追问。');
  });
});
