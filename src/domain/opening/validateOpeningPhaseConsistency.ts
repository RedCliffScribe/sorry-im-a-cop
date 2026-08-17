import type { RuntimeState } from '../runtime/types';
import type { OpeningBlueprint } from './openingBlueprintSchema';
import { resolveOpeningIdentityMatterContract } from './openingIdentityMatterContract';
import type { OpeningInitialization } from './openingInitializationSchema';

export class OpeningPhaseConsistencyError extends Error {
  constructor(readonly issues: string[]) {
    super(`开局跨阶段数据未通过校验：${issues.join('；')}`);
    this.name = 'OpeningPhaseConsistencyError';
  }
}

function collectActorReferences(value: unknown, path = ''): Array<{ actorId: string; path: string }> {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectActorReferences(entry, `${path}[${index}]`));
  }
  if (!value || typeof value !== 'object') return [];

  const references: Array<{ actorId: string; path: string }> = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    if (/ActorId$/i.test(key) && typeof child === 'string' && child.trim()) {
      references.push({ actorId: child, path: childPath });
      continue;
    }
    if (/ActorIds$/i.test(key) && Array.isArray(child)) {
      child.forEach((actorId, index) => {
        if (typeof actorId === 'string' && actorId.trim()) {
          references.push({ actorId, path: `${childPath}[${index}]` });
        }
      });
      continue;
    }
    references.push(...collectActorReferences(child, childPath));
  }
  return references;
}

function getIdentityContractIssues(
  state: RuntimeState,
  blueprint: OpeningBlueprint,
  initialization: OpeningInitialization
): string[] {
  return resolveOpeningIdentityMatterContract({
    identity: state.player.currentIdentity,
    blueprint,
    matters: initialization.currentMatterPatches ?? []
  }).issues.map((issue) => issue.message);
}

export function normalizeCivilianOpeningMatterAnchor(
  blueprint: OpeningBlueprint,
  initialization: OpeningInitialization
): OpeningInitialization {
  const resolution = resolveOpeningIdentityMatterContract({
    identity: 'civilian',
    blueprint,
    matters: initialization.currentMatterPatches ?? []
  });
  return resolution.normalizedPaths.length === 0
    ? initialization
    : { ...initialization, currentMatterPatches: resolution.matters };
}

export function normalizeGangOpeningMatterAnchor(
  blueprint: OpeningBlueprint,
  initialization: OpeningInitialization
): OpeningInitialization {
  const resolution = resolveOpeningIdentityMatterContract({
    identity: 'gang_member',
    blueprint,
    matters: initialization.currentMatterPatches ?? []
  });
  return resolution.normalizedPaths.length === 0
    ? initialization
    : { ...initialization, currentMatterPatches: resolution.matters };
}

export function getOpeningPhaseConsistencyIssues(
  state: RuntimeState,
  blueprint: OpeningBlueprint,
  initialization: OpeningInitialization
): string[] {
  const issues: string[] = [];
  if (blueprint.openingSessionId !== initialization.openingSessionId) {
    issues.push('openingSessionId 不一致');
  }

  const expectedActionIds = blueprint.actionIntents.map((action) => action.actionId);
  const actualActionIds = initialization.suggestedActions.map((action) => action.actionId);
  if (
    expectedActionIds.length !== actualActionIds.length ||
    expectedActionIds.some((actionId, index) => actionId !== actualActionIds[index])
  ) {
    issues.push('suggestedActions 与 actionIntents 未按原顺序一一对应');
  }

  const knownActorIds = new Set([
    ...Object.keys(state.actors),
    ...blueprint.initialActors.map((actor) => actor.actorId)
  ]);
  for (const reference of collectActorReferences(initialization)) {
    if (!knownActorIds.has(reference.actorId)) {
      issues.push(`${reference.path} 引用了未知人物 ${reference.actorId}`);
    }
  }

  const turnMemories = (initialization.memories ?? []).filter(
    (memory) => memory.kind === 'turn'
  );
  if (turnMemories.length !== 1) {
    issues.push('memories 必须且只能有一条 kind=turn 的开局事实摘要');
  }

  issues.push(...getIdentityContractIssues(state, blueprint, initialization));
  return [...new Set(issues)];
}

export function validateOpeningPhaseConsistency(
  state: RuntimeState,
  blueprint: OpeningBlueprint,
  initialization: OpeningInitialization
): OpeningInitialization {
  const matterResolution = resolveOpeningIdentityMatterContract({
    identity: state.player.currentIdentity,
    blueprint,
    matters: initialization.currentMatterPatches ?? []
  });
  const normalized =
    matterResolution.normalizedPaths.length === 0
      ? initialization
      : {
          ...initialization,
          currentMatterPatches: matterResolution.matters
        };
  const issues = getOpeningPhaseConsistencyIssues(
    state,
    blueprint,
    normalized
  );
  if (issues.length > 0) throw new OpeningPhaseConsistencyError(issues);
  return normalized;
}
