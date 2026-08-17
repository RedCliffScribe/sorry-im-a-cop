import { toStableIdentityKey } from '../avgResourcePack';
import type {
  AvgResourceResolver,
  GenericPortraitSetEntry
} from '../avgResourcePack';
import type { StoryEmotion } from '../runtime/storyBlocks';
import type { Actor } from '../runtime/types';
import { resolveEmotionVariant } from './emotionVariantResolver';
import {
  GENERIC_PORTRAIT_CONFIDENCE_THRESHOLD,
  rankGenericPortraitCandidates,
  type ScoredGenericPortraitCandidate
} from './genericPortraitMatcher';
import { buildGenericPortraitIdentityProfile } from './genericPortraitProfile';
import type {
  AvgActiveResourcePackRef,
  AvgGenericPortraitBinding,
  AvgGenericPortraitBindingRepository,
  AvgGenericPortraitProfileAdapter,
  AvgPortraitResolutionDiagnostic,
  GenericPortraitIdentityProfile,
  ResolvedAvgPortrait
} from './types';

export interface AvgPortraitResolutionResult {
  portrait: ResolvedAvgPortrait | null;
  diagnostic: Omit<AvgPortraitResolutionDiagnostic, 'blockIndex'>;
}

function portraitSource(
  resourceSource: ResolvedAvgPortrait['resourceSource'],
  normalSource: ResolvedAvgPortrait['source']
): ResolvedAvgPortrait['source'] {
  return resourceSource === 'user_override' ? 'save_override' : normalSource;
}

function diagnosticBase(actor: Actor, emotion: StoryEmotion) {
  return {
    actorId: actor.actorId,
    stableIdentityKey: actor.stableIdentityRef
      ? toStableIdentityKey(actor.stableIdentityRef)
      : undefined,
    requestedEmotion: emotion
  };
}

function resolveGenericAsset(
  resolver: AvgResourceResolver,
  entry: GenericPortraitSetEntry,
  emotion: StoryEmotion,
  source: 'generic_bound' | 'generic_new',
  requestedOutfitId?: string
): ResolvedAvgPortrait | undefined {
  const outfit = (
    requestedOutfitId ? entry.outfits[requestedOutfitId] : undefined
  ) ?? entry.outfits[entry.defaultOutfitId];
  const variant = resolveEmotionVariant(outfit, emotion, 'generic');
  if (!outfit || !variant) return undefined;
  const asset = resolver.resolveGenericPortraitAsset(entry.portraitSetId, {
    outfitId: outfit.outfitId,
    variantId: variant.variantId
  });
  if (!asset) return undefined;
  return {
    actorId: '',
    source: portraitSource(asset.source, source),
    resourceSource: asset.source,
    sourcePackId: asset.sourcePackId,
    portraitSetId: asset.portraitSetId,
    outfitId: asset.outfitId,
    requestedEmotion: emotion,
    resolvedVariantId: asset.variantId,
    asset: asset.image,
    fallbackChain: variant.fallbackChain
  };
}

function generalizedCivilianProfile(
  profile: GenericPortraitIdentityProfile
): GenericPortraitIdentityProfile {
  const {
    roleSubtype: _roleSubtype,
    roleTier: _roleTier,
    roleTags: _roleTags,
    ...identity
  } = profile;
  return { ...identity, roleFamily: 'civilian' };
}

function rankedWithFallback(input: {
  saveId: string;
  actorId: string;
  profile: GenericPortraitIdentityProfile;
  candidates: readonly GenericPortraitSetEntry[];
  existingBindings: readonly AvgGenericPortraitBinding[];
  avoidPortraitSetIds?: ReadonlySet<string>;
}): Array<ScoredGenericPortraitCandidate & { profile: GenericPortraitIdentityProfile }> {
  const primary = rankGenericPortraitCandidates(input)
    .filter((candidate) => candidate.score >= GENERIC_PORTRAIT_CONFIDENCE_THRESHOLD)
    .map((candidate) => ({ ...candidate, profile: input.profile }));
  if (primary.length) return primary;

  const fallbackProfile = generalizedCivilianProfile(input.profile);
  return rankGenericPortraitCandidates({ ...input, profile: fallbackProfile })
    .filter((candidate) => candidate.score >= GENERIC_PORTRAIT_CONFIDENCE_THRESHOLD)
    .map((candidate) => ({
      ...candidate,
      profile: fallbackProfile,
      reasons: ['generalized-civilian-fallback', ...candidate.reasons]
    }));
}

export async function resolveAvgPortraitForActor(input: {
  saveId: string;
  actor: Actor;
  emotion: StoryEmotion;
  resolver: AvgResourceResolver;
  activePack: AvgActiveResourcePackRef;
  bindingRepository?: AvgGenericPortraitBindingRepository;
  genericProfileAdapter?: AvgGenericPortraitProfileAdapter;
  avoidPortraitSetIds?: ReadonlySet<string>;
  resourceOutfitId?: string;
}): Promise<AvgPortraitResolutionResult> {
  const base = diagnosticBase(input.actor, input.emotion);
  const reasons: string[] = [];

  if (input.actor.stableIdentityRef) {
    const fixedEntry = input.resolver.resolveFixedCharacter(input.actor.stableIdentityRef);
    if (fixedEntry) {
      const requestedOutfitId = input.resourceOutfitId;
      const outfit = (
        requestedOutfitId ? fixedEntry.outfits[requestedOutfitId] : undefined
      ) ?? fixedEntry.outfits[fixedEntry.defaultOutfitId];
      if (requestedOutfitId && !fixedEntry.outfits[requestedOutfitId]) {
        reasons.push(`fixed-outfit-missing:${requestedOutfitId}`);
      }
      const variant = resolveEmotionVariant(outfit, input.emotion, 'fixed');
      if (!outfit || !variant) {
        return {
          portrait: null,
          diagnostic: {
            ...base,
            source: 'unresolved',
            portraitSetId: fixedEntry.portraitSetId,
            requestedOutfitId,
            reasons: [...reasons, 'fixed-default-outfit-or-variant-missing']
          }
        };
      }
      const asset = input.resolver.resolveFixedCharacterAsset(input.actor.stableIdentityRef, {
        outfitId: outfit.outfitId,
        variantId: variant.variantId
      });
      if (!asset) {
        return {
          portrait: null,
          diagnostic: {
            ...base,
            source: 'unresolved',
            portraitSetId: fixedEntry.portraitSetId,
            requestedOutfitId,
            resolvedOutfitId: outfit.outfitId,
            fallbackChain: variant.fallbackChain,
            reasons: [...reasons, 'fixed-asset-unresolved']
          }
        };
      }
      return {
        portrait: {
          actorId: input.actor.actorId,
          source: portraitSource(asset.source, 'fixed'),
          resourceSource: asset.source,
          sourcePackId: asset.sourcePackId,
          portraitSetId: asset.portraitSetId,
          outfitId: asset.outfitId,
          requestedEmotion: input.emotion,
          resolvedVariantId: asset.variantId,
          asset: asset.image,
          fallbackChain: variant.fallbackChain
        },
        diagnostic: {
          ...base,
          source: 'fixed',
          portraitSetId: asset.portraitSetId,
          requestedOutfitId,
          resolvedOutfitId: asset.outfitId,
          fallbackChain: variant.fallbackChain,
          resolvedVariant: asset.variantId,
          reasons: [...reasons, 'stable-identity-fixed-match']
        }
      };
    }
    reasons.push('fixed-registry-miss');
  }

  const repository = input.bindingRepository;
  const existing = repository
    ? await repository.get(
        input.saveId,
        input.actor.actorId,
        input.activePack.worldpackId,
        input.activePack.basePackId
      )
    : undefined;
  if (existing) {
    const entry = input.resolver.getGenericPortraitSet(existing.portraitSetId);
    const resolved = entry
      ? resolveGenericAsset(
          input.resolver,
          entry,
          input.emotion,
          'generic_bound',
          input.resourceOutfitId
        )
      : undefined;
    if (entry && resolved) {
      resolved.actorId = input.actor.actorId;
      return {
        portrait: resolved,
        diagnostic: {
          ...base,
          source: 'generic-existing-binding',
          portraitSetId: entry.portraitSetId,
          requestedOutfitId: input.resourceOutfitId,
          resolvedOutfitId: resolved.outfitId,
          fallbackChain: resolved.fallbackChain,
          resolvedVariant: resolved.resolvedVariantId,
          genericProfile: existing.profileSnapshot,
          reasons: [...reasons, 'generic-binding-restored']
        }
      };
    }
    reasons.push(entry ? 'generic-binding-asset-invalid' : 'generic-binding-stale');
    await repository?.remove(
      input.saveId,
      input.actor.actorId,
      input.activePack.worldpackId,
      input.activePack.basePackId
    );
  }

  const profile = buildGenericPortraitIdentityProfile(
    input.actor,
    input.genericProfileAdapter
  );
  const candidates = input.resolver.getGenericPortraitSets();
  const existingBindings = repository
    ? await repository.listForSavePack(
        input.saveId,
        input.activePack.worldpackId,
        input.activePack.basePackId
      )
    : [];
  const ranked = rankedWithFallback({
    saveId: input.saveId,
    actorId: input.actor.actorId,
    profile,
    candidates,
    existingBindings,
    avoidPortraitSetIds: input.avoidPortraitSetIds
  });
  if (!repository) reasons.push('binding-repository-unavailable');

  for (const candidate of ranked) {
    const resolved = resolveGenericAsset(
      input.resolver,
      candidate.entry,
      input.emotion,
      'generic_new',
      input.resourceOutfitId
    );
    if (!resolved) continue;
    const now = new Date().toISOString();
    const binding: AvgGenericPortraitBinding = {
      saveId: input.saveId,
      actorId: input.actor.actorId,
      worldpackId: input.activePack.worldpackId,
      basePackId: input.activePack.basePackId,
      portraitSetId: candidate.entry.portraitSetId,
      profileSnapshot: candidate.profile,
      createdAt: now,
      updatedAt: now
    };
    if (
      repository &&
      !(await repository.bindIfAvailable(binding, candidate.entry.reusePolicy))
    ) {
      reasons.push(`generic-candidate-concurrent-conflict:${candidate.entry.portraitSetId}`);
      continue;
    }
    resolved.actorId = input.actor.actorId;
    return {
      portrait: resolved,
      diagnostic: {
        ...base,
        source: 'generic-new-binding',
        portraitSetId: candidate.entry.portraitSetId,
        requestedOutfitId: input.resourceOutfitId,
        resolvedOutfitId: resolved.outfitId,
        fallbackChain: resolved.fallbackChain,
        resolvedVariant: resolved.resolvedVariantId,
        genericScore: candidate.score,
        genericProfile: candidate.profile,
        reasons: [...reasons, ...candidate.reasons]
      }
    };
  }

  return {
    portrait: null,
    diagnostic: {
      ...base,
      source: 'unresolved',
      genericProfile: profile,
      reasons: [...reasons, candidates.length ? 'generic-confidence-too-low' : 'generic-pool-empty']
    }
  };
}
