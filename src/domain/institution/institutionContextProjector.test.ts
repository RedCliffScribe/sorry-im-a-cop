import { describe, expect, it } from 'vitest';
import type { Organization, RuntimeState } from '../runtime/types';
import { createInitialRuntimeState } from '../runtime/initialState';
import { projectInstitutionContext } from './institutionContextProjector';

function createOrganization(overrides: Partial<Organization> & Pick<Organization, 'organizationId' | 'name'>): Organization {
  return {
    organizationId: overrides.organizationId,
    name: overrides.name,
    aliases: overrides.aliases,
    type: overrides.type ?? 'business',
    summary: overrides.summary ?? `${overrides.name} summary.`,
    publicKnowledge: overrides.publicKnowledge ?? `${overrides.name} public knowledge.`,
    currentState: overrides.currentState ?? `${overrides.name} current state.`,
    stanceTowardPlayer: overrides.stanceTowardPlayer ?? '暂未形成明确态度。',
    pressureSummary: overrides.pressureSummary ?? '暂无明确压力。',
    relatedActorIds: overrides.relatedActorIds ?? [],
    relatedPlaceIds: overrides.relatedPlaceIds ?? [],
    relatedCaseIds: overrides.relatedCaseIds ?? [],
    visibility: overrides.visibility ?? 'player_known',
    importance: overrides.importance ?? 50
  };
}

function withCurrentPlaceOwningOrganization(state: RuntimeState, organizationId: string): RuntimeState {
  const place = state.places[state.location.currentPlaceId];
  return {
    ...state,
    places: {
      ...state.places,
      [place.placeId]: {
        ...place,
        owningOrganizationId: organizationId
      }
    }
  };
}

describe('institution context projector', () => {
  it('projects the organization tied to the current place', () => {
    const base = createInitialRuntimeState();
    const state = withCurrentPlaceOwningOrganization(
      {
        ...base,
        organizations: {
          ...base.organizations,
          org_media_house: createOrganization({
            organizationId: 'org_media_house',
            name: '明报报馆',
            aliases: ['明报'],
            type: 'media'
          })
        }
      },
      'org_media_house'
    );

    const projection = projectInstitutionContext(state);

    const projected = projection.organizations.find((organization) => organization.organizationId === 'org_media_house');
    expect(projected).toMatchObject({
      organizationId: 'org_media_house',
      name: '明报报馆',
      aliases: ['明报']
    });
    expect(projected?.reasons).toContain('current_place');
  });

  it('projects visible organization relations from present actors', () => {
    const state = createInitialRuntimeState();
    state.actors.player.organizationRelations.push({
      organizationId: 'org_tvb',
      relationType: 'informal_contact',
      roleTitle: '采访联络',
      departmentOrUnit: '新闻部',
      summary: '玩家认识一名电视台新闻联络人。',
      visibility: 'player_known'
    });

    const projection = projectInstitutionContext(state);

    expect(projection.organizations.some((organization) => organization.organizationId === 'org_tvb')).toBe(true);
    expect(projection.actorRelations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 'player',
          organizationId: 'org_tvb',
          organizationName: expect.any(String),
          roleTitle: '采访联络',
          visibility: 'player_known'
        })
      ])
    );
  });

  it('filters hidden relations and hidden organizations from projection', () => {
    const base = createInitialRuntimeState();
    const state = {
      ...base,
      organizations: {
        ...base.organizations,
        org_hidden_cell: createOrganization({
          organizationId: 'org_hidden_cell',
          name: '秘密接触点',
          visibility: 'hidden',
          importance: 100
        }),
        org_visible_sensitive: createOrganization({
          organizationId: 'org_visible_sensitive',
          name: '可见机构',
          importance: 20
        })
      },
      actors: {
        ...base.actors,
        player: {
          ...base.actors.player,
          organizationRelations: [
            ...base.actors.player.organizationRelations,
            {
              organizationId: 'org_hidden_cell',
              relationType: 'source',
              summary: '隐秘接触，不应投喂普通 Prompt。',
              visibility: 'hidden' as const
            },
            {
              organizationId: 'org_visible_sensitive',
              relationType: 'informal_contact',
              summary: '这条关系本身也是隐秘的。',
              visibility: 'hidden' as const
            }
          ]
        }
      }
    };

    const projection = projectInstitutionContext(state);

    expect(projection.organizations.some((organization) => organization.organizationId === 'org_hidden_cell')).toBe(false);
    expect(projection.organizations.some((organization) => organization.organizationId === 'org_visible_sensitive')).toBe(false);
    expect(projection.actorRelations.some((relation) => relation.organizationId === 'org_visible_sensitive')).toBe(false);
    expect(projection.diagnostics.omittedHiddenCount).toBeGreaterThanOrEqual(2);
  });

  it('limits projected organizations and records omitted count', () => {
    const base = createInitialRuntimeState();
    const organizations = { ...base.organizations };
    for (let index = 1; index <= 8; index += 1) {
      organizations[`org_high_${index}`] = createOrganization({
        organizationId: `org_high_${index}`,
        name: `高重要机构 ${index}`,
        importance: 95 - index
      });
    }

    const projection = projectInstitutionContext({ ...base, organizations }, { maxOrganizations: 3 });

    expect(projection.organizations).toHaveLength(3);
    expect(projection.diagnostics.projectedOrganizationIds).toHaveLength(3);
    expect(projection.diagnostics.omittedIrrelevantCount).toBeGreaterThan(0);
  });

  it('records diagnostics for missing organization references', () => {
    const state = createInitialRuntimeState();
    state.actors.player.organizationRelations.push({
      organizationId: 'org_missing_institution',
      relationType: 'informal_contact',
      summary: '这条关系指向一个缺失机构。',
      visibility: 'player_known'
    });

    const projection = projectInstitutionContext(state);

    expect(projection.diagnostics.missingOrganizationRefs).toEqual(
      expect.arrayContaining([expect.stringContaining('org_missing_institution')])
    );
  });
});
