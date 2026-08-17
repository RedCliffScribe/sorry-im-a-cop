import type { GameTime } from '../runtime/types';

export interface HistoricalHongKongNewsAnchor {
  id: string;
  availableFrom: Pick<GameTime, 'year' | 'month' | 'day'>;
  availableUntil: Pick<GameTime, 'year' | 'month' | 'day'>;
  section: 'local' | 'business' | 'politics' | 'society';
  title: string;
  factualSummary: string;
}

/*
 * These are dated factual anchors, not verbatim historical headlines.
 * Primary references:
 * - Hong Kong Government / LegCo historical pages for the MTR, Joint Declaration,
 *   Basic Law and electoral development.
 * - LegCo Hansard for the 1988 Vietnamese boat-people screening policy.
 * - HKMA's official milestones of monetary reform for the July 1988 arrangements.
 */
export const historicalHongKongNewsAnchors: readonly HistoricalHongKongNewsAnchor[] = [
  {
    id: 'hk_1980_mtr_cross_harbour',
    availableFrom: { year: 1980, month: 2, day: 12 },
    availableUntil: { year: 1980, month: 6, day: 30 },
    section: 'local',
    title: '地下铁路越过维港',
    factualSummary: '地下铁路修正早期系统于二月十二日延伸过海，金钟及遮打站投入服务，港九通勤方式正在改变。'
  },
  {
    id: 'hk_1984_joint_declaration',
    availableFrom: { year: 1984, month: 12, day: 19 },
    availableUntil: { year: 1985, month: 6, day: 30 },
    section: 'politics',
    title: '中英联合声明签署',
    factualSummary: '中英两国政府于十二月十九日在北京签署关于香港问题的联合声明，香港社会持续讨论前途与过渡安排。'
  },
  {
    id: 'hk_1988_vietnamese_screening',
    availableFrom: { year: 1988, month: 6, day: 16 },
    availableUntil: { year: 1988, month: 12, day: 31 },
    section: 'society',
    title: '越南船民甄别政策实施',
    factualSummary: '香港自六月十六日起对新抵港越南船民实施甄别政策，收容、遣返与人道安排成为持续公共议题。'
  },
  {
    id: 'hk_1988_monetary_reform',
    availableFrom: { year: 1988, month: 7, day: 1 },
    availableUntil: { year: 1988, month: 12, day: 31 },
    section: 'business',
    title: '联系汇率运行安排调整',
    factualSummary: '当局在一九八八年七月引入新的货币管理安排，加强银行体系流动资金与联系汇率制度的运作。'
  },
  {
    id: 'hk_1990_basic_law',
    availableFrom: { year: 1990, month: 4, day: 4 },
    availableUntil: { year: 1990, month: 12, day: 31 },
    section: 'politics',
    title: '香港基本法获通过并公布',
    factualSummary: '全国人民代表大会于四月四日通过并公布香港特别行政区基本法，过渡制度与九七后的安排成为全港焦点。'
  },
  {
    id: 'hk_1994_electoral_reform',
    availableFrom: { year: 1994, month: 6, day: 30 },
    availableUntil: { year: 1994, month: 12, day: 31 },
    section: 'politics',
    title: '一九九五年选举安排法案通过',
    factualSummary: '立法局于六月三十日通过与一九九五年选举安排有关的法案，政制与过渡争议继续发酵。'
  },
  {
    id: 'hk_1996_elected_legislature',
    availableFrom: { year: 1995, month: 9, day: 17 },
    availableUntil: { year: 1996, month: 12, day: 20 },
    section: 'politics',
    title: '移交前最后一届立法局运作',
    factualSummary: '一九九五年组成的香港首届全体议员均由选举产生的立法局仍在运作，任期与九七衔接问题备受关注。'
  }
];

function dateValue(time: Pick<GameTime, 'year' | 'month' | 'day'>): number {
  return time.year * 10_000 + time.month * 100 + time.day;
}

export function selectHistoricalHongKongNewsAnchors(time: GameTime): HistoricalHongKongNewsAnchor[] {
  const current = dateValue(time);
  return historicalHongKongNewsAnchors.filter(
    (anchor) =>
      dateValue(anchor.availableFrom) <= current &&
      current <= dateValue(anchor.availableUntil)
  );
}

export function formatHistoricalHongKongNewsAnchorsForPrompt(time: GameTime): string {
  const anchors = selectHistoricalHongKongNewsAnchors(time);
  if (anchors.length === 0) {
    return '当前日期没有内置的精确历史事件锚点；请只写符合年代的城市公共议题，不得编造具体历史大事。';
  }
  return anchors
    .map(
      (anchor) =>
        `- anchorId=${anchor.id} section=${anchor.section} 事实主题=${anchor.title}；已核对事实=${anchor.factualSummary}`
    )
    .join('\n');
}
