import type {
  Actor,
  ActorOrganizationRelation,
  ActorRoleProfiles,
  CurrentIdentity,
  PlayerIdentityTransitionRecord,
  RuntimeState,
  SecretFact
} from '../runtime/types';

export type CurrentRoleProfileProjection =
  | { identity: 'police'; profile: NonNullable<ActorRoleProfiles['police']> }
  | { identity: 'gang_member'; profile: NonNullable<ActorRoleProfiles['triad']> }
  | { identity: 'civilian'; profile: NonNullable<ActorRoleProfiles['civilian']> };

export type IdentityFactProjection = Pick<
  SecretFact,
  | 'secretId'
  | 'ownerType'
  | 'ownerId'
  | 'kind'
  | 'summary'
  | 'playerCharacterKnown'
  | 'publicKnown'
  | 'knownByActorIds'
  | 'revealState'
  | 'revealConditions'
  | 'importance'
>;

export interface PlayerIdentityContextProjection {
  routeSource: 'player.currentIdentity';
  currentShell: {
    currentIdentity: CurrentIdentity;
    publicIdentity: string;
    publicRoleProfile?: CurrentRoleProfileProjection;
  };
  protagonistPrivateKnowledge: {
    originIdentity: CurrentIdentity;
    actualIdentitySummary?: string;
    transitionHistory: PlayerIdentityTransitionRecord[];
    facts: IdentityFactProjection[];
  };
  directorOnlyFacts: IdentityFactProjection[];
  publicFacts: IdentityFactProjection[];
}

function clonePoliceProfile(profile: NonNullable<ActorRoleProfiles['police']>) {
  return {
    ...profile,
    supervisorActorIds: [...profile.supervisorActorIds],
    peerActorIds: [...profile.peerActorIds]
  };
}

function cloneTriadProfile(profile: NonNullable<ActorRoleProfiles['triad']>) {
  return {
    ...profile,
    patronActorIds: [...profile.patronActorIds],
    peerActorIds: [...profile.peerActorIds],
    rivalActorIds: [...profile.rivalActorIds]
  };
}

function cloneCivilianProfile(profile: NonNullable<ActorRoleProfiles['civilian']>) {
  return {
    ...profile,
    sectorIds: [...(profile.sectorIds ?? [])],
    roleTags: [...(profile.roleTags ?? [])],
    livelihoodActorIds: [...(profile.livelihoodActorIds ?? [])]
  };
}

export function projectCurrentRoleProfile(actor: Actor): CurrentRoleProfileProjection | undefined {
  if (actor.currentIdentity === 'police' && actor.roleProfiles.police) {
    return { identity: 'police', profile: clonePoliceProfile(actor.roleProfiles.police) };
  }
  if (actor.currentIdentity === 'gang_member' && actor.roleProfiles.triad) {
    return { identity: 'gang_member', profile: cloneTriadProfile(actor.roleProfiles.triad) };
  }
  if (actor.currentIdentity === 'civilian' && actor.roleProfiles.civilian) {
    return { identity: 'civilian', profile: cloneCivilianProfile(actor.roleProfiles.civilian) };
  }
  return undefined;
}

export function projectPublicActorRoleProfiles(actor: Actor): ActorRoleProfiles {
  const current = projectCurrentRoleProfile(actor);
  if (!current) return {};
  if (current.identity === 'police') return { police: current.profile };
  if (current.identity === 'gang_member') return { triad: current.profile };
  return { civilian: current.profile };
}

function hasNonCurrentRoleProfile(actor: Actor): boolean {
  return Boolean(
    (actor.currentIdentity !== 'police' && actor.roleProfiles.police) ||
      (actor.currentIdentity !== 'gang_member' && actor.roleProfiles.triad) ||
      (actor.currentIdentity !== 'civilian' && actor.roleProfiles.civilian)
  );
}

function isActorSecretOwner(fact: SecretFact, state: RuntimeState, actor: Actor): boolean {
  if (fact.ownerType === 'actor') return fact.ownerId === actor.actorId;
  return fact.ownerType === 'player' && actor.actorId === state.player.actorId && fact.ownerId === state.player.actorId;
}

export function projectActorActualIdentitySummary(
  state: RuntimeState,
  actor: Actor
): string | undefined {
  const hasNonPublicIdentityFact = Object.values(state.secretFacts).some(
    (fact) =>
      !fact.publicKnown &&
      (fact.kind === 'identity' || fact.kind === 'loyalty') &&
      isActorSecretOwner(fact, state, actor)
  );
  if (hasNonCurrentRoleProfile(actor) || hasNonPublicIdentityFact) return undefined;
  return actor.actualIdentitySummary;
}

export function projectVisibleActorOrganizationRelations(actor: Actor): ActorOrganizationRelation[] {
  return actor.organizationRelations
    .filter((relation) => relation.visibility !== 'hidden')
    .map((relation) => ({ ...relation }));
}

export function projectVisibleActorOrganizationIds(
  actor: Actor,
  visibleRelations: ActorOrganizationRelation[]
): string[] {
  if (!hasNonCurrentRoleProfile(actor)) return [...actor.organizationIds];
  const current = projectCurrentRoleProfile(actor);
  const currentOrganizationId =
    current?.identity === 'police'
      ? current.profile.agencyId
      : current?.identity === 'gang_member'
        ? current.profile.organizationId
        : undefined;
  return Array.from(
    new Set([currentOrganizationId, ...visibleRelations.map((relation) => relation.organizationId)].filter(Boolean) as string[])
  );
}

function projectFact(fact: SecretFact): IdentityFactProjection {
  return {
    secretId: fact.secretId,
    ownerType: fact.ownerType,
    ownerId: fact.ownerId,
    kind: fact.kind,
    summary: fact.summary,
    playerCharacterKnown: fact.playerCharacterKnown,
    publicKnown: fact.publicKnown,
    knownByActorIds: [...fact.knownByActorIds],
    revealState: fact.revealState,
    revealConditions: [...fact.revealConditions],
    importance: fact.importance
  };
}

function compareFacts(left: SecretFact, right: SecretFact): number {
  return right.importance - left.importance || left.secretId.localeCompare(right.secretId);
}

function selectRelevantFacts(state: RuntimeState, relevantActorIds: string[]): SecretFact[] {
  const actorIds = new Set([state.player.actorId, ...relevantActorIds]);
  const organizationIds = new Set(
    [...actorIds]
      .map((actorId) => state.actors[actorId])
      .filter((actor): actor is Actor => Boolean(actor))
      .flatMap((actor) => actor.organizationIds)
  );
  return Object.values(state.secretFacts)
    .filter((fact) => {
      if (fact.ownerType === 'player') return fact.ownerId === state.player.actorId;
      if (fact.ownerType === 'actor') return actorIds.has(fact.ownerId);
      if (fact.ownerType === 'organization') return organizationIds.has(fact.ownerId);
      return fact.publicKnown;
    })
    .sort(compareFacts)
    .slice(0, 40);
}

export function projectPlayerIdentityContext(
  state: RuntimeState,
  options: { relevantActorIds?: string[] } = {}
): PlayerIdentityContextProjection {
  const playerActor = state.actors[state.player.actorId];
  const facts = selectRelevantFacts(state, options.relevantActorIds ?? []);
  const publicFacts = facts.filter((fact) => fact.publicKnown || fact.revealState === 'publicly_revealed');
  const protagonistFacts = facts.filter(
    (fact) => !fact.publicKnown && fact.revealState !== 'publicly_revealed' && fact.playerCharacterKnown
  );
  const directorOnlyFacts = facts.filter(
    (fact) => !fact.publicKnown && fact.revealState !== 'publicly_revealed' && !fact.playerCharacterKnown
  );

  return {
    routeSource: 'player.currentIdentity',
    currentShell: {
      currentIdentity: state.player.currentIdentity,
      publicIdentity: playerActor?.publicIdentity ?? state.player.currentIdentity,
      publicRoleProfile: playerActor ? projectCurrentRoleProfile(playerActor) : undefined
    },
    protagonistPrivateKnowledge: {
      originIdentity: state.player.originIdentity,
      actualIdentitySummary:
        playerActor?.actualIdentitySummary && playerActor.actualIdentitySummary !== playerActor.publicIdentity
          ? playerActor.actualIdentitySummary
          : undefined,
      transitionHistory: state.player.identityHistory.map((record) => ({
        ...record,
        occurredAt: { ...record.occurredAt },
        secretFactIds: [...record.secretFactIds]
      })),
      facts: protagonistFacts.map(projectFact)
    },
    directorOnlyFacts: directorOnlyFacts.map(projectFact),
    publicFacts: publicFacts.map(projectFact)
  };
}
