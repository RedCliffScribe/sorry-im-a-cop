import type {
  CurrentIdentity,
  PlayerIdentityTransitionKind,
  RuntimeFinanceState
} from '../runtime/types';

function pauseBoundCashflows(finance: RuntimeFinanceState, identity: CurrentIdentity): RuntimeFinanceState {
  let changed = false;
  const cashflows = Object.fromEntries(
    Object.entries(finance.cashflows).map(([itemId, item]) => {
      if (item.identityBinding !== identity || item.status !== 'active') return [itemId, item];
      changed = true;
      return [itemId, { ...item, status: 'paused' as const }];
    })
  );
  return changed ? { ...finance, cashflows } : finance;
}

function resumeBoundCashflows(finance: RuntimeFinanceState, identity: CurrentIdentity): RuntimeFinanceState {
  let changed = false;
  const cashflows = Object.fromEntries(
    Object.entries(finance.cashflows).map(([itemId, item]) => {
      if (item.identityBinding !== identity || item.status !== 'paused') return [itemId, item];
      changed = true;
      return [itemId, { ...item, status: 'active' as const, activeToMonth: undefined }];
    })
  );
  return changed ? { ...finance, cashflows } : finance;
}

export function syncIdentityBoundCashflowsForTransition({
  finance,
  kind,
  fromIdentity,
  toIdentity
}: {
  finance: RuntimeFinanceState;
  kind: PlayerIdentityTransitionKind;
  fromIdentity: CurrentIdentity;
  toIdentity: CurrentIdentity;
}): RuntimeFinanceState {
  if (fromIdentity === toIdentity || kind === 'cover_enter') return finance;

  let next = pauseBoundCashflows(finance, fromIdentity);
  if (kind === 'cover_exit' || kind === 'exposure') {
    next = resumeBoundCashflows(next, toIdentity);
  }
  return next;
}
