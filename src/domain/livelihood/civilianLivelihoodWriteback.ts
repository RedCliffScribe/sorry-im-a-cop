import type { RuntimeState, StoryDiagnosticIssue } from '../runtime/types';
import type { NarratorResponse } from '../writeback/schema';

function currentCivilianProfile(state: RuntimeState) {
  return state.actors[state.player.actorId]?.roleProfiles.civilian;
}

function isActiveCivilianSalary(
  item: NonNullable<NarratorResponse['writeback']['financePatch']>['upsertCashflows'][number]
): boolean {
  return (
    item.direction === 'income' &&
    item.kind === 'salary' &&
    item.identityBinding === 'civilian' &&
    item.status === 'active'
  );
}

function hasCivilianSalaryLifecycleWriteback(state: RuntimeState, response: NarratorResponse): boolean {
  const financePatch = response.writeback.financePatch;
  if (!financePatch) return false;

  const activeCivilianSalaryIds = new Set(
    Object.values(state.finance.cashflows)
      .filter(
        (item) =>
          item.direction === 'income' &&
          item.kind === 'salary' &&
          item.identityBinding === 'civilian' &&
          item.status === 'active'
      )
      .map((item) => item.itemId)
  );
  return (
    financePatch.upsertCashflows.some(
      (item) =>
        item.identityBinding === 'civilian' &&
        item.kind === 'salary' &&
        (activeCivilianSalaryIds.has(item.itemId) || item.status !== 'active')
    ) ||
    financePatch.removeCashflowItemIds.some((itemId) => activeCivilianSalaryIds.has(itemId))
  );
}

export function shouldRepairCivilianLivelihoodWriteback(
  state: RuntimeState,
  response: NarratorResponse
): boolean {
  if (state.player.currentIdentity !== 'civilian') return false;

  const currentProfile = currentCivilianProfile(state);
  const rolePatch = response.writeback.civilianRoleProfilePatch;
  const activeSalaryUpserts =
    response.writeback.financePatch?.upsertCashflows.filter(isActiveCivilianSalary) ?? [];
  const profileHasFormalEmployer = Boolean(
    currentProfile?.employerOrganizationId &&
      currentProfile.employmentStatusId &&
      currentProfile.employmentStatusId !== 'unemployed'
  );
  const patchEstablishesFormalEmployer = Boolean(
    rolePatch?.employerOrganizationId &&
      rolePatch.employmentStatusId &&
      rolePatch.employmentStatusId !== 'unemployed'
  );
  const unpairedEmploymentStart =
    activeSalaryUpserts.length > 0 &&
    !profileHasFormalEmployer &&
    !patchEstablishesFormalEmployer;

  const roleEndsEmployment =
    rolePatch?.employmentStatusId === 'unemployed' ||
    rolePatch?.employerOrganizationId === null;
  const roleChangesEmployer =
    typeof rolePatch?.employerOrganizationId === 'string' &&
    rolePatch.employerOrganizationId !== currentProfile?.employerOrganizationId;
  const roleChangesPosition =
    typeof rolePatch?.positionSummary === 'string' &&
    rolePatch.positionSummary !== currentProfile?.positionSummary;
  const roleNeedsFinanceReview =
    (roleEndsEmployment || roleChangesEmployer || roleChangesPosition) &&
    !hasCivilianSalaryLifecycleWriteback(state, response);

  return unpairedEmploymentStart || roleNeedsFinanceReview;
}

export function enforceCivilianLivelihoodWritebackAtomicity(
  state: RuntimeState,
  response: NarratorResponse,
  turnEndMonth: string
): { response: NarratorResponse; diagnostics: StoryDiagnosticIssue[] } {
  if (state.player.currentIdentity !== 'civilian') return { response, diagnostics: [] };

  const diagnostics: StoryDiagnosticIssue[] = [];
  const currentProfile = currentCivilianProfile(state);
  const rolePatch = response.writeback.civilianRoleProfilePatch;
  let financePatch = response.writeback.financePatch;

  const activeSalaryUpserts = financePatch?.upsertCashflows.filter(isActiveCivilianSalary) ?? [];
  if (activeSalaryUpserts.length > 0) {
    const profileHasFormalEmployer = Boolean(
      currentProfile?.employerOrganizationId &&
        currentProfile.employmentStatusId &&
        currentProfile.employmentStatusId !== 'unemployed'
    );
    const knownOrganizationIds = new Set([
      ...Object.keys(state.organizations),
      ...response.writeback.organizationPatches.map((patch) => patch.organizationId)
    ]);
    const patchEstablishesFormalEmployer = Boolean(
      rolePatch?.employerOrganizationId &&
        knownOrganizationIds.has(rolePatch.employerOrganizationId) &&
        rolePatch.employmentStatusId &&
        rolePatch.employmentStatusId !== 'unemployed'
    );

    if (!profileHasFormalEmployer && !patchEstablishesFormalEmployer && financePatch) {
      const rejectedIds = new Set(activeSalaryUpserts.map((item) => item.itemId));
      financePatch = {
        ...financePatch,
        upsertCashflows: financePatch.upsertCashflows.filter((item) => !rejectedIds.has(item.itemId))
      };
      diagnostics.push({
        path: ['writeback', 'financePatch', 'upsertCashflows'],
        code: 'civilian_salary_without_role_profile_rejected',
        message:
          'Rejected an active civilian salary because the same turn did not establish a valid civilian employer and employment status.'
      });
    }
  }

  const roleEndsEmployment =
    rolePatch?.employmentStatusId === 'unemployed' ||
    rolePatch?.employerOrganizationId === null;
  const roleChangesEmployer =
    typeof rolePatch?.employerOrganizationId === 'string' &&
    rolePatch.employerOrganizationId !== currentProfile?.employerOrganizationId;
  const roleChangesWorkplace =
    typeof rolePatch?.workplacePlaceId === 'string' &&
    rolePatch.workplacePlaceId !== currentProfile?.workplacePlaceId;
  if (roleEndsEmployment) {
    const removedIds = new Set(financePatch?.removeCashflowItemIds ?? []);
    const upsertedIds = new Set(financePatch?.upsertCashflows.map((item) => item.itemId) ?? []);
    const missingClosures = Object.values(state.finance.cashflows)
      .filter(
        (item) =>
          item.direction === 'income' &&
          item.kind === 'salary' &&
          item.identityBinding === 'civilian' &&
          item.status === 'active' &&
          !removedIds.has(item.itemId) &&
          !upsertedIds.has(item.itemId)
      )
      .map((item) => ({
        ...item,
        status: 'ended' as const,
        activeToMonth: turnEndMonth,
        source: 'writeback' as const
      }));
    if (missingClosures.length > 0) {
      financePatch = {
        ...(financePatch ?? {
          upsertCashflows: [],
          removeCashflowItemIds: [],
          ledgerEntries: []
        }),
        upsertCashflows: [...(financePatch?.upsertCashflows ?? []), ...missingClosures]
      };
      diagnostics.push({
        path: ['writeback', 'financePatch', 'upsertCashflows'],
        code: 'civilian_salary_closed_with_employment',
        message: `Ended ${missingClosures.length} active civilian salary cashflow(s) together with the explicit employment exit.`
      });
    }
  }

  let currentMatterPatches = response.writeback.currentMatterPatches;
  if (roleEndsEmployment || roleChangesEmployer || roleChangesWorkplace) {
    const explicitlyClosedIds = new Set(
      currentMatterPatches
        .filter(
          (patch) =>
            patch.status === 'resolved' ||
            patch.status === 'archived'
        )
        .map((patch) => patch.id)
    );
    const staleLivelihoodMatterPatches = Object.values(
      state.dynamicEvents.currentMatters
    )
      .filter(
        (matter) =>
          matter.matterKind === 'livelihood' &&
          (matter.status === 'active' || matter.status === 'dormant') &&
          !explicitlyClosedIds.has(matter.id)
      )
      .map((matter) => ({
        id: matter.id,
        status: 'resolved' as const,
        unread: false
      }));

    if (staleLivelihoodMatterPatches.length > 0) {
      currentMatterPatches = [
        ...currentMatterPatches,
        ...staleLivelihoodMatterPatches
      ];
      diagnostics.push({
        path: ['writeback', 'currentMatterPatches'],
        code: 'civilian_livelihood_matters_closed_with_role_change',
        message: `Resolved ${staleLivelihoodMatterPatches.length} active livelihood matter(s) together with the civilian role change.`
      });
    }
  }

  return {
    response: {
      ...response,
      writeback: {
        ...response.writeback,
        financePatch,
        currentMatterPatches
      }
    },
    diagnostics
  };
}
