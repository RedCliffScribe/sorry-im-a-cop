import type { Page } from '@playwright/test';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import type { RuntimeState } from '../../src/domain/runtime/types';

const testSaveId = 'e2e-layout-save';

export async function dismissDailyChangelog(page: Page) {
  const closeButton = page.getByRole('button', { name: '关闭更新日志' });
  try {
    await closeButton.waitFor({ state: 'visible', timeout: 2_000 });
    await closeButton.click();
  } catch {
    // The changelog is only shown once per local day, so its absence is expected.
  }
}

export async function installRuntimeStateSave(page: Page, runtimeState: RuntimeState) {
  const now = new Date().toISOString();
  const summary = {
    saveId: testSaveId,
    rollbackChainId: 'e2e-layout-chain',
    saveName: '浏览器布局测试',
    saveKind: 'manual' as const,
    createdAt: now,
    updatedAt: now,
    playerName: runtimeState.player.name,
    worldpackId: runtimeState.world.worldpackId,
    gameDateLabel: `${runtimeState.time.year}-${String(runtimeState.time.month).padStart(2, '0')}-${String(runtimeState.time.day).padStart(2, '0')}`,
    turnCounter: runtimeState.turnCounter
  };

  await page.goto('/');
  await dismissDailyChangelog(page);
  await page.evaluate(
    async ({ payload, saveSummary }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sorry-im-a-cop-v2-saves', 3);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('runtime-save-summaries')) {
            db.createObjectStore('runtime-save-summaries', { keyPath: 'saveId' });
          }
          if (!db.objectStoreNames.contains('runtime-save-payloads')) {
            db.createObjectStore('runtime-save-payloads', { keyPath: 'saveId' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['runtime-save-summaries', 'runtime-save-payloads'],
          'readwrite'
        );
        transaction.objectStore('runtime-save-summaries').put(saveSummary);
        transaction.objectStore('runtime-save-payloads').put(payload);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    {
      payload: { saveId: testSaveId, runtimeState },
      saveSummary: summary
    }
  );
}

export async function installRuntimeSave(page: Page) {
  const runtimeState = createInitialRuntimeState({
    playerName: '浏览器测试员',
    englishName: 'Browser Tester',
    policeNumber: '4382'
  });
  await installRuntimeStateSave(page, runtimeState);
}

export async function loadRuntimeSave(page: Page) {
  await page.getByRole('button', { name: '读取游戏' }).click();
  const dialog = page.getByRole('dialog', { name: '存档管理' });
  await dialog.getByRole('button', { name: '读取存档' }).click();
  await page.getByLabel('游戏界面').waitFor();
}
