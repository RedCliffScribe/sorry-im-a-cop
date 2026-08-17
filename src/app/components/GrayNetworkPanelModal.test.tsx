import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { applyGrayNetworkPatch } from '../../domain/grayNetwork/grayNetwork';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { applyNarratorResponse } from '../../domain/writeback/applyWriteback';
import { narratorResponseSchema } from '../../domain/writeback/schema';
import { GrayNetworkPanelModal } from './GrayNetworkPanelModal';

describe('GrayNetworkPanelModal', () => {
  it('renders stable society dossiers even when the current area has no gray-network records', () => {
    render(<GrayNetworkPanelModal state={createInitialRuntimeState()} onClose={vi.fn()} onDraftPlayerAction={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '社团' });
    expect(dialog).toHaveTextContent('社团档案');
    expect(within(dialog).getByRole('region', { name: '新义安社团面板' })).toHaveTextContent('玩家态度');
    expect(dialog).toHaveTextContent('社团本色');
    expect(dialog).toHaveTextContent('话事与交接');
    expect(dialog).toHaveTextContent('势力范围与活动线');
    expect(dialog).toHaveTextContent('并非排他控制');
    expect(dialog).toHaveTextContent('街面公开可知');
    expect(dialog).not.toHaveTextContent('隐藏省略');
    expect(dialog).not.toHaveTextContent('公开名号，细节待确认');
    expect(within(dialog).queryByRole('heading', { name: '当前地区' })).not.toBeInTheDocument();
  });

  it('shows stable major society tabs even when the current area has no gray-network records', () => {
    render(<GrayNetworkPanelModal state={createInitialRuntimeState()} onClose={vi.fn()} onDraftPlayerAction={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '社团' });
    expect(within(dialog).getByRole('button', { name: /新义安/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /十四K/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /和胜和/ })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('组织架构');
    expect(dialog).toHaveTextContent('核心主事层');
    expect(dialog).toHaveTextContent('地区线负责人');
    expect(dialog).toHaveTextContent('人员未知');
    expect(dialog).toHaveTextContent('玩家态度');
    expect(dialog).not.toHaveTextContent('大社团层级公开可知');

    fireEvent.click(within(dialog).getByRole('button', { name: /和胜和/ }));
    expect(dialog).toHaveTextContent('坐馆与议事层');
    expect(dialog).toHaveTextContent('叔父与调停人');

    fireEvent.click(within(dialog).getByRole('button', { name: /十四K/ }));
    expect(dialog).toHaveTextContent('支系名义层');
    expect(dialog).toHaveTextContent('跨线中间人');
  });

  it('groups area records and suggested actions under the selected society', () => {
    const base = createInitialRuntimeState({ currentIdentity: 'police', playerName: '刘博' });
    const currentPlaceId = base.location.currentPlaceId;
    const state = applyGrayNetworkPatch(base, {
      knownOrganizations: [
        {
          organizationId: 'org_sun_yee_on',
          name: 'Sun Yee On',
          visibleName: '新义安外围',
          summary: '警署只知道这批人在夜场外围收风。',
          knownScope: '旺角夜场传闻',
          confidence: 'medium',
          visibility: { police: 'known' },
          relatedActorIds: ['player'],
          relatedPlaceIds: [currentPlaceId],
          relatedCaseIds: []
        }
      ],
      keyPlaces: [
        {
          placeId: currentPlaceId,
          visibleRole: '街面接触点',
          tieSummary: '联发厂侧门有人替新义安传话。',
          riskSummary: '穿制服过去会惊动外围。',
          confidence: 'medium',
          visibility: { police: 'known' },
          relatedActorIds: ['player'],
          relatedOrganizationIds: ['org_sun_yee_on'],
          relatedCaseIds: []
        }
      ],
      relatedPeople: [
        {
          actorId: 'player',
          visibleRole: '被街面认识的警员',
          knownTieSummary: '有人知道他最近查过新义安外围夜场。',
          attitudeToPlayer: '保持戒备。',
          confidence: 'high',
          visibility: { police: 'known' },
          relatedPlaceIds: [currentPlaceId],
          relatedOrganizationIds: ['org_sun_yee_on'],
          relatedCaseIds: []
        }
      ],
      relationClues: [
        {
          clueId: 'clue_syo_karaoke',
          summary: '外围夜场的报案人与新义安成员有旧账。',
          certainty: 'rumor',
          confidence: 'medium',
          visibility: { police: 'known' },
          relatedActorIds: ['player'],
          relatedPlaceIds: [currentPlaceId],
          relatedOrganizationIds: ['org_sun_yee_on'],
          relatedCaseIds: []
        }
      ],
      actionRisks: [
        {
          riskId: 'risk_syo_retaliation',
          identity: 'police',
          title: '夜场反查',
          level: 'medium',
          summary: '继续问下去可能被外围反查身份。',
          suggestedMitigation: '先从低风险线人处确认。',
          relatedActorIds: ['player'],
          relatedPlaceIds: [currentPlaceId]
        }
      ],
      suggestedActions: [
        {
          actionId: 'action_syo_contact',
          identity: 'police',
          text: '先找熟线人确认新义安外围是谁在带话。',
          rationale: '避免直接打草惊蛇。',
          riskLevel: 'low',
          relatedActorIds: ['player'],
          relatedPlaceIds: [currentPlaceId]
        }
      ]
    });
    const onDraftPlayerAction = vi.fn();
    const onClose = vi.fn();

    render(<GrayNetworkPanelModal state={state} onClose={onClose} onDraftPlayerAction={onDraftPlayerAction} />);

    const dialog = screen.getByRole('dialog', { name: '社团' });
    const tabs = within(dialog).getByLabelText('大社团');
    fireEvent.click(within(tabs).getByRole('button', { name: /新义安/ }));
    const detail = within(dialog).getByRole('region', { name: '新义安社团面板' });

    expect(detail).toHaveTextContent('新义安外围');
    expect(detail).toHaveTextContent('联发厂侧门有人替新义安传话。');
    expect(detail).toHaveTextContent('有人知道他最近查过新义安外围夜场。');
    expect(detail).toHaveTextContent('外围夜场的报案人与新义安成员有旧账。');
    expect(detail).toHaveTextContent('街头传闻');
    expect(detail).toHaveTextContent('夜场反查');
    expect(detail).toHaveTextContent('中等风险');
    expect(within(dialog).queryByRole('heading', { name: '已知社团与灰色组织' })).not.toBeInTheDocument();

    fireEvent.click(within(detail).getByRole('button', { name: '先找熟线人确认新义安外围是谁在带话。' }));

    expect(onDraftPlayerAction).toHaveBeenCalledWith('先找熟线人确认新义安外围是谁在带话。');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('updates a selected society attitude through organization writeback', () => {
    const base = createInitialRuntimeState({ currentIdentity: 'police', playerName: '刘博' });
    const response = narratorResponseSchema.parse({
      narrativeText: '街面风声传回警署。',
      turnSummary: '街面风声已经传回警署。',
      suggestedActions: [],
      writeback: {
        organizationPatches: [
          {
            organizationId: 'org_sun_yee_on',
            currentState: '旺角与尖沙咀外围有人试探夜场看场线。',
            stanceTowardPlayer: '对玩家保持戒备，认为他近期查夜场太勤。',
            pressureSummary: '若玩家继续追问夜场账目，可能引来外围成员试探。'
          }
        ]
      }
    });
    const state = applyNarratorResponse(base, response);

    render(<GrayNetworkPanelModal state={state} onClose={vi.fn()} onDraftPlayerAction={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: '社团' });
    fireEvent.click(within(dialog).getByRole('button', { name: /新义安/ }));

    expect(dialog).toHaveTextContent('对玩家保持戒备，认为他近期查夜场太勤。');
    expect(dialog).toHaveTextContent('旺角与尖沙咀外围有人试探夜场看场线。');
    expect(dialog).toHaveTextContent('若玩家继续追问夜场账目，可能引来外围成员试探。');
  });

  it('renders sparse leadership and activity-area evolution from society writeback', () => {
    const base = createInitialRuntimeState({ currentIdentity: 'gang_member', playerName: '刘博' });
    const response = narratorResponseSchema.parse({
      narrativeText: '堂口的议事风声传了出来。',
      turnSummary: '新义安内部开始重新协调旺角线的人事。',
      suggestedActions: [],
      writeback: {
        organizationPatches: [
          {
            organizationId: 'org_sun_yee_on',
            triadState: {
              leadership: {
                phase: 'consultation',
                visibleSummary: '核心主事层正在听取两条地区线的意见，尚未形成公开结果。',
                nextMilestone: '预计三日内再议旺角夜场的人事安排。',
                confidence: 'medium'
              },
              activityAreas: [
                {
                  placeId: 'place_portland_street',
                  statusSummary: '旺角夜场线暂由资深联络人维持日常交代。',
                  pressureSummary: '警方近期巡查增加，未经批准的街面冲突会被迅速切割。',
                  confidence: 'medium'
                }
              ]
            }
          }
        ]
      }
    });
    const state = applyNarratorResponse(base, response);

    render(<GrayNetworkPanelModal state={state} onClose={vi.fn()} onDraftPlayerAction={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: '社团' });

    expect(dialog).toHaveTextContent('内部协调');
    expect(dialog).toHaveTextContent('核心主事层正在听取两条地区线的意见');
    expect(dialog).toHaveTextContent('预计三日内再议旺角夜场的人事安排');
    expect(dialog).toHaveTextContent('旺角夜场线暂由资深联络人维持日常交代');
    expect(dialog).toHaveTextContent('警方近期巡查增加');
  });

  it('renders organization structure updates from society writeback', () => {
    const base = createInitialRuntimeState({ currentIdentity: 'police', playerName: '刘博' });
    const response = narratorResponseSchema.parse({
      narrativeText: '线人补了一句社团架构。',
      turnSummary: '线人补充了社团架构信息。',
      suggestedActions: [],
      writeback: {
        organizationPatches: [
          {
            organizationId: 'org_sun_yee_on',
            structureTree: [
              {
                nodeId: 'org_sun_yee_on_seat',
                label: '坐馆',
                role: '最高话事层',
                personName: '向天强',
                status: '传闻中仍能拍板大方向。',
                confidence: 'medium',
                summary: '只知道是老一辈口中的主事人，未形成可入案证据。',
                children: [
                  {
                    nodeId: 'org_sun_yee_on_mong_kok_head',
                    label: '旺角线',
                    role: '地区话事人',
                    personName: '未知',
                    status: '负责夜场和街面外围，姓名未确认。',
                    confidence: 'low',
                    children: []
                  }
                ]
              }
            ]
          }
        ]
      }
    });
    const state = applyNarratorResponse(base, response);

    render(<GrayNetworkPanelModal state={state} onClose={vi.fn()} onDraftPlayerAction={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '社团' });
    fireEvent.click(within(dialog).getByRole('button', { name: /新义安/ }));

    expect(dialog).toHaveTextContent('组织架构');
    expect(dialog).toHaveTextContent('向天强');
    expect(dialog).toHaveTextContent('传闻中仍能拍板大方向。');
    expect(dialog).toHaveTextContent('旺角线');
    expect(dialog).toHaveTextContent('负责夜场和街面外围，姓名未确认。');
  });

  it('shows current-identity visible records and hides hidden records', () => {
    const base = createInitialRuntimeState({ currentIdentity: 'police', playerName: '刘博' });
    const state = applyGrayNetworkPatch(base, {
      knownOrganizations: [
        {
          organizationId: 'org_sun_yee_on',
          name: 'Visible Society',
          visibleName: '新义安街口人马',
          summary: '警员听说这批人在街口收风。',
          knownScope: '旺角街面传闻',
          confidence: 'medium',
          visibility: { police: 'known', civilian: 'hidden', gang_member: 'known' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: []
        },
        {
          organizationId: 'org_hidden',
          name: 'Hidden Society',
          visibleName: '隐秘堂口',
          summary: '当前身份不应看到。',
          knownScope: '隐藏层级',
          confidence: 'high',
          visibility: { police: 'hidden', civilian: 'hidden', gang_member: 'confirmed' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: []
        }
      ]
    });

    render(<GrayNetworkPanelModal state={state} onClose={vi.fn()} onDraftPlayerAction={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '社团' });
    const detail = within(dialog).getByRole('region', { name: '新义安社团面板' });
    expect(detail).toHaveTextContent('新义安街口人马');
    expect(dialog).not.toHaveTextContent('隐秘堂口');
  });

  it('resolves related actors and places and drafts suggested actions', () => {
    const base = createInitialRuntimeState({ currentIdentity: 'police', playerName: '刘博' });
    const currentPlaceId = base.location.currentPlaceId;
    const state = applyGrayNetworkPatch(base, {
      keyPlaces: [
        {
          placeId: currentPlaceId,
          visibleRole: '街面接触点',
          tieSummary: '附近有人替夜场带话。',
          riskSummary: '穿制服过去会惊动线人。',
          confidence: 'medium',
          visibility: { police: 'known' },
          relatedActorIds: ['player'],
          relatedOrganizationIds: ['org_sun_yee_on'],
          relatedCaseIds: []
        }
      ],
      relatedPeople: [
        {
          actorId: 'player',
          visibleRole: '被街面认识的警员',
          knownTieSummary: '几个线人认得他的警员编号。',
          confidence: 'high',
          visibility: { police: 'known' },
          relatedPlaceIds: [currentPlaceId],
          relatedOrganizationIds: ['org_sun_yee_on'],
          relatedCaseIds: []
        }
      ],
      suggestedActions: [
        {
          actionId: 'ask_contact',
          identity: 'police',
          text: '找相熟线人打听最近街口的风声。',
          rationale: '从低风险渠道收风。',
          riskLevel: 'low',
          relatedActorIds: ['player'],
          relatedPlaceIds: [currentPlaceId]
        }
      ]
    });
    const onDraftPlayerAction = vi.fn();
    const onClose = vi.fn();

    render(<GrayNetworkPanelModal state={state} onClose={onClose} onDraftPlayerAction={onDraftPlayerAction} />);

    const dialog = screen.getByRole('dialog', { name: '社团' });
    const detail = within(dialog).getByRole('region', { name: '新义安社团面板' });
    expect(detail).toHaveTextContent(base.actors.player.name);
    expect(detail).toHaveTextContent(base.places[currentPlaceId].name);

    fireEvent.click(within(detail).getByRole('button', { name: '找相熟线人打听最近街口的风声。' }));

    expect(onDraftPlayerAction).toHaveBeenCalledWith('找相熟线人打听最近街口的风声。');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a society current action, recent settlement, and long-term chronicle in its own dossier', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police', playerName: '刘博' });
    state.backgroundEvolution.organizationTracks.track_sun_yee_on = {
      trackId: 'track_sun_yee_on',
      organizationId: 'org_sun_yee_on',
      status: 'blocked',
      objective: '调整旺角夜场外围联络',
      currentAction: '重新安排夜场外围带话人',
      currentStatus: '原带话人避风，替代人选尚未到位',
      startedAt: state.time,
      expectedEndAt: { ...state.time, day: state.time.day + 3 },
      nextReviewAt: { ...state.time, day: state.time.day + 1 },
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedCityTrackIds: [],
      visibility: 'player_known'
    };
    state.backgroundEvolution.recentOutcomes.push({
      outcomeId: 'outcome_sun_yee_on',
      sourceReviewKey: 'review_sun_yee_on',
      occurredAt: state.time,
      sourceKind: 'organization',
      sourceId: 'org_sun_yee_on',
      title: '外围收风暂时中断',
      summary: '原有带话人因警方盘查暂时避风。',
      relatedActorIds: [],
      relatedOrganizationIds: ['org_sun_yee_on'],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedRelationshipThreadIds: [],
      visibility: 'player_known',
      significance: 'notable'
    });
    state.backgroundEvolution.chronicle.push({
      entryId: 'chronicle_sun_yee_on',
      occurredAt: state.time,
      title: '旺角外围联络方式改变',
      summary: '社团减少固定带话人，改用临时接头。',
      longTermImpact: '街面线索会变得更零散，也更难直接追到主事者。',
      sourceOutcomeIds: ['outcome_sun_yee_on'],
      relatedActorIds: [],
      relatedOrganizationIds: ['org_sun_yee_on'],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      visibility: 'player_known'
    });

    render(<GrayNetworkPanelModal state={state} onClose={vi.fn()} onDraftPlayerAction={vi.fn()} />);
    const detail = screen.getByRole('region', { name: '新义安社团面板' });

    expect(detail).toHaveTextContent('社团演化');
    expect(detail).toHaveTextContent('重新安排夜场外围带话人');
    expect(detail).toHaveTextContent('外围收风暂时中断');
    expect(detail).toHaveTextContent('旺角外围联络方式改变');
    expect(detail).toHaveTextContent('街面线索会变得更零散');
  });

  it('defaults to the current public triad and shows its existing patron, peer, direction, and responsibility', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'gang_member', playerName: '陈启明' });
    const profile = state.actors.player.roleProfiles.triad!;
    state.actors.player.roleProfiles.triad = {
      ...profile,
      organizationId: 'org_wo_shing_wo',
      societyName: '和胜和',
      roleTitle: '庙街外围成员',
      rankSummary: '外围新人',
      territorySummary: '庙街与油麻地一带',
      patronActorIds: ['actor_triad_patron'],
      peerActorIds: ['actor_triad_peer'],
      obligationSummary: '先了解街面情况，再按规矩向上线交代。',
      riskSummary: '不可公开借用社团名义扩大冲突。'
    };
    state.actors.actor_triad_patron = {
      ...state.actors.player,
      actorId: 'actor_triad_patron',
      name: '阿成',
      currentIdentity: 'gang_member',
      publicIdentity: '庙街地区线联络人'
    };
    state.actors.actor_triad_peer = {
      ...state.actors.player,
      actorId: 'actor_triad_peer',
      name: '阿杰',
      currentIdentity: 'gang_member',
      publicIdentity: '同组外围成员'
    };
    state.dynamicEvents.currentMatters.matter_triad_responsibility = {
      id: 'matter_triad_responsibility',
      title: '弄清摊档争执',
      summary: '阿成交代先了解争执原因，不要公开使用社团名义。',
      status: 'active',
      priority: 72,
      visibility: 'known',
      source: 'triad_responsibility',
      matterKind: 'social',
      pressureLevel: 2,
      responseWindow: 'today',
      currentHook: '摊档双方仍在互相指责。',
      relatedActorIds: ['actor_triad_patron', 'actor_triad_peer'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      relatedOrganizationIds: ['org_wo_shing_wo'],
      createdAt: state.time,
      updatedAt: state.time
    };
    state.dynamicEvents.currentMatters.matter_hidden_instruction = {
      ...state.dynamicEvents.currentMatters.matter_triad_responsibility,
      id: 'matter_hidden_instruction',
      title: '玩家尚未知情的秘密交代',
      priority: 100,
      visibility: 'hidden'
    };
    state.backgroundEvolution.organizationTracks.track_wo_shing_wo = {
      trackId: 'track_wo_shing_wo',
      organizationId: 'org_wo_shing_wo',
      status: 'active',
      objective: '降低庙街警方关注，先恢复街面稳定',
      currentAction: '由地区线分别了解摊档纠纷的来龙去脉',
      currentStatus: '老成员希望调停，年轻成员主张强硬处理。',
      startedAt: state.time,
      nextReviewAt: { ...state.time, day: state.time.day + 1 },
      relatedActorIds: ['actor_triad_patron'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      relatedCityTrackIds: [],
      visibility: 'player_known'
    };

    render(<GrayNetworkPanelModal state={state} onClose={vi.fn()} onDraftPlayerAction={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '社团' });
    const detail = within(dialog).getByRole('region', { name: '和胜和社团面板' });
    const membership = within(detail).getByRole('region', { name: '我的社团' });
    expect(detail).toHaveTextContent('当前所属社团');
    expect(membership).toHaveTextContent('庙街外围成员');
    expect(membership).toHaveTextContent('阿成');
    expect(membership).toHaveTextContent('阿杰');
    expect(membership).toHaveTextContent('降低庙街警方关注');
    expect(membership).toHaveTextContent('弄清摊档争执');
    expect(membership).toHaveTextContent('交代人：阿成');
    expect(membership).not.toHaveTextContent('玩家尚未知情的秘密交代');
  });

  it('does not expose a hidden triad membership while the current public identity is police', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police', playerName: '陈启明' });
    state.actors.player.roleProfiles.triad = {
      status: 'hidden',
      organizationId: 'org_wo_shing_wo',
      societyName: '和胜和',
      roleTitle: '秘密地区成员',
      rankSummary: '不可公开的社团位置',
      territorySummary: '秘密庙街线',
      patronActorIds: ['actor_secret_patron'],
      peerActorIds: [],
      rivalActorIds: [],
      obligationSummary: '秘密社团责任',
      riskSummary: '身份暴露风险'
    };
    state.actors.actor_secret_patron = {
      ...state.actors.player,
      actorId: 'actor_secret_patron',
      name: '秘密上线'
    };
    state.dynamicEvents.currentMatters.matter_hidden_triad_responsibility = {
      id: 'matter_hidden_triad_responsibility',
      title: '不应显示的社团责任',
      summary: '警察公开身份下不应在社团面板显示。',
      status: 'active',
      priority: 100,
      visibility: 'hidden',
      source: 'triad_responsibility',
      matterKind: 'social',
      pressureLevel: 3,
      responseWindow: 'today',
      currentHook: '这是隐藏身份下的内部交代。',
      relatedActorIds: ['actor_secret_patron'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      relatedOrganizationIds: ['org_wo_shing_wo'],
      createdAt: state.time,
      updatedAt: state.time
    };

    render(<GrayNetworkPanelModal state={state} onClose={vi.fn()} onDraftPlayerAction={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '社团' });
    expect(within(dialog).queryByRole('region', { name: '我的社团' })).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('秘密地区成员');
    expect(dialog).not.toHaveTextContent('秘密上线');
    expect(dialog).not.toHaveTextContent('秘密社团责任');
    expect(dialog).not.toHaveTextContent('不应显示的社团责任');
  });
});
