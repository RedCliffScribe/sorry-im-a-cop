import { getNarrativeLengthProfile, type NarrativeLengthLevel } from '../settings/narrativeLength';
import {
  formatNpcSimulationPackageForPrompt,
  type NpcSimulationPackage
} from '../npc/npcSimulation';
import { resolvePromptText } from '../prompts/promptRegistry';
import { hk1980sOpeningScenarios, hk1980sPoliceRankKnowledge, hk1980sTriadBehaviorKnowledge } from '../worldpack/hk1980sOpening';
import type { NarrativePerspective, PregnancyMode, PromptSettings } from '../settings/types';
import {
  createAdultRelationshipStyleGuide,
  createNarrativePerspectiveGuide,
  createNarrativeStyleAndDisplayGuide
} from './narrativePromptGuides';
import type { PromptContext } from './selectContext';
import { formatGameTimeWithWeekday, formatTimeReferenceFrame } from '../time/gameTime';
import { formatCurrencyAmountByConfig } from '../worldpack/economyConfig';

export interface ComposePromptOptions {
  narrativeLengthLevel?: NarrativeLengthLevel;
  narrativePerspective?: NarrativePerspective;
  pregnancyMode?: PregnancyMode;
  npcSimulationPackage?: NpcSimulationPackage;
  promptSettings?: PromptSettings;
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
    return `- actorId=${entry.actorId} actor=${entry.actorName} route=${entry.route} core=${entry.coreActor} memoryId=${entry.memoryId} time=${formatMemoryTime(entry.gameTime)} relative=${entry.relativeLabel} tier=${entry.tier} certainty=${entry.certainty} score=${entry.score}${vector} reasons=${reasons}\n  memory=${entry.text}`;
  });

  return [
    'NPC_MEMORY_PROJECTION',
    formatList(entries),
    `diagnostics: selected=${projection.diagnostics.selectedMemoryIds.length}/${projection.diagnostics.candidateMemoryCount} actors=${projection.diagnostics.selectedActorIds.join(',') || 'none'} routeCounts=present:${projection.diagnostics.routeCounts.present},mentioned:${projection.diagnostics.routeCounts.mentioned},remote:${projection.diagnostics.routeCounts.remote} tierCounts=short:${projection.diagnostics.tierCounts.short_term},mid:${projection.diagnostics.tierCounts.mid_term},long:${projection.diagnostics.tierCounts.long_term} textChars=${projection.diagnostics.selectedTextChars} estimatedTokenBudget=${projection.diagnostics.estimatedTokenBudget} omitted=${projection.diagnostics.omittedMemoryCount}`,
    'Rule: this is the single routed NPC memory source for continuity. Prefer present NPC memories, then explicitly mentioned NPCs, then remote-presence candidates.',
    'Rule: NPC memory importance is intentionally ignored. Selection comes from actor route, layer anchors, text/vector relevance and recency.',
    'Rule: time 是记忆发生的绝对时间，relative 是依据本回合当前时间临时计算的称呼；绝对 time 是唯一权威。',
    'Rule: memory 文本里残留的“昨天、昨晚、今晚”等属于事件发生时的旧说法，不得据此重定日期；需要相对称呼时使用该条目的 relative。',
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
    'Rule: recent_raw_story preserves the latest player input and narrative wording for immediate continuity, tone, unresolved gestures and dialogue carry-over.',
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
    '规则：如果本回合天气明显变化或成为行动阻力/机会，写 weatherPatch；不要只在正文里漂移天气。'
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
    'Rule: if the story confirms a case has been transferred to 已移交 CID/反黑/重案/检控 or another unit, and the player is no longer lead/assist/execute, update it through casePatches with playerRole=aware or involved, and write leadActorName/currentFocus/playerVisibleProgress to show that another unit now handles it while the player only keeps knowledge or connection.'
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
        `- ${item.direction === 'income' ? '收入' : '支出'}：${item.title} ${formatAmount(item.amount)}/月，进入${formatAccount(item.account)}；${item.summary}`
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
    'Rule: concrete one-time scene payments normally use cashDelta and account="cash"; bank transfers, cheques and formal account payments use bankDelta and account="bank". Do not invent a transfer between accounts.',
    'Rule: every concrete one-time payment or income must include both the matching financePatch cash/bank delta and one ledgerEntries item. Minimal ledger shape: {"direction":"expense","amount":35,"account":"cash","title":"买烟","summary":"在报摊买了一包烟。"}',
    '规则：固定收入/支出写 financePatch.upsertCashflows；灰色收入、礼物、人情可另写 grayLedgerPatch，但灰色账本只记录来源，不直接改变现金或存款；真实到账仍必须写 financePatch。',
    '成长规则：只有本回合完成有意义的行动、调查、冲突、训练或重要社交时，才可写 playerPatch.progression.experienceGain（通常 1-30，重大成果可更高）；不得直接返回等级、当前经验或自由属性点。'
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
      return `- organizationId=${organization.organizationId} name=${organization.name} type=${organization.type} importance=${organization.importance} reasons=${organization.reasons.join(',') || 'none'}\n  summary=${organization.summary}\n  publicKnowledge=${organization.publicKnowledge}\n  currentState=${organization.currentState}\n  stanceTowardPlayer=${organization.stanceTowardPlayer}\n  pressureSummary=${organization.pressureSummary}${structureTree}\n  relatedActors=${organization.relatedActorIds.join(',') || 'none'} relatedPlaces=${organization.relatedPlaceIds.join(',') || 'none'} relatedCases=${organization.relatedCaseIds.join(',') || 'none'}`;
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
    'Rule: society hierarchy updates must use organizationPatches[].structureTree. 未知职位或未知人员写“未知”，不要用一段普通说明文字替代结构树。',
    'Rule: actor-to-institution roles must be written through actorPatches[].organizationRelations. Do not use prose as state.',
    'Rule: visibility=hidden relations must not be exposed in normal narration or ordinary prompt context.',
    'Rule: do not automatically convict, prosecute, adjudicate, discipline, or close matters through institutional authority unless a structured delayed event or explicit writeback says so.'
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

  return [
    'RELATIONSHIP_CONTEXT_PROJECTION',
    'threads:',
    formatList(threads),
    'heartbeatCandidates:',
    formatList(heartbeats),
    `diagnostics: source=${projection.diagnostics.sourceThreadCount} projected=${projection.diagnostics.projectedThreadCount} heartbeat=${projection.diagnostics.heartbeatCandidateCount} projectedIds=${projection.diagnostics.projectedThreadIds.join(',') || 'none'} omittedHidden=${projection.diagnostics.omittedHiddenCount} omittedIrrelevant=${projection.diagnostics.omittedIrrelevantCount} missingActorRefs=${projection.diagnostics.missingActorRefs.join(',') || 'none'}`,
    'Rule: relationshipThreadPatches records durable 人脉/缘份 thread changes; do not store these changes only in prose.',
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
      .map((factor) => `${factor.label} ${factor.value >= 0 ? '+' : ''}${factor.value}: ${factor.reason}`)
      .join('；');
    return [
      `- checkId=${check.checkId} title=${check.title} category=${check.category} outcome=${check.outcome}`,
      `  difficulty=${check.difficulty} score=${check.score} margin=${check.margin}`,
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
    'Rule: 判定只用于追捕、格斗、持械、枪械、人群冲突、拘捕、逃脱等需要仪式感和不确定性的重大场面；普通对话、巡逻、询问和日常摩擦不要创建判定。',
    'Rule: 如果本回合发生重大判定，正文可用【判定】标签自然承接，但持久记录必须写 judgementCheckPatches；不要从正文反向推断本地记录。',
    'Rule: 如果本回合发生重大战斗/追逐，写 combatEventPatches；combatText 必须是过程化精彩描写，目标 180-260 字左右，不是摘要、报告或表格。',
    'Rule: combatText 要写清场地、光线、天气、声音等现场压力，双方站位和动作反应，关键判定如何体现在动作转折中，最后落到伤势、制服、逃脱、消耗或现场后果。',
    'Rule: participants/resultSummary/consequenceSummary 用结构化字段概括；不要用 combatText 重复参与方列表或结果说明。',
    'Rule: 战斗弹窗记录只承载已经发生的重大对抗，不替代案件、伤势、物品、记忆、声誉或动态事件；这些后果仍需写入各自结构化模块。'
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
    `diagnostics: selectedClimate=${projection.diagnostics.selectedClimateKeys.join(',') || 'none'} omittedClimate=${projection.diagnostics.omittedClimateCount}`,
    'Rule: use this panel as police institution context. Do not auto-promote, auto-discipline, or rewrite police career progress unless playerPatch.policePanel explicitly updates it.'
  ].join('\n');
}

function formatPoliceDutyProjection(context: PromptContext): string {
  const projection = context.policeDutyProjection;
  return [
    'POLICE_DUTY_CONTEXT',
    `状态：${projection.label}`,
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

function formatAdultPrivateWomb(profile: NonNullable<PromptContext['actorPackets'][number]['femaleProfile']>['adultPrivateProfile']): string {
  const womb = profile?.womb;
  const records = womb?.records?.length
    ? womb.records
        .slice(-6)
        .map((record) => [record.date, record.description, record.pregnancyCheckDate ? `判定日=${record.pregnancyCheckDate}` : ''].filter(Boolean).join(':'))
        .join('；')
    : '无';
  const pregnancy = womb?.pregnancy;
  const visiblePaternity = pregnancy?.paternityCandidates
    .filter((candidate) => candidate.visibility !== 'hidden')
    .map((candidate) => candidate.name ?? candidate.actorId)
    .filter((candidate): candidate is string => Boolean(candidate));
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
        visiblePaternity?.length ? `玩家已知父亲候选=${visiblePaternity.join('、')}` : undefined
      ]
        .filter(Boolean)
        .join(' / ')
    : '无活动妊娠';
  const history = womb?.pregnancyHistory?.length
    ? womb.pregnancyHistory
        .slice(-3)
        .map((item) => `${formatGameTime(item.endedAt)}:${item.outcome}:${item.summary}`)
        .join('；')
    : '无';
  return `    - 子宫档案: 状态=${womb?.status ?? '未受孕'} / 宫口状态=${womb?.cervixStatus ?? '紧闭'} / 生命周期=${lifecycle} / 历史=${history} / 记录=${records}`;
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

function createTurnResponseExample(pregnancyMode: PregnancyMode = 'standard') {
  return {
    writebackVersion: '1.5',
    narrativeText:
      '【旁白】报案室的电话线里有一点杂音，窗外的霓虹被雨水拖成发亮的细线。墙上的钟刚过九点，纸本记录簿摊在桌角，几名夜归市民在长凳上压低声音等候。\n【旁白】你按下听筒时，值日警长抬眼看了你一下，像是在判断这通电话到底是普通街坊求助，还是有人借警署线路递话。\n【报案室警员】“阿Sir，外面有人找你，站了好一阵。说不出全名，只讲你会认得佢。”\n【旁白】话音刚落，门口的玻璃被雨水和车灯映得发白，一个穿旧夹克的男人避开报案室里其他人的目光，手里攥着一只皱掉的烟盒。\n【旁白】你还没走过去，旁边茶餐厅老板已经把外卖袋放到柜台上，顺口补了一句：“今晚旺角唔太平，几条街都有人问你哋巡逻路线。”',
    turnSummary:
      '本回合事实摘要：玩家接到有人在报案室外找他的消息；茶餐厅老板提到附近有人打听巡逻路线；后续只应承接门口来人、街面询问和报案室现场反应。',
    suggestedActions: ['继续询问眼前的人。', '先观察周围反应。'],
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
        equipment: ['最多三件当前随身装备'],
        reputation: {
          notorietyDelta: 0,
          overallReputationDelta: 0,
          summary: '只有整体知名度或整体口碑确实变化时才写。',
          reason: '说明本回合为什么会改变整体声誉；没有明确社会评价变化时不要写。',
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
      financePatch: {
        cashDelta: 0,
        bankDelta: 0,
        summary: '本回合随身现金与银行存款没有明显变化。',
        upsertCashflows: [],
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
          actorId: 'player',
          vitalsPatch: {
            healthDelta: 0,
            staminaDelta: -8,
            conditionSummary: '刚经历追逐或长时间奔走，体力有所下降。'
          }
        },
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
          status: 'open',
          playerAccessLevel: 'rumor',
          summary: '摘要。',
          officialRecordSummary: '档案/官方口径。',
          publicNarrativeSummary: '街坊/媒体口径。',
          playerKnownSummary: '玩家已知内容。',
          conflictSummary: '核心冲突。'
        }
      ],
      organizationPatches: [
        {
          organizationId: 'org_stable_id',
          name: '组织名',
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
          ]
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
                fatherActorId: 'player',
                fatherName: '玩家姓名或已知人物名',
                fatherVisibility: 'player_known'
              }
            ],
      pregnancyResolutionPatches: [
        {
          actorId: 'adult_female_actor_id',
          outcome: 'live_birth',
          summary: '仅在正文明确发生分娩或妊娠终止时写；不要用它自行判定怀孕。',
          childName: '正文已明确的孩子姓名',
          childGender: 'female',
          fatherActorId: 'player'
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
              body: '新闻正文，可包含时代新闻、娱乐新闻、街坊关注或与玩家相关的报道。',
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
        ]
      },
      judgementCheckPatches: [
        {
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
          difficulty: 62,
          score: 70,
          outcome: 'success',
          shortSummary: '玩家成功压住对方持刀手。',
          consequenceSummary: '嫌疑人失去主动，但玩家体力消耗明显。',
          factors: [
            {
              label: '体魄与行动',
              value: 8,
              reason: '玩家身体素质和反应速度占优。'
            },
            {
              label: '环境',
              value: -4,
              reason: '后巷湿滑且空间狭窄。'
            }
          ],
          visibility: 'player_known'
        }
      ],
      combatEventPatches: [
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
              conditionAfter: '右腕被压住，仍在挣扎。'
            }
          ],
          outcome: 'opponent_subdued',
          intensity: 70,
          animationKey: 'armed_alley',
          combatText:
            '窄巷里的积水被脚步踢开，嫌疑人回身挥刀，刀光贴着霓虹一闪。玩家没有硬扑，先侧身避过刀锋，再借墙面缩短距离，一手扣住对方持刀腕，一手顶住肩颈，把人压向卷闸门。铁皮震出一声闷响，对方膝盖一软，却仍想用肩撞开空隙。',
          resultSummary: '玩家成功控制嫌疑人。',
          consequenceSummary: '嫌疑人被压制，玩家体力下降，现场动静引来街坊围观。',
          judgementCheckIds: ['check_stable_id'],
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
  const narrativeGuide = createNarrativeStyleAndDisplayGuide(narrativeLengthProfile.level, promptSettings);
  const playerActor = context.presentActors.find((actor) => actor.actorId === 'player');
  const narrativePerspectiveGuide = createNarrativePerspectiveGuide(options.narrativePerspective, {
    playerName: playerActor?.name,
    playerGender: playerActor?.gender
  });
  const adultRelationshipGuide = createAdultRelationshipStyleGuide(promptSettings);
  const actors = context.actorPackets.map(formatActorPacket).join('\n\n');
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
  const cityPower = formatCityPowerProjection(context);
  const citySituationTracks = formatCitySituationTrackProjection(context);
  const relationship = formatRelationshipProjection(context);
  const dynamic = formatDynamicProjection(context);
  const recentCompletedFacts = formatRecentCompletedFactProjection(context);
  const eraSeedFigures = formatEraSeedFigureProjection(context);
  const storypack = formatStorypackProjection(context);
  const presentActorReactions = formatPresentActorReactionProjection(context);
  const remoteNpcPresence = formatRemoteNpcPresenceProjection(context);
  const backgroundEvolution = formatBackgroundEvolutionProjection(context);
  const auxiliaryNpcSimulation = options.npcSimulationPackage
    ? formatNpcSimulationPackageForPrompt(options.npcSimulationPackage)
    : '';
  const conflict = formatConflictProjection(context);
  const weather = formatWeatherProjection(context);
  const policePanel = formatPolicePanelProjection(context);
  const policeDuty = formatPoliceDutyProjection(context);
  const grayNetwork = formatGrayNetworkProjection(context);
  const identityContext = formatIdentityContextProjection(context);
  const civilianTransitionGuidance = formatCivilianTransitionGuidance(context);
  const exampleJson = JSON.stringify(createTurnResponseExample(pregnancyMode), null, 2);
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
    section('时间参照框架', timeReference),
    section('警务值班节奏', policeDuty),
    section('开局节奏延续', formatOpeningPacingProjection(context)),
    section('1980s 香港警队职级资料库', hk1980sPoliceRankKnowledge),
    section('香港社团行为逻辑', hk1980sTriadBehaviorKnowledge),
    section('玩家', `${context.playerSummary}\n执法身份: ${context.lawIdentitySummary || '无'}`),
    section('IDENTITY_CONTEXT', identityContext),
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
    section('NPC 记忆投影', npcMemories),
    section('在场 NPC 反应候选', presentActorReactions),
    section('相关案件', cases),
    section('相关物品与资产', assets),
    section('金钱与收支', finance),
    section('声誉与口碑投影', reputation),
    section('社会机构投影', institution),
    section('城市权力锚点投影', cityPower),
    section('城市局势后台轨道投影', citySituationTracks),
    section('人脉与缘份投影', relationship),
    section('时代种子人物资料库', eraSeedFigures),
    section('Storypack 投影', storypack),
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
    section('正文风格与显示格式', narrativeGuide),
    section('正文叙事人称', narrativePerspectiveGuide),
    section(
      '输出原则',
      [
        '返回一个合法 JSON object，不要 Markdown，不要代码块，不要额外解释。',
        '正文优先：先完整写 narrativeText，再写结构化 JSON；不要因为 JSON 写回字段很多而压缩正文。',
        'narrativeText 结尾必须停在具体现场状态、人物动作、对方反应、局面后果或可继续互动的事实上；禁止用第二人称选择题或征询句收尾，尤其不要以“你是打算……还是……？”“是否……？”“要不要……？”“还是……？”结尾。可选行动只写 suggestedActions。',
        'suggestedActions 必须服从结构化事实终态；不得把 RECENT_COMPLETED_FACTS 中已经完成、签署、交付、解决或结束的同一事项重新建议为待办。',
        '每回合必须写 turnSummary：用 1-3 句中文事实摘要记录玩家已完成事项、NPC/机构知情、状态变化和已形成的后续钩子。只写已经发生的事实和结果，不复述文风，不制造悬念，不写工程词，不使用“可能、似乎、准备”等未落实表述。',
        'turnSummary 是本回合唯一的主角短期记忆来源；不要再把同一回合摘要写入 writeback.memories。writeback.memories 只用于 world/case/place/player 等独立事实，NPC 个人记忆只写 actorMemories。',
        '如果本回合确认投稿、报案、交付、换装、付款、拘捕、提交证据、完成谈话或离开地点等已完成事实，turnSummary 必须明确写“已经/已/完成/交付/提交/离开”等完成状态，后续不得再把同一动作写成待办。',
        `常规回合 narrativeText 目标 ${narrativeLengthProfile.turnTarget} 个中文字符；复杂回合 narrativeText 目标 ${narrativeLengthProfile.complexTurnTarget} 个中文字符；过渡回合最低 ${narrativeLengthProfile.transitionMinimum} 个中文字符，除非玩家明确要求极简。`,
        `每个常规回合至少 ${narrativeLengthProfile.paragraphTarget} 个显示段落或对白行；不能只用一两句摘要结束。`,
        '只写本回合明确产生或需要更新的结构化字段；未变化的模块可以省略或留空数组。',
        '不要通过正文暗示状态变化；正文不是写回来源。',
        '电话报案、上级派警、电台通报、线人报料、场方/住户/店主求助或投诉等“事件来源”一旦写进正文，必须写入 currentMatterPatches.summary/currentHook、casePatches.activityLog 或 memories；后续相关报案人、场方、店方不能完全忘记自己/本方曾经报过警，只能对报警目的、范围或后果改口。',
        'currentMatterPatches.status 必须明确表达事项生命周期：仍在发展写 active；暂时安静、等待材料、等待通知、移交他人但仍可能发展写 dormant；真正结束且无实质后续写 resolved；仅在需要保留历史记录时写 archived。不要用“初步闭环、暂时解除、告一段落、暂无后续”等正文措辞代替结构化 status。',
        '案件面板只写正式或准正式案件：已有案号/报告/口供/证据、上级交办、严重伤害或重大财损、拘捕、社团有组织犯罪、ICAC/检控/媒体风险，或明显需要多回合调查。普通巡逻求助、轻微滋扰、噪音投诉、店主/住户求助和现场调停写 currentMatterPatches 或 memories，不要写 casePatches。',
        '已移交 CID/反黑/重案/检控或由其他单位主办的案件，如果玩家只是证人、报案人、现场参与者或知情者，写 playerRole=aware/involved；这类是相关案件，不要当作玩家当前任务反复推动。只有玩家主动追问、收到正式通知或案件进展确实牵动玩家时才带回正文。',
        'timePatch 是唯一时间来源：短动作写 elapsedMinutes；跨日、跨周、轮值、等待、养伤、旅行或任何正文明确跳到具体日期/时刻时，必须写 targetTime={year,month,day,hour,minute}。targetTime 不得早于当前时间；如果 elapsedMinutes 与 targetTime 同时存在，以 targetTime 为准。',
        '新人物必须用 actorPatches 创建。actorId 必须稳定、可复用。',
        '既有 Actor 可以只写变化字段；新 Actor 创建必须完整，至少包含姓名、性别、年龄、当前身份、公开身份、实际身份摘要、角色定位、人物简介、外貌、衣着、性格、说话风格、动机、长期目标、价值观、六维、与玩家关系、态度、往来度、信任/戒备、牵连、长期记忆、最近记忆、当前状态、在场状态、可见性和重要度。',
        '往来度 interactionScore 只能是 0-100 的整数，表示接触频率/牵连深浅，不代表喜欢或讨厌；仇恨、敌意、戒备、恐惧写入 attitudeTowardPlayer、relationshipSummary、trustTendency 或 entanglementSummary，不能用负数往来度表达。',
        '新普通 NPC 的 name 必须是可长期绑定身份的完整姓名，不能只写“阿强”“红姑”“肥仔森”、单个英文名或职业称呼；外号、花名和日常称呼写入 callName/aliases。',
        '如果本回合只知道外号但该人物已经重要到必须建档，请按时代、身份和场景生成合理完整姓名，同时把原外号保留在 callName/aliases；不要照抄固定示例姓名。',
        '既有 NPC 后来确认真实姓名、英文名或身份证姓名时，必须复用原 actorId 更新 actorPatches；旧称呼写入 aliases/callName，不要另建新 Actor。',
        '不要因为两个人同名、同姓或共享“阿强、阿红、肥仔”等外号就判定为同一人；只有明确身份揭示、连续场景证据或既有 actorId 能证明同一身份时才合并。',
        '缺少性别或年龄时不要创建新 Actor；可以先把对方作为传闻、线索、组织成员描述或场景压力写入 memories/casePatches/organizationPatches。',
        '不要用“某人的手下/纹身男人/可疑男子”等临时描述凑 name；尚不足以建立稳定身份时不要创建 Actor 档案。',
        '输出 JSON 示例只是字段结构示例；示例里的说明性占位文本必须在实际输出中替换为具体内容，普通 NPC 姓名必须由本回合按时代、身份和场景生成或复用既有 actorId，不要照抄任何示例姓名或占位文字。',
        '普通 NPC 不要写 vitalsPatch，不要生成生命/体力数值；身体情况用 statusSummary/bodyConditionSummary。',
        '玩家发生追逐、奔跑、搏斗、摔伤、负重、长时间巡逻、熬夜或休息恢复等明显体力变化时，必须写 actorPatches 中 actorId=player 的 vitalsPatch；不要只在正文里写疲惫、喘气、受伤或恢复。',
        '玩家当前身份、公开身份、实际身份摘要或身份 roleProfiles 发生变化时，必须只写 writeback.identityContextPatch，完整提供 transitionId/kind/fromIdentity/toIdentity/publicIdentity/reason/targetRoleProfile/secretFactPatches；不要用 actorPatches 修改这些字段。目标身份切换为 police 时可提供 policeNumber（只能是四位数字）；当前没有警号且未提供时，由系统确定性分配，并原子同步到 Player 与 Actor。',
        'identityContextPatch.kind 只能使用 join / leave / cover_enter / cover_exit / exposure / correction：普通市民加入警队或社团用 join，进入卧底公开身份用 cover_enter；禁止输出 status_change。transitionId 必须是本次转换独有且稳定的非空字符串。targetRoleProfile 必须严格写成 {"identity":"police|gang_member|civilian","profile":{...}}，identity 必须等于 toIdentity；禁止写成 {"police":{...}}、{"triad":{...}} 或 {"civilian":{...}}。targetRoleProfile.profile 必须使用规范字段：社团用 organizationId/societyName/roleTitle/rankSummary/territorySummary/coverIdentitySummary/obligationSummary/riskSummary，警队用 agencyId/stationOrPost/department/rank/assignmentSummary/postRole/authoritySummary/accessSummary/dutySummary。',
        'identityContextPatch.secretFactPatches 只允许 {"operation":"upsert","fact":{"secretId":"...","ownerType":"player","ownerId":"player","kind":"identity|loyalty|relationship|risk|control|other","summary":"...","playerCharacterKnown":true|false,"publicKnown":true|false,"knownByActorIds":[],"revealState":"hidden|known_to_player_character|known_to_some_actors|publicly_revealed","revealConditions":[],"visibility":"hidden|player_known|public","importance":0-100}} 或 {"operation":"remove","secretId":"..."}；禁止使用 add/factId/factType/description 这类别名结构。',
        '身份没有真正改变时不得输出 identityContextPatch。卧底不是第四种 currentIdentity：警察卧底社团写 toIdentity=gang_member，社团人员卧底警队写 toIdentity=police；真实效忠与知情边界写 secretFactPatches。',
        '身份转换的正文如果明确发生换装、领取或更换当前随身装备，必须同步写 playerPatch.clothing / playerPatch.equipment；不得只在 narrativeText 里写换装或领装。equipment 是当前随身物品的完整列表（最多 3 项）；只有正文与结构化事实已确立变化时才更新，不得凭空清空玩家依然持有的物品。',
        '新增或更新秘密事实但不切换玩家身份时，写 writeback.secretFactPatches；不得只把秘密写进 narrativeText、memories、actualIdentitySummary 或 hidden roleProfiles。',
        '地点不要漂移：同一个地点必须复用既有 placeId；新地点只有在以后可复用时才写 placePatches，临时角落/一次性镜头不要创建地点。',
        '玩家当前位置或当前场景发生变化时，必须写 writeback.locationPatch.currentPlaceId/currentSceneId；不要只在正文里写“前往、回到、抵达”。currentSceneId 只在已有或本回合 scenePatches 创建的场景可用时写。',
        '时代不要穿帮：真实影视剧、歌曲、新闻、公共事件和人物公开活动必须服从当前游戏时间；不得把当前游戏时间之后才出现的真实影视剧、歌曲、新闻或公共事件写成已经发生、正在播出或正在流行。不确定年份时使用架空标题或模糊时代氛围，不要点名未来作品。',
        '新增 placePatches 必须尽量写 name/nameZh/nameEn/aliases/regionId/districtId/type/category/summary/publicKnowledge/currentState/source/canonical/confidence；能根据已知地点估计坐标时写 visualAnchor。',
        '只有 player 或未来明确拥有 vitals 的 Actor 才能写 vitalsPatch。',
        '普通 NPC 的 roleProfiles 按身份需要填写；警察写 police，社团人物写 triad，普通市民写 civilian。玩家的身份 roleProfiles 只能通过 identityContextPatch 更新；卧底/双重身份的真实侧必须配套 SecretFact 知情边界。',
        '声誉/口碑只在社会评价确实变化时写入 playerPatch.reputation；不要每回合自动增加知名度，也不要把普通互动都写成声誉变化。',
        '整体知名度 notoriety 与圈层知名度 visibility 的范围都是 0-1000，只代表传播度；整体口碑 overallReputation 与圈层口碑 standing 的范围都是 -100 到 100，代表评价倾向。',
        '整体口碑由你根据当前事实、圈层反应和玩家行为合理判断后写回，本地不会用公式自动计算；写 reputation 时必须给 summary 和 reason。',
        '圈层只使用 police、neighborhoodMedia、entertainment、triad、business、politics。旧的 localPublic/mediaPublic/underworld/political/oversight 会被兼容归一，但新输出不要再使用。',
        '女性 NPC 必须写 femaleProfile；femaleProfile 是女性 NPC 的扩展档案，只在 gender 为 female 时写入；它不能替代姓名、性别、年龄、身份、关系和记忆等基础字段。',
        'adultPrivateProfile 只允许写给已确认成年的女性 NPC：必须能从 birthDate 或 computedAge 判断当前年龄 >= 18；不确定或未成年时省略 adultPrivateProfile，只保留普通 femaleProfile。',
        '确认成年女性 NPC 必须生成 adultPrivateProfile；它是成年女性的香闺秘档，用于长期关系连续性和未来文生图资料。不要省略，不要只写在正文里。',
        'adultPrivateProfile 写稳定的香闺秘档：profileStatus / womb / partProfiles / fetishNotes / sensitivePoints；profileStatus 用 ready。partProfiles 固定包含 胸部 / 小穴 / 屁穴 三项，用 description 直接写该部位的 NSFW 外观、触感、敏感特征或可视细节，必须一次写具体内容。description 采用直白、具体、粗俗、可感的档案写法，不把关键部位写成含糊代称，也不要写成诗化、比喻化、生活化或恋爱关系总结；不要使用“甬道”这类女性器官隐喻，也不要用“巨物、坚硬”这类替代男性器官或勃起状态的词。三个部位 description 只能写对应部位，不得混入姓名、脸、气质、家务、职业、收入、求婚、恋爱保障、家庭背景、人物性格或关系总结。partProfiles 每项可以额外写 imagePromptAnchor；imagePromptAnchor 是独立的文生图可画标签，可保留如玉、细腻这类可画风格词、镜头词或质感词，但不得替代 description，也不得反灌到 description。fetishNotes 是“性癖”，只写成人性偏好、刺激偏好、支配/被支配、羞耻、挑逗、身体赞美等稳定性兴奋点，不得写价值观、恋爱态度、信任条件、收入、求婚或家人照顾。不要写英文状态占位、中文待补内容、无记录占位、元说明、工程说明或泛化一致性说明。womb 使用 { "status": "未受孕", "cervixStatus": "紧闭", "records": [] } 这类结构。不要写临时动作或当回合状态。',
        '普通 actorPatches[].femaleProfile.adultPrivateProfile.womb 只用于人物首次建档时的稳定基线；不得写 pregnancy、lastPregnancyCheck、pregnancyHistory，不得用 status 或 records 直接判定/覆盖怀孕。概率、随机值、验孕、孕期阶段、日期、历史和孩子建档由本地引擎独占。',
        pregnancyMode === 'off'
          ? '当前怀孕机制已关闭：不得输出 pregnancyRiskPatches；已有孕期仍会由本地日期推进。'
          : '正文明确发生可能导致受孕的成年行为时，必须写 pregnancyRiskPatches：unprotected=无保护风险，tryingToConceive=明确尝试受孕，reducedRisk=已采取避孕但仍有残余风险。只报告事件，不得自行宣布本次已经怀孕或未怀孕；同一人物同一回合最多写一条。',
        '只有正文明确发生分娩或明确妊娠终止时才写 pregnancyResolutionPatches；live_birth 只能在投喂的生命周期已进入待产窗口时写。不要用 pregnancyResolutionPatches 代替验孕，也不要自行制造流产、死产或医学异常。',
        'femaleProfile 公开字段只使用规范字段：birthday / addressToPlayer / appearanceDescription / bodyDescription / clothingStyle / personalityCore / affectionProgressionCondition / relationshipProgressionCondition / relationshipNetworkEdges。',
        'relationshipNetworkEdges 是重要女性关系网变量，格式为数组，每项 { "targetName": "人物或组织名", "relation": "关系", "note": "关系备注" }；用于记录家人、恋人、工作场所、闺蜜、保护人、债主等稳定牵连。',
        'femaleProfile 记录稳定档案真值：生日、对玩家称呼、稳定外貌、身材、常态衣着、核心性格、好感突破条件、关系突破条件和重要关系网。不要把一次性正文状态、临时恐惧、临时衣着脏污、当场动作或工程说明塞进 femaleProfile。',
        '不要使用 callSign、publicRelationship、appearanceExpansion、characterCore、relationshipAdvancementConditions、socialNetwork、emotionalBoundaries 这类别名字段；称呼写 addressToPlayer，外貌写 appearanceDescription，关系网写 relationshipNetworkEdges。',
        'NPC 记忆统一写入 actorMemories；不要再使用 actorPatches.keyMemories，也不要填写 importance。每名 NPC 每回合最多一条，也可以零条；只有该事实会在未来持续改变人物行为、关系、承诺、戒备、恩怨或对话承接时才写，普通寒暄和一次性动作不要写。',
        '在场 NPC 反应候选只是未裁定建议，不是已发生事实；可以让 NPC 有动作、眼神、打断、追问、沉默或提醒，但状态变化仍必须写结构化 writeback。',
        '远场 NPC 存在感候选只是未裁定建议，不是已发生事实；只有正文自然承接后，才允许写回关系变化、NPC 记忆、当前事项、新闻、传闻或延迟事件。',
        '金钱变化以 financePatch 为准；固定收入/支出写 upsertCashflows；灰色礼物、黑钱、人情往来写 grayLedgerPatch，灰色账本不直接改变金钱。',
        'Only write financePatch.upsertCashflows when a recurring monthly cashflow is explicitly created, changed, or ended; routine one-time spending/income must not be converted into cashflow items.',
        '物品与资产统一写入 assetPatch。只记录玩家已经拥有、控制或长期可用的物品/资产；不要把他人所有的东西写进玩家物品与资产。',
        'assetPatch.upsertItems 用稳定 itemId 新增或更新物品；同一物品不要重复造新 itemId。物品仍由玩家持有但内容变化时，复用原 itemId 更新完整对象，例如小说手稿从前三章推进到前四章。',
        'assetPatch.removeItems 用于物品离开玩家持有或控制：交给别人、寄出、提交到案件或证物袋、卖掉、丢失、销毁、消耗、归还或转入案件系统。提交案件时填写 movedToCaseId；如果玩家保留副本，必须在 summary/detail 里写清副本关系。',
        '衣着是玩家/Actor 状态，不是装备槽。普通衣着变化只写 playerPatch.clothing；有特殊意义且玩家拥有的衣物可以写成 assetPatch 物品，并在 wearable 中说明穿着摘要和意义。',
        'playerPatch.clothing 必须写成对象，currentSummary 与 mode 都必填；可再写 sourceItemId/sourceItemSignificance/lastChangedReason。不要返回纯字符串，也不要把衣物写进 playerPatch.equipment。',
        'playerPatch.clothing.mode 只能使用 duty_uniform / off_duty_plain / formal / disguise / special / sleepwear / other；不能使用 uniform、casual 等自造值。',
        '正文一旦写出玩家脱下、换上、换成、改穿、穿上、伪装或更衣等衣着变化，必须写 writeback.playerPatch.clothing；不要只在 narrativeText 里写换装。',
        '当前身份是警察不等于当前穿军装；如果玩家已明确换成便服，后续应按便服续写，直到再次通过 playerPatch.clothing 写回换装。',
        '不要按上下班时间自动换衣；只有玩家明确换装、剧情明确要求换装，或身份伪装需要时才写衣着变化。下班、轮休或离开警署本身不是自动换装依据。',
        '物品分类只使用 equipment/general/document/valuable/fixedAsset/vehicle。不要额外发明灰色、危险、需归还、已提交、待核验等标签；这些语义写入 summary/detail/evidence 或后续案件系统。',
        '证据规则：剧情中被打上 evidence 的物品默认是有效证据；只有正文明确出现程序瑕疵、来源污染、伪造嫌疑或口径冲突时，才设置 evidence.disputed=true 并写 disputeSummary。',
        '社会机构变化写 organizationPatches；人物与机构的任职、供职、会员、老板、联络等关系写 actorPatches[].organizationRelations，不要只写在正文里。',
        '大社团对玩家的态度、当前状态、组织压力或半公开结构变化写 organizationPatches；组织架构必须写 organizationPatches[].structureTree，未知职位或未知人员写“未知”；地区传闻、街面关系、关键场所和可尝试行动仍写 grayNetworkPatches。',
        'hidden 的机构关系不能在普通正文、普通 Prompt 投影和玩家 UI 中泄露；只有当玩家在剧情中合理获知后，才能改为 player_known 或 public。',
        '不要因为机构投影里出现 ICAC、律政司、法院或政府部门，就自动定罪、自动检控、自动判决、自动处分或自动结案；这些只能由明确剧情和结构化写回推动。',
        '人脉/缘份长期关系变化必须写入 relationshipThreadPatches；不要只写在正文、NPC 记忆或当前事项里。',
        '新建 relationshipThreadPatches 必须填写 creationBasis 与 evidenceRefs；repeated_contact / sustained_conflict 至少引用两项不同的有效依据。一次见面、单次盘问、普通同事、同地点出现、单条记忆或高 importance 都不能建线。更新既有 threadId 时无需重复创建依据。',
        'relationshipThread.importance 是旧数据兼容字段，不得作为创建、心跳、升温或推进依据。',
        '远场关系心跳候选只是未裁定建议，不是已发生事实；只有正文自然承接后，才允许写回关系变化、NPC 记忆、当前事项、新闻或声誉。',
        '不要把人脉/缘份关系线当成任务系统，不要生成好感度、进度条、奖励或本地完成判定。',
        '重大判定必须写 judgementCheckPatches；重大追捕、格斗、持械、枪械、人群冲突、拘捕或逃脱必须写 combatEventPatches。普通日常互动不要写判定或战斗记录。',
        'combatEventPatches.combatText 必须是过程化精彩描写，目标 180-260 字左右，写场地、光线/天气/声音、双方站位、动作反应、判定转折和现场后果；不要写成摘要、报告、参战名单或结果列表。',
        '社团与灰色网络只通过 grayNetworkPatches 更新区域灰色网络投影；不要用它替代 actorPatches/placePatches/organizationPatches 创建正式人物、地点或组织档案。',
        'grayNetworkPatches 只能记录当前身份合理可见的传闻、关系、风险和行动提示；不要把 hidden 信息、全知社团层级或未确认传闻写成确定事实。',
        '城市局势后台发展只写 citySituationTrackPatches；不要把传闻提升为确定事实，不要每回合强行新增城市压力。',
        '可以在 writeback 下追加未来模块；未知模块会被系统保留兼容或忽略，但不得替代现有字段。'
      ].join('\n')
    ),
    section('玩家输入', playerInput),
    section('成人段落输出前复核', adultRelationshipGuide),
    section('近期已完成事实（结构化权威）', recentCompletedFacts),
    `TURN_OUTPUT_JSON_EXAMPLE\n${exampleJson}`
  ].join('\n\n');
}
