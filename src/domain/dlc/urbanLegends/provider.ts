import type { PromptContext } from '../../context/selectContext';
import { withDramaSourceCoherenceMetadata } from '../../drama/coherence';
import type { ProjectedDramaSourceProvider } from '../../drama/sourceRegistry';
import { dramaSourceKey, type PlanningSource } from '../../drama/types';
import {
  urbanLegendsEntryRouteMatrix,
  urbanLegendsFormalIds,
  urbanLegendsFormalManifest,
  urbanLegendsFormalV1_1Manifest,
  urbanLegendsFormalV1Manifest,
  urbanLegendsNarrativeIdentity
} from './content';
import {
  buildUrbanLegendsExpandedArcExecutionPayload,
  buildUrbanLegendsExpandedArcPlanningSource,
  buildUrbanLegendsShortRumorExecutionPayload,
  buildUrbanLegendsShortRumorPlanningSource,
  findUrbanLegendsExpandedArcBySourceId,
  findUrbanLegendsShortRumorBySourceId,
  urbanLegendsExpandedArcDefinitions,
  urbanLegendsShortRumorSeeds,
  urbanLegendsV1_1ExpandedArcDefinitions,
  type UrbanLegendsExpandedArcDefinition
} from './expandedContent';
import {
  buildUrbanLegendsFormalArcProgressContract,
  buildUrbanLegendsFormalContentIdentity,
  buildUrbanLegendsFormalExecutionPayload,
  buildUrbanLegendsFormalStageProjections,
  urbanLegendsFormalSourceRef
} from './stagePayload';

const supportedFormalVersions = new Set([
  urbanLegendsFormalV1Manifest.version,
  urbanLegendsFormalV1_1Manifest.version,
  urbanLegendsFormalManifest.version
]);

function expandedDefinitionsForVersion(
  version: string
): readonly UrbanLegendsExpandedArcDefinition[] | undefined {
  if (version === urbanLegendsFormalV1_1Manifest.version) {
    return urbanLegendsV1_1ExpandedArcDefinitions;
  }
  if (version === urbanLegendsFormalManifest.version) {
    return urbanLegendsExpandedArcDefinitions;
  }
  return undefined;
}

function activeFormalVersion(context: PromptContext): string | undefined {
  if (
    context.worldpackId !== urbanLegendsNarrativeIdentity.worldpackId ||
    !urbanLegendsFormalManifest.dramaIntegration?.enabled
  ) {
    return undefined;
  }
  const binding = context.officialDlcBindings?.find(
    (candidate) =>
      candidate.dlcId === urbanLegendsFormalManifest.dlcId &&
      candidate.status === 'active' &&
      supportedFormalVersions.has(candidate.version)
  );
  return binding?.version;
}

export function buildUrbanLegendsFormalPlanningSource(
  context: PromptContext,
  version: string = urbanLegendsFormalManifest.version
): PlanningSource {
  const identity = context.identityProjection.currentShell.currentIdentity;
  const contentIdentity = buildUrbanLegendsFormalContentIdentity(version);
  const entryRoute = urbanLegendsEntryRouteMatrix.find(
    (candidate) => candidate.identity === identity
  );
  const stageProjections = buildUrbanLegendsFormalStageProjections(context);
  const initialProjection = stageProjections[urbanLegendsFormalIds.stages.streetRumor];
  return withDramaSourceCoherenceMetadata({
    ref: { ...urbanLegendsFormalSourceRef },
    // Reporter and society liaison are intentionally shared with other arcs,
    // so only Midnight Bus-exclusive Actors may recover legacy exposure.
    exposureEvidenceActorIds: [
      urbanLegendsFormalIds.actors.driver,
      urbanLegendsFormalIds.actors.dispatcher,
      urbanLegendsFormalIds.actors.relative,
      urbanLegendsFormalIds.actors.neighbor,
      urbanLegendsFormalIds.actors.juniorOfficer
    ],
    arcKey: urbanLegendsFormalIds.arcKey,
    contentIdentity,
    arcProgressContract: buildUrbanLegendsFormalArcProgressContract(),
    arcStageProjections: stageProjections,
    title: urbanLegendsNarrativeIdentity.title,
    plannerSummary: [
      initialProjection?.plannerSummary ?? '午夜末班车先作为城市传闻进入。',
      `当前身份自然入口：${entryRoute?.contactSources.join('；') ?? '无可用入口'}`,
      '这是玩家主动选择但可以忽略的官方内容候选，不是强制任务。'
    ].join(' '),
    sourceStatus: 'static_seed',
    reusePolicy: 'context_reusable',
    priorityClass: 'user_requested',
    channelIds: ['custom_events'],
    softAffinities: {
      entryIdentity: [identity],
      eventGroupId: [urbanLegendsFormalIds.eventGroup],
      contentIdentity: [contentIdentity.contentId]
    },
    mandatory: false,
    score: 145,
    relatedActorIds: [...(initialProjection?.relatedActorIds ?? [])],
    relatedOrganizationIds: [],
    relatedPlaceIds: [...(initialProjection?.relatedPlaceIds ?? [])],
    relatedCaseIds: []
  });
}

export function buildUrbanLegendsFormalPlanningSources(
  context: PromptContext,
  version: string = urbanLegendsFormalManifest.version
): PlanningSource[] {
  const midnightBus = buildUrbanLegendsFormalPlanningSource(context, version);
  if (version === urbanLegendsFormalV1Manifest.version) return [midnightBus];
  const expandedDefinitions = expandedDefinitionsForVersion(version);
  if (!expandedDefinitions) return [];
  return [
    midnightBus,
    ...expandedDefinitions.map((definition) =>
      buildUrbanLegendsExpandedArcPlanningSource(context, definition, version)
    ),
    ...urbanLegendsShortRumorSeeds.map((seed) =>
      buildUrbanLegendsShortRumorPlanningSource(context, seed)
    )
  ];
}

/**
 * Internal formal provider. It is exported for deterministic integration
 * The formal provider is registered only after the content, UI and Phase 3
 * acceptance gates have passed. Exact source-key resolution keeps it isolated
 * from the frozen Alpha provider that shares the official provider id.
 */
export const urbanLegendsFormalProvider: ProjectedDramaSourceProvider = {
  providerId: urbanLegendsFormalSourceRef.providerId,
  listForAudit(context) {
    return buildUrbanLegendsFormalPlanningSources(
      context,
      urbanLegendsFormalManifest.version
    );
  },
  list(context) {
    const version = activeFormalVersion(context);
    return version ? buildUrbanLegendsFormalPlanningSources(context, version) : [];
  },
  getExecutionPayload(context, ref, options) {
    const version = activeFormalVersion(context);
    if (!version) return undefined;
    if (dramaSourceKey(ref) === dramaSourceKey(urbanLegendsFormalSourceRef)) {
      return buildUrbanLegendsFormalExecutionPayload(
        context,
        options?.narrativeArc?.currentStageId ?? urbanLegendsFormalIds.stages.streetRumor,
        options?.narrativeArc ? 'continuation' : 'first_exposure',
        options?.narrativeArc?.continuationSnapshot,
        version
      );
    }
    const expandedDefinitions = expandedDefinitionsForVersion(version);
    if (!expandedDefinitions) return undefined;
    const definition = findUrbanLegendsExpandedArcBySourceId(ref.sourceId, expandedDefinitions);
    if (definition) {
      return buildUrbanLegendsExpandedArcExecutionPayload(
        context,
        definition,
        options?.narrativeArc?.currentStageId ?? definition.initialStageId,
        options?.narrativeArc ? 'continuation' : 'first_exposure',
        options?.narrativeArc?.continuationSnapshot,
        version
      );
    }
    const rumor = findUrbanLegendsShortRumorBySourceId(ref.sourceId);
    return rumor
      ? buildUrbanLegendsShortRumorExecutionPayload(context, rumor, version)
      : undefined;
  }
};
