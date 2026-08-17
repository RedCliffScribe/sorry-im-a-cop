import type { CurrentIdentity } from '../../runtime/types';
import type { OfficialDlcManifest } from '../types';

export const urbanLegendsAlphaManifest: OfficialDlcManifest = {
  dlcId: 'urban_legends_alpha',
  title: '都市怪谈 Alpha',
  description: '一则发生在 1988 年香港夜班巴士线上的城市传闻；它可以被调查，也可以被现实解释。',
  type: 'narrative',
  version: '1.0.0',
  worldCompatibility: [{ worldpackId: 'hk_1988', status: 'supported' }],
  dramaIntegration: { enabled: true, priority: 'player_selected' }
};

export type UrbanLegendsAlphaEntryIdentity = CurrentIdentity;

export interface UrbanLegendsAlphaPlace {
  placeId: string;
  name: string;
  summary: string;
  worldpackId: 'hk_1988';
}

export interface UrbanLegendsAlphaCharacter {
  actorId: string;
  name: string;
  age: number;
  publicIdentity: string;
  occupation: string;
  personality: string;
  motivation: string;
  speechStyle: string;
  commonPlaceId: string;
  profileSummary: string;
}

export interface UrbanLegendsAlphaEntryRoute {
  identity: UrbanLegendsAlphaEntryIdentity;
  label: string;
  hook: string;
}

export interface UrbanLegendsAlphaEventNode {
  nodeId: string;
  title: string;
  summary: string;
  entryRoutes: readonly UrbanLegendsAlphaEntryRoute['identity'][];
  allowedWritebackKinds: readonly string[];
}

export interface UrbanLegendsAlphaEventStage {
  stageId: string;
  title: string;
  summary: string;
  nodes: readonly UrbanLegendsAlphaEventNode[];
}

export interface UrbanLegendsAlphaNewsTemplate {
  newsId: string;
  headline: string;
  summary: string;
  sourceLabel: string;
}

export interface UrbanLegendsAlphaEventGroup {
  eventGroupId: string;
  title: string;
  summary: string;
  defaultInterpretation: 'ambiguous';
  entryRoutes: readonly UrbanLegendsAlphaEntryRoute[];
  stages: readonly UrbanLegendsAlphaEventStage[];
  characterIds: readonly string[];
  placeIds: readonly string[];
  newsTemplateId: string;
}

const policeRoute: UrbanLegendsAlphaEntryRoute = {
  identity: 'police',
  label: '报案、失踪记录或夜间巡逻',
  hook: '从一名失踪乘客的报案、旧线路记录或巡逻时听到的现场传闻进入。'
};

const civilianRoute: UrbanLegendsAlphaEntryRoute = {
  identity: 'civilian',
  label: '街坊传闻或工作往来',
  hook: '从邻里闲谈、夜班工作往来或茶餐厅听到的乘客说法进入。'
};

const gangRoute: UrbanLegendsAlphaEntryRoute = {
  identity: 'gang_member',
  label: '地盘传闻或利益冲突',
  hook: '从地盘上的口耳相传、路线生意或有人借传闻掩护行动进入。'
};

export const urbanLegendsAlphaPlaces: readonly UrbanLegendsAlphaPlace[] = [
  {
    placeId: 'official_dlc_urban_legends_midnight_bus_terminal',
    name: '夜间巴士总站',
    summary: '九龙一处仍有夜班车进出的总站；末班车记录、司机交班和候车人流都可以核对。',
    worldpackId: 'hk_1988'
  },
  {
    placeId: 'official_dlc_urban_legends_old_district_street',
    name: '旧城区街道',
    summary: '楼宇密集、招牌交叠的旧区街道；传闻容易在街坊、报摊和后巷之间变形。',
    worldpackId: 'hk_1988'
  },
  {
    placeId: 'official_dlc_urban_legends_cha_chaan_teng',
    name: '午夜茶餐厅',
    summary: '靠近总站的通宵茶餐厅；司机、街坊、记者和熟客都可能在这里交换说法。',
    worldpackId: 'hk_1988'
  }
];

export const urbanLegendsAlphaCharacters: readonly UrbanLegendsAlphaCharacter[] = [
  {
    actorId: 'official_dlc_urban_legends_night_bus_driver',
    name: '陈国安',
    age: 42,
    publicIdentity: '夜班巴士司机',
    occupation: '巴士司机',
    personality: '谨慎、疲惫，不喜欢把无法核对的事说满。',
    motivation: '保住饭碗，也想弄清楚那晚到底有没有漏掉一名乘客。',
    speechStyle: '说话短，习惯先报时间和路线，再补一句自己的判断。',
    commonPlaceId: 'official_dlc_urban_legends_midnight_bus_terminal',
    profileSummary: '第一目击者；掌握末班车班次、交班和车上乘客的可核对细节。'
  },
  {
    actorId: 'official_dlc_urban_legends_missing_passenger_relative',
    name: '何婉仪',
    age: 29,
    publicIdentity: '失踪乘客家属',
    occupation: '文员',
    personality: '焦急但有条理，既想找人，也不愿让家人被当成笑话。',
    motivation: '找到失踪的弟弟，并确认他最后一次乘车的真实情况。',
    speechStyle: '先讲具体时间和物件，情绪上来时会反复确认同一个问题。',
    commonPlaceId: 'official_dlc_urban_legends_cha_chaan_teng',
    profileSummary: '调查推动者；带来失踪者的时间线、车票和家属说法。'
  },
  {
    actorId: 'official_dlc_urban_legends_old_neighbor',
    name: '梁伯',
    age: 68,
    publicIdentity: '旧区老街坊',
    occupation: '退休工人',
    personality: '记性好、爱讲旧事，但也知道传闻会越传越离谱。',
    motivation: '保护街坊的安宁，不希望有人借怪谈吓人或做生意。',
    speechStyle: '广东话口吻浓，常把“亲眼见过”和“听人讲过”分开。',
    commonPlaceId: 'official_dlc_urban_legends_old_district_street',
    profileSummary: '旧城区传闻入口；能提供旧线路、拆迁和街坊关系的背景。'
  },
  {
    actorId: 'official_dlc_urban_legends_young_reporter',
    name: '方嘉仪',
    age: 24,
    publicIdentity: '年轻记者',
    occupation: '报馆记者',
    personality: '反应快、求证心强，但知道标题和销量会影响报道。',
    motivation: '做出一篇站得住脚的报道，同时不放过真正被隐瞒的事实。',
    speechStyle: '问题密集，常把不同版本的时间线摆在一起对照。',
    commonPlaceId: 'official_dlc_urban_legends_cha_chaan_teng',
    profileSummary: '新闻传播入口；可以查报馆资料，也可能放大未经核实的说法。'
  },
  {
    actorId: 'official_dlc_urban_legends_junior_officer',
    name: '周伟明',
    age: 27,
    publicIdentity: '基层警员',
    occupation: '香港警队基层警员',
    personality: '做事踏实，重视程序，也不愿在同僚面前承认自己被传闻影响。',
    motivation: '把报案和巡逻记录对上，不让家属只得到一句“查不到”。',
    speechStyle: '用警务记录式短句说话，私下会补充自己没写进报告的疑点。',
    commonPlaceId: 'official_dlc_urban_legends_old_district_street',
    profileSummary: '警察入口；提供报案、失踪记录和内部意见分歧的现实接点。'
  },
  {
    actorId: 'official_dlc_urban_legends_society_member',
    name: '李炳坤',
    age: 31,
    publicIdentity: '社团成员',
    occupation: '地盘杂务与运输联络',
    personality: '圆滑、会看风向，知道传闻可以遮掩生意，也可以招来麻烦。',
    motivation: '守住地盘利益，不让外人借怪谈破坏路线或借机敲诈。',
    speechStyle: '话说一半留一半，喜欢用现实利益提醒别人别太快下结论。',
    commonPlaceId: 'official_dlc_urban_legends_old_district_street',
    profileSummary: '社团入口；把传闻放回路线、利益和街区压力中解释。'
  }
];

const structuralWritebackKinds = [
  'currentMatter',
  'signal',
  'newsIssue',
  'relationshipThread',
  'actor',
  'case'
] as const;

export const urbanLegendsAlphaEventGroup: UrbanLegendsAlphaEventGroup = {
  eventGroupId: 'official_dlc_urban_legends_midnight_bus',
  title: '午夜末班车',
  summary: '一名乘客在夜班巴士线路上失踪，司机、家属、街坊、记者、警员和社团各自掌握不完整版本；事实可以落在犯罪、隐瞒、误会或仍无法解释的空白之间。',
  defaultInterpretation: 'ambiguous',
  entryRoutes: [policeRoute, civilianRoute, gangRoute],
  stages: [
    {
      stageId: 'street_rumor',
      title: '街坊传闻',
      summary: '传闻先在总站、旧区街道和茶餐厅之间流动，人物可以相信、质疑或暂时忽略。',
      nodes: [
        { nodeId: 'reported_missing_passenger', title: '失踪报案', summary: '家属提供最后一次见到乘客的时间与物件。', entryRoutes: ['police'], allowedWritebackKinds: structuralWritebackKinds },
        { nodeId: 'neighborhood_rumor', title: '街坊说法', summary: '老街坊把旧线路和最近一班车的异常说法放在一起，但区分亲眼所见与听闻。', entryRoutes: ['civilian', 'police', 'gang_member'], allowedWritebackKinds: structuralWritebackKinds },
        { nodeId: 'route_business_rumor', title: '路线利益传闻', summary: '有人认为怪谈只是掩护运输、敲诈或争地盘的说法。', entryRoutes: ['gang_member'], allowedWritebackKinds: structuralWritebackKinds }
      ]
    },
    {
      stageId: 'first_clues',
      title: '第一批线索',
      summary: '司机证词、旧线路资料和互相矛盾的目击开始出现，不能直接把任何一版当成真相。',
      nodes: [
        { nodeId: 'driver_testimony', title: '司机证词', summary: '核对交班、站点、车门和乘客下车记录。', entryRoutes: ['police', 'civilian'], allowedWritebackKinds: structuralWritebackKinds },
        { nodeId: 'old_route_records', title: '旧线路资料', summary: '查旧报纸、线路调整和街区改建留下的时间线。', entryRoutes: ['police', 'civilian', 'gang_member'], allowedWritebackKinds: structuralWritebackKinds },
        { nodeId: 'contradictory_witness', title: '矛盾目击', summary: '不同人物对灯光、车次和失踪时间的记忆无法完全相合。', entryRoutes: ['police', 'civilian', 'gang_member'], allowedWritebackKinds: structuralWritebackKinds }
      ]
    },
    {
      stageId: 'interest_conflict',
      title: '利益冲突',
      summary: '新闻炒作、社团利用传闻和警队内部意见分歧开始改变调查成本。',
      nodes: [
        { nodeId: 'press_exaggeration', title: '新闻炒作', summary: '记者面对截稿压力，必须在公开消息与未核实说法之间作取舍。', entryRoutes: ['civilian', 'police'], allowedWritebackKinds: structuralWritebackKinds },
        { nodeId: 'society_uses_rumor', title: '借传闻施压', summary: '有人用怪谈逼走目击者、遮掩路线利益或制造恐慌。', entryRoutes: ['gang_member', 'police'], allowedWritebackKinds: structuralWritebackKinds },
        { nodeId: 'internal_disagreement', title: '警队内部分歧', summary: '有人主张按失踪案查，有人认为只是普通离家或误会。', entryRoutes: ['police'], allowedWritebackKinds: structuralWritebackKinds }
      ]
    },
    {
      stageId: 'truth_investigation',
      title: '真相调查',
      summary: '玩家可以把线索拼成现实解释，也可以保留无法完全排除的异常部分。',
      nodes: [
        { nodeId: 'timeline_reconstruction', title: '时间线复原', summary: '用车次、报案、电话和街区营业时间重排当晚经过。', entryRoutes: ['police', 'civilian'], allowedWritebackKinds: structuralWritebackKinds },
        { nodeId: 'route_surveillance', title: '路线查访', summary: '沿总站、旧区街道和茶餐厅核对可见人员与物证，不凭氛围宣布灵异事实。', entryRoutes: ['police', 'gang_member'], allowedWritebackKinds: structuralWritebackKinds },
        { nodeId: 'mundane_lead', title: '现实线索', summary: '犯罪、隐瞒、交通安排或普通误会都可以解释部分异常。', entryRoutes: ['police', 'civilian', 'gang_member'], allowedWritebackKinds: structuralWritebackKinds }
      ]
    },
    {
      stageId: 'aftermath',
      title: '结局余波',
      summary: '玩家可以公开真相、保留疑问或放弃调查；世界只写回本回合结构化成立的结果。',
      nodes: [
        { nodeId: 'public_account', title: '公开说法', summary: '家属、记者和警方如何向公众说明，取决于已核实的证据。', entryRoutes: ['police', 'civilian'], allowedWritebackKinds: structuralWritebackKinds },
        { nodeId: 'unanswered_detail', title: '保留疑问', summary: '现实解释成立时，仍可保留一处未能完全核对的细节，但不把它写成超自然事实。', entryRoutes: ['police', 'civilian', 'gang_member'], allowedWritebackKinds: structuralWritebackKinds },
        { nodeId: 'abandoned_inquiry', title: '放弃调查', summary: '玩家可以接受线索不足、现实压力或个人选择，不强制唯一结局。', entryRoutes: ['police', 'civilian', 'gang_member'], allowedWritebackKinds: structuralWritebackKinds }
      ]
    }
  ],
  characterIds: urbanLegendsAlphaCharacters.map((character) => character.actorId),
  placeIds: urbanLegendsAlphaPlaces.map((place) => place.placeId),
  newsTemplateId: 'official_dlc_urban_legends_midnight_bus_news'
};

export const urbanLegendsAlphaNewsTemplate: UrbanLegendsAlphaNewsTemplate = {
  newsId: 'official_dlc_urban_legends_midnight_bus_news',
  headline: '市民传闻夜间巴士出现异常',
  summary: '旧城区流传夜间巴士出现异常的说法，记者正在核对司机、家属和街坊的不同版本。',
  sourceLabel: '街坊与报馆消息（未完成核实）'
};

export function getUrbanLegendsAlphaEntryRoute(
  identity: UrbanLegendsAlphaEntryIdentity
): UrbanLegendsAlphaEntryRoute {
  return urbanLegendsAlphaEventGroup.entryRoutes.find((route) => route.identity === identity)
    ?? civilianRoute;
}
