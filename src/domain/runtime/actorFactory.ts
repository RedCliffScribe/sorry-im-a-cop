import type {
  Actor,
  ActorAdultPrivateWombProfile,
  ActorFemaleProfile,
  ActorMemory,
  ActorRoleProfiles,
  AttributeBlock,
  GameTime,
  Trait,
  TraitProgress,
  Vitals
} from './types';
import { projectStableIdentityRef } from '../avgResourcePack/stableIdentity';

export type ActorDraft = Pick<Actor, 'actorId' | 'name' | 'currentIdentity'> & Partial<Omit<Actor, 'actorId' | 'name' | 'currentIdentity'>>;

const defaultAttributes: AttributeBlock = {
  body: 50,
  action: 50,
  perception: 50,
  thinking: 50,
  negotiation: 50,
  will: 50
};

function fallbackIdentityLabel(identity: Actor['currentIdentity']): string {
  if (identity === 'police') return 'police';
  if (identity === 'gang_member') return 'underworld-associated';
  return 'civilian';
}

function cloneAttributes(attributes: AttributeBlock | undefined): AttributeBlock {
  return { ...(attributes ?? defaultAttributes) };
}

function cloneVitals(vitals: Vitals | undefined): Vitals | undefined {
  return vitals ? { ...vitals } : undefined;
}

function cloneTraits(traits: Trait[] | undefined): Trait[] {
  return (traits ?? []).map((trait) => ({ ...trait, scopes: [...trait.scopes] }));
}

function cloneTraitProgress(progress: TraitProgress[] | undefined): TraitProgress[] {
  return (progress ?? []).map((item) => ({ ...item }));
}

function cloneActorMemories(memories: ActorMemory[] | undefined): ActorMemory[] {
  return (memories ?? []).map((memory) => ({
    ...memory,
    gameTime: { ...memory.gameTime }
  }));
}

function cloneOrganizationRelations(relations: Actor['organizationRelations'] | undefined): Actor['organizationRelations'] {
  return (relations ?? []).map((relation) => ({ ...relation }));
}

function cloneTime(time: GameTime): GameTime {
  return { ...time };
}

function cloneWombProfile(womb: ActorAdultPrivateWombProfile | undefined): ActorAdultPrivateWombProfile | undefined {
  if (!womb) return undefined;
  return {
    ...womb,
    records: womb.records.map((record) => ({
      ...record,
      paternityCandidates: record.paternityCandidates?.map((candidate) => ({ ...candidate }))
    })),
    pregnancy: womb.pregnancy
      ? {
          ...womb.pregnancy,
          registeredAt: cloneTime(womb.pregnancy.registeredAt),
          checkDueAt: cloneTime(womb.pregnancy.checkDueAt),
          confirmationDueAt: cloneTime(womb.pregnancy.confirmationDueAt),
          deliveryWindowAt: cloneTime(womb.pregnancy.deliveryWindowAt),
          dueAt: cloneTime(womb.pregnancy.dueAt),
          deliveryDeadlineAt: cloneTime(womb.pregnancy.deliveryDeadlineAt),
          suspectedAt: womb.pregnancy.suspectedAt ? cloneTime(womb.pregnancy.suspectedAt) : undefined,
          confirmedAt: womb.pregnancy.confirmedAt ? cloneTime(womb.pregnancy.confirmedAt) : undefined,
          deliveredAt: womb.pregnancy.deliveredAt ? cloneTime(womb.pregnancy.deliveredAt) : undefined,
          postpartumUntil: womb.pregnancy.postpartumUntil ? cloneTime(womb.pregnancy.postpartumUntil) : undefined,
          riskTypes: [...womb.pregnancy.riskTypes],
          riskSummaries: [...womb.pregnancy.riskSummaries],
          paternityCandidates: womb.pregnancy.paternityCandidates.map((candidate) => ({ ...candidate }))
        }
      : undefined,
    pendingPregnancyChecks: womb.pendingPregnancyChecks?.map((pregnancy) => ({
      ...pregnancy,
      registeredAt: cloneTime(pregnancy.registeredAt),
      checkDueAt: cloneTime(pregnancy.checkDueAt),
      confirmationDueAt: cloneTime(pregnancy.confirmationDueAt),
      deliveryWindowAt: cloneTime(pregnancy.deliveryWindowAt),
      dueAt: cloneTime(pregnancy.dueAt),
      deliveryDeadlineAt: cloneTime(pregnancy.deliveryDeadlineAt),
      suspectedAt: pregnancy.suspectedAt ? cloneTime(pregnancy.suspectedAt) : undefined,
      confirmedAt: pregnancy.confirmedAt ? cloneTime(pregnancy.confirmedAt) : undefined,
      deliveredAt: pregnancy.deliveredAt ? cloneTime(pregnancy.deliveredAt) : undefined,
      postpartumUntil: pregnancy.postpartumUntil ? cloneTime(pregnancy.postpartumUntil) : undefined,
      riskTypes: [...pregnancy.riskTypes],
      riskSummaries: [...pregnancy.riskSummaries],
      paternityCandidates: pregnancy.paternityCandidates.map((candidate) => ({ ...candidate }))
    })),
    lastPregnancyCheck: womb.lastPregnancyCheck
      ? {
          ...womb.lastPregnancyCheck,
          checkedAt: cloneTime(womb.lastPregnancyCheck.checkedAt),
          cooldownUntil: cloneTime(womb.lastPregnancyCheck.cooldownUntil)
        }
      : undefined,
    pregnancyHistory: womb.pregnancyHistory?.map((record) => ({
      ...record,
      startedAt: cloneTime(record.startedAt),
      endedAt: cloneTime(record.endedAt),
      paternityCandidates: record.paternityCandidates?.map((candidate) => ({ ...candidate }))
    }))
  };
}

function cloneFemaleProfile(profile: ActorFemaleProfile | undefined): ActorFemaleProfile | undefined {
  if (!profile) return undefined;

  return {
    ...profile,
    relationshipNetwork: profile.relationshipNetwork ? [...profile.relationshipNetwork] : undefined,
    updatedAt: profile.updatedAt ? { ...profile.updatedAt } : undefined,
    adultPrivateProfile: profile.adultPrivateProfile
      ? {
          ...profile.adultPrivateProfile,
          womb: cloneWombProfile(profile.adultPrivateProfile.womb),
          partProfiles: profile.adultPrivateProfile.partProfiles
            ? Object.fromEntries(
                Object.entries(profile.adultPrivateProfile.partProfiles).map(([key, part]) => [
                  key,
                  part
                    ? {
                        ...part,
                        updatedAt: part.updatedAt ? cloneTime(part.updatedAt) : undefined
                      }
                    : part
                ])
              )
            : undefined,
          updatedAt: profile.adultPrivateProfile.updatedAt ? { ...profile.adultPrivateProfile.updatedAt } : undefined
        }
      : undefined
  };
}

function cloneRoleProfiles(roleProfiles: ActorRoleProfiles | undefined): ActorRoleProfiles {
  if (!roleProfiles) return {};

  return {
    ...roleProfiles,
    police: roleProfiles.police
      ? {
          ...roleProfiles.police,
          supervisorActorIds: [...roleProfiles.police.supervisorActorIds],
          peerActorIds: [...roleProfiles.police.peerActorIds]
        }
      : undefined,
    triad: roleProfiles.triad
      ? {
          ...roleProfiles.triad,
          patronActorIds: [...roleProfiles.triad.patronActorIds],
          peerActorIds: [...roleProfiles.triad.peerActorIds],
          rivalActorIds: [...roleProfiles.triad.rivalActorIds]
        }
      : undefined,
    civilian: roleProfiles.civilian
      ? {
          ...roleProfiles.civilian,
          sectorIds: [...(roleProfiles.civilian.sectorIds ?? [])],
          roleTags: [...(roleProfiles.civilian.roleTags ?? [])],
          livelihoodActorIds: [...(roleProfiles.civilian.livelihoodActorIds ?? [])]
        }
      : undefined
  };
}

export function createActorDefaults(draft: ActorDraft): Actor {
  const positionSummary = draft.positionSummary ?? draft.publicIdentity ?? fallbackIdentityLabel(draft.currentIdentity);
  const statusSummary = draft.statusSummary ?? '';
  const actor: Actor = {
    actorId: draft.actorId,
    name: draft.name,
    englishName: draft.englishName,
    aliases: [...(draft.aliases ?? [])],
    callName: draft.callName,
    gender: draft.gender ?? 'unknown',
    policeNumber: draft.policeNumber,
    birthDate: draft.birthDate,
    computedAge: draft.computedAge,
    visualAgeAnchor: draft.visualAgeAnchor,
    currentIdentity: draft.currentIdentity,
    publicIdentity: draft.publicIdentity,
    actualIdentitySummary: draft.actualIdentitySummary ?? draft.publicIdentity ?? positionSummary,
    roleProfiles: cloneRoleProfiles(draft.roleProfiles),
    organizationIds: [...(draft.organizationIds ?? [])],
    organizationRelations: cloneOrganizationRelations(draft.organizationRelations),
    positionSummary,
    currentPlaceId: draft.currentPlaceId,
    currentSceneId: draft.currentSceneId,
    presence: draft.presence ?? 'mentioned',
    lastSeenAt: draft.lastSeenAt ? { ...draft.lastSeenAt } : undefined,
    lastSeenPlaceId: draft.lastSeenPlaceId,
    profileSummary: draft.profileSummary ?? positionSummary,
    appearance: draft.appearance ?? '',
    clothing: draft.clothing ?? '',
    equipment: [...(draft.equipment ?? [])],
    personality: draft.personality ?? '',
    speechStyle: draft.speechStyle ?? '',
    motivation: draft.motivation ?? '',
    longTermGoal: draft.longTermGoal ?? '',
    values: draft.values ?? '',
    attributes: cloneAttributes(draft.attributes),
    activeTraits: cloneTraits(draft.activeTraits),
    traitProgress: cloneTraitProgress(draft.traitProgress),
    statusSummary,
    bodyConditionSummary: draft.bodyConditionSummary ?? statusSummary,
    relationshipSummary: draft.relationshipSummary ?? '',
    attitudeTowardPlayer: draft.attitudeTowardPlayer ?? '',
    interactionScore: draft.interactionScore ?? 0,
    trustTendency: draft.trustTendency ?? '',
    entanglementSummary: draft.entanglementSummary ?? '',
    longTermMemorySummary: draft.longTermMemorySummary ?? '',
    recentInteractionMemory: draft.recentInteractionMemory ?? '',
    keyMemories: cloneActorMemories(draft.keyMemories),
    femaleProfile: cloneFemaleProfile(draft.femaleProfile),
    parentActorIds: draft.parentActorIds ? [...draft.parentActorIds] : undefined,
    childActorIds: draft.childActorIds ? [...draft.childActorIds] : undefined,
    visibility: draft.visibility ?? 'player_known',
    importance: draft.importance ?? 50,
    manualProfileOverride: draft.manualProfileOverride
      ? {
          lockedFields: [...draft.manualProfileOverride.lockedFields],
          updatedAt: { ...draft.manualProfileOverride.updatedAt }
      }
      : undefined,
    stableIdentityRef: draft.stableIdentityRef
      ? { ...draft.stableIdentityRef }
      : undefined,
    worldpackActorData: { ...(draft.worldpackActorData ?? {}) }
  };

  const vitals = cloneVitals(draft.vitals);
  if (vitals) {
    actor.vitals = vitals;
  }

  const stableIdentityRef = projectStableIdentityRef(actor, 'hk1988', {
    allowRuntimeActorId: false
  });
  return stableIdentityRef ? { ...actor, stableIdentityRef } : actor;
}

export function normalizeActor(actor: ActorDraft): Actor {
  return createActorDefaults(actor);
}
