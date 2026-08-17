import { describe, expect, it } from 'vitest';
import type { OpeningCharacterTemplateProfile } from './openingCharacterTemplateStore';
import {
  OPENING_CHARACTER_TEMPLATES_STORAGE_KEY,
  deleteOpeningCharacterTemplate,
  loadOpeningCharacterTemplates,
  normalizeOpeningCharacterTemplate,
  saveOpeningCharacterTemplate
} from './openingCharacterTemplateStore';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const profile: OpeningCharacterTemplateProfile = {
  playerName: '林若晴',
  englishName: 'Rachel Lam',
  gender: 'female',
  age: 29,
  birthMonth: 7,
  birthDay: 18,
  personality: '冷静谨慎',
  appearance: '短发，衣着利落',
  cantoneseFlavor: 'heavy',
  policeNumber: '7314',
  currentIdentity: 'police',
  police: {
    rankId: 'sergeant',
    departmentId: 'cid',
    postingId: 'central_police_station',
    roleId: 'team_investigator'
  },
  originBackground: {
    originBackgroundId: 'custom_forensic_family',
    name: '法证家庭',
    definition: '从小熟悉证物与程序。',
    backgroundSummary: '家人曾因证物争议承受压力。'
  },
  attributePresetId: 'custom',
  attributes: {
    body: 48,
    action: 52,
    perception: 63,
    thinking: 64,
    negotiation: 54,
    will: 59
  },
  traitIds: ['trait_paperwork_clean']
};

describe('openingCharacterTemplateStore', () => {
  it('persists only reusable character data and restores it after reload', () => {
    const storage = new MemoryStorage();
    saveOpeningCharacterTemplate(
      {
        label: '港岛女警',
        worldpackId: 'hk_1988',
        profile
      },
      storage,
      new Date('2026-07-27T02:00:00.000Z')
    );

    const loaded = loadOpeningCharacterTemplates(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({
      label: '港岛女警',
      worldpackId: 'hk_1988',
      profile: {
        playerName: '林若晴',
        gender: 'female',
        age: 29,
        police: {
          rankId: 'sergeant',
          departmentId: 'cid'
        },
        attributes: {
          perception: 63,
          thinking: 64
        }
      }
    });
    const raw =
      storage.getItem(OPENING_CHARACTER_TEMPLATES_STORAGE_KEY) ?? '';
    expect(raw).not.toContain('scenarioId');
    expect(raw).not.toContain('dramaticOpeningId');
    expect(raw).not.toContain('openingNote');
    expect(raw).not.toContain('apiKey');
  });

  it('updates without changing creation time and deletes explicitly', () => {
    const storage = new MemoryStorage();
    let templates = saveOpeningCharacterTemplate(
      {
        label: '初稿',
        worldpackId: 'hk_1988',
        profile
      },
      storage,
      new Date('2026-07-27T02:00:00.000Z')
    );
    const original = templates[0];

    templates = saveOpeningCharacterTemplate(
      {
        id: original.id,
        label: '修订稿',
        worldpackId: 'hk_1988',
        profile: { ...profile, age: 30 }
      },
      storage,
      new Date('2026-07-27T03:00:00.000Z')
    );

    expect(templates).toHaveLength(1);
    expect(templates[0].createdAt).toBe(
      '2026-07-27T02:00:00.000Z'
    );
    expect(templates[0].updatedAt).toBe(
      '2026-07-27T03:00:00.000Z'
    );
    expect(templates[0].profile.age).toBe(30);
    expect(deleteOpeningCharacterTemplate(original.id, storage)).toEqual(
      []
    );
  });

  it('repairs malformed local data before exposing it to the opening form', () => {
    const normalized = normalizeOpeningCharacterTemplate({
      id: ' template ',
      label: ' 港岛女警 ',
      worldpackId: 'hk_1988',
      profile: {
        ...profile,
        gender: 'unknown',
        age: 999,
        birthMonth: 20,
        policeNumber: 'AB-123456',
        cantoneseFlavor: 'invalid',
        attributes: {
          body: 100,
          action: -10,
          perception: 61,
          thinking: 'bad',
          negotiation: 55,
          will: 56
        },
        traitIds: [
          'trait_paperwork_clean',
          '',
          'trait_paperwork_clean',
          'trait_local_roots',
          'trait_reads_the_room',
          'trait_quick_feet'
        ]
      }
    });

    expect(normalized?.id).toBe('template');
    expect(normalized?.profile.gender).toBe('male');
    expect(normalized?.profile.age).toBe(90);
    expect(normalized?.profile.birthMonth).toBe(12);
    expect(normalized?.profile.policeNumber).toBe('1234');
    expect(normalized?.profile.cantoneseFlavor).toBe('medium');
    expect(normalized?.profile.attributes).toMatchObject({
      body: 80,
      action: 30,
      thinking: 50
    });
    expect(normalized?.profile.traitIds).toEqual([
      'trait_paperwork_clean',
      'trait_local_roots',
      'trait_reads_the_room'
    ]);
  });
});
