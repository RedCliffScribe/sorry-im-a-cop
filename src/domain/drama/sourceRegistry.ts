import type { PromptContext } from '../context/selectContext';
import type { RuntimeState } from '../runtime/types';
import {
  customCharacterProvider,
  customEventGroupProvider
} from './customContentProviders';
import { withDramaSourceCoherenceMetadata } from './coherence';
import { filterOfficialDlcSources, isOfficialDlcSourceActive } from '../dlc/drama';
import { urbanLegendsAlphaProvider } from '../dlc/urbanLegendsAlpha/provider';
import { urbanLegendsFormalProvider } from '../dlc/urbanLegends/provider';
import { isOfficialDlcSourceRefExposed } from './sourceExposure';
import {
  dramaSourceKey,
  type DramaChannelId,
  type DramaPayloadResolutionOptions,
  type DramaSourceRef,
  type DramaSourceReusePolicy,
  type DramaSourceStatus,
  type ExecutionPayload,
  type PlanningSource
} from './types';

export interface ProjectedDramaSourceProvider {
  providerId: string;
  list(context: PromptContext): PlanningSource[];
  /**
   * Returns the provider's declared source inventory for diagnostics only.
   * This must not be used by planning or execution, because inactive/unsupported
   * sources are intentionally excluded from the normal `list` contract.
   */
  listForAudit?(context: PromptContext): PlanningSource[];
  getExecutionPayload(
    context: PromptContext,
    ref: DramaSourceRef,
    options?: DramaPayloadResolutionOptions
  ): ExecutionPayload | undefined;
}

interface ProjectedDramaSourceDeclaration {
  provider: ProjectedDramaSourceProvider;
  providerIndex: number;
  source: PlanningSource;
}

export interface ProjectedDramaSourceCollision {
  sourceKey: string;
  declarationCount: number;
  providerIndexes: number[];
}

export type ProjectedDramaProviderResolution =
  | { status: 'resolved'; provider: ProjectedDramaSourceProvider; source: PlanningSource }
  | { status: 'not_found'; sourceKey: string }
  | { status: 'ambiguous'; sourceKey: string; declarationCount: number };

interface SourceInput {
  ref: DramaSourceRef;
  title: string;
  plannerSummary: string;
  sourceStatus: DramaSourceStatus;
  reusePolicy: DramaSourceReusePolicy;
  priorityClass?: PlanningSource['priorityClass'];
  channelIds: DramaChannelId[];
  mandatory?: boolean;
  score: number;
  relatedActorIds?: string[];
  relatedOrganizationIds?: string[];
  relatedPlaceIds?: string[];
  relatedCaseIds?: string[];
  softAffinities?: Record<string, string[]>;
}

function source(input: SourceInput): PlanningSource {
  return withDramaSourceCoherenceMetadata({
    ...input,
    priorityClass: input.priorityClass ?? 'normal',
    mandatory: input.mandatory ?? false,
    relatedActorIds: input.relatedActorIds ?? [],
    relatedOrganizationIds: input.relatedOrganizationIds ?? [],
    relatedPlaceIds: input.relatedPlaceIds ?? [],
    relatedCaseIds: input.relatedCaseIds ?? [],
    softAffinities: input.softAffinities ?? {}
  });
}

function payload(
  ref: DramaSourceRef,
  detailedContext: string,
  options: {
    confirmedFacts?: string[];
    mutableElements?: string[];
    forbiddenAdaptations?: string[];
  } = {}
): ExecutionPayload {
  return {
    ref,
    detailedContext,
    confirmedFacts: options.confirmedFacts ?? [],
    mutableElements: options.mutableElements ?? [],
    forbiddenAdaptations: options.forbiddenAdaptations ?? []
  };
}

function genericPayload(context: PromptContext, ref: DramaSourceRef): ExecutionPayload | undefined {
  const item = listProjectedDramaSources(context).find(
    (candidate) => dramaSourceKey(candidate.ref) === dramaSourceKey(ref)
  );
  if (!item) return undefined;
  return payload(ref, item.plannerSummary, {
    confirmedFacts:
      item.sourceStatus === 'confirmed_fact' || item.sourceStatus === 'active_process'
        ? [item.plannerSummary]
        : [],
    mutableElements:
      item.sourceStatus === 'undecided_suggestion' || item.sourceStatus === 'static_seed'
        ? [item.plannerSummary]
        : [],
    forbiddenAdaptations:
      ref.sourceType === 'news_issue'
        ? ['relatedActorIds 只是报道对象，不能据此写入“该人物已经读报或知情”。']
        : []
  });
}

const runtimeDynamicProvider: ProjectedDramaSourceProvider = {
  providerId: 'runtime-dynamic',
  list(context) {
    const matters = context.dynamicProjection.currentMatters.map((matter) => source({
      ref: { providerId: this.providerId, sourceType: 'current_matter', sourceId: matter.id },
      title: matter.title,
      plannerSummary: matter.summary,
      sourceStatus: 'active_process',
      reusePolicy: 'context_reusable',
      channelIds: [
        matter.matterKind === 'livelihood' || matter.source === 'livelihood'
          ? 'work_livelihood'
          : matter.source === 'triad_responsibility'
            ? 'organizations'
            : matter.matterKind === 'relationship' || matter.matterKind === 'family'
              ? 'relationships'
              : matter.matterKind === 'world'
                ? 'city_news'
                : 'cases_law'
      ],
      mandatory: context.dynamicProjection.diagnostics.dueCurrentMatterIds.includes(matter.id),
      score: matter.priority + (matter.pressureLevel ?? 0) * 10,
      relatedActorIds: [...matter.relatedActorIds],
      relatedOrganizationIds: [...matter.relatedOrganizationIds],
      relatedPlaceIds: [...matter.relatedPlaceIds],
      relatedCaseIds: [...matter.relatedCaseIds]
    }));
    const due = context.dynamicProjection.dueDeferredEvents.map((event) => source({
      ref: { providerId: this.providerId, sourceType: 'due_deferred_event', sourceId: event.eventId },
      title: event.title,
      plannerSummary: event.summary,
      sourceStatus: 'active_process',
      reusePolicy: 'context_reusable',
      channelIds: ['cases_law'],
      mandatory: true,
      score: 200,
      relatedActorIds: event.relatedIds.actorId ? [event.relatedIds.actorId] : [],
      relatedOrganizationIds: event.relatedIds.organizationId ? [event.relatedIds.organizationId] : [],
      relatedPlaceIds: event.relatedIds.placeId ? [event.relatedIds.placeId] : [],
      relatedCaseIds: event.relatedIds.caseId ? [event.relatedIds.caseId] : []
    }));
    const signals = context.dynamicProjection.signals.map((signal) => source({
      ref: { providerId: this.providerId, sourceType: 'signal', sourceId: signal.id },
      title: signal.title,
      plannerSummary: signal.summary,
      sourceStatus: 'rumor',
      reusePolicy: 'context_reusable',
      channelIds: ['city_news'],
      score: signal.reliability === 'high' ? 70 : signal.reliability === 'medium' ? 55 : 40,
      relatedActorIds: [...signal.relatedActorIds],
      relatedOrganizationIds: [...signal.relatedOrganizationIds],
      relatedPlaceIds: [...signal.relatedPlaceIds],
      relatedCaseIds: [...signal.relatedCaseIds]
    }));
    const news = context.dynamicProjection.newsIssues.map((issue) => source({
      ref: { providerId: this.providerId, sourceType: 'news_issue', sourceId: issue.id },
      title: issue.headline,
      plannerSummary: issue.summary,
      sourceStatus: 'public_claim',
      reusePolicy: 'context_reusable',
      channelIds: ['city_news'],
      score: issue.read ? 35 : 60,
      relatedActorIds: issue.articles.flatMap((article) => article.relatedActorIds),
      relatedOrganizationIds: issue.articles.flatMap((article) => article.relatedOrganizationIds),
      relatedPlaceIds: issue.articles.flatMap((article) => article.relatedPlaceIds),
      relatedCaseIds: issue.articles.flatMap((article) => article.relatedCaseIds)
    }));
    return [...matters, ...due, ...signals, ...news];
  },
  getExecutionPayload: genericPayload
};

const runtimeRelationshipProvider: ProjectedDramaSourceProvider = {
  providerId: 'runtime-relationship',
  list(context) {
    const threads = context.relationshipProjection.threads.map((thread) => source({
      ref: { providerId: this.providerId, sourceType: 'relationship_thread', sourceId: thread.threadId },
      title: thread.title,
      plannerSummary: thread.currentPull || thread.summary,
      sourceStatus: 'active_process',
      reusePolicy: 'context_reusable',
      channelIds: ['relationships'],
      score: thread.status === 'strained' ? 85 : thread.currentPull ? 70 : 50,
      relatedActorIds: [...thread.relatedActorIds]
    }));
    const heartbeatCandidates = context.relationshipProjection.heartbeatCandidates.map((candidate) => source({
      ref: {
        providerId: this.providerId,
        sourceType: 'relationship_heartbeat_candidate',
        sourceId: `${candidate.threadId}:${candidate.beatType}`
      },
      title: candidate.title,
      plannerSummary: `${candidate.summary}；候选原因：${candidate.reason}`,
      sourceStatus: 'undecided_suggestion',
      reusePolicy: 'context_reusable',
      channelIds: ['relationships'],
      score: candidate.importance,
      relatedActorIds: [...candidate.relatedActorIds],
      softAffinities: { beatType: [candidate.beatType], relationshipKind: [candidate.kind] }
    }));
    return [...threads, ...heartbeatCandidates];
  },
  getExecutionPayload: genericPayload
};

const runtimeCaseProvider: ProjectedDramaSourceProvider = {
  providerId: 'runtime-case',
  list(context) {
    return context.relevantCases.map((caseFile) => source({
      ref: { providerId: this.providerId, sourceType: 'case', sourceId: caseFile.caseId },
      title: caseFile.title,
      plannerSummary: caseFile.summary,
      sourceStatus: 'confirmed_fact',
      reusePolicy: 'context_reusable',
      channelIds: ['cases_law'],
      score: caseFile.status === 'investigating' ? 80 : 45,
      relatedActorIds: [...caseFile.relatedActorIds],
      relatedOrganizationIds: [...caseFile.relatedOrganizationIds],
      relatedPlaceIds: [...caseFile.relatedPlaceIds],
      relatedCaseIds: [caseFile.caseId]
    }));
  },
  getExecutionPayload: genericPayload
};

const runtimeEvolutionProvider: ProjectedDramaSourceProvider = {
  providerId: 'runtime-evolution',
  list(context) {
    const npc = context.backgroundEvolutionProjection.activeNpcActions.map((track) => source({
      ref: { providerId: this.providerId, sourceType: 'npc_evolution', sourceId: track.trackId },
      title: `${track.actorName}的当前行动`,
      plannerSummary: `${track.currentAction}；${track.currentStatus}`,
      sourceStatus: 'active_process',
      reusePolicy: 'context_reusable',
      channelIds: ['relationships'],
      score: track.status === 'blocked' ? 65 : 55,
      relatedActorIds: [track.actorId, ...track.relatedActorIds],
      relatedPlaceIds: track.currentPlaceId ? [track.currentPlaceId] : [],
      relatedCaseIds: [...track.relatedCaseIds]
    }));
    const organizations = context.backgroundEvolutionProjection.activeOrganizationActions.map((track) => source({
      ref: { providerId: this.providerId, sourceType: 'organization_evolution', sourceId: track.trackId },
      title: `${track.organizationName}的当前方向`,
      plannerSummary: `${track.objective}；${track.currentAction}；${track.currentStatus}`,
      sourceStatus: 'active_process',
      reusePolicy: 'context_reusable',
      channelIds: ['organizations'],
      score: track.status === 'blocked' ? 75 : 60,
      relatedActorIds: [...track.relatedActorIds],
      relatedOrganizationIds: [track.organizationId],
      relatedPlaceIds: [...track.relatedPlaceIds],
      relatedCaseIds: [...track.relatedCaseIds]
    }));
    const city = context.citySituationTrackProjection.tracks.map((track) => source({
      ref: { providerId: this.providerId, sourceType: 'city_evolution', sourceId: track.trackId },
      title: track.title,
      plannerSummary: `${track.currentBeat}；${track.summary}`,
      sourceStatus: 'active_process',
      reusePolicy: 'context_reusable',
      channelIds: ['city_news'],
      mandatory: track.reasons.includes('scheduled_due'),
      score: track.score + track.pressureLevel * 5,
      relatedActorIds: [...track.relatedActorIds],
      relatedOrganizationIds: [...track.relatedOrganizationIds],
      relatedPlaceIds: [...track.relatedPlaceIds]
    }));
    const outcomes = context.backgroundEvolutionProjection.recentOutcomes.map((outcome) => source({
      ref: { providerId: this.providerId, sourceType: 'evolution_outcome', sourceId: outcome.outcomeId },
      title: outcome.title,
      plannerSummary: [outcome.summary, outcome.consequence].filter(Boolean).join('；'),
      sourceStatus: 'confirmed_fact',
      reusePolicy: 'context_reusable',
      channelIds:
        outcome.sourceKind === 'relationship'
          ? ['relationships']
          : outcome.sourceKind === 'organization'
            ? ['organizations']
            : outcome.sourceKind === 'case'
              ? ['cases_law']
              : ['city_news'],
      score: outcome.significance === 'historic' ? 90 : outcome.significance === 'notable' ? 70 : 50,
      relatedActorIds: [...outcome.relatedActorIds],
      relatedOrganizationIds: [...outcome.relatedOrganizationIds],
      relatedCaseIds: [...outcome.relatedCaseIds]
    }));
    return [...npc, ...organizations, ...city, ...outcomes];
  },
  getExecutionPayload: genericPayload
};

const livelihoodProvider: ProjectedDramaSourceProvider = {
  providerId: 'livelihood',
  list(context) {
    const projection = context.livelihoodProjection;
    if (!projection.available || !projection.roleProfile) return [];
    const profile = projection.roleProfile;
    return [source({
      ref: {
        providerId: this.providerId,
        sourceType: 'livelihood_context',
        sourceId: profile.employerOrganizationId ?? `player:${profile.publicOccupation ?? 'civilian'}`
      },
      title: profile.publicOccupation || '当前营生',
      plannerSummary: [
        projection.livelihoodSummary,
        projection.primaryOrganizationTrack?.objective,
        projection.primaryOrganizationTrack?.currentAction,
        projection.obstacleSummaries[0],
        projection.opportunitySummaries[0]
      ].filter(Boolean).join('；'),
      sourceStatus: 'confirmed_fact',
      reusePolicy: 'context_reusable',
      channelIds: ['work_livelihood'],
      score: projection.activeMatters.length > 0 ? 75 : 50,
      relatedActorIds: projection.workRelations.map((relation) => relation.actorId),
      relatedOrganizationIds: profile.employerOrganizationId ? [profile.employerOrganizationId] : [],
      relatedPlaceIds: profile.workplacePlaceId ? [profile.workplacePlaceId] : [],
      softAffinities: {
        occupationGroup: profile.occupationGroupId ? [profile.occupationGroupId] : [],
        roleTags: [...profile.roleTags]
      }
    })];
  },
  getExecutionPayload(context, ref) {
    const projection = context.livelihoodProjection;
    const sourceItem = this.list(context).find(
      (candidate) => dramaSourceKey(candidate.ref) === dramaSourceKey(ref)
    );
    if (!sourceItem || !projection.roleProfile) return undefined;
    return payload(ref, [
      sourceItem.plannerSummary,
      projection.roleProfile.dutySummary,
      projection.roleProfile.decisionScopeSummary,
      projection.roleProfile.accessSummary,
      ...projection.workRelations.map((relation) => `${relation.name}：${relation.summary}`),
      ...projection.activeMatters.map((matter) => `${matter.title}：${matter.summary}`)
    ].filter(Boolean).join('\n'), {
      confirmedFacts: [projection.livelihoodSummary],
      mutableElements: [...projection.actionHints],
      forbiddenAdaptations: ['不得把职业方向自动变成玩家已经接受的任务或决定。']
    });
  }
};

const storypackProvider: ProjectedDramaSourceProvider = {
  providerId: 'storypack',
  list(context) {
    return context.storypackProjection.cards.map((card) => source({
      ref: {
        providerId: this.providerId,
        sourceType:
          card.type === 'HistoricalEventCard'
            ? 'historical_event_card'
            : card.type === 'SectorPressureCard'
              ? 'sector_pressure_card'
              : 'drama_motif_card',
        sourceId: card.id
      },
      title: card.title,
      plannerSummary: card.promptSafeVersion,
      sourceStatus: 'static_seed',
      reusePolicy: card.type === 'DramaMotifCard' ? 'motif_reusable' : 'context_reusable',
      channelIds: ['era_storypack'],
      score: card.score,
      relatedPlaceIds: [...card.relatedPlaces],
      softAffinities: {
        sectors: [...card.relatedSectors],
        cardType: [card.type]
      }
    }));
  },
  getExecutionPayload(context, ref) {
    const card = context.storypackProjection.cards.find((item) => item.id === ref.sourceId);
    if (!card) return undefined;
    return payload(ref, [card.promptSafeVersion, card.structuralInspiration, card.identityHook].filter(Boolean).join('\n'), {
      mutableElements: [card.structuralInspiration, card.identityHook].filter((item): item is string => Boolean(item)),
      forbiddenAdaptations: [...context.storypackProjection.rules]
    });
  }
};

const screenCharacterProvider: ProjectedDramaSourceProvider = {
  providerId: 'screen-character',
  list(context) {
    return context.screenCharacterSeedProjection.characters.map((character) => source({
      ref: { providerId: this.providerId, sourceType: 'screen_character_seed', sourceId: character.id },
      title: character.displayName,
      plannerSummary: `${character.publicIdentity}；${character.profileSummary}`,
      sourceStatus: 'static_seed',
      reusePolicy: 'entity_singleton',
      channelIds: ['screen_characters'],
      score: character.score,
      relatedActorIds: [character.runtimeActorId],
      softAffinities: { accessRoutes: [...character.accessRoutes] }
    }));
  },
  getExecutionPayload(context, ref) {
    const character = context.screenCharacterSeedProjection.characters.find((item) => item.id === ref.sourceId);
    if (!character) return undefined;
    return payload(ref, [
      character.profileSummary,
      `性格：${character.personality}`,
      `说话方式：${character.speechStyle}`,
      `动机：${character.motivation}`,
      `长期目标：${character.longTermGoal}`,
      `接触路径：${character.accessRoutes.join('；')}`,
      `当前身份适配：${character.identityHook}`
    ].join('\n'), {
      mutableElements: [character.identityHook, ...character.accessRoutes],
      forbiddenAdaptations: [
        '这是人物候选，不自动宣布其已经出现、认识玩家或发生原作经历。',
        '若存档中已经存在同一 runtimeActorId，只能承接既有 Actor，不得重复创建。'
      ]
    });
  }
};

const eraFigureProvider: ProjectedDramaSourceProvider = {
  providerId: 'era-figure',
  list(context) {
    return context.eraSeedFigureProjection.figures.map((figure) => source({
      ref: { providerId: this.providerId, sourceType: 'era_seed_figure', sourceId: figure.id },
      title: figure.displayName,
      plannerSummary: `${figure.publicRole}；${figure.promptSafeProfile}`,
      sourceStatus: 'static_seed',
      reusePolicy: 'entity_singleton',
      channelIds: ['era_storypack'],
      score: figure.score,
      relatedActorIds: [figure.runtimeActorId],
      softAffinities: { accessRoutes: [...figure.accessRoutes] }
    }));
  },
  getExecutionPayload(context, ref) {
    const figure = context.eraSeedFigureProjection.figures.find((item) => item.id === ref.sourceId);
    if (!figure) return undefined;
    return payload(ref, [
      figure.promptSafeProfile,
      `公开角色：${figure.publicRole}`,
      `接触政策：${figure.contactPolicy}`,
      `接触路径：${figure.accessRoutes.join('；')}`,
      `可用钩子：${figure.promptSafeHooks.join('；')}`
    ].join('\n'), {
      mutableElements: [...figure.promptSafeHooks],
      forbiddenAdaptations: ['不得把静态公开资料改写成玩家已经知道的私人事实。']
    });
  }
};

export const projectedDramaSourceProviders: readonly ProjectedDramaSourceProvider[] = [
  runtimeDynamicProvider,
  runtimeRelationshipProvider,
  runtimeCaseProvider,
  runtimeEvolutionProvider,
  livelihoodProvider,
  storypackProvider,
  screenCharacterProvider,
  eraFigureProvider,
  customCharacterProvider,
  customEventGroupProvider,
  urbanLegendsAlphaProvider,
  urbanLegendsFormalProvider
];

function collectProjectedDramaSourceDeclarations(
  context: PromptContext,
  providers: readonly ProjectedDramaSourceProvider[]
): ProjectedDramaSourceDeclaration[] {
  return providers.flatMap((provider, providerIndex) =>
    provider.list(context).map((source) => ({ provider, providerIndex, source }))
  );
}

function collisionsFromDeclarations(
  declarations: readonly ProjectedDramaSourceDeclaration[]
): ProjectedDramaSourceCollision[] {
  const declarationsByKey = new Map<string, ProjectedDramaSourceDeclaration[]>();
  for (const declaration of declarations) {
    const key = dramaSourceKey(declaration.source.ref);
    const existing = declarationsByKey.get(key) ?? [];
    existing.push(declaration);
    declarationsByKey.set(key, existing);
  }
  return Array.from(declarationsByKey.entries()).flatMap(([sourceKey, grouped]) =>
    grouped.length > 1
      ? [{
          sourceKey,
          declarationCount: grouped.length,
          providerIndexes: Array.from(
            new Set(grouped.map((declaration) => declaration.providerIndex))
          )
        }]
      : []
  );
}

export function findProjectedDramaSourceCollisions(
  context: PromptContext,
  providers: readonly ProjectedDramaSourceProvider[] = projectedDramaSourceProviders
): ProjectedDramaSourceCollision[] {
  return collisionsFromDeclarations(
    collectProjectedDramaSourceDeclarations(context, providers)
  );
}

export function resolveProjectedDramaProvider(
  context: PromptContext,
  ref: DramaSourceRef,
  providers: readonly ProjectedDramaSourceProvider[] = projectedDramaSourceProviders
): ProjectedDramaProviderResolution {
  const sourceKey = dramaSourceKey(ref);
  const matches = collectProjectedDramaSourceDeclarations(context, providers).filter(
    (declaration) =>
      declaration.provider.providerId === ref.providerId &&
      dramaSourceKey(declaration.source.ref) === sourceKey
  );
  if (matches.length === 0) return { status: 'not_found', sourceKey };
  if (matches.length > 1) {
    return { status: 'ambiguous', sourceKey, declarationCount: matches.length };
  }
  return {
    status: 'resolved',
    provider: matches[0]!.provider,
    source: matches[0]!.source
  };
}

export function listProjectedDramaSources(
  context: PromptContext,
  providers: readonly ProjectedDramaSourceProvider[] = projectedDramaSourceProviders
): PlanningSource[] {
  const declarations = collectProjectedDramaSourceDeclarations(context, providers);
  const collisionKeys = new Set(
    collisionsFromDeclarations(declarations).map((collision) => collision.sourceKey)
  );
  return filterOfficialDlcSources(
    context.officialDlcBindings,
    declarations
      .filter((declaration) => !collisionKeys.has(dramaSourceKey(declaration.source.ref)))
      .map((declaration) => declaration.source)
  );
}

export function listOfficialDlcSourcesForAudit(
  context: PromptContext,
  providers: readonly ProjectedDramaSourceProvider[] = projectedDramaSourceProviders
): PlanningSource[] {
  return providers.flatMap((provider) => provider.listForAudit?.(context) ?? []);
}

export function listGeneratedOfficialDlcSources(
  context: PromptContext,
  providers: readonly ProjectedDramaSourceProvider[] = projectedDramaSourceProviders
): PlanningSource[] {
  return providers
    .filter((provider) => provider.providerId === 'official-dlc')
    .flatMap((provider) => provider.list(context));
}

export function getProjectedDramaPayload(
  context: PromptContext,
  ref: DramaSourceRef,
  options?: DramaPayloadResolutionOptions,
  providers: readonly ProjectedDramaSourceProvider[] = projectedDramaSourceProviders
): ExecutionPayload | undefined {
  if (!isOfficialDlcSourceActive(context.officialDlcBindings, ref)) return undefined;
  const resolution = resolveProjectedDramaProvider(context, ref, providers);
  if (resolution.status !== 'resolved') return undefined;
  return resolution.provider.getExecutionPayload(context, ref, options);
}

export function validateProjectedDramaRef(
  context: PromptContext,
  ref: DramaSourceRef,
  providers: readonly ProjectedDramaSourceProvider[] = projectedDramaSourceProviders
): boolean {
  if (!isOfficialDlcSourceActive(context.officialDlcBindings, ref)) return false;
  return resolveProjectedDramaProvider(context, ref, providers).status === 'resolved';
}

export function isDramaSourceAlreadyConsumed(state: RuntimeState, item: PlanningSource): boolean {
  if (item.reusePolicy === 'entity_singleton') {
    if (
      item.ref.providerId === 'custom-character' &&
      item.ref.sourceType === 'custom_character_binding'
    ) {
      return false;
    }
    return item.relatedActorIds.some((actorId) => Boolean(state.actors[actorId]));
  }
  const exposed = isDramaSourceAlreadyExposed(state, item);
  if (item.reusePolicy === 'save_single_use') return exposed;
  return Boolean(
    exposed &&
    item.ref.providerId === 'official-dlc' &&
    item.ref.sourceType === 'official_dlc_event' &&
    item.contentIdentity &&
    item.arcProgressContract &&
    item.arcStageContext?.mode !== 'continuation'
  );
}

function normalizedExposureText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function stringValues(values: unknown[]): string[] {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

/**
 * Durable, player-visible or structured records only. Player-authored actions
 * are deliberately excluded so asking about a DLC cannot mark it as exposed.
 */
function collectLegacyExposureTexts(state: RuntimeState): string[] {
  const caseTexts = Object.values(state.cases).flatMap((caseFile) => stringValues([
    caseFile.title,
    caseFile.summary,
    caseFile.currentFocus,
    caseFile.playerVisibleProgress,
    caseFile.internalProgressSummary,
    ...caseFile.activityLog.map((entry) => entry.summary)
  ]));
  const matterTexts = Object.values(state.dynamicEvents.currentMatters).flatMap((matter) =>
    stringValues([
      matter.title,
      matter.summary,
      matter.currentHook,
      matter.consequenceHint
    ])
  );
  const signalTexts = Object.values(state.dynamicEvents.signals).flatMap((signal) =>
    stringValues([signal.title, signal.summary])
  );
  const newsTexts = Object.values(state.dynamicEvents.newsIssues).flatMap((issue) =>
    stringValues([
      issue.headline,
      issue.summary,
      ...issue.articles.flatMap((article) => [article.headline, article.body])
    ])
  );
  const narratedStoryTexts = state.storyLog
    .filter((entry) => entry.speaker === 'narrator')
    .flatMap((entry) => stringValues([entry.text, entry.summaryText]));
  return [
    ...caseTexts,
    ...matterTexts,
    ...signalTexts,
    ...newsTexts,
    ...narratedStoryTexts
  ].map(normalizedExposureText);
}

function hasLegacyTextExposure(state: RuntimeState, item: PlanningSource): boolean {
  const signatures = item.exposureEvidenceTextSignatures ?? [];
  if (signatures.length === 0) return false;
  const records = collectLegacyExposureTexts(state);
  return signatures.some((signature) => {
    const allTerms = signature.allTerms.map(normalizedExposureText).filter(Boolean);
    const anyTerms = (signature.anyTerms ?? []).map(normalizedExposureText).filter(Boolean);
    if (allTerms.length === 0) return false;
    return records.some((record) =>
      allTerms.every((term) => record.includes(term)) &&
      (anyTerms.length === 0 || anyTerms.some((term) => record.includes(term)))
    );
  });
}

/**
 * Exact persisted evidence that a source has already surfaced in this save.
 * Stable Actor evidence is a legacy-save recovery path only: providers must
 * declare IDs unique to this one content source, never shared labels or names.
 */
export function isDramaSourceAlreadyExposed(
  state: RuntimeState,
  item: PlanningSource
): boolean {
  if (isOfficialDlcSourceRefExposed(state, item.ref)) return true;
  return Boolean(
    item.exposureEvidenceActorIds?.some((actorId) => Boolean(state.actors[actorId])) ||
    hasLegacyTextExposure(state, item)
  );
}
