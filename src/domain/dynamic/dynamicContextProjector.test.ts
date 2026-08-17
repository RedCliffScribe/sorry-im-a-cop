import { describe, expect, it } from 'vitest';
import { addGameHours } from '../backgroundEvolution/time';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { CurrentMatter, NewsIssue, RuntimeState, Signal } from '../runtime/types';
import { projectDynamicContext } from './dynamicContextProjector';

function matter(overrides: Partial<CurrentMatter> & Pick<CurrentMatter, 'id' | 'title'>, state: RuntimeState): CurrentMatter {
  return {
    id: overrides.id,
    title: overrides.title,
    summary: overrides.summary ?? `${overrides.title} summary.`,
    status: overrides.status ?? 'active',
    priority: overrides.priority ?? 50,
    visibility: overrides.visibility ?? 'known',
    source: overrides.source ?? 'test',
    matterKind: overrides.matterKind,
    pressureLevel: overrides.pressureLevel,
    responseWindow: overrides.responseWindow,
    consequenceHint: overrides.consequenceHint,
    dueAt: overrides.dueAt,
    currentHook: overrides.currentHook,
    unread: overrides.unread,
    relatedActorIds: overrides.relatedActorIds ?? [],
    relatedPlaceIds: overrides.relatedPlaceIds ?? [],
    relatedCaseIds: overrides.relatedCaseIds ?? [],
    relatedOrganizationIds: overrides.relatedOrganizationIds ?? [],
    createdAt: overrides.createdAt ?? state.time,
    updatedAt: overrides.updatedAt ?? state.time,
    lastSeenAt: overrides.lastSeenAt
  };
}

function signal(overrides: Partial<Signal> & Pick<Signal, 'id' | 'title'>, state: RuntimeState): Signal {
  return {
    id: overrides.id,
    title: overrides.title,
    summary: overrides.summary ?? `${overrides.title} summary.`,
    signalType: overrides.signalType ?? 'rumor',
    reliability: overrides.reliability ?? 'unknown',
    status: overrides.status ?? 'active',
    visibility: overrides.visibility ?? 'known',
    relatedActorIds: overrides.relatedActorIds ?? [],
    relatedPlaceIds: overrides.relatedPlaceIds ?? [],
    relatedCaseIds: overrides.relatedCaseIds ?? [],
    relatedOrganizationIds: overrides.relatedOrganizationIds ?? [],
    createdAt: overrides.createdAt ?? state.time,
    updatedAt: overrides.updatedAt ?? state.time
  };
}

function news(overrides: Partial<NewsIssue> & Pick<NewsIssue, 'id' | 'headline'>, state: RuntimeState): NewsIssue {
  return {
    id: overrides.id,
    date: overrides.date ?? state.time,
    outletName: overrides.outletName ?? '本地报章',
    headline: overrides.headline,
    summary: overrides.summary ?? `${overrides.headline} summary.`,
    articles: overrides.articles ?? [],
    createdAt: overrides.createdAt ?? state.time,
    updatedAt: overrides.updatedAt ?? state.time,
    read: overrides.read ?? false,
    important: overrides.important,
    archivedAt: overrides.archivedAt
  };
}

describe('dynamic context projector', () => {
  it('projects current matters and signals related to the current place and present actors', () => {
    const base = createInitialRuntimeState();
    const state: RuntimeState = {
      ...base,
      dynamicEvents: {
        ...base.dynamicEvents,
        currentMatters: {
          matter_place: matter(
            {
              id: 'matter_place',
              title: '旺角街面冲突余波',
              priority: 80,
              relatedPlaceIds: [base.location.currentPlaceId]
            },
            base
          ),
          matter_hidden: matter(
            {
              id: 'matter_hidden',
              title: '不应投喂的隐藏事项',
              priority: 100,
              visibility: 'hidden',
              relatedPlaceIds: [base.location.currentPlaceId]
            },
            base
          )
        },
        signals: {
          signal_actor: signal(
            {
              id: 'signal_actor',
              title: '街坊盯上巡逻警',
              relatedActorIds: ['player']
            },
            base
          )
        },
        newsIssues: {}
      }
    };

    const projection = projectDynamicContext(state);

    expect(projection.currentMatters.map((item) => item.id)).toEqual(['matter_place']);
    expect(projection.signals.map((item) => item.id)).toEqual(['signal_actor']);
    expect(projection.diagnostics.omittedHiddenCount).toBe(1);
  });

  it('limits projected dynamic items and records omitted counts', () => {
    const base = createInitialRuntimeState();
    const currentMatters: RuntimeState['dynamicEvents']['currentMatters'] = {};
    for (let index = 1; index <= 6; index += 1) {
      currentMatters[`matter_${index}`] = matter(
        {
          id: `matter_${index}`,
          title: `事项 ${index}`,
          priority: 100 - index,
          relatedActorIds: ['player']
        },
        base
      );
    }

    const projection = projectDynamicContext(
      {
        ...base,
        dynamicEvents: {
          ...base.dynamicEvents,
          currentMatters
        }
      },
      { maxCurrentMatters: 3 }
    );

    expect(projection.currentMatters).toHaveLength(3);
    expect(projection.diagnostics.omittedCurrentMatterCount).toBe(3);
  });

  it('keeps the current public triad responsibility in a bounded prompt projection', () => {
    const base = createInitialRuntimeState({ currentIdentity: 'gang_member' });
    const organizationId = base.actors.player.roleProfiles.triad?.organizationId;
    const projection = projectDynamicContext(
      {
        ...base,
        dynamicEvents: {
          ...base.dynamicEvents,
          currentMatters: {
            unrelated_high_priority: matter(
              {
                id: 'unrelated_high_priority',
                title: '不相关高优先事项',
                priority: 95
              },
              base
            ),
            current_triad_responsibility: matter(
              {
                id: 'current_triad_responsibility',
                title: '直属上线的当前交代',
                priority: 10,
                source: 'triad_responsibility',
                matterKind: 'social',
                relatedOrganizationIds: organizationId ? [organizationId] : []
              },
              base
            )
          }
        }
      },
      { maxCurrentMatters: 1 }
    );

    expect(projection.currentMatters.map((item) => item.id)).toEqual(['current_triad_responsibility']);
  });

  it('prioritizes due, urgent, high-pressure and unread current matters without projecting hidden items', () => {
    const base = createInitialRuntimeState();
    const futureTime = { ...base.time, day: base.time.day + 2 };
    const state: RuntimeState = {
      ...base,
      dynamicEvents: {
        ...base.dynamicEvents,
        currentMatters: {
          matter_normal: matter(
            {
              id: 'matter_normal',
              title: 'Normal open matter',
              priority: 50,
              responseWindow: 'open',
              pressureLevel: 0
            },
            base
          ),
          matter_due: matter(
            {
              id: 'matter_due',
              title: 'Due matter',
              priority: 30,
              responseWindow: 'open',
              pressureLevel: 0,
              dueAt: base.time
            },
            base
          ),
          matter_urgent: matter(
            {
              id: 'matter_urgent',
              title: 'Urgent matter',
              priority: 40,
              responseWindow: 'now',
              pressureLevel: 3,
              dueAt: futureTime
            },
            base
          ),
          matter_unread: matter(
            {
              id: 'matter_unread',
              title: 'Unread matter',
              priority: 52,
              unread: true
            },
            base
          ),
          matter_hidden_due: matter(
            {
              id: 'matter_hidden_due',
              title: 'Hidden due matter',
              priority: 100,
              visibility: 'hidden',
              responseWindow: 'now',
              pressureLevel: 3,
              dueAt: base.time
            },
            base
          )
        }
      }
    };

    const projection = projectDynamicContext(state, { maxCurrentMatters: 3 });

    expect(projection.currentMatters.map((item) => item.id)).toEqual(['matter_urgent', 'matter_due', 'matter_unread']);
    expect(projection.currentMatters.map((item) => item.id)).not.toContain('matter_hidden_due');
    expect(projection.diagnostics.omittedHiddenCount).toBe(1);
    expect(projection.diagnostics.omittedCurrentMatterCount).toBe(1);
  });

  it('keeps recent resolved matters out of live context but projects them as completion facts', () => {
    const base = createInitialRuntimeState();
    const state: RuntimeState = {
      ...base,
      dynamicEvents: {
        ...base.dynamicEvents,
        currentMatters: {
          matter_active: matter(
            {
              id: 'matter_active',
              title: '仍在发酵的街坊投诉',
              relatedPlaceIds: [base.location.currentPlaceId]
            },
            base
          ),
          matter_resolved: matter(
            {
              id: 'matter_resolved',
              title: '已经调停的摊贩争执',
              status: 'resolved',
              dueAt: base.time,
              priority: 100,
              relatedPlaceIds: [base.location.currentPlaceId]
            },
            base
          )
        },
        signals: {
          signal_active: signal(
            {
              id: 'signal_active',
              title: '仍在流传的茶餐厅风声',
              relatedPlaceIds: [base.location.currentPlaceId]
            },
            base
          ),
          signal_resolved: signal(
            {
              id: 'signal_resolved',
              title: '已经澄清的街坊传闻',
              status: 'resolved',
              relatedPlaceIds: [base.location.currentPlaceId]
            },
            base
          )
        }
      }
    };

    const projection = projectDynamicContext(state);

    expect(projection.currentMatters.map((item) => item.id)).toEqual(['matter_active']);
    expect(projection.recentResolvedMatters.map((item) => item.id)).toEqual(['matter_resolved']);
    expect(projection.signals.map((item) => item.id)).toEqual(['signal_active']);
    expect(projection.diagnostics.dueCurrentMatterIds).toEqual([]);
    expect(projection.diagnostics.sourceCurrentMatterCount).toBe(1);
    expect(projection.diagnostics.sourceRecentResolvedMatterCount).toBe(1);
    expect(projection.diagnostics.recentResolvedMatterIds).toEqual(['matter_resolved']);
    expect(projection.diagnostics.sourceSignalCount).toBe(1);
  });

  it('does not feed locally expired wind signals back into the narrator context', () => {
    const base = createInitialRuntimeState();
    const expired = signal(
      {
        id: 'signal_expired',
        title: '已经过去的街口风声',
        reliability: 'unknown'
      },
      base
    );
    expired.updatedAt = addGameHours(base.time, -49);
    base.dynamicEvents.signals[expired.id] = expired;

    const projection = projectDynamicContext(base);

    expect(projection.signals).toEqual([]);
    expect(projection.diagnostics.sourceSignalCount).toBe(0);
  });

  it('bounds recent resolved completion facts and omits expired outcomes', () => {
    const base = createInitialRuntimeState();
    const oldTime = { ...base.time, year: base.time.year - 1 };
    const state: RuntimeState = {
      ...base,
      dynamicEvents: {
        ...base.dynamicEvents,
        currentMatters: {
          matter_recent_high: matter(
            {
              id: 'matter_recent_high',
              title: '刚完成的重要事项',
              status: 'resolved',
              priority: 90
            },
            base
          ),
          matter_recent_low: matter(
            {
              id: 'matter_recent_low',
              title: '刚完成的普通事项',
              status: 'resolved',
              priority: 40
            },
            base
          ),
          matter_expired: matter(
            {
              id: 'matter_expired',
              title: '很久以前完成的事项',
              status: 'resolved',
              priority: 100,
              createdAt: oldTime,
              updatedAt: oldTime
            },
            base
          )
        }
      }
    };

    const projection = projectDynamicContext(state, { maxRecentResolvedMatters: 1 });

    expect(projection.recentResolvedMatters.map((item) => item.id)).toEqual(['matter_recent_high']);
    expect(projection.diagnostics.sourceRecentResolvedMatterCount).toBe(2);
    expect(projection.diagnostics.omittedRecentResolvedMatterCount).toBe(1);
    expect(projection.diagnostics.recentResolvedMatterIds).not.toContain('matter_expired');
  });

  it('keeps ambiguous dormant outcomes live and only hides explicit terminal title markers', () => {
    const base = createInitialRuntimeState();
    const state: RuntimeState = {
      ...base,
      dynamicEvents: {
        ...base.dynamicEvents,
        currentMatters: {
          matter_unresolved_pause: matter(
            {
              id: 'matter_unresolved_pause',
              title: '暂时冷下来的街坊纠纷',
              summary: '双方暂时散去，但还没有真正解决。',
              status: 'dormant',
              priority: 50,
              relatedPlaceIds: [base.location.currentPlaceId]
            },
            base
          ),
          matter_initially_closed: matter(
            {
              id: 'matter_initially_closed',
              title: '街坊投诉后续',
              summary: '现场已经初步闭环，但仍需等待店主回复。',
              status: 'dormant',
              priority: 49,
              relatedPlaceIds: [base.location.currentPlaceId]
            },
            base
          ),
          matter_quiet_for_now: matter(
            {
              id: 'matter_quiet_for_now',
              title: '夜场争执后续',
              summary: '冲突暂时解除，双方仍可能再次碰面。',
              status: 'dormant',
              priority: 48,
              relatedPlaceIds: [base.location.currentPlaceId]
            },
            base
          ),
          matter_paused: matter(
            {
              id: 'matter_paused',
              title: '报案材料等待补交',
              summary: '本轮询问告一段落，暂无后续消息。',
              status: 'dormant',
              priority: 47,
              relatedPlaceIds: [base.location.currentPlaceId]
            },
            base
          ),
          matter_done_pause: matter(
            {
              id: 'matter_done_pause',
              title: '联英马仔街头寻仇（已瓦解）',
              summary: '残余马仔受到叔父辈警告及警方高压，已彻底丧失斗志。',
              status: 'dormant',
              priority: 100,
              dueAt: base.time,
              currentHook: '玩家确认残余马仔见警即逃，该隐患暂时解除。',
              relatedActorIds: ['player'],
              relatedPlaceIds: [base.location.currentPlaceId]
            },
            base
          )
        }
      }
    };

    const projection = projectDynamicContext(state);

    expect(projection.currentMatters.map((item) => item.id)).toEqual([
      'matter_unresolved_pause',
      'matter_initially_closed',
      'matter_quiet_for_now',
      'matter_paused'
    ]);
    expect(projection.diagnostics.dueCurrentMatterIds).toEqual([]);
    expect(projection.diagnostics.sourceCurrentMatterCount).toBe(4);
  });

  it('projects unread or player-related newspaper issues without turning them into task lists', () => {
    const base = createInitialRuntimeState();
    base.time = { ...base.time, day: 10 };
    const state: RuntimeState = {
      ...base,
      dynamicEvents: {
        ...base.dynamicEvents,
        newsIssues: {
          news_player: news(
            {
              id: 'news_player',
              headline: '旺角警员卷入街头风波',
              articles: [
                {
                  id: 'article_player',
                  section: 'local',
                  headline: '旺角警员卷入街头风波',
                  body: '报章以谨慎措辞报道街坊议论。',
                  playerRelated: true,
                  relatedActorIds: ['player'],
                  relatedPlaceIds: [base.location.currentPlaceId],
                  relatedCaseIds: [],
                  relatedOrganizationIds: []
                }
              ]
            },
            base
          ),
          news_read: news({ id: 'news_read', headline: '已读旧报', read: true }, base),
          news_archived: news(
            {
              id: 'news_archived',
              headline: '归档新闻不应再干扰主线',
              archivedAt: base.time,
              articles: [
                {
                  id: 'article_archived_player',
                  section: 'front_page',
                  headline: '归档新闻不应再干扰主线',
                  body: '即使与玩家有关，归档后也不应再进入正文投影。',
                  playerRelated: true,
                  relatedActorIds: ['player'],
                  relatedPlaceIds: [base.location.currentPlaceId],
                  relatedCaseIds: [],
                  relatedOrganizationIds: []
                }
              ]
            },
            base
          ),
          news_expired_unmarked: news(
            {
              id: 'news_expired_unmarked',
              date: { ...base.time, day: 6 },
              headline: '超过三日的旧报不应等待归档落盘',
              articles: [
                {
                  id: 'article_expired_player',
                  section: 'front_page',
                  headline: '超过三日的旧报不应等待归档落盘',
                  body: '即使 archivedAt 尚未写入，也不应再进入正文投影。',
                  playerRelated: true,
                  relatedActorIds: ['player'],
                  relatedPlaceIds: [base.location.currentPlaceId],
                  relatedCaseIds: [],
                  relatedOrganizationIds: []
                }
              ]
            },
            base
          )
        }
      }
    };

    const projection = projectDynamicContext(state);

    expect(projection.newsIssues.map((issue) => issue.id)).toEqual(['news_player']);
    expect(projection.newsIssues[0]?.articles[0]?.playerRelated).toBe(true);
  });

  it('reports due dynamic deferred events for diagnostics', () => {
    const base = createInitialRuntimeState();
    const state: RuntimeState = {
      ...base,
      deferredEvents: {
        due_dynamic: {
          eventId: 'due_dynamic',
          sourceModule: 'dynamic',
          relatedIds: {},
          title: '报章后续',
          summary: '报馆到了追访时间。',
          triggerAt: base.time,
          visibility: 'hidden',
          promptInstruction: '让报章后续以合理方式出现。',
          status: 'pending',
          createdAt: base.time
        },
        due_case: {
          eventId: 'due_case',
          sourceModule: 'case',
          relatedIds: {},
          title: '案件后续',
          summary: '不属于动态投影诊断。',
          triggerAt: base.time,
          visibility: 'hidden',
          promptInstruction: '案件系统自己处理。',
          status: 'pending',
          createdAt: base.time
        }
      }
    };

    const projection = projectDynamicContext(state);

    expect(projection.dueDeferredEvents.map((event) => event.eventId)).toEqual(['due_dynamic']);
    expect(projection.diagnostics.dueDeferredEventIds).toEqual(['due_dynamic']);
  });
});
