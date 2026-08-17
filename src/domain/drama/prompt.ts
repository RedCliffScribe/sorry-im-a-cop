import type { PromptContext } from '../context/selectContext';
import { getProjectedDramaPayload } from './sourceRegistry';
import { allDramaPlanningSources } from './assemblePlanningContext';
import { cloneNarrativeArcStageContext } from './narrativeArc';
import {
  dramaSourceKey,
  type DramaPayloadResolutionOptions,
  type DramaPlan,
  type DramaPlanningContext,
  type DramaSourceRef,
  type ExecutionPayload,
  type ForegroundContract
} from './types';
import { describeDramaPacing } from './settings';

export type DramaPayloadResolver = (
  context: PromptContext,
  ref: DramaSourceRef,
  options?: DramaPayloadResolutionOptions
) => ExecutionPayload | undefined;

export function resolveSelectedDramaPayloads({
  context,
  planningContext,
  plan,
  resolvePayload = getProjectedDramaPayload
}: {
  context: PromptContext;
  planningContext: DramaPlanningContext;
  plan?: DramaPlan;
  resolvePayload?: DramaPayloadResolver;
}): ExecutionPayload[] {
  if (!plan) return [];
  const refs = [
    ...(plan.primarySource ? [plan.primarySource] : []),
    ...plan.supportSources
  ];
  const candidates = allDramaPlanningSources(planningContext);
  const resolutionRequests = refs.flatMap((ref) => {
    const candidate = candidates.find(
      (item) => dramaSourceKey(item.ref) === dramaSourceKey(ref)
    );
    const evidenceRefs = candidate?.evidenceRefs?.length ? candidate.evidenceRefs : [ref];
    const options = candidate?.arcStageContext
      ? { narrativeArc: cloneNarrativeArcStageContext(candidate.arcStageContext) }
      : undefined;
    return evidenceRefs.map((evidenceRef) => ({
      ref: evidenceRef,
      options
    }));
  });
  return Array.from(
    new Map(
      resolutionRequests.map((request) => [dramaSourceKey(request.ref), request])
    ).values()
  )
    .map((request) => resolvePayload(context, request.ref, request.options))
    .filter((payload): payload is ExecutionPayload => Boolean(payload));
}

export function formatDramaExecutionPrompt({
  context,
  planningContext,
  plan,
  contract,
  resolvePayload
}: {
  context: PromptContext;
  planningContext: DramaPlanningContext;
  plan: DramaPlan;
  contract: ForegroundContract;
  resolvePayload?: DramaPayloadResolver;
}): string {
  const payloads = resolveSelectedDramaPayloads({
    context,
    planningContext,
    plan,
    ...(resolvePayload ? { resolvePayload } : {})
  });
  const containsNarrativeArcContinuation = payloads.some(
    (payload) => Boolean(payload.currentStageId && !payload.initialStageId)
  );
  return [
    'DRAMA_ORCHESTRATION',
    `长期节奏：${planningContext.pacing}`,
    `规划路由：${planningContext.planningRoute ?? 'auto'}`,
    `节奏偏好：${describeDramaPacing(planningContext.settings)}`,
    `计划：${JSON.stringify(plan)}`,
    `前台契约：${JSON.stringify(contract)}`,
    `执行载荷：${JSON.stringify(payloads)}`,
    ...(planningContext.narrativeArcSummaries?.length
      ? [
          `已曝光剧情弧摘要（只保留当前阶段与未解决方向，不代表本回合必须推进）：${JSON.stringify(
            planningContext.narrativeArcSummaries
          )}`
        ]
      : []),
    '规则：计划只是本回合的编排建议，不是世界事实；事实仍以正文已经成立的内容和既有结构化 writeback 为准。',
    '规则：计划不是世界事实，但合法的非 quiet 计划是本回合预期采用的前台方向；只要不违背玩家当前行动、现场真值、既有事实或写回约束，应自然落实所选载荷。',
    '规则：到期事项和已经成立的后果优先；不要为了戏剧性忽略玩家当前行动。',
    '规则：静态种子只提供可能性，不自动宣布人物出现、关系成立或事件发生。',
    ...(planningContext.planningMode === 'official_dlc_only'
      ? [
          '规则：本回合处于官方 DLC 窄路由；若执行载荷为 continuation，必须承接已曝光 Arc 的持久阶段与有据进展，不得重做首次曝光；若为 first_exposure，只可自然引入轻量来源。两者都不得把完整阶段、全部人物或新闻模板写成已发生事实，玩家可以忽略或延后该内容。'
        ]
      : []),
    ...(containsNarrativeArcContinuation
      ? [
          '规则：本回合包含已曝光持续剧情弧的 continuation 载荷；必须延续同一 source、同一事件和已有稳定 Runtime ID，不得重新执行首次曝光，不得把同一弧线改写成第二宗同类报案、平行案件或换名复制的人物班底。'
        ]
      : []),
    `规则：只有计划与玩家当前行动、现场真值、既有事实或合法写回发生实质冲突时才不采用；不采用时仍须保留正常正文与合法写回，并在顶层 dramaExecutionTrace 中返回 not_used，planId 必须填写 "${plan.planId}"。`,
    '规则：不要重复返回 dramaPlan；前台方向已经在本请求前确定。',
    '规则：正文前台只允许一个主要剧情弧；支持素材只能服务于同一现场，不得把无关案件、组织、关系和远场人物并列推进。',
    `规则：本回合最多引入 ${contract.maxNewActors} 名与当前计划直接相关的新人物，最多新增 ${contract.maxNewDurableThreads} 条与计划直接相关的持久事项或关系线。身份去重、合法 Actor 修复和到期强制事项不受此数字误伤，但不得借修复扩写无关剧情。`,
    '规则：前台契约只限制本回合叙事焦点，不删除后台事实；未入选内容继续留在后台，不得强造电话、新闻、巧遇或同步知情让它们闯入正文。',
    '规则：allowedActorIds、allowedOrganizationIds、allowedPlaceIds、allowedCaseIds、allowedMatterIds 和 allowedRelationshipThreadIds 是本回合允许主动推进的既有对象集合；玩家刚刚直接接触、到期强制或身份修复所必需的对象可合法补入，但必须与当前行动有直接结构化关系。',
    `规则：返回的 dramaExecutionTrace，其 planId 必须与既有计划一致，usedSourceRefs 只能来自该计划实际选择的 primarySource/supportSources。`,
    '规则：顶层必须返回 dramaExecutionTrace；即使完全没有采用计划，也要返回 status="not_used"、usedSourceRefs=[]、resultingWritebackRefs=[]、customEventProgress=[]。',
    `规则：dramaExecutionTrace 固定结构为 {"planId":"drama_plan_turn_${planningContext.turnCounter}","status":"not_used|used_as_texture|partially_used|used_persistently","usedSourceRefs":[],"resultingWritebackRefs":[],"customEventProgress":[]}。`,
    '规则：usedSourceRefs 的每一项必须是 {"providerId":"...","sourceType":"...","sourceId":"..."} object；如果来源属于 official-dlc，可原样附带其候选中的 dlcId，不得自行创造或改写。resultingWritebackRefs 的每一项必须是 {"kind":"...","id":"..."} object。两者都不得填写字符串、标题或摘要。',
    '规则：resultingWritebackRefs.kind 必须使用规范名。常用映射：actorPatches→actor、actorMemories→actor_memory、currentMatterPatches→current_matter、deferredEventPatches→deferred_event、organizationPatches→organization、relationshipThreadPatches→relationship_thread；不得直接把 actorMemories、currentMatterPatches 等 JSON 字段名当作 kind。',
    '规则：回执 status 只能是 not_used、used_as_texture、partially_used、used_persistently；usedSourceRefs 只回报实际采用的来源。',
    '规则：resultingWritebackRefs 只列本响应 writeback 中实际新增或更新并提交的 kind/id；仅引用、延续或描写既有事项、信号、人物或新闻，不算本回合写回。status 为 not_used、used_as_texture 或 partially_used 时必须返回 []；只有 used_persistently 才可列出真实写回引用。',
    '规则：只有内容已通过本回合既有 writeback 字段永久进入世界时，才可使用 used_persistently，并在 resultingWritebackRefs 中列出真实 kind/id。',
    '规则：只有实际采用 custom-event-group 且 status=used_persistently 时，customEventProgress 才能包含对应实例；否则必须是 []。每项固定为 {"instanceId":"与来源 sourceId 相同","stageId":"本载荷当前阶段","usedNodeIds":[],"decision":"stay|advance|complete|diverge","supportingWritebackRefs":[{"kind":"...","id":"..."}],"factStateChanges":[]}。',
    '规则：customEventProgress 的 supportingWritebackRefs 必须是 resultingWritebackRefs 的子集；只填写真正支撑该事件的写回，不能把同回合其他来源的写回归到该事件。usedNodeIds 只能来自当前阶段；advance 必须填写唯一 nextStageId，其他 decision 必须省略 nextStageId。',
    '规则：只有本回合结构化写回已经证明某条来源事实成立或失效时，才能在 factStateChanges 中填写 {"factId":"当前阶段事实ID","state":"established_in_save|invalidated_in_save","supportingWritebackRefs":[...]}。不得仅凭正文或原作把 source_only 升格为本局事实。',
    '规则：持续剧情弧使用 narrativeArcProgress 记录组织状态，不是新 Runtime 事实。decision 只能是 remain|advance_stage|complete|abandon；advance_stage 必须填写 nextStageId。currentStageId/usedNodeIds 只能来自执行载荷声明的阶段与节点；不能凭正文虚构阶段、节点或下一步。remain 只表示保持当前阶段，可在来源作为纹理、局部采用或永久采用时返回，supportingWritebackRefs 可以为空且不会证明任何世界事实；advance_stage/complete/abandon 只允许在 status=used_persistently 时返回，并必须引用同一来源本回合已经应用的写回。',
    '规则：narrativeArcProgress 的结构为 {"arcInstanceId":"稳定剧情弧实例ID","sourceRef":{"providerId":"...","sourceType":"...","sourceId":"..."},"decision":"remain|advance_stage|complete|abandon","currentStageId":"当前阶段","nextStageId":"仅推进时填写","usedNodeIds":[],"supportingWritebackRefs":[{"kind":"...","id":"..."}],"summary":"不超过两句的当前事实摘要"}。玩家可以忽略剧情弧；不要强制推进或重复创建新的 arcInstanceId。',
    '规则：所有事实变化仍必须写入既有 writeback 字段；不得发明 DramaEvent、Quest、Mission 或第二套状态。'
  ].join('\n');
}
