import type { CivilianOpeningProfileOption } from '../worldpack/hk1980sOpening';
import type { FinanceCashflowItem, GameTime, RuntimeFinanceState } from '../runtime/types';
import { formatMonthKey } from './financeState';

export const PLAYER_CIVILIAN_PRIMARY_INCOME_ID = 'cashflow_player_civilian_primary_job';

function createCivilianIncomeCashflow(
  profile: CivilianOpeningProfileOption,
  time: GameTime
): FinanceCashflowItem | undefined {
  if (!profile.suggestedMonthlyIncome || profile.suggestedMonthlyIncome <= 0) return undefined;
  const selfEmployed = profile.incomeKind === 'asset_income';
  return {
    itemId: PLAYER_CIVILIAN_PRIMARY_INCOME_ID,
    direction: 'income',
    kind: profile.incomeKind ?? 'salary',
    title: selfEmployed ? `${profile.label}经营收入` : `${profile.label}月薪`,
    amount: Math.trunc(profile.suggestedMonthlyIncome),
    account: 'bank',
    identityBinding: 'civilian',
    summary: selfEmployed
      ? `${profile.employerName ?? profile.workplaceLabel}的开局估算经营净收入；可由后续剧情改写、暂停或终止。`
      : `${profile.employerName ?? profile.workplaceLabel}支付的开局固定月薪；可由后续剧情改写、暂停或终止。`,
    activeFromMonth: formatMonthKey(time),
    relatedAssetItemIds: [],
    relatedActorIds: ['player'],
    relatedPlaceIds: [profile.workplacePlaceId],
    source: 'opening',
    status: 'active',
    visibility: 'player_known'
  };
}

export function syncPlayerCivilianOpeningIncome({
  finance,
  profile,
  time
}: {
  finance: RuntimeFinanceState;
  profile: CivilianOpeningProfileOption;
  time: GameTime;
}): RuntimeFinanceState {
  const income = createCivilianIncomeCashflow(profile, time);
  if (!income) return finance;
  return {
    ...finance,
    cashflows: {
      ...finance.cashflows,
      [income.itemId]: income
    }
  };
}
