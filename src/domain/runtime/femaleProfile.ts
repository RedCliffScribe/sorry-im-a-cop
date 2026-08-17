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

type NormalizedActorAdultPrivateWombPatch = Partial<
  Pick<ActorAdultPrivateWombProfile, 'status' | 'cervixStatus' | 'records'>
>;

type NormalizedActorAdultPrivateProfilePatch = Partial<
  Omit<ActorAdultPrivateProfile, 'updatedAt' | 'source' | 'womb'>
> & {
  womb?: NormalizedActorAdultPrivateWombPatch;
};

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
    ...(record.pregnancyCheckDate ? { pregnancyCheckDate: record.pregnancyCheckDate } : {}),
    ...(record.pregnancyId ? { pregnancyId: record.pregnancyId } : {}),
    ...(record.pregnancyCheckResult ? { pregnancyCheckResult: record.pregnancyCheckResult } : {}),
    ...(record.paternityCandidates
      ? { paternityCandidates: record.paternityCandidates.map((candidate) => ({ ...candidate })) }
      : {})
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
    endedAt: cloneTime(record.endedAt),
    paternityCandidates: record.paternityCandidates?.map((candidate) => ({ ...candidate }))
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

function normalizeWombProfile(value: unknown): NormalizedActorAdultPrivateWombPatch | undefined {
  if (!isRecord(value)) return undefined;
  const status = firstText(value.status, value.状态);
  const cervixStatus = firstText(value.cervixStatus, value.宫口状态);
  const records = normalizeWombRecords(value.records ?? value.内射记录);
  if (!status && !cervixStatus && records === undefined) return undefined;
  return {
    ...(status ? { status } : {}),
    ...(cervixStatus ? { cervixStatus } : {}),
    ...(records !== undefined ? { records } : {})
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
  patch: NormalizedActorAdultPrivateWombPatch | undefined,
  cervixStatusUpdatedAt: GameTime | undefined
): ActorAdultPrivateWombProfile {
  const fallback = createDefaultWombProfile();
  const hasEngineTruth = Boolean(
    existing?.pregnancy ||
      (existing?.pendingPregnancyChecks?.length ?? 0) > 0 ||
      existing?.lastPregnancyCheck ||
      (existing?.pregnancyHistory?.length ?? 0) > 0
  );
  const patchedCervixStatus = firstPrivateText(patch?.cervixStatus);
  const nextCervixStatusUpdatedAt = patchedCervixStatus
    ? cloneOptionalTime(cervixStatusUpdatedAt)
    : cloneOptionalTime(existing?.cervixStatusUpdatedAt);
  return {
    status: firstPrivateText(hasEngineTruth ? existing?.status : patch?.status, existing?.status) ?? fallback.status,
    cervixStatus: patchedCervixStatus ?? firstPrivateText(existing?.cervixStatus) ?? fallback.cervixStatus,
    ...(nextCervixStatusUpdatedAt ? { cervixStatusUpdatedAt: nextCervixStatusUpdatedAt } : {}),
    records: (hasEngineTruth ? existing?.records ?? fallback.records : patch?.records ?? existing?.records ?? fallback.records).map(
      cloneWombRecord
    ),
    ...(clonePregnancyState(existing?.pregnancy) ? { pregnancy: clonePregnancyState(existing?.pregnancy) } : {}),
    ...(existing?.pendingPregnancyChecks?.length
      ? {
          pendingPregnancyChecks: existing.pendingPregnancyChecks
            .map((pregnancy) => clonePregnancyState(pregnancy))
            .filter((pregnancy): pregnancy is ActorPregnancyState => Boolean(pregnancy))
        }
      : {}),
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
  patch: ActorAdultPrivateProfilePart | undefined
): ActorAdultPrivateProfilePart | undefined {
  const description = firstPrivateText(patch?.description, existing?.description);
  const imagePromptAnchor = firstPrivateText(patch?.imagePromptAnchor, existing?.imagePromptAnchor);
  const updatedAt = cloneOptionalTime(patch?.updatedAt ?? existing?.updatedAt);
  if (!description && !imagePromptAnchor && !updatedAt) return undefined;
  return {
    ...(description ? { description } : {}),
    ...(imagePromptAnchor
      ? { imagePromptAnchor }
      : {}),
    ...(updatedAt ? { updatedAt } : {})
  };
}

function mergePartProfiles(
  existing: ActorAdultPrivateProfile['partProfiles'] | undefined,
  patch: ActorAdultPrivateProfile['partProfiles'] | undefined
): ActorAdultPrivateProfile['partProfiles'] | undefined {
  const profiles = ADULT_PRIVATE_PART_KEYS.reduce<NonNullable<ActorAdultPrivateProfile['partProfiles']>>((result, key) => {
    const profile = mergePartProfile(existing?.[key], patch?.[key]);
    if (profile) result[key] = profile;
    return result;
  }, {});
  return Object.keys(profiles).length > 0 ? profiles : undefined;
}

function adultPrivateProfileIsReady(profile: ActorAdultPrivateProfile): boolean {
  return Boolean(
    profile.womb &&
      ADULT_PRIVATE_PART_KEYS.every((key) => cleanPrivatePartDescription(key, profile.partProfiles?.[key]?.description)) &&
      cleanFetishNotes(profile.fetishNotes) &&
      cleanSensitivePoints(profile.sensitivePoints)
  );
}

function mergeAdultPrivateProfile(
  existing: ActorAdultPrivateProfile | undefined,
  patch: NormalizedActorAdultPrivateProfilePatch | undefined,
  options: {
    ageConfirmedAdult: boolean;
    updatedAt?: GameTime;
    cervixStatusUpdatedAt?: GameTime;
    source?: ActorAdultPrivateProfile['source'];
  }
): ActorAdultPrivateProfile | undefined {
  if (!existing && !patch) return undefined;
  const womb =
    existing?.womb || patch?.womb
      ? mergeWombProfile(existing?.womb, patch?.womb, options.cervixStatusUpdatedAt)
      : undefined;
  const partProfiles = mergePartProfiles(existing?.partProfiles, patch?.partProfiles);
  const profile: ActorAdultPrivateProfile = {
    enabled: patch?.enabled ?? existing?.enabled ?? true,
    ageConfirmedAdult: options.ageConfirmedAdult,
    ...(womb ? { womb } : {}),
    ...(partProfiles ? { partProfiles } : {}),
    ...(firstFetishNotes(patch?.fetishNotes, existing?.fetishNotes)
      ? { fetishNotes: firstFetishNotes(patch?.fetishNotes, existing?.fetishNotes) }
      : {}),
    ...(firstSensitivePoints(patch?.sensitivePoints, existing?.sensitivePoints)
      ? { sensitivePoints: firstSensitivePoints(patch?.sensitivePoints, existing?.sensitivePoints) }
      : {}),
    ...(firstText(patch?.summary, existing?.summary) ? { summary: firstText(patch?.summary, existing?.summary) } : {}),
    ...(firstText(patch?.preferenceNotes, existing?.preferenceNotes)
      ? { preferenceNotes: firstText(patch?.preferenceNotes, existing?.preferenceNotes) }
      : {}),
    ...(firstText(patch?.boundaryNotes, existing?.boundaryNotes)
      ? { boundaryNotes: firstText(patch?.boundaryNotes, existing?.boundaryNotes) }
      : {}),
    ...(firstText(patch?.sensitiveNotes, existing?.sensitiveNotes)
      ? { sensitiveNotes: firstText(patch?.sensitiveNotes, existing?.sensitiveNotes) }
      : {}),
    ...(firstText(patch?.relationshipRiskNotes, existing?.relationshipRiskNotes)
      ? { relationshipRiskNotes: firstText(patch?.relationshipRiskNotes, existing?.relationshipRiskNotes) }
      : {}),
    ...(options.updatedAt ?? existing?.updatedAt ? { updatedAt: cloneOptionalTime(options.updatedAt ?? existing?.updatedAt) } : {}),
    ...(options.source ?? existing?.source ? { source: options.source ?? existing?.source } : {})
  };
  const requestedStatus = firstPrivateText(patch?.profileStatus, existing?.profileStatus);
  profile.profileStatus = adultPrivateProfileIsReady(profile) ? requestedStatus ?? 'ready' : 'developing';
  return profile;
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
  patch: ActorAdultPrivateProfilePatch | undefined,
  allowCervixStatusOnly: boolean
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

  const hasSubstantiveWombFact = Boolean(
    womb &&
      ((womb.records?.length ?? 0) > 0 || (allowCervixStatusOnly && womb.cervixStatus))
  );
  const hasSubstantivePrivateFact = Boolean(
    hasSubstantiveWombFact ||
      partProfiles ||
      normalized.fetishNotes ||
      normalized.sensitivePoints ||
      normalized.summary ||
      normalized.preferenceNotes ||
      normalized.boundaryNotes ||
      normalized.sensitiveNotes ||
      normalized.relationshipRiskNotes
  );

  // Metadata alone must not create an empty private dossier. Pregnancy tracking
  // is initialized by the deterministic lifecycle only after a real risk event.
  return hasSubstantivePrivateFact && hasPatchContent(normalized as Record<string, unknown>) ? normalized : undefined;
}

export function normalizeActorFemaleProfilePatch(
  patch: ActorFemaleProfilePatch | undefined,
  options: { allowCervixStatusOnly?: boolean } = {}
): NormalizedActorFemaleProfilePatch | undefined {
  if (!patch) return undefined;

  const adultPrivateProfile = normalizeAdultPrivateProfilePatch(
    patch.adultPrivateProfile,
    options.allowCervixStatusOnly === true
  );
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
  const normalizedPatch = normalizeActorFemaleProfilePatch(profile as ActorFemaleProfilePatch | undefined, {
    allowCervixStatusOnly: Boolean(profile?.adultPrivateProfile)
  });
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
    normalizedProfile.adultPrivateProfile = mergeAdultPrivateProfile(
      profile?.adultPrivateProfile,
      adultPrivateProfile,
      {
        ageConfirmedAdult:
          adultPrivateProfile?.ageConfirmedAdult ?? profile?.adultPrivateProfile?.ageConfirmedAdult ?? false,
        updatedAt: profile?.adultPrivateProfile?.updatedAt,
        cervixStatusUpdatedAt:
          profile?.adultPrivateProfile?.womb?.cervixStatusUpdatedAt ??
          profile?.adultPrivateProfile?.updatedAt ??
          profile?.updatedAt,
        source: profile?.adultPrivateProfile?.source ?? profile?.source
      }
    );
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
  const normalizedPatch = normalizeActorFemaleProfilePatch(patch, {
    allowCervixStatusOnly: Boolean(actor.femaleProfile?.adultPrivateProfile)
  });
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

  if (!isAdultFemaleActorAt(actor, currentTime)) {
    delete nextProfile.adultPrivateProfile;
  } else if (adultPrivateProfile || existingProfile?.adultPrivateProfile) {
    nextProfile.adultPrivateProfile = mergeAdultPrivateProfile(
      existingProfile?.adultPrivateProfile,
      adultPrivateProfile,
      {
        ageConfirmedAdult: true,
        updatedAt: adultPrivateProfile ? currentTime : existingProfile?.adultPrivateProfile?.updatedAt,
        cervixStatusUpdatedAt: adultPrivateProfile?.womb?.cervixStatus ? currentTime : undefined,
        source: adultPrivateProfile ? patchSource ?? source : existingProfile?.adultPrivateProfile?.source
      }
    );
  }

  return {
    ...actor,
    femaleProfile: nextProfile
  };
}

export const CERVIX_STATUS_RECOVERY_HOURS = 12;

function gameTimeValue(time: GameTime): number {
  return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute);
}

export function settleTransientCervixStatus(actor: Actor, currentTime: GameTime): Actor {
  const femaleProfile = actor.femaleProfile;
  const adultPrivateProfile = femaleProfile?.adultPrivateProfile;
  const womb = adultPrivateProfile?.womb;
  if (!femaleProfile || !adultPrivateProfile || !womb || womb.cervixStatus === '紧闭') return actor;

  const observedAt = womb.cervixStatusUpdatedAt ?? adultPrivateProfile.updatedAt ?? femaleProfile.updatedAt;
  if (
    !observedAt ||
    gameTimeValue(currentTime) - gameTimeValue(observedAt) < CERVIX_STATUS_RECOVERY_HOURS * 60 * 60 * 1000
  ) {
    return actor;
  }

  return {
    ...actor,
    femaleProfile: {
      ...femaleProfile,
      updatedAt: cloneTime(currentTime),
      adultPrivateProfile: {
        ...adultPrivateProfile,
        updatedAt: cloneTime(currentTime),
        womb: {
          ...womb,
          cervixStatus: '紧闭',
          cervixStatusUpdatedAt: cloneTime(currentTime)
        }
      }
    }
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
            womb: mergeWombProfile(normalizedProfile.adultPrivateProfile.womb, undefined, undefined),
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
