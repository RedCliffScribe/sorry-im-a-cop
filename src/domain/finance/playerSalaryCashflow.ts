import type { CurrentIdentity, FinanceCashflowItem, GameTime, LawIdentityRuntime, RuntimeFinanceState } from '../runtime/types';
import { formatMonthKey } from './financeState';

export const PLAYER_POLICE_SALARY_CASHFLOW_ID = 'cashflow_player_police_salary';

type PoliceSalaryBand = 'constable' | 'sergeant' | 'inspector' | 'superintendent';

const policeSalaryByEra: Array<{
  fromYear: number;
  toYear: number;
  monthlyAmount: Record<PoliceSalaryBand, number>;
}> = [
  { fromYear: 1980, toYear: 1983, monthlyAmount: { constable: 3300, sergeant: 4100, inspector: 5200, superintendent: 7600 } },
  { fromYear: 1984, toYear: 1989, monthlyAmount: { constable: 4200, sergeant: 5200, inspector: 6500, superintendent: 9200 } },
  { fromYear: 1990, toYear: 1993, monthlyAmount: { constable: 5100, sergeant: 6400, inspector: 8000, superintendent: 11200 } },
  { fromYear: 1994, toYear: 1996, monthlyAmount: { constable: 6200, sergeant: 7800, inspector: 9800, superintendent: 13600 } }
];

function resolveSalaryEra(year: number) {
  return (
    policeSalaryByEra.find((era) => year >= era.fromYear && year <= era.toYear) ??
    policeSalaryByEra.find((era) => year < era.fromYear) ??
    policeSalaryByEra[policeSalaryByEra.length - 1]
  );
}

function resolveSalaryBand(rank: string | undefined): PoliceSalaryBand {
  const normalized = rank ?? '';
  if (/警司|Superintendent/i.test(normalized)) return 'superintendent';
  if (/督察|Inspector/i.test(normalized)) return 'inspector';
  if (/警長|警长|Sergeant/i.test(normalized)) return 'sergeant';
  return 'constable';
}

function estimatePoliceSalary(rank: string | undefined, time: GameTime): number {
  return resolveSalaryEra(time.year).monthlyAmount[resolveSalaryBand(rank)];
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
    summary: next.summary,
    activeFromMonth: next.activeFromMonth,
    relatedActorIds: item.relatedActorIds.includes('player') ? item.relatedActorIds : [...item.relatedActorIds, 'player'],
    relatedPlaceIds: next.relatedPlaceIds,
    status: 'active',
    visibility: 'player_known'
  };
}

export function syncPlayerPoliceSalaryCashflow({
  finance,
  time,
  currentIdentity,
  lawIdentity
}: {
  finance: RuntimeFinanceState;
  time: GameTime;
  currentIdentity: CurrentIdentity;
  lawIdentity: LawIdentityRuntime;
}): RuntimeFinanceState {
  if (currentIdentity !== 'police' || lawIdentity.status !== 'active') {
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
