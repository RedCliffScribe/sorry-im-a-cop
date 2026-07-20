import { describe, expect, it } from 'vitest';
import { createActorDefaults, normalizeActor } from './actorFactory';

describe('actor factory', () => {
  it('creates a lightweight NPC actor without player-only vitals', () => {
    const actor = createActorDefaults({
      actorId: 'npc_tea_owner',
      name: 'Uncle Wah',
      currentIdentity: 'civilian',
      publicIdentity: 'Tea stall owner',
      positionSummary: 'Runs a late-night tea stall in Mong Kok.',
      relationshipSummary: 'Knows the player by face but not well.',
      interactionScore: 2
    });

    expect(actor.actorId).toBe('npc_tea_owner');
    expect(actor.name).toBe('Uncle Wah');
    expect(actor.vitals).toBeUndefined();
    expect(actor.actualIdentitySummary).toBe('Tea stall owner');
    expect(actor.roleProfiles).toEqual({});
    expect(actor.worldpackActorData).toEqual({});
    expect(actor.relationshipSummary).toBe('Knows the player by face but not well.');
    expect(actor.interactionScore).toBe(2);
    expect(actor.attributes.body).toBe(50);
    expect(actor.keyMemories).toEqual([]);
    expect(actor.organizationRelations).toEqual([]);
  });

  it('preserves supplied role profiles, memories, traits, and worldpack extension data', () => {
    const actor = createActorDefaults({
      actorId: 'npc_cid_sergeant',
      name: 'Sergeant Ho',
      currentIdentity: 'police',
      roleProfiles: {
        police: {
          status: 'active',
          agencyId: 'org_hk_police',
          stationOrPost: 'Mong Kok Police Station',
          department: 'CID',
          rank: 'Sergeant',
          assignmentSummary: 'Detective Sergeant',
          supervisorActorIds: ['npc_ci_lam'],
          peerActorIds: ['npc_dc_chan'],
          authoritySummary: 'Handles criminal investigation work within station limits.',
          accessSummary: 'Has access to CID case materials assigned to the team.',
          dutySummary: 'Investigates local criminal matters.',
          institutionalReputation: 'Known as careful but hard to approach.',
          disciplinePressureSummary: 'Watched by superiors because of old informant ties.'
        }
      },
      organizationRelations: [
        {
          organizationId: 'org_hk_police',
          relationType: 'employee',
          roleTitle: 'Detective Sergeant',
          departmentOrUnit: 'Mong Kok CID',
          summary: 'Works in the station CID team.',
          visibility: 'player_known',
          isPrimary: true
        }
      ],
      activeTraits: [
        {
          traitId: 'trait_cautious',
          name: 'Cautious',
          source: 'llm_generated',
          description: 'Moves slowly when facts are uncertain.',
          effectSummary: 'Raises caution in witness and informant scenes.',
          scopes: ['investigation'],
          status: 'active',
          visibility: 'player_known'
        }
      ],
      keyMemories: [
        {
          memoryId: 'mem_ho_001',
          text: 'He once warned the player not to trust a nightclub informant.',
          gameTime: { year: 1988, month: 9, day: 12, hour: 22, minute: 0 },
          importance: 70,
          source: 'scene',
          visibility: 'player_known'
        }
      ],
      worldpackActorData: {
        hk1988: {
          collarNumberKnown: false
        }
      }
    });

    expect(actor.roleProfiles.police?.rank).toBe('Sergeant');
    expect(actor.organizationRelations[0]).toEqual({
      organizationId: 'org_hk_police',
      relationType: 'employee',
      roleTitle: 'Detective Sergeant',
      departmentOrUnit: 'Mong Kok CID',
      summary: 'Works in the station CID team.',
      visibility: 'player_known',
      isPrimary: true
    });
    expect(actor.activeTraits[0]?.name).toBe('Cautious');
    expect(actor.keyMemories[0]?.memoryId).toBe('mem_ho_001');
    expect(actor.worldpackActorData?.hk1988).toEqual({ collarNumberKnown: false });
  });

  it('normalizes older actor records without overwriting existing content', () => {
    const normalized = normalizeActor({
      actorId: 'npc_old',
      name: 'Old Save NPC',
      currentIdentity: 'gang_member',
      publicIdentity: 'Nightclub runner',
      positionSummary: 'Works around a Tsim Sha Tsui nightclub.',
      personality: 'Smooth, watchful.',
      presence: 'nearby',
      visibility: 'hidden',
      importance: 35
    });

    expect(normalized.publicIdentity).toBe('Nightclub runner');
    expect(normalized.actualIdentitySummary).toBe('Nightclub runner');
    expect(normalized.personality).toBe('Smooth, watchful.');
    expect(normalized.presence).toBe('nearby');
    expect(normalized.visibility).toBe('hidden');
    expect(normalized.importance).toBe(35);
    expect(normalized.roleProfiles).toEqual({});
    expect(normalized.vitals).toBeUndefined();
  });
});
