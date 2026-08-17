import rawExpansion from './hkLateColonialEntertainmentFigureExpansion.json' with { type: 'json' };
import type { EraSeedFigureCard, EraSeedFigureContactPolicy } from './eraSeedFigureTypes';

export type EntertainmentFigureKind =
  | 'actor'
  | 'director'
  | 'screenwriter'
  | 'producer'
  | 'composer'
  | 'cinematographer'
  | 'editor';

export interface EntertainmentFigureExpansionSource {
  id: string;
  sourceId: string;
  displayName: string;
  englishName: string;
  kinds: EntertainmentFigureKind[];
  activeYears: {
    from: number;
    to: number;
  };
  sourceCredits: number;
  recognitionAliases?: string[];
}

const roleLabels: Record<EntertainmentFigureKind, string> = {
  actor: '演员',
  director: '导演',
  screenwriter: '编剧',
  producer: '监制或制片人',
  composer: '电影音乐人',
  cinematographer: '摄影师',
  editor: '剪接师'
};

const kindSectors: Record<EntertainmentFigureKind, string[]> = {
  actor: ['film', 'casting', '片场', '演员'],
  director: ['film', 'production', '片场', '导演'],
  screenwriter: ['film', 'screenplay', '制作公司', '编剧'],
  producer: ['film', 'financing', 'distribution', '电影公司'],
  composer: ['music', 'recording_studio', 'postproduction', '电影音乐'],
  cinematographer: ['film', 'camera', 'equipment', '摄影棚'],
  editor: ['film', 'postproduction', '剪接室', '后期制作']
};

const kindAccessRoutes: Record<EntertainmentFigureKind, string[]> = {
  actor: ['片场通告', '选角与经纪关系', '首映或宣传活动'],
  director: ['导演组与制片办公室', '片场工作关系', '试片或筹备会议'],
  screenwriter: ['编剧会议', '制片公司稿件往来', '报馆或文化圈人脉'],
  producer: ['制片与投资饭局', '发行或院线关系', '电影公司办公室'],
  composer: ['录音室与配乐棚', '唱片或制作公司', '电影后期团队'],
  cinematographer: ['摄影器材公司', '片场摄影组', '冲印与后期关系'],
  editor: ['剪接室', '电影后期公司', '导演与制片团队']
};

const kindHooks: Record<EntertainmentFigureKind, string[]> = {
  actor: ['通告、经纪或合约出现异常', '片场事故牵出幕后关系', '宣传活动与现实压力发生冲突'],
  director: ['拍摄计划遭到资金或场地干预', '选角与制作决定引发争议', '片场资料成为调查线索'],
  screenwriter: ['剧本、署名或版权发生争议', '未采用稿件映出真实旧事', '制作方要求临时改写敏感内容'],
  producer: ['资金、发行或院线安排出现异常', '合约与投资人关系牵出压力', '制作账目成为调查入口'],
  composer: ['录音或配乐母带出现问题', '音乐合约与宣传安排发生冲突', '后期制作人员掌握关键细节'],
  cinematographer: ['摄影器材或底片成为关键物证', '拍摄记录与公开说法不一致', '摄影组目击到片场外的异常'],
  editor: ['剪接版本与送审版本不一致', '被删片段留下现实线索', '后期工作记录暴露制作时序']
};

const figureImportanceOverrides: Readonly<Record<string, number>> = {
  // 银幕美人、选美出身或造型辨识度显著的女明星：作为 AVG 专属立绘 A 档候选。
  fig_hk_ent_q4766290: 92,
  fig_hk_ent_q3604925: 92,
  fig_hk_ent_q270672: 92,
  fig_hk_ent_q700346: 92,
  fig_hk_ent_q270688: 92,
  fig_hk_ent_q3051400: 92,
  fig_hk_ent_q9369465: 92,
  fig_hk_ent_q6297491: 92,
  fig_hk_ent_q150903: 92,
  fig_hk_ent_q1063194: 92,
  fig_hk_ent_q7506997: 92,
  fig_hk_ent_q8003872: 92,
  fig_hk_ent_q1136754: 92,
  fig_hk_ent_q717070: 94,
  fig_hk_ent_q714136: 92,
  fig_hk_ent_q5043182: 92,
  fig_hk_ent_q283983: 92,
  fig_hk_ent_q706192: 92,
  fig_hk_ent_q5353614: 92,
  fig_hk_ent_q4918748: 92,
  fig_hk_ent_q716027: 92,
  fig_hk_ent_q838209: 94,
  fig_hk_ent_q233859: 92,
  fig_hk_ent_q4726467: 92,
  fig_hk_ent_q6214493: 92,
  fig_hk_ent_q464650: 92,
  fig_hk_ent_q431486: 94,
  fig_hk_ent_q6069296: 92,
  fig_hk_ent_q8062520: 92,
  fig_hk_ent_q701984: 92,
  fig_hk_ent_q701962: 92,
  fig_hk_ent_q7143498: 92,
  fig_hk_ent_q717584: 92,
  fig_hk_ent_q455986: 92,
  fig_hk_ent_q7922473: 94,
  fig_hk_ent_q704021: 92,
  fig_hk_ent_q714103: 94,
  fig_hk_ent_q9077680: 92,
  fig_hk_ent_q1369795: 92,
  fig_hk_ent_q848775: 94,
  fig_hk_ent_q696622: 92,
  fig_hk_ent_q1041384: 92,
  fig_hk_ent_q6548471: 92,
  fig_hk_ent_q2673694: 92,
  fig_hk_ent_q275095: 92,
  fig_hk_ent_q5372109: 92,
  fig_hk_ent_q262468: 92,

  // 1988—1996 年港产三级片女主角或类型代表人物。
  fig_hk_ent_manual_pauline_chan_bo_lin: 94,
  fig_hk_ent_manual_julie_lee_wa_yuet: 92,
  fig_hk_ent_manual_diana_pang: 92,
  fig_hk_ent_manual_teresa_mak: 92,
  fig_hk_ent_q23888552: 92,
  fig_hk_ent_manual_rena_murakami: 92,
  fig_hk_ent_manual_chan_wing_chi: 92,
  fig_hk_ent_manual_isabella_chow: 92,
  fig_hk_ent_manual_tsui_man_wah: 92,
  fig_hk_ent_manual_cindy_yip: 92,
  fig_hk_ent_manual_cheng_yim_lai: 92,
  fig_hk_ent_manual_sharon_kwok: 92,
  fig_hk_ent_manual_chik_king_man: 92,
  fig_hk_ent_manual_lee_lai_lai: 92,
  fig_hk_ent_manual_tsang_siu_yin: 92,
  fig_hk_ent_manual_wong_wing_fong: 92,
  fig_hk_ent_manual_yau_yuk_yue: 92,
  fig_hk_ent_manual_rena_otomo: 92,
  fig_hk_ent_manual_ruby_wong_jo_yi: 92
};

export const hkLateColonialEntertainmentFigureExpansionSource =
  rawExpansion as EntertainmentFigureExpansionSource[];

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim())));
}

function publicRole(kinds: EntertainmentFigureKind[]): string {
  return `活跃于香港电影制作的${kinds.map((kind) => roleLabels[kind]).join('、')}`;
}

function activityWindow(source: EntertainmentFigureExpansionSource): string {
  const { from, to } = source.activeYears;
  return from === to ? `${from}年` : `${from}—${to}年`;
}

function contactPolicy(sourceCredits: number): EraSeedFigureContactPolicy {
  if (sourceCredits >= 12) return 'contactable_seed';
  if (sourceCredits >= 5) return 'rumor_only';
  return 'background_only';
}

function toEraSeedFigureCard(source: EntertainmentFigureExpansionSource): EraSeedFigureCard {
  const roles = publicRole(source.kinds);
  const sectors = unique(source.kinds.flatMap((kind) => kindSectors[kind]));
  const accessRoutes = unique(source.kinds.flatMap((kind) => kindAccessRoutes[kind])).slice(0, 6);
  const promptSafeHooks = unique(source.kinds.flatMap((kind) => kindHooks[kind])).slice(0, 4);

  return {
    type: 'EraSeedFigureCard',
    id: source.id,
    canonicalSeedId: source.id,
    displayName: source.displayName,
    englishName: source.englishName,
    category: 'entertainment',
    sectors,
    activeYears: { ...source.activeYears },
    recognitionAliases: unique([source.englishName, ...(source.recognitionAliases ?? [])]),
    protectedRealNames: [],
    publicRole: roles,
    usualPlaceIds: [],
    accessRoutes,
    promptSafeProfile:
      `${source.displayName}（${source.englishName}），${activityWindow(source)}有香港电影演出或制作记录，公开角色为${roles}。` +
      '这是供模型按年代与情境检索的候选资料，不代表本人已在当前场景出现。',
    promptSafeHooks,
    eraTags: unique(['香港电影', '娱乐人物', ...source.kinds.map((kind) => roleLabels[kind])]),
    contactPolicy: contactPolicy(source.sourceCredits),
    identityHooks: {
      police: `只在案件、片场纠纷、保护安排或可靠线索自然涉及${source.displayName}时接触；不得因候选资料入选而默认本人在场。`,
      civilian: `只在工作、片场、传媒、邻里或亲友关系自然涉及${source.displayName}时接触；不得强行安排偶遇。`,
      gang_member: `只在投资、债务、保护费、片场秩序或夜场人脉自然涉及${source.displayName}时接触；不得把名人自动写成社团关系人。`
    },
    copyRisk: 'low',
    sourceConfidence: source.sourceCredits >= 5 ? 'high' : 'medium',
    importance:
      figureImportanceOverrides[source.id] ??
      Math.min(84, 58 + source.sourceCredits * 2 + Math.min(4, source.kinds.length - 1))
  };
}

export const hkLateColonialEntertainmentFigureExpansion: EraSeedFigureCard[] =
  hkLateColonialEntertainmentFigureExpansionSource.map(toEraSeedFigureCard);
