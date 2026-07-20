import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { expect, test } from '@playwright/test';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import type { MemoryItem, StoryEntry } from '../../src/domain/runtime/types';
import { installRuntimeStateSave } from './fixtures';

test('exports a portable save without rebuildable embedding caches', async ({ page }) => {
  const runtimeState = createInitialRuntimeState();
  runtimeState.memories.memory_export_test = {
    memoryId: 'memory_export_test',
    text: 'The player submitted a manuscript.',
    kind: 'player',
    tier: 'short_term',
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 },
    importance: 70,
    visibility: 'player_known',
    certainty: 'fact',
    embeddingText: 'submitted manuscript',
    embeddingVector: Array.from({ length: 25_000 }, (_, index) => index / 25_000),
    embeddingModel: 'e2e-embedding-model',
    embeddingUpdatedAt: '2026-07-16T00:00:00.000Z'
  } as MemoryItem;
  runtimeState.storyLog.push({
    turnId: 'turn_export_test',
    speaker: 'narrator',
    text: 'The editor accepted the manuscript.',
    summaryText: 'Manuscript accepted.',
    embeddingText: 'editor accepted manuscript',
    embeddingVector: Array.from({ length: 25_000 }, (_, index) => index / 25_000),
    embeddingModel: 'e2e-embedding-model',
    embeddingUpdatedAt: '2026-07-16T00:00:00.000Z',
    gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 30 }
  } as StoryEntry);

  await installRuntimeStateSave(page, runtimeState);
  await page.reload();
  await page.getByRole('button', { name: '读取游戏' }).click();

  const dialog = page.getByRole('dialog', { name: '存档管理' });
  await expect(dialog).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出存档' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/^cop-v2-saves-\d+\.zip$/);

  const entries = unzipSync(new Uint8Array(await readFile(downloadPath!)));
  const manifest = JSON.parse(strFromU8(entries['manifest.json']));
  expect(manifest.saveCount).toBe(1);
  expect(manifest.saves).toHaveLength(1);
  expect(manifest.saves[0].path).toMatch(/^saves\/(manual|auto)\/.*\.json$/);
  expect(Object.hasOwn(entries, 'assets/images/characters/.keep')).toBe(true);
  expect(Object.hasOwn(entries, 'assets/images/locations/.keep')).toBe(true);

  const exportedRecord = JSON.parse(strFromU8(entries[manifest.saves[0].path]));
  const exportedState = exportedRecord.runtimeState;
  expect(exportedState.memories.memory_export_test.text).toBe(
    'The player submitted a manuscript.'
  );
  expect(exportedState.memories.memory_export_test).not.toHaveProperty('embeddingVector');
  expect(exportedState.storyLog.at(-1).text).toBe('The editor accepted the manuscript.');
  expect(exportedState.storyLog.at(-1)).not.toHaveProperty('embeddingVector');
});
