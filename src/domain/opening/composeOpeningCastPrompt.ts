import {
  composeDramaticOpeningGuide,
  getDramaticOpeningSourceRef
} from '../drama/openingRegistry';
import { resolveOpeningCustomContentSupport } from '../drama/customContentProviders';
import { composeOpeningPrompt } from './composeOpeningPrompt';
import type { OpeningCastRepairIssue } from './openingCastDraft';
import type { OpeningLocalSkeleton } from './openingLocalSkeleton';

type ComposeOpeningPromptInput = Parameters<typeof composeOpeningPrompt>[0];

function getOpeningContext(input: ComposeOpeningPromptInput): string {
  const prompt = composeOpeningPrompt(input);
  const marker = '\n生成目标：';
  const markerIndex = prompt.indexOf(marker);
  return markerIndex >= 0 ? prompt.slice(0, markerIndex) : prompt;
}

export function composeOpeningCastPrompt(
  input: ComposeOpeningPromptInput,
  skeleton: OpeningLocalSkeleton
): string {
  const dramaticOpeningId = input.initialState.world.dramaticOpeningId;
  const dramaticOpeningGuide =
    composeDramaticOpeningGuide(dramaticOpeningId);
  const dramaticOpeningSourceRef =
    getDramaticOpeningSourceRef(dramaticOpeningId);
  const customSupport = dramaticOpeningId
    ? resolveOpeningCustomContentSupport({ state: input.initialState })
    : undefined;
  const supportSources = customSupport ? [customSupport.source.ref] : [];
  const dramaPlanExample =
    dramaticOpeningId && dramaticOpeningSourceRef
      ? `,\n  "dramaPlan": {
    "planId": "drama_plan_opening_${dramaticOpeningId}",
    "planningScope": "opening",
    "mode": "surface",
    "primarySource": ${JSON.stringify(dramaticOpeningSourceRef)},
    "supportSources": ${JSON.stringify(supportSources)},
    "sceneFunction": "choice",
    "intensity": "medium",
    "playerMayIgnore": true,
    "maxNewActors": 4,
    "adaptationSummary": "一句话说明怎样让所选结构适配本次开局",
    "reasonSummary": "一句话说明为什么该结构适合本次开局"
  }`
      : '';
  const allowedOrganizations = Object.values(input.initialState.organizations)
    .map((organization) => ({
      organizationId: organization.organizationId,
      name: organization.name,
      type: organization.type
    }));
  const slots = skeleton.actorSlots.map((slot) => ({
    slotId: slot.slotId,
    required: slot.required,
    allowedPlayerRoleRelations: slot.allowedPlayerRoleRelations,
    requiredOrganizationIds: slot.requiredOrganizationIds
  }));

  return `${getOpeningContext(input)}

## 开局 V2 第一阶段：最小人物蓝图

只返回一个合法 JSON object。此阶段只决定人物核心身份、人物差异、在场状态、开局事实和行动意图。
本地系统已经锁定全部稳定 ID；你只能填写给定人物槽位，绝对不要创建或输出 actorId。

本地开局会话：${skeleton.openingSessionId}
世界包：${skeleton.worldpackId}
玩家身份：${skeleton.playerIdentity}
当前地点：${skeleton.currentPlaceId}
当前场景：${skeleton.currentSceneId}
人物槽位：
${JSON.stringify(slots, null, 2)}
允许引用的机构：
${JSON.stringify(allowedOrganizations, null, 2)}
允许使用的行动 ID：
${JSON.stringify(skeleton.actionIds)}

规则：
- 每个 required=true 的人物槽位必须恰好出现一次；optional 槽位可以省略。
- 槽位规定了玩家关系时，playerRoleRelation 必须使用允许值；额外槽位不得抢占必需关系。
- requiredOrganizationIds 必须进入该人物的 organizationIds；其他机构也只能从允许机构表引用。
- present/nearby 人物必须位于当前地点和当前场景；absent/mentioned 可省略地点场景，确知远场地点时才填写。
- 可选字符串没有内容时必须省略字段，不得返回空字符串；额外人物槽位必须省略 playerRoleRelation。
- 人物姓名、公开身份和社会位置不得重复。
- actionIntents 必须使用预留行动 ID，只能引用本次实际返回的 actor slotId。
- 不得生成完整 roleProfiles、六维、女性扩展档案、装备、记忆、信任分、出生日期、经济、住所、案件、资产或事项。
${dramaticOpeningGuide ? `\n已选戏剧化开局：\n${dramaticOpeningGuide}\n` : ''}
${dramaticOpeningSourceRef ? `允许的主戏剧来源：${JSON.stringify(dramaticOpeningSourceRef)}` : ''}
${customSupport ? `允许的第一幕自定义支持来源：${JSON.stringify(customSupport.source.ref)}
支持摘要：${customSupport.source.plannerSummary}
禁止改写：${customSupport.payload.forbiddenAdaptations.join('；') || '无'}` : ''}
${dramaticOpeningId && dramaticOpeningSourceRef
  ? `本次必须输出 dramaPlan，且 planId、planningScope、primarySource、supportSources、playerMayIgnore、maxNewActors 必须逐字使用下方结构。不得省略，也不得改成普通开局。`
  : '本次未选择戏剧化开局，必须完全省略 dramaPlan。'}

输出结构严格为：
{
  "openingSessionId": ${JSON.stringify(skeleton.openingSessionId)},
  "openingFacts": {
    "situationSummary": "眼前具体处境",
    "centralMatter": "开局中心事务",
    "playerDecisionBoundary": "玩家能自主决定与不能被代替决定的边界"
  },
  "actors": [
    {
      "slotId": "给定槽位 ID",
      "name": "真实个人姓名",
      "gender": "male|female|nonbinary",
      "currentIdentity": "civilian|gang_member|police",
      "publicIdentity": "公开身份",
      "actualIdentitySummary": "真实身份摘要",
      "playerRoleRelation": "槽位允许时填写",
      "organizationIds": [],
      "positionSummary": "当前岗位或社会位置",
      "profileSummary": "精炼人物概述",
      "personality": "稳定且有区分度的性格",
      "speechStyle": "独特且符合身份的说话方式",
      "motivation": "当前动机",
      "presence": "present|nearby|mentioned|absent",
      "currentPlaceId": "在场时填写当前地点；远场确知时才填",
      "currentSceneId": "在场时填写当前场景"
    }
  ],
  "actionIntents": [
    {
      "actionId": "给定行动 ID",
      "intent": "行动意图",
      "relatedActorSlotIds": [],
      "requiredFacts": []
    }
  ]${dramaPlanExample}
}`;
}

export function createOpeningCastFieldRepairPrompt({
  input,
  skeleton,
  rawCast,
  issues
}: {
  input: ComposeOpeningPromptInput;
  skeleton: OpeningLocalSkeleton;
  rawCast: unknown;
  issues: OpeningCastRepairIssue[];
}): string {
  const dramaticOpeningId = input.initialState.world.dramaticOpeningId;
  const dramaticOpeningSourceRef =
    getDramaticOpeningSourceRef(dramaticOpeningId);
  const customSupport = dramaticOpeningId
    ? resolveOpeningCustomContentSupport({ state: input.initialState })
    : undefined;
  const expectedDramaPlan =
    dramaticOpeningId && dramaticOpeningSourceRef
      ? {
          planId: `drama_plan_opening_${dramaticOpeningId}`,
          planningScope: 'opening',
          primarySource: dramaticOpeningSourceRef,
          supportSources: customSupport ? [customSupport.source.ref] : [],
          playerMayIgnore: true,
          maxNewActors: 4
        }
      : undefined;
  const allowedPaths = [...new Set(issues.map((issue) => issue.path))];

  return `你只修复已经生成的开局最小人物蓝图中明确列出的字段，不得重返整份蓝图。
只返回合法 JSON object，不要 Markdown、正文、解释或思维过程。

本地会话与稳定 ID 已锁定：
${JSON.stringify(skeleton, null, 2)}

允许引用的机构：
${JSON.stringify(
  Object.values(input.initialState.organizations).map((organization) => ({
    organizationId: organization.organizationId,
    name: organization.name
  })),
  null,
  2
)}

原始候选（未列入允许路径的内容必须保持不变）：
${JSON.stringify(rawCast, null, 2)}

需要修复的路径与原因：
${JSON.stringify(issues, null, 2)}

唯一允许返回的路径：
${JSON.stringify(allowedPaths)}

${
  expectedDramaPlan
    ? `若允许路径包含 dramaPlan，返回完整 dramaPlan。以下字段必须逐字采用本地值，其余 mode、sceneFunction、intensity、adaptationSummary、reasonSummary 依照已选戏剧化开局填写：
${JSON.stringify(expectedDramaPlan, null, 2)}
mode 不得为 quiet；intensity 不得为 none；两个摘要各一句。`
    : '当前没有戏剧化开局，不得新增 dramaPlan。'
}

路径规则：
- 修复已有字段：actors.<slotId>.<field>、actionIntents.<actionId>.<field> 或 openingFacts.<field>。
- 缺失整个人物槽位时，actors.<slotId> 的 value 只返回该槽位的一名完整最小人物；仍不得返回 actorId 或完整人物档案。
- dramaPlan 的 value 只返回计划 object。
- 每个 repairs.path 必须逐字来自允许路径；不得增加未授权路径。
- 不得修改其他人物、行动、开局事实、稳定 ID 或玩家设定。

严格返回：
{
  "repairs": [
    {
      "path": ${JSON.stringify(allowedPaths[0] ?? 'dramaPlan')},
      "value": "该路径所需的修复值"
    }
  ]
}`;
}
