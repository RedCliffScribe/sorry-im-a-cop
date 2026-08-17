import { describe, expect, it } from 'vitest';
import { validateOpeningNarratorResponse } from './openingSchema';

function createOpeningActorSeed(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Henry Ho',
    englishName: 'Henry Ho',
    gender: 'male',
    computedAge: 43,
    currentIdentity: 'police',
    publicIdentity: 'Duty officer',
    actualIdentitySummary: 'Uniformed station duty officer at Mong Kok Police Station.',
    positionSummary: 'Duty officer at Mong Kok Police Station.',
    profileSummary: 'A careful middle-aged uniformed officer who knows the report room well.',
    relationshipSummary: 'He has just met the player and treats him as a new subordinate.',
    attitudeTowardPlayer: 'Watchful but not hostile.',
    interactionScore: 12,
    bodyConditionSummary: 'Tired from night duty but otherwise normal.',
    longTermMemorySummary: 'He knows the station routines and several local shopkeepers.',
    recentInteractionMemory: 'He assigned the player to pay attention to a late-night complaint.',
    keyMemories: [
      {
        text: 'He saw the player report for duty on the first night.',
        importance: 60,
        visibility: 'player_known'
      }
    ],
    roleProfiles: {
      police: {
        status: 'active',
        rank: 'Sergeant',
        department: 'Uniform Branch',
        stationOrPost: 'Mong Kok Police Station'
      }
    },
    worldpackActorData: {
      hk1988: {
        stationGenerationSource: 'opening'
      }
    },
    presence: 'present',
    visibility: 'player_known',
    importance: 70,
    ...overrides
  };
}

describe('opening narrator schema', () => {
  it('keeps presentation hints optional and normalizes unknown emotions locally', () => {
    const withoutHints = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene.',
      suggestedActions: [],
      playerPatch: {}
    });
    expect(withoutHints.presentationHints).toBeUndefined();

    const withInvalidHint = validateOpeningNarratorResponse({
      narrativeText: '【值日警长】收队。',
      presentationHints: { dialogueEmotions: ['furious'] },
      suggestedActions: [],
      playerPatch: {}
    });
    expect(withInvalidHint.presentationHints).toEqual({ dialogueEmotions: ['neutral'] });
  });

  it('accepts exact opening balances in the tens-of-billions range', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene.',
      suggestedActions: ['Check the account book.'],
      playerPatch: {
        economy: {
          cashOnHand: 50_000,
          bankBalance: 50_000_000_000,
          financeSummary: '家族资产充裕，但日常现金仍按本地账本管理。'
        }
      }
    });

    expect(parsed.playerPatch?.economy).toMatchObject({
      cashOnHand: 50_000,
      bankBalance: 50_000_000_000
    });
    expect(parsed.validationWarnings).toBeUndefined();
  });

  it('drops only an overflowing opening balance while preserving neighboring player fields', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene.',
      suggestedActions: ['Leave home.'],
      playerPatch: {
        name: '林家俊',
        clothing: '剪裁合身的深灰西装。',
        equipment: ['皮夹', '钢笔'],
        economy: {
          cashOnHand: 50_000,
          bankBalance: 100_000_000_000,
          monthlyPressure: 12,
          financeSummary: '家族提供稳定支持。'
        }
      }
    });

    expect(parsed.playerPatch).toMatchObject({
      name: '林家俊',
      clothing: '剪裁合身的深灰西装。',
      equipment: ['皮夹', '钢笔'],
      economy: {
        cashOnHand: 50_000,
        monthlyPressure: 12,
        financeSummary: '家族提供稳定支持。'
      }
    });
    expect(parsed.playerPatch?.economy?.bankBalance).toBeUndefined();
    expect(parsed.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: ['playerPatch', 'economy', 'bankBalance']
      })
    );
  });

  it('accepts an opening triad responsibility through the existing current matter contract', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: '阿成把玩家叫到一旁，交代先弄清庙街摊档争执的来龙去脉。',
      suggestedActions: ['先找摊档老板了解情况。'],
      currentMatterPatches: [
        {
          id: 'matter_opening_triad_responsibility',
          title: '弄清摊档争执',
          summary: '阿成希望玩家先了解争执原因，不要公开借用社团名义。',
          status: 'active',
          priority: 70,
          visibility: 'known',
          source: 'triad_responsibility',
          matterKind: 'social',
          pressureLevel: 2,
          responseWindow: 'today',
          relatedActorIds: ['actor_opening_triad_patron'],
          relatedPlaceIds: ['place_temple_street'],
          relatedOrganizationIds: ['org_wo_shing_wo']
        }
      ]
    });

    expect(parsed.currentMatterPatches).toEqual([
      expect.objectContaining({
        id: 'matter_opening_triad_responsibility',
        source: 'triad_responsibility',
        matterKind: 'social',
        relatedActorIds: ['actor_opening_triad_patron']
      })
    ]);
  });

  it('omits opening NPC seeds without required basic identity fields and records diagnostics', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene.',
      suggestedActions: ['Keep walking.'],
      initialActors: [
        {
          name: 'David Lam',
          currentIdentity: 'civilian',
          positionSummary: 'A vague person in the crowd.',
          profileSummary: 'This should not be accepted as a complete NPC.'
        }
      ]
    });

    expect(parsed.narrativeText).toBe('Opening scene.');
    expect(parsed.suggestedActions).toEqual(['Keep walking.']);
    expect(parsed.initialActors).toHaveLength(0);
    expect(parsed.validationWarnings?.[0]?.path).toEqual(['initialActors', 0, 'gender']);
  });

  it('omits descriptor labels as opening NPC names and records diagnostics', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene.',
      suggestedActions: ['Keep walking.'],
      initialActors: [
        createOpeningActorSeed({
          name: 'triad member',
          currentIdentity: 'triad',
          positionSummary: 'A triad edge member watching the player.'
        })
      ]
    });

    expect(parsed.initialActors).toHaveLength(0);
    expect(parsed.validationWarnings?.[0]).toMatchObject({
      path: ['initialActors', 0, 'name']
    });
  });

  it('accepts opening NPC seeds without vitals and keeps NPC memory/profile fields', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene.',
      suggestedActions: ['Ask the duty officer what happened.'],
      playerPatch: {},
      initialActors: [createOpeningActorSeed({ playerRoleRelation: 'police_supervisor' })],
      memories: [],
      pressureSeeds: [],
      grayLedger: []
    });

    const actor = parsed.initialActors[0];

    expect('vitals' in actor).toBe(false);
    expect(actor.actualIdentitySummary?.toLowerCase()).toContain('duty officer');
    expect(actor.computedAge).toBe(43);
    expect(actor.bodyConditionSummary).toContain('Tired');
    expect(actor.keyMemories[0]?.text).toContain('report for duty');
    expect(actor.roleProfiles.police?.rank).toBe('Sergeant');
    expect(actor.playerRoleRelation).toBe('police_supervisor');
    expect(actor.worldpackActorData.hk1988).toEqual({ stationGenerationSource: 'opening' });
  });

  it('normalizes common just-left opening NPC presence labels instead of dropping the NPC', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene.',
      suggestedActions: ['Follow the girlfriend to the minibus stop.'],
      initialActors: [
        createOpeningActorSeed({
          name: 'Chow Ka Man',
          englishName: 'May Chow',
          gender: 'female',
          computedAge: 23,
          currentIdentity: 'civilian',
          publicIdentity: 'Hospital nurse',
          actualIdentitySummary: 'The player girlfriend who has just left the report room.',
          positionSummary: 'Player girlfriend leaving Mong Kok Police Station.',
          profileSummary: 'A caring adult girlfriend connected to the player home life.',
          relationshipSummary: 'She is the player girlfriend and cohabiting partner.',
          recentInteractionMemory: 'She just brought soup to the player and left the station.',
          presence: 'just_left'
        })
      ]
    });

    expect(parsed.initialActors).toHaveLength(1);
    expect(parsed.initialActors[0]?.name).toBe('Chow Ka Man');
    expect(parsed.initialActors[0]?.presence).toBe('mentioned');
    expect(parsed.validationWarnings).toBeUndefined();
  });

  it('keeps opening NPC attributes when the narrator provides them', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene.',
      suggestedActions: ['Ask the duty officer what happened.'],
      initialActors: [
        createOpeningActorSeed({
          attributes: {
            body: 48,
            action: 57,
            perception: 64,
            thinking: 59,
            negotiation: 52,
            will: 66
          }
        })
      ]
    });

    const actor = parsed.initialActors[0] as unknown as {
      attributes?: {
        body: number;
        action: number;
        perception: number;
        thinking: number;
        negotiation: number;
        will: number;
      };
    };

    expect(actor.attributes).toEqual({
      body: 48,
      action: 57,
      perception: 64,
      thinking: 59,
      negotiation: 52,
      will: 66
    });
  });

  it('accepts opening NPC aliases, call names, and stable traits', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene.',
      suggestedActions: ['Talk to the familiar patrol partner.'],
      initialActors: [
        createOpeningActorSeed({
          name: 'Chan Keung',
          englishName: 'Keung Chan',
          aliases: ['强仔', '阿强'],
          callName: '强哥',
          activeTraits: [
            {
              traitId: 'trait_old_station_hand',
              name: '老差骨',
              source: 'opening',
              description: '在警署混得久，熟悉报案室、巡逻点和街坊脾气。',
              effectSummary: '警署规矩、街坊关系和日常风险判断更稳定。',
              scopes: ['police', 'street'],
              visibility: 'player_known'
            }
          ]
        })
      ]
    });

    const actor = parsed.initialActors[0] as unknown as {
      aliases?: string[];
      callName?: string;
      activeTraits?: Array<{ traitId: string; name: string; status?: string }>;
    };

    expect(actor.aliases).toEqual(['强仔', '阿强']);
    expect(actor.callName).toBe('强哥');
    expect(actor.activeTraits?.[0]).toMatchObject({
      traitId: 'trait_old_station_hand',
      name: '老差骨',
      status: 'active'
    });
  });

  it('accepts female profile data on complete opening female NPC seeds', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene.',
      suggestedActions: ['Ask the hostess what she saw.'],
      initialActors: [
        createOpeningActorSeed({
          name: 'Lily Ho',
          englishName: 'Lily Ho',
          gender: 'female',
          birthDate: '1962-02-18',
          computedAge: 26,
          currentIdentity: 'civilian',
          publicIdentity: 'Nightclub hostess',
          actualIdentitySummary: 'An adult nightclub hostess who knows the entertainment circuit.',
          positionSummary: 'Nightclub hostess.',
          profileSummary: 'A careful woman who understands nightclub and film-circle gossip.',
          femaleProfile: {
            addressToPlayer: 'Sir',
            birthday: '2月18日',
            appearanceDescription: 'Careful makeup and guarded expression.',
            personalityCore: 'Practical, careful, and socially alert.',
            relationshipNetworkEdges: [
              {
                targetName: 'Golden Club',
                relation: 'workplace',
                note: 'Knows floor staff and regular guests.'
              }
            ],
            adultPrivateProfile: {
              enabled: true,
              ageConfirmedAdult: true,
              summary: 'Adult private profile placeholder.'
            }
          }
        })
      ]
    });

    expect(parsed.initialActors[0]?.femaleProfile?.addressToPlayer).toBe('Sir');
    expect(parsed.initialActors[0]?.femaleProfile?.relationshipNetworkEdges?.[0]?.targetName).toBe('Golden Club');
    expect(parsed.initialActors[0]?.femaleProfile?.adultPrivateProfile?.summary).toBe('Adult private profile placeholder.');
  });

  it('keeps opening female NPC seeds when an active trait omits effect summary', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene.',
      suggestedActions: ['Call the girlfriend.'],
      initialActors: [
        createOpeningActorSeed({
          name: 'Suk Yee Lam',
          englishName: 'Suk Yee Lam',
          gender: 'female',
          birthDate: '1964-05-20',
          computedAge: 24,
          currentIdentity: 'civilian',
          publicIdentity: 'Player girlfriend',
          actualIdentitySummary: 'The player adult girlfriend who works in a Mong Kok photo studio.',
          positionSummary: 'Player girlfriend near Mong Kok.',
          profileSummary: 'A stable adult girlfriend connected to the player opening life.',
          activeTraits: [
            {
              traitId: 'trait_opening_girlfriend',
              name: 'Opening girlfriend',
              source: 'opening',
              description: 'Keeps a stable intimate relationship with the player.',
              visibility: 'player_known'
            }
          ],
          femaleProfile: {
            addressToPlayer: 'Ah Bok',
            personalityCore: 'Warm but careful.',
            relationshipNetworkEdges: [
              {
                targetName: 'Lam family',
                relation: 'family',
                note: 'Family pressure can affect the relationship.'
              }
            ],
            adultPrivateProfile: {
              enabled: true,
              ageConfirmedAdult: true,
              summary: 'Adult private profile placeholder.'
            }
          }
        })
      ]
    });

    const actor = parsed.initialActors[0];

    expect(parsed.initialActors).toHaveLength(1);
    expect(actor?.name).toBe('Suk Yee Lam');
    expect(actor?.activeTraits[0]?.effectSummary).toBe('Keeps a stable intimate relationship with the player.');
    expect(actor?.femaleProfile?.relationshipNetworkEdges?.[0]?.relation).toBe('family');
    expect(actor?.femaleProfile?.adultPrivateProfile?.summary).toBe('Adult private profile placeholder.');
  });

  it('normalizes common memory kind aliases instead of failing the whole opening', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene.',
      suggestedActions: ['Step into the street.'],
      memories: [
        {
          text: 'The Sino-British Joint Declaration was signed in 1984.',
          kind: 'historical',
          importance: 100,
          visibility: 'player_known',
          certainty: 'fact'
        }
      ]
    });

    expect(parsed.memories[0]?.kind).toBe('world');
  });

  it('accepts opening case, evidence item, and deferred event writeback modules', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene with an assigned assault case.',
      suggestedActions: ['Submit the witness statement.'],
      casePatches: [
        {
          caseId: 'case_mk_nightclub_assault',
          title: 'Mong Kok Nightclub Assault',
          caseType: 'assault',
          status: 'investigating',
          playerRole: 'assist',
          leadActorName: 'Sergeant Lam',
          summary: 'A nightclub injury report assigned to the player as assisting officer.',
          currentFocus: 'Confirm the witness statement and scene record.',
          playerVisibleProgress: 'The player has one statement in hand.',
          internalProgressSummary: 'The case is still early and should not be treated as solved.',
          relatedPlaceIds: ['place_mong_kok_police_station'],
          evidenceIds: [],
          activityLog: [
            {
              kind: 'created',
              summary: 'The case file was opened during the first duty scene.',
              visibleToPlayer: true
            }
          ],
          visibility: 'player_known'
        }
      ],
      assetPatch: {
        upsertItems: [
          {
            itemId: 'asset_mk_statement_001',
            category: 'document',
            name: 'Nightclub witness statement',
            summary: 'A signed witness statement related to the assault case.',
            detail: 'The document can be submitted to the case file.',
            relatedCaseIds: ['case_mk_nightclub_assault'],
            evidence: {
              caseId: 'case_mk_nightclub_assault',
              caseTitle: 'Mong Kok Nightclub Assault',
              summary: 'Witness statement that may support the assault report.'
            },
            visibility: 'player_known',
            importance: 70
          }
        ]
      },
      deferredEventPatches: [
        {
          eventId: 'deferred_case_followup_001',
          sourceModule: 'case',
          relatedIds: {
            caseId: 'case_mk_nightclub_assault'
          },
          title: 'Case follow-up',
          summary: 'The lead officer may respond after receiving the statement.',
          triggerAt: { year: 1988, month: 9, day: 12, hour: 23, minute: 0 },
          promptInstruction: 'Resolve the lead officer response without rushing prosecution.',
          status: 'pending'
        }
      ]
    });

    expect(parsed.casePatches).toHaveLength(1);
    expect(parsed.casePatches[0]?.caseId).toBe('case_mk_nightclub_assault');
    expect(parsed.assetPatch?.upsertItems[0]?.itemId).toBe('asset_mk_statement_001');
    expect(parsed.deferredEventPatches[0]?.eventId).toBe('deferred_case_followup_001');
  });

  it('salvages opening narrative and actions when an optional memory item is invalid', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene with usable prose.',
      suggestedActions: ['Step into the street.'],
      memories: [
        {
          text: 'A useful world note.',
          kind: 'world',
          importance: 80
        },
        {
          text: 'The model invented an unsupported category.',
          kind: 'political_event',
          importance: 70
        }
      ]
    });

    expect(parsed.narrativeText).toBe('Opening scene with usable prose.');
    expect(parsed.suggestedActions).toEqual(['Step into the street.']);
    expect(parsed.memories).toHaveLength(1);
    expect(parsed.memories[0]?.text).toBe('A useful world note.');
    expect(parsed.validationWarnings?.[0]).toMatchObject({
      path: ['memories', 1, 'kind']
    });
  });

  it('treats empty optional role profiles as omitted instead of failing the opening', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'A wet neon street outside Mong Kok Police Station.',
      suggestedActions: ['Step into the report room.'],
      initialActors: [
        createOpeningActorSeed({
          name: 'Chan Wah',
          gender: 'male',
          computedAge: 27,
          currentIdentity: 'police',
          positionSummary: 'A young constable standing near the counter.',
          profileSummary: 'He is present in the opening scene but has no triad or civilian profile.',
          roleProfiles: {
            police: {
              rank: 'Constable',
              department: 'Uniform Branch',
              stationOrPost: 'Mong Kok Police Station'
            },
            triad: {
              societyName: '',
              roleTitle: '',
              territorySummary: ''
            },
            civilian: {
              publicOccupation: ''
            }
          }
        })
      ]
    });

    const actor = parsed.initialActors[0];

    expect(actor.roleProfiles.police?.rank).toBe('Constable');
    expect(actor.roleProfiles.triad).toBeUndefined();
    expect(actor.roleProfiles.civilian).toBeUndefined();
  });

  it('normalizes common human labels for opening actor current identity', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene.',
      initialActors: [
        createOpeningActorSeed({
          name: 'Chan Chi Ming',
          currentIdentity: 'triad',
          positionSummary: 'A triad-connected street figure.',
          profileSummary: 'A young man used by a local society to pass messages.'
        }),
        createOpeningActorSeed({
          name: 'Lee Wai Han',
          gender: 'female',
          computedAge: 41,
          currentIdentity: 'citizen',
          positionSummary: 'A neighborhood shop owner.',
          profileSummary: 'An ordinary shop owner who knows local gossip.'
        }),
        createOpeningActorSeed({
          name: 'PC Chan',
          computedAge: 24,
          currentIdentity: 'constable',
          positionSummary: 'A uniformed constable.',
          profileSummary: 'A police constable assigned to the same station.'
        }),
        createOpeningActorSeed({
          name: 'Wong Ka Lok',
          computedAge: 35,
          currentIdentity: 'unknown',
          positionSummary: 'A man whose identity is not yet clear.',
          profileSummary: 'A passerby whose role should remain unstated.'
        })
      ]
    });

    expect(parsed.initialActors[0]?.currentIdentity).toBe('gang_member');
    expect(parsed.initialActors[1]?.currentIdentity).toBe('civilian');
    expect(parsed.initialActors[2]?.currentIdentity).toBe('police');
    expect(parsed.initialActors[3]?.currentIdentity).toBe('civilian');
  });

  it('accepts scoped opening secrets with explicit knowledge and reveal boundaries', () => {
    const parsed = validateOpeningNarratorResponse({
      narrativeText: 'Opening scene.',
      secretFacts: [
        {
          secretId: 'secret_player_police_loyalty',
          ownerType: 'player',
          ownerId: 'player',
          kind: 'identity',
          summary: '主角公开进入社团，真实仍效忠警队。',
          playerCharacterKnown: true,
          publicKnown: false,
          knownByActorIds: ['player', 'actor_handler'],
          revealState: 'known_to_some_actors',
          revealConditions: ['主角主动向可靠警务联络人表明身份。'],
          visibility: 'hidden',
          importance: 100
        }
      ]
    });

    expect(parsed.secretFacts).toEqual([
      expect.objectContaining({
        secretId: 'secret_player_police_loyalty',
        playerCharacterKnown: true,
        publicKnown: false,
        knownByActorIds: ['player', 'actor_handler'],
        revealState: 'known_to_some_actors'
      })
    ]);
  });
});
