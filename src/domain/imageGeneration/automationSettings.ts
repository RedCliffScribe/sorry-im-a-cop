import { z } from 'zod';
import {
  CHARACTER_VISUAL_PURPOSES,
  normalizeCharacterVisualPurpose,
  type CharacterVisualPurpose
} from './promptConversion';

const characterAutomaticPurposeSchema = z.preprocess(
  normalizeCharacterVisualPurpose,
  z.enum(CHARACTER_VISUAL_PURPOSES)
) as z.ZodType<CharacterVisualPurpose>;

const currentImageAutomationSettingsSchema = z.object({
  settingsId: z.literal('image-automation-settings'),
  revision: z.number().int().positive(),
  characterMode: z.enum(['off', 'manual', 'automatic']),
  sceneMode: z.enum(['off', 'manual', 'automatic']),
  characterAutomaticProfileId: z.string().trim().min(1).max(200).optional(),
  characterAutomaticWorkflowTemplateId: z.string().trim().min(1).max(200).optional(),
  sceneAutomaticRouting: z.enum(['character-default', 'separate']).default('character-default'),
  sceneAutomaticProfileId: z.string().trim().min(1).max(200).optional(),
  sceneAutomaticWorkflowTemplateId: z.string().trim().min(1).max(200).optional(),
  characterAutomaticPurposes: z.array(characterAutomaticPurposeSchema)
    .min(1)
    .max(4)
    .refine((purposes) => new Set(purposes).size === purposes.length, '自动人物图用途不得重复。')
    .default(['avatar-close-up', 'half-body-medium']),
  sceneMaxPerTurn: z.number().int().min(1).max(4),
  sceneConcurrency: z.number().int().min(1).max(4),
  sceneFailureRetry: z.enum(['manual', 'once']),
  updatedAt: z.string().datetime({ offset: true })
}).strict();

function migrateLegacyAutomaticRoute(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const legacy = value as Record<string, unknown>;
  const {
    automaticProfileId,
    automaticWorkflowTemplateId,
    ...current
  } = legacy;
  return {
    ...current,
    characterAutomaticProfileId: current.characterAutomaticProfileId ?? automaticProfileId,
    characterAutomaticWorkflowTemplateId:
      current.characterAutomaticWorkflowTemplateId ?? automaticWorkflowTemplateId,
    sceneAutomaticRouting: current.sceneAutomaticRouting ?? 'character-default'
  };
}

export const imageAutomationSettingsSchema = z.preprocess(
  migrateLegacyAutomaticRoute,
  currentImageAutomationSettingsSchema
);

export type ImageAutomationSettings = z.infer<typeof imageAutomationSettingsSchema>;

export function resolveImageAutomationRoute(
  settings: ImageAutomationSettings,
  kind: 'character' | 'scene'
): { profileId?: string; workflowTemplateId?: string; source: 'character-default' | 'scene-separate' } {
  if (kind === 'scene' && settings.sceneAutomaticRouting === 'separate') {
    return {
      profileId: settings.sceneAutomaticProfileId,
      workflowTemplateId: settings.sceneAutomaticWorkflowTemplateId,
      source: 'scene-separate'
    };
  }
  return {
    profileId: settings.characterAutomaticProfileId,
    workflowTemplateId: settings.characterAutomaticWorkflowTemplateId,
    source: 'character-default'
  };
}

export function detachImageAutomationProfile(
  settings: ImageAutomationSettings,
  profileId: string,
  now = new Date().toISOString()
): ImageAutomationSettings | undefined {
  const removesCharacterRoute = settings.characterAutomaticProfileId === profileId;
  const removesSceneRoute = settings.sceneAutomaticRouting === 'separate' &&
    settings.sceneAutomaticProfileId === profileId;
  if (!removesCharacterRoute && !removesSceneRoute) return undefined;
  const sceneDependsOnRemovedCharacterRoute = settings.sceneAutomaticRouting === 'character-default' &&
    removesCharacterRoute;
  return imageAutomationSettingsSchema.parse({
    ...settings,
    revision: settings.revision + 1,
    characterMode: removesCharacterRoute && settings.characterMode === 'automatic'
      ? 'manual' : settings.characterMode,
    sceneMode: (removesSceneRoute || sceneDependsOnRemovedCharacterRoute) && settings.sceneMode === 'automatic'
      ? 'manual' : settings.sceneMode,
    characterAutomaticProfileId: removesCharacterRoute ? undefined : settings.characterAutomaticProfileId,
    characterAutomaticWorkflowTemplateId: removesCharacterRoute
      ? undefined : settings.characterAutomaticWorkflowTemplateId,
    sceneAutomaticRouting: removesSceneRoute ? 'character-default' : settings.sceneAutomaticRouting,
    sceneAutomaticProfileId: removesSceneRoute ? undefined : settings.sceneAutomaticProfileId,
    sceneAutomaticWorkflowTemplateId: removesSceneRoute
      ? undefined : settings.sceneAutomaticWorkflowTemplateId,
    updatedAt: now
  });
}

export interface ImageAutomationSettingsRepository {
  load(): Promise<ImageAutomationSettings>;
  save(settings: ImageAutomationSettings): Promise<void>;
}

export function createDefaultImageAutomationSettings(now = new Date().toISOString()): ImageAutomationSettings {
  return {
    settingsId: 'image-automation-settings',
    revision: 1,
    characterMode: 'manual',
    sceneMode: 'manual',
    sceneAutomaticRouting: 'character-default',
    characterAutomaticPurposes: ['avatar-close-up', 'half-body-medium'],
    sceneMaxPerTurn: 2,
    sceneConcurrency: 1,
    sceneFailureRetry: 'manual',
    updatedAt: now
  };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class IndexedDbImageAutomationSettingsRepository implements ImageAutomationSettingsRepository {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dbName = 'sorry-im-a-cop-v2-image-automation') {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('settings')) {
          request.result.createObjectStore('settings', { keyPath: 'settingsId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('无法打开文生图自动化设置。'));
    });
  }

  async load(): Promise<ImageAutomationSettings> {
    const db = await this.open();
    try {
      const transaction = db.transaction('settings', 'readonly');
      const value = await requestToPromise<unknown>(transaction.objectStore('settings').get('image-automation-settings'));
      return value === undefined ? createDefaultImageAutomationSettings() : imageAutomationSettingsSchema.parse(value);
    } finally {
      db.close();
    }
  }

  save(settings: ImageAutomationSettings): Promise<void> {
    const parsed = imageAutomationSettingsSchema.parse(settings);
    const operation = this.writeQueue.then(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction('settings', 'readwrite');
        transaction.objectStore('settings').put(parsed);
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  clearAll(): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction('settings', 'readwrite');
        transaction.objectStore('settings').clear();
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }
}
