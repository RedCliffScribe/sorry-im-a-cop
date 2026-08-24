import { getNarrativeLengthProfile, type NarrativeLengthLevel } from '../settings/narrativeLength';
import { getCantoneseFlavorProfile } from '../settings/cantoneseFlavor';
import { getGameDifficultyProfile } from '../settings/gameDifficulty';
import {
  calculateEffectiveTarget,
  deriveLocalJudgementOutcome,
  judgementAttributeLabels,
  judgementDifficultyLabels,
  judgementDifficultyModifiers,
  type LocalJudgementSourceSnapshot
} from '../conflict/localJudgement';
import type { JudgementResolutionEnvelope } from '../conflict/judgementPreflight';
import type { AttributeBlock, GameDifficultyLevel } from '../runtime/types';
import {
  formatNpcSimulationPackageForPrompt,
  type NpcSimulationPackage
} from '../npc/npcSimulation';
import { resolvePromptText } from '../prompts/promptRegistry';
import { hk1980sOpeningScenarios, hk1980sPoliceRankKnowledge, hk1980sTriadBehaviorKnowledge } from '../worldpack/hk1980sOpening';
import { hk1980sPoliceOperationalUnitKnowledge } from '../worldpack/hk1980sPoliceOperationalUnits';
import type {
  NarrativePerspective,
  PlayerPortrayalMode,
  PregnancyMode,
  PromptSettings
} from '../settings/types';
import {
  createAdultRelationshipStyleGuide,
  createNarrativePerspectiveGuide,
  createNarrativeStyleAndDisplayGuide,
  createPlayerActionLock,
  createPlayerControlOutputRule,
  createPlayerPortrayalGuide
} from './narrativePromptGuides';
import type { PromptContext } from './selectContext';
import { formatGameTimeWithWeekday, formatTimeReferenceFrame } from '../time/gameTime';
import { formatMemoryTemporalReferences } from '../time/memoryTemporal';
import { formatCurrencyAmountByConfig } from '../worldpack/economyConfig';
import { createNarrativeLanguageGuide, type AppLocale } from '../localization/appLocale';
import { formatEverydayEmployerTemplateCandidates } from '../worldpack/hk1980sLivelihood';
import { formatDramaExecutionPrompt } from '../drama/prompt';
import type { DramaPlan, DramaPlanningContext, ForegroundContract } from '../drama/types';
import { VEHICLE_ASSET_WRITEBACK_CONTRACT } from '../assets/assetWritebackContract';
import { formatHistoricalHongKongNewsAnchorsForPrompt } from '../news/historicalHongKongNewsAnchors';
import {
  formatCaseActionIntentsForPrompt,
  type ResolvedCaseActionIntent
} from '../cases/caseActionIntent';
import { POLICE_PROMOTION_DLC_ID } from '../police/policePromotionRules';

export interface ComposePromptOptions {
  narrativeLengthLevel?: NarrativeLengthLevel;
  narrativePerspective?: NarrativePerspective;
  playerPortrayalMode?: PlayerPortrayalMode;
  locale?: AppLocale;
  pregnancyMode?: PregnancyMode;
  npcSimulationPackage?: NpcSimulationPackage;
  promptSettings?: PromptSettings;
  dramaPlanningContext?: DramaPlanningContext;
  dramaPlan?: DramaPlan;
  foregroundContract?: ForegroundContract;
  caseActionIntents?: ResolvedCaseActionIntent[];
  localJudgement?: {
    presetRoll: number;
    attributes: AttributeBlock;
    gameDifficulty: GameDifficultyLevel;
    sources: LocalJudgementSourceSnapshot;
    preflightReason?: string;
    resolution?: JudgementResolutionEnvelope;
  };
}

function section(title: string, body: string): string {
  return `## ${title}\n${body.trim()}`;
}

function formatList(items: string[], empty = '- 无'): string {
  return items.length ? items.join('\n') : empty;
}

function formatMemoryTime(time: PromptContext['memories'][number]['gameTime']): string {
  return formatGameTimeWithWeekday(time);
}

function formatGameTime(time: { year: number; month: number; day: number; hour: number; minute: number }): string {
  return formatGameTimeWithWeekday(time);
}

function formatTimeReferenceProjection(context: PromptContext): string {
  return [
    'TIME_REFERENCE_FRAME',
    formatTimeReferenceFrame(context.currentTime),
    'Rule: current 是唯一“现在”。今天、今晚、昨晚、昨天、前晚、明天、明日、明晚、后天等相对词必须按上面的参照框架解释。',
    'Rule: 引用已发生事件时，优先使用该事件自己的 time 与 relative 标签；不要因为当前场景在夜里，就把更早的夜间事件改称为“今晚”。',
    'Rule: 玩家输入或旧记忆正文里的“昨天、昨晚、今晚、明天、明日、明晚、后天”等只是记录形成时的说法，不能覆盖该记录的绝对 time；叙述或承接时必须按当前时间重新解释。',
    'Rule: 对相对时间没有把握时，使用绝对日期时间，或用“前一晚”“当晚”“那天晚上”等不漂移说法。'
  ].join('\n');
}

const universalOpeningPacingRules = [
  '正文禁用“暗流”一词，不得用空泛气氛句或无事实预告制造廉价悬念。',
  '阴谋、黑幕、幕后安排不是禁题；但必须来自已有证据、NPC具体行动、已投喂事实或玩家主动调查。',
  '压力必须写成具体可见、可感知、可行动的现场事实；高压开局也只能高在眼前事件、明确阻力、时间成本或关系代价。',
  '不要把普通场面写成无事实支撑的未来危机预告或万能悬疑钩子。'
];

const openingPacingProfiles: Record<
  PromptContext['openingPressure'],
  { label: string; rules: string[] }
> = {
  relaxed: {
    label: '轻松开局',
    rules: [
      '普通日常开局：继续写日常执勤、生活小事、街坊寒暄、家长里短、普通人情请求、轻微投诉或文书交接。',
      '不要把轻松开局主动升级为倒计时、隐藏大案；不要把旧人情、街坊求助或小麻烦升级成命案、灭口、绑架、枪战、血衣、尸体、带血凶器或关键证人求救。',
      '如果玩家主动追问，也先给生活化、可观察、可暂缓的回应；需要升级时必须经过更多确认、调查或玩家明确推进。',
      '不要在正文中写“轻松开局”“开局压力”“系统提示”等工程或档位用语，只写角色能自然看见、听见和处理的日常场面。'
    ]
  },
  routine: {
    label: '日常开局',
    rules: [
      '可以有普通报案、小麻烦或轻微制度阻力，但不要无铺垫升级成重大案件。',
      '保留问人、观察、准备、暂缓或转交的空间。'
    ]
  },
  standard: {
    label: '标准开局',
    rules: [
      '可以有明确矛盾和案件苗头，但不要一步到位揭露全部真相或强迫玩家立刻结案。',
      '风险升级应来自玩家行动、证据确认或 NPC 自然反应。'
    ]
  },
  tense: {
    label: '棘手开局',
    rules: [
      '可以保持较强压力，但仍要保留非战斗、非强闯、非立刻结案的路径。',
      '不要让局势每回合无条件爆雷。'
    ]
  },
  high: {
    label: '高压开局',
    rules: [
      '允许高风险和强急迫，但不能自动替玩家决定行动、不能开局直接失败。',
      '高压也必须依赖明确触发条件和结构化写回延续。'
    ]
  }
};

function formatOpeningPacingProjection(context: PromptContext): string {
  const pressure = context.openingPressure ?? 'relaxed';
  const profile = openingPacingProfiles[pressure] ?? openingPacingProfiles.relaxed;
  const earlyStage =
    context.turnCounter <= 8
      ? '当前仍处于开局前期，开局压力档位仍是本回合节奏硬约束。'
      : '当前已过开局前期，开局压力档位只作为长期节奏参考；后续风险仍必须来自已铺垫事实和玩家行动。';

  return [
    `开局压力：${profile.label}`,
    earlyStage,
    ...universalOpeningPacingRules.map((rule) => `- ${rule}`),
    ...profile.rules.map((rule) => `- ${rule}`)
  ].join('\n');
}

function formatMemoryProjection(entry: PromptContext['memoryProjection'][number]): string {
  const memory = entry.memory;
  const reasons = entry.reasons.length ? entry.reasons.join(',') : 'none';
  const period = memory.periodStart && memory.periodEnd
    ? ` 覆盖=${formatMemoryTime(memory.periodStart)}~${formatMemoryTime(memory.periodEnd)}`
    : '';
  return `- [${formatMemoryTime(memory.gameTime)}${period} kind=${memory.kind} 重要度=${memory.importance} 确定性=${memory.certainty} 原因=${reasons} 分数=${entry.score}] ${memory.text}`;
}

function formatMemoryLayerProjection(context: PromptContext): string {
  const projection = context.memoryLayerProjection;
  return [
    'MEMORY_LAYER_PROJECTION',
    '### short_term_history',
    formatList(projection.shortTerm.map(formatMemoryProjection)),
    '### mid_term_history',
    formatList(projection.midTerm.map(formatMemoryProjection)),
    '### long_term_history',
    formatList(projection.longTerm.map(formatMemoryProjection)),
    `diagnostics: selected=${projection.diagnostics.selectedMemoryIds.length} omitted=${projection.diagnostics.omittedMemoryCount}`,
    'Rule: short_term_history, mid_term_history and long_term_history are mutually exclusive chronological coverage, not three importance rankings. Do not treat the same event as three separate events.',
    'Rule: structured state projections and RECENT_COMPLETED_FACTS override every narrative memory layer. Within narrative memory only, recent raw prose overrides short-term history; short-term overrides mid-term; mid-term overrides long-term. When summaries disagree, the newer confirmed outcome wins.',
    'Rule: these layers preserve completed facts and consequences. Do not turn an already completed action back into a pending task.'
  ].join('\n');
}

function formatNpcMemoryProjection(context: PromptContext): string {
  const projection = context.npcMemoryProjection;
  const entries = projection.entries.map((entry) => {
    const reasons = entry.reasons.length ? entry.reasons.join(',') : 'none';
    const vector = entry.vectorScore === undefined ? '' : ` vectorScore=${entry.vectorScore.toFixed(3)}`;
    const temporalReferences = formatMemoryTemporalReferences(entry.temporalReferences, context.currentTime);
    const temporal = temporalReferences.length ? `\n  temporalReferences=${temporalReferences.join(' | ')}` : '';
    return `- actorId=${entry.actorId} actor=${entry.actorName} route=${entry.route} core=${entry.coreActor} memoryId=${entry.memoryId} time=${formatMemoryTime(entry.gameTime)} relative=${entry.relativeLabel} tier=${entry.tier} certainty=${entry.certainty} score=${entry.score}${vector} reasons=${reasons}\n  memory=${entry.text}${temporal}`;
  });

  return [
    'NPC_MEMORY_PROJECTION',
    formatList(entries),
    `diagnostics: selected=${projection.diagnostics.selectedMemoryIds.length}/${projection.diagnostics.candidateMemoryCount} actors=${projection.diagnostics.selectedActorIds.join(',') || 'none'} routeCounts=present:${projection.diagnostics.routeCounts.present},mentioned:${projection.diagnostics.routeCounts.mentioned},remote:${projection.diagnostics.routeCounts.remote} tierCounts=short:${projection.diagnostics.tierCounts.short_term},mid:${projection.diagnostics.tierCounts.mid_term},long:${projection.diagnostics.tierCounts.long_term} textChars=${projection.diagnostics.selectedTextChars} estimatedTokenBudget=${projection.diagnostics.estimatedTokenBudget} omitted=${projection.diagnostics.omittedMemoryCount}`,
    'Rule: this is the single routed NPC memory source for continuity. Prefer present NPC memories, then explicitly mentioned NPCs, then remote-presence candidates.',
    'Rule: NPC memory importance is intentionally ignored. Selection comes from actor route, layer anchors, text/vector relevance and recency.',
    'Rule: time 是记忆发生的绝对时间，relative 是依据本回合当前时间临时计算的称呼；绝对 time 是唯一权威。',
    'Rule: memory 文本已尽可能按形成时的绝对日期展开；temporalReferences 给出解析后的绝对日期及其相对本回合的状态。它比旧措辞更权威。',
    'Rule: use these memories to preserve relationship continuity, remembered promises, grudges, favors, fear, trust, and conversational callbacks. Do not restate them mechanically.',
    'Rule: durable new NPC memories must still be written through actorMemories; this section is read-only context.'
  ].join('\n');
}

function formatStoryVectorProjection(context: PromptContext): string {
  const projection = context.storyVectorProjection;
  const entries = projection.entries.map((entry) => {
    const checks = entry.judgementCheckIds.length ? ` judgementChecks=${entry.judgementCheckIds.join(',')}` : '';
    const combats = entry.combatEventIds.length ? ` combatEvents=${entry.combatEventIds.join(',')}` : '';
    return `- turnId=${entry.turnId} time=${entry.timeLabel} relative=${entry.relativeLabel}${checks}${combats} score=${entry.score} vectorScore=${entry.vectorScore.toFixed(3)} reasons=${entry.reasons.join(',') || 'none'}\n  narrativeText=${entry.text}`;
  });

  return [
    'STORY_VECTOR_PROJECTION',
    formatList(entries),
    `diagnostics: selected=${projection.diagnostics.selectedTurnIds.join(',') || 'none'} excludedRecent=${projection.diagnostics.excludedRecentTurnIds.length} textChars=${projection.diagnostics.selectedTextChars} estimatedTokenBudget=${projection.diagnostics.estimatedTokenBudget} omitted=${projection.diagnostics.omittedCandidateCount} missingVectors=${projection.diagnostics.missingVectorCount}`,
    'Rule: this section contains semantically retrieved older narrative. Use it for long-range callbacks, unresolved consequences, old promises, repeated motifs, and forgotten scene details.',
    'Rule: this section does not replace recent_raw_story; recent continuity still comes from RECENT_STORY_PROJECTION.',
    'Rule: durable facts still require structured state/writeback. Do not treat old prose as automatically current if newer state contradicts it.'
  ].join('\n');
}

function formatVectorMemoryProjection(context: PromptContext): string {
  const projection = context.vectorMemoryProjection;
  const entries = projection.entries.map((entry) => {
    const reasons = entry.reasons.length ? entry.reasons.join(',') : 'none';
    return `- memoryId=${entry.memoryId} kind=${entry.kind} tier=${entry.tier ?? 'unknown'} time=${formatMemoryTime(entry.gameTime)} importance=${entry.importance} certainty=${entry.certainty} score=${entry.score} vectorScore=${entry.vectorScore.toFixed(3)} reasons=${reasons}\n  memory=${entry.text}`;
  });

  return [
    'VECTOR_MEMORY_PROJECTION',
    formatList(entries),
    `diagnostics: selected=${projection.diagnostics.selectedMemoryIds.join(',') || 'none'} textChars=${projection.diagnostics.selectedTextChars} estimatedTokenBudget=${projection.diagnostics.estimatedTokenBudget} omitted=${projection.diagnostics.omittedCandidateCount} missingVectors=${projection.diagnostics.missingVectorCount}`,
    'Rule: this section contains semantically retrieved non-NPC facts: cases, places, world facts, player facts, and other durable context.',
    'Rule: NPC actor memories belong in NPC_MEMORY_PROJECTION; older prose belongs in STORY_VECTOR_PROJECTION.',
    'Rule: use this as fact recall support, but newer structured state overrides older memory when they conflict.'
  ].join('\n');
}

function formatRecentStoryProjection(context: PromptContext): string {
  const projection = context.recentStoryProjection;
  const rawEntries = projection.rawEntries.map((entry) => {
    const checks = entry.judgementCheckIds.length ? ` judgementChecks=${entry.judgementCheckIds.join(',')}` : '';
    const combats = entry.combatEventIds.length ? ` combatEvents=${entry.combatEventIds.join(',')}` : '';
    const playerInput = entry.playerInput ? `\n  playerInput=${entry.playerInput}` : '';
    return `- turnId=${entry.turnId} time=${entry.timeLabel} relative=${entry.relativeLabel}${checks}${combats}${playerInput}\n  narrativeText=${entry.text}`;
  });

  return [
    'RECENT_STORY_PROJECTION',
    '### recent_raw_story',
    formatList(rawEntries),
    `diagnostics: total=${projection.diagnostics.totalNarratorEntries} raw=${projection.diagnostics.rawEntryCount} summaries=${projection.diagnostics.summaryEntryCount} omittedEarlier=${projection.diagnostics.omittedEarlierCount}`,
    'Rule: recent_raw_story preserves the latest player input, confirmed facts, spatial continuity, unfinished actions and exact dialogue carry-over; it is not a style sample, so do not imitate its wording, metaphors, sentence rhythm or paragraph pattern.',
    'Rule: older turns are covered by MEMORY_LAYER_PROJECTION and are not repeated here.',
    'Rule: historical suggestedActions are intentionally omitted. Do not infer old UI action choices from narrative context or copy choice-prompt phrasing into narrativeText.',
    'Rule: RECENT_COMPLETED_FACTS and other structured state override recent_raw_story whenever they conflict; recent prose cannot reopen or erase a structured terminal outcome.',
    'Rule: if playerInput, summary, memory or recalled story says an action was completed, do not present the same action as still pending; only write consequences, replies, delays, rejection, acceptance, or new complications.',
    'Rule: durable facts still come from structured state projections and writeback; use this section to improve narrative continuity, not to invent state.'
  ].join('\n');
}

function formatPlaceForPrompt(place: PromptContext['mapProjection']['places'][number]): string {
  const aliasText = place.aliases?.length ? ` alias=${place.aliases.join('/')}` : '';
  const anchor = place.visualAnchor
    ? ` anchor=${place.visualAnchor.mapId}:${place.visualAnchor.x},${place.visualAnchor.y}(${place.visualAnchor.precision}${place.visualAnchor.source ? `/${place.visualAnchor.source}` : ''})`
    : '';
  return `- placeId=${place.placeId} name=${place.name}${place.nameEn ? ` / ${place.nameEn}` : ''}${aliasText} region=${place.regionId} district=${place.districtId ?? 'unknown'} type=${place.type} category=${place.category ?? 'none'} source=${place.source ?? 'runtime_generated'}${anchor}；${place.summary}`;
}

function formatMapProjection(context: PromptContext): string {
  const places = context.mapProjection.places.map(formatPlaceForPrompt);
  const lines = [
    'MAP_CONTEXT_PROJECTION',
    formatList(places),
    `diagnostics: selected=${context.mapProjection.diagnostics.selectedPlaceIds.length} total=${context.mapProjection.diagnostics.totalPlaces} omitted=${context.mapProjection.diagnostics.omittedPlaceCount}`,
    '规则：优先复用上面已有 placeId。若本回合产生以后会反复出现的新地点，必须在 placePatches 中写入固定地点资料；不要只在正文里临时命名。',
    '规则：runtime_generated 地点可以根据最近的 canonical place 和街道语境估算 visualAnchor，并写 source=runtime_inferred、basisPlaceIds 和 note。'
  ];
  if (context.mapProjection.travelReferences.length) {
    lines.push(
      'MOVEMENT_TIME_REFERENCE',
      ...context.mapProjection.travelReferences.map(
        (reference) => {
          const risk = reference.riskNote ? ` risk=${reference.riskNote}` : '';
          return `- from=${reference.fromPlaceName} to=${reference.toPlaceName} mode=${reference.mode} urgency=${reference.urgency} reference=${reference.minMinutes}-${reference.maxMinutes} minutes confidence=${reference.confidence} reason=${reference.reason}${risk}`;
        }
      ),
      '规则：移动耗时参考只用于防止时间漂移。请根据行动方式、天气、时段、人流和绕路情况，在参考范围附近选择具体 timePatch.elapsedMinutes；跨日/跨周等待或概述必须使用 timePatch.targetTime 写明绝对结束时间。'
    );
  }
  return lines.join('\n');
}

function formatWeatherProjection(context: PromptContext): string {
  const weather = context.weatherProjection;
  return [
    'WEATHER_CONTEXT_PROJECTION',
    `condition=${weather.condition} label=${weather.label} intensity=${weather.intensity} source=${weather.source}`,
    `impact=${weather.impactSummary}`,
    `validUntil=${formatGameTime(weather.validUntil)}`,
    `tags=${weather.tags.join(',') || 'none'}`,
    weather.reason ? `reason=${weather.reason}` : 'reason=none',
    '规则：天气用于现场氛围、能见度、湿滑、闷热、人流/交通和体力消耗参考；不是本地自动判定器。',
    '规则：天气是当前环境事实。即使天气影响了行动，也不要仅因再次描写其影响而写 weatherPatch。',
    '规则：只有正文明确发生了实际气象变化，且新 condition 与当前 condition 不同时，才写 weatherPatch；普通时间推进和天气到期后的变化由本地系统处理。',
    '规则：不得为了气氛反复延长细雨、大雨、雷雨或台风；当前天气可以继续影响路面、能见度、交通、人流、衣着、体力和本地判定因素。'
  ].join('\n');
}

const assetCategoryLabels: Record<PromptContext['assetProjection']['items'][number]['category'], string> = {
  equipment: '装备',
  general: '一般物品',
  document: '文件资料',
  valuable: '贵重物品',
  fixedAsset: '固定资产',
  vehicle: '交通工具'
};

function formatAssetItem(item: PromptContext['assetProjection']['items'][number]): string {
  const lines = [
    `- itemId=${item.itemId} category=${assetCategoryLabels[item.category]} name=${item.name} importance=${item.importance}`,
    `  summary: ${item.summary}`
  ];
  if (item.detail) lines.push(`  detail: ${item.detail}`);
  if (item.wearable) {
    lines.push(
      `  wearable: wearSummary=${item.wearable.wearSummary}${item.wearable.significance ? ` significance=${item.wearable.significance}` : ''}`
    );
  }
  if (item.evidence) {
    lines.push(
      `  evidence: caseId=${item.evidence.caseId}${item.evidence.caseTitle ? ` caseTitle=${item.evidence.caseTitle}` : ''} validByDefault=true disputed=${item.evidence.disputed} summary=${item.evidence.summary}${item.evidence.disputeSummary ? ` dispute=${item.evidence.disputeSummary}` : ''}`
    );
  }
  if (item.category === 'fixedAsset') {
    lines.push(
      `  fixedAsset: type=${item.fixedAssetType} relation=${item.holdingRelation} use=${item.primaryUse} location=${item.locationSummary} ownership=${item.ownershipSummary} access=${item.accessSummary}`
    );
  }
  if (item.category === 'vehicle') {
    lines.push(
      `  vehicle: type=${item.vehicleType} relation=${item.holdingRelation} condition=${item.condition} location=${item.locationSummary} access=${item.accessSummary}`
    );
    if (item.mobilityProfile) {
      lines.push(
        `  mobility: mode=${item.mobilityProfile.mode} timeMultiplier=${item.mobilityProfile.timeMultiplier} availability=${item.mobilityProfile.availabilitySummary}`
      );
    }
  }
  return lines.join('\n');
}

function formatAssetProjection(context: PromptContext): string {
  return [
    'ASSET_CONTEXT_PROJECTION',
    formatList(context.assetProjection.items.map(formatAssetItem)),
    `diagnostics: selected=${context.assetProjection.diagnostics.selectedItemIds.length} omitted=${context.assetProjection.diagnostics.omittedItemCount}`,
    '规则：这里只投影与当前回合最相关的物品与资产，不代表玩家全部财物。',
    '规则：普通物品不需要地点字段；固定资产和交通工具才写 locationSummary/accessSummary。',
    '规则：剧情中产生或变化的玩家拥有物品/资产必须用 assetPatch 写回；不要只写在正文里。',
    '规则：交给别人、寄出、提交到案件或证物袋、卖掉、丢失、销毁、消耗的物品，必须用 assetPatch.removeItems 从玩家持有中移除；提交案件时填写 movedToCaseId。',
    '规则：物品仍由玩家持有但内容变化时，必须复用同一个 itemId 用 assetPatch.upsertItems 更新完整物品对象；例如小说手稿从前三章推进到前四章，不要新建重复稿件，也不要让旧稿件消失。',
    '规则：可直接花用的现金、港币、钞票和零钱只进入 financePatch，不得成为物品；支票、本票、汇票、存单、债券、欠条、收据和礼券等独立凭据在兑现前可以作为物品。',
    '规则：钱包、钥匙串等不同实体不得合成一件组合物品；assetPatch.equippedItemIds 最多三项，只能引用应用后仍存在的真实物品 ID。',
    '规则：带 evidence 的物品默认是有效证据；只有剧情明确存在瑕疵、污染、来源争议或口径冲突时才写 disputed=true 和 disputeSummary。'
  ].join('\n');
}

function formatCaseProjection(context: PromptContext): string {
  const caseBlocks = context.caseProjection.cases.map(({ caseFile, evidence, visibleActivities }) => {
    const evidenceLines = evidence.length
      ? evidence.map((item) => {
          const dispute = item.disputeSummary ? ` dispute=${item.disputeSummary}` : '';
          return `  - evidenceId=${item.evidenceId} type=${item.evidenceType} title=${item.title} summary=${item.summary}${dispute}`;
        })
      : ['  - none'];
    const activityLines = visibleActivities.length
      ? visibleActivities.map(
          (activity) =>
            `  - [${formatGameTime(activity.gameTime)} kind=${activity.kind}] ${activity.summary}${activity.relatedEvidenceIds.length ? ` evidence=${activity.relatedEvidenceIds.join('/')}` : ''}`
        )
      : ['  - none'];

    return [
      `- caseId=${caseFile.caseId} title=${caseFile.title} status=${caseFile.status} role=${caseFile.playerRole} lead=${caseFile.leadActorName ?? caseFile.leadActorId ?? 'unknown'}`,
      `  type=${caseFile.caseType}`,
      `  summary=${caseFile.summary}`,
      `  currentFocus=${caseFile.currentFocus || 'none'}`,
      `  playerVisibleProgress=${caseFile.playerVisibleProgress || 'none'}`,
      '  evidence:',
      ...evidenceLines,
      '  recentVisibleActivity:',
      ...activityLines
    ].join('\n');
  });

  return [
    'CASE_CONTEXT_PROJECTION',
    formatList(caseBlocks),
    `diagnostics: selectedCases=${context.caseProjection.diagnostics.selectedCaseIds.join(',') || 'none'} selectedEvidence=${context.caseProjection.diagnostics.selectedEvidenceIds.join(',') || 'none'} omittedEvidence=${context.caseProjection.diagnostics.omittedEvidenceCount}`,
    'Rule: case status changes, new evidence, new actors, prosecution/court updates, or case activity must be written through casePatches and caseEvidencePatches. Do not infer or auto-close cases locally. Ordinary patrol help, nuisance calls, noise complaints, shopkeeper requests and on-scene mediation belong in currentMatterPatches or memories unless they have formal filing, serious harm, evidence, arrest, superior assignment or likely multi-turn investigation.',
    'Rule: playerRole=aware/involved means 相关案件，不是玩家当前负责案件；除非玩家主动提到、当前地点/人物直接相关、或 recentVisibleActivity 有新通知，不要让这类案件反复召唤玩家问话、补材料或重新办案。',
    'Rule: if the story confirms a case has been transferred to 已移交 CID/反黑/重案/检控 or another unit, and the player is no longer lead/assist/execute, update it through casePatches with playerRole=aware or involved, and write leadActorName/currentFocus/playerVisibleProgress to show that another unit now handles it while the player only keeps knowledge or connection.',
    'Rule: when playerRole=assist or execute and the story explicitly establishes an existing non-player actor as the case lead, handler or officer in charge, casePatches must include both that stable leadActorId and leadActorName. Never invent or replace an actor ID from prose alone.'
  ].join('\n');
}

function formatDeferredProjection(context: PromptContext): string {
  const eventLines = context.deferredProjection.dueEvents.map(
    (event) =>
      `- eventId=${event.eventId} source=${event.sourceModule} triggerAt=${formatGameTime(event.triggerAt)} related=${JSON.stringify(event.relatedIds)} title=${event.title} summary=${event.summary}\n  instruction=${event.promptInstruction}`
  );
  const hardRequirement = context.deferredProjection.dueEvents.length
    ? 'Hard requirement: every due event listed above must receive exactly one deferredEventPatches item with the same eventId. Set status to resolved or cancelled, or keep status pending only when you also move triggerAt to a later concrete time. Never leave a due event unchanged. If the event changes a case, also add a matching casePatches.activityLog entry.'
    : 'Rule: no due deferred events are available this turn; do not invent delayed outcomes.';

  return [
    'DEFERRED_EVENT_PROJECTION',
    formatList(eventLines),
    `diagnostics: pending=${context.deferredProjection.diagnostics.pendingEventIds.length} due=${context.deferredProjection.diagnostics.dueEventIds.join(',') || 'none'} omittedDue=${context.deferredProjection.diagnostics.omittedDueEventCount}`,
    hardRequirement,
    'Rule: local code will not invent delayed outcomes; all delayed outcomes must come through structured writeback.'
  ].join('\n');
}

function formatFinanceProjection(projection: PromptContext['financeProjection']): string {
  const formatAmount = (amount: number) => formatCurrencyAmountByConfig(amount, projection.currency);
  const formatAccount = (account: 'cash' | 'bank') => (account === 'cash' ? '随身现金' : '银行账户');
  const cashflows = projection.activeCashflows
    .map(
      (item) =>
        `- itemId=${item.itemId} ${item.direction === 'income' ? '收入' : '支出'}：${item.title} ${formatAmount(item.amount)}/月，进入${formatAccount(item.account)}${item.identityBinding ? `，绑定身份=${item.identityBinding}` : ''}；${item.summary}`
    )
    .join('\n') || '- 无固定收支项目';
  const ledger = projection.recentLedger
    .map(
      (entry) =>
        `- ${entry.title}：${entry.direction === 'income' ? '收入' : entry.direction === 'expense' ? '支出' : '调整'} ${formatAmount(entry.amount)}，${formatAccount(entry.account)}；${entry.summary}`
    )
    .join('\n') || '- 无近期收支记录';
  const reports = projection.latestReports
    .map(
      (report) =>
        `- ${report.monthKey}：收入 ${formatAmount(report.income)}，支出 ${formatAmount(report.expense)}，净额 ${formatAmount(report.net)}；期末现金 ${formatAmount(report.endingCashOnHand)}，期末存款 ${formatAmount(report.endingBankBalance)}；${report.itemSummaries.join('；') || '无明细'}`
    )
    .join('\n') || '- 无月度报告';

  return [
    `当前币种：${projection.currency.name}（${projection.currency.code}）`,
    `随身现金：${formatAmount(projection.cashOnHand)}；银行存款：${formatAmount(projection.bankBalance)}`,
    `月收入：${formatAmount(projection.monthlyIncome)}；月支出：${formatAmount(projection.monthlyExpense)}；月净额：${formatAmount(projection.netMonthly)}`,
    `概况：${projection.summary}`,
    '固定收支：',
    cashflows,
    '近期收支：',
    ledger,
    '月度报告：',
    reports,
    'Rule: upsertCashflows is only for stable recurring monthly income/expense being created, changed, or ended. Salary, rent, asset income and other formal recurring payments normally use account="bank".',
    'Rule: player job or role income must set identityBinding to civilian, gang_member, or police. Rewrite an existing arrangement by reusing its itemId; pause it by upserting the same full item with status="paused"; end it with removeCashflowItemIds.',
    '规则：市民的稳定雇佣工资可建立固定收入；无业、散工、按更和数日短工不建立整月工资，在实际领钱时做一次性结算。社团职级没有统一工资，只有明确稳定的场所月例、掩护职业或资产收益才建立固定收入。',
    'Rule: concrete one-time scene payments normally use cashDelta and account="cash"; bank transfers, cheques and formal account payments use bankDelta and account="bank". Do not invent a transfer between accounts.',
    'Rule: every concrete one-time payment or income must include both the matching financePatch cash/bank delta and one ledgerEntries item. Minimal ledger shape: {"direction":"expense","amount":35,"account":"cash","title":"买烟","summary":"在报摊买了一包烟。"}',
    '规则：金钱写回必须使用本回合真实发生的具体整数金额；不得因为数额罕见而擅自缩小，也不得把金额上限、字段示例或技术限制当作剧情事实。没有实际收支时不要为了“同步”而改写余额。',
    '规则：固定收入/支出写 financePatch.upsertCashflows；灰色收入、礼物、人情可另写 grayLedgerPatch，但灰色账本只记录来源，不直接改变现金或存款；真实到账仍必须写 financePatch。',
    '成长规则：判定、战斗、案件阶段、事项完成与结构化关系里程碑由本地结算经验，不要重复奖励。playerPatch.progression.experienceGain 只用于训练、工作或重要社交等难以结构化的成长建议；普通日常和无进展回合不要写，通常 4-12，重要非结构化成果最多 20。不得直接返回等级、当前经验或自由属性点。'
  ].join('\n');
}

function formatReputationLog(log: PromptContext['reputationProjection']['recentLogs'][number]): string {
  const circle = log.kind === 'circle' && log.circle ? ` circle=${log.circle}` : '';
  const visibilityDelta = log.visibilityDelta === undefined ? '' : ` visibilityDelta=${log.visibilityDelta}`;
  const standingDelta = log.standingDelta === undefined ? '' : ` standingDelta=${log.standingDelta}`;
  const notorietyDelta = log.notorietyDelta === undefined ? '' : ` notorietyDelta=${log.notorietyDelta}`;
  const overallDelta =
    log.overallReputationDelta === undefined ? '' : ` overallReputationDelta=${log.overallReputationDelta}`;
  return `- logId=${log.logId} time=${formatMemoryTime(log.gameTime)} kind=${log.kind}${circle}${visibilityDelta}${standingDelta}${notorietyDelta}${overallDelta} reason=${log.reason} summary=${log.summary}`;
}

function formatReputationProjection(context: PromptContext): string {
  const projection = context.reputationProjection;
  const circles = projection.circles.map(
    ({ circle, label, entry, score, reasons }) =>
      `- circle=${circle} label=${label} visibility=${entry.visibility}/1000 standing=${entry.standing} score=${score} reasons=${reasons.join(',') || 'none'} summary=${entry.summary}`
  );

  return [
    'REPUTATION_CONTEXT_PROJECTION',
    `overall: notoriety=${projection.overall.notoriety}/1000 level=${projection.overall.notorietyLevel} overallReputation=${projection.overall.overallReputation} tone=${projection.overall.tone} summary=${projection.overall.summary}`,
    'selectedCircles:',
    formatList(circles),
    'recentLogs:',
    formatList(projection.recentLogs.map(formatReputationLog)),
    `diagnostics: selectedCircles=${projection.diagnostics.selectedCircles.join(',') || 'none'} omittedCircles=${projection.diagnostics.omittedCircleCount} selectedLogs=${projection.diagnostics.selectedLogIds.join(',') || 'none'} omittedLogs=${projection.diagnostics.omittedLogCount}`,
    'Rule: this is a selected reputation projection, not the full archive. Only write playerPatch.reputation when social evaluation or spread has clearly changed, and include both summary and reason.'
  ].join('\n');
}

function formatInstitutionRelation(relation: PromptContext['institutionProjection']['actorRelations'][number]): string {
  const role = relation.roleTitle ? ` role=${relation.roleTitle}` : '';
  const unit = relation.departmentOrUnit ? ` unit=${relation.departmentOrUnit}` : '';
  const primary = relation.isPrimary ? ' primary=true' : '';
  return `- actorId=${relation.actorId} actor=${relation.actorName} organizationId=${relation.organizationId} organization=${relation.organizationName} relationType=${relation.relationType}${role}${unit}${primary} visibility=${relation.visibility} summary=${relation.summary}`;
}

function formatOrganizationStructureTree(
  nodes: NonNullable<PromptContext['institutionProjection']['organizations'][number]['structureTree']>,
  depth = 0
): string {
  return nodes
    .map((node) => {
      const prefix = depth > 0 ? `${'  '.repeat(depth)}↳ ` : '';
      const person = node.personName ?? (node.actorId ? `actor:${node.actorId}` : '未知');
      const status = node.status ?? '未知';
      const confidence = node.confidence ?? 'unknown';
      const summary = node.summary ? ` 摘要${node.summary}` : '';
      const current = `${prefix}${node.label}(${node.role}) 人员${person} 状态${status} 可信${confidence}${summary}`;
      const children = node.children?.length ? `\n${formatOrganizationStructureTree(node.children, depth + 1)}` : '';
      return `${current}${children}`;
    })
    .join('\n');
}

function formatTriadOrganizationProfile(
  organization: PromptContext['institutionProjection']['organizations'][number]
): string {
  const profile = organization.triadProfile;
  const state = organization.triadState;
  if (!profile || !state) return '';
  const areas = profile.activityAreas.map((area) => {
    const runtime = state.activityAreas.find((item) => item.placeId === area.placeId);
    return `${area.placeId}:${area.label} activity=${area.activitySummary} status=${runtime?.statusSummary ?? '未确认'} pressure=${runtime?.pressureSummary ?? area.localPressureSummary} confidence=${runtime?.confidence ?? 'unknown'}`;
  });
  return [
    `\n  triadProfile.organizationStyle=${profile.organizationStyle}`,
    `\n  triadProfile.decisionCulture=${profile.decisionCulture}`,
    `\n  triadProfile.leadershipSelection=${profile.leadershipSelection}`,
    `\n  triadProfile.operatingLines=${profile.operatingLines.join('；') || 'none'}`,
    `\n  triadProfile.customaryRules=${profile.customaryRules.join('；') || 'none'}`,
    `\n  triadProfile.internalFaultLines=${profile.internalFaultLines.join('；') || 'none'}`,
    `\n  triadState.leadership=phase:${state.leadership.phase} summary:${state.leadership.visibleSummary} next:${state.leadership.nextMilestone ?? 'none'} leader:${state.leadership.currentLeaderActorId ?? 'unknown'} candidates:${state.leadership.knownCandidateActorIds.join(',') || 'none'} confidence:${state.leadership.confidence}`,
    `\n  triadState.activityAreas=${areas.join(' | ')}`
  ].join('');
}

function formatInstitutionProjection(context: PromptContext): string {
  const projection = context.institutionProjection;
  const organizations = projection.organizations.map(
    (organization) => {
      const structureTree = organization.structureTree?.length
        ? `\n  structureTree=\n${formatOrganizationStructureTree(organization.structureTree)
            .split('\n')
            .map((line) => `    ${line}`)
            .join('\n')}`
        : '\n  structureTree=none';
      const triadProfile = formatTriadOrganizationProfile(organization);
      return `- organizationId=${organization.organizationId} name=${organization.name} aliases=${organization.aliases.join(',') || 'none'} type=${organization.type} importance=${organization.importance} reasons=${organization.reasons.join(',') || 'none'}\n  summary=${organization.summary}\n  publicKnowledge=${organization.publicKnowledge}\n  currentState=${organization.currentState}\n  stanceTowardPlayer=${organization.stanceTowardPlayer}\n  pressureSummary=${organization.pressureSummary}${structureTree}${triadProfile}\n  relatedActors=${organization.relatedActorIds.join(',') || 'none'} relatedPlaces=${organization.relatedPlaceIds.join(',') || 'none'} relatedCases=${organization.relatedCaseIds.join(',') || 'none'}`;
    }
  );

  return [
    'INSTITUTION_CONTEXT_PROJECTION',
    'organizations:',
    formatList(organizations),
    'actorOrganizationRelations:',
    formatList(projection.actorRelations.map(formatInstitutionRelation)),
    `diagnostics: source=${projection.diagnostics.sourceOrganizationCount} projected=${projection.diagnostics.projectedOrganizationCount} projectedIds=${projection.diagnostics.projectedOrganizationIds.join(',') || 'none'} omittedHidden=${projection.diagnostics.omittedHiddenCount} omittedIrrelevant=${projection.diagnostics.omittedIrrelevantCount} missingRefs=${projection.diagnostics.missingOrganizationRefs.join(',') || 'none'}`,
    'Rule: this is a selected projection of known social institutions, not a complete government directory or organization-management system.',
    'Rule: changes to stable institutions must be written through organizationPatches.',
    'ORGANIZATION_IDENTITY_LOCK: if an existing institution, employer, player-owned enterprise, or one of its aliases is being updated, reuse the supplied organizationId exactly. A renamed description or an added phrase such as family/group/company does not create a new institution.',
    'Rule: society hierarchy updates must use organizationPatches[].structureTree. 未知职位或未知人员写“未知”，不要用一段普通说明文字替代结构树。',
    'Rule: triadProfile is immutable worldpack context. Visible changes to an existing society leadership phase or registered activity-area status use organizationPatches[].triadState; use only supplied actorId/placeId values and never invent territory or expose hidden facts.',
    'Rule: actor-to-institution roles must be written through actorPatches[].organizationRelations. Do not use prose as state.',
    'Rule: visibility=hidden relations must not be exposed in normal narration or ordinary prompt context.',
    'Rule: do not automatically convict, prosecute, adjudicate, discipline, or close matters through institutional authority unless a structured delayed event or explicit writeback says so.'
  ].join('\n');
}

function formatLivelihoodProjection(context: PromptContext): string {
  const projection = context.livelihoodProjection;
  if (!projection.available) return '';
  const profile = projection.roleProfile;
  const workSchedule = projection.workSchedule;
  const organization = projection.primaryOrganization;
  const track = projection.primaryOrganizationTrack;
  const relations = projection.workRelations.map(
    (relation) =>
      `- actorId=${relation.actorId} name=${relation.name} identity=${relation.publicIdentity} relation=${relation.relationType ?? 'unspecified'} role=${relation.roleTitle ?? 'unspecified'} unit=${relation.departmentOrUnit ?? 'unspecified'} summary=${relation.summary}`
  );
  const matters = projection.activeMatters.map(
    (matter) =>
      `- id=${matter.id} title=${matter.title} status=${matter.status} pressure=${matter.pressureLevel ?? 0} source=${matter.source} summary=${matter.summary} hook=${matter.currentHook ?? 'none'} actors=${matter.relatedActorIds.join(',') || 'none'} organizations=${matter.relatedOrganizationIds.join(',') || 'none'}`
  );
  const outcomes = projection.recentOutcomes.map(
    (outcome) =>
      `- outcomeId=${outcome.outcomeId} title=${outcome.title} summary=${outcome.summary} consequence=${outcome.consequence ?? 'none'}`
  );
  const employerTemplateCandidates = profile
    ? formatEverydayEmployerTemplateCandidates({
        year: context.currentTime.year,
        sectorIds: profile.sectorIds,
        roleTags: profile.roleTags
      })
    : 'none';
  return [
    'LIVELIHOOD_CONTEXT_PROJECTION',
    `summary: ${projection.livelihoodSummary}`,
    `profile: occupation=${profile?.publicOccupation ?? 'unknown'} employmentStatus=${profile?.employmentStatusId ?? 'unknown'} workplace=${projection.workplaceName ?? profile?.workplacePlaceId ?? 'none'} employer=${organization ? `${organization.organizationId}:${organization.name}` : 'none'} unit=${profile?.workUnitSummary ?? 'none'} position=${profile?.positionSummary ?? 'none'}`,
    `workSchedule: status=${workSchedule.status} label=${workSchedule.label} pattern=${workSchedule.scheduleLabel} window=${workSchedule.scheduleWindow}`,
    `currentWork: ${workSchedule.currentWorkSummary}`,
    `nextWork: ${workSchedule.nextWorkSummary}`,
    `weeklyPattern: ${workSchedule.weeklyPatternSummary}`,
    `roleBoundary: duty=${profile?.dutySummary ?? 'none'} decisionScope=${profile?.decisionScopeSummary ?? 'none'} access=${profile?.accessSummary ?? 'none'}`,
    `organizationDirection: objective=${track?.objective ?? 'none'} action=${track?.currentAction ?? 'none'} status=${track?.currentStatus ?? organization?.currentState ?? 'none'}`,
    'workRelations:',
    formatList(relations),
    'activeLivelihoodMatters:',
    formatList(matters),
    'recentLivelihoodOutcomes:',
    formatList(outcomes),
    'everydayEmployerTemplateCandidates:',
    employerTemplateCandidates,
    `opportunities: ${projection.opportunitySummaries.join('；') || 'none'}`,
    `obstacles: ${projection.obstacleSummaries.join('；') || 'none'}`,
    'Rule: this projection describes the civilian player role using existing Actor, Organization, CurrentMatter and organization evolution facts. It is not a second career truth source.',
    'Rule: everydayEmployerTemplateCandidates are candidate vocabulary selected only from structured sectorIds/roleTags. They may help portray a small employer, work relationship or pressure, but never prove that an employer, event or pressure already exists.',
    'Rule: organization direction is background context, not an automatic player assignment. Create matterKind="livelihood" only when a real actor, notice, workplace event or explicit work arrangement has brought the matter to the player.',
    ...workSchedule.promptRules.map((rule) => `Rule: ${rule}`),
    'Rule: when the public identity remains civilian but employment, occupation, employer, workplace, unit, duties or work contacts actually change, write civilianRoleProfilePatch rather than identityContextPatch.'
  ].join('\n');
}

function formatCityPowerProjection(context: PromptContext): string {
  const projection = context.cityPowerProjection;
  const organizations = projection.organizations.map(
    (organization) =>
      `- organizationId=${organization.organizationId} displayName=${organization.displayName} organizationType=${organization.organizationType} visibility=${organization.visibility} score=${organization.score} reasons=${organization.reasons.join(',') || 'none'} confidence=${organization.sourceConfidence}\n  publicKnowledge=${organization.publicKnowledge}\n  profile=${organization.promptSafeProfile}\n  sectorTags=${organization.sectorTags.join(',') || 'none'}`
  );
  const figures = projection.figures.map((figure) => {
    const aliases = figure.recognitionAliases.join('/') || 'none';
    const affiliationRefs = figure.affiliationOrganizationIds.join(',') || 'none';
    const relatedRefs = figure.relatedOrganizationIds.join(',') || 'none';
    const accessRoutes = figure.accessRoutes.join(' / ') || 'none';
    const hooks = figure.promptSafeHooks.join(' / ') || 'none';
    return [
      `- canonicalSeedId=${figure.canonicalSeedId} runtimeActorId=${figure.runtimeActorId} displayName=${figure.displayName} englishName=${figure.englishName ?? 'none'} category=${figure.category} visibility=${figure.visibility} contactPolicy=${figure.contactPolicy} score=${figure.score} reasons=${figure.reasons.join(',') || 'none'} confidence=${figure.sourceConfidence} copyRisk=${figure.copyRisk}`,
      `  publicRole=${figure.publicRole}`,
      `  profile=${figure.promptSafeProfile}`,
      `  identityHook=${figure.identityHook || 'none'}`,
      `  aliases=${aliases}`,
      `  organizationRefs=affiliation:${affiliationRefs}; related:${relatedRefs}`,
      `  accessRoutes=${accessRoutes}`,
      `  hooks=${hooks}`
    ].join('\n');
  });
  const rules = [
    ...projection.rules,
    '规则：不要把传闻提升为确定事实；社团与灰色网络信息必须区分公开传闻、警队情报、江湖听闻和已确认事实。'
  ];

  return [
    'CITY_POWER_CONTEXT_PROJECTION',
    `diagnostics: selectedOrganizations=${projection.diagnostics.selectedOrganizationIds.join(',') || 'none'} selectedFigures=${projection.diagnostics.selectedFigureIds.join(',') || 'none'} textChars=${projection.diagnostics.selectedTextChars} estimatedTokenBudget=${projection.diagnostics.estimatedTokenBudget} omittedOrganizations=${projection.diagnostics.omittedOrganizationCount} omittedFigures=${projection.diagnostics.omittedFigureCount} omittedHidden=${projection.diagnostics.omittedHiddenCount}`,
    `diagnosticsRefs: totalOrganizations=${projection.diagnostics.totalOrganizations} eligibleOrganizations=${projection.diagnostics.eligibleOrganizations} totalFigures=${projection.diagnostics.totalFigures} eligibleFigures=${projection.diagnostics.eligibleFigures} missingOrganizationRefs=${projection.diagnostics.missingOrganizationRefs.join(',') || 'none'}`,
    'rules:',
    formatList(rules.map((rule) => `- ${rule}`)),
    'organizations:',
    formatList(organizations),
    'figures:',
    formatList(figures)
  ].join('\n');
}

function formatCitySituationTrackProjection(context: PromptContext): string {
  const projection = context.citySituationTrackProjection;
  const tracks = projection.tracks.map((track) =>
    [
      `- trackId=${track.trackId} type=${track.trackType} status=${track.status} visibility=${track.visibility} pressure=${track.pressureLevel} score=${track.score} reasons=${track.reasons.join(',') || 'none'}`,
      `  title=${track.title}`,
      `  summary=${track.summary}`,
      `  currentBeat=${track.currentBeat}`,
      `  possibleDevelopments=${track.possibleDevelopments.join(' / ') || 'none'}`,
      `  relatedPlaces=${track.relatedPlaceIds.join(',') || 'none'} relatedOrganizations=${track.relatedOrganizationIds.join(',') || 'none'} relatedActors=${track.relatedActorIds.join(',') || 'none'}`
    ].join('\n')
  );

  return [
    'CITY_SITUATION_TRACK_CONTEXT',
    `diagnostics: selected=${projection.diagnostics.selectedTrackIds.join(',') || 'none'} omitted=${projection.diagnostics.omittedTrackCount} omittedHidden=${projection.diagnostics.omittedHiddenCount}`,
    'Rule: these are low-frequency background developments, not fixed quests.',
    'Rule: use them as optional city texture, news pressure, NPC context, or environmental consequence when naturally relevant.',
    'Rule: do not force a crisis into every turn.',
    'Rule: durable continuation must use writeback.citySituationTrackPatches.',
    'tracks:',
    formatList(tracks)
  ].join('\n');
}

function formatRelationshipMilestone(
  milestone: PromptContext['relationshipProjection']['threads'][number]['milestones'][number]
): string {
  return `  - [${formatGameTime(milestone.gameTime)}] ${milestone.summary}`;
}

function formatRelationshipProjection(context: PromptContext): string {
  const projection = context.relationshipProjection;
  const threads = projection.threads.map((thread) => {
    const notes = [
      thread.trustSummary ? `  trust=${thread.trustSummary}` : '',
      thread.conflictSummary ? `  conflict=${thread.conflictSummary}` : '',
      thread.promiseSummary ? `  promise=${thread.promiseSummary}` : '',
      thread.riskSummary ? `  risk=${thread.riskSummary}` : '',
      thread.currentPull ? `  currentPull=${thread.currentPull}` : '',
      thread.nextNaturalBeatHint ? `  nextNaturalBeatHint=${thread.nextNaturalBeatHint}` : '',
      thread.intimacySummary ? `  intimacy=${thread.intimacySummary}` : ''
    ].filter(Boolean);

    return [
      `- threadId=${thread.threadId} kind=${thread.kind} status=${thread.status} role=${thread.relationshipRole} reasons=${thread.reasons.join(',') || 'none'}`,
      `  title=${thread.title}`,
      `  summary=${thread.summary}`,
      `  relatedActors=${thread.relatedActorIds.join(',') || 'none'}`,
      ...notes,
      '  milestones:',
      formatList(thread.milestones.slice(0, 3).map(formatRelationshipMilestone), '  - none')
    ].join('\n');
  });
  const heartbeats = projection.heartbeatCandidates.map((candidate) =>
    [
      `- threadId=${candidate.threadId} kind=${candidate.kind} beatType=${candidate.beatType}`,
      `  title=${candidate.title}`,
      `  reason=${candidate.reason}`,
      `  summary=${candidate.summary}`,
      `  relatedActors=${candidate.relatedActorIds.join(',') || 'none'}`
    ].join('\n')
  );
  const identityRegistry = projection.identityRegistry.map(
    (thread) =>
      `- threadId=${thread.threadId} kind=${thread.kind} primaryActorId=${thread.primaryActorId ?? 'none'} relatedActors=${thread.relatedActorIds.join(',') || 'none'} status=${thread.status}`
  );

  return [
    'RELATIONSHIP_CONTEXT_PROJECTION',
    'stableIdentityRegistry:',
    formatList(identityRegistry),
    'threads:',
    formatList(threads),
    'heartbeatCandidates:',
    formatList(heartbeats),
    `diagnostics: source=${projection.diagnostics.sourceThreadCount} projected=${projection.diagnostics.projectedThreadCount} heartbeat=${projection.diagnostics.heartbeatCandidateCount} identityRegistry=${projection.diagnostics.identityRegistryCount} identityRegistryTruncated=${projection.diagnostics.identityRegistryTruncatedCount} projectedIds=${projection.diagnostics.projectedThreadIds.join(',') || 'none'} omittedHidden=${projection.diagnostics.omittedHiddenCount} omittedIrrelevant=${projection.diagnostics.omittedIrrelevantCount} missingActorRefs=${projection.diagnostics.missingActorRefs.join(',') || 'none'}`,
    'Rule: relationshipThreadPatches records durable 人脉/缘份 thread changes; do not store these changes only in prose.',
    'Rule: stableIdentityRegistry 是本轮最相关的玩家可见关系身份索引；本地还会保护未投喂条目。更新必须逐字复用既有 threadId；不得用相同 threadId 指向另一名人物，也不得用新 threadId 重建同一人物关系线。network 与 fate 是同一关系线的层级：已有 network 在正文形成明确、持续的亲密或伴侣事实后可复用原 threadId 升级为 fate；已有 fate 不得降回 network；不得让同一人物同时保留一条人脉和一条缘份。primaryActorId 和既有人物锚点不可在普通更新中替换。',
    'Rule: 新建关系线必须有家庭、正式伴侣、正式线人、债务/承诺、保护、长期共同事务、反复接触或持续冲突之一，并填写 creationBasis 与 evidenceRefs。一次见面、单次盘问、普通同事、同地点出现、单条记忆或高 importance 都不足以创建。',
    'Rule: Heartbeat candidates are undecided suggestions, not happened facts. Only use them if the current scene naturally adopts them, then write actual consequences through structured writeback.',
    'Rule: 人脉 is ordinary long-term social relations; 缘份 is long-term emotional/romantic relationship threads, not an adult content entry.',
    'Rule: do not create affection scores, progress bars, rewards, quest completion, or automatic background relationship progression.',
    'Rule: hidden relationship threads must not be exposed in ordinary narration, prompt context, or UI.'
  ].join('\n');
}

function formatPresentActorReactionProjection(context: PromptContext): string {
  const projection = context.presentActorReactionProjection;
  const candidates = projection.candidates.map((candidate) =>
    [
      `- actorId=${candidate.actorId} actor=${candidate.actorName} score=${candidate.score} reasons=${candidate.triggerReasons.join(',') || 'none'}`,
      `  reactionHint=${candidate.reactionHint}`,
      '  basis:',
      formatList(candidate.basis.map((basis) => `  - ${basis}`), '  - none')
    ].join('\n')
  );

  return [
    'PRESENT_ACTOR_REACTION_PROJECTION',
    formatList(candidates),
    `diagnostics: selected=${projection.diagnostics.selectedActorIds.join(',') || 'none'} omitted=${projection.diagnostics.omittedActorCount}`,
    'Rule: these are undecided NPC reaction suggestions, not happened facts. The narrator may adopt, adapt, or ignore them.',
    'Rule: use them through scene action, body language, dialogue, interruption, silence, pressure, or hesitation. Durable changes still require structured writeback.'
  ].join('\n');
}

function formatRemoteNpcPresenceProjection(context: PromptContext): string {
  const projection = context.remoteNpcPresenceProjection;
  const candidates = projection.candidates.map((candidate) =>
    [
      `- actorId=${candidate.actorId} actor=${candidate.actorName} source=${candidate.source} sourceId=${candidate.sourceId} score=${candidate.score} reasons=${candidate.triggerReasons.join(',') || 'none'}`,
      `  title=${candidate.title}`,
      `  presenceHint=${candidate.presenceHint}`,
      '  basis:',
      formatList(candidate.basis.map((basis) => `  - ${basis}`), '  - none')
    ].join('\n')
  );

  return [
    'REMOTE_NPC_PRESENCE_PROJECTION',
    formatList(candidates),
    `diagnostics: selected=${projection.diagnostics.selectedCandidateIds.join(',') || 'none'} omitted=${projection.diagnostics.omittedCandidateCount} missingActorRefs=${projection.diagnostics.missingActorRefs.join(',') || 'none'}`,
    'Rule: these are undecided remote-presence suggestions, not happened facts. They may surface as phone calls, pagers, street talk, news, a colleague mention, family pressure, or delayed consequences.',
    'Rule: only after the narrative naturally adopts a candidate may durable changes be written through relationshipThreadPatches, currentMatterPatches, signalPatches, newsIssuePatches, deferredEventPatches, memories, or actorMemories.'
  ].join('\n');
}

function formatBackgroundEvolutionProjection(context: PromptContext): string {
  const projection = context.backgroundEvolutionProjection;
  const actions = projection.activeNpcActions.map((track) => {
    const startedAt = track.startedAt ? formatGameTime(track.startedAt) : 'unknown';
    const expectedEndAt = track.expectedEndAt ? formatGameTime(track.expectedEndAt) : 'unknown';
    return [
      `- trackId=${track.trackId} actorId=${track.actorId} actor=${track.actorName} status=${track.status} actionKind=${track.actionKind}`,
      `  objective=${track.objective}`,
      `  currentAction=${track.currentAction}`,
      `  currentStatus=${track.currentStatus}`,
      `  place=${track.currentPlaceName ?? track.currentPlaceId ?? 'unknown'} startedAt=${startedAt} expectedEndAt=${expectedEndAt}`,
      `  relatedCases=${track.relatedCaseIds.join(',') || 'none'} relatedRelationships=${track.relatedRelationshipThreadIds.join(',') || 'none'}`
    ].join('\n');
  });
  const organizationActions = projection.activeOrganizationActions.map((track) => {
    const startedAt = track.startedAt ? formatGameTime(track.startedAt) : 'unknown';
    const expectedEndAt = track.expectedEndAt ? formatGameTime(track.expectedEndAt) : 'unknown';
    return [
      `- trackId=${track.trackId} organizationId=${track.organizationId} organization=${track.organizationName} status=${track.status}`,
      `  objective=${track.objective}`,
      `  currentAction=${track.currentAction}`,
      `  currentStatus=${track.currentStatus}`,
      `  startedAt=${startedAt} expectedEndAt=${expectedEndAt}`,
      `  relatedActors=${track.relatedActorIds.join(',') || 'none'} relatedPlaces=${track.relatedPlaceIds.join(',') || 'none'} relatedCases=${track.relatedCaseIds.join(',') || 'none'} relatedCityTracks=${track.relatedCityTrackIds.join(',') || 'none'}`
    ].join('\n');
  });
  const outcomes = projection.recentOutcomes.map((outcome) =>
    [
      `- outcomeId=${outcome.outcomeId} occurredAt=${formatGameTime(outcome.occurredAt)} source=${outcome.sourceKind}:${outcome.sourceId} significance=${outcome.significance}`,
      `  title=${outcome.title}`,
      `  summary=${outcome.summary}`,
      outcome.consequence ? `  consequence=${outcome.consequence}` : '',
      `  relatedActors=${outcome.relatedActorIds.join(',') || 'none'} relatedOrganizations=${outcome.relatedOrganizationIds.join(',') || 'none'} relatedCases=${outcome.relatedCaseIds.join(',') || 'none'} relatedRelationships=${outcome.relatedRelationshipThreadIds.join(',') || 'none'}`
    ]
      .filter(Boolean)
      .join('\n')
  );
  const chronicle = projection.chronicle.map((entry) =>
    [
      `- entryId=${entry.entryId} occurredAt=${formatGameTime(entry.occurredAt)} title=${entry.title}`,
      `  summary=${entry.summary}`,
      `  longTermImpact=${entry.longTermImpact}`,
      `  relatedActors=${entry.relatedActorIds.join(',') || 'none'} relatedOrganizations=${entry.relatedOrganizationIds.join(',') || 'none'} relatedCases=${entry.relatedCaseIds.join(',') || 'none'}`
    ].join('\n')
  );

  return [
    'BACKGROUND_EVOLUTION_FACTS',
    'activeNpcActions:',
    formatList(actions),
    'activeOrganizationActions:',
    formatList(organizationActions),
    'recentOutcomes:',
    formatList(outcomes),
    'chronicle:',
    formatList(chronicle),
    `diagnostics: activeNpc=${projection.diagnostics.sourceActiveActionCount} activeOrganizations=${projection.diagnostics.sourceActiveOrganizationActionCount} outcomes=${projection.diagnostics.sourceOutcomeCount} chronicle=${projection.diagnostics.sourceChronicleCount} omittedNpcActions=${projection.diagnostics.omittedActionCount} omittedOrganizationActions=${projection.diagnostics.omittedOrganizationActionCount} omittedOutcomes=${projection.diagnostics.omittedOutcomeCount} omittedChronicle=${projection.diagnostics.omittedChronicleCount} omittedHidden=${projection.diagnostics.omittedHiddenCount}`,
    'Rule: activeNpcActions 是正在发生的既有事实，不是待选建议；在结果出现前不要把行动写成已经完成。expectedEndAt 只是预计时间，不保证成功。',
    'Rule: activeOrganizationActions 是已激活组织的低频后台行动事实；不要把组织写成静止，也不要据此扩写资金、地盘、全体成员日程或逐日经营。',
    'Rule: recentOutcomes 与 chronicle 是已经发生的事实；不得让人物忘记、重复计划或否认这些结果。',
    'Rule: activeNpcActions、activeOrganizationActions、recentOutcomes 与 chronicle 中出现的 actorId 都是既有人物的稳定 ID。正文若继续承接这些人物，actorPatches、actorMemories、事项、案件和关系写回必须逐字复用该 actorId；不得因为玩家本轮没有点名就另造新 actorId。',
    'Rule: 仅在玩家行动、当前地点、案件或关系自然相交时把远场事实带进正文，不要每回合强行播报。',
    'Rule: 不要在主叙事写回中伪造或直接改写后台轨道；主回合只对玩家当场造成的普通人物、案件、关系、事项与记忆变化负责。'
  ].join('\n');
}

function formatDynamicProjection(context: PromptContext): string {
  const projection = context.dynamicProjection;
  const matters = projection.currentMatters.map((matter) => {
    const dueAt = matter.dueAt ? formatGameTime(matter.dueAt) : 'none';
    const hook = matter.currentHook ? `\n  currentHook=${matter.currentHook}` : '';
    const consequence = matter.consequenceHint ? `\n  consequenceHint=${matter.consequenceHint}` : '';
    return `- matterId=${matter.id} status=${matter.status} priority=${matter.priority} source=${matter.source} matterKind=${matter.matterKind ?? 'world'} pressureLevel=${matter.pressureLevel ?? 0} responseWindow=${matter.responseWindow ?? 'open'} dueAt=${dueAt} unread=${matter.unread ? 'true' : 'false'}\n  title=${matter.title}\n  summary=${matter.summary}${hook}${consequence}\n  relatedActors=${matter.relatedActorIds.join(',') || 'none'} relatedPlaces=${matter.relatedPlaceIds.join(',') || 'none'} relatedCases=${matter.relatedCaseIds.join(',') || 'none'} relatedOrganizations=${matter.relatedOrganizationIds.join(',') || 'none'}`;
  });
  const signals = projection.signals.map(
    (signal) =>
      `- signalId=${signal.id} type=${signal.signalType} reliability=${signal.reliability} status=${signal.status}\n  title=${signal.title}\n  summary=${signal.summary}\n  relatedActors=${signal.relatedActorIds.join(',') || 'none'} relatedPlaces=${signal.relatedPlaceIds.join(',') || 'none'} relatedCases=${signal.relatedCaseIds.join(',') || 'none'} relatedOrganizations=${signal.relatedOrganizationIds.join(',') || 'none'}`
  );
  const newsIssues = projection.newsIssues.map((issue) => {
    const articles = issue.articles.map(
      (article) =>
        `  - articleId=${article.id} section=${article.section} playerRelated=${article.playerRelated} headline=${article.headline}\n    body=${article.body}`
    );
    return [
      `- newsIssueId=${issue.id} outlet=${issue.outletName} date=${formatGameTime(issue.date)} read=${issue.read}`,
      `  headline=${issue.headline}`,
      `  summary=${issue.summary}`,
      '  articles:',
      formatList(articles, '  - none')
    ].join('\n');
  });
  const dueEvents = projection.dueDeferredEvents.map(
    (event) =>
      `- eventId=${event.eventId} source=${event.sourceModule} triggerAt=${formatGameTime(event.triggerAt)} title=${event.title}\n  instruction=${event.promptInstruction}`
  );

  return [
    'DYNAMIC_CONTEXT_PROJECTION',
    'currentMatters:',
    formatList(matters),
    'signals:',
    formatList(signals),
    'newspaperIssues:',
    formatList(newsIssues),
    'dueDynamicDeferredEvents:',
    formatList(dueEvents),
    `diagnostics: matters=${projection.diagnostics.currentMatterIds.join(',') || 'none'} dueMatters=${projection.diagnostics.dueCurrentMatterIds.join(',') || 'none'} signals=${projection.diagnostics.signalIds.join(',') || 'none'} news=${projection.diagnostics.newsIssueIds.join(',') || 'none'} omittedHidden=${projection.diagnostics.omittedHiddenCount} dueDeferred=${projection.diagnostics.dueDeferredEventIds.join(',') || 'none'}`,
    'Rule: current matters are living context, not a task list. Do not create completion buttons, rewards, or checklist behavior.',
    'Rule: Current matters are not quests, task lists, rewards, steps, progress bars, or local success/failure checks.',
    'Rule: Do not write rewards, completion steps, or local success/failure states for current matters.',
    'Rule: signals and rumors are not confirmed facts unless later confirmed by structured state or direct scene evidence.',
    'Rule: when the current scene directly confirms, disproves, clarifies, or supersedes a projected signal, update that same stable signalId through signalPatches with status=resolved or stale. Do not leave the old rumor active and do not create a near-duplicate replacement.',
    'Rule: newspaper issues should read like period media material, not an engineering event list.',
    'Rule: dynamic events cannot replace finance monthly settlement. Money changes still use financePatch or the local monthly finance system.',
    'Rule: do not automatically convict, prosecute, adjudicate, discipline, close a case, or resolve a case only because a signal or newspaper article exists.',
    'Rule: changes to ongoing dynamic matters must be written through currentMatterPatches; rumors through signalPatches; newspaper issues through newsIssuePatches.',
    'Rule: currentMatter status=dormant means unresolved but temporarily quiet, waiting, transferred, or lacking a present next step; it must remain available for later development. Only write status=resolved when the matter has actually ended and no substantive continuation remains. Use archived only for a deliberately retained historical record. Do not rely on phrases such as 初步闭环、暂时解除、告一段落 or 暂无后续 to imply closure; the structured status is authoritative.'
    ].join('\n');
}

function formatRecentCompletedFactProjection(context: PromptContext): string {
  const completedFacts = context.dynamicProjection.recentResolvedMatters.map((matter) =>
    [
      `- matterId=${matter.id} status=resolved resolvedUpdatedAt=${formatGameTime(matter.updatedAt)}`,
      `  title=${matter.title}`,
      `  outcome=${matter.summary}`
    ].join('\n')
  );

  return [
    'RECENT_COMPLETED_FACTS',
    formatList(completedFacts),
    'Priority: this structured terminal-state section overrides playerInput wording, recent_raw_story, relationship currentPull/nextNaturalBeatHint, summaries, recalled prose and older memories when they conflict about whether the same action is complete.',
    'Rule: never narrate a listed resolved matter as pending, scheduled, unsigned, unfinished or still waiting to happen; continue only with its consequences, fulfillment, celebration, aftermath or a genuinely new development.',
    'Rule: if playerInput accidentally describes a listed resolved matter as a future or pending action, preserve the completed outcome and interpret the intended action around what remains. Only treat it as a new matter when the player explicitly asks to reopen, renegotiate, renew, replace, undo or repeat it, and never erase the original completion.',
    'Rule: suggestedActions must not schedule or invite the same completion again.'
  ].join('\n');
}

function formatStorypackProjection(context: PromptContext): string {
  const projection = context.storypackProjection;
  const cards = projection.cards.map((card) => {
    const sectors = card.relatedSectors.join(',') || 'none';
    const places = card.relatedPlaces.join(',') || 'none';
    const inspiration = card.structuralInspiration ? `\n  structuralInspiration=${card.structuralInspiration}` : '';
    const identityHook = card.identityHook ? `\n  identityHook=${card.identityHook}` : '';
    return [
      `- cardId=${card.id} type=${card.type} title=${card.title} score=${card.score} reasons=${card.reasons.join(',') || 'none'} copyRisk=${card.copyRisk ?? 'unknown'} confidence=${card.sourceConfidence ?? 'unknown'}`,
      `  categoryOrSector=${card.categoryOrSector ?? 'unknown'} relatedSectors=${sectors} relatedPlaces=${places}`,
      `  promptSafeVersion=${card.promptSafeVersion}${identityHook}${inspiration}`
    ].join('\n');
  });

  return [
    'STORYPACK_CONTEXT_PROJECTION',
    `influence=${projection.influence}`,
    `diagnostics: selected=${projection.diagnostics.selectedCardIds.join(',') || 'none'} eligible=${projection.diagnostics.eligibleCards} total=${projection.diagnostics.totalCards} textChars=${projection.diagnostics.selectedTextChars} estimatedTokenBudget=${projection.diagnostics.estimatedTokenBudget} omitted=${projection.diagnostics.omittedCardCount}`,
    'rules:',
    formatList(projection.rules.map((rule) => `- ${rule}`)),
    'cards:',
    formatList(cards)
  ].join('\n');
}

function formatEraSeedFigureProjection(context: PromptContext): string {
  const projection = context.eraSeedFigureProjection;
  const figures = projection.figures.map((figure) => {
    const aliases = figure.recognitionAliases.join('/') || 'none';
    const sectors = figure.sectors.join(',') || 'none';
    const accessRoutes = figure.accessRoutes.join(' / ') || 'none';
    const hooks = figure.promptSafeHooks.join(' / ') || 'none';
    const identityHook = figure.identityHook ? `\n  identityHook=${figure.identityHook}` : '';
    return [
      `- seedId=${figure.id} canonicalSeedId=${figure.canonicalSeedId} runtimeActorId=${figure.runtimeActorId} displayName=${figure.displayName} englishName=${figure.englishName ?? 'none'} category=${figure.category} role=${figure.publicRole} contactPolicy=${figure.contactPolicy} score=${figure.score} reasons=${figure.reasons.join(',') || 'none'} copyRisk=${figure.copyRisk} confidence=${figure.sourceConfidence}`,
      `  aliases=${aliases} sectors=${sectors}`,
      `  accessRoutes=${accessRoutes}`,
      `  promptSafeProfile=${figure.promptSafeProfile}`,
      `  hooks=${hooks}${identityHook}`
    ].join('\n');
  });

  return [
    'ERA_SEED_FIGURE_PROJECTION',
    `diagnostics: selected=${projection.diagnostics.selectedFigureIds.join(',') || 'none'} eligible=${projection.diagnostics.eligibleFigures} total=${projection.diagnostics.totalFigures} textChars=${projection.diagnostics.selectedTextChars} estimatedTokenBudget=${projection.diagnostics.estimatedTokenBudget} omitted=${projection.diagnostics.omittedFigureCount}`,
    'rules:',
    formatList(projection.rules.map((rule) => `- ${rule}`)),
    'figures:',
    formatList(figures)
  ].join('\n');
}

function formatConflictProjection(context: PromptContext): string {
  const projection = context.conflictProjection;
  const combatEvents = projection.combatEvents.map((event) => {
    const participants = event.participants
      .map((participant) => `${participant.side}:${participant.name}${participant.roleSummary ? `/${participant.roleSummary}` : ''}`)
      .join(', ');
    return [
      `- combatId=${event.combatId} turnId=${event.turnId} type=${event.type} outcome=${event.outcome} intensity=${event.intensity} unread=${event.unread}`,
      `  time=${formatGameTime(event.gameTime)} location=${event.locationSummary}`,
      `  title=${event.title}`,
      `  participants=${participants || 'none'}`,
      `  result=${event.resultSummary}`,
      `  consequence=${event.consequenceSummary}`,
      `  judgementChecks=${event.judgementCheckIds.join(',') || 'none'} relatedActors=${event.relatedActorIds.join(',') || 'none'} relatedPlaces=${event.relatedPlaceIds.join(',') || 'none'} relatedCases=${event.relatedCaseIds.join(',') || 'none'}`
    ].join('\n');
  });
  const judgementChecks = projection.judgementChecks.map((check) => {
    const factors = check.factors
      .map((factor) => {
        const source = factor.sourceType
          ? ` source=${factor.sourceType}${factor.sourceId ? `:${factor.sourceId}` : ''}`
          : '';
        return `${factor.label} ${factor.value >= 0 ? '+' : ''}${factor.value}${source}: ${factor.reason}`;
      })
      .join('；');
    const isLocalD100 = check.rulesetVersion === 'v1.1-local-d100';
    return [
      `- checkId=${check.checkId} title=${check.title} category=${check.category} outcome=${check.outcome}`,
      isLocalD100
        ? `  ruleset=v1.1-local-d100 primary=${check.primaryAttribute}/${check.primaryAttributeValue} secondary=${check.secondaryAttribute ?? 'none'}/${check.secondaryModifier ?? 0} sceneDifficulty=${check.difficultyTier}/${check.difficultyModifier} gameDifficulty=${check.gameDifficulty}/${check.gameDifficultyModifier} context=${check.contextModifierTotal} target=${check.effectiveTarget} roll=${check.presetRoll} margin=${check.margin}`
        : `  legacyDifficulty=${check.difficulty} legacyScore=${check.score} legacyMargin=${check.margin}`,
      `  summary=${check.shortSummary}`,
      check.consequenceSummary ? `  consequence=${check.consequenceSummary}` : '',
      `  factors=${factors || 'none'}`
    ]
      .filter(Boolean)
      .join('\n');
  });

  return [
    'CONFLICT_CONTEXT_PROJECTION',
    'recentCombatEvents:',
    formatList(combatEvents),
    'linkedJudgementChecks:',
    formatList(judgementChecks),
    `diagnostics: projectedCombats=${projection.diagnostics.projectedCombatIds.join(',') || 'none'} projectedChecks=${projection.diagnostics.projectedJudgementCheckIds.join(',') || 'none'} source=${projection.diagnostics.sourceCount} projected=${projection.diagnostics.projectedCount} omitted=${projection.diagnostics.omittedCount} hidden=${projection.diagnostics.hiddenCount}`,
    'Rule: 判定用于结果确有不确定性且失败会形成实际差异的观察、推理、谈判、行动、体力、意志、追捕或对抗；纯例行、无阻力、必然成功的动作不要创建判定。',
    'Rule: 如果本回合发生判定，正文可用【判定】标签自然承接，但持久记录必须写 judgementCheckPatches；不要从正文反向推断本地记录。',
    'Rule: 如果本回合发生重大战斗/追逐，写 combatEventPatches；combatText 必须是过程化精彩描写，目标 180-260 字左右，不是摘要、报告或表格。',
    'Rule: combatText 要写清场地、光线、天气、声音等现场压力，双方站位和动作反应，关键判定如何体现在动作转折中，最后落到伤势、制服、逃脱、消耗或现场后果。',
    'Rule: participants/resultSummary/consequenceSummary 用结构化字段概括；不要用 combatText 重复参与方列表或结果说明。',
    'Rule: 战斗弹窗记录只承载已经发生的重大对抗，不替代案件、伤势、物品、记忆、声誉或动态事件；这些后果仍需写入各自结构化模块。'
  ].join('\n');
}

function formatLocalJudgementContract(
  localJudgement: NonNullable<ComposePromptOptions['localJudgement']>
): string {
  if (localJudgement.preflightReason && !localJudgement.resolution) {
    return [
      'LOCAL_D100_JUDGEMENT_RESOLUTION',
      '判定预检已经完成：本回合不需要核心判定。',
      `预检原因：${localJudgement.preflightReason}`,
      '不得创建 judgementCheckPatches，也不得自行升级成追捕、格斗、持械、枪械、人群冲突、拘捕或逃脱等重大对抗。',
      '正文仍需真实回应玩家行动，但不得自行掷骰、虚构目标值或把无阻力行动写成系统判定。'
    ].join('\n');
  }
  if (localJudgement.resolution) {
    const resolution = localJudgement.resolution;
    const factorLines = resolution.factors.map(
      (factor) =>
        `- ${factor.sourceType ?? 'other'}:${factor.sourceId ?? 'no-id'} ${factor.label} ${factor.value >= 0 ? '+' : ''}${factor.value}：${factor.reason}`
    );
    return [
      'LOCAL_D100_JUDGEMENT_RESOLUTION',
      '判定已经由本地系统在正文生成前完成。以下是本回合唯一、只读的结算结果。',
      `checkId=${resolution.checkId}`,
      `category=${resolution.category}`,
      `primaryAttribute=${resolution.primaryAttribute}`,
      `secondaryAttribute=${resolution.secondaryAttribute ?? 'none'}`,
      `difficultyTier=${resolution.difficultyTier}`,
      `effectiveTarget=${resolution.effectiveTarget}`,
      `presetRoll=${resolution.presetRoll}`,
      `outcome=${resolution.outcome}`,
      `margin=${resolution.margin}`,
      `stakes=${resolution.stakesSummary}`,
      `combatIntent=${resolution.combatIntent}`,
      '本地已采用的结构化因素：',
      ...(factorLines.length > 0 ? factorLines : ['- 无']),
      '你不得重新掷骰、修改目标值、更改 outcome、增加未核验因素或另建第二次判定。',
      '正文第一次生成就必须服从该 outcome，写清该结果对应的行动转折、代价与后果。',
      '最终 JudgementCheck 由本地引擎插入。过渡兼容期允许 judgementCheckPatches 回显同一 checkId 和结果摘要，但任何数字与 outcome 回显都不具权威，且不得返回第二条判定。',
      resolution.combatIntent === 'none'
        ? '预检没有确认重大对抗；不得自行创建 combatEventPatches。'
        : `本回合已确认 ${resolution.combatIntent} 重大对抗；必须创建且只创建相关 combatEventPatches，并让 judgementCheckIds 引用 ${resolution.checkId}。`
    ].join('\n');
  }
  const difficulty = getGameDifficultyProfile(localJudgement.gameDifficulty);
  const attributes = Object.entries(localJudgement.attributes)
    .map(([key, value]) => `${judgementAttributeLabels[key as keyof AttributeBlock]}(${key})=${value}`)
    .join('，');
  const traitSources = localJudgement.sources.traits
    .map(
      (source) =>
        `- sourceType=trait sourceId=${source.sourceId} name=${source.name} status=${source.status} scopes=${source.scopes.join(',') || 'none'} effect=${source.effectSummary}`
    );
  const equipmentSources = localJudgement.sources.equipment
    .map(
      (source) =>
        `- sourceType=equipment sourceId=${source.sourceId} name=${source.name} summary=${source.summary}`
    );

  return [
    'LOCAL_D100_JUDGEMENT_CONTRACT',
    `本回合唯一预置骰：d100=${localJudgement.presetRoll}。所有正文篇幅重生成、JSON 修复和完整合同重试都必须复用此点数，不得重新掷骰。`,
    `当前六维：${attributes}。`,
    `当前本局难度：${difficulty.label}（目标值修正 ${difficulty.modifier >= 0 ? '+' : ''}${difficulty.modifier}）。`,
    '职责边界：你只决定本回合是否需要判定，以及判定的主属性、副属性、场景难度、逐项情境修正和叙事后果；本地引擎独占目标值、骰点与结果真值。',
    '触发边界：当观察、思考、交涉、行动、体魄、意志或对抗的结果存在真实不确定性，且成功/失败会让局面不同，创建一次判定。例行操作、无阻力行动、已被事实保证的结果不得判定。每回合最多一次判定。',
    '主属性取完整数值。副属性可省略；有副属性时修正为 round((副属性-50)/5)，并限制在 -10..+10，且不能与主属性相同。',
    `场景难度只用 ${Object.entries(judgementDifficultyLabels)
      .map(([id, label]) => {
        const modifier = judgementDifficultyModifiers[id as keyof typeof judgementDifficultyModifiers];
        return `${label}(${id})=${modifier >= 0 ? '+' : ''}${modifier}`;
      })
      .join(' / ')}。场景难度衡量行动本身的成功概率，不是后果有多严重；高后果不会自动升为危险或极端。`,
    '情境因素 factors 最多五项，每项必须写 sourceType、label、value、reason；sourceType 只可为 trait（特质）、equipment（装备）、status（状态/伤势）、environment（环境）、preparation（准备）或 other（其他）。每项必须说明直接相关的具体事实，使用 -10..+10 的整数；本地合计限制在 -20..+20。不得把六维、场景难度或本局难度重复写进 factors。',
    '特质与装备不是自动加分：必须逐项检查下方当前来源，只有对本次行动有直接作用时才可纳入。trait/equipment 因素必须同时写出下方对应的稳定 sourceId；不得虚构、引用未列出的来源或把同一稳定来源重复计算。status/environment/preparation/other 通常省略 sourceId，但仍必须有当前正文或状态事实支撑。无相关来源时 factors 可以为空，不得为了填满项目强行加成。',
    '当前可核对的玩家特质：',
    ...formatList(traitSources, '- 无可用特质').split('\n'),
    '当前已装备且可核对的装备：',
    ...formatList(equipmentSources, '- 无已装备物品').split('\n'),
    '有效目标值 = 主属性 + 副属性修正 + 场景难度修正 + 本局难度修正 + 情境合计，最终限制在 5..95。',
    '结果：1..5 大成功；6..目标值 成功；目标值+1..目标值+10 部分成功；其余失败；96..100 大失败。天然大成功/大失败优先。',
    '若创建 judgementCheckPatches，每项必须是完整记录：checkId、turnId、gameTime 对象、title、category、targetSummary（可选）、relatedActorIds、relatedPlaceIds、relatedCaseIds、rulesetVersion="v1.1-local-d100"、primaryAttribute、可选 secondaryAttribute、difficultyTier、presetRoll、effectiveTarget、outcome、shortSummary、consequenceSummary（可选）、factors、relatedCombatEventId（可选）和 visibility。不得只返回本地骰制新增字段；presetRoll 必须等于上方预置骰，effectiveTarget/outcome 必须按公式精确回显。不要写 difficulty 或 score，它们由本地兼容层生成。',
    '正文的动作结果、代价、伤势、战斗结局和其他结构化写回必须服从这次本地结果；不得在结构化结果失败时把正文写成无代价成功。',
    '玩家输入已经实际进入追捕、格斗、持械、枪械、人群冲突、拘捕或逃脱等重大对抗时，combatEventPatches 不是可选摘要：必须与本回合唯一 judgementCheckPatches 同时创建，并让 combatEventPatches[].judgementCheckIds 精确引用其 checkId。不得只写正文或判定而漏掉对抗记录，也不得在合同重试时删除对抗记录来规避校验。'
  ].join('\n');
}

function formatPolicePanelProjection(context: PromptContext): string {
  const projection = context.policeProjection;
  if (!projection.available) {
    return [
      'POLICE_CONTEXT_PROJECTION',
      '- no active police identity.',
      'Rule: currentIdentity is the only public system route; do not use police authority unless currentIdentity=police and lawIdentity.status=active.'
    ].join('\n');
  }

  const dynamicAssessment = Object.entries(projection.careerPath.dynamicAssessment).map(
    ([key, value]) => `- ${key}: ${value}`
  );
  const climate = projection.climate.map(
    (entry) => `- ${entry.key} (${entry.label}) level=${entry.level}: ${entry.summary}`
  );
  const promotionBinding = context.officialDlcBindings?.find(
    (binding) => binding.dlcId === POLICE_PROMOTION_DLC_ID
  );
  const promotionProgress = projection.careerPath.promotionProgress;
  const postingProgress = projection.careerPath.postingProgress;
  const postingRouteIndex = projection.postingRouteIndex
    .map(
      (route) =>
        `${route.routeId}->${route.targetLabel}(${route.resultKind === 'training_rotation' ? 'training_rotation' : 'lateral_transfer'})`
    )
    .join(',');
  const postingOpportunities = projection.postingOpportunities.flatMap((opportunity) => [
    `postingOpportunity[${opportunity.routeId}]: mode=${opportunity.mode}; target=${opportunity.targetLabel}; result=${opportunity.resultKind}; stage=${opportunity.currentStage ?? 'not_started'}; vacancy=${opportunity.vacancyStatus ?? 'not_confirmed'}`,
    `  naturalEntry=${opportunity.naturalEntryChannels.join(' / ')}`,
    `  responsibilitiesAfterEffectivePosting=${opportunity.responsibilitySummary}`,
    `  dutyAfterEffectivePosting=${opportunity.dutyPatternSummary}`,
    `  evidenceContracts=${opportunity.evidenceContracts.map((contract) => `${contract.tag}[${contract.label}]<=${contract.acceptedEventTypes.join('|')}`).join(',')}`
  ]);
  const structuredCareer = promotionBinding
    ? [
        `structuredCareerDlc=${promotionBinding.status}; boundVersion=${promotionBinding.version}`,
        promotionProgress
          ? `promotionProgram: route=${promotionProgress.routeId}; stage=${promotionProgress.processStage}; current=${promotionProgress.currentRankCode}; target=${promotionProgress.targetRankCode}; vacancy=${promotionProgress.vacancyStatus}; lawfulNext=${promotionProgress.lawfulNextStages.join(',') || 'none'}; reviewNotBefore=${promotionProgress.reviewNotBefore ? `${promotionProgress.reviewNotBefore.year}-${String(promotionProgress.reviewNotBefore.month).padStart(2, '0')}-${String(promotionProgress.reviewNotBefore.day).padStart(2, '0')} ${String(promotionProgress.reviewNotBefore.hour).padStart(2, '0')}:${String(promotionProgress.reviewNotBefore.minute).padStart(2, '0')}` : 'none'}`
          : 'promotionProgram: unavailable',
        promotionProgress
          ? `promotionRequirements: ${promotionProgress.requirements.map((item) => `${item.requirementId}=${item.status}`).join(',')}`
          : '',
        postingProgress
          ? `postingProgram: route=${postingProgress.routeId}; stage=${postingProgress.processStage}; from=${postingProgress.sourceDepartment}; target=${postingProgress.targetDepartment}; vacancy=${postingProgress.vacancyStatus}; reviewNotBefore=${postingProgress.reviewNotBefore ? `${postingProgress.reviewNotBefore.year}-${String(postingProgress.reviewNotBefore.month).padStart(2, '0')}-${String(postingProgress.reviewNotBefore.day).padStart(2, '0')} ${String(postingProgress.reviewNotBefore.hour).padStart(2, '0')}:${String(postingProgress.reviewNotBefore.minute).padStart(2, '0')}` : 'none'}`
          : 'postingProgram: none',
        `postingRouteIndex: ${postingRouteIndex || 'none'}`,
        ...postingOpportunities,
        'postingOpportunityBoundary: routeIndex only lists structurally possible directions and is not an offer, recommendation, training place or vacancy. Only a projected postingOpportunity may enter this turn, through an existing supervisor, duty officer, instructor, current work fact or player inquiry. Do not create a new NPC only to deliver career procedure.',
        'postingInterestBoundary: when the player explicitly asks an existing police contact about exactly one projected postingOpportunity and the narrative actually completes that inquiry, record the expressed intent with kind=posting, the exact routeId, requestedStage=interested and events=[] even when no qualification, recommendation, training place or vacancy exists yet. interested means the player has expressed interest or asked for that one route\'s procedure, not that an application has been filed; wording such as “只了解／先打听流程” still qualifies when it clearly concerns the player and exactly one route. Vague curiosity about several departments does not start a program.',
        'postingEvidenceBoundary: interest, training, recommendation, qualification, selection, vacancy and formal reporting are separate facts. One fact cannot silently satisfy another; training completion never creates a vacancy; lateral transfer or PTU rotation never changes formal rank.',
        'careerReviewBoundary: exam_failed, recommendation_declined, selection_failed or vacancy_unavailable may establish a bounded reviewNotBefore window. During that window preserve valid evidence, keep playing normally, and do not request a stage advance; elapsed time only reopens review and never invents a pass, recommendation, vacancy or appointment.',
        'postingEffectBoundary: before stage=effective, do not change department, responsibilities or duty roster. At effective, pair the posting progress with one complete matching policeRoleProfilePatch; the local system will update responsibilities and the seven-day duty projection from the applied role.'
      ].filter(Boolean)
    : [];

  return [
    'POLICE_CONTEXT_PROJECTION',
    `institution=${projection.institutionName} / ${projection.institutionNameEn}`,
    `era=${projection.eraSummary}`,
    `unit=${projection.unitName}`,
    `localChain=${projection.localChain.join(' > ')}`,
    `unitSummary=${projection.unitSummary}`,
    `currentRank=${projection.careerPath.currentRank}`,
    `targetRank=${projection.careerPath.targetRank ?? 'unknown'}`,
    `route=${projection.careerPath.routeSummary}`,
    'knownRequirements:',
    formatList(projection.careerPath.knownRequirements.map((item) => `- ${item}`)),
    'dynamicAssessment:',
    formatList(dynamicAssessment),
    'rankCan:',
    formatList(projection.rankBoundary.can.map((item) => `- ${item}`)),
    'rankCannot:',
    formatList(projection.rankBoundary.cannot.map((item) => `- ${item}`)),
    'rankContacts:',
    formatList(projection.rankBoundary.contacts.map((item) => `- ${item}`)),
    'climate:',
    formatList(climate),
    'opportunities:',
    formatList(projection.careerPath.opportunities.map((item) => `- ${item}`)),
    'obstacles:',
    formatList(projection.careerPath.obstacles.map((item) => `- ${item}`)),
    'actionHints:',
    formatList(projection.actionHints.map((item) => `- ${item}`)),
    ...structuredCareer,
    `diagnostics: selectedClimate=${projection.diagnostics.selectedClimateKeys.join(',') || 'none'} omittedClimate=${projection.diagnostics.omittedClimateCount}`,
    promotionBinding
      ? 'Rule: use this panel as police institution context. The bound structured career program is authoritative: do not directly change currentRank or use same-identity correction. Propose only one lawful program step with policeCareerProgressPatch; a formal posting or appointment that changes role data must also provide the matching complete policeRoleProfilePatch.'
      : 'Rule: use this panel as police institution context. Do not auto-promote, auto-discipline, or rewrite police career progress unless playerPatch.policePanel explicitly updates it. A formally completed same-identity police station, department, operational-unit or posting transfer must use policeRoleProfilePatch.'
  ].join('\n');
}

function formatPoliceDutyProjection(context: PromptContext): string {
  const projection = context.policeDutyProjection;
  return [
    'POLICE_DUTY_CONTEXT',
    `状态：${projection.label}`,
    `班别：${projection.shiftLabel}`,
    `时段：${projection.scheduleWindow}`,
    `当前安排：${projection.currentDutySummary}`,
    `下一更：${projection.nextDutySummary}`,
    `轮班规则：${projection.rosterSummary}`,
    '未来七日班表（从当前游戏日期起滚动更新）：',
    ...projection.weekSchedule.map(
      (entry) => `- ${entry.isToday ? '今天 · ' : ''}${entry.summary}`
    ),
    projection.summary,
    '规则：',
    ...projection.ordinaryTurnRules.map((rule) => `- ${rule}`)
  ].join('\n');
}

function formatGrayNetworkProjection(context: PromptContext): string {
  const projection = context.grayNetworkProjection;
  if (!projection.available) {
    return [
      'GRAY_NETWORK_CONTEXT_PROJECTION',
      `area=${projection.areaId} perspective=${projection.perspective}`,
      '- no current gray-network context visible to this identity.',
      'Rule: do not invent triad control, hidden hierarchy, or gray-network certainty when no projected context is available.'
    ].join('\n');
  }

  const climate = projection.climate.map(
    (item) => `- key=${item.key} label=${item.label} level=${item.level} confidence=${item.confidence} summary=${item.summary}`
  );
  const organizations = projection.knownOrganizations.map(
    (item) =>
      `- organizationId=${item.organizationId ?? 'unknown'} visibleName=${item.visibleName} confidence=${item.confidence} visibility=${item.visibility[projection.perspective] ?? 'default'} scope=${item.knownScope} summary=${item.summary}`
  );
  const places = projection.keyPlaces.map(
    (item) =>
      `- placeId=${item.placeId} role=${item.visibleRole} confidence=${item.confidence} visibility=${item.visibility[projection.perspective] ?? 'default'} tie=${item.tieSummary} risk=${item.riskSummary}`
  );
  const people = projection.relatedPeople.map(
    (item) =>
      `- actorId=${item.actorId} role=${item.visibleRole} confidence=${item.confidence} visibility=${item.visibility[projection.perspective] ?? 'default'} tie=${item.knownTieSummary}${item.attitudeToPlayer ? ` attitude=${item.attitudeToPlayer}` : ''}${item.riskNote ? ` risk=${item.riskNote}` : ''}`
  );
  const clues = projection.relationClues.map(
    (item) =>
      `- clueId=${item.clueId} certainty=${item.certainty} confidence=${item.confidence} visibility=${item.visibility[projection.perspective] ?? 'default'} summary=${item.summary}`
  );
  const risks = projection.actionRisks.map(
    (item) =>
      `- riskId=${item.riskId} level=${item.level} title=${item.title} summary=${item.summary}${item.suggestedMitigation ? ` mitigation=${item.suggestedMitigation}` : ''}`
  );
  const actions = projection.suggestedActions.map(
    (item) => `- actionId=${item.actionId} risk=${item.riskLevel} text=${item.text} rationale=${item.rationale}`
  );

  return [
    'GRAY_NETWORK_CONTEXT_PROJECTION',
    `area=${projection.areaId} areaName=${projection.areaName} perspective=${projection.perspective}`,
    'climate:',
    formatList(climate),
    'knownOrganizations:',
    formatList(organizations),
    'keyPlaces:',
    formatList(places),
    'relatedPeople:',
    formatList(people),
    'relationClues:',
    formatList(clues),
    'identityActionRisks:',
    formatList(risks),
    'suggestedActions:',
    formatList(actions),
    `diagnostics: sourceArea=${projection.diagnostics.sourceAreaId} climate=${projection.diagnostics.projectedClimate} organizations=${projection.diagnostics.projectedOrganizations} places=${projection.diagnostics.projectedPlaces} people=${projection.diagnostics.projectedPeople} clues=${projection.diagnostics.projectedClues} risks=${projection.diagnostics.projectedRisks} actions=${projection.diagnostics.projectedActions} omittedHidden=${projection.diagnostics.omittedHidden} missingActors=${projection.diagnostics.missingActorRefs.join(',') || 'none'} missingPlaces=${projection.diagnostics.missingPlaceRefs.join(',') || 'none'} missingOrganizations=${projection.diagnostics.missingOrganizationRefs.join(',') || 'none'}`,
    'Rule: this projection is identity-filtered. Do not use hidden entries or out-of-area material.',
    'Rule: do not treat rumors as confirmed facts; preserve confidence, certainty and visibility in narration.',
    'Rule: suggestedActions are optional player-facing context only; do not execute suggested actions unless the player chooses them.',
    'Rule: gray-network changes must be written through grayNetworkPatches. Do not create canonical Actor/Place/Organization records unless the scene also reveals enough stable identity details for those modules.'
  ].join('\n');
}

const adultPrivatePartKeys = ['胸部', '小穴', '屁穴'] as const;
const adultPrivatePlaceholderTexts = new Set(['pending', '待补全', '暂无记录', 'NO RECORDS']);

function formatPrivateText(value: string | undefined, fallback: string): string {
  const text = value?.trim();
  return text && !adultPrivatePlaceholderTexts.has(text) ? text : fallback;
}

function formatVisiblePaternityCandidates(
  candidates:
    | Array<{
        actorId?: string;
        name?: string;
        visibility: string;
      }>
    | undefined
): string | undefined {
  const visible = (candidates ?? [])
    .filter((candidate) => candidate.visibility !== 'hidden')
    .map((candidate) => candidate.name ?? candidate.actorId)
    .filter((candidate): candidate is string => Boolean(candidate));
  return visible.length > 0 ? visible.join('、') : undefined;
}

function formatAdultPrivateWomb(profile: NonNullable<PromptContext['actorPackets'][number]['femaleProfile']>['adultPrivateProfile']): string {
  const womb = profile?.womb;
  const records = womb?.records?.length
    ? womb.records
        .slice(-6)
        .map((record) =>
          [
            record.date,
            record.description,
            record.pregnancyCheckDate ? `判定日=${record.pregnancyCheckDate}` : '',
            record.pregnancyCheckResult ? `判定=${record.pregnancyCheckResult}` : '',
            formatVisiblePaternityCandidates(record.paternityCandidates)
              ? `玩家已知父系候选=${formatVisiblePaternityCandidates(record.paternityCandidates)}`
              : ''
          ]
            .filter(Boolean)
            .join(':')
        )
        .join('；')
    : '无';
  const pregnancy = womb?.pregnancy;
  const visiblePaternity = formatVisiblePaternityCandidates(pregnancy?.paternityCandidates);
  const lifecycle = pregnancy
    ? [
        `阶段=${pregnancy.status}`,
        `登记=${formatGameTime(pregnancy.registeredAt)}`,
        `验孕=${formatGameTime(pregnancy.checkDueAt)}`,
        pregnancy.status !== 'pending_check' ? `确认=${formatGameTime(pregnancy.confirmationDueAt)}` : undefined,
        ['confirmed', 'delivery_due', 'postpartum'].includes(pregnancy.status)
          ? `预产=${formatGameTime(pregnancy.dueAt)}`
          : undefined,
        pregnancy.postpartumUntil ? `产后恢复至=${formatGameTime(pregnancy.postpartumUntil)}` : undefined,
        pregnancy.childActorId ? `孩子=${pregnancy.childName ?? pregnancy.childActorId}(${pregnancy.childActorId})` : undefined,
        visiblePaternity ? `玩家已知父系候选=${visiblePaternity}` : undefined
      ]
        .filter(Boolean)
        .join(' / ')
    : '无活动妊娠';
  const pendingChecks = womb?.pendingPregnancyChecks?.length
    ? womb.pendingPregnancyChecks
        .map((item) => {
          const candidates = formatVisiblePaternityCandidates(item.paternityCandidates);
          return [
            `${formatGameTime(item.registeredAt)}→${formatGameTime(item.checkDueAt)}`,
            candidates ? `玩家已知父系候选=${candidates}` : undefined
          ]
            .filter(Boolean)
            .join('/');
        })
        .join('；')
    : '无';
  const history = womb?.pregnancyHistory?.length
    ? womb.pregnancyHistory
        .slice(-3)
        .map((item) => {
          const candidates = formatVisiblePaternityCandidates(item.paternityCandidates);
          return [
            `${formatGameTime(item.endedAt)}:${item.outcome}:${item.summary}`,
            candidates ? `玩家已知父系候选=${candidates}` : undefined
          ]
            .filter(Boolean)
            .join(':');
        })
        .join('；')
    : '无';
  return `    - 子宫档案: 状态=${womb?.status ?? '未受孕'} / 宫口状态=${womb?.cervixStatus ?? '紧闭'} / 生命周期=${lifecycle} / 后续待验孕=${pendingChecks} / 历史=${history} / 记录=${records}`;
}

function formatIdentityContextProjection(context: PromptContext): string {
  const projection = context.identityProjection;
  return [
    '身份知识边界硬规则：',
    '- CURRENT_SHELL 是玩家当前对外身份，也是 UI、权限、社会反应和系统面板的唯一默认路由。不得根据 originIdentity、隐藏 role profile 或秘密效忠改用另一套界面/权限。',
    '- PROTAGONIST_PRIVATE_KNOWLEDGE 是主角本人知道、但未必公开的事实；可用于主角内心、主动隐瞒和知情行动，不能让旁人自动知道。',
    '- DIRECTOR_ONLY_FACTS 只供叙事导演维持因果一致；主角与 NPC 都不会因为这里保存了事实而自动知道、暗示、试探或揭穿。',
    '- knownByActorIds 只授予列出的 Actor 知情；playerCharacterKnown 只表示主角知情；publicKnown/publicly_revealed 才能作为普通公共事实。',
    '- 秘密只有在正文实际发生符合 revealConditions 的揭示事件，并通过结构化 secretFactPatches 更新后，才可扩大知情范围或公开。',
    `CURRENT_SHELL\n${JSON.stringify(projection.currentShell, null, 2)}`,
    `PROTAGONIST_PRIVATE_KNOWLEDGE\n${JSON.stringify(projection.protagonistPrivateKnowledge, null, 2)}`,
    `DIRECTOR_ONLY_FACTS\n${JSON.stringify(projection.directorOnlyFacts, null, 2)}`,
    `PUBLIC_FACTS\n${JSON.stringify(projection.publicFacts, null, 2)}`
  ].join('\n');
}

function formatTriadMembershipProjection(context: PromptContext): string {
  const roleProjection = context.identityProjection.currentShell.publicRoleProfile;
  if (!roleProjection || roleProjection.identity !== 'gang_member') return '';
  const profile = roleProjection.profile;
  if (profile.status !== 'active' && profile.status !== 'cover') return '';

  const actorName = (actorId: string) =>
    context.actorPackets.find((actor) => actor.actorId === actorId)?.name ??
    context.remoteNpcPresenceProjection.candidates.find((actor) => actor.actorId === actorId)?.actorName ??
    actorId;
  const organizationAction = context.backgroundEvolutionProjection.activeOrganizationActions.find(
    (action) => action.organizationId === profile.organizationId
  );
  const responsibilities = context.dynamicProjection.currentMatters.filter(
    (matter) =>
      matter.source === 'triad_responsibility' &&
      Boolean(profile.organizationId && matter.relatedOrganizationIds.includes(profile.organizationId))
  );

  return [
    'TRIAD_MEMBERSHIP_CONTEXT',
    `organizationId=${profile.organizationId ?? 'unknown'} societyName=${profile.societyName ?? 'unknown'}`,
    `position=${[profile.rankSummary, profile.roleTitle].filter(Boolean).join(' / ') || '未明确'}`,
    `territory=${profile.territorySummary ?? '未明确'}`,
    `patrons=${profile.patronActorIds.map((actorId) => `${actorName(actorId)}(${actorId})`).join('；') || 'none'}`,
    `peers=${profile.peerActorIds.map((actorId) => `${actorName(actorId)}(${actorId})`).join('；') || 'none'}`,
    `obligation=${profile.obligationSummary}`,
    `risk=${profile.riskSummary}`,
    organizationAction
      ? `organizationDirection=${organizationAction.objective} / ${organizationAction.currentAction} / ${organizationAction.currentStatus}`
      : 'organizationDirection=当前没有已激活的可见组织行动，不得凭空补造。',
    'currentResponsibilities:',
    formatList(
      responsibilities.map(
        (matter) =>
          `- matterId=${matter.id} status=${matter.status} title=${matter.title}\n  summary=${matter.summary}\n  currentHook=${matter.currentHook ?? 'none'}\n  relatedActors=${matter.relatedActorIds.join(',') || 'none'}`
      )
    ),
    'Rules:',
    '- 组织方向是正在演化的背景事实，不等于玩家自动接到任务。新责任必须由稳定 actorId 的直属上线或有权人物在正文中真实联系、当面交代后，才可写 currentMatterPatches。',
    '- 当前责任不是任务清单。玩家可以完成、拒绝、敷衍、换方法、隐瞒或利用机会；只按本回合真实结果更新原 matterId、人物关系、必要记忆与组织观感。',
    '- 不得因为组织方向存在就每回合推进责任，也不得在没有人物传导时让玩家突然知道后台计划。'
  ].join('\n');
}

function formatScreenCharacterSeedProjection(context: PromptContext): string {
  const projection = context.screenCharacterSeedProjection;
  const characters = projection.characters.map((character) => {
    const aliases = character.recognitionAliases.join('/') || 'none';
    const sectors = character.sectors.join(',') || 'none';
    const relationships = character.relationshipAnchors.join(' / ') || 'none';
    const accessRoutes = character.accessRoutes.join(' / ') || 'none';
    const hooks = character.promptHooks.join(' / ') || 'none';
    return [
      `- seedId=${character.id} canonicalCharacterId=${character.canonicalCharacterId} runtimeActorId=${character.runtimeActorId} displayName=${character.displayName} englishName=${character.englishName ?? 'none'} category=${character.category} score=${character.score} reasons=${character.reasons.join(',') || 'none'} confidence=${character.sourceConfidence}`,
      `  INTERNAL_SOURCE_ANCHOR_DO_NOT_EXPOSE: sourceWorkTitle=${character.sourceWorkTitle} sourceWorkTitleEn=${character.sourceWorkTitleEn ?? 'none'} medium=${character.medium} worldpackAvailableYears=${character.availableYears.from}-${character.availableYears.to}`,
      `  WORLD_TIME_PLACEMENT_DO_NOT_EXPOSE: ${character.worldpackPlacementAnchor ?? 'Use the supplied profile only within availableYears; no source event after the exact current game date has happened.'}`,
      `  aliases=${aliases} gender=${character.gender} ageRange=${character.ageRange.min}-${character.ageRange.max} currentIdentity=${character.currentIdentity} sectors=${sectors}`,
      `  publicIdentity=${character.publicIdentity}`,
      `  actualIdentity=${character.actualIdentitySummary}`,
      `  position=${character.positionSummary}`,
      `  profile=${character.profileSummary}`,
      `  personality=${character.personality}`,
      `  speechStyle=${character.speechStyle}`,
      `  motivation=${character.motivation}`,
      `  longTermGoal=${character.longTermGoal}`,
      `  values=${character.values}`,
      `  capability=${character.capabilityProfile}`,
      `  appearance=${character.appearanceAnchor}`,
      `  clothing=${character.clothingAnchor}`,
      `  relationships=${relationships}`,
      `  accessRoutes=${accessRoutes}`,
      `  hooks=${hooks}`,
      `  identityHook=${character.identityHook}`
    ].join('\n');
  });

  return [
    'SCREEN_CHARACTER_SEED_PROJECTION',
    `diagnostics: selected=${projection.diagnostics.selectedCharacterIds.join(',') || 'none'} eligible=${projection.diagnostics.eligibleCharacters} total=${projection.diagnostics.totalCharacters} textChars=${projection.diagnostics.selectedTextChars} estimatedTokenBudget=${projection.diagnostics.estimatedTokenBudget} omitted=${projection.diagnostics.omittedCharacterCount}`,
    'rules:',
    formatList(projection.rules.map((rule) => `- ${rule}`)),
    'characters:',
    formatList(characters)
  ].join('\n');
}

function formatCivilianTransitionGuidance(context: PromptContext): string {
  const shell = context.identityProjection.currentShell;
  const role = shell.publicRoleProfile;
  if (shell.currentIdentity !== 'civilian' || role?.identity !== 'civilian') return '';

  const profile = role.profile;
  return [
    '当前仍是普通市民；以下只是叙事入口规则，不是任务池或自动转职系统。',
    `职业与生活锚点：${profile.publicOccupation ?? '普通市民'}；日常地点=${profile.workplacePlaceId ?? '未固定'}。`,
    `社区接触面：${profile.communitySummary}`,
    `家庭与经济压力：${profile.familyEconomicSummary}`,
    '- 只有本回合具体事件、既有人物关系、职业接触、家庭压力或街坊处境自然支持时，才低频浮现一条进入警队或社团的线索；不得每回合硬塞，也不得同时弹出两条路线让玩家菜单式二选一。',
    '- 入口必须是具体关系和行动，例如警员提出报考/推荐线索，或街面人物先请玩家办一件符合当前生活圈的小事；不能只写抽象的“是否加入警队/社团”。',
    '- 线索成熟时，把接受、追问条件、拒绝或暂缓中的 2-3 个具体选择写入 suggestedActions；narrativeText 只写现场人物的邀请、暗示与反应，不用选择题收尾。',
    '- 玩家没有明确选择且身份尚未真正成立时，不得输出 identityContextPatch。玩家选择继续接触，也不等于已经加入；只有正文明确完成加入、录取、受训入职或社团身份成立后，才按既有 join 协议切换身份。',
    '- 玩家可以拒绝或长期保持市民身份；以后即使转换，当前家庭、住所、旧工作、社区关系和未解决压力仍然保留。',
    '- 如果近期正文已经给出尚未回应的入口选择，继续承接该选择，不要另造一条新入口覆盖它。'
  ].join('\n');
}

function formatAdultPrivateParts(profile: NonNullable<PromptContext['actorPackets'][number]['femaleProfile']>['adultPrivateProfile']): string {
  const parts = adultPrivatePartKeys.map((key) => `${key}=${formatPrivateText(profile?.partProfiles?.[key]?.description, '未记录具体描述')}`);
  return `    - 部位档案: ${parts.join(' / ')}`;
}

function formatFemaleProfile(actor: PromptContext['actorPackets'][number]): string[] {
  const profile = actor.femaleProfile;
  if (!profile) return [];

  const relationshipEdges = profile.relationshipNetworkEdges
    ?.map((edge) => [edge.targetName, edge.relation, edge.note].filter(Boolean).join(' / '))
    .filter(Boolean);
  const lines = [
    `  女性档案:`,
    profile.birthday ? `    - 生日/纪念日: ${profile.birthday}` : undefined,
    profile.addressToPlayer ? `    - 对玩家称呼: ${profile.addressToPlayer}` : undefined,
    profile.appearanceDescription ? `    - 外貌档案: ${profile.appearanceDescription}` : undefined,
    profile.bodyDescription ? `    - 身形描述: ${profile.bodyDescription}` : undefined,
    profile.clothingStyle ? `    - 衣着风格: ${profile.clothingStyle}` : undefined,
    profile.personalityCore ? `    - 核心性格特征: ${profile.personalityCore}` : undefined,
    profile.affectionProgressionCondition ? `    - 好感突破条件: ${profile.affectionProgressionCondition}` : undefined,
    profile.relationshipProgressionCondition ? `    - 关系突破条件: ${profile.relationshipProgressionCondition}` : undefined,
    relationshipEdges?.length ? `    - 重要女性关系网: ${relationshipEdges.join('；')}` : undefined,
    !relationshipEdges?.length && profile.relationshipNetwork?.length
      ? `    - 重要女性关系网: ${profile.relationshipNetwork.join(' / ')}`
      : undefined
  ].filter((line): line is string => Boolean(line));

  const privateProfile = profile.adultPrivateProfile;
  if (privateProfile && privateProfile.enabled !== false) {
    const privateLines = [
      formatAdultPrivateWomb(privateProfile),
      formatAdultPrivateParts(privateProfile),
      privateProfile.fetishNotes ? `    - 性癖: ${privateProfile.fetishNotes}` : undefined,
      privateProfile.sensitivePoints ? `    - 敏感点: ${privateProfile.sensitivePoints}` : undefined
    ].filter((line): line is string => Boolean(line));
    lines.push(`  香闺秘档:`, ...privateLines);
  }

  return lines;
}

const genderLabels: Record<PromptContext['actorPackets'][number]['gender'], string> = {
  male: '男',
  female: '女',
  nonbinary: '非二元',
  unknown: '未知'
};

function uniqueText(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function formatAliases(actor: PromptContext['actorPackets'][number]): string {
  return uniqueText([...actor.aliases, actor.callName]).join(' / ') || '无';
}

function formatGenderAge(actor: PromptContext['actorPackets'][number]): string {
  const age = actor.computedAge === undefined ? '年龄未知' : `${actor.computedAge}岁`;
  return [genderLabels[actor.gender], age, actor.visualAgeAnchor].filter(Boolean).join(' / ');
}

function formatAttributes(attributes: PromptContext['actorPackets'][number]['attributes']): string {
  return `体魄${attributes.body}，行动${attributes.action}，观察${attributes.perception}，思考${attributes.thinking}，交涉${attributes.negotiation}，意志${attributes.will}`;
}

function formatTraits(actor: PromptContext['actorPackets'][number]): string {
  const traits = actor.activeTraits.filter((trait) => trait.status !== 'removed');
  if (traits.length === 0) return '无';
  return traits.map((trait) => `${trait.name}（${trait.effectSummary}）`).join('；');
}

function formatTraitProgress(actor: PromptContext['actorPackets'][number]): string {
  if (actor.traitProgress.length === 0) return '无';
  return actor.traitProgress.map((progress) => `${progress.name} ${progress.progress}/${progress.maxProgress}：${progress.reason}`).join('；');
}

function formatActorPacket(actor: PromptContext['actorPackets'][number]): string {
  const actorName = actor.englishName ? `${actor.name} / ${actor.englishName}` : actor.name;
  const equipmentSummary = actor.equipment.length ? actor.equipment.join('、') : '无';
  const organizationRelationSummary = actor.organizationRelations.length
    ? actor.organizationRelations
        .map(
          (relation) =>
            `${relation.organizationId}:${relation.relationType}${relation.roleTitle ? `/${relation.roleTitle}` : ''}${relation.departmentOrUnit ? `/${relation.departmentOrUnit}` : ''} - ${relation.summary}`
        )
        .join('；')
    : '无';

  return [
    `- actorId: ${actor.actorId}`,
    `  别名/称呼: ${formatAliases(actor)}`,
    `  性别/年龄: ${formatGenderAge(actor)}`,
    `  所属组织: ${actor.organizationIds.join(' / ') || '无'}`,
    `  机构关系: ${organizationRelationSummary}`,
    `  六维: ${formatAttributes(actor.attributes)}`,
    `  特质: ${formatTraits(actor)}`,
    `  特质进度: ${formatTraitProgress(actor)}`,
    `  姓名: ${actorName}`,
    `  当前身份: ${actor.currentIdentity}`,
    `  公开身份: ${actor.publicIdentity ?? '未标明'}`,
    ...(actor.actualIdentitySummary ? [`  玩家已知实际身份摘要: ${actor.actualIdentitySummary}`] : []),
    `  简介: ${actor.profileSummary}`,
    `  外貌: ${actor.appearance || '未标明'}`,
    `  衣着: ${actor.clothing || '未标明'}`,
    `  装备: ${equipmentSummary}`,
    `  状态: ${actor.statusSummary || '未标明'}${actor.bodyConditionSummary ? `；身体: ${actor.bodyConditionSummary}` : ''}`,
    `  性格: ${actor.personality || '未标明'}`,
    `  说话风格: ${actor.speechStyle || '未标明'}`,
    `  与玩家关系: ${actor.relationshipSummary || '未标明'}`,
    `  对玩家态度: ${actor.attitudeTowardPlayer || '未标明'}`,
    `  往来度: ${actor.interactionScore}`,
    `  信任/戒备: ${actor.trustTendency || '未标明'}`,
    `  重要牵连: ${actor.entanglementSummary || '未标明'}`,
    `  身份资料: ${JSON.stringify(actor.roleProfiles)}`,
    ...formatFemaleProfile(actor)
  ].join('\n');
}

function formatExplicitActorReferenceProjection(context: PromptContext): string {
  const projection = context.explicitActorReferenceProjection;
  if (projection.actors.length === 0) return '- 本轮玩家没有点名人物志中的远场人物。';
  const actors = projection.actors.map((actor) => {
    const names = uniqueText([
      actor.name,
      actor.englishName,
      actor.callName,
      ...actor.aliases
    ]).join(' / ');
    return [
      `- actorId: ${actor.actorId}`,
      `  姓名与别名: ${names}`,
      `  本轮命中: ${actor.matchedValues.join(' / ')}`,
      `  身份: ${actor.publicIdentity ?? '未标明'}`,
      ...(actor.actualIdentitySummary
        ? [`  玩家已知实际身份摘要: ${actor.actualIdentitySummary}`]
        : []),
      `  档案: ${actor.profileSummary || '未标明'}`,
      `  职位/位置: ${actor.positionSummary || '未标明'}；${actor.currentPlaceId ?? '地点未明'}`,
      `  当前状态: ${actor.statusSummary || '未标明'}`,
      `  与玩家关系: ${actor.relationshipSummary || '未标明'}`,
      `  是否存在同名歧义: ${actor.ambiguous ? '是；只能在列出的候选中消歧，不得另造第三人' : '否；必须复用此 actorId'}`
    ].join('\n');
  });
  return actors.join('\n\n');
}

function createTurnResponseExample(
  pregnancyMode: PregnancyMode = 'standard',
  dramaPlanningContext?: DramaPlanningContext,
  dramaPlan?: DramaPlan,
  localJudgementInput?: ComposePromptOptions['localJudgement'],
  policePromotionDlcBound = false,
  policePostingExample?: {
    routeId: string;
    requestedStage:
      | 'interested'
      | 'eligible'
      | 'training'
      | 'awaiting_vacancy'
      | 'approved_waiting_report'
      | 'effective';
  }
) {
  const localJudgement = localJudgementInput ?? {
    presetRoll: 50,
    attributes: {
      body: 50,
      action: 50,
      perception: 50,
      thinking: 50,
      negotiation: 50,
      will: 50
    },
    gameDifficulty: 'standard' as const,
    sources: {
      traits: [],
      equipment: []
    }
  };
  const exampleJudgementFactors = [
    {
      sourceType: 'preparation' as const,
      label: '站位准备',
      value: 4,
      reason: '玩家在对方起步前已占据较有利位置。'
    },
    {
      sourceType: 'environment' as const,
      label: '湿滑地面',
      value: -4,
      reason: '后巷地面积水，快速发力容易失足。'
    }
  ];
  const exampleJudgementCalculation = calculateEffectiveTarget({
    attributes: localJudgement.attributes,
    primaryAttribute: 'action',
    secondaryAttribute: 'body',
    difficultyTier: 'hard',
    gameDifficulty: localJudgement.gameDifficulty,
    factors: exampleJudgementFactors
  });
  const exampleJudgementOutcome = deriveLocalJudgementOutcome(
    localJudgement.presetRoll,
    exampleJudgementCalculation.effectiveTarget
  );
  const exampleCombatPresentation = {
    critical_success: {
      outcome: 'opponent_subdued' as const,
      conditionAfter: '持刀手被干净利落地控制，没有形成反击机会。',
      combatText:
        '窄巷里的积水被脚步踢开，嫌疑人刚回身举刀，玩家已借墙面缩短距离，侧身让过刀锋，顺势扣住持刀腕压向卷闸门。铁皮震出一声闷响，对方膝盖一软，折刀随即落地，整个危险动作在围观者反应过来前已经结束。',
      resultSummary: '玩家以明显优势控制嫌疑人。',
      consequenceSummary: '嫌疑人被迅速制服，玩家保留了继续处理现场的余力。'
    },
    success: {
      outcome: 'opponent_subdued' as const,
      conditionAfter: '右腕被压住，仍在挣扎。',
      combatText:
        '窄巷里的积水被脚步踢开，嫌疑人回身挥刀，刀光贴着霓虹一闪。玩家先侧身避过刀锋，再借墙面缩短距离，一手扣住对方持刀腕，一手顶住肩颈，把人压向卷闸门。铁皮震出一声闷响，对方膝盖一软，折刀终于脱手。',
      resultSummary: '玩家成功控制嫌疑人。',
      consequenceSummary: '嫌疑人被压制，玩家有一定体力消耗，现场动静引来街坊围观。'
    },
    partial_success: {
      outcome: 'player_advantage' as const,
      conditionAfter: '持刀手暂时被逼退，但仍有脱身空间。',
      combatText:
        '嫌疑人回身挥刀时，玩家侧身避开正面刀锋，以警棍逼住对方手腕。湿滑地面让双方同时失去一步站位，折刀没有落地，但持刀手被迫退到卷闸门旁。玩家抢到巷口一侧的主动，却还没能完成控制。',
      resultSummary: '玩家取得站位优势，但未能立即制服嫌疑人。',
      consequenceSummary: '对方仍有反抗或逃脱可能，玩家必须承担继续逼近的风险。'
    },
    failure: {
      outcome: 'opponent_escaped' as const,
      conditionAfter: '持刀手借湿滑地面和巷道转角脱离控制。',
      combatText:
        '嫌疑人突然回身挥刀，玩家侧避时脚下在积水里一滑，原本封住巷口的角度被拉开。对方没有恋战，撞翻垃圾桶制造阻挡，趁铁桶滚动和街坊惊叫的空隙钻过转角。玩家稳住身体时，后巷只剩急促脚步声。',
      resultSummary: '玩家未能控制嫌疑人，对方逃离现场。',
      consequenceSummary: '追捕线索仍在，但玩家失去眼前接触并惊动了附近街坊。'
    },
    critical_failure: {
      outcome: 'player_wounded' as const,
      conditionAfter: '持刀手突破控制并造成玩家受伤。',
      combatText:
        '玩家逼近时在积水里失足，持刀手抓住重心失衡的瞬间反手挥刀。刀锋擦过防守手臂，疼痛迫使玩家退开半步；对方随即撞翻垃圾桶封住巷道，冲过转角。附近街坊惊叫后退，现场由拘捕迅速变成受伤与追逃并存的混乱局面。',
      resultSummary: '玩家在控制失败时受伤，嫌疑人趁机逃脱。',
      consequenceSummary: '玩家伤势必须写入生命状态，现场追捕也需要重新组织。'
    }
  }[exampleJudgementOutcome];
  const example = {
    writebackVersion: '1.7',
    narrativeText:
      '【旁白】报案室墙上的钟刚过九点，雨水沿着玻璃门往下淌。值班簿摊在柜台内侧，最上面一页记着西洋菜街两次噪音投诉；第一次报案时间是八点四十分，第二次却写成八点二十五分，门牌和报案人姓氏也各差一个字。\n【旁白】你逐项核对那两行记录，夹在簿里的电话便笺露出半截。便笺上的号码属于街角茶餐厅，来电人说话时没有留下全名，只要求巡逻警员去后门看看。\n【报案室警员】“第一通系女人打嚟，讲楼上有人搬铁架。隔咗十几分钟，男声又打一次，净系问我哋几时到。我听住唔似同一个人。”\n【旁白】报案室警员把电话登记纸移到灯下，用笔帽点出两个接听时间，没有替其中任何一方补上身份。记录旁边的值日警长翻过当晚巡逻表，表上显示负责那一段的警员八点半仍在花园街处理小贩争执，尚未到过投诉地址。\n【值日警长】“所以唔好当两张纸系一件事。一个真系投诉，另一个可能只系想知巡逻车去到边。你查记录可以，未问清楚之前，唔好帮佢哋拼埋个故事。”\n【旁白】送外卖过来的茶餐厅老板一直站在柜台另一端，听见自己的店号被念出来，先把零钱收回围裙口袋，才承认八点多确实有人借过店里的电话。\n【茶餐厅老板】“个女仔我认得，住附近，平时收铺会经过。后尾嗰个男人唔系熟客，买包烟先问电话。佢冇讲社团名，我都冇胆乱认；不过佢问嘅唔系几时有人到，系问巡逻车通常由边条街入。”\n【旁白】老板说到这里便停住，只肯描述那人的灰夹克、左手虎口一道旧疤，以及离开时走向通菜街的方向。他不愿在满是候问市民的报案室里签正式口供，却也没有否认自己看清了对方。两次来电的差别、尚未核实的身份和巡逻表上的空档已经摆在同一张柜台上。值日警长没有替你把它升级成案件，只把电话便笺压回簿页旁，等候你决定如何处置。',
    presentationHints: {
      dialogueEmotions: ['serious', 'serious', 'worried'],
      innerMonologueEmotions: []
    },
    turnSummary:
      '本回合事实摘要：玩家接到有人在报案室外找他的消息；茶餐厅老板提到附近有人打听巡逻路线；后续只应承接门口来人、街面询问和报案室现场反应。',
    suggestedActions: ['继续询问眼前的人。', '先观察周围反应。'],
    playerVitalsReview: {
      changed: false,
      reason: '玩家本回合只在室内核对记录和交谈，生命、体力与身体状态均未改变。'
    },
    pregnancyLifecycleReview: {
      changed: false,
      events: [],
      reason: '本回合没有发生受孕风险、医学确认、妊娠终止或分娩。'
    },
    timePatch: {
      elapsedMinutes: 10,
      reason: '简短交谈并观察现场。'
    },
    writeback: {
      locationPatch: {
        currentPlaceId: 'place_current',
        currentSceneId: 'scene_current',
        reason: '只有玩家当前位置或当前场景确实变化时才写；没有变化可省略。'
      },
      playerPatch: {
        economy: {
          monthlyPressureDelta: 0,
          financeSummary: '生活压力与总体财务状况发生变化时才写；具体金钱变化写 financePatch。'
        },
        progression: {
          experienceGain: 8,
          reason: '完成了一次有意义的现场处置。'
        },
        homeBase: {
          placeId: 'place_home_id',
          placeName: '固定住所名称',
          housingType: '住房类型',
          summary: '住址与环境摘要。',
          householdSummary: '同住者/家庭牵连摘要。'
        },
        clothing: {
          currentSummary: '衣着发生变化时才写当前穿着摘要。',
          mode: 'other',
          sourceItemId: 'asset_special_clothing_id',
          sourceItemSignificance: '只有穿上有特殊意义的衣物时才写。',
          lastChangedReason: '玩家明确换装或剧情明确要求换装时才写。'
        },
        reputation: {
          notorietyDelta: 0,
          summary: '概括本回合各圈层评价与传播变化；整体口碑由本地综合。',
          reason: '说明本回合为什么会改变知名度或圈层评价；没有明确社会评价变化时不要写。',
          circlePatches: [
            {
              circle: 'neighborhoodMedia',
              visibilityDelta: 0,
              standingDelta: 0,
              summary: '某圈层对玩家看法变化时才写。',
              reason: '说明这个圈层为什么改变看法。'
            }
          ]
        },
        policePanel: {
          unitSummary: '只有警队单位、岗位理解或职责边界确实变化时才写。',
          careerPath: {
            ...(policePromotionDlcBound
              ? {}
              : {
                  currentRank: '只有正式晋升、降职、复职或职级纠正确已生效时才写完整现职级，例如 Inspector（督察 IP）；仅获推荐、候选、面试或等待任命时禁止提前更新。'
                }),
            targetRank: '现职级正式变化后，写下一合理目标职级；没有明确目标时可以省略。',
            routeSummary: '概括现职级已经生效以及下一阶段晋升路径；不要把尚未生效的推荐写成既成晋升。',
            dynamicAssessment: {
              seniority: '年资/资历有新信息时才更新。',
              discipline: '纪律记录或处分风险有新信息时才更新。',
              supervisor: '上级评价发生明确变化时才更新。',
              performance: '正式表现记录、嘉奖或失误被记入时才更新。',
              commendation: '正式嘉奖、推荐或表扬有新信息时才更新。',
              opportunity: '出现明确晋升机会或推荐窗口时才更新。'
            },
            opportunities: ['只有出现可操作机会时才写。'],
            obstacles: ['只有出现明确阻碍时才写。'],
            suggestedActions: ['可写给玩家看的警队内行动提示。']
          },
          climate: [],
          actionHints: []
        }
      },
      ...(policePromotionDlcBound
        ? {
            policeCareerProgressPatch: policePostingExample
              ? {
                  kind: 'posting' as const,
                  routeId: policePostingExample.routeId,
                  requestedStage: policePostingExample.requestedStage,
                  events: [],
                  reason:
                    '只在本回合自然形成该调动程序的下一个合法步骤时提交；训练、推荐、资格、空缺和正式报到必须分别使用投影合同允许的 event。'
                }
              : {
                  kind: 'promotion' as const,
                  routeId: '使用 POLICE_CONTEXT_PROJECTION 中当前晋升路线的稳定 routeId',
                  requestedStage: 'eligible' as const,
                  events: [
                    {
                      eventId: '本回合职业程序事实的稳定且唯一 ID',
                      eventType: 'judgement_recorded' as const,
                      summary: '只记录本回合已经实际应用的正式程序或职业事实。',
                      supportRef: {
                        kind: 'judgement' as const,
                        refId: '本回合实际写入的 judgement checkId'
                      },
                      tags: ['performance']
                    }
                  ],
                  reason:
                    '说明为什么本回合只推进这一个程序步骤；正文口头称赞或玩家要求不能作为正式证据。'
                }
          }
        : {}),
      financePatch: {
        cashDelta: 0,
        bankDelta: 0,
        summary: '本回合随身现金与银行存款没有明显变化。',
        upsertCashflows: [
          {
            itemId: 'cashflow_player_civilian_primary_job',
            direction: 'income',
            kind: 'salary',
            title: '稳定受雇工作月薪（只有本回合正式建立时才写）',
            amount: 1800,
            account: 'bank',
            identityBinding: 'civilian',
            summary: '玩家已经完成录用并正式建立持续按月发薪的受雇关系。',
            activeFromMonth: '1984-12',
            relatedAssetItemIds: [],
            relatedActorIds: ['player'],
            relatedPlaceIds: ['place_employer_stable_id'],
            source: 'writeback',
            status: 'active',
            visibility: 'player_known'
          }
        ],
        removeCashflowItemIds: [],
        ledgerEntries: []
      },
      grayLedgerPatch: {
        entries: []
      },
      grayNetworkPatches: [
        {
          areaId: 'district_mong_kok',
          areaName: 'Mong Kok',
          climate: [
            {
              key: 'street_collection_pressure',
              label: 'Street collection pressure',
              level: 'rising',
              summary: 'Rumors say small shops around the current area are being pressed for money.',
              confidence: 'medium'
            }
          ],
          knownOrganizations: [
            {
              organizationId: 'org_optional_stable_id',
              name: 'Optional stable organization name',
              visibleName: 'Street-level society name or rumor label',
              summary: 'Only write what the player identity can reasonably know.',
              knownScope: 'local street-level influence',
              confidence: 'medium',
              visibility: {
                police: 'rumor',
                gang_member: 'known',
                civilian: 'hidden'
              },
              relatedActorIds: [],
              relatedPlaceIds: [],
              relatedCaseIds: []
            }
          ],
          keyPlaces: [],
          relatedPeople: [],
          relationClues: [],
          actionRisks: [],
          suggestedActions: [],
          removeIds: {}
        }
      ],
      actorPatches: [
        {
          actorId: 'npc_stable_id',
          name: '实际输出时生成或复用一个真实中文姓名，不要照抄示例占位文本',
          englishName: '按该中文名、性别和年代生成英文名；不要照抄示例占位文本',
          gender: 'male',
          computedAge: 40,
          currentIdentity: 'civilian',
          publicIdentity: '茶餐厅老板',
          actualIdentitySummary: '旺角街坊熟人，知道一些夜间传闻。',
          roleProfiles: {
            civilian: {
              status: 'active',
              publicOccupation: '茶餐厅老板',
              communitySummary: '熟悉附近街坊、巡警和夜间客人。'
            }
          },
          organizationRelations: [
            {
              organizationId: 'org_stable_id',
              relationType: 'owner',
              roleTitle: '老板',
              departmentOrUnit: '旺角分店',
              summary: '公开经营这间茶餐厅，与附近街坊和巡警都有日常接触。',
              visibility: 'public',
              isPrimary: true
            }
          ],
          positionSummary: '旺角街角茶餐厅老板。',
          profileSummary: '谨慎、熟悉街面消息的中年老板。',
          appearance: '四十岁左右，眼神精明。',
          clothing: '白色短袖衬衫和围裙。',
          equipment: ['账簿', '钥匙串'],
          personality: '谨慎、会看人脸色。',
          speechStyle: '港式街坊口吻，话里常留半句。',
          motivation: '保住生意，避免惹上麻烦。',
          longTermGoal: '让店铺平稳做下去。',
          values: '实用、顾家、重视街坊面子。',
          attributes: {
            body: 40,
            action: 45,
            perception: 65,
            thinking: 55,
            negotiation: 60,
            will: 50
          },
          relationshipSummary: '刚与玩家产生接触，知道玩家是附近警员。',
          attitudeTowardPlayer: '礼貌但戒备。',
          interactionScore: 5,
          trustTendency: '愿意说公开传闻，不会轻易交出敏感人名。',
          entanglementSummary: '可能牵连街坊、人情和社团压力。',
          longTermMemorySummary: '记得附近巡警谁好说话、谁爱找麻烦。',
          recentInteractionMemory: '本回合第一次被玩家询问。',
          statusSummary: '谨慎观察。',
          bodyConditionSummary: '身体正常。',
          currentPlaceId: 'place_current',
          currentSceneId: 'scene_current',
          presence: 'present',
          visibility: 'player_known',
          importance: 50,
          worldpackActorData: {
            hk1988: {
              note: 'worldpack 专用扩展，可省略。'
            }
          }
        }
      ],
      placePatches: [
        {
          placeId: 'place_stable_id',
          name: '地点名',
          nameZh: '中文地点名',
          nameEn: 'English Place Name',
          aliases: ['别名或街坊叫法'],
          regionId: 'region_id',
          districtId: 'district_id',
          type: '地点类型',
          category: 'police / street_life / media_entertainment / runtime_scene_place 等',
          summary: '地点摘要。',
          publicKnowledge: '公开认知。',
          currentState: '当前状态。',
          streetAddressText: '可选街道/片区描述。',
          roadAnchors: ['可选街道名'],
          source: 'runtime_generated',
          canonical: false,
          confidence: 'medium',
          visualAnchor: {
            mapId: 'hk_1988_main',
            x: 0.5,
            y: 0.5,
            precision: 'approximate',
            source: 'runtime_inferred',
            basisPlaceIds: ['place_mong_kok_police_station'],
            note: '根据已知地点和街道语境估算。'
          }
        }
      ],
      scenePatches: [
        {
          sceneId: 'scene_stable_id',
          placeId: 'place_stable_id',
          name: '场景名',
          summary: '场景摘要。',
          temporaryState: '临时状态。',
          presentActorIds: ['player']
        }
      ],
      casePatches: [
        {
          caseId: 'case_stable_id',
          title: '标题',
          caseType: '案件类型',
          status: 'investigating',
          playerRole: 'execute',
          summary: '摘要。',
          currentFocus: '当前需要调查或处理的重点。',
          playerVisibleProgress: '玩家可见的案件进展。',
          officialRecordSummary: '档案/官方口径。',
          publicNarrativeSummary: '街坊/媒体口径。',
          playerKnownSummary: '玩家已知内容。',
          conflictSummary: '核心冲突。',
          relatedActorIds: ['player'],
          relatedPlaceIds: ['place_stable_id'],
          activityLog: [
            {
              kind: 'created',
              summary: '本回合正式建立案件档案。',
              relatedActorIds: ['player'],
              relatedPlaceIds: ['place_stable_id']
            }
          ]
        }
      ],
      organizationPatches: [
          {
            organizationId: 'org_stable_id',
            name: '组织名',
            aliases: ['同一机构已经确认的旧称或简称'],
            type: '组织类型',
          summary: '组织摘要。',
          stanceTowardPlayer: '对玩家态度。',
          pressureSummary: '相关压力。',
          structureTree: [
            {
              nodeId: 'org_stable_id_seat',
              label: '坐馆',
              role: '最高话事层',
              personName: '未知',
              status: '未知',
              confidence: 'unknown',
              summary: '只写玩家当前合理知道的层级事实。',
              children: [
                {
                  nodeId: 'org_stable_id_district_head',
                  label: '地区话事人',
                  role: '地区/生意线负责人',
                  personName: '未知',
                  status: '未知',
                  confidence: 'unknown',
                  children: []
                }
              ]
            }
          ],
          triadState: {
            leadership: {
              phase: 'consultation',
              visibleSummary: '资深人物正在就下一阶段话事安排交换意见。',
              nextMilestone: '三日后再次议事。',
              knownCandidateActorIds: ['actor_existing_candidate'],
              confidence: 'medium'
            },
            activityAreas: [
              {
                placeId: 'place_existing_activity_area',
                statusSummary: '原有看场人手正在调整，尚未形成稳定新安排。',
                pressureSummary: '警方巡查和内部交接同时增加风险。',
                confidence: 'medium'
              }
            ]
          }
        }
      ],
      relationshipThreadPatches: [
        {
          threadId: 'rel_lam_sing',
          kind: 'network',
          title: '湾仔同僚梁伟杰',
          summary: '梁伟杰和玩家共事多次，关系稳定但仍受警署事务和街坊压力影响。',
          relatedActorIds: ['actor_lam_sing'],
          relationshipRole: '同僚',
          creationBasis: 'ongoing_joint_matter',
          evidenceRefs: [
            {
              kind: 'current_turn',
              refId: 'current_turn',
              summary: '本回合明确确认双方继续共同处理一项长期警署事务。'
            }
          ],
          currentPull: '他想请玩家帮忙看一次旧案资料。',
          trustSummary: '愿意提醒玩家避开投诉，但不会替玩家承担纪律风险。',
          nextNaturalBeatHint: '可以通过电话、警署走廊闲谈或街坊转告自然出现。',
          importance: 60,
          visibility: 'player_known'
        }
      ],
      pregnancyRiskPatches:
        pregnancyMode === 'off'
          ? []
          : [
              {
                actorId: 'adult_female_actor_id',
                riskType: 'unprotected',
                summary: '仅在正文明确发生可能导致受孕的成人行为时，客观概括本次风险事件。',
                paternityCandidates: [
                  {
                    actorId: 'player',
                    name: '玩家姓名',
                    visibility: 'player_known'
                  },
                  {
                    actorId: 'other_known_actor_id',
                    name: '同一风险窗口内的另一名已知人物',
                    visibility: 'player_known'
                  }
                ]
              }
            ],
      pregnancyResolutionPatches: [
        {
          actorId: 'adult_female_actor_id',
          outcome: 'pregnancy_confirmed',
          summary: '医院检查已在本回合明确确认妊娠；仅限已有疑似怀孕状态。'
        }
      ],
      currentMatterPatches: [
        {
          id: 'matter_stable_id',
          title: '当前事项标题',
          summary: '当前仍在发酵、可能影响玩家处境的事项。',
          status: 'active',
          priority: 60,
          visibility: 'known',
          source: 'street',
          relatedActorIds: ['player'],
          relatedPlaceIds: ['place_stable_id'],
          relatedCaseIds: [],
          relatedOrganizationIds: []
        }
      ],
      signalPatches: [
        {
          id: 'signal_stable_id',
          title: '风声或传闻标题',
          summary: '未经确认但会影响气氛和人物反应的风声。',
          signalType: 'rumor',
          reliability: 'unknown',
          status: 'active',
          visibility: 'known',
          relatedActorIds: [],
          relatedPlaceIds: ['place_stable_id'],
          relatedCaseIds: [],
          relatedOrganizationIds: []
        }
      ],
      newsIssuePatches: [
        {
          id: 'news_issue_stable_id',
          outletName: '报纸或刊物名',
          headline: '报纸头条或版面主题',
          summary: '本期报纸的整体氛围和重点。',
          read: false,
          articles: [
            {
              id: 'article_stable_id',
              section: 'local',
              headline: '新闻标题',
              body: '新闻正文，优先报道符合日期的香港公共事件、民生、经济、娱乐、国际或治安消息。',
              playerRelated: false,
              relatedActorIds: [],
              relatedPlaceIds: [],
              relatedCaseIds: [],
              relatedOrganizationIds: []
            }
          ]
        }
      ],
      citySituationTrackPatches: [
        {
          operation: 'upsert',
          trackId: 'track_example_mong_kok_nightlife_pressure',
          title: '旺角夜场风声',
          trackType: 'triad_expansion',
          status: 'active',
          pressureLevel: 2,
          visibility: 'rumor',
          cadenceDays: 14,
          summary: '旺角几间夜场之间有基层人马互相试探。',
          currentBeat: '街面只听到看场和收数的风声，还没有确认事实。',
          possibleDevelopments: ['街面信号', '警方投诉', '报馆风闻'],
          relatedPlaceIds: ['place_portland_street'],
          relatedOrganizationIds: [],
          relatedActorIds: [],
          relatedPowerFigureIds: []
        }
      ],
      assetPatch: {
        upsertItems: [
          {
            itemId: 'asset_stable_id',
            category: 'valuable',
            name: '金表',
            summary: '玩家已经收下的一只金表，来源与夜总会老板有关。',
            detail: '这是玩家拥有的物品；灰色往来风险另写灰色账本或后续风险种子，不要用物品分类表达。',
            relatedActorIds: ['npc_stable_id'],
            relatedCaseIds: ['case_stable_id'],
            relatedPlaceIds: ['place_stable_id'],
            evidence: {
              caseId: 'case_stable_id',
              caseTitle: '相关案件标题',
              summary: '这件物品与案件事实、口供或现场线索有关，默认作为有效证据。',
              disputed: false
            },
            visibility: 'player_known',
            importance: 60
          },
          {
            itemId: 'asset_home_stable_id',
            category: 'fixedAsset',
            name: '固定住所或租住房',
            summary: '玩家当前拥有、租住、被分配或可长期使用的固定资产。',
            fixedAssetType: 'residence',
            holdingRelation: 'rented',
            primaryUse: 'home',
            locationSummary: '所在区域、街道或楼宇摘要。',
            ownershipSummary: '产权、租赁、家庭所有或分配关系摘要。',
            accessSummary: '玩家能否进入、是否有钥匙、是否有人同住等摘要。',
            relatedActorIds: ['player'],
            relatedCaseIds: [],
            relatedPlaceIds: ['place_stable_id'],
            visibility: 'player_known',
            importance: 70
          },
          {
            itemId: 'asset_vehicle_stable_id',
            category: 'vehicle',
            name: '交通工具名称',
            summary: '玩家拥有、借用、分配或可使用的交通工具。',
            vehicleType: 'motorcycle',
            holdingRelation: 'owned',
            condition: 'usable',
            locationSummary: '通常停放或可取得的位置摘要。',
            accessSummary: '玩家能否随时使用、是否有钥匙或需他人同意。',
            mobilityProfile: {
              mode: 'motorcycle',
              timeMultiplier: 0.7,
              availabilitySummary: '适合短中距离移动，但受天气、拥堵和警方盘查影响。'
            },
            relatedActorIds: ['player'],
            relatedCaseIds: [],
            relatedPlaceIds: [],
            visibility: 'player_known',
            importance: 55
          }
        ],
        removeItems: [
          {
            itemId: 'asset_stable_id',
            reason: '物品已被正式移交到某案件或剧情中失去。',
            movedToCaseId: 'case_stable_id'
          }
        ],
        equippedItemIds: []
      },
      judgementCheckPatches: localJudgementInput?.resolution
        ? [localJudgementInput.resolution.canonicalCheck]
        : localJudgementInput?.preflightReason
          ? []
          : [
              {
                rulesetVersion: 'v1.1-local-d100',
                checkId: 'check_stable_id',
                turnId: 'turn_current',
                gameTime: {
                  year: 1988,
                  month: 9,
                  day: 12,
                  hour: 21,
                  minute: 30
                },
                title: '后巷近身压制',
                category: 'melee',
                targetSummary: '玩家试图在后巷压制持刀嫌疑人。',
                relatedActorIds: ['player', 'npc_suspect_id'],
                relatedPlaceIds: ['place_stable_id'],
                relatedCaseIds: ['case_stable_id'],
                primaryAttribute: 'action',
                secondaryAttribute: 'body',
                difficultyTier: 'hard',
                presetRoll: localJudgement.presetRoll,
                effectiveTarget: exampleJudgementCalculation.effectiveTarget,
                outcome: exampleJudgementOutcome,
                shortSummary: `本地判定结果为 ${exampleJudgementOutcome}；实际正文必须按该结果写行动转折。`,
                consequenceSummary: '按本地结果写清嫌疑人、玩家体力与现场局面的真实后果。',
                factors: exampleJudgementFactors,
                visibility: 'player_known'
              }
            ],
      combatEventPatches:
        localJudgementInput?.preflightReason &&
        (!localJudgementInput.resolution ||
          localJudgementInput.resolution.combatIntent === 'none')
          ? []
          : [
        {
          combatId: 'combat_stable_id',
          turnId: 'turn_current',
          gameTime: {
            year: 1988,
            month: 9,
            day: 12,
            hour: 21,
            minute: 30
          },
          title: '旺角后巷持刀拘捕',
          type: 'armed',
          locationId: 'place_stable_id',
          locationSummary: '旺角后巷',
          participants: [
            {
              actorId: 'player',
              name: '玩家',
              side: 'player',
              roleSummary: '巡逻警员'
            },
            {
              actorId: 'npc_suspect_id',
              name: '嫌疑人姓名或稳定称呼',
              side: 'opponent',
              roleSummary: '持刀逃跑者',
              conditionAfter: exampleCombatPresentation.conditionAfter
            }
          ],
          outcome: exampleCombatPresentation.outcome,
          intensity: 70,
          animationKey: 'armed_alley',
          combatText: exampleCombatPresentation.combatText,
          resultSummary: exampleCombatPresentation.resultSummary,
          consequenceSummary: exampleCombatPresentation.consequenceSummary,
          judgementCheckIds: [
            localJudgementInput?.resolution?.checkId ?? 'check_stable_id'
          ],
          relatedActorIds: ['player', 'npc_suspect_id'],
          relatedPlaceIds: ['place_stable_id'],
          relatedCaseIds: ['case_stable_id'],
          visibility: 'player_known',
          unread: true,
          createdAt: {
            year: 1988,
            month: 9,
            day: 12,
            hour: 21,
            minute: 30
          }
        }
      ],
      memories: [
        {
          text: '需要长期记住的事实、传闻或口径。',
          kind: 'world',
          importance: 50,
          visibility: 'player_known',
          certainty: 'claim'
        }
      ],
      actorMemories: [
        {
          actorId: 'npc_stable_id',
          actorName: '可选，用于辅助匹配既有人物。',
          text: '某个角色需要记住的互动。',
          visibility: 'player_known'
        }
      ],
      traitProgress: [],
      traitGains: []
    }
  };
  if (!dramaPlanningContext) return example;
  const planId = dramaPlan?.planId ?? `drama_plan_turn_${dramaPlanningContext.turnCounter}`;
  return {
    ...example,
    ...(dramaPlan
      ? {}
      : {
          dramaPlan: {
            planId,
            planningScope: 'turn',
            mode: 'quiet',
            primarySource: null,
            supportSources: [],
            sceneFunction: 'rest',
            intensity: 'none',
            playerMayIgnore: true,
            maxNewActors: 0,
            reasonSummary: '本回合不需要额外突出候选素材。'
          }
        }),
    dramaExecutionTrace: {
      planId,
      status: 'not_used',
      usedSourceRefs: [],
      resultingWritebackRefs: [],
      customEventProgress: [],
      narrativeArcProgress: []
    }
  };
}

export function composePrompt(context: PromptContext, playerInput: string, options: ComposePromptOptions = {}): string {
  const narrativeLengthProfile = getNarrativeLengthProfile(options.narrativeLengthLevel);
  const pregnancyMode = options.pregnancyMode ?? 'standard';
  const pregnancyModeLabel: Record<PregnancyMode, string> = {
    off: '关闭（不得新增受孕风险；已有孕期仍按日期推进）',
    low: '低概率',
    standard: '标准概率',
    high: '高概率'
  };
  const promptSettings = options.promptSettings;
  const coreRules = resolvePromptText('turn.coreRules', promptSettings);
  const narrativeGuide = createNarrativeStyleAndDisplayGuide(
    narrativeLengthProfile.level,
    promptSettings,
    options.playerPortrayalMode
  );
  const playerActor = context.presentActors.find((actor) => actor.actorId === 'player');
  const narrativePerspectiveGuide = createNarrativePerspectiveGuide(options.narrativePerspective, {
    playerName: playerActor?.name,
    playerGender: playerActor?.gender
  });
  const playerPortrayalGuide = createPlayerPortrayalGuide(options.playerPortrayalMode);
  const playerControlOutputRule = createPlayerControlOutputRule(options.playerPortrayalMode);
  const playerActionLock = createPlayerActionLock(playerInput, options.playerPortrayalMode);
  const narrativeLanguageGuide = createNarrativeLanguageGuide(options.locale);
  const cantoneseFlavorProfile = getCantoneseFlavorProfile(context.cantoneseFlavor);
  const adultRelationshipGuide = createAdultRelationshipStyleGuide(promptSettings);
  const actors = context.actorPackets.map(formatActorPacket).join('\n\n');
  const explicitActorReferences = formatExplicitActorReferenceProjection(context);
  const npcMemories = formatNpcMemoryProjection(context);
  const timeReference = formatTimeReferenceProjection(context);
  const recentStory = formatRecentStoryProjection(context);
  const storyVector = formatStoryVectorProjection(context);
  const vectorMemories = formatVectorMemoryProjection(context);
  const memories = formatMemoryLayerProjection(context);
  const pressures = formatList(
    context.pressures.map(
      (pressure) =>
        `- ${pressure.summary}；允许使用：${pressure.allowedUses.join('；') || '无'}；禁止使用：${pressure.forbiddenUses.join('；') || '无'}`
    )
  );
  const cases = formatList(context.relevantCases.map((caseFile) => `- ${caseFile.title}：${caseFile.summary}`));
  const assets = [formatCaseProjection(context), formatDeferredProjection(context), formatAssetProjection(context)].join('\n\n');
  const finance = formatFinanceProjection(context.financeProjection);
  const reputation = formatReputationProjection(context);
  const institution = formatInstitutionProjection(context);
  const livelihood = formatLivelihoodProjection(context);
  const cityPower = formatCityPowerProjection(context);
  const citySituationTracks = formatCitySituationTrackProjection(context);
  const relationship = formatRelationshipProjection(context);
  const dynamic = formatDynamicProjection(context);
  const recentCompletedFacts = formatRecentCompletedFactProjection(context);
  const eraSeedFigures = formatEraSeedFigureProjection(context);
  const screenCharacters = formatScreenCharacterSeedProjection(context);
  const storypack = formatStorypackProjection(context);
  const dramaOrchestration =
    options.dramaPlanningContext && options.dramaPlan && options.foregroundContract
    ? formatDramaExecutionPrompt({
        context,
        planningContext: options.dramaPlanningContext,
        plan: options.dramaPlan,
        contract: options.foregroundContract
      })
    : '';
  const presentActorReactions = formatPresentActorReactionProjection(context);
  const remoteNpcPresence = formatRemoteNpcPresenceProjection(context);
  const backgroundEvolution = formatBackgroundEvolutionProjection(context);
  const auxiliaryNpcSimulation = options.npcSimulationPackage
    ? formatNpcSimulationPackageForPrompt(options.npcSimulationPackage)
    : '';
  const conflict = formatConflictProjection(context);
  const weather = formatWeatherProjection(context);
  const policePanel = formatPolicePanelProjection(context);
  const policePromotionDlcBound = Boolean(
    context.officialDlcBindings?.some((binding) => binding.dlcId === POLICE_PROMOTION_DLC_ID)
  );
  const focusedPosting = context.policeProjection.postingOpportunities[0];
  const postingExampleNextStage = focusedPosting
    ? {
        not_selected: 'interested',
        interested: 'eligible',
        eligible: 'training',
        training: 'awaiting_vacancy',
        awaiting_vacancy: 'approved_waiting_report',
        approved_waiting_report: 'effective'
      }[focusedPosting.currentStage ?? 'not_selected']
    : undefined;
  const policePostingExample =
    focusedPosting && postingExampleNextStage
      ? {
          routeId: focusedPosting.routeId,
          requestedStage: postingExampleNextStage as
            | 'interested'
            | 'eligible'
            | 'training'
            | 'awaiting_vacancy'
            | 'approved_waiting_report'
            | 'effective'
        }
      : undefined;
  const policeDuty = formatPoliceDutyProjection(context);
  const grayNetwork = formatGrayNetworkProjection(context);
  const identityContext = formatIdentityContextProjection(context);
  const triadMembership = formatTriadMembershipProjection(context);
  const civilianTransitionGuidance = formatCivilianTransitionGuidance(context);
  const exampleJson = JSON.stringify(
    createTurnResponseExample(
      pregnancyMode,
      options.dramaPlanningContext,
      options.dramaPlan,
      options.localJudgement,
      policePromotionDlcBound,
      policePostingExample
    ),
    null,
    2
  );
  const currentScenario = hk1980sOpeningScenarios.find((scenario) => scenario.time.year === context.currentTime.year);

  return [
    section(
      '核心规则',
      coreRules
    ),
    section(
      '世界',
      `时代: ${context.currentTime.year} 年香港语境\n当前剧本: ${currentScenario?.title ?? `${context.currentTime.year} 香港城市生活`}\n时间: ${context.timeLabel}`
    ),
    section(
      '当前日期可用的香港历史新闻事实锚点',
      `${formatHistoricalHongKongNewsAnchorsForPrompt(context.currentTime)}\n这些是事实背景而非逐字历史标题；不得提前使用当前日期之后的事件，也不得把玩家私人行动混入这些事实。`
    ),
    section('时间参照框架', timeReference),
    section('警务值班节奏', policeDuty),
    section('开局节奏延续', formatOpeningPacingProjection(context)),
    section('1980s 香港警队职级资料库', hk1980sPoliceRankKnowledge),
    section('香港警队行动单位资料库', hk1980sPoliceOperationalUnitKnowledge),
    section('香港社团行为逻辑', hk1980sTriadBehaviorKnowledge),
    section('玩家', `${context.playerSummary}\n执法身份: ${context.lawIdentitySummary || '无'}`),
    section(
      '本局粤语风味',
      `当前等级：${cantoneseFlavorProfile.label}\n后续正文要求：${cantoneseFlavorProfile.promptGuide}\n这是当前存档的有效设置；只影响本回合及之后新生成的正文，不得据此改写既有剧情事实。`
    ),
    ...(options.localJudgement
      ? [section('本回合本地判定合同', formatLocalJudgementContract(options.localJudgement))]
      : []),
    section('IDENTITY_CONTEXT', identityContext),
    ...(triadMembership ? [section('社团成员责任上下文', triadMembership)] : []),
    ...(civilianTransitionGuidance ? [section('市民身份入口', civilianTransitionGuidance)] : []),
    section(
      '地点',
      `${context.currentPlace?.name ?? '未知地点'} / ${context.currentScene?.name ?? '无具体场景'}\n${context.currentScene?.summary ?? context.currentPlace?.summary ?? ''}\n\n${formatMapProjection(context)}`
    ),
    section('天气', weather),
    section(
      '怀孕机制',
      `当前档位: ${pregnancyModeLabel[pregnancyMode]}\n规则: 模型只报告正文中确实发生的风险事件或明确结局；本地引擎独占概率、验孕、孕期和分娩日期真值。`
    ),
    section('在场 Actor', actors || '- 无'),
    section('玩家点名人物身份锚点', explicitActorReferences),
    section('NPC 记忆投影', npcMemories),
    section('在场 NPC 反应候选', presentActorReactions),
    section('相关案件', cases),
    ...(options.caseActionIntents?.length
      ? [section('案件面板行动合同', formatCaseActionIntentsForPrompt(options.caseActionIntents))]
      : []),
    section('相关物品与资产', assets),
    section('金钱与收支', finance),
    section('声誉与口碑投影', reputation),
    ...(livelihood ? [section('市民职业与营生投影', livelihood)] : []),
    section('社会机构投影', institution),
    section('城市权力锚点投影', cityPower),
    section('城市局势后台轨道投影', citySituationTracks),
    section('人脉与缘份投影', relationship),
    ...(!options.dramaPlanningContext
      ? [
          section('影视角色种子资料库', screenCharacters),
          section('时代种子人物资料库', eraSeedFigures),
          section('Storypack 投影', storypack)
        ]
      : []),
    ...(dramaOrchestration ? [section('戏剧化前台编排', dramaOrchestration)] : []),
    section('DYNAMIC_CONTEXT', dynamic),
    section('远场演化既有事实', backgroundEvolution),
    section('远场 NPC 存在感候选', remoteNpcPresence),
    ...(auxiliaryNpcSimulation ? [section('独立 NPC 动态模拟建议', auxiliaryNpcSimulation)] : []),
    section('对抗与判定投影', conflict),
    section('警队面板投影', policePanel),
    section('社团与灰色网络投影', grayNetwork),
    section('压力种子', pressures),
    section('近期剧情原文', recentStory),
    section('过往正文向量回捞', storyVector),
    section('通用事实向量记忆', vectorMemories),
    section('相关记忆', memories),
    section('玩家可见输出语言', narrativeLanguageGuide),
    section('正文风格与显示格式', narrativeGuide),
    section('正文叙事人称', narrativePerspectiveGuide),
    section('正文演绎风格', playerPortrayalGuide),
    section(
      '输出原则',
      [
        '返回一个合法 JSON object，不要 Markdown，不要代码块，不要额外解释。',
        '正文优先：先完整写 narrativeText，再写结构化 JSON；不要因为 JSON 写回字段很多而压缩正文。',
        '可选 presentationHints 只提供轻量演出语义：dialogueEmotions 按 narrativeText 中 dialogue 的出现顺序逐项填写，innerMonologueEmotions 按【内心】段落顺序填写；只使用 neutral/happy/excited/ecstatic/sad/angry/surprised/serious/worried/afraid/embarrassed/shy/tired/thinking/secretive，不复制正文、角色名或 actorId。漏项不会阻止回合。',
        playerControlOutputRule,
        'narrativeText 结尾必须停在具体现场状态、人物动作、对方反应、局面后果或可继续互动的事实上；禁止用第二人称选择题或征询句收尾，尤其不要以“你是打算……还是……？”“是否……？”“要不要……？”“还是……？”结尾。可选行动只写 suggestedActions。',
        '每个成功回合必须生成 2-4 个非空 suggestedActions；每项都要承接本回合正文终态，彼此有实际差异，并把下一步决定留给玩家。不得留空、复用上一回合选项，或建议重复已经完成的动作。',
        'suggestedActions 必须服从结构化事实终态；不得把 RECENT_COMPLETED_FACTS 中已经完成、签署、交付、解决或结束的同一事项重新建议为待办。',
        '每回合必须写 turnSummary：用 1-3 句中文事实摘要记录玩家已完成事项、NPC/机构知情、状态变化和已形成的后续钩子。只写已经发生的事实和结果，不复述文风，不制造悬念，不写工程词，不使用“可能、似乎、准备”等未落实表述。',
        'turnSummary 是本回合唯一的主角短期记忆来源；不要再把同一回合摘要写入 writeback.memories。writeback.memories 只用于 world/case/place/player 等独立事实，NPC 个人记忆只写 actorMemories。',
        '如果本回合确认投稿、报案、交付、换装、付款、拘捕、提交证据、完成谈话或离开地点等已完成事实，turnSummary 必须明确写“已经/已/完成/交付/提交/离开”等完成状态，后续不得再把同一动作写成待办。',
        `篇幅硬合同：常规回合 narrativeText 目标 ${narrativeLengthProfile.turnTarget} 个中文字符且不得少于 ${narrativeLengthProfile.turnMinimum} 个中文字符；复杂回合目标 ${narrativeLengthProfile.complexTurnTarget} 个中文字符。简单、等待、文书和过渡回合也不得自行降档。围绕同一事务纵向展开有效行动过程、NPC 回应与对白、信息交换、现实限制和直接后果，不设固定段落数；禁止重复同一反应、换词复述、堆环境细节或新造无关钩子凑长度。`,
        '只写本回合明确产生或需要更新的结构化字段；未变化的模块可以省略或留空数组。',
        'policeRoleProfilePatch 与 civilianRoleProfilePatch 是条件式可选模块：没有已经生效的警队岗位或市民职业变化时，必须省略整个字段，禁止输出 null、空对象或由 null、空字符串、空数组组成的占位对象。正式警队岗位变化的最小完整格式为 policeRoleProfilePatch={"reason":"正式变化依据","stationOrPost":"完整驻点","department":"完整部门","assignmentSummary":"已生效职责"}；正式市民职业变化至少写 civilianRoleProfilePatch={"reason":"正式变化依据","publicOccupation":"已生效职业"}，需要清除已存在字段时才在有非空 reason 的真实变更中写 null。',
        '不要通过正文暗示状态变化；正文不是写回来源。',
        policePromotionDlcBound
          ? '本存档已绑定结构化警队晋升系统。禁止直接写 playerPatch.policePanel.careerPath.currentRank 或同身份 identityContextPatch 改警衔；晋升只可按 promotionProgram 的 routeId、当前 stage 与 lawfulNext 推进，调动只可使用当前 postingProgram 或本回合投影出的 postingOpportunity 稳定 routeId，每回合最多推进一个合法阶段。玩家明确向既有警队联系人询问唯一投影路线且本回合确已完成该询问时，必须用 requestedStage=interested、events=[]记录调动意向；这不代表已具备资格。考试、课程、训练、资格、推荐、遴选、名额、空缺、任命和报到都必须作为本回合实际发生且符合 evidenceContracts 的结构化 event 提交；正文口头称赞、玩家要求、关系好感和未应用写回不算正式证据。'
          : '警察玩家的正式晋升、降职、复职或职级纠正确已生效时，必须写 playerPatch.policePanel.careerPath.currentRank，并使用完整的新职级名称；同一警察身份内的职级变化不是身份转换，禁止为此写 identityContextPatch。仅获推荐、候选、面试、署任讨论或等待任命时不得更新 currentRank。',
        policePromotionDlcBound
          ? '结构化晋升或调动只有在程序进入 appointed/effective 且本回合正式生效时才可同时写 policeRoleProfilePatch，完整重写 stationOrPost、department、assignmentSummary、dutySummary 和 reason；本地会原子核对警衔、部门与岗位，并据已生效岗位重算值班。申请、候选、训练、等待空缺、口头调令、临时支援或尚未报到时不得提前改档；横向调动和 PTU 轮调不得改变正式警衔。'
          : '玩家仍是 police、但同一警察身份内正式调往新警署、部门或行动单位，或新岗位已经生效时，必须写 policeRoleProfilePatch，完整重写 stationOrPost、department、assignmentSummary 和 reason；不要只改 playerPatch.policePanel.unitSummary，也不要写 identityContextPatch。口头申请、等待调令、临时支援或尚未报到时不得提前更新。',
        '电话报案、上级派警、电台通报、线人报料、场方/住户/店主求助或投诉等“事件来源”一旦写进正文，必须写入 currentMatterPatches.summary/currentHook、casePatches.activityLog 或 memories；后续相关报案人、场方、店方不能完全忘记自己/本方曾经报过警，只能对报警目的、范围或后果改口。',
        'currentMatterPatches.status 必须明确表达事项生命周期：仍在发展写 active；暂时安静、等待材料、等待通知、移交他人但仍可能发展写 dormant；真正结束且无实质后续写 resolved；仅在需要保留历史记录时写 archived。不要用“初步闭环、暂时解除、告一段落、暂无后续”等正文措辞代替结构化 status。',
        'currentMatterPatches.visibility 只能写 known 或 hidden：玩家当前已知事项写 known，尚未进入玩家认知的信息写 hidden；不要使用其他模块的 player_known/public/private 枚举。',
        '社团成员的组织责任继续使用 currentMatterPatches：matterKind="social"、source="triad_responsibility"，relatedActorIds 必须包含实际交代人，relatedOrganizationIds 必须包含所属社团。责任必须由既有直属上线或本回合已创建的稳定 Actor 在正文中真实交代；后台组织演化不能隔空给玩家刷任务。',
        '市民的职业事项使用 currentMatterPatches：matterKind="livelihood"。机构整体方向不等于玩家自动接到工作；只有既有人物、本回合创建的稳定 Actor、工作通知、现场安排或已确立雇佣事实把具体事情带到玩家面前，才可创建营生事项。相关人物与雇主必须使用稳定 actorId / organizationId。',
        '同一社团同一阶段原则上只保留一项主要 active 组织责任；推进时复用原 id 更新 summary/currentHook/status。完成、拒绝、敷衍或失败都可以形成真实结果并写 resolved；等待、拖延或暂时搁置写 dormant。不要用经验值、忠诚度百分比或自动加减数值代替人物与组织的具体反馈。',
        '组织责任产生持续影响时，按事实更新交代人/同组人物的 relationshipSummary、attitudeTowardPlayer、trustTendency、entanglementSummary，并只在未来行为确实会承接时写 actorMemories；社团整体观感或压力确实改变时才写 organizationPatches，街坊、警队、商业等圈层评价确实传播时才写 reputation。',
        '案件面板只写正式或准正式案件：已有案号/报告/口供/证据、上级交办、严重伤害或重大财损、拘捕、社团有组织犯罪、ICAC/检控/媒体风险，或明显需要多回合调查。普通巡逻求助、轻微滋扰、噪音投诉、店主/住户求助和现场调停写 currentMatterPatches 或 memories，不要写 casePatches。',
        'casePatches 必须使用稳定 caseId。新案件至少写 title、caseType、status、playerRole、summary、currentFocus 和 activityLog；既有案件有新证据、调查进展、移交、控告、审理或归档时，复用原 caseId 更新 status/currentFocus/playerVisibleProgress/activityLog。status 只能是 intake/investigating/submitted_to_prosecutions/prosecution_review/charged/court_scheduled/tried/sentenced/returned/archived/cold；playerRole 只能是 lead/assist/execute/involved/aware。禁止使用 playerAccessLevel。',
        '已移交 CID/反黑/重案/检控或由其他单位主办的案件，如果玩家只是证人、报案人、现场参与者或知情者，写 playerRole=aware/involved；这类是相关案件，不要当作玩家当前任务反复推动。只有玩家主动追问、收到正式通知或案件进展确实牵动玩家时才带回正文。',
        'timePatch 是唯一时间来源：短动作写 elapsedMinutes；跨日、跨周、轮值、等待、养伤、旅行或任何正文明确跳到具体日期/时刻时，必须写 targetTime={year,month,day,hour,minute}。targetTime 不得早于当前时间；如果 elapsedMinutes 与 targetTime 同时存在，以 targetTime 为准。',
        '新人物必须用 actorPatches 创建。actorId 必须稳定、可复用。',
        '既有 Actor 可以只写变化字段；新 Actor 创建必须完整，至少包含姓名、性别、年龄、当前身份、公开身份、实际身份摘要、角色定位、人物简介、外貌、衣着、性格、说话风格、动机、长期目标、价值观、六维、与玩家关系、态度、往来度、信任/戒备、牵连、长期记忆、最近记忆、当前状态、在场状态、可见性和重要度。',
        'NPC 在 narrativeText 中明确进入、离开、换到另一房间，或只通过隔门、电话、电台发声时，必须至少同步更新对应 actorPatches.presence；已知新地点/场景时再更新 currentPlaceId/currentSceneId，并按需更新 scenePatches.presentActorIds。既有远场、absent 或 mentioned 人物进入当前现场并写 presence=present 时，必须同时提供与玩家当前结构化地点一致的 currentPlaceId 或 currentSceneId，不能只靠 present 标签把远场人物搬进镜头。presence=present 只用于与玩家处在同一可见场景，nearby 用于同一地点但不在同一镜头，mentioned 用于已经离开当前现场。禁止只在 statusSummary/recentInteractionMemory 写“离开”却让旧 presentActorIds 保留。',
        '往来度 interactionScore 只能是 0-100 的整数，表示已经形成的接触深度/牵连程度，不代表喜欢或讨厌。既有 Actor 只在本回合形成新的持续接触或牵连时上调，不得重新估低或降低；仇恨、敌意、疏远、戒备、恐惧写入 attitudeTowardPlayer、relationshipSummary、trustTendency 或 entanglementSummary，不能用降低往来度表达。',
        '新普通 NPC 的 name 必须是可长期绑定身份的完整姓名，不能只写“阿强”“红姑”“肥仔森”、单个英文名或职业称呼；外号、花名和日常称呼写入 callName/aliases。',
        '如果本回合只知道外号但该人物已经重要到必须建档，请按时代、身份和场景生成合理完整姓名，同时把原外号保留在 callName/aliases；不要照抄固定示例姓名。',
        '既有 NPC 后来确认真实姓名、英文名或身份证姓名时，必须复用原 actorId 更新 actorPatches；旧称呼写入 aliases/callName，不要另建新 Actor。',
        '不要因为两个人同名、同姓或共享“阿强、阿红、肥仔”等外号就判定为同一人；只有明确身份揭示、连续场景证据或既有 actorId 能证明同一身份时才合并。',
        '缺少性别或年龄时不要创建新 Actor；可以先把对方作为传闻、线索、组织成员描述或场景压力写入 memories/casePatches/organizationPatches。',
        '不要用“某人的手下/纹身男人/可疑男子”等临时描述凑 name；尚不足以建立稳定身份时不要创建 Actor 档案。',
        '输出 JSON 示例只是字段结构示例；示例里的说明性占位文本必须在实际输出中替换为具体内容，普通 NPC 姓名必须由本回合按时代、身份和场景生成或复用既有 actorId，不要照抄任何示例姓名或占位文字。',
        '普通 NPC 不要写 vitalsPatch，不要生成生命/体力数值；身体情况用 statusSummary/bodyConditionSummary。',
        '每回合必须返回顶层 playerVitalsReview={"changed":true|false,"reason":"本回合玩家身体状态是否变化的事实依据"}；它只复核玩家，不复核 NPC。',
        'playerVitalsReview.changed=false 时，不得为了气氛虚构玩家生命、体力或身体状态变化；changed=true 时，必须同时写 actorPatches 中 actorId=player 的 vitalsPatch，不能只在正文或 reason 中描述变化。vitalsPatch 写 conditionSummary 时必须同时写 conditionPersistence，且只允许 stable|transient|persistent|unknown。',
        '生命/体力是稀疏的游戏状态，不是逐回合代谢模拟。只有本回合已明确形成、会影响后续行动的实际消耗、伤势、恢复或身体状况变化，playerVitalsReview.changed 才能为 true。',
        '环境闷热、微汗、保持坐姿、普通文书、交谈、等待、情绪紧张、日常站立或短距离走动，默认 changed=false；不得凭环境、姿势或“人总会疲劳”推导微量扣点，也不得为凑 conditionSummary 发明不适。',
        '追逐、奔跑、搏斗、受伤、长时间体力劳动、熬夜、睡眠、休息或治疗只是需要结合本回合实际结果复核的情境，不代表必然变化；changed=true 时 healthDelta/staminaDelta 至少一项应有非零变化，或存在需要延续到下一回合的明确身体状况。短期疲劳/宿醉用 transient，伤病尚未恢复用 persistent，正常稳定状态用 stable，无法判断才用 unknown。',
        '玩家当前身份、公开身份、实际身份摘要或跨身份 roleProfiles 发生变化时，必须只写 writeback.identityContextPatch，完整提供 transitionId/kind/fromIdentity/toIdentity/publicIdentity/reason/targetRoleProfile/secretFactPatches；不要用 actorPatches 修改这些字段。目标身份切换为 police 时可提供 policeNumber（只能是四位数字）；当前没有警号且未提供时，由系统确定性分配，并原子同步到 Player 与 Actor。',
        'identityContextPatch.kind 只能使用 join / leave / cover_enter / cover_exit / exposure / correction：普通市民加入警队或社团用 join，进入卧底公开身份用 cover_enter，卧底任务确已结束并恢复原真实身份时用 cover_exit；禁止输出 status_change。transitionId 必须是本次转换独有且稳定的非空字符串。targetRoleProfile 必须严格写成 {"identity":"police|gang_member|civilian","profile":{...}}，identity 必须等于 toIdentity；禁止写成 {"police":{...}}、{"triad":{...}} 或 {"civilian":{...}}。targetRoleProfile.profile 必须使用规范字段：社团用 organizationId/societyName/roleTitle/rankSummary/territorySummary/patronActorIds/peerActorIds/rivalActorIds/coverIdentitySummary/obligationSummary/riskSummary，警队用 agencyId/stationOrPost/department/rank/assignmentSummary/postRole/authoritySummary/accessSummary/dutySummary。',
        'identityContextPatch.secretFactPatches 只允许 {"operation":"upsert","fact":{"secretId":"...","ownerType":"player","ownerId":"player","kind":"identity|loyalty|relationship|risk|control|other","summary":"...","playerCharacterKnown":true|false,"publicKnown":true|false,"knownByActorIds":[],"revealState":"hidden|known_to_player_character|known_to_some_actors|publicly_revealed","revealConditions":[],"visibility":"hidden|player_known|public","importance":0-100}} 或 {"operation":"remove","secretId":"..."}；禁止使用 add/factId/factType/description 这类别名结构。',
        `身份没有真正改变时通常不得输出 identityContextPatch。唯一例外：社团玩家的正式职务、层级、活动区域或直属关系已由剧情明确生效时，允许写 kind="correction" 且 fromIdentity=toIdentity="gang_member"，完整重写 targetRoleProfile；普通交代、好感变化、口头赏识、候选或尚未生效的提拔不得使用。${policePromotionDlcBound ? '绑定结构化晋升系统后，警察同身份职级与岗位程序只写 policeCareerProgressPatch，正式调动/任命生效时再配套 policeRoleProfilePatch；禁止同身份 correction。' : '警察同身份职级变化只写 policePanel.careerPath.currentRank；警察同身份单位/岗位调动写 policeRoleProfilePatch。'}卧底不是第四种 currentIdentity：警察卧底社团写 toIdentity=gang_member，社团人员卧底警队写 toIdentity=police；真实效忠与知情边界写 secretFactPatches。`,
        '卧底任务结束不是 leave 或新建身份：必须写 kind="cover_exit"，fromIdentity=当前卧底公开身份，toIdentity=进入卧底前保存的真实身份。警察从社团掩护返回 police，社团成员从警察掩护返回 gang_member；本地会恢复原 roleProfile、界面和该身份已暂停的固定收支，并暂停掩护身份绑定的收支。',
        '身份转换的正文如果明确发生换装，必须同步写 playerPatch.clothing；领取或更换当前随身装备时，必须用 assetPatch.upsertItems 建立或更新真实物品，并用 assetPatch.equippedItemIds 引用这些稳定 itemId。不得只在 narrativeText 或 playerPatch.equipment 自由文本里写领装。',
        '新增或更新秘密事实但不切换玩家身份时，写 writeback.secretFactPatches；不得只把秘密写进 narrativeText、memories、actualIdentitySummary 或 hidden roleProfiles。',
        '地点不要漂移：同一个地点必须复用既有 placeId；新地点只有在以后可复用时才写 placePatches，临时角落/一次性镜头不要创建地点。',
        '玩家当前位置或当前场景发生变化时，必须写 writeback.locationPatch.currentPlaceId/currentSceneId；不要只在正文里写“前往、回到、抵达”。currentSceneId 只在已有或本回合 scenePatches 创建的场景可用时写。',
        '时代不要穿帮：真实影视剧、歌曲、新闻、公共事件和人物公开活动必须服从当前游戏时间；不得把当前游戏时间之后才出现的真实影视剧、歌曲、新闻或公共事件写成已经发生、正在播出或正在流行。不确定年份时使用架空标题或模糊时代氛围，不要点名未来作品。',
        '新增 placePatches 必须尽量写 name/nameZh/nameEn/aliases/regionId/districtId/type/category/summary/publicKnowledge/currentState/source/canonical/confidence；能根据已知地点估计坐标时写 visualAnchor。',
        '只有 player 或未来明确拥有 vitals 的 Actor 才能写 vitalsPatch。',
        '普通 NPC 的 roleProfiles 按身份需要填写；警察写 police，社团人物写 triad，普通市民写 civilian。玩家跨身份的 roleProfiles 只能通过 identityContextPatch 更新；当前公开身份仍为 police 时，正式调署、调部门、调行动单位或转岗位必须写 policeRoleProfilePatch；当前公开身份仍为 civilian 时，辞职、入职、失业、升职、转部门、换工作地点或转为自营必须写 civilianRoleProfilePatch。两者都不得伪装成身份转换。卧底/双重身份的真实侧必须配套 SecretFact 知情边界。',
        'civilianRoleProfilePatch 只在职业变化已经由正文和结构化事实明确生效时写；面试、打听、邀请、候选和口头设想不得提前改档。employerOrganizationId、workplacePlaceId、livelihoodActorIds 只能引用已有或本回合已创建的稳定 ID；清除雇主、地点、单位或摘要时显式写 null。正式固定工作的建立、暂停或结束还必须同步 financePatch 中对应的 recurring cashflow。',
        '声誉/口碑只在社会评价确实变化时写入 playerPatch.reputation；不要每回合自动增加知名度，也不要把普通互动都写成声誉变化。',
        '整体知名度 notoriety 与圈层知名度 visibility 的范围都是 0-1000，只代表传播度；整体口碑 overallReputation 与圈层口碑 standing 的范围都是 -100 到 100，代表评价倾向。',
        '整体口碑由本地根据各圈层 standing 与 visibility 确定性综合；不要输出 overallReputationDelta 或 overallReputationSet。你只负责写实际发生变化的 notoriety 与 circlePatches，并必须给 summary 和 reason。',
        '圈层只使用 police、neighborhoodMedia、entertainment、triad、business、politics。旧的 localPublic/mediaPublic/underworld/political/oversight 会被兼容归一，但新输出不要再使用。',
        'newsIssuePatches 只承接已经成为公共信息的新闻事实。普通玩家的买车买楼、购物、搬家、恋爱、用餐、转职、日常执勤、普通办案步骤和一般社交都没有新闻价值，不得写入报纸。',
        '报纸应以当时香港与世界的公共新闻为主体，包括政策、交通、劳工民生、金融地产、娱乐、国际和重大治安消息；不要把每期报纸写成玩家行动摘要或犯罪简报。',
        '玩家尚非公众人物时，即使其参与已公开重大案件，报道也应使用匿名职业身份，不得写玩家姓名或关联 player actorId；只有结构化声誉达到区域知名以上，才允许直接以玩家为报道对象。',
        '女性 NPC 必须写 femaleProfile；femaleProfile 是女性 NPC 的扩展档案，只在 gender 为 female 时写入；它不能替代姓名、性别、年龄、身份、关系和记忆等基础字段。',
        'adultPrivateProfile 只允许写给已确认成年的女性 NPC：必须能从 birthDate 或 computedAge 判断当前年龄 >= 18；不确定或未成年时省略 adultPrivateProfile，只保留普通 femaleProfile。',
        '成年女性、首次见面或普通人物建档本身都不是生成香闺秘档的理由。只有当前结构化关系与本回合事件已经形成可长期承接的亲密边界、成人偏好或身体事实时，才写 adultPrivateProfile；没有可靠事实就完全省略，不得猜测或套用通用模板。',
        'adultPrivateProfile 允许逐步建立：只写本回合新确认或确实变化的字段，资料尚未齐全时 profileStatus 用 developing；只有 womb、胸部/小穴/屁穴三项 partProfiles、fetishNotes 与 sensitivePoints 都已有具体稳定事实时才用 ready。description 采用直白、具体、可感的档案写法，只写对应部位，不混入姓名、脸、职业、收入、恋爱保障、家庭背景或人物性格；不要使用“甬道”等含糊器官隐喻。partProfiles 每项可以额外写 imagePromptAnchor；imagePromptAnchor 是独立的文生图可画标签，可保留如玉、细腻这类可画风格词、镜头词或质感词，但不得替代 description，也不得反灌到 description。fetishNotes 只写已经形成依据的成人性偏好，不得用价值观、信任条件或关系总结代替。不要写英文状态占位、中文待补内容、无记录占位、元说明、工程说明或泛化一致性说明，也不得用通用默认值或无依据内容补全。',
        '已有成年香闺秘档且本回合明确形成相关即时身体变化时，可以只写 adultPrivateProfile.womb.cervixStatus；没有实际变化就省略，不得沿抄旧值。该字段只承接短期剧情反馈，本地会在 12 个游戏小时后恢复常态；不得用它创建新香闺秘档或代替怀孕生命周期。',
        '普通人物档案补全任务禁止生成 femaleProfile.adultPrivateProfile。pregnancyRiskPatches 只报告正文中已发生的受孕风险事件；成年女性尚无香闺秘档时，本地引擎只会按需建立最小 womb 跟踪，不会因此补造部位、性癖或敏感点。不得写 pregnancy、lastPregnancyCheck、pregnancyHistory，也不得用 womb.status 或 records 自行判定/覆盖怀孕；概率、验孕、孕期和孩子建档由本地引擎独占。',
        '每回合必须返回顶层 pregnancyLifecycleReview。changed=false 时 events=[]；正文明确发生受孕风险、医院/医学检查确认妊娠、妊娠终止或分娩时 changed=true，并为每名相关人物列出 pregnancy_risk / pregnancy_confirmed / pregnancy_ended / live_birth 事件。events 每项必须严格为 { "actorId": "稳定人物ID", "event": "四个固定英文值之一", "reason": "说明本回合直接依据的单个字符串" }；reason 禁止返回数组、对象或 null。复核只声明本回合事实，不能替代 writeback 内的对应补丁。',
        pregnancyMode === 'off'
          ? '当前怀孕机制已关闭：不得输出 pregnancyRiskPatches；但已有孕期的医学确认、终止或分娩仍必须按事实写 pregnancyLifecycleReview 与 pregnancyResolutionPatches。'
          : '正文明确发生可能导致受孕的成年行为时，必须写 pregnancyRiskPatches：unprotected=无保护风险，tryingToConceive=明确尝试受孕，reducedRisk=已采取避孕但仍有残余风险。只报告事件，不得自行宣布本次已经怀孕或未怀孕；同一人物同一回合最多写一条。即使该人物已经处于疑似、确认、待产或产后阶段，仍要写该风险事件：本地只追加接触记录，不会建立第二个妊娠。若同一事件或风险窗口涉及多名可能父亲，必须在该条 paternityCandidates 中列出全部候选，不得只保留一人；visibility 只反映玩家实际知情范围，不得猜测。同一游戏日的风险由本地引擎合并，跨游戏日分别排期；较早判定成功后，后续待判定会自动取消。',
        '只有正文明确发生医院/医学检查确认妊娠、妊娠终止或分娩时才写 pregnancyResolutionPatches：pregnancy_confirmed 只把已有 suspected 状态提前确认为 confirmed；pregnancy_ended 只用于已经取得阳性结果后的明确终止；live_birth 只能在投喂的生命周期已进入待产窗口时写。普通阳性验孕由本地按期判定，不要自行制造流产、死产或医学异常。',
        'femaleProfile 公开字段只使用规范字段：birthday / addressToPlayer / appearanceDescription / bodyDescription / clothingStyle / personalityCore / affectionProgressionCondition / relationshipProgressionCondition / relationshipNetworkEdges。',
        'relationshipNetworkEdges 是重要女性关系网变量，格式为数组，每项 { "targetName": "人物或组织名", "relation": "关系", "note": "关系备注" }；用于记录家人、恋人、工作场所、闺蜜、保护人、债主等稳定牵连。',
        'femaleProfile 记录稳定档案真值：生日、对玩家称呼、稳定外貌、身材、常态衣着、核心性格、好感突破条件、关系突破条件和重要关系网。不要把一次性正文状态、临时恐惧、临时衣着脏污、当场动作或工程说明塞进 femaleProfile。',
        '不要使用 callSign、publicRelationship、appearanceExpansion、characterCore、relationshipAdvancementConditions、socialNetwork、emotionalBoundaries 这类别名字段；称呼写 addressToPlayer，外貌写 appearanceDescription，关系网写 relationshipNetworkEdges。',
        'NPC 记忆统一写入 actorMemories；不要再使用 actorPatches.keyMemories，也不要填写 importance。每名 NPC 每回合最多一条，也可以零条；只有该事实会在未来持续改变人物行为、关系、承诺、戒备、恩怨或对话承接时才写，普通寒暄和一次性动作不要写。',
        'actorMemories.text 中凡是可以从 TIME_REFERENCE_FRAME 确定的“昨天、今晚、明天、后天、下周三”等时间，必须直接写绝对年月日；不得只留下会随回合漂移的相对词。只有“改天、过阵子”等本来就没有确定日期的说法可以保持模糊。',
        '如果本回合形成了会在未来具体时间到期的约会、承诺、通知或回访，除了写人物记忆，还必须用 deferredEventPatches 建立带绝对 triggerAt 的 pending 事件；人物记忆负责“谁记得什么”，延迟事件负责“何时应重新进入上下文”。',
        '角色链路记忆完整性：REMOTE_NPC_PRESENCE_PROJECTION 中带 actorId 的上级、同僚或既有联系人，如果本回合通过电台、电话、传呼、托话等方式实际发言、收到报告、作出指示或承诺，相关 currentMatterPatches/casePatches 等结构必须带该 actorId；只要这次互动会被后续对话或行动承接，就必须给该 actorId 写一条 actorMemories。',
        '玩家点名人物身份锚点是人物志的稳定召回结果。若该区某项“是否存在同名歧义”为否，正文、actorMemories 及所有事项必须复用它给出的 actorId，不得用新 actorId 创建同名不同身份人物；若为是，只能在列出的候选中根据上下文消歧，不得另造第三人。',
        '如果正文让一个已有真实姓名、以后需要继续承接的 NPC 直接发言或行动，但所有在场/远场/玩家点名身份锚点都没有对应 actorId，本回合才可以用 actorPatches 创建稳定 Actor，再用同一 actorId 写相关事项和必要的 actorMemories；普通回合最多新建 3 名长期 Actor，群体场景中的其余路人、围观者和一次性工作人员只留在正文，不得批量建档；不得只在 narrativeText 里反复使用姓名而让需要承接的人物留在状态层之外。',
        '既有 actorId 的 birthDate 与 computedAge 是引擎保护字段，不得通过普通 actorPatches 改写。只在首次创建新 Actor 时提供年龄资料：有确切生日才写 birthDate，computedAge 必须与 currentTime 相符；只有大致年龄时可只写 computedAge，不得为了凑字段虚构生日。人物跨年或过生日后的年龄由本地引擎自动重算。',
        'actorPatches[].presence 只能使用 present / nearby / mentioned / absent；远场人物使用 mentioned 或 absent，不得自造 remote。',
        '在场 NPC 反应候选只是未裁定建议，不是已发生事实；可以让 NPC 有动作、眼神、打断、追问、沉默或提醒，但状态变化仍必须写结构化 writeback。',
        '远场 NPC 存在感候选只是未裁定建议，不是已发生事实；只有正文自然承接后，才允许写回关系变化、NPC 记忆、当前事项、新闻、传闻或延迟事件。',
        '金钱变化以 financePatch 为准；固定收入/支出写 upsertCashflows；灰色礼物、黑钱、人情往来写 grayLedgerPatch，灰色账本不直接改变金钱。',
        'financePatch.upsertCashflows[].kind 只能使用 salary / rent / family_support / debt_payment / asset_income / asset_expense / living_cost / other；零用、津贴等归入最贴近的规范项或 other，不得自造 allowance。',
        'Only write financePatch.upsertCashflows when a recurring monthly cashflow is explicitly created, changed, or ended; routine one-time spending/income must not be converted into cashflow items.',
        '高优先级完整性：如果本回合 narrativeText 明确写成玩家已经完成录用、正式到职并建立持续按月发薪的工作，本回合没有对应 financePatch.upsertCashflows 就是不完整写回。不能只在正文、turnSummary、人物记忆或职业称谓里写“已入职”。反过来，仍在求职、面试、等待通知或只有短工时不得建立固定工资。下方 JSON 示例中的市民工资项只示范完整字段，当前回合没有正式建立固定工作时必须把 upsertCashflows 留空。',
        '玩家的职业或身份固定收入必须写 identityBinding。收入金额、入账账户或工作内容改变时复用原 itemId 改写完整项；暂停发放时复用原 itemId 并写 status="paused"；彻底结束时写 removeCashflowItemIds。',
        '物品与资产统一写入 assetPatch。只记录玩家已经拥有、控制或长期可用的物品/资产；不要把他人所有的东西写进玩家物品与资产。',
        'assetPatch.upsertItems 用稳定 itemId 新增或更新物品；同一物品不要重复造新 itemId。物品仍由玩家持有但内容变化时，复用原 itemId 更新完整对象，例如小说手稿从前三章推进到前四章。',
        'assetPatch.removeItems 用于物品离开玩家持有或控制：交给别人、寄出、提交到案件或证物袋、卖掉、丢失、销毁、消耗、归还或转入案件系统。提交案件时填写 movedToCaseId；如果玩家保留副本，必须在 summary/detail 里写清副本关系。',
        '可直接花用的现金、港币、钞票和零钱只能通过 financePatch 改变余额，绝不能写成物品。支票、本票、汇票、存单、债券、欠条、借据、收据、礼券等有独立凭据的金融工具可以作为物品；兑现、存入或交付后应移除凭据，并由 financePatch 结算。',
        '不得把钱包、钥匙串、证件等多个独立实体拼成一件组合物品。同一小说、手稿、档案、账簿或持续变化的文件必须复用稳定 itemId 更新；只有确实存在两个物理实体时才可以分别建档。',
        '当前装备必须使用 assetPatch.equippedItemIds 表达，最多三项，并且只能引用本回合应用后仍存在的真实物品 ID。playerPatch.equipment 只作旧兼容输入，不得用它创建新物品或组合物品。',
        '衣着是玩家/Actor 状态，不是装备槽。普通衣着变化只写 playerPatch.clothing；有特殊意义且玩家拥有的衣物可以写成 assetPatch 物品，并在 wearable 中说明穿着摘要和意义。',
        'playerPatch.clothing 必须写成对象，currentSummary 与 mode 都必填；可再写 sourceItemId/sourceItemSignificance/lastChangedReason。不要返回纯字符串，也不要把衣物写进 playerPatch.equipment。',
        'playerPatch.clothing.mode 只能使用 duty_uniform / off_duty_plain / formal / disguise / special / sleepwear / other；不能使用 uniform、casual 等自造值。',
        '正文一旦写出玩家脱下、换上、换成、改穿、穿上、伪装或更衣等衣着变化，必须写 writeback.playerPatch.clothing；不要只在 narrativeText 里写换装。',
        '当前身份是警察不等于当前穿军装；如果玩家已明确换成便服，后续应按便服续写，直到再次通过 playerPatch.clothing 写回换装。',
        '不要按上下班时间自动换衣；只有玩家明确换装、剧情明确要求换装，或身份伪装需要时才写衣着变化。下班、轮休或离开警署本身不是自动换装依据。',
        '物品分类只使用 equipment/general/document/valuable/fixedAsset/vehicle。不要额外发明灰色、危险、需归还、已提交、待核验等标签；这些语义写入 summary/detail/evidence 或后续案件系统。',
        VEHICLE_ASSET_WRITEBACK_CONTRACT,
        '证据规则：剧情中被打上 evidence 的物品默认是有效证据；只有正文明确出现程序瑕疵、来源污染、伪造嫌疑或口径冲突时，才设置 evidence.disputed=true 并写 disputeSummary。',
        '社会机构变化写 organizationPatches；人物与机构的任职、供职、会员、老板、联络等关系写 actorPatches[].organizationRelations，不要只写在正文里。',
        '已有机构、玩家雇主或玩家持有企业发生变化时，必须逐字复用提示词中已有的 organizationId；名称增加“家族”“集团”“公司”“企业”等修饰，或改用已知别名，都不代表新机构。只有剧情明确成立了独立法律/经营实体时才允许创建新 organizationId。',
        '大社团对玩家的态度、当前状态、组织压力或半公开结构变化写 organizationPatches；组织架构必须写 organizationPatches[].structureTree，未知职位或未知人员写“未知”；地区传闻、街面关系、关键场所和可尝试行动仍写 grayNetworkPatches。',
        '社团资料中的 triadProfile 是只读世界包事实，不得改写。玩家已经合理获知的权力阶段或既有活动区域状态变化可写 organizationPatches[].triadState；只能使用提示词中已有的 actorId/placeId，不得凭空新增地盘、候选人或全知内部事实。',
        'hidden 的机构关系不能在普通正文、普通 Prompt 投影和玩家 UI 中泄露；只有当玩家在剧情中合理获知后，才能改为 player_known 或 public。',
        '不要因为机构投影里出现 ICAC、律政司、法院或政府部门，就自动定罪、自动检控、自动判决、自动处分或自动结案；这些只能由明确剧情和结构化写回推动。',
        '人脉/缘份长期关系变化必须写入 relationshipThreadPatches；不要只写在正文、NPC 记忆或当前事项里。',
        'relationshipThreadPatches 是人物长期关系画像的规范来源：关系总体判断改变时更新 summary；亲密、信任、冲突、承诺、风险或当前牵引改变时更新对应的 intimacySummary / trustSummary / conflictSummary / promiseSummary / riskSummary / currentPull。人物志会从已通过门禁的关系线程对账这些画像，不能只改 actorPatches 或只写一条记忆。',
        '人脉与缘份是同一人物关系线的不同层级，不是两套并行人物档案。已有 network 在本回合形成明确、持续的亲密或伴侣事实时，复用原 threadId 并把 kind 升级为 fate；已有 fate 不得降级；同一核心人物不得同时新建另一条 network/fate。',
        '新建 relationshipThreadPatches 必须填写 creationBasis 与 evidenceRefs；repeated_contact / sustained_conflict 至少引用两项不同的有效依据。一次见面、单次盘问、普通同事、同地点出现、单条记忆或高 importance 都不能建线。更新既有 threadId 时无需重复创建依据。',
        'relationshipThreadPatches[].creationBasis 只能使用 family / formal_partner / formal_informant / debt_or_promise / protection / ongoing_joint_matter / repeated_contact / sustained_conflict；不得自造 financial_dependency 等值。',
        'relationshipThread.importance 是旧数据兼容字段，不得作为创建、心跳、升温或推进依据。',
        '远场关系心跳候选只是未裁定建议，不是已发生事实；只有正文自然承接后，才允许写回关系变化、NPC 记忆、当前事项、新闻或声誉。',
        'REMOTE_NPC_PRESENCE_PROJECTION 与 BACKGROUND_EVOLUTION_FACTS 中出现的 actorId 都是既有人物的稳定身份。若正文或写回承接这些人物，必须逐字复用该 actorId；不得因玩家本轮未点名人物而另造新 actorId。',
        '不要把人脉/缘份关系线当成任务系统，不要生成好感度、进度条、奖励或本地完成判定。',
        '结果确有不确定性且失败会形成实际差异的观察、推理、谈判、行动、体力、意志或对抗，应按本回合本地判定合同写 judgementCheckPatches；每回合最多一次。纯例行、无阻力或事实已保证的动作不要判定。重大追捕、格斗、持械、枪械、人群冲突、拘捕或逃脱还必须写 combatEventPatches。',
        'combatEventPatches.combatText 必须是过程化精彩描写，目标 180-260 字左右，写场地、光线/天气/声音、双方站位、动作反应、判定转折和现场后果；不要写成摘要、报告、参战名单或结果列表。',
        'combatEventPatches[].outcome 只能使用 player_advantage / opponent_advantage / player_wounded / opponent_subdued / opponent_escaped / stalemate / interrupted / escalated / other；不得自造 wounded_grappling、opponent_advantaged 等近义值。',
        '社团与灰色网络只通过 grayNetworkPatches 更新区域灰色网络投影；不要用它替代 actorPatches/placePatches/organizationPatches 创建正式人物、地点或组织档案。',
        'grayNetworkPatches 只能记录当前身份合理可见的传闻、关系、风险和行动提示；不要把 hidden 信息、全知社团层级或未确认传闻写成确定事实。',
        '城市局势后台发展只写 citySituationTrackPatches；不要把传闻提升为确定事实，不要每回合强行新增城市压力。',
        'JSON 顶层只放 writebackVersion、narrativeText、可选 presentationHints、turnSummary、suggestedActions、playerVitalsReview、pregnancyLifecycleReview、timePatch，以及按要求出现的 dramaExecutionTrace。playerPatch、locationPatch、placePatches、currentMatterPatches、memories、actorMemories 等所有状态模块必须放进顶层 writeback 对象，禁止与 writeback 并列。',
        '可以在 writeback 下追加未来模块；未知模块会被系统保留兼容或忽略，但不得替代现有字段。',
        options.dramaPlanningContext
          ? `戏剧化回合的顶层 JSON 必须包含 dramaExecutionTrace；planId 必须是 "${
              options.dramaPlan?.planId ??
              `drama_plan_turn_${options.dramaPlanningContext.turnCounter}`
            }"。未采用计划也必须返回 not_used 空回执，不得省略。`
          : ''
      ].join('\n')
    ),
    section('玩家输入', playerInput),
    section(
      '本回合玩家动作锁（最高优先级）',
      playerActionLock
    ),
    section(
      '本回合场景事实锁（高优先级）',
      '纯等待、过渡、文书、核对、整理或休息等简单行动，只使用上文已经投喂的人物、物件和事务，最多选择一个真正有用的环境锚点。所选篇幅应来自同一事务内部的具体步骤、信息、既有 NPC 回应、程序或现实限制和直接后果，不得轮流罗列视觉、听觉、嗅觉、触觉等感官细节。除非玩家行动本身直接需要且现有资料没有可复用对象，否则不得新造进门的人、同事、电话、传呼、案件、证物、秘密、危险或突发钩子来填充篇幅。'
    ),
    section('成人段落输出前复核', adultRelationshipGuide),
    section('近期已完成事实（结构化权威）', recentCompletedFacts),
    `TURN_OUTPUT_JSON_EXAMPLE\n${exampleJson}`
  ].join('\n\n');
}
