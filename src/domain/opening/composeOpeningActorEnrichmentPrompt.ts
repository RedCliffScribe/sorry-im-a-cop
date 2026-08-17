import { composeOpeningBlueprintPrompt } from './composeOpeningBlueprintPrompt';
import type { LockedOpeningCast } from './openingCastDraft';
import type { OpeningLocalSkeleton } from './openingLocalSkeleton';
import { composeOpeningPrompt } from './composeOpeningPrompt';

type ComposeOpeningPromptInput = Parameters<typeof composeOpeningPrompt>[0];

function actorProfileGuide(input: ComposeOpeningPromptInput): string {
  const reference = composeOpeningBlueprintPrompt(input);
  const start = reference.indexOf('roleProfiles 必须');
  const end = reference.indexOf('OUTPUT_JSON_EXAMPLE');
  return start >= 0 && end > start
    ? reference.slice(start, end)
    : '每名人物必须生成与 currentIdentity 对应的完整 roleProfiles、六维和公开档案。';
}

export function composeOpeningActorEnrichmentPrompt(
  input: ComposeOpeningPromptInput,
  skeleton: OpeningLocalSkeleton,
  cast: LockedOpeningCast,
  targetSlotIds = cast.actors.map((actor) => actor.slotId)
): string {
  const base = composeOpeningPrompt(input);
  const contextEnd = base.indexOf('\n生成目标：');
  const context = contextEnd >= 0 ? base.slice(0, contextEnd) : base;
  const targetSet = new Set(targetSlotIds);
  const actors = cast.actors.filter((actor) => targetSet.has(actor.slotId)).map(
    ({
      actorId,
      slotId,
      name,
      gender,
      currentIdentity,
      publicIdentity,
      actualIdentitySummary,
      playerRoleRelation,
      organizationIds,
      positionSummary,
      profileSummary,
      personality,
      speechStyle,
      motivation,
      presence,
      currentPlaceId,
      currentSceneId
    }) => ({
      actorSlotId: slotId,
      actorId,
      name,
      gender,
      currentIdentity,
      publicIdentity,
      actualIdentitySummary,
      playerRoleRelation,
      organizationIds,
      positionSummary,
      profileSummary,
      personality,
      speechStyle,
      motivation,
      presence,
      currentPlaceId,
      currentSceneId
    })
  );

  return `${context}

## 开局 V2 第二阶段：逐人物完整档案

以下人物槽位、姓名、身份、机构、关系、在场状态和稳定 actorId 已由本地锁定：
${JSON.stringify(actors)}

只返回上列目标人物的补全资料，每个人物会被本地单独校验和保存。某人不合格时，
其他合法人物不会重新生成。

禁止输出或修改 actorId、name、gender、currentIdentity、publicIdentity、
actualIdentitySummary、playerRoleRelation、organizationIds、positionSummary、
presence、currentPlaceId、currentSceneId。只返回 profile 内的补全字段。

必须补全：
- birthDate（确知时）、computedAge、visualAgeAnchor；
- appearance、clothing、equipment（无装备用 []，最多三件）；
- longTermGoal、values、完整六维；
- relationshipSummary、attitudeTowardPlayer、interactionScore、
  trustTendency、entanglementSummary；
- longTermMemorySummary、recentInteractionMemory、keyMemories；
- 与真实身份对应的完整 roleProfiles；
- 女性人物的公开 femaleProfile，严禁 adultPrivateProfile；
- statusSummary、bodyConditionSummary、visibility、importance、
  worldpackActorData；
- profileSummary、personality、speechStyle、motivation 可在不改变已锁定事实的
  前提下深化，人物之间必须明显不同。

${actorProfileGuide(input)}

只返回严格 JSON：
{
  "openingSessionId": ${JSON.stringify(skeleton.openingSessionId)},
  "actors": [
    {
      "actorSlotId": "给定槽位 ID",
      "profile": {
        "englishName": "可省略",
        "aliases": [],
        "callName": "可省略",
        "birthDate": "YYYY-MM-DD，可省略",
        "computedAge": 40,
        "visualAgeAnchor": "视觉年龄锚点",
        "roleProfiles": {},
        "profileSummary": "深化后的人物摘要",
        "appearance": "外貌",
        "clothing": "衣着",
        "equipment": [],
        "personality": "有区分度的性格",
        "speechStyle": "有区分度的说话方式",
        "motivation": "当前动机",
        "longTermGoal": "长期目标",
        "values": "价值观",
        "attributes": {
          "body": 50,
          "action": 50,
          "perception": 50,
          "thinking": 50,
          "negotiation": 50,
          "will": 50
        },
        "relationshipSummary": "与玩家关系",
        "attitudeTowardPlayer": "当前态度",
        "interactionScore": 10,
        "trustTendency": "信任倾向",
        "entanglementSummary": "牵连摘要",
        "longTermMemorySummary": "长期记忆摘要",
        "recentInteractionMemory": "近期互动记忆",
        "keyMemories": [
          {
            "text": "一条确实存在且值得长期保留的具体记忆",
            "importance": 50,
            "visibility": "player_known"
          }
        ],
        "statusSummary": "当前状态",
        "bodyConditionSummary": "身体状态",
        "visibility": "player_known",
        "importance": 50,
        "worldpackActorData": {}
      }
    }
  ]
}`;
}

export function createOpeningActorEnrichmentRepairPrompt(input: {
  actorSlotId: string;
  lockedActor: LockedOpeningCast['actors'][number];
  rawProfile: Record<string, unknown>;
  issues: readonly string[];
  allowedPaths: readonly string[];
  allowedEmployerOrganizationIds?: readonly string[];
}): string {
  const identityProfile =
    input.lockedActor.currentIdentity === 'gang_member'
      ? 'triad'
      : input.lockedActor.currentIdentity;
  const roleProfileExample =
    identityProfile === 'police'
      ? {
          status: 'active',
          agencyId:
            input.lockedActor.organizationIds[0] ?? '必须使用锁定人物已有机构 ID',
          stationOrPost: '所属警署或驻地',
          department: '所属部门',
          rank: '职级',
          assignmentSummary: '当前分工',
          postRole: '稳定岗位标识',
          supervisorActorIds: [],
          peerActorIds: [],
          authoritySummary: '权限范围',
          accessSummary: '可接触资料与场所',
          dutySummary: '职责',
          institutionalReputation: '机构内声誉',
          disciplinePressureSummary: '纪律压力'
        }
      : identityProfile === 'triad'
        ? {
            status: 'active',
            organizationId:
              input.lockedActor.organizationIds[0] ??
              '必须使用锁定人物已有机构 ID',
            societyName: '社团名称',
            roleTitle: '角色称谓',
            rankSummary: '层级',
            territorySummary: '活动范围',
            patronActorIds: [],
            peerActorIds: [],
            rivalActorIds: [],
            obligationSummary: '义务',
            riskSummary: '风险'
          }
        : {
            status: 'active',
            employmentStatusId: 'retired|unemployed|self_employed|employed 等明确状态',
            publicOccupation: '公开职业或社会身份',
            positionSummary: '岗位或家庭社会位置',
            dutySummary: '日常职责',
            decisionScopeSummary: '可决定事项',
            accessSummary: '可接触资源',
            sectorIds: [],
            roleTags: [],
            livelihoodActorIds: [],
            communitySummary: '社区联系',
            familyEconomicSummary: '家庭经济位置',
            legalStatusSummary: '法律与居留状态'
          };
  const roleProfileRequested = input.allowedPaths.some((path) =>
    path.startsWith('roleProfiles.')
  );
  const femaleProfileRequested = input.allowedPaths.some((path) =>
    path.startsWith('femaleProfile')
  );
  const keyMemoriesRequested = input.allowedPaths.some((path) =>
    path.startsWith('keyMemories')
  );
  const recentInteractionMemoryRequested = input.allowedPaths.includes(
    'recentInteractionMemory'
  );
  return `只修复一名开局人物档案的指定字段，不得返回整批人物。
不得修改人物姓名、身份、机构、关系槽位、在场位置或 actorId，不得新增人物。
只返回：
{"actorSlotId":"${input.actorSlotId}","repairs":[{"path":"允许路径","value":"完整新值"}]}

锁定人物：
${JSON.stringify(input.lockedActor)}

当前 profile：
${JSON.stringify(input.rawProfile)}

校验问题：
${input.issues.map((issue) => `- ${issue}`).join('\n')}

唯一允许路径：
${input.allowedPaths.map((path) => `- ${path}`).join('\n')}

身份档案合同：
- 当前人物 currentIdentity=${input.lockedActor.currentIdentity}。
${
  roleProfileRequested
    ? `- 本次允许修复 roleProfiles.${identityProfile}；如果允许路径正是 roleProfiles.${identityProfile}，value 必须是以下形状的完整 object，而不是整个 roleProfiles 包装：
${JSON.stringify(roleProfileExample, null, 2)}
- 如果允许路径是 roleProfiles.${identityProfile}.某字段，value 只返回该字段本身。
- 同时缺少多个 roleProfiles.${identityProfile} 子字段时，也可用一条 path="roleProfiles.${identityProfile}" 返回完整 object；本地只会提取上方获授权的子字段并保留其他已通过字段。
- 受雇市民才填写 employerOrganizationId；退休、无业、自营、学生或家庭照料者不得虚构雇主。
${
  identityProfile === 'civilian' &&
  input.allowedPaths.some(
    (path) => path === 'roleProfiles.civilian.employerOrganizationId'
  )
    ? `- employerOrganizationId 只能从以下本地核验候选中选择一个：${JSON.stringify(
        input.allowedEmployerOrganizationIds ?? []
      )}。不得返回列表之外的 ID；候选为空时本地不会发起这项修复。`
    : '- 本次没有授权选择 employerOrganizationId，不得新增或改写雇主机构。'
}`
    : `- 本次没有授权修改 roleProfiles.${identityProfile}，不得返回 roleProfiles。`
}
${
  femaleProfileRequested
    ? '- 本次 femaleProfile 必须完整包含 appearanceDescription、bodyDescription、clothingStyle、personalityCore、affectionProgressionCondition、relationshipProgressionCondition、emotionalBoundary，严禁 adultPrivateProfile。'
    : '- 本次没有授权修改 femaleProfile，不得返回 femaleProfile。'
}
${
  keyMemoriesRequested
    ? `keyMemories 合同：
- keyMemories 是数组；每项必须为 {"text":"非空记忆","importance":0到100整数,"visibility":"public|player_known|private|hidden"}。
- 不得返回字符串数组，不得使用 content、memory、summary、description 代替 text；没有额外稳定记忆时返回 []。
- 若允许路径是 keyMemories.0，value 必须是一项完整对象，不是字符串；若允许路径是 keyMemories，value 必须是完整数组。`
    : '本次没有授权修改 keyMemories，不得返回 keyMemories。'
}
${
  recentInteractionMemoryRequested
    ? 'recentInteractionMemory 合同：value 必须是一段非空摘要字符串，不得返回数组、对象或 null；只整理已有近期互动事实，不得新增经历。'
    : '本次没有授权修改 recentInteractionMemory，不得返回该字段。'
}

每个允许路径都必须被直接返回，或包含在获准的父级 object 中；不得遗漏。不要 Markdown。`;
}
