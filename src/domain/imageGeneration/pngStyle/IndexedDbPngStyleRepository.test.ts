import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  createDefaultPngStyleLibrarySettings,
  IndexedDbPngStyleRepository
} from './IndexedDbPngStyleRepository';
import { parsePngStyleLibraryArchive, serializePngStyleLibrary } from './portablePngStyleArchive';
import { createPngStyleImportDraft } from './pngStyleResolver';

describe('PNG style repository and portable archive', () => {
  it('persists a separate strict library without image bytes or raw metadata', async () => {
    const repository = new IndexedDbPngStyleRepository(`png-style-${crypto.randomUUID()}`);
    const settings = createDefaultPngStyleLibrarySettings('2026-07-29T00:00:00.000Z');
    const imported = createPngStyleImportDraft({
      parsed: {
        source: 'novelai',
        positivePrompt: 'artist:toi8, film grain',
        negativePrompt: 'lowres',
        rawMetadata: 'secret one-time subject metadata',
        warnings: []
      },
      imageHash: 'b'.repeat(64),
      fileName: 'nai.png',
      now: '2026-07-29T00:00:00.000Z',
      createId: () => 'preset'
    });
    settings.presets = [imported.preset];
    settings.selection.globalPngStylePresetId = imported.preset.pngStylePresetId;
    await repository.save(settings);
    const loaded = await repository.load();
    expect(loaded).toEqual(settings);
    expect(JSON.stringify(loaded)).not.toContain('secret one-time');
  });

  it('round-trips the portable library and rejects unrelated JSON', () => {
    const settings = createDefaultPngStyleLibrarySettings('2026-07-29T00:00:00.000Z');
    expect(parsePngStyleLibraryArchive(
      serializePngStyleLibrary(settings, '2026-07-29T01:00:00.000Z')
    )).toEqual(settings);
    expect(() => parsePngStyleLibraryArchive('{"format":"other","version":1}')).toThrow();
  });
});
