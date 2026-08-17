import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, test, type Page } from '@playwright/test';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import { parseVisualRepositorySnapshot } from '../../src/domain/imageGeneration/visualRepository/schemas';
import { installRuntimeStateSave, loadRuntimeSave } from './fixtures';

const visualPartitionId = 'e2e-layout-chain';
const dialogueTurnId = 'turn_visual_management';
const visualPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZzooAAAAASUVORK5CYII=';

async function installVisualRepositoryFixture(page: Page, actorId: string) {
  return page.evaluate(
    async ({ saveId, characterId, turnId, pngBase64 }) => {
      const base64 = pngBase64;
      const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const contentHash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
      const createdAt = '2026-07-23T00:00:00.000Z';
      const actorCreatedAt = '2026-07-21T08:00:00.000Z';
      const sceneCreatedAt = '2026-07-22T08:00:00.000Z';
      const unboundCreatedAt = '2026-07-23T08:00:00.000Z';
      const actorSubject = { type: 'actor' as const, saveId, actorId: characterId };
      const sceneSubject = {
        type: 'scene-shot' as const,
        saveId,
        turnId,
        scenePlanId: 'plan_e2e_scene',
        shotId: 'shot_e2e_scene'
      };
      const actorBindingId = ['binding', saveId, `actor:${characterId}`, 'avatar-close-up', '']
        .map(encodeURIComponent).join(':');
      const sceneBindingId = ['binding', saveId, `shot:${turnId}:plan_e2e_scene:shot_e2e_scene`, 'turn-scene', 'shot_e2e_scene']
        .map(encodeURIComponent).join(':');
      const submittedRequest = {
        intentId: 'intent_e2e_generated',
        imageProfileId: 'profile_e2e_openai',
        providerType: 'openai-images' as const,
        connectionFingerprint: 'connection-e2e',
        executionFingerprint: 'execution-e2e',
        imageGenerationPresetId: 'preset_e2e_character',
        imageGenerationPresetRevision: 1,
        promptDialectPresetId: 'builtin-dialect-general-en',
        executionTarget: { kind: 'model' as const, modelId: 'gpt-image-e2e' },
        positivePrompt: '1980s realistic illustrated character portrait',
        negativePrompt: 'blurry',
        negativePromptMode: 'separate' as const,
        targetAspectRatio: '1:1',
        generationParameters: {
          providerType: 'openai-images' as const,
          requestedImageCount: 1,
          size: { mode: 'dimensions' as const, width: 1024, height: 1024 },
          quality: 'medium' as const,
          outputFormat: 'png' as const,
          background: 'opaque' as const
        },
        sourceAnchorHashes: ['d'.repeat(64)],
        compiledAt: '2026-07-20T07:59:00.000Z',
        requestFingerprint: 'request-e2e-generated',
        submittedAt: '2026-07-20T08:00:00.000Z',
        userEdited: false
      };
      const snapshot = {
        schemaVersion: 1 as const,
        saveId,
        characterAnchors: {
          [`character-anchor:${characterId}`]: {
            anchorId: `character-anchor:${characterId}`,
            saveId,
            actorId: characterId,
            anchorText: '黑色短发，棕色眼睛，保持五官与年龄观感一致。',
            source: 'user-edited' as const,
            sourceImageIds: [],
            updatedAt: createdAt
          }
        },
        scenePlans: {
          plan_e2e_scene: {
            planId: 'plan_e2e_scene',
            saveId,
            sourceTurnId: turnId,
            sourceStoryTextHash: 'b'.repeat(64),
            mode: 'manual' as const,
            requestedMaxScenes: 1,
            shots: [{
              shotId: 'shot_e2e_scene',
              placement: { blockIndex: 0, blockHash: 'c'.repeat(64) },
              order: 0,
              sceneSummary: '雨夜霓虹街头',
              knownActorIds: [characterId],
              actorVisualStates: [],
              unboundCharacterDescriptions: [],
              locationDescription: '香港雨夜街头',
              actionDescription: '角色站在霓虹灯下',
              atmosphere: '潮湿而紧张',
              composition: '中景'
            }],
            createdAt
          }
        },
        tasks: {},
        characterBatches: {},
        assets: {
          image_e2e_avatar: {
            imageId: 'image_e2e_avatar',
            scope: 'save' as const,
            saveId,
            source: 'user-imported' as const,
            originSubject: actorSubject,
            originPurpose: 'avatar-close-up' as const,
            mimeType: 'image/png' as const,
            width: 1,
            height: 1,
            byteLength: bytes.byteLength,
            contentHash,
            blobKey: 'blob_e2e_avatar',
            createdAt: actorCreatedAt
          },
          image_e2e_scene: {
            imageId: 'image_e2e_scene',
            scope: 'save' as const,
            saveId,
            source: 'user-imported' as const,
            originSubject: sceneSubject,
            originPurpose: 'turn-scene' as const,
            mimeType: 'image/png' as const,
            width: 1,
            height: 1,
            byteLength: bytes.byteLength,
            contentHash,
            blobKey: 'blob_e2e_scene',
            createdAt: sceneCreatedAt
          },
          image_e2e_unbound: {
            imageId: 'image_e2e_unbound',
            scope: 'save' as const,
            saveId,
            source: 'user-imported' as const,
            mimeType: 'image/png' as const,
            width: 1,
            height: 1,
            byteLength: bytes.byteLength,
            contentHash,
            blobKey: 'blob_e2e_unbound',
            createdAt: unboundCreatedAt
          },
          image_e2e_generated: {
            imageId: 'image_e2e_generated',
            scope: 'save' as const,
            saveId,
            source: 'generated' as const,
            sourceTaskId: 'task_e2e_generated',
            mimeType: 'image/png' as const,
            width: 1,
            height: 1,
            byteLength: bytes.byteLength,
            contentHash,
            blobKey: 'blob_e2e_generated',
            createdAt: '2026-07-20T08:00:00.000Z',
            submittedRequest
          }
        },
        bindings: {
          [actorBindingId]: {
            bindingId: actorBindingId,
            saveId,
            subject: actorSubject,
            purpose: 'avatar-close-up' as const,
            imageId: 'image_e2e_avatar',
            updatedAt: createdAt
          },
          [sceneBindingId]: {
            bindingId: sceneBindingId,
            saveId,
            subject: sceneSubject,
            purpose: 'turn-scene' as const,
            variantKey: 'shot_e2e_scene',
            imageId: 'image_e2e_scene',
            updatedAt: createdAt
          }
        },
        storySceneDisplayStates: {
          [turnId]: {
            saveId,
            turnId,
            activeShotIds: ['shot_e2e_scene'],
            updatedAt: createdAt
          }
        }
      };

      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sorry-im-a-cop-v2-visuals', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('visual-partitions')) {
            db.createObjectStore('visual-partitions', { keyPath: 'saveId' });
          }
          const blobStore = db.objectStoreNames.contains('visual-blobs')
            ? request.transaction?.objectStore('visual-blobs')
            : db.createObjectStore('visual-blobs', { keyPath: 'blobKey' });
          if (blobStore && !blobStore.indexNames.contains('by-save-id')) {
            blobStore.createIndex('by-save-id', 'saveId', { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['visual-partitions', 'visual-blobs'], 'readwrite');
        transaction.objectStore('visual-partitions').put(snapshot);
        for (const [imageId, blobKey] of [
          ['image_e2e_avatar', 'blob_e2e_avatar'],
          ['image_e2e_scene', 'blob_e2e_scene'],
          ['image_e2e_unbound', 'blob_e2e_unbound'],
          ['image_e2e_generated', 'blob_e2e_generated']
        ]) {
          transaction.objectStore('visual-blobs').put({
            blobKey,
            saveId,
            imageId,
            mimeType: 'image/png',
            bytes: bytes.buffer.slice(0)
          });
        }
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
      return snapshot;
    },
    { saveId: visualPartitionId, characterId: actorId, turnId: dialogueTurnId, pngBase64: visualPngBase64 }
  );
}

async function installStorageDamageFixture(page: Page, expectedSceneBase64: string) {
  await page.evaluate(async ({ saveId, sceneBase64 }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sorry-im-a-cop-v2-visuals', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const snapshot = await new Promise<Record<string, unknown> & {
      assets: Record<string, Record<string, unknown>>;
    }>((resolve, reject) => {
      const transaction = database.transaction('visual-partitions', 'readonly');
      const request = transaction.objectStore('visual-partitions').get(saveId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const sceneBytes = Uint8Array.from(atob(sceneBase64), (value) => value.charCodeAt(0));
    const sceneDigest = await crypto.subtle.digest('SHA-256', sceneBytes);
    const sceneContentHash = Array.from(
      new Uint8Array(sceneDigest),
      (value) => value.toString(16).padStart(2, '0')
    ).join('');
    const sceneBitmap = await createImageBitmap(new Blob([sceneBytes], { type: 'image/png' }));
    for (const imageId of [
      'image_e2e_avatar',
      'image_e2e_scene',
      'image_e2e_unbound',
      'image_e2e_generated'
    ]) {
      snapshot.assets[imageId] = {
        ...snapshot.assets[imageId],
        width: sceneBitmap.width,
        height: sceneBitmap.height,
        byteLength: sceneBytes.byteLength,
        contentHash: sceneContentHash
      };
    }
    snapshot.assets.image_e2e_generated.contentHash = '0'.repeat(64);
    sceneBitmap.close();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['visual-partitions', 'visual-blobs'], 'readwrite');
      transaction.objectStore('visual-partitions').put(snapshot);
      const store = transaction.objectStore('visual-blobs');
      store.delete('blob_e2e_scene');
      for (const [imageId, blobKey] of [
        ['image_e2e_avatar', 'blob_e2e_avatar'],
        ['image_e2e_unbound', 'blob_e2e_unbound'],
        ['image_e2e_generated', 'blob_e2e_generated']
      ]) {
        store.put({
          blobKey,
          saveId,
          imageId,
          mimeType: 'image/png',
          bytes: sceneBytes.buffer.slice(0)
        });
      }
      store.put({
        blobKey: 'blob_e2e_orphan',
        saveId,
        imageId: 'image_e2e_orphan',
        mimeType: 'image/png',
        bytes: sceneBytes.buffer.slice(0)
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, { saveId: visualPartitionId, sceneBase64: expectedSceneBase64 });
}

test('deep-checks, restores, and explicitly cleans current-save visual storage without external calls', async ({ page }) => {
  test.setTimeout(90_000);
  const consoleProblems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleProblems.push(`${message.text()} @ ${message.location().url}`);
    }
  });
  page.on('pageerror', (error) => consoleProblems.push(error.message));
  await page.route('**/api/analytics/**', (route) => route.fulfill({ status: 204 }));

  const runtimeState = createInitialRuntimeState({ playerName: '存储维护验收员' });
  const actor = Object.values(runtimeState.actors)[0];
  expect(actor).toBeDefined();
  runtimeState.storyLog.push({
    turnId: dialogueTurnId,
    speaker: 'narrator',
    text: `【${actor.name}】“这是存储维护验收台词。”`,
    dialogueSpeakerActorIds: { [actor.name]: actor.actorId },
    gameTime: { ...runtimeState.time }
  });

  const exactOriginalPath = resolve('docs/media/game-dark.png');
  const exactOriginalBase64 = (await readFile(exactOriginalPath)).toString('base64');
  await installRuntimeStateSave(page, runtimeState);
  await installVisualRepositoryFixture(page, actor.actorId);
  await installStorageDamageFixture(page, exactOriginalBase64);
  await page.reload();
  await loadRuntimeSave(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('button', { name: '图册', exact: true }).click();
  const gallery = page.getByRole('dialog', { name: '图片管理' });
  await expect(gallery).toBeVisible();
  await expect(gallery.getByLabel('图片资料状态')).toContainText('缺失 1 / 损坏 0 / 游离 1');
  await gallery.getByRole('button', { name: '打开存储维护' }).click();
  const maintenance = gallery.getByRole('region', { name: '图片存储维护' });
  await expect(maintenance).toBeVisible();
  await expect(maintenance).toContainText('metadata-only 存档，是合法可恢复状态');
  await expect(maintenance).toContainText('包含整个站点数据，并非文生图库独占配额');
  await expect(maintenance.getByText('深度检查完成')).toHaveCount(0);

  await maintenance.getByRole('button', { name: '深度检查本地图片' }).click();
  await expect(maintenance.getByText('深度检查完成')).toBeVisible();
  await expect(maintenance).toContainText('缺失 1 / 损坏 1 / 游离 1');

  const missingRecovery = maintenance.locator('.image-storage-recovery-list article')
    .filter({ hasText: 'image_e2e_scene' });
  await expect(missingRecovery).toContainText('本地文件未携带或已经缺失');
  await missingRecovery.getByLabel('选择原文件恢复').setInputFiles(resolve('docs/media/game-light.png'));
  const mismatchAlert = maintenance.getByRole('alert');
  await expect(mismatchAlert).toContainText('所选文件不是原图片');
  await expect(mismatchAlert).toContainText('不会覆盖原 `imageId`');
  await mismatchAlert.getByRole('button', { name: '取消' }).click();

  await missingRecovery.getByLabel('选择原文件恢复').setInputFiles(exactOriginalPath);
  await expect(gallery.locator('.image-gallery-entry-notice')).toContainText('图片 ID、生成记录和全部绑定保持不变');

  await maintenance.getByRole('button', { name: '深度检查本地图片' }).click();
  await expect(maintenance.getByText('深度检查完成')).toBeVisible();
  await expect(maintenance).toContainText('缺失 0 / 损坏 1 / 游离 1');
  await maintenance.getByRole('button', { name: '预览清理游离文件' }).click();
  const orphanConfirmation = maintenance.getByRole('alert');
  await expect(orphanConfirmation).toContainText('确认只删除本次检查列出的游离文件');
  await orphanConfirmation.getByRole('button', { name: '确认清理游离文件' }).click();
  await expect(gallery.locator('.image-gallery-entry-notice')).toContainText('已清理 1 个游离文件');

  await maintenance.getByRole('button', { name: '深度检查本地图片' }).click();
  await expect(maintenance.getByText('深度检查完成')).toBeVisible();
  await expect(maintenance).toContainText('缺失 0 / 损坏 1 / 游离 0');
  await expect(maintenance).toContainText('确认移除后仍保留资产元数据、提示词历史和绑定');
  await maintenance.getByRole('button', { name: '预览移除损坏文件' }).click();
  const corruptConfirmation = maintenance.getByRole('alert');
  await expect(corruptConfirmation).toContainText('确认只移除本次检查列出的损坏文件');
  await corruptConfirmation.getByRole('button', { name: '确认移除损坏文件' }).click();
  await expect(gallery.locator('.image-gallery-entry-notice')).toContainText('1 条资产元数据与绑定继续保留为可恢复缺图');
  await expect(gallery.getByLabel('图片资料状态')).toContainText('缺失 1 / 损坏 0 / 游离 0');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(maintenance).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await gallery.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await maintenance.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(consoleProblems).toEqual([]);
});

test('manages visual assets, deep filters, storage, export, and desktop/tablet/mobile layout without external calls', async ({ page }) => {
  const consoleProblems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') consoleProblems.push(message.text());
  });
  page.on('pageerror', (error) => consoleProblems.push(error.message));
  await page.route('**/api/analytics/**', (route) => route.fulfill({ status: 204 }));

  const runtimeState = createInitialRuntimeState({ playerName: '图册验收员' });
  const actor = Object.values(runtimeState.actors)[0];
  expect(actor).toBeDefined();
  runtimeState.storyLog.push({
    turnId: dialogueTurnId,
    speaker: 'narrator',
    text: `【${actor.name}】“这是带稳定角色身份的头像验收台词。”`,
    dialogueSpeakerActorIds: { [actor.name]: actor.actorId },
    gameTime: { ...runtimeState.time }
  });

  await installRuntimeStateSave(page, runtimeState);
  const visualFixture = await installVisualRepositoryFixture(page, actor.actorId);
  expect(() => parseVisualRepositorySnapshot(visualFixture)).not.toThrow();
  await page.reload();
  await loadRuntimeSave(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  const dialogue = page.locator('.story-segment-dialogue').filter({ hasText: '头像验收台词' });
  await expect(dialogue).toBeVisible();
  await expect(dialogue.locator('img.story-dialogue-avatar')).toBeVisible();

  await page.getByRole('button', { name: '图册', exact: true }).click();
  const gallery = page.getByRole('dialog', { name: '图片管理' });
  await expect(gallery).toBeVisible();
  await expect(gallery.getByRole('button', { name: '全部 4' })).toHaveAttribute('aria-pressed', 'true');
  await expect(gallery.getByRole('button', { name: '人物 1' })).toBeVisible();
  await expect(gallery.getByRole('button', { name: '场景 1' })).toBeVisible();
  await expect(gallery.getByRole('button', { name: '未绑定 2' })).toBeVisible();
  await expect(gallery.locator('.image-gallery-card img')).toHaveCount(4);
  await expect(gallery.getByLabel('图片资料状态')).toContainText('元数据资产 4');
  await expect(gallery.getByLabel('图片资料状态')).toContainText('本地文件 4');
  await expect(gallery.getByLabel('图片资料状态')).toContainText('实际占用 272 B');
  await expect(gallery.getByLabel('图片资料状态')).toContainText('缺失 0 / 损坏 0 / 游离 0');

  await gallery.getByLabel('筛选角色').selectOption(actor.actorId);
  await expect(gallery.locator('.image-gallery-card')).toHaveCount(2);
  await expect(gallery.locator('.image-gallery-filter-result')).toContainText('显示 2 / 4 张');
  await gallery.getByLabel('筛选正文回合').selectOption(dialogueTurnId);
  await expect(gallery.locator('.image-gallery-card')).toHaveCount(1);
  await gallery.getByRole('button', { name: '清除详细筛选' }).click();

  await gallery.getByLabel('筛选图片来源').selectOption('generated');
  await expect(gallery.locator('.image-gallery-card')).toHaveCount(1);
  await gallery.getByLabel('筛选后端与模型').selectOption('openai-images:model:gpt-image-e2e');
  await expect(gallery.locator('.image-gallery-card')).toHaveCount(1);
  await gallery.getByRole('button', { name: '清除详细筛选' }).click();

  await gallery.getByLabel('筛选绑定状态').selectOption('unbound');
  await expect(gallery.locator('.image-gallery-card')).toHaveCount(2);
  await gallery.getByRole('button', { name: '清除详细筛选' }).click();
  await gallery.getByLabel('筛选开始日期').fill('2026-07-23');
  await expect(gallery.locator('.image-gallery-card')).toHaveCount(1);
  await gallery.getByRole('button', { name: '清除详细筛选' }).click();
  await gallery.getByLabel('图片时间排序').selectOption('oldest');
  await expect(gallery.getByRole('button', { name: `查看图片详情：角色：${actor.name}` })).toBeVisible();
  await gallery.getByLabel('图片时间排序').selectOption('newest');

  await gallery.getByRole('button', { name: '场景 1' }).click();
  await expect(gallery.locator('.image-gallery-card')).toHaveCount(1);
  await gallery.getByRole('button', { name: /查看图片详情：正文回合/ }).click();
  const sceneDetail = gallery.getByRole('complementary', { name: '图片详情' });
  await expect(sceneDetail.getByText('该 SceneShot 正在正文显示。')).toBeVisible();
  await sceneDetail.getByRole('button', { name: '查看原图', exact: true }).click();
  const sceneOriginal = page.getByRole('dialog', { name: /原图预览：正文回合/ });
  await expect(sceneOriginal).toBeVisible();
  await expect(sceneOriginal).toContainText('1 × 1');
  await sceneOriginal.getByRole('button', { name: '关闭原图' }).click();
  await sceneDetail.getByRole('button', { name: '从正文移除此镜头' }).click();
  await expect(sceneDetail.getByText('该 SceneShot 当前不在正文显示集合中。')).toBeVisible();
  await sceneDetail.getByRole('button', { name: '恢复此镜头到正文' }).click();
  await expect(sceneDetail.getByText('该 SceneShot 正在正文显示。')).toBeVisible();
  await sceneDetail.getByRole('button', { name: '删除这张图片' }).click();
  await expect(sceneDetail.getByRole('alert')).toContainText('正文不会被删除');
  await expect(sceneDetail.getByRole('alert')).toContainText('turn_visual_management / shot_e2e_scene · 正文场景图');
  await sceneDetail.getByRole('button', { name: '取消' }).click();

  await gallery.getByRole('button', { name: '未绑定 2' }).click();
  await expect(gallery.locator('.image-gallery-card')).toHaveCount(2);
  await gallery.getByRole('button', { name: '人物 1' }).click();
  await gallery.getByRole('button', { name: `查看图片详情：角色：${actor.name}` }).click();
  const detail = gallery.getByRole('complementary', { name: '图片详情' });
  await expect(detail).toContainText('头像特写');
  await expect(detail).toContainText(`${actor.name} · 头像特写`);
  await detail.getByRole('button', { name: '查看原图', exact: true }).click();
  const characterOriginal = page.getByRole('dialog', { name: `原图预览：角色：${actor.name}` });
  await expect(characterOriginal).toBeVisible();
  await characterOriginal.getByRole('button', { name: '关闭原图' }).click();

  await detail.getByLabel('设为角色用途').selectOption('half-body-medium');
  await detail.getByRole('button', { name: '设为该用途当前图' }).click();
  await expect(detail).toContainText(`${actor.name} · 半身像`);
  await detail.getByRole('button', { name: '删除这张图片' }).click();
  await expect(detail.getByRole('alert')).toContainText('这张图片正在 2 处使用');
  await expect(detail.getByRole('alert')).toContainText('头像特写');
  await expect(detail.getByRole('alert')).toContainText('半身像');
  await detail.getByRole('button', { name: '取消' }).click();
  await detail.getByRole('button', { name: '解除该用途绑定' }).click();
  await expect(detail).not.toContainText(`${actor.name} · 半身像`);

  await detail.getByRole('button', { name: '删除这张图片' }).click();
  await expect(detail.getByRole('alert')).toContainText('这张图片正在 1 处使用');
  await detail.getByRole('button', { name: '解除绑定并确认删除' }).click();
  await expect(gallery.locator('.image-gallery-entry-notice')).toContainText('图片已删除，并解除 1 处绑定');
  await expect(gallery.getByRole('button', { name: '全部 3' })).toBeVisible();
  await gallery.getByRole('button', { name: '关闭图片管理' }).click();

  await expect(dialogue).toBeVisible();
  await expect(dialogue.locator('img.story-dialogue-avatar')).toHaveCount(0);

  await page.getByRole('button', { name: '保存进度' }).click();
  const saveDialog = page.getByRole('dialog', { name: '存档管理' });
  const includeImages = saveDialog.getByRole('checkbox', { name: '包含文生图图片（文件可能较大）' });
  await expect(includeImages).not.toBeChecked();
  const metadataDownloadPromise = page.waitForEvent('download');
  await saveDialog.getByRole('button', { name: '导出存档' }).click();
  const metadataDownload = await metadataDownloadPromise;
  const metadataDownloadPath = await metadataDownload.path();
  expect(metadataDownloadPath).not.toBeNull();
  const saveEntries = unzipSync(new Uint8Array(await readFile(metadataDownloadPath!)));
  const saveManifest = JSON.parse(strFromU8(saveEntries['manifest.json']));
  expect(saveManifest.visuals).toHaveLength(1);
  const visualEntries = unzipSync(saveEntries[saveManifest.visuals[0].path]);
  expect(Object.keys(visualEntries)).toEqual(['manifest.json']);
  const visualManifest = JSON.parse(strFromU8(visualEntries['manifest.json']));
  expect(visualManifest).toMatchObject({
    includeImages: false,
    blobCount: 0,
    snapshot: {
      saveId: visualPartitionId,
      characterAnchors: {
        [`character-anchor:${actor.actorId}`]: expect.objectContaining({
          actorId: actor.actorId,
          anchorText: '黑色短发，棕色眼睛，保持五官与年龄观感一致。'
        })
      }
    }
  });
  expect(Object.keys(visualManifest.snapshot.assets)).toHaveLength(3);
  expect(Object.values(visualManifest.snapshot.bindings)).toHaveLength(1);
  await includeImages.check();
  await expect(includeImages).toBeChecked();
  await saveDialog.getByRole('button', { name: '关闭存档' }).click();

  await page.setViewportSize({ width: 768, height: 900 });
  await page.getByRole('button', { name: '功能', exact: true }).click();
  await page.getByRole('button', { name: '图册', exact: true }).click();
  const tabletGallery = page.getByRole('dialog', { name: '图片管理' });
  await expect(tabletGallery).toBeVisible();
  await expect(tabletGallery.getByLabel('筛选后端与模型')).toBeVisible();
  expect(await tabletGallery.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  const tabletFilterColumns = await tabletGallery.locator('.image-gallery-filter-panel').evaluate(
    (node) => getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean).length
  );
  expect(tabletFilterColumns).toBe(2);
  await tabletGallery.getByRole('button', { name: '关闭图片管理' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '功能', exact: true }).click();
  await page.getByRole('button', { name: '图册', exact: true }).click();
  const mobileGallery = page.getByRole('dialog', { name: '图片管理' });
  await expect(mobileGallery).toBeVisible();
  await expect(mobileGallery.getByLabel('筛选图片来源')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await mobileGallery.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await mobileGallery.getByRole('button', { name: '场景 1' }).click();
  await mobileGallery.getByRole('button', { name: /查看图片详情：正文回合/ }).click();
  await mobileGallery.getByRole('button', { name: '查看原图', exact: true }).click();
  const mobileOriginal = page.getByRole('dialog', { name: /原图预览：正文回合/ });
  await expect(mobileOriginal).toBeVisible();
  expect(await mobileOriginal.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await mobileOriginal.getByRole('button', { name: '关闭原图' }).click();
  await page.getByRole('button', { name: '关闭图片管理' }).click();

  expect(consoleProblems).toEqual([]);
});
