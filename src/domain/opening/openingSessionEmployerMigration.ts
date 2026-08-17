import type { RuntimeState } from '../runtime/types';
import {
  openingSessionDraftSchema,
  type OpeningSessionDraft
} from './openingSessionDraft';
import type { OpeningRecoveryCode } from './openingFailureClassification';
import { resolveOpeningCivilianEmployerContract } from './openingCivilianEmployerContract';

const LEGACY_SLOT_ID = 'opening_actor_civilian_work_relation_1';
const SOCIAL_SLOT_ID = 'opening_actor_civilian_social_relation_1';

export interface OpeningSessionEmployerMigrationDiagnostic {
  code: OpeningRecoveryCode;
  message: string;
  path: Array<string | number>;
}

export interface OpeningSessionEmployerMigrationResult {
  draft: OpeningSessionDraft;
  changed: boolean;
  diagnostics: OpeningSessionEmployerMigrationDiagnostic[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function reconcileOpeningSessionCivilianEmployerContract({
  draft,
  state,
  now = new Date().toISOString()
}: {
  draft: OpeningSessionDraft;
  state: RuntimeState;
  now?: string;
}): OpeningSessionEmployerMigrationResult {
  if (
    state.player.currentIdentity !== 'civilian' ||
    draft.narrativeDraft ||
    draft.runtimeDraft
  ) {
    return { draft, changed: false, diagnostics: [] };
  }

  const player = state.actors[state.player.actorId];
  const employerOrganizationId =
    player?.roleProfiles.civilian?.employerOrganizationId;
  if (
    employerOrganizationId &&
    state.organizations[employerOrganizationId]
  ) {
    return { draft, changed: false, diagnostics: [] };
  }

  const legacySlotIndex = draft.skeleton.actorSlots.findIndex(
    (slot) => slot.slotId === LEGACY_SLOT_ID
  );
  if (legacySlotIndex < 0) {
    return { draft, changed: false, diagnostics: [] };
  }

  const next = clone(draft);
  const preservedActorId =
    next.skeleton.actorSlots[legacySlotIndex].actorId;
  next.skeleton.requiredOrganizationIds = [];
  next.skeleton.actorSlots[legacySlotIndex] = {
    slotId: SOCIAL_SLOT_ID,
    actorId: preservedActorId,
    required: true,
    allowedPlayerRoleRelations: ['civilian_social_relation'],
    requiredOrganizationIds: []
  };

  if (next.castDraft) {
    next.castDraft.actors = next.castDraft.actors.map((actor) =>
      actor.slotId === LEGACY_SLOT_ID
        ? {
            ...actor,
            slotId: SOCIAL_SLOT_ID,
            playerRoleRelation: 'civilian_social_relation',
            organizationIds: actor.organizationIds.filter((organizationId) =>
              Boolean(state.organizations[organizationId])
            )
          }
        : actor
    );
    next.castDraft.actionIntents = next.castDraft.actionIntents.map(
      (action) => ({
        ...action,
        relatedActorSlotIds: action.relatedActorSlotIds.map((slotId) =>
          slotId === LEGACY_SLOT_ID ? SOCIAL_SLOT_ID : slotId
        )
      })
    );
  }

  const legacyCheckpoint = next.actorProfiles[LEGACY_SLOT_ID];
  delete next.actorProfiles[LEGACY_SLOT_ID];
  if (legacyCheckpoint) {
    if (legacyCheckpoint.status === 'ready') {
      const profile = clone(legacyCheckpoint.profile);
      profile.playerRoleRelation = 'civilian_social_relation';
      profile.organizationIds = profile.organizationIds.filter(
        (organizationId) => Boolean(state.organizations[organizationId])
      );
      const employerResolution = resolveOpeningCivilianEmployerContract({
        actor: profile,
        state
      });
      next.actorProfiles[SOCIAL_SLOT_ID] = {
        status: 'ready',
        actorSlotId: SOCIAL_SLOT_ID,
        actorId: preservedActorId,
        profile: employerResolution.actor
      };
    } else {
      next.actorProfiles[SOCIAL_SLOT_ID] = {
        status: 'pending',
        actorSlotId: SOCIAL_SLOT_ID,
        actorId: preservedActorId
      };
    }
  }
  next.updatedAt = now;

  return {
    draft: openingSessionDraftSchema.parse(next),
    changed: true,
    diagnostics: [
      {
        code: 'opening_employer_contract_missing_upstream',
        path: ['skeleton', 'actorSlots', legacySlotIndex],
        message:
          '旧开局草稿要求生成工作关系人物，但玩家没有已登记的正式雇主机构。'
      },
      {
        code: 'opening_cast_rebuilt_for_employer_contract',
        path: ['skeleton', 'actorSlots', legacySlotIndex],
        message:
          '已保留当前开局和其他人物检查点，并将无解的工作关系槽位迁移为普通社会关系槽位。'
      }
    ]
  };
}
