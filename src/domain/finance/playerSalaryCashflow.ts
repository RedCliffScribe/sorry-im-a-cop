import type {
  CurrentIdentity,
  FinanceCashflowItem,
  GameTime,
  LawIdentityRuntime,
  PlayerIdentityTransitionRecord,
  RuntimeFinanceState
} from '../runtime/types';
import { resolvePoliceRankCode } from '../police/policeRankCatalog';
import { formatMonthKey } from './financeState';

export const PLAYER_POLICE_SALARY_CASHFLOW_ID = 'cashflow_player_police_salary';

type PoliceSalaryBaseBand = 'constable' | 'sergeant' | 'inspector' | 'superintendent';
type PoliceSalaryBand =
  | PoliceSalaryBaseBand
  | 'senior_superintendent'
  | 'chief_superintendent'
  | 'assistant_commissioner'
  | 'senior_assistant_commissioner'
  | 'deputy_commissioner'
  | 'commissioner';

const policeSalaryByEra: Array<{
  fromYear: number;
  toYear: number;
  monthlyAmount: Record<PoliceSalaryBaseBand, number>;
}> = [
  { fromYear: 1980, toYear: 1983, monthlyAmount: { constable: 3300, sergeant: 4100, inspector: 5200, superintendent: 7600 } },
  { fromYear: 1984, toYear: 1989, monthlyAmount: { constable: 4200, sergeant: 5200, inspector: 6500, superintendent: 9200 } },
  { fromYear: 1990, toYear: 1993, monthlyAmount: { constable: 5100, sergeant: 6400, inspector: 8000, superintendent: 11200 } },
  { fromYear: 1994, toYear: 1996, monthlyAmount: { constable: 6200, sergeant: 7800, inspector: 9800, superintendent: 13600 } }
];

/**
 * Preserve the existing game-economy scale while separating senior-command
 * salaries. Relative gaps use the October 1988 RHKPF proposed Police Pay
 * Scale: SP PPS 50-53 midpoint as the base, then SSP PPS 54-57, CSP 58,
 * ACP 59, SACP 60, DCP 61 and CP 62.
 * Source: https://www.jsscs.gov.hk/reports/en/rcds_fin/report/rcds_fin_eng_annex_04.pdf
 */
const seniorCommandSalaryMultipliers: Record<
  Exclude<PoliceSalaryBand, PoliceSalaryBaseBand>,
  number
> = {
  senior_superintendent: 1.16,
  chief_superintendent: 1.36,
  assistant_commissioner: 1.53,
  senior_assistant_commissioner: 1.78,
  deputy_commissioner: 2.02,
  commissioner: 2.37
};

function resolveSalaryEra(year: number) {
  return (
    policeSalaryByEra.find((era) => year >= era.fromYear && year <= era.toYear) ??
    policeSalaryByEra.find((era) => year < era.fromYear) ??
    policeSalaryByEra[policeSalaryByEra.length - 1]
  );
}

function resolveSalaryBand(rank: string | undefined): PoliceSalaryBand {
  const code = resolvePoliceRankCode(rank);
  if (code === 'cp') return 'commissioner';
  if (code === 'dcp') return 'deputy_commissioner';
  if (code === 'sacp') return 'senior_assistant_commissioner';
  if (code === 'acp') return 'assistant_commissioner';
  if (code === 'csp') return 'chief_superintendent';
  if (code === 'ssp') return 'senior_superintendent';
  if (code === 'sp') return 'superintendent';
  if (['cip', 'sip', 'ip', 'pi'].includes(code)) return 'inspector';
  if (['ssgt', 'sgt'].includes(code)) return 'sergeant';
  return 'constable';
}

function estimatePoliceSalary(rank: string | undefined, time: GameTime): number {
  const era = resolveSalaryEra(time.year);
  const band = resolveSalaryBand(rank);
  if (band in seniorCommandSalaryMultipliers) {
    const multiplier =
      seniorCommandSalaryMultipliers[
        band as keyof typeof seniorCommandSalaryMultipliers
      ];
    return Math.round((era.monthlyAmount.superintendent * multiplier) / 100) * 100;
  }
  return era.monthlyAmount[band as PoliceSalaryBaseBand];
}

function findActivePlayerPoliceSalary(finance: RuntimeFinanceState): FinanceCashflowItem | undefined {
  return Object.values(finance.cashflows).find(
    (item) =>
      item.status === 'active' &&
      item.direction === 'income' &&
      item.kind === 'salary' &&
      /police|警队|警察/i.test(`${item.itemId} ${item.title} ${item.summary}`)
  );
}

function createPoliceSalarySummary(rank: string | undefined, station: string | undefined, department: string | undefined, time: GameTime): string {
  const assignment = [station, department].filter(Boolean).join(' / ');
  const era = resolveSalaryEra(time.year);
  return [
    rank ? `${rank}固定月薪。` : '警队固定月薪。',
    `工资按${era.fromYear}-${era.toYear}年警队薪酬估算表计算。`,
    assignment ? `当前单位：${assignment}。` : ''
  ]
    .filter(Boolean)
    .join('');
}

function createPoliceSalaryCashflow(time: GameTime, lawIdentity: LawIdentityRuntime): FinanceCashflowItem {
  const rank = lawIdentity.rank?.trim();
  const station = lawIdentity.stationOrPost?.trim();
  const department = lawIdentity.department?.trim();
  const relatedPlaceIds = station && /旺角|Mong Kok/i.test(station) ? ['place_mong_kok_police_station'] : [];

  return {
    itemId: PLAYER_POLICE_SALARY_CASHFLOW_ID,
    direction: 'income',
    kind: 'salary',
    title: '警队月薪',
    amount: estimatePoliceSalary(rank, time),
    account: 'bank',
    identityBinding: 'police',
    summary: createPoliceSalarySummary(rank, station, department, time),
    activeFromMonth: formatMonthKey(time),
    relatedAssetItemIds: [],
    relatedActorIds: ['player'],
    relatedPlaceIds,
    source: 'opening',
    status: 'active',
    visibility: 'player_known'
  };
}

function updatePoliceSalaryCashflow(item: FinanceCashflowItem, time: GameTime, lawIdentity: LawIdentityRuntime): FinanceCashflowItem {
  const next = createPoliceSalaryCashflow(time, lawIdentity);
  if (item.amount === next.amount && item.account === 'bank' && item.summary === next.summary && item.status === 'active') return item;
  return {
    ...item,
    direction: 'income',
    kind: 'salary',
    title: '警队月薪',
    amount: next.amount,
    account: 'bank',
    identityBinding: 'police',
    summary: next.summary,
    activeFromMonth: next.activeFromMonth,
    activeToMonth: undefined,
    relatedActorIds: item.relatedActorIds.includes('player') ? item.relatedActorIds : [...item.relatedActorIds, 'player'],
    relatedPlaceIds: next.relatedPlaceIds,
    status: 'active',
    visibility: 'player_known'
  };
}

function hasOpenPoliceCover(
  currentIdentity: CurrentIdentity,
  identityHistory: PlayerIdentityTransitionRecord[]
): boolean {
  const coverStack: PlayerIdentityTransitionRecord[] = [];
  for (const record of identityHistory) {
    if (record.kind === 'cover_enter') {
      coverStack.push(record);
      continue;
    }
    if (record.kind !== 'cover_exit' && record.kind !== 'exposure') continue;
    const latest = coverStack[coverStack.length - 1];
    if (
      latest &&
      latest.fromIdentity === record.toIdentity &&
      latest.toIdentity === record.fromIdentity
    ) {
      coverStack.pop();
    }
  }
  const latest = coverStack[coverStack.length - 1];
  return Boolean(
    latest &&
    latest.fromIdentity === 'police' &&
    latest.toIdentity === currentIdentity
  );
}

export function syncPlayerPoliceSalaryCashflow({
  finance,
  time,
  currentIdentity,
  lawIdentity,
  identityHistory
}: {
  finance: RuntimeFinanceState;
  time: GameTime;
  currentIdentity: CurrentIdentity;
  lawIdentity: LawIdentityRuntime;
  identityHistory: PlayerIdentityTransitionRecord[];
}): RuntimeFinanceState {
  const policeEmploymentContinues =
    (currentIdentity === 'police' && lawIdentity.status === 'active') ||
    (lawIdentity.status === 'hidden' && hasOpenPoliceCover(currentIdentity, identityHistory));
  if (!policeEmploymentContinues) {
    const existingSalary = finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID];
    if (!existingSalary || existingSalary.status !== 'active') return finance;
    return {
      ...finance,
      cashflows: {
        ...finance.cashflows,
        [existingSalary.itemId]: {
          ...existingSalary,
          status: 'paused',
          activeToMonth: formatMonthKey(time)
        }
      }
    };
  }
  const existingSalary = finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID] ?? findActivePlayerPoliceSalary(finance);
  if (existingSalary) {
    const nextSalary = updatePoliceSalaryCashflow(existingSalary, time, lawIdentity);
    if (nextSalary === existingSalary) return finance;
    return {
      ...finance,
      cashflows: {
        ...finance.cashflows,
        [existingSalary.itemId]: nextSalary
      }
    };
  }

  return {
    ...finance,
    cashflows: {
      ...finance.cashflows,
      [PLAYER_POLICE_SALARY_CASHFLOW_ID]: createPoliceSalaryCashflow(time, lawIdentity)
    }
  };
}
