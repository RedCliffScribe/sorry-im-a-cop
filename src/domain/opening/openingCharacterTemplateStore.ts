import type {
  Actor,
  AttributeBlock,
  CantoneseFlavorLevel,
  CurrentIdentity,
  OriginBackground
} from '../runtime/types';

export const OPENING_CHARACTER_TEMPLATES_STORAGE_KEY =
  'sorry-im-a-cop-v2-opening-character-templates';
export const OPENING_CHARACTER_TEMPLATE_LIMIT = 40;
export const OPENING_CHARACTER_TEMPLATE_WORLDPACK_ID = 'hk_1988';

type OpeningCharacterGender = Extract<Actor['gender'], 'male' | 'female'>;

export interface OpeningCharacterPoliceProfile {
  rankId: string;
  departmentId: string;
  postingId: string;
  roleId: string;
}

export interface OpeningCharacterCivilianProfile {
  profileId: string;
  customOccupation: string;
  customEmployerName: string;
  customPlaceId: string;
  customCommunitySummary: string;
}

export interface OpeningCharacterTriadProfile {
  societyId: string;
  territoryPlaceId: string;
  rankId: string;
  roleId: string;
}

export interface OpeningCharacterTemplateProfile {
  playerName: string;
  englishName: string;
  gender: OpeningCharacterGender;
  age: number;
  birthMonth: number;
  birthDay: number;
  personality: string;
  appearance: string;
  cantoneseFlavor: CantoneseFlavorLevel;
  policeNumber: string;
  currentIdentity: CurrentIdentity;
  police?: OpeningCharacterPoliceProfile;
  civilian?: OpeningCharacterCivilianProfile;
  triad?: OpeningCharacterTriadProfile;
  originBackground: OriginBackground | null;
  attributePresetId: string;
  attributes: AttributeBlock;
  traitIds: string[];
}

export interface OpeningCharacterTemplate {
  id: string;
  version: 1;
  label: string;
  worldpackId: string;
  createdAt: string;
  updatedAt: string;
  profile: OpeningCharacterTemplateProfile;
}

type TemplateStorage = Pick<Storage, 'getItem' | 'setItem'>;

const attributeKeys = [
  'body',
  'action',
  'perception',
  'thinking',
  'negotiation',
  'will'
] as const;
const cantoneseFlavorLevels: CantoneseFlavorLevel[] = [
  'off',
  'light',
  'medium',
  'heavy',
  'full'
];

function getDefaultStorage(
  storage?: TemplateStorage | null
): TemplateStorage | null {
  if (storage !== undefined) return storage;
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function trimText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, Math.floor(parsed)))
    : fallback;
}

function normalizeAttributes(value: unknown): AttributeBlock {
  const record = asRecord(value);
  return Object.fromEntries(
    attributeKeys.map((key) => [
      key,
      boundedInteger(record?.[key], 50, 30, 80)
    ])
  ) as unknown as AttributeBlock;
}

function normalizeOriginBackground(
  value: unknown
): OriginBackground | null {
  const record = asRecord(value);
  if (!record) return null;
  const originBackgroundId = trimText(record.originBackgroundId, 120);
  const name = trimText(record.name, 120);
  const definition = trimText(record.definition, 3000);
  const backgroundSummary = trimText(record.backgroundSummary, 3000);
  if (!originBackgroundId || !name || !definition || !backgroundSummary) {
    return null;
  }
  return {
    originBackgroundId,
    name,
    definition,
    backgroundSummary
  };
}

function normalizePoliceProfile(
  value: unknown
): OpeningCharacterPoliceProfile | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    rankId: trimText(record.rankId, 120),
    departmentId: trimText(record.departmentId, 120),
    postingId: trimText(record.postingId, 120),
    roleId: trimText(record.roleId, 120)
  };
}

function normalizeCivilianProfile(
  value: unknown
): OpeningCharacterCivilianProfile | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    profileId: trimText(record.profileId, 120),
    customOccupation: trimText(record.customOccupation, 300),
    customEmployerName: trimText(record.customEmployerName, 300),
    customPlaceId: trimText(record.customPlaceId, 120),
    customCommunitySummary: trimText(record.customCommunitySummary, 3000)
  };
}

function normalizeTriadProfile(
  value: unknown
): OpeningCharacterTriadProfile | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    societyId: trimText(record.societyId, 120),
    territoryPlaceId: trimText(record.territoryPlaceId, 120),
    rankId: trimText(record.rankId, 120),
    roleId: trimText(record.roleId, 120)
  };
}

export function normalizeOpeningCharacterTemplate(
  value: unknown
): OpeningCharacterTemplate | null {
  const record = asRecord(value);
  const profile = asRecord(record?.profile);
  if (!record || !profile) return null;

  const id = trimText(record.id, 160);
  const label = trimText(record.label, 80);
  const worldpackId = trimText(record.worldpackId, 120);
  if (!id || !label || !worldpackId) return null;

  const rawIdentity = trimText(profile.currentIdentity, 40);
  const currentIdentity: CurrentIdentity =
    rawIdentity === 'civilian' || rawIdentity === 'gang_member'
      ? rawIdentity
      : 'police';
  const rawCantoneseFlavor = trimText(profile.cantoneseFlavor, 20);
  const cantoneseFlavor = cantoneseFlavorLevels.includes(
    rawCantoneseFlavor as CantoneseFlavorLevel
  )
    ? (rawCantoneseFlavor as CantoneseFlavorLevel)
    : 'medium';
  const rawTraitIds = Array.isArray(profile.traitIds)
    ? profile.traitIds
    : [];
  const traitIds = Array.from(
    new Set(
      rawTraitIds
        .map((traitId) => trimText(traitId, 120))
        .filter(Boolean)
    )
  ).slice(0, 3);
  const createdAt = trimText(record.createdAt, 40);
  const updatedAt = trimText(record.updatedAt, 40);

  return {
    id,
    version: 1,
    label,
    worldpackId,
    createdAt: createdAt || new Date(0).toISOString(),
    updatedAt: updatedAt || createdAt || new Date(0).toISOString(),
    profile: {
      playerName: trimText(profile.playerName, 120),
      englishName: trimText(profile.englishName, 120),
      gender: profile.gender === 'female' ? 'female' : 'male',
      age: boundedInteger(profile.age, 25, 16, 90),
      birthMonth: boundedInteger(profile.birthMonth, 4, 1, 12),
      birthDay: boundedInteger(profile.birthDay, 18, 1, 31),
      personality: trimText(profile.personality, 4000),
      appearance: trimText(profile.appearance, 4000),
      cantoneseFlavor,
      policeNumber: trimText(profile.policeNumber, 20)
        .replace(/\D/g, '')
        .slice(0, 4),
      currentIdentity,
      police: normalizePoliceProfile(profile.police),
      civilian: normalizeCivilianProfile(profile.civilian),
      triad: normalizeTriadProfile(profile.triad),
      originBackground: normalizeOriginBackground(
        profile.originBackground
      ),
      attributePresetId:
        trimText(profile.attributePresetId, 120) || 'custom',
      attributes: normalizeAttributes(profile.attributes),
      traitIds
    }
  };
}

export function loadOpeningCharacterTemplates(
  storage?: TemplateStorage | null
): OpeningCharacterTemplate[] {
  const target = getDefaultStorage(storage);
  if (!target) return [];
  const payload = target.getItem(OPENING_CHARACTER_TEMPLATES_STORAGE_KEY);
  if (!payload) return [];

  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeOpeningCharacterTemplate)
      .filter(
        (template): template is OpeningCharacterTemplate =>
          template !== null
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, OPENING_CHARACTER_TEMPLATE_LIMIT);
  } catch {
    return [];
  }
}

function writeOpeningCharacterTemplates(
  templates: OpeningCharacterTemplate[],
  storage?: TemplateStorage | null
): OpeningCharacterTemplate[] {
  const normalized = templates
    .map(normalizeOpeningCharacterTemplate)
    .filter(
      (template): template is OpeningCharacterTemplate => template !== null
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, OPENING_CHARACTER_TEMPLATE_LIMIT);
  const target = getDefaultStorage(storage);
  if (target) {
    target.setItem(
      OPENING_CHARACTER_TEMPLATES_STORAGE_KEY,
      JSON.stringify(normalized)
    );
  }
  return normalized;
}

function createTemplateId(now: Date): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `opening_character_${crypto.randomUUID()}`;
  }
  return `opening_character_${now.getTime()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function saveOpeningCharacterTemplate(
  input: {
    id?: string;
    label: string;
    worldpackId: string;
    profile: OpeningCharacterTemplateProfile;
  },
  storage?: TemplateStorage | null,
  now: Date = new Date()
): OpeningCharacterTemplate[] {
  const existing = loadOpeningCharacterTemplates(storage);
  const current = input.id
    ? existing.find((template) => template.id === input.id)
    : undefined;
  const template = normalizeOpeningCharacterTemplate({
    id: current?.id ?? createTemplateId(now),
    version: 1,
    label: input.label,
    worldpackId: input.worldpackId,
    createdAt: current?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    profile: input.profile
  });
  if (!template) return existing;
  return writeOpeningCharacterTemplates(
    [template, ...existing.filter((item) => item.id !== template.id)],
    storage
  );
}

export function deleteOpeningCharacterTemplate(
  templateId: string,
  storage?: TemplateStorage | null
): OpeningCharacterTemplate[] {
  return writeOpeningCharacterTemplates(
    loadOpeningCharacterTemplates(storage).filter(
      (template) => template.id !== templateId
    ),
    storage
  );
}
