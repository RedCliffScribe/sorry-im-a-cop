import type { CitySituationTrack, CurrentMatter, GameTime, NewsIssue, RuntimeState, Signal } from '../runtime/types';
import type { GrayNetworkPatch } from '../grayNetwork/grayNetwork';
import { addGameDays } from '../time/gameTime';
import type { NarratorResponse } from '../writeback/schema';

type OrganizationPatch = NarratorResponse['writeback']['organizationPatches'][number];

export interface CitySituationTrackReviewOptions {
  maxTracks?: number;
  maxVisibleOutputs?: number;
}

export interface CitySituationTrackReviewResult {
  tracks: RuntimeState['citySituationTracks'];
  currentMatterPatches: CurrentMatter[];
  signalPatches: Signal[];
  newsIssuePatches: NewsIssue[];
  organizationPatches: OrganizationPatch[];
  grayNetworkPatches: GrayNetworkPatch[];
  diagnostics: string[];
}

function gameTimeValue(time: GameTime): number {
  return (((time.year * 100 + time.month) * 100 + time.day) * 100 + time.hour) * 100 + time.minute;
}

function isDue(track: CitySituationTrack, now: GameTime): boolean {
  return Boolean(track.nextReviewAt && gameTimeValue(track.nextReviewAt) <= gameTimeValue(now));
}

function cadenceDaysFor(track: CitySituationTrack): number {
  if (track.cadenceDays) return Math.max(1, Math.min(90, track.cadenceDays));
  if (track.trackType === 'police_operation' || track.trackType === 'public_safety') return 7;
  if (track.trackType === 'government_policy') return 30;
  if (track.trackType === 'film_production' || track.trackType === 'market_pressure') return 21;
  return 14;
}

function createFilmWrapNews(track: CitySituationTrack, now: GameTime): NewsIssue {
  return {
    id: `news_${track.trackId}_${now.year}_${now.month}_${now.day}`,
    date: now,
    outletName: '香港晚报',
    headline: `${track.title}传出杀青消息`,
    summary: `${track.title}进入收尾，片场保安和道具管理仍被业内议论。`,
    articles: [
      {
        id: `article_${track.trackId}_wrap`,
        section: 'entertainment',
        headline: `${track.title}赶完最后一组夜戏`,
        body: '娱乐版收到片场消息，一部警匪片完成主要拍摄。业内人更关心的是道具枪、外景保安和夜场取景带来的麻烦。',
        tone: 'industry',
        playerRelated: false,
        relatedActorIds: [...track.relatedActorIds],
        relatedPlaceIds: [...track.relatedPlaceIds],
        relatedCaseIds: [],
        relatedOrganizationIds: [...track.relatedOrganizationIds]
      }
    ],
    createdAt: now,
    updatedAt: now,
    read: false
  };
}

function createTrackNews(track: CitySituationTrack, now: GameTime): NewsIssue {
  const section =
    track.trackType === 'market_pressure'
      ? 'business'
      : track.trackType === 'government_policy' || track.trackType === 'icac_investigation'
        ? 'politics'
        : track.trackType === 'public_safety'
          ? 'local'
          : track.trackType === 'media_campaign'
            ? 'society'
            : 'local';
  return {
    id: `news_${track.trackId}_${now.year}_${now.month}_${now.day}`,
    date: now,
    outletName: '香港晚报',
    headline: `${track.title}继续发酵`,
    summary: `${track.currentBeat}。这属于公开层面的城市背景变化，不等于玩家必须介入。`,
    articles: [
      {
        id: `article_${track.trackId}_update`,
        section,
        headline: `${track.title}引起业内关注`,
        body: `${track.summary}${track.currentBeat ? ` ${track.currentBeat}` : ''}`,
        tone: 'background',
        playerRelated: false,
        relatedActorIds: [...track.relatedActorIds],
        relatedPlaceIds: [...track.relatedPlaceIds],
        relatedCaseIds: [],
        relatedOrganizationIds: [...track.relatedOrganizationIds]
      }
    ],
    createdAt: now,
    updatedAt: now,
    read: false
  };
}

function createTrackMatter(track: CitySituationTrack, now: GameTime): CurrentMatter {
  return {
    id: `matter_${track.trackId}_${now.year}_${now.month}_${now.day}`,
    title: `${track.title}有新风声`,
    summary: `${track.currentBeat}。这只是街面或情报层面的变化，尚未构成确定事实。`,
    status: 'active',
    priority: 55 + Math.min(30, track.pressureLevel * 10),
    visibility: track.visibility === 'hidden' ? 'hidden' : 'known',
    source: 'city_situation_track',
    matterKind: 'world',
    pressureLevel: Math.min(3, Math.max(0, track.pressureLevel)) as CurrentMatter['pressureLevel'],
    responseWindow: 'open',
    relatedActorIds: [...track.relatedActorIds],
    relatedPlaceIds: [...track.relatedPlaceIds],
    relatedCaseIds: [],
    relatedOrganizationIds: [...track.relatedOrganizationIds],
    unread: true,
    createdAt: now,
    updatedAt: now
  };
}

function createTrackSignal(track: CitySituationTrack, now: GameTime): Signal {
  return {
    id: `signal_${track.trackId}_${now.year}_${now.month}_${now.day}`,
    title: `${track.title}传出风声`,
    summary: `${track.currentBeat}。这仍是传闻或街面信号，不是确认事实。`,
    signalType: track.trackType === 'triad_expansion' ? 'street' : 'organization',
    reliability: track.visibility === 'public' ? 'medium' : 'low',
    status: 'active',
    visibility: track.visibility === 'hidden' ? 'hidden' : 'known',
    relatedActorIds: [...track.relatedActorIds],
    relatedPlaceIds: [...track.relatedPlaceIds],
    relatedCaseIds: [],
    relatedOrganizationIds: [...track.relatedOrganizationIds],
    createdAt: now,
    updatedAt: now
  };
}

function createOrganizationPatches(track: CitySituationTrack): OrganizationPatch[] {
  return track.relatedOrganizationIds.map((organizationId) => ({
    organizationId,
    currentState: track.currentBeat,
    pressureSummary: `${track.title}：压力等级 ${track.pressureLevel}。${track.summary}`,
    relatedActorIds: [...track.relatedActorIds],
    relatedPlaceIds: [...track.relatedPlaceIds],
    relatedCaseIds: [],
    importance: Math.min(100, 45 + track.pressureLevel * 10)
  }));
}

function createGrayNetworkPatch(track: CitySituationTrack, now: GameTime): GrayNetworkPatch | undefined {
  if (track.trackType !== 'triad_expansion') return undefined;
  const areaId = track.relatedPlaceIds[0] ?? 'area_unknown';
  return {
    areaId,
    climate: [
      {
        key: `climate_${track.trackId}`,
        label: track.title,
        level: track.pressureLevel >= 3 ? 'rising' : 'rumor',
        summary: `${track.currentBeat}。这只是街面灰色网络气候，不是确认事实。`,
        confidence: 'low',
        lastUpdatedTurn: gameTimeValue(now)
      }
    ]
  };
}

function createTurnId(now: GameTime): string {
  return `turn_${now.year}_${now.month}_${now.day}_${now.hour}_${now.minute}`;
}

function advanceTrack(
  track: CitySituationTrack,
  now: GameTime
): {
  track: CitySituationTrack;
  currentMatter?: CurrentMatter;
  signal?: Signal;
  newsIssue?: NewsIssue;
  organizationPatches: OrganizationPatch[];
  grayNetworkPatch?: GrayNetworkPatch;
} {
  if (track.trackType === 'film_production') {
    const advanced: CitySituationTrack = {
      ...track,
      status: 'cooling',
      currentBeat: `${track.title}已经杀青，片场余波转入新闻和圈内饭局。`,
      nextReviewAt: addGameDays(now, cadenceDaysFor(track)),
      lastOutputTurnId: createTurnId(now)
    };
    if (advanced.visibility === 'hidden') {
      return { track: advanced, organizationPatches: [] };
    }
    return {
      track: advanced,
      newsIssue: createFilmWrapNews(advanced, now),
      organizationPatches: createOrganizationPatches(advanced)
    };
  }

  const advanced: CitySituationTrack = {
    ...track,
    status: track.status === 'latent' ? 'active' : track.status,
    pressureLevel: Math.min(5, track.pressureLevel + 1),
    currentBeat: `${track.title}的街面风声变密，但还缺少确定证据`,
    nextReviewAt: addGameDays(now, cadenceDaysFor(track)),
    lastOutputTurnId: createTurnId(now)
  };
  if (advanced.visibility === 'hidden') {
    return { track: advanced, organizationPatches: [] };
  }
  if (advanced.visibility === 'public') {
    return {
      track: advanced,
      newsIssue: createTrackNews(advanced, now),
      organizationPatches: createOrganizationPatches(advanced)
    };
  }
  if (advanced.visibility === 'player_known') {
    return {
      track: advanced,
      currentMatter: createTrackMatter(advanced, now),
      organizationPatches: createOrganizationPatches(advanced)
    };
  }
  return {
    track: advanced,
    signal: createTrackSignal(advanced, now),
    organizationPatches: createOrganizationPatches(advanced),
    grayNetworkPatch: createGrayNetworkPatch(advanced, now)
  };
}

export function reviewCitySituationTracks(
  state: RuntimeState,
  options: CitySituationTrackReviewOptions = {}
): CitySituationTrackReviewResult {
  const maxTracks = options.maxTracks ?? 2;
  const maxVisibleOutputs = options.maxVisibleOutputs ?? 2;
  const tracks = Object.fromEntries(
    Object.entries(state.citySituationTracks ?? {}).map(([trackId, track]) => [trackId, { ...track }])
  ) as RuntimeState['citySituationTracks'];
  const currentMatterPatches: CurrentMatter[] = [];
  const signalPatches: Signal[] = [];
  const newsIssuePatches: NewsIssue[] = [];
  const organizationPatches: OrganizationPatch[] = [];
  const grayNetworkPatches: GrayNetworkPatch[] = [];
  const diagnostics: string[] = [];
  let visibleOutputs = 0;
  const dueTracks = Object.values(tracks)
    .filter((track) => track.status !== 'resolved' && isDue(track, state.time))
    .sort(
      (left, right) =>
        gameTimeValue(left.nextReviewAt ?? state.time) - gameTimeValue(right.nextReviewAt ?? state.time)
    )
    .slice(0, maxTracks);

  for (const track of dueTracks) {
    const result = advanceTrack(track, state.time);
    tracks[track.trackId] = result.track;
    const primaryOutput = result.newsIssue ?? result.currentMatter ?? result.signal;
    if (primaryOutput && visibleOutputs < maxVisibleOutputs) {
      if (result.newsIssue) newsIssuePatches.push(result.newsIssue);
      if (result.currentMatter) currentMatterPatches.push(result.currentMatter);
      if (result.signal) signalPatches.push(result.signal);
      organizationPatches.push(...result.organizationPatches);
      if (result.grayNetworkPatch) grayNetworkPatches.push(result.grayNetworkPatch);
      visibleOutputs += 1;
    }
    diagnostics.push(`advanced:${track.trackId}`);
  }

  return {
    tracks,
    currentMatterPatches,
    signalPatches,
    newsIssuePatches,
    organizationPatches,
    grayNetworkPatches,
    diagnostics
  };
}
