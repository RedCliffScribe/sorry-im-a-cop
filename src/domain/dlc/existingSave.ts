import type { RuntimeSaveRecord, RuntimeSaveSummary } from '../persistence/SaveRepository';
import type { RuntimeState } from '../runtime/types';
import {
  getOfficialDlcRuntimeManifest,
  isOfficialDlcSupportedByWorldpack,
  officialDlcRuntimeManifests
} from './manifest';
import type { OfficialDlcManifest, SaveDlcBinding } from './types';
import { POLICE_PROMOTION_DLC_ID } from '../police/policePromotionRules';
import {
  evaluatePolicePromotionExistingSave,
  initializePolicePromotionExistingSave,
  type PolicePromotionExistingSaveRejectionCode
} from './policePromotion/existingSave';

export type ExistingSaveDlcEligibilityCode =
  | 'eligible'
  | 'already_bound'
  | 'incompatible_binding'
  | 'unsupported_worldpack'
  | 'runtime_manifest_unavailable'
  | 'save_unavailable'
  | 'existing_save_attachment_unavailable'
  | PolicePromotionExistingSaveRejectionCode;

export interface ExistingSaveDlcEligibility {
  eligible: boolean;
  code: ExistingSaveDlcEligibilityCode;
  reason: string;
}

export interface ExistingSaveDlcCandidate extends RuntimeSaveSummary {
  eligibility: ExistingSaveDlcEligibility;
}

export interface PreparedExistingSaveDlcAttachment {
  backupRecord: RuntimeSaveRecord;
  updatedRecord: RuntimeSaveRecord;
  binding: SaveDlcBinding;
}

function readBoundDlcIds(state: RuntimeState): Set<string> {
  const bindings = state.world.officialDlcBindings;
  if (!Array.isArray(bindings)) return new Set();

  return new Set(
    bindings.flatMap((binding) =>
      binding && typeof binding === 'object' && typeof binding.dlcId === 'string'
        ? [binding.dlcId]
        : []
    )
  );
}

interface ExistingSaveAttachmentAdapter {
  evaluate: (state: RuntimeState) => { code: ExistingSaveDlcEligibilityCode; reason: string } | undefined;
  initialize: (beforeBinding: RuntimeState, withBinding: RuntimeState) => RuntimeState;
}

const existingSaveAttachmentAdapters: Readonly<Record<string, ExistingSaveAttachmentAdapter>> = {
  [POLICE_PROMOTION_DLC_ID]: {
    evaluate: evaluatePolicePromotionExistingSave,
    initialize: initializePolicePromotionExistingSave
  }
};

export function evaluateExistingSaveDlcEligibility(
  state: RuntimeState,
  manifest: OfficialDlcManifest,
  runtimeManifests: readonly OfficialDlcManifest[] = officialDlcRuntimeManifests
): ExistingSaveDlcEligibility {
  const boundDlcIds = readBoundDlcIds(state);

  if (manifest.existingSaveAttachment?.mode !== 'forward_only') {
    return {
      eligible: false,
      code: 'existing_save_attachment_unavailable',
      reason: '这项 DLC 当前不提供给已有存档，未进行任何改动。'
    };
  }

  if (boundDlcIds.has(manifest.dlcId)) {
    return {
      eligible: false,
      code: 'already_bound',
      reason: `这个存档已经加入《${manifest.title}》。`
    };
  }

  const incompatibleDlcId = manifest.incompatibleDlcIds?.find((dlcId) => boundDlcIds.has(dlcId));
  if (incompatibleDlcId) {
    return {
      eligible: false,
      code: 'incompatible_binding',
      reason: '这个存档已绑定测试版 Alpha，不能再加入正式版；原测试存档仍可继续游玩。'
    };
  }

  if (!isOfficialDlcSupportedByWorldpack(manifest, state.world.worldpackId)) {
    return {
      eligible: false,
      code: 'unsupported_worldpack',
      reason: `《${manifest.title}》目前不支持这个存档的世界包。`
    };
  }

  if (!getOfficialDlcRuntimeManifest(manifest.dlcId, manifest.version, runtimeManifests)) {
    return {
      eligible: false,
      code: 'runtime_manifest_unavailable',
      reason: '当前版本缺少这项 DLC 的精确运行资料，未改动存档。'
    };
  }

  const adapterRejection = existingSaveAttachmentAdapters[manifest.dlcId]?.evaluate(state);
  if (adapterRejection) {
    return {
      eligible: false,
      ...adapterRejection
    };
  }

  return {
    eligible: true,
    code: 'eligible',
    reason: '可以从当前游戏时间加入；不会补写过去，也不会改动已有世界事实。'
  };
}

export function createExistingSaveDlcCandidate(
  record: RuntimeSaveRecord,
  manifest: OfficialDlcManifest,
  runtimeManifests: readonly OfficialDlcManifest[] = officialDlcRuntimeManifests
): ExistingSaveDlcCandidate {
  const { runtimeState, ...summary } = record;
  return {
    ...summary,
    eligibility: evaluateExistingSaveDlcEligibility(runtimeState, manifest, runtimeManifests)
  };
}

export function prepareExistingSaveDlcAttachment({
  record,
  manifest,
  backupSaveId,
  activatedAt,
  runtimeManifests = officialDlcRuntimeManifests
}: {
  record: RuntimeSaveRecord;
  manifest: OfficialDlcManifest;
  backupSaveId: string;
  activatedAt: string;
  runtimeManifests?: readonly OfficialDlcManifest[];
}): PreparedExistingSaveDlcAttachment {
  const eligibility = evaluateExistingSaveDlcEligibility(
    record.runtimeState,
    manifest,
    runtimeManifests
  );
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason);
  }

  if (!backupSaveId || backupSaveId === record.saveId) {
    throw new Error('无法建立独立的加入前备份，原存档未被改动。');
  }

  const binding: SaveDlcBinding = {
    dlcId: manifest.dlcId,
    version: manifest.version,
    status: 'active',
    ...(manifest.dramaIntegration?.enabled ? { planningEnabled: true } : {}),
    activatedAt
  };
  const existingBindings = Array.isArray(record.runtimeState.world.officialDlcBindings)
    ? record.runtimeState.world.officialDlcBindings
    : [];
  const stateWithBinding: RuntimeState = {
    ...record.runtimeState,
    world: {
      ...record.runtimeState.world,
      officialDlcBindings: [...existingBindings, binding]
    }
  };
  const adapter = existingSaveAttachmentAdapters[manifest.dlcId];
  const nextState = adapter
    ? adapter.initialize(record.runtimeState, stateWithBinding)
    : stateWithBinding;

  return {
    binding,
    backupRecord: {
      ...record,
      saveId: backupSaveId,
      saveName: `${record.saveName}（加入${manifest.title}前备份）`,
      saveKind: 'manual',
      createdAt: activatedAt,
      updatedAt: activatedAt
    },
    updatedRecord: {
      ...record,
      updatedAt: activatedAt,
      runtimeState: nextState
    }
  };
}
