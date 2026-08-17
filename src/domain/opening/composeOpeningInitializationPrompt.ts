import type { NarrativeLengthLevel } from '../settings/narrativeLength';
import { getNarrativeLengthProfile } from '../settings/narrativeLength';
import { dramaPlanSchema } from '../drama/planner';
import type { ExecutionPayload } from '../drama/types';
import type { OpeningBlueprint } from './openingBlueprintSchema';

export interface OpeningInitializationContext {
  playerActorId: string;
  currentIdentity: 'civilian' | 'gang_member' | 'police';
  originBackground: {
    originBackgroundId: string;
    name: string;
    definition: string;
    backgroundSummary: string;
  };
  currentRoleProfile?: unknown;
  lawIdentity?: unknown;
  initialEconomy: {
    cashOnHand: number;
    bankBalance: number;
    monthlyPressure: number;
    financeSummary: string;
  };
  openingNote?: string;
  initialActorIds: string[];
  initialOrganizationIds: string[];
  openingCustomSupport?: ExecutionPayload;
}

export function composeOpeningInitializationPrompt(
  blueprint: OpeningBlueprint,
  narrativeLengthLevel?: NarrativeLengthLevel,
  context?: OpeningInitializationContext
): string {
  const profile = getNarrativeLengthProfile(narrativeLengthLevel);
  const safeOpeningTarget =
    Math.ceil((profile.openingMinimum * 1.25) / 50) * 50;
  const defaultMatterKind =
    context?.currentIdentity === 'police'
      ? 'police_work'
      : context?.currentIdentity === 'civilian'
        ? 'livelihood'
        : 'social';
  const civilianWorkRelationIds = blueprint.initialActors
    .filter((actor) => actor.playerRoleRelation === 'civilian_work_relation')
    .map((actor) => actor.actorId);
  const civilianSocialRelationIds = blueprint.initialActors
    .filter((actor) => actor.playerRoleRelation === 'civilian_social_relation')
    .map((actor) => actor.actorId);
  const civilianAnchorRelationIds =
    civilianWorkRelationIds.length > 0
      ? civilianWorkRelationIds
      : civilianSocialRelationIds;
  const triadPatronId = blueprint.initialActors.find(
    (actor) => actor.playerRoleRelation === 'triad_patron'
  )?.actorId;
  const triadPeerId = blueprint.initialActors.find(
    (actor) => actor.playerRoleRelation === 'triad_peer'
  )?.actorId;
  const requiredMatterActorIds =
    context?.currentIdentity === 'civilian'
      ? civilianAnchorRelationIds.slice(0, 1)
      : context?.currentIdentity === 'gang_member'
        ? [triadPatronId, triadPeerId].filter((actorId): actorId is string =>
            Boolean(actorId)
          )
        : [];
  const defaultMatterSource =
    context?.currentIdentity === 'civilian'
      ? 'opening_livelihood'
      : context?.currentIdentity === 'gang_member'
        ? 'triad_responsibility'
        : 'opening';
  const matterActorReferenceExample =
    requiredMatterActorIds.length > 0
      ? `\n    "relatedActorIds": ${JSON.stringify(requiredMatterActorIds)},`
      : '';
  const identityMatterContract =
    context?.currentIdentity === 'civilian'
      ? `- 市民开局必须且只能输出一条 matterKind="livelihood" 的 currentMatterPatches；有正式职业关系时优先关联职业人物，否则可关联第一阶段稳定社会关系人物：${JSON.stringify(civilianAnchorRelationIds)}。`
      : context?.currentIdentity === 'gang_member'
        ? `- 社团开局必须且只能输出一条 source="triad_responsibility" 的 currentMatterPatches；relatedActorIds 必须同时包含直属上线和同组成员：${JSON.stringify(requiredMatterActorIds)}。`
        : '';
  const suggestedActionExample = blueprint.actionIntents.map((action, index) => ({
    actionId: action.actionId,
    text: `与行动意图 ${index + 1} 对应的完整玩家行动文案`
  }));
  const parsedDramaPlan = dramaPlanSchema.safeParse(blueprint.dramaPlan);
  const dramaPlan = parsedDramaPlan.success ? parsedDramaPlan.data : undefined;
  const dramaTraceExample = dramaPlan
    ? `,
  "dramaExecutionTrace": {
    "planId": "${dramaPlan.planId}",
    "status": "used_as_texture",
    "usedSourceRefs": ${
      dramaPlan.primarySource ? JSON.stringify([dramaPlan.primarySource]) : '[]'
    },
    "resultingWritebackRefs": [],
    "customEventProgress": []
  }`
    : '';
  const dramaTraceContract = dramaPlan
    ? `
- 本蓝图包含已通过本地校验的 dramaPlan。必须在 suggestedActions 后返回 dramaExecutionTrace，真实回报本次是否采用该计划。
- planId 必须是 "${dramaPlan.planId}"；usedSourceRefs 只能从 primarySource 与 supportSources 中选择，不得自造来源。
- not_used 不得填写 usedSourceRefs 或 resultingWritebackRefs；used_as_texture / partially_used 不得声明持久写回。
- 只有所选结构确实通过本次开局的 Actor、CurrentMatter、Case、DeferredEvent、Player、Finance 或 Asset 等既有结构进入世界时，才使用 used_persistently，并用 {"kind":"...","id":"..."} 指向本次真实提交的对象。
- 非自定义事件来源或非 used_persistently 时，customEventProgress 必须为 []。若本次确实推进自定义事件，只能回报当前实例和阶段，supportingWritebackRefs 必须是 resultingWritebackRefs 的子集；结构为 {"instanceId":"来源 sourceId","stageId":"当前阶段","usedNodeIds":[],"decision":"stay|advance|complete|diverge","supportingWritebackRefs":[{"kind":"...","id":"..."}],"factStateChanges":[]}。advance 必须另填 nextStageId。
- dramaExecutionTrace 不是世界事实，不写解释、正文或思维过程。`
    : `
- 本蓝图没有有效 dramaPlan，必须完全省略 dramaExecutionTrace。`;
  const contextGuide = context
    ? `
以下是第二阶段只读的开局前运行态锚点。它们只用于生成经济、住所、声誉、案件、事项等运行态，不得用于改写第一阶段人物：
${JSON.stringify({
  ...context,
  openingCustomSupport: undefined
})}

- openingNote 是玩家明确提交的开局补充要求；其中已经确定的合法经济事实必须在 playerStatePatch.economy 中准确保留。
- originBackground、currentRoleProfile 与 lawIdentity 是推导开局住所、资金和生活压力的事实依据。
- initialEconomy 是开局前尚未完成生成的兼容占位，不是本次开局的最终经济事实；必须结合身份、背景、蓝图和 openingNote 生成完整经济状态。
- initialActorIds 和 initialOrganizationIds 是已经存在的稳定 ID，可被运行态引用，但不得据此新造或重写人物档案。
`
    : '';
  const openingCustomSupport = context?.openingCustomSupport;
  const customSupportGuide = openingCustomSupport
    ? `
## 已通过本地校验的第一幕自定义支持执行载荷

来源引用：${JSON.stringify(openingCustomSupport.ref)}

详细上下文：
${openingCustomSupport.detailedContext}

已成立事实（只允许承接，不得扩大）：
${openingCustomSupport.confirmedFacts.map((item) => `- ${item}`).join('\n') || '- 无；该内容尚未成为本局事实。'}

可调整部分：
${openingCustomSupport.mutableElements.map((item) => `- ${item}`).join('\n') || '- 无'}

禁止改写：
${openingCustomSupport.forbiddenAdaptations.map((item) => `- ${item}`).join('\n') || '- 无'}

- 这份载荷只服务于蓝图中已经校验通过的唯一 supportSources，不得引入 Storypack、其他自定义内容或未选择来源。
- 事件所需人物必须复用载荷与 OpeningBlueprint 给出的稳定 Runtime Actor ID，不得在第二阶段新造、替换或重写人物。
- 自定义内容仍只是玩家可拒绝、可偏转的第一幕辅助；未通过本次正文和合法运行态字段实际建立的内容，不得写成已经发生的世界事实。
`
    : '';
  return `你正在完成一个已经锁定人物设定的两阶段游戏开局。

以下 OpeningBlueprint 已通过严格校验，属于不可改写的第一阶段事实：
${JSON.stringify(blueprint)}
${contextGuide}
${customSupportGuide}

## 第二阶段：正式正文、行动选项和运行态

## 最高优先级：先完成足量正文

- 先在 narrativeText 中完整写出 ${safeOpeningTarget} 个左右的可见中文字符，再写 suggestedActions 和运行态字段。
- 本档允许范围是 ${profile.openingTarget} 个中文字符，硬性下限是 ${profile.openingMinimum}；请按 ${safeOpeningTarget} 个左右生成，为字符计数留出余量。
- “可见字符”按去除【旁白】、【角色名】等标签及所有空白后逐字计数；JSON、行动选项、记忆摘要和其他结构化字段不计入正文篇幅。
- 输出前在内部核对 narrativeText 篇幅；不足时先围绕同一现场补充有效的动作过程、既有人物回应、信息交换、现实限制和直接后果，达到篇幅后才结束 JSON。
- 不得用重复反应、同义改写、五感清单、无关路人或新造危机凑字数，也不得替玩家作出新的决定。

只返回一个合法 JSON object，字段顺序必须为：
1. openingSessionId
2. narrativeText
3. presentationHints（可选轻量演出语义）
4. suggestedActions
5. dramaExecutionTrace（仅蓝图包含有效 dramaPlan 时）
6. playerStatePatch（每次开局必填）
7. 其余可选运行态字段

严格输出结构：
{
  "openingSessionId": "${blueprint.openingSessionId}",
  "narrativeText": "可直接显示给玩家的正式开局正文",
  "presentationHints": {
    "dialogueEmotions": ["serious", "worried"],
    "innerMonologueEmotions": []
  },
  "suggestedActions": ${JSON.stringify(suggestedActionExample, null, 2)}${dramaTraceExample},
  "playerStatePatch": {
    "vitals": {
      "health": 100,
      "maxHealth": 100,
      "stamina": 100,
      "maxStamina": 100,
      "conditionSummary": "状态正常。",
      "conditionPersistence": "stable"
    },
    "economy": {
      "cashOnHand": 800,
      "bankBalance": 5000,
      "monthlyPressure": 35,
      "financeSummary": "结合本次人物身份与背景生成的具体个人财务摘要"
    },
    "homeBase": {
      "placeId": "place_player_home_稳定ID",
      "placeName": "具体住所名称",
      "regionId": "具体地区稳定ID",
      "housingType": "具体住房类型",
      "summary": "具体居住条件与位置摘要",
      "householdSummary": "具体同住情况；独居时也要明确写出"
    }
  },
  "memories": [
    {
      "text": "唯一一条完整、客观、可供后续回合使用的开局事实摘要",
      "kind": "turn",
      "relatedActorIds": [],
      "relatedCaseIds": [],
      "relatedPlaceIds": ["${blueprint.openingFacts.placeId}"],
      "relatedOrganizationIds": [],
      "importance": 80,
      "visibility": "player_known",
      "certainty": "fact"
    }
  ]
}

以下字段仅在确有内容时追加，并必须使用现有运行态 Schema 的真实对象或数组形状；没有内容时整个字段省略，禁止用“可选”、字符串占位、空数组或空对象代替：
- financePatch（只用于市民、社团或其他非警察身份的合法固定收入）
- secretFacts
- pressureSeeds
- grayLedger
- casePatches
- caseEvidencePatches
- currentMatterPatches
- deferredEventPatches
- assetPatch

playerStatePatch.vitals 只在开局正文确实建立了受伤、病弱、宿醉、疲劳或其他非默认身体状态时修改；默认状态保持示例值。conditionPersistence 只允许 stable|transient|persistent|unknown：正常稳定状态用 stable，短期疲劳/宿醉用 transient，持续伤病用 persistent，确实无法判断才用 unknown。不得让生命、体力已经满值而 conditionSummary 永久保留一个没有持续依据的短期状态。

currentMatterPatches 如需输出，必须使用以下精确对象形状；id 为稳定非空字符串，priority 必须是 0 至 100 的整数，不能写“高/中/低”：
[
  {
    "id": "matter_opening_稳定ID",
    "title": "事项标题",
    "summary": "当前已经成立的事项事实",
    "status": "active",
    "priority": 60,
    "visibility": "known",
    "source": "${defaultMatterSource}",
    "matterKind": "${defaultMatterKind}",${matterActorReferenceExample}
    "pressureLevel": 1,
    "responseWindow": "open",
    "consequenceHint": "不处理时可能自然发生的后果",
    "currentHook": "玩家眼下可以接触的切入点",
    "unread": true
  }
]
status 只允许 active|dormant|resolved|archived；visibility 只允许 known|hidden；matterKind 只允许 personal|police_work|livelihood|relationship|family|social|risk|opportunity|case|world；pressureLevel 只允许 0|1|2|3；responseWindow 只允许 now|today|soon|open。可选引用数组只能引用已知稳定 ID，没有引用时省略该字段。

硬性要求：
- openingSessionId 必须与蓝图完全一致。
- narrativeText 目标 ${profile.openingTarget} 个中文字符，绝对不得少于 ${profile.openingMinimum} 个中文字符；不得因为结构化字段较多而缩短正文。
- presentationHints 可省略；提供时 dialogueEmotions 与 innerMonologueEmotions 分别按正文中对话和【内心】的出现顺序填写，只使用 neutral/happy/excited/ecstatic/sad/angry/surprised/serious/worried/afraid/embarrassed/shy/tired/thinking/secretive，不复制正文、角色名或 actorId。
- suggestedActions 必须与蓝图 actionIntents 一一对应，actionId 不增、不减、不改，只把 intent 写成自然、具体、可点击的玩家行动。
- 正文中的人物身份、性格、说话方式、关系、动机、记忆、外貌、衣着、状态和在场位置必须与蓝图一致。
- 严禁输出 initialActors、NPC 人格字段、NPC 关系字段、NPC 记忆摘要或任何新稳定人物。
- 严禁覆盖蓝图中的玩家姓名、英文名、警员编号、衣着、装备和外显状态。
- 不输出空数组或空对象；没有内容的可选字段直接省略。
- 警察工资完全由本地薪资表产生，不得在 financePatch 重复生成。
- playerStatePatch 每次都必须存在，并且必须同时包含完整 economy 与完整 homeBase；即使其他可选运行态没有内容，也不得省略这两块。
- playerStatePatch.economy 必须完整使用 {"cashOnHand":整数,"bankBalance":整数,"monthlyPressure":0到100整数,"financeSummary":"摘要"}；现金与银行存款不得混写，不能沿用“开局待生成”等占位。
- playerStatePatch.homeBase 必须完整使用 {"placeId":"稳定ID","placeName":"名称","regionId":"地区稳定ID","housingType":"住房类型","summary":"住所摘要","householdSummary":"同住情况"}；不得使用 unknown、开局待生成、待补充等占位。
- 资金和住所必须依据当前身份、出身背景、角色资料、蓝图与 openingNote 形成相互一致的具体事实。只有这些事实明确建立身无分文时，cashOnHand 与 bankBalance 才可以同时为 0。
- 所有港币金额使用整数，允许范围为 0 至 99999999999；openingNote 明确给出的合法金额必须原值写入，不得自行缩小、取整到别的数量级或改写为现金。
- memories 必须且只能有一条 kind=turn 的开局事实摘要；其他独立事实使用对应 kind。
${dramaTraceContract}
${identityMatterContract}`;
}

export function createOpeningInitializationRetryPrompt(
  originalPrompt: string,
  issues: string[],
  compact = false
): string {
  const narrativeLengthIssue = issues.find((issue) =>
    issue.includes('低于当前档位最低')
  );
  const narrativeRetryGuide = narrativeLengthIssue
    ? `
## 正文篇幅合同失败（本次重生成的最高优先级）
${narrativeLengthIssue}
上一份候选不会写入存档。必须从头返回完整对象，不得续写或只补一段；先完成原 Prompt 要求的正文安全目标并在内部逐字核对，再输出其余字段。不得降低正文标准、删减运行态、重复灌水或新造无关事件。`
    : '';
  return `${originalPrompt}

## 第二阶段完整重生成（第 1/1 次）
上一份开局正文或运行态未通过：
${issues.map((issue) => `- ${issue}`).join('\n')}
${narrativeRetryGuide}

请重新返回完整 OpeningInitialization，不要只返回补丁，不要输出 initialActors。
无论上一份失败发生在正文、记忆或其他可选字段，都必须重新返回完整 playerStatePatch.economy 与 playerStatePatch.homeBase；禁止为了通过重试而降级成只有正文、行动和记忆的最小对象。
${compact ? '使用紧凑 JSON、删除缩进、空数组、空对象和重复表述，但正文仍不得低于既定最低篇幅，运行态和引用也不得删减。' : ''}`;
}
