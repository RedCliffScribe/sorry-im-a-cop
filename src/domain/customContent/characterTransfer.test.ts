// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  parseGeneratedCustomCharacterDraft
} from './characterCreation';
import { saveCustomCharacterRevision } from './characterManagement';
import {
  createCustomCharacterPackage,
  importCustomCharacterPackage,
  parseCustomCharacterPackage,
  serializeCustomCharacterPackage
} from './characterTransfer';
import { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';

function draft() {
  return parseGeneratedCustomCharacterDraft({
    displayName: '何志明',
    aliases: [],
    gender: '男',
    profileSummary: '夜班探员。',
    backgroundSummary: '长期处理街头案件。',
    corePersonality: ['耐心'],
    values: ['责任'],
    coreMotivations: ['找出真相'],
    majorRelationships: [],
    temporalPolicy: 'preserve_life_stage',
    lockedFields: [],
    adaptableFields: []
  });
}

async function exportedCharacter() {
  const source = new IndexedDbCustomContentRepository(
    `character-transfer-source-${crypto.randomUUID()}`
  );
  const saved = await saveCustomCharacterRevision({
    repository: source,
    input: {
      draft: draft(),
      deployments: [
        {
          worldpackId: 'hk_1988',
          mode: 'native',
          defaultEnabledForNewGame: true
        }
      ],
      global: true,
      projectIds: [],
      mode: 'publish'
    },
    dependencies: {
      createId: () => 'character-exported',
      now: () => '2026-07-26T00:00:00.000Z'
    }
  });
  return createCustomCharacterPackage({
    asset: saved.asset,
    revision: saved.revision,
    exportedAt: '2026-07-26T01:00:00.000Z'
  });
}

describe('single custom character transfer', () => {
  it('exports a strict quarantined package without enabling imported content', async () => {
    const packageValue = await exportedCharacter();
    const parsed = await parseCustomCharacterPackage(
      serializeCustomCharacterPackage(packageValue)
    );

    expect(parsed.sourceRevisionRef).toMatchObject({
      assetKind: 'character',
      assetId: 'character-exported',
      revision: 1
    });
    expect(parsed.revision.lifecycle).toEqual({
      generationStatus: 'ready',
      reviewStatus: 'needs_review',
      availabilityStatus: 'disabled'
    });
  });

  it('imports atomically, recognizes an identical package, and rejects checksum tampering', async () => {
    const packageValue = await exportedCharacter();
    const serialized = serializeCustomCharacterPackage(packageValue);
    const target = new IndexedDbCustomContentRepository(
      `character-transfer-target-${crypto.randomUUID()}`
    );

    await expect(
      importCustomCharacterPackage({
        repository: target,
        input: serialized,
        importedAt: '2026-07-26T02:00:00.000Z'
      })
    ).resolves.toBe('imported');
    await expect(
      importCustomCharacterPackage({
        repository: target,
        input: serialized
      })
    ).resolves.toBe('already_present');
    expect(
      await target.getCharacterRevision('character-exported', 1)
    ).toMatchObject({
      lifecycle: {
        reviewStatus: 'needs_review',
        availabilityStatus: 'disabled'
      }
    });

    const tampered = serialized.replace('夜班探员。', '白班探员。');
    await expect(parseCustomCharacterPackage(tampered)).rejects.toThrow(
      'checksum 校验失败'
    );
  });

  it('does not auto-merge the same identity with a conflicting revision', async () => {
    const packageValue = await exportedCharacter();
    const target = new IndexedDbCustomContentRepository(
      `character-transfer-conflict-${crypto.randomUUID()}`
    );
    await saveCustomCharacterRevision({
      repository: target,
      input: {
        draft: draft(),
        deployments: [],
        global: true,
        projectIds: [],
        mode: 'needs_review'
      },
      dependencies: {
        createId: () => 'character-exported'
      }
    });

    await expect(
      importCustomCharacterPackage({
        repository: target,
        input: serializeCustomCharacterPackage(packageValue)
      })
    ).rejects.toThrow('checksum 冲突');
  });
});
