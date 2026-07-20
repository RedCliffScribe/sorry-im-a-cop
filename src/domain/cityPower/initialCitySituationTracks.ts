import type { CitySituationTrack, GameTime, RuntimeState } from '../runtime/types';
import { addGameDays } from '../time/gameTime';

function cloneTime(time: GameTime): GameTime {
  return { ...time };
}

function createTrack(
  startedAt: GameTime,
  delayDays: number,
  track: Omit<CitySituationTrack, 'startedAt' | 'nextReviewAt'>
): CitySituationTrack {
  return {
    ...track,
    startedAt: cloneTime(startedAt),
    nextReviewAt: addGameDays(startedAt, delayDays)
  };
}

export function createInitialCitySituationTrackSeeds(startedAt: GameTime): RuntimeState['citySituationTracks'] {
  const tracks: CitySituationTrack[] = [
    createTrack(startedAt, 7, {
      trackId: 'track_1988_mong_kok_nightlife_society_pressure',
      title: '旺角夜场社团压力',
      trackType: 'triad_expansion',
      status: 'active',
      pressureLevel: 2,
      visibility: 'rumor',
      cadenceDays: 14,
      relatedOrganizationIds: [],
      relatedPowerFigureIds: [],
      relatedPlaceIds: ['place_portland_street'],
      relatedActorIds: [],
      summary: '旺角夜场、收数和街面看场正在变得紧张。',
      currentBeat: '几间夜场之间有基层小弟试探对方边界。',
      possibleDevelopments: ['街面传闻升温', '警方收到夜场滋扰投诉', '报馆娱乐版听到风声']
    }),
    createTrack(startedAt, 16, {
      trackId: 'track_1988_stock_crash_finance_aftershock',
      title: '八七股灾余波',
      trackType: 'market_pressure',
      status: 'active',
      pressureLevel: 2,
      visibility: 'public',
      cadenceDays: 21,
      relatedOrganizationIds: [],
      relatedPowerFigureIds: [],
      relatedPlaceIds: [],
      relatedActorIds: [],
      summary: '股灾余波仍压着券商、散户家庭和地下钱庄。',
      currentBeat: '财经版继续追问保证金和债务压力。',
      possibleDevelopments: ['财经新闻', '家庭债务纠纷', '地下钱庄收数风声']
    }),
    createTrack(startedAt, 17, {
      trackId: 'track_1988_clear_water_bay_tv_studio_pressure',
      title: '清水湾电视城启用压力',
      trackType: 'media_campaign',
      status: 'active',
      pressureLevel: 1,
      visibility: 'public',
      cadenceDays: 21,
      relatedOrganizationIds: ['org_tvb'],
      relatedPowerFigureIds: [],
      relatedPlaceIds: ['place_tv_city_clear_water_bay'],
      relatedActorIds: [],
      summary: '清水湾电视城启用后，片场、人手、艺员和媒体流动都比过去更密。',
      currentBeat: '娱乐记者和制作组都在适应新片场节奏。',
      possibleDevelopments: ['娱乐新闻', '片场探访', '艺员饭局风声']
    }),
    createTrack(startedAt, 14, {
      trackId: 'track_1988_golden_harvest_police_film_wrap',
      title: '金禾警匪片夜戏',
      trackType: 'film_production',
      status: 'active',
      pressureLevel: 2,
      visibility: 'rumor',
      cadenceDays: 14,
      relatedOrganizationIds: ['org_golden_harvest'],
      relatedPowerFigureIds: ['power_golden_harvest_chow_boss'],
      relatedPlaceIds: ['place_golden_harvest_studio'],
      relatedActorIds: [],
      summary: '金禾一组警匪片正在赶夜戏，道具枪、外景保安和记者探班都容易惹麻烦。',
      currentBeat: '剧组还在补巷口追逐戏。',
      possibleDevelopments: ['杀青新闻', '片场事故传闻', '娱乐记者邀约']
    }),
    createTrack(startedAt, 15, {
      trackId: 'track_1988_icac_police_complaint_pressure',
      title: '廉署与警队风纪压力',
      trackType: 'icac_investigation',
      status: 'latent',
      pressureLevel: 2,
      visibility: 'rumor',
      cadenceDays: 14,
      relatedOrganizationIds: ['org_icac', 'org_hk_police'],
      relatedPowerFigureIds: [],
      relatedPlaceIds: ['place_wan_chai_police_headquarters'],
      relatedActorIds: [],
      summary: '警队内部风纪和廉署投诉压力在基层继续发酵。',
      currentBeat: '警署里有人提醒最近说话做事要留痕。',
      possibleDevelopments: ['内部通告', '低可信传闻', '记者追问']
    }),
    createTrack(startedAt, 12, {
      trackId: 'track_1988_factory_northbound_shift',
      title: '工厂北移与劳资争议',
      trackType: 'labor_dispute',
      status: 'active',
      pressureLevel: 2,
      visibility: 'public',
      cadenceDays: 14,
      relatedOrganizationIds: [],
      relatedPowerFigureIds: [],
      relatedPlaceIds: ['place_tai_kok_tsui_factory_blocks'],
      relatedActorIds: [],
      summary: '部分轻工业厂房因为订单和成本考虑北移，欠薪、工伤和家庭压力开始冒头。',
      currentBeat: '工人代表想找议员或报馆说话。',
      possibleDevelopments: ['劳资新闻', '警署滋扰投诉', '家庭债务压力']
    }),
    createTrack(startedAt, 21, {
      trackId: 'track_1988_property_buyout_old_buildings',
      title: '旧楼收购与逼迁压力',
      trackType: 'market_pressure',
      status: 'active',
      pressureLevel: 2,
      visibility: 'public',
      cadenceDays: 21,
      relatedOrganizationIds: [],
      relatedPowerFigureIds: [],
      relatedPlaceIds: [],
      relatedActorIds: [],
      summary: '地产收购、旧楼逼迁和火灾隐患在市区旧街继续累积。',
      currentBeat: '街坊说有收楼中间人在夜里上门。',
      possibleDevelopments: ['地产新闻', '旧楼火警', '街坊求助']
    }),
    createTrack(startedAt, 18, {
      trackId: 'track_1988_container_port_smuggling_chatter',
      title: '货柜码头走私风声',
      trackType: 'public_safety',
      status: 'latent',
      pressureLevel: 1,
      visibility: 'rumor',
      cadenceDays: 21,
      relatedOrganizationIds: [],
      relatedPowerFigureIds: [],
      relatedPlaceIds: [],
      relatedActorIds: [],
      summary: '葵涌货柜码头繁荣带来物流机会，也带来走私、人情线和夜间搬货风声。',
      currentBeat: '码头司机之间流传一批货要避开检查。',
      possibleDevelopments: ['港闻短讯', '线人消息', '警队行动风声']
    }),
    createTrack(startedAt, 30, {
      trackId: 'track_1988_kowloon_walled_city_clearance_pressure',
      title: '九龙城寨清拆压力',
      trackType: 'government_policy',
      status: 'active',
      pressureLevel: 2,
      visibility: 'public',
      cadenceDays: 30,
      relatedOrganizationIds: [],
      relatedPowerFigureIds: [],
      relatedPlaceIds: [],
      relatedActorIds: [],
      summary: '九龙城寨清拆计划推进，居民、边缘行业和社团关系正在迁移。',
      currentBeat: '街坊谈论搬迁赔偿，也有人担心旧关系散到别区。',
      possibleDevelopments: ['政策新闻', '社区压力', '边缘势力迁移']
    }),
    createTrack(startedAt, 23, {
      trackId: 'track_1988_vietnamese_refugee_camp_pressure',
      title: '越南船民营地压力',
      trackType: 'government_policy',
      status: 'active',
      pressureLevel: 2,
      visibility: 'public',
      cadenceDays: 21,
      relatedOrganizationIds: [],
      relatedPowerFigureIds: [],
      relatedPlaceIds: [],
      relatedActorIds: [],
      summary: '越南船民潮持续，营地管理、社区矛盾和警务压力仍在积累。',
      currentBeat: '报章继续讨论营地秩序和居民担忧。',
      possibleDevelopments: ['社会新闻', '警务压力', '社区争执']
    })
  ];

  return Object.fromEntries(tracks.map((track) => [track.trackId, track]));
}
