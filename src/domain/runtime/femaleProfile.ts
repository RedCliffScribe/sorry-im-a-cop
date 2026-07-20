import { isAdultFemaleActorAt } from './actorAge';
import type {
  Actor,
  ActorAdultPrivateProfile,
  ActorAdultPrivateProfilePart,
  ActorAdultPrivateWombProfile,
  ActorAdultPrivateWombRecord,
  ActorFemaleProfile,
  ActorFemaleRelationshipEdge,
  ActorPregnancyCheckRecord,
  ActorPregnancyHistoryRecord,
  ActorPregnancyState,
  AdultPrivateProfilePartKey,
  GameTime
} from './types';

type ActorAdultPrivateProfilePatch = Partial<
  Omit<ActorAdultPrivateProfile, 'updatedAt' | 'source' | 'womb' | 'partProfiles'>
> & {
  womb?: unknown;
  partProfiles?: unknown;
  intimacyStage?: string;
  romanticPreference?: string;
  hiddenDesires?: string;
  riskTolerance?: string;
  femaleProfileStatus?: string;
  女性扩展档案状态?: string;
  子宫?: unknown;
  香闺秘档部位档案?: unknown;
  胸部描述?: string;
  小穴描述?: string;
  屁穴描述?: string;
  性癖?: string;
  敏感点?: string;
};

export type ActorFemaleProfilePatch = Partial<
  Omit<ActorFemaleProfile, 'adultPrivateProfile' | 'relationshipNetwork' | 'relationshipNetworkEdges' | 'updatedAt' | 'source'>
> & {
  relationshipNetwork?: string[] | string;
  relationshipNetworkEdges?: unknown;
  adultPrivateProfile?: ActorAdultPrivateProfilePatch;
  source?: ActorFemaleProfile['source'];
  callSign?: string;
  publicRelationship?: string;
  appearanceExpansion?: string;
  characterCore?: string;
  affectionAdvancementConditions?: string;
  relationshipAdvancementConditions?: string;
  socialNetwork?: string[] | string;
  emotionalBoundaries?: string;
  对主角称呼?: string;
  外貌描写?: string;
  身材描写?: string;
  衣着风格?: string;
  核心性格特征?: string;
  好感度突破条件?: string;
  关系突破条件?: string;
  关系网变量?: unknown;
};

type NormalizedActorAdultPrivateProfilePatch = Partial<Omit<ActorAdultPrivateProfile, 'updatedAt' | 'source'>>;

type NormalizedActorFemaleProfilePatch = Partial<
  Omit<ActorFemaleProfile, 'adultPrivateProfile' | 'relationshipNetwork' | 'relationshipNetworkEdges' | 'updatedAt' | 'source'>
> & {
  relationshipNetwork?: string[];
  relationshipNetworkEdges?: ActorFemaleRelationshipEdge[];
  adultPrivateProfile?: NormalizedActorAdultPrivateProfilePatch;
  source?: ActorFemaleProfile['source'];
};

function cloneTime(time: GameTime): GameTime {
  return { ...time };
}

function cloneOptionalTime(time: GameTime | undefined): GameTime | undefined {
  return time ? cloneTime(time) : undefined;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return undefined;
}

const privatePlaceholderTexts = new Set(['pending', '待补全', '暂无记录', 'NO RECORDS']);

function cleanPrivateText(value: unknown): string | undefined {
  const text = cleanText(value);
  if (!text || privatePlaceholderTexts.has(text)) return undefined;
  if (text.toLowerCase().includes('pending') || text.includes('待补全') || text.includes('暂无记录')) return undefined;
  return text;
}

function firstPrivateText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = cleanPrivateText(value);
    if (text) return text;
  }
  return undefined;
}

const adultPrivateLeakagePattern =
  /家务|顾家|家人|父母|男友|女友|求婚|收入|职级|职业|工作|安全感|信任|爱慕|保护|关心|面容|眉眼|眼神|清秀|青春气息|市井|烟火气|智慧|聪明|温柔坚韧|人物|角色|生活/u;

const adultPrivateGenericPattern = /体态相称|气质相称|身形气质|整体干净|干净细腻|保持一致|稳定相处|长期安全感|关系边界/u;
const adultPrivateEuphemismPattern = /甬道|巨物|坚硬/u;

const adultPrivatePartSpecificPatterns: Record<AdultPrivateProfilePartKey, RegExp> = {
  胸部: /乳房|乳头|乳晕|乳尖|奶头/u,
  小穴: /阴唇|阴蒂|穴口|阴道|蜜穴|花穴/u,
  屁穴: /屁穴|肛|后庭|臀缝|菊|皱褶/u
};

const adultPrivateFetishPattern = /性|性癖|欲望|挑逗|支配|掌控|羞耻|调教|爱抚|占有|快感|刺激|被动|主动/u;

function isAdultPrivateFieldTextUsable(text: string): boolean {
  return !adultPrivateLeakagePattern.test(text) && !adultPrivateGenericPattern.test(text) && !adultPrivateEuphemismPattern.test(text);
}

function cleanPrivatePartDescription(key: AdultPrivateProfilePartKey, value: unknown): string | undefined {
  const text = cleanPrivateText(value);
  if (!text) return undefined;
  if (!isAdultPrivateFieldTextUsable(text)) return undefined;
  return adultPrivatePartSpecificPatterns[key].test(text) ? text : undefined;
}

function firstPrivatePartDescription(key: AdultPrivateProfilePartKey, ...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = cleanPrivatePartDescription(key, value);
    if (text) return text;
  }
  return undefined;
}

function cleanFetishNotes(value: unknown): string | undefined {
  const text = cleanPrivateText(value);
  if (!text) return undefined;
  if (!isAdultPrivateFieldTextUsable(text)) return undefined;
  return adultPrivateFetishPattern.test(text) ? text : undefined;
}

function firstFetishNotes(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = cleanFetishNotes(value);
    if (text) return text;
  }
  return undefined;
}

function cleanSensitivePoints(value: unknown): string | undefined {
  const text = cleanPrivateText(value);
  if (!text) return undefined;
  return isAdultPrivateFieldTextUsable(text) ? text : undefined;
}

function firstSensitivePoints(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = cleanSensitivePoints(value);
    if (text) return text;
  }
  return undefined;
}

function cloneWombRecord(record: ActorAdultPrivateWombRecord): ActorAdultPrivateWombRecord {
  return {
    ...(record.date ? { date: record.date } : {}),
    description: record.description,
    ...(record.pregnancyCheckDate ? { pregnancyCheckDate: record.pregnancyCheckDate } : {})
  };
}

function clonePregnancyState(pregnancy: ActorPregnancyState | undefined): ActorPregnancyState | undefined {
  if (!pregnancy) return undefined;
  return {
    ...pregnancy,
    registeredAt: cloneTime(pregnancy.registeredAt),
    checkDueAt: cloneTime(pregnancy.checkDueAt),
    confirmationDueAt: cloneTime(pregnancy.confirmationDueAt),
    deliveryWindowAt: cloneTime(pregnancy.deliveryWindowAt),
    dueAt: cloneTime(pregnancy.dueAt),
    deliveryDeadlineAt: cloneTime(pregnancy.deliveryDeadlineAt),
    ...(pregnancy.suspectedAt ? { suspectedAt: cloneTime(pregnancy.suspectedAt) } : {}),
    ...(pregnancy.confirmedAt ? { confirmedAt: cloneTime(pregnancy.confirmedAt) } : {}),
    ...(pregnancy.deliveredAt ? { deliveredAt: cloneTime(pregnancy.deliveredAt) } : {}),
    ...(pregnancy.postpartumUntil ? { postpartumUntil: cloneTime(pregnancy.postpartumUntil) } : {}),
    riskTypes: [...pregnancy.riskTypes],
    riskSummaries: [...pregnancy.riskSummaries],
    paternityCandidates: pregnancy.paternityCandidates.map((candidate) => ({ ...candidate }))
  };
}

function clonePregnancyCheck(record: ActorPregnancyCheckRecord | undefined): ActorPregnancyCheckRecord | undefined {
  return record
    ? {
        ...record,
        checkedAt: cloneTime(record.checkedAt),
        cooldownUntil: cloneTime(record.cooldownUntil)
      }
    : undefined;
}

function clonePregnancyHistory(records: ActorPregnancyHistoryRecord[] | undefined): ActorPregnancyHistoryRecord[] | undefined {
  return records?.map((record) => ({
    ...record,
    startedAt: cloneTime(record.startedAt),
    endedAt: cloneTime(record.endedAt)
  }));
}

const ADULT_PRIVATE_PART_KEYS: AdultPrivateProfilePartKey[] = ['胸部', '小穴', '屁穴'];

function createDefaultWombProfile(): ActorAdultPrivateWombProfile {
  return {
    status: '未受孕',
    cervixStatus: '紧闭',
    records: []
  };
}

function createDefaultPartProfiles(
  actor: Actor | undefined,
  profile: ActorFemaleProfile | undefined
): NonNullable<ActorAdultPrivateProfile['partProfiles']> {
  return {
    胸部: {
      description: '乳房饱满柔软，乳晕色泽自然，乳头敏感，受触碰时容易挺起。',
      imagePromptAnchor: 'breasts close-up, soft skin, natural areola, sensitive nipples, jade-like skin texture, delicate detail'
    },
    小穴: {
      description: '阴唇紧致细嫩，穴口收敛，阴蒂敏感，受挑逗时容易湿润。',
      imagePromptAnchor: 'vulva close-up, tight labia, small entrance, sensitive clitoris, glistening moisture, delicate skin texture'
    },
    屁穴: {
      description: '臀缝紧窄，屁穴小而紧闭，周围皱褶细密，受触碰时反应明显。',
      imagePromptAnchor: 'anus close-up, tight opening, narrow cleft, fine folds, soft shadows, delicate skin texture'
    }
  };
}

function createAdultPrivateProfileFallback(
  currentTime: GameTime,
  source: NonNullable<ActorFemaleProfile['source']>,
  actor?: Actor,
  profile?: ActorFemaleProfile
): ActorAdultPrivateProfile {
  return {
    enabled: true,
    ageConfirmedAdult: true,
    profileStatus: 'ready',
    womb: createDefaultWombProfile(),
    partProfiles: createDefaultPartProfiles(actor, profile),
    fetishNotes: '偏好强势但有分寸的挑逗、贴身掌控和身体赞美；在私密空间里容易被羞耻感与被占有感激起欲望。',
    sensitivePoints: '敏感点集中在乳尖、阴蒂、颈侧、腰侧、大腿内侧和臀缝。',
    updatedAt: cloneTime(currentTime),
    source
  };
}

function compactList(values: string[] | undefined): string[] | undefined {
  const compacted = Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
  return compacted.length > 0 ? compacted : undefined;
}

function compactListFromUnknown(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return compactList(value.filter((item): item is string => typeof item === 'string'));
  }
  const text = cleanText(value);
  return text ? [text] : undefined;
}

function textFromObject(value: unknown, ...keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  return firstText(...keys.map((key) => record[key]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeWombRecord(value: unknown): ActorAdultPrivateWombRecord | undefined {
  const text = cleanText(value);
  if (text) {
    return { description: text };
  }
  if (!isRecord(value)) return undefined;
  const description = textFromObject(value, 'description', '描述', 'summary', '记录', 'note');
  if (!description) return undefined;
  return {
    ...(firstText(value.date, value.日期, value.time, value.时间) ? { date: firstText(value.date, value.日期, value.time, value.时间) } : {}),
    description,
    ...(firstText(value.pregnancyCheckDate, value.怀孕判定日, value.checkDate, value.孕检期)
      ? { pregnancyCheckDate: firstText(value.pregnancyCheckDate, value.怀孕判定日, value.checkDate, value.孕检期) }
      : {})
  };
}

function normalizeWombRecords(value: unknown): ActorAdultPrivateWombRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const records = value.map(normalizeWombRecord).filter((record): record is ActorAdultPrivateWombRecord => Boolean(record));
  return records.length > 0 ? records : [];
}

function normalizeWombProfile(value: unknown): ActorAdultPrivateWombProfile | undefined {
  if (!isRecord(value)) return undefined;
  const status = firstText(value.status, value.状态);
  const cervixStatus = firstText(value.cervixStatus, value.宫口状态);
  const records = normalizeWombRecords(value.records ?? value.内射记录);
  if (!status && !cervixStatus && records === undefined) return undefined;
  return {
    status: status ?? '未受孕',
    cervixStatus: cervixStatus ?? '紧闭',
    records: records ?? []
  };
}

function normalizePrivatePartProfile(key: AdultPrivateProfilePartKey, value: unknown): ActorAdultPrivateProfilePart | undefined {
  const text = cleanPrivatePartDescription(key, value);
  if (text) {
    return { description: text };
  }
  if (!isRecord(value)) return undefined;
  const description = firstPrivatePartDescription(key, value.description, value.描述, value.text, value.文本, value.summary, value.描述文本);
  const imagePromptAnchor = firstPrivateText(value.imagePromptAnchor, value.生图词组, value.最终正向提示词, value.prompt, value.imagePrompt);
  if (!description && !imagePromptAnchor) return undefined;
  return {
    ...(description ? { description } : {}),
    ...(imagePromptAnchor ? { imagePromptAnchor } : {})
  };
}

function normalizePartProfilesFromUnknown(value: unknown): ActorAdultPrivateProfile['partProfiles'] | undefined {
  if (!isRecord(value)) return undefined;
  const profiles = ADULT_PRIVATE_PART_KEYS.reduce<NonNullable<ActorAdultPrivateProfile['partProfiles']>>((result, key) => {
    const profile = normalizePrivatePartProfile(key, value[key]);
    if (profile) result[key] = profile;
    return result;
  }, {});
  return Object.keys(profiles).length > 0 ? profiles : undefined;
}

function normalizePartProfiles(patch: ActorAdultPrivateProfilePatch): ActorAdultPrivateProfile['partProfiles'] | undefined {
  const fromObject = normalizePartProfilesFromUnknown(patch.partProfiles ?? patch.香闺秘档部位档案);
  const directProfiles = ADULT_PRIVATE_PART_KEYS.reduce<NonNullable<ActorAdultPrivateProfile['partProfiles']>>((result, key) => {
    const directValue =
      key === '胸部' ? patch.胸部描述 ?? (patch as Record<string, unknown>).chestDescription : key === '小穴' ? patch.小穴描述 : patch.屁穴描述;
    const profile = normalizePrivatePartProfile(key, directValue);
    if (profile) result[key] = profile;
    return result;
  }, {});
  const merged = { ...(fromObject ?? {}), ...directProfiles };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeWombProfile(
  existing: ActorAdultPrivateWombProfile | undefined,
  patch: ActorAdultPrivateWombProfile | undefined
): ActorAdultPrivateWombProfile {
  const fallback = createDefaultWombProfile();
  const hasEngineTruth = Boolean(
    existing?.pregnancy || existing?.lastPregnancyCheck || (existing?.pregnancyHistory?.length ?? 0) > 0
  );
  return {
    status: firstPrivateText(hasEngineTruth ? existing?.status : patch?.status, existing?.status) ?? fallback.status,
    cervixStatus: firstPrivateText(patch?.cervixStatus, existing?.cervixStatus) ?? fallback.cervixStatus,
    records: (hasEngineTruth ? existing?.records ?? fallback.records : patch?.records ?? existing?.records ?? fallback.records).map(
      cloneWombRecord
    ),
    ...(clonePregnancyState(existing?.pregnancy) ? { pregnancy: clonePregnancyState(existing?.pregnancy) } : {}),
    ...(clonePregnancyCheck(existing?.lastPregnancyCheck)
      ? { lastPregnancyCheck: clonePregnancyCheck(existing?.lastPregnancyCheck) }
      : {}),
    ...(clonePregnancyHistory(existing?.pregnancyHistory)
      ? { pregnancyHistory: clonePregnancyHistory(existing?.pregnancyHistory) }
      : {})
  };
}

function mergePartProfile(
  existing: ActorAdultPrivateProfilePart | undefined,
  patch: ActorAdultPrivateProfilePart | undefined,
  fallback: ActorAdultPrivateProfilePart
): ActorAdultPrivateProfilePart {
  return {
    description: firstPrivateText(patch?.description, existing?.description, fallback.description) ?? fallback.description,
    ...(firstPrivateText(patch?.imagePromptAnchor, existing?.imagePromptAnchor, fallback.imagePromptAnchor)
      ? { imagePromptAnchor: firstPrivateText(patch?.imagePromptAnchor, existing?.imagePromptAnchor, fallback.imagePromptAnchor) }
      : {}),
    ...(cloneOptionalTime(patch?.updatedAt ?? existing?.updatedAt) ? { updatedAt: cloneOptionalTime(patch?.updatedAt ?? existing?.updatedAt) } : {})
  };
}

function mergePartProfiles(
  existing: ActorAdultPrivateProfile['partProfiles'] | undefined,
  patch: ActorAdultPrivateProfile['partProfiles'] | undefined,
  fallbackProfiles: NonNullable<ActorAdultPrivateProfile['partProfiles']> = createDefaultPartProfiles(undefined, undefined)
): NonNullable<ActorAdultPrivateProfile['partProfiles']> {
  const genericFallbackProfiles = createDefaultPartProfiles(undefined, undefined);
  return ADULT_PRIVATE_PART_KEYS.reduce<NonNullable<ActorAdultPrivateProfile['partProfiles']>>((profiles, key) => {
    profiles[key] = mergePartProfile(
      existing?.[key],
      patch?.[key],
      fallbackProfiles[key] ?? genericFallbackProfiles[key] ?? { description: `${key}已有具体私密档案记录。` }
    );
    return profiles;
  }, {});
}

function normalizeRelationshipEdge(value: unknown): ActorFemaleRelationshipEdge | undefined {
  const text = cleanText(value);
  if (text) {
    return {
      targetName: '相关关系',
      relation: text
    };
  }

  if (!value || typeof value !== 'object') return undefined;
  const targetName = textFromObject(value, 'targetName', 'target', 'name', 'actorName', '对象姓名', '对象', '姓名');
  const relation = textFromObject(value, 'relation', 'relationship', 'type', '关系', '关系类型');
  const note = textFromObject(value, 'note', 'summary', 'memo', '备注', '说明', '关系备注');
  if (!targetName && !relation && !note) return undefined;

  return {
    targetName: targetName ?? '相关关系',
    relation: relation ?? note ?? '未标明',
    ...(note ? { note } : {})
  };
}

function compactRelationshipEdgesFromUnknown(value: unknown): ActorFemaleRelationshipEdge[] | undefined {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const edges = values
    .map(normalizeRelationshipEdge)
    .filter((edge): edge is ActorFemaleRelationshipEdge => Boolean(edge));
  const unique = new Map<string, ActorFemaleRelationshipEdge>();
  for (const edge of edges) {
    const key = `${edge.targetName}\n${edge.relation}\n${edge.note ?? ''}`;
    if (!unique.has(key)) unique.set(key, edge);
  }
  const compacted = [...unique.values()];
  return compacted.length > 0 ? compacted : undefined;
}

function hasPatchContent(patch: Record<string, unknown>): boolean {
  return Object.entries(patch).some(([key, value]) => {
    if (key === 'source') return false;
    if (value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object' && value !== null) return hasPatchContent(value as Record<string, unknown>);
    return true;
  });
}

function normalizeAdultPrivateProfilePatch(
  patch: ActorAdultPrivateProfilePatch | undefined
): NormalizedActorAdultPrivateProfilePatch | undefined {
  if (!patch) return undefined;

  const profileStatus = firstPrivateText(patch.profileStatus, patch.femaleProfileStatus, patch.女性扩展档案状态);
  const womb = normalizeWombProfile(patch.womb ?? patch.子宫);
  const partProfiles = normalizePartProfiles(patch);
  const normalized: NormalizedActorAdultPrivateProfilePatch = {
    ...(typeof patch.enabled === 'boolean' ? { enabled: patch.enabled } : {}),
    ...(typeof patch.ageConfirmedAdult === 'boolean' ? { ageConfirmedAdult: patch.ageConfirmedAdult } : {}),
    ...(profileStatus ? { profileStatus } : {}),
    ...(womb ? { womb } : {}),
    ...(partProfiles ? { partProfiles } : {}),
    ...(firstFetishNotes(patch.fetishNotes, patch.性癖) ? { fetishNotes: firstFetishNotes(patch.fetishNotes, patch.性癖) } : {}),
    ...(firstSensitivePoints(patch.sensitivePoints, patch.敏感点)
      ? { sensitivePoints: firstSensitivePoints(patch.sensitivePoints, patch.敏感点) }
      : {}),
    ...(firstText(patch.summary, patch.intimacyStage) ? { summary: firstText(patch.summary, patch.intimacyStage) } : {}),
    ...(firstText(patch.preferenceNotes, patch.romanticPreference)
      ? { preferenceNotes: firstText(patch.preferenceNotes, patch.romanticPreference) }
      : {}),
    ...(firstText(patch.boundaryNotes, patch.riskTolerance)
      ? { boundaryNotes: firstText(patch.boundaryNotes, patch.riskTolerance) }
      : {}),
    ...(firstText(patch.sensitiveNotes, patch.hiddenDesires)
      ? { sensitiveNotes: firstText(patch.sensitiveNotes, patch.hiddenDesires) }
      : {}),
    ...(cleanText(patch.relationshipRiskNotes) ? { relationshipRiskNotes: cleanText(patch.relationshipRiskNotes) } : {})
  };

  return hasPatchContent(normalized as Record<string, unknown>) ? normalized : undefined;
}

export function normalizeActorFemaleProfilePatch(
  patch: ActorFemaleProfilePatch | undefined
): NormalizedActorFemaleProfilePatch | undefined {
  if (!patch) return undefined;

  const adultPrivateProfile = normalizeAdultPrivateProfilePatch(patch.adultPrivateProfile);
  const relationshipNetwork = compactListFromUnknown(patch.relationshipNetwork) ?? compactListFromUnknown(patch.socialNetwork);
  const relationshipNetworkEdges =
    compactRelationshipEdgesFromUnknown(patch.relationshipNetworkEdges) ?? compactRelationshipEdgesFromUnknown(patch.关系网变量);
  const normalized: NormalizedActorFemaleProfilePatch = {
    ...(cleanText(patch.birthday) ? { birthday: cleanText(patch.birthday) } : {}),
    ...(firstText(patch.addressToPlayer, patch.callSign, patch.对主角称呼)
      ? { addressToPlayer: firstText(patch.addressToPlayer, patch.callSign, patch.对主角称呼) }
      : {}),
    ...(firstText(patch.relationshipNotes, patch.publicRelationship)
      ? { relationshipNotes: firstText(patch.relationshipNotes, patch.publicRelationship) }
      : {}),
    ...(cleanText(patch.publicIntimacyNotes) ? { publicIntimacyNotes: cleanText(patch.publicIntimacyNotes) } : {}),
    ...(firstText(patch.appearanceDescription, patch.appearanceExpansion, patch.外貌描写)
      ? { appearanceDescription: firstText(patch.appearanceDescription, patch.appearanceExpansion, patch.外貌描写) }
      : {}),
    ...(firstText(patch.bodyDescription, patch.身材描写) ? { bodyDescription: firstText(patch.bodyDescription, patch.身材描写) } : {}),
    ...(firstText(patch.clothingStyle, patch.衣着风格) ? { clothingStyle: firstText(patch.clothingStyle, patch.衣着风格) } : {}),
    ...(cleanText(patch.appearanceExtension) ? { appearanceExtension: cleanText(patch.appearanceExtension) } : {}),
    ...(firstText(patch.personalityCore, patch.characterCore, patch.核心性格特征)
      ? { personalityCore: firstText(patch.personalityCore, patch.characterCore, patch.核心性格特征) }
      : {}),
    ...(firstText(patch.affectionProgressionCondition, patch.affectionAdvancementConditions, patch.好感度突破条件)
      ? {
          affectionProgressionCondition: firstText(
            patch.affectionProgressionCondition,
            patch.affectionAdvancementConditions,
            patch.好感度突破条件
          )
        }
      : {}),
    ...(firstText(patch.relationshipProgressionCondition, patch.relationshipAdvancementConditions, patch.关系突破条件)
      ? {
          relationshipProgressionCondition: firstText(
            patch.relationshipProgressionCondition,
            patch.relationshipAdvancementConditions,
            patch.关系突破条件
          )
        }
      : {}),
    ...(relationshipNetwork ? { relationshipNetwork } : {}),
    ...(relationshipNetworkEdges ? { relationshipNetworkEdges } : {}),
    ...(firstText(patch.emotionalBoundary, patch.emotionalBoundaries)
      ? { emotionalBoundary: firstText(patch.emotionalBoundary, patch.emotionalBoundaries) }
      : {}),
    ...(adultPrivateProfile ? { adultPrivateProfile } : {}),
    ...(patch.source ? { source: patch.source } : {})
  };

  return hasPatchContent(normalized as Record<string, unknown>) ? normalized : undefined;
}

export function normalizeActorFemaleProfile(profile: ActorFemaleProfile | undefined): ActorFemaleProfile | undefined {
  const normalizedPatch = normalizeActorFemaleProfilePatch(profile as ActorFemaleProfilePatch | undefined);
  if (!normalizedPatch) return undefined;

  const { adultPrivateProfile, relationshipNetwork, relationshipNetworkEdges, source, ...publicProfile } = normalizedPatch;
  const normalizedProfile: ActorFemaleProfile = {
    ...publicProfile,
    ...(relationshipNetwork ? { relationshipNetwork } : {}),
    ...(relationshipNetworkEdges ? { relationshipNetworkEdges } : {}),
    ...(cloneOptionalTime(profile?.updatedAt) ? { updatedAt: cloneOptionalTime(profile?.updatedAt) } : {}),
    ...(source ?? profile?.source ? { source: source ?? profile?.source } : {})
  };

  if (adultPrivateProfile || profile?.adultPrivateProfile) {
    const existingPrivateProfile = profile?.adultPrivateProfile;
    normalizedProfile.adultPrivateProfile = {
      enabled: adultPrivateProfile?.enabled ?? existingPrivateProfile?.enabled ?? true,
      ageConfirmedAdult: adultPrivateProfile?.ageConfirmedAdult ?? existingPrivateProfile?.ageConfirmedAdult ?? false,
      profileStatus: firstPrivateText(adultPrivateProfile?.profileStatus, existingPrivateProfile?.profileStatus) ?? 'ready',
      womb: mergeWombProfile(existingPrivateProfile?.womb, adultPrivateProfile?.womb),
      partProfiles: mergePartProfiles(existingPrivateProfile?.partProfiles, adultPrivateProfile?.partProfiles),
      ...(firstFetishNotes(adultPrivateProfile?.fetishNotes, existingPrivateProfile?.fetishNotes)
        ? { fetishNotes: firstFetishNotes(adultPrivateProfile?.fetishNotes, existingPrivateProfile?.fetishNotes) }
        : { fetishNotes: '偏好强势但有分寸的挑逗、贴身掌控和身体赞美；在私密空间里容易被羞耻感与被占有感激起欲望。' }),
      ...(firstSensitivePoints(adultPrivateProfile?.sensitivePoints, existingPrivateProfile?.sensitivePoints)
        ? { sensitivePoints: firstSensitivePoints(adultPrivateProfile?.sensitivePoints, existingPrivateProfile?.sensitivePoints) }
        : { sensitivePoints: '敏感点集中在乳尖、阴蒂、颈侧、腰侧、大腿内侧和臀缝。' }),
      ...(firstText(adultPrivateProfile?.summary, existingPrivateProfile?.summary)
        ? { summary: firstText(adultPrivateProfile?.summary, existingPrivateProfile?.summary) }
        : {}),
      ...(firstText(adultPrivateProfile?.preferenceNotes, existingPrivateProfile?.preferenceNotes)
        ? { preferenceNotes: firstText(adultPrivateProfile?.preferenceNotes, existingPrivateProfile?.preferenceNotes) }
        : {}),
      ...(firstText(adultPrivateProfile?.boundaryNotes, existingPrivateProfile?.boundaryNotes)
        ? { boundaryNotes: firstText(adultPrivateProfile?.boundaryNotes, existingPrivateProfile?.boundaryNotes) }
        : {}),
      ...(firstText(adultPrivateProfile?.sensitiveNotes, existingPrivateProfile?.sensitiveNotes)
        ? { sensitiveNotes: firstText(adultPrivateProfile?.sensitiveNotes, existingPrivateProfile?.sensitiveNotes) }
        : {}),
      ...(firstText(adultPrivateProfile?.relationshipRiskNotes, existingPrivateProfile?.relationshipRiskNotes)
        ? { relationshipRiskNotes: firstText(adultPrivateProfile?.relationshipRiskNotes, existingPrivateProfile?.relationshipRiskNotes) }
        : {}),
      ...(cloneOptionalTime(existingPrivateProfile?.updatedAt) ? { updatedAt: cloneOptionalTime(existingPrivateProfile?.updatedAt) } : {}),
      ...(existingPrivateProfile?.source ?? profile?.source ? { source: existingPrivateProfile?.source ?? profile?.source } : {})
    };
  }

  return normalizedProfile;
}

export function applyActorFemaleProfilePatch(
  actor: Actor,
  patch: ActorFemaleProfilePatch | undefined,
  currentTime: GameTime,
  source: NonNullable<ActorFemaleProfile['source']>
): Actor {
  if (!patch || actor.gender !== 'female') return actor;
  const normalizedPatch = normalizeActorFemaleProfilePatch(patch);
  if (!normalizedPatch) return actor;

  const existingProfile = normalizeActorFemaleProfile(actor.femaleProfile);
  const { adultPrivateProfile, relationshipNetwork, relationshipNetworkEdges, source: patchSource, ...publicPatch } = normalizedPatch;
  const nextProfile: ActorFemaleProfile = {
    ...(existingProfile ?? {}),
    ...publicPatch,
    ...(relationshipNetwork === undefined ? {} : { relationshipNetwork: compactList(relationshipNetwork) }),
    ...(relationshipNetworkEdges === undefined ? {} : { relationshipNetworkEdges }),
    updatedAt: cloneTime(currentTime),
    source: patchSource ?? source
  };

  if (isAdultFemaleActorAt(actor, currentTime)) {
    const fallbackPrivateProfile = createAdultPrivateProfileFallback(currentTime, patchSource ?? source, actor, nextProfile);
    const basePrivateProfile = existingProfile?.adultPrivateProfile ?? fallbackPrivateProfile;
    nextProfile.adultPrivateProfile = {
      ...basePrivateProfile,
      ...(adultPrivateProfile ?? {}),
      profileStatus: firstPrivateText(adultPrivateProfile?.profileStatus, basePrivateProfile.profileStatus, fallbackPrivateProfile.profileStatus) ?? 'ready',
      womb: mergeWombProfile(basePrivateProfile.womb, adultPrivateProfile?.womb),
      partProfiles: mergePartProfiles(basePrivateProfile.partProfiles, adultPrivateProfile?.partProfiles, fallbackPrivateProfile.partProfiles),
      fetishNotes:
        firstFetishNotes(adultPrivateProfile?.fetishNotes, basePrivateProfile.fetishNotes, fallbackPrivateProfile.fetishNotes) ??
        fallbackPrivateProfile.fetishNotes,
      sensitivePoints:
        firstSensitivePoints(adultPrivateProfile?.sensitivePoints, basePrivateProfile.sensitivePoints, fallbackPrivateProfile.sensitivePoints) ??
        fallbackPrivateProfile.sensitivePoints,
      enabled: true,
      ageConfirmedAdult: true,
      updatedAt: adultPrivateProfile ? cloneTime(currentTime) : existingProfile?.adultPrivateProfile?.updatedAt ?? cloneTime(currentTime),
      source: adultPrivateProfile ? patchSource ?? source : existingProfile?.adultPrivateProfile?.source ?? patchSource ?? source
    };
  }

  return {
    ...actor,
    femaleProfile: nextProfile
  };
}

export function projectFemaleProfileForPrompt(actor: Actor, currentTime: GameTime): ActorFemaleProfile | undefined {
  const normalizedProfile = normalizeActorFemaleProfile(actor.femaleProfile);
  if (!normalizedProfile) return undefined;
  if (isAdultFemaleActorAt(actor, currentTime)) {
    return {
      ...normalizedProfile,
      relationshipNetwork: normalizedProfile.relationshipNetwork ? [...normalizedProfile.relationshipNetwork] : undefined,
      relationshipNetworkEdges: normalizedProfile.relationshipNetworkEdges
        ? normalizedProfile.relationshipNetworkEdges.map((edge) => ({ ...edge }))
        : undefined,
      adultPrivateProfile: normalizedProfile.adultPrivateProfile
        ? {
            ...normalizedProfile.adultPrivateProfile,
            womb: mergeWombProfile(normalizedProfile.adultPrivateProfile.womb, undefined),
            partProfiles: normalizedProfile.adultPrivateProfile.partProfiles
              ? Object.fromEntries(
                  Object.entries(normalizedProfile.adultPrivateProfile.partProfiles).map(([key, part]) => [
                    key,
                    part
                      ? {
                          ...part,
                          ...(part.updatedAt ? { updatedAt: cloneTime(part.updatedAt) } : {})
                        }
                      : part
                  ])
                )
              : undefined
          }
        : undefined
    };
  }

  const { adultPrivateProfile: _adultPrivateProfile, ...publicProfile } = normalizedProfile;
  return {
    ...publicProfile,
    relationshipNetwork: publicProfile.relationshipNetwork ? [...publicProfile.relationshipNetwork] : undefined,
    relationshipNetworkEdges: publicProfile.relationshipNetworkEdges
      ? publicProfile.relationshipNetworkEdges.map((edge) => ({ ...edge }))
      : undefined
  };
}
