import { composeOpeningPrompt } from './composeOpeningPrompt';
import {
  composeDramaticOpeningGuide,
  getDramaticOpeningSourceRef
} from '../drama/openingRegistry';
import { resolveOpeningCustomContentSupport } from '../drama/customContentProviders';

type ComposeOpeningPromptInput = Parameters<typeof composeOpeningPrompt>[0];

function getOpeningContext(input: ComposeOpeningPromptInput): string {
  const prompt = composeOpeningPrompt(input);
  const marker = '\n生成目标：';
  const markerIndex = prompt.indexOf(marker);
  return markerIndex >= 0 ? prompt.slice(0, markerIndex) : prompt;
}

export function composeOpeningBlueprintPrompt(input: ComposeOpeningPromptInput): string {
  const playerActorId = input.initialState.player.actorId;
  const currentIdentity = input.initialState.player.currentIdentity;
  const dramaticOpeningGuide = composeDramaticOpeningGuide(
    input.initialState.world.dramaticOpeningId
  );
  const dramaticOpeningId = input.initialState.world.dramaticOpeningId;
  const dramaticOpeningSourceRef = getDramaticOpeningSourceRef(dramaticOpeningId);
  const customSupport = dramaticOpeningId
    ? resolveOpeningCustomContentSupport({ state: input.initialState })
    : undefined;
  const supportSources = customSupport ? [customSupport.source.ref] : [];
  const playerEmployerOrganizationId =
    input.initialState.actors[playerActorId]?.roleProfiles.civilian
      ?.employerOrganizationId;
  const hasRegisteredCivilianEmployer =
    Boolean(playerEmployerOrganizationId) &&
    Boolean(
      playerEmployerOrganizationId &&
        input.initialState.organizations[playerEmployerOrganizationId]
    );
  const dramaticPlanExample =
    dramaticOpeningId && dramaticOpeningSourceRef
      ? `,
  "dramaPlan": {
    "planId": "drama_plan_opening_${dramaticOpeningId}",
    "planningScope": "opening",
    "mode": "surface",
    "primarySource": ${JSON.stringify(dramaticOpeningSourceRef)},
    "supportSources": ${JSON.stringify(supportSources)},
    "sceneFunction": "choice",
    "intensity": "medium",
    "playerMayIgnore": true,
    "maxNewActors": 4,
    "adaptationSummary": "一句话说明怎样让所选结构适配当前身份、地点和人物关系",
    "reasonSummary": "一句话说明为什么该结构适合本次开局"
  }`
      : '';
  const openingRelationContract =
    currentIdentity === 'gang_member'
      ? '必须生成且只能生成一名 playerRoleRelation="triad_patron" 的直属上线，以及一名 playerRoleRelation="triad_peer" 的同组成员；两人都必须有完整 triad roleProfiles。'
      : currentIdentity === 'police'
        ? '必须至少生成一名 playerRoleRelation="police_supervisor" 或 "police_peer" 的警队工作关系人物，并为其填写完整 police roleProfiles。'
        : hasRegisteredCivilianEmployer
          ? `必须至少生成一名 playerRoleRelation="civilian_work_relation" 的稳定职业关系人物，并绑定已登记雇主 ${playerEmployerOrganizationId}。`
          : '玩家没有已登记的正式雇主机构；必须至少生成一名 playerRoleRelation="civilian_social_relation" 的稳定朋友、邻居、房东、顾客、街坊、亲属或一般行业联系人，不得伪造工作机构。';
  const examplePlayerRoleRelation =
    currentIdentity === 'gang_member'
      ? 'triad_patron'
      : currentIdentity === 'police'
        ? 'police_peer'
        : hasRegisteredCivilianEmployer
          ? 'civilian_work_relation'
          : 'civilian_social_relation';

  return `${getOpeningContext(input)}

## 第一阶段：开局人物与剧情蓝图

只返回一个合法 JSON object。此阶段不写正式长篇正文，不生成案件、证据、资产、现金流、压力或其他运行态。
先完整确定开局需要的真实人物，再确定他们为何在场、当前中心事务、玩家选择边界和 2 至 4 个行动意图。
所有标为“可省略”或对当前身份不适用的字段必须直接省略，绝对不要输出 null；非警察玩家必须省略 playerPresentationPatch.policeNumber。

当前玩家稳定 actorId：${playerActorId}
当前玩家公开身份：${currentIdentity}
本次身份合同（属于质量门禁，不能省略）：${openingRelationContract}
${dramaticOpeningGuide ? `\n## 已选戏剧化开局结构\n${dramaticOpeningGuide}\n` : ''}
${customSupport ? `
## 玩家明确选择的第一幕自定义支持内容

来源引用：${JSON.stringify(customSupport.source.ref)}
标题：${customSupport.source.title}
规划摘要：${customSupport.source.plannerSummary}
执行载荷：
${customSupport.payload.detailedContext}

已成立事实（只允许按这些事实承接）：
${customSupport.payload.confirmedFacts.map((item) => `- ${item}`).join('\n') || '- 无；该内容尚未成为本局事实。'}

可调整部分：
${customSupport.payload.mutableElements.map((item) => `- ${item}`).join('\n') || '- 无'}

禁止改写：
${customSupport.payload.forbiddenAdaptations.map((item) => `- ${item}`).join('\n') || '- 无'}
` : ''}

输出结构必须严格为：
{
  "openingSessionId": "opening_稳定随机ID",
  "openingFacts": {
    "placeId": "当前地点ID",
    "sceneId": "当前场景ID",
    "situationSummary": "眼前具体处境",
    "centralMatter": "开局中心事务",
    "playerDecisionBoundary": "玩家能自主决定与不能被代替决定的边界"
  },
  "playerPresentationPatch": {
    "name": "可省略",
    "englishName": "可省略",
    "policeNumber": "仅警察适用",
    "clothing": "具体衣着",
    "equipment": ["最多三项"],
    "statusSummary": "当前外显状态"
  },
  "initialActors": [
    {
      "actorId": "稳定且可复用的ID",
      "name": "真实个人姓名",
      "englishName": "可省略",
      "aliases": [],
      "callName": "可省略",
      "gender": "male|female|nonbinary",
      "birthDate": "可省略",
      "computedAge": 35,
      "visualAgeAnchor": "明确的视觉年龄锚点",
      "currentIdentity": "civilian|gang_member|police",
      "publicIdentity": "公开身份",
      "actualIdentitySummary": "真实身份摘要",
      "roleProfiles": {},
      "playerRoleRelation": "${examplePlayerRoleRelation}",
      "organizationIds": [],
      "positionSummary": "当前岗位或社会位置",
      "profileSummary": "完整人物概述",
      "appearance": "具体外貌",
      "clothing": "具体衣着",
      "equipment": [],
      "personality": "稳定而有区分度的性格",
      "speechStyle": "独特且符合身份的说话方式",
      "motivation": "当前动机",
      "longTermGoal": "长期目标",
      "values": "价值观与底线",
      "attributes": {
        "body": 50,
        "action": 50,
        "perception": 50,
        "thinking": 50,
        "negotiation": 50,
        "will": 50
      },
      "relationshipSummary": "与玩家的实际关系",
      "attitudeTowardPlayer": "当前态度",
      "interactionScore": 0,
      "trustTendency": "信任倾向",
      "entanglementSummary": "当前牵连",
      "longTermMemorySummary": "开局前已经成立的长期记忆",
      "recentInteractionMemory": "最近一次真实互动或当前初见事实",
      "keyMemories": [
        {
          "text": "可选的额外稳定记忆；没有时直接使用空数组",
          "importance": 60,
          "visibility": "player_known"
        }
      ],
      "statusSummary": "当前状态",
      "bodyConditionSummary": "可省略；若填写必须具体",
      "presence": "present|nearby|mentioned|absent",
      "currentPlaceId": "present/nearby 必填；absent/mentioned 仅在确知远场地点时填写",
      "currentSceneId": "present/nearby 必填；absent/mentioned 可省略",
      "visibility": "public|player_known|private|hidden",
      "importance": 50,
      "worldpackActorData": {}
    }
  ]${dramaticPlanExample},
  "actionIntents": [
    {
      "actionId": "opening_action_1",
      "intent": "玩家可选择的行动意图，不是最终按钮文案",
      "relatedActorIds": [],
      "requiredFacts": ["该行动成立所需事实"]
    }
  ]
  }

戏剧计划规则：
- ${
    dramaticOpeningId && dramaticOpeningSourceRef
      ? `本次已经选择戏剧化开局，必须输出 dramaPlan；planId、planningScope、primarySource、supportSources、playerMayIgnore 和 maxNewActors 必须严格使用上方值。mode、sceneFunction、intensity、adaptationSummary 和 reasonSummary 按本次实际开局选择，但两个摘要都只能是一句话。`
      : '本次没有选择戏剧化开局，必须完全省略 dramaPlan，保持原有开局行为。'
  }
- dramaPlan 只编排第一幕，不写正文、对白、思维过程、人物档案或世界事实。
- supportSources 最多一项，且只能逐字使用上方玩家明确选择并已通过适配的自定义来源；没有该小节时必须为空数组。
- 自定义支持内容只是可拒绝、可偏转的第一幕辅助；不得冒充已经发生的本局事实。
- 事件支持内容所需人物已经包含在执行载荷中；如需创建或复用人物，必须使用载荷给出的稳定 Runtime Actor ID，且仍计入 maxNewActors=4 的总上限。
- 不得在 dramaPlan 中新增 Storypack、影视人物、其他自定义来源、任务或写回；不得把尚未发生的结果写进摘要。

roleProfiles 必须只放与人物真实身份对应的完整对象（卧底事实已经成立时才允许同时存在另一份隐藏/掩护档案），不要复制空对象。合法形状如下：

人物引用规则：
- 当前玩家的稳定 actorId 是 ${playerActorId}。
- supervisorActorIds、peerActorIds、patronActorIds、rivalActorIds、livelihoodActorIds 和 actionIntents.relatedActorIds 只能引用当前玩家、当前 Runtime 已存在人物，或本蓝图 initialActors 中已经声明的 actorId。
- 不得根据玩家姓名临时创造另一个玩家 actorId。
- interactionScore 只能填写 0—100 的整数，表示接触频率和牵连深浅，不是好感度；敌意、戒备、恐惧等倾向写入 attitudeTowardPlayer、relationshipSummary、trustTendency 或 entanglementSummary，禁止使用负数。
- keyMemories 是非核心补充；两类核心记忆摘要已经完整且没有额外稳定记忆时使用 []。如填写，只允许 {"text":"具体记忆","importance":0到100整数,"visibility":"public|player_known|private|hidden"}，不得使用 content 字段。

playerRoleRelation 规则：
- 只允许 police_supervisor、police_peer、triad_patron、triad_peer、civilian_work_relation、civilian_social_relation 这六个精确值。
- 承担本次身份合同的人物必须填写；不承担这六类合同的其他人物必须省略整个 playerRoleRelation 字段。
- 严禁自创 civilian_customer、supplier、friend、colleague 或其他新值；具体业务关系写入 relationshipSummary 和 roleProfiles。

警察：
{
  "police": {
    "status": "active",
    "agencyId": "警队组织ID，且必须同时进入 organizationIds",
    "stationOrPost": "驻点",
    "department": "部门",
    "rank": "职级",
    "assignmentSummary": "当前分工",
    "postRole": "稳定岗位ID或岗位摘要",
    "supervisorActorIds": [],
    "peerActorIds": [],
    "authoritySummary": "权限边界",
    "accessSummary": "可接触资料与资源",
    "dutySummary": "日常职责",
    "institutionalReputation": "机构内评价",
    "disciplinePressureSummary": "纪律与程序压力"
  }
}

社团：
{
  "triad": {
    "status": "active",
    "organizationId": "所属社团ID，且必须同时进入 organizationIds",
    "societyName": "社团名称",
    "roleTitle": "实际职务",
    "rankSummary": "组织层级",
    "territorySummary": "活动区域与边界",
    "patronActorIds": [],
    "peerActorIds": [],
    "rivalActorIds": [],
    "obligationSummary": "组织责任",
    "riskSummary": "当前风险"
  }
}

市民：
{
  "civilian": {
    "status": "active",
    "employmentStatusId": "employed|self_employed|freelance|unemployed 等稳定状态",
    "publicOccupation": "公开职业",
    "workplacePlaceId": "工作地点ID，可按真实情况省略",
    "employerOrganizationId": "受雇者必须填写，且必须同时进入 organizationIds；自营、自由职业或无业可省略",
    "positionSummary": "实际位置",
    "dutySummary": "日常职责",
    "decisionScopeSummary": "可以自行决定的事情",
    "accessSummary": "可接触的信息与资源",
    "sectorIds": [],
    "roleTags": [],
    "livelihoodActorIds": [],
    "communitySummary": "社区接触面",
    "familyEconomicSummary": "家庭经济牵连",
    "legalStatusSummary": "法律与公开身份状态"
  }
}

女性人物必须额外填写 femaleProfile，且只能是公开档案：
{
  "appearanceDescription": "公开外貌描述",
  "bodyDescription": "非露骨的公开体态描述",
  "clothingStyle": "稳定衣着风格",
  "personalityCore": "人物性格核心",
  "affectionProgressionCondition": "好感自然变化条件",
  "relationshipProgressionCondition": "关系自然推进条件",
  "emotionalBoundary": "情感边界",
  "source": "opening"
}
严禁输出 femaleProfile.adultPrivateProfile；其他性别省略 femaleProfile。

人物核心质量要求：
- 所有可选字段无内容时直接省略，不得写 null；aliases、keyMemories 没有内容时使用 []，worldpackActorData 没有内容时使用 {}。
- initialActors 数量由当前开局事实和身份合同决定，不得为节省输出删人。
- 每名人物必须完整交付身份、人格、动机、长期目标、价值观、关系、态度、信任、牵连、长短期记忆、状态、六维、在场状态、可见性和重要度。
- 禁止“待生成”“随剧情明确”“开局生成人物”“需要通过后续判断”等占位内容。
- 不同人物的人格、说话方式、动机、价值观和六维必须真实区分。
- present/nearby 人物必须同时有 currentPlaceId 和 currentSceneId。
- absent/mentioned 人物可以省略 currentPlaceId 和 currentSceneId，表示当前不在开局现场或位置未知；不得为了补字段而复制玩家的开局地点。
- absent/mentioned 只有在远场地点确实已知时才填写稳定 currentPlaceId；填写 currentSceneId 时必须同时填写与之匹配的 currentPlaceId。
- equipment 没有内容时应写 []；若省略，本地只会按空数组处理，禁止写 null 或虚构随身物品。
- 社团开局必须且只能有一名 triad_patron 和一名 triad_peer；有正式雇主的市民开局至少有一名 civilian_work_relation，没有正式雇主的市民开局至少有一名 civilian_social_relation；警察开局至少有一名 police_supervisor 或 police_peer。
- 第二阶段将锁定并原样复用这些人物，因此此处不得漏交核心字段。`;
}

export function createOpeningBlueprintRetryPrompt(
  originalPrompt: string,
  issues: string[],
  compact = false
): string {
  return `${originalPrompt}

## 第一阶段完整重生成（第 1/1 次）
上一份人物蓝图未通过：
${issues.map((issue) => `- ${issue}`).join('\n')}

请重新返回完整 OpeningBlueprint，不要只返回补丁。
${compact ? '使用紧凑 JSON、删除缩进和重复说明，但不得减少人物、人物核心字段或行动意图。' : ''}
地点合同：present/nearby 必须同时填写 currentPlaceId 与 currentSceneId；absent/mentioned 可同时省略，且不得复制玩家地点冒充远场位置。
装备合同：没有随身装备时写 []；字段省略只等同于空数组。
禁止使用默认占位语掩盖缺失。`;
}
