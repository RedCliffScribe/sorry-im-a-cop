import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  IndexedDbImageAutomationSettingsRepository,
  createDefaultImageAutomationSettings,
  detachImageAutomationProfile,
  resolveImageAutomationRoute
} from './automationSettings';

describe('image automation settings', () => {
  it('defaults to manual mode and persists explicit automatic preferences without treating them as execution evidence', async () => {
    const repository = new IndexedDbImageAutomationSettingsRepository(`image-automation-${crypto.randomUUID()}`);
    const defaults = await repository.load();
    expect(defaults).toMatchObject({
      characterMode: 'manual',
      sceneMode: 'manual',
      characterAutomaticPurposes: ['avatar-close-up', 'half-body-medium'],
      sceneMaxPerTurn: 2
    });

    const next = {
      ...createDefaultImageAutomationSettings('2026-07-23T04:00:00.000Z'),
      revision: 2,
      sceneMode: 'automatic' as const,
      characterAutomaticProfileId: 'profile:openai',
      sceneMaxPerTurn: 4
    };
    await repository.save(next);
    expect(await repository.load()).toEqual(next);
    await repository.clearAll();
    expect(await repository.load()).toMatchObject({ revision: 1, characterMode: 'manual', sceneMode: 'manual' });
  });

  it('migrates the old shared automatic route to the character default route used by scenes', async () => {
    const dbName = `image-automation-shared-route-${crypto.randomUUID()}`;
    const openRequest = indexedDB.open(dbName, 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onupgradeneeded = () => openRequest.result.createObjectStore('settings', { keyPath: 'settingsId' });
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });
    const transaction = db.transaction('settings', 'readwrite');
    transaction.objectStore('settings').put({
      settingsId: 'image-automation-settings', revision: 3,
      characterMode: 'automatic', sceneMode: 'automatic',
      automaticProfileId: 'profile:legacy-shared',
      automaticWorkflowTemplateId: 'workflow:legacy-shared',
      characterAutomaticPurposes: ['avatar-close-up', 'cowboy-medium-full'],
      sceneMaxPerTurn: 2, sceneConcurrency: 1, sceneFailureRetry: 'manual',
      updatedAt: '2026-07-23T04:00:00.000Z'
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();

    await expect(new IndexedDbImageAutomationSettingsRepository(dbName).load()).resolves.toMatchObject({
      characterAutomaticProfileId: 'profile:legacy-shared',
      characterAutomaticWorkflowTemplateId: 'workflow:legacy-shared',
      sceneAutomaticRouting: 'character-default',
      characterAutomaticPurposes: ['avatar-close-up', 'knee-up-medium-full']
    });
  });

  it('migrates settings saved before automatic profile and purpose selection existed', async () => {
    const dbName = `image-automation-legacy-${crypto.randomUUID()}`;
    const openRequest = indexedDB.open(dbName, 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onupgradeneeded = () => openRequest.result.createObjectStore('settings', { keyPath: 'settingsId' });
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });
    const transaction = db.transaction('settings', 'readwrite');
    transaction.objectStore('settings').put({
      settingsId: 'image-automation-settings',
      revision: 1,
      characterMode: 'manual',
      sceneMode: 'manual',
      sceneMaxPerTurn: 2,
      sceneConcurrency: 1,
      sceneFailureRetry: 'manual',
      updatedAt: '2026-07-23T04:00:00.000Z'
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();

    const repository = new IndexedDbImageAutomationSettingsRepository(dbName);
    expect((await repository.load()).characterAutomaticPurposes).toEqual(['avatar-close-up', 'half-body-medium']);
  });

  it('resolves scenes to the character default unless the player enables a separate route', () => {
    const shared = {
      ...createDefaultImageAutomationSettings('2026-07-23T04:00:00.000Z'),
      characterAutomaticProfileId: 'profile:character',
      characterAutomaticWorkflowTemplateId: 'workflow:character'
    };
    expect(resolveImageAutomationRoute(shared, 'scene')).toEqual({
      profileId: 'profile:character', workflowTemplateId: 'workflow:character', source: 'character-default'
    });
    expect(resolveImageAutomationRoute({
      ...shared,
      sceneAutomaticRouting: 'separate',
      sceneAutomaticProfileId: 'profile:scene',
      sceneAutomaticWorkflowTemplateId: 'workflow:scene'
    }, 'scene')).toEqual({
      profileId: 'profile:scene', workflowTemplateId: 'workflow:scene', source: 'scene-separate'
    });
  });

  it('detaches only the deleted route and preserves an independent automatic route', () => {
    const settings = {
      ...createDefaultImageAutomationSettings('2026-07-23T04:00:00.000Z'),
      revision: 4,
      characterMode: 'automatic' as const,
      sceneMode: 'automatic' as const,
      characterAutomaticProfileId: 'profile:character',
      sceneAutomaticRouting: 'separate' as const,
      sceneAutomaticProfileId: 'profile:scene'
    };
    expect(detachImageAutomationProfile(settings, 'profile:character', '2026-07-23T05:00:00.000Z')).toMatchObject({
      revision: 5,
      characterMode: 'manual',
      sceneMode: 'automatic',
      characterAutomaticProfileId: undefined,
      sceneAutomaticRouting: 'separate',
      sceneAutomaticProfileId: 'profile:scene'
    });
    expect(detachImageAutomationProfile(settings, 'profile:scene', '2026-07-23T05:00:00.000Z')).toMatchObject({
      characterMode: 'automatic',
      sceneMode: 'manual',
      characterAutomaticProfileId: 'profile:character',
      sceneAutomaticRouting: 'character-default',
      sceneAutomaticProfileId: undefined
    });
  });
});
