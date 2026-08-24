import {
  normalizePoliceCareerProgress
} from '../../police/policeCareerProgress';
import {
  getPolicePromotionRoute,
  normalizePolicePromotionRank
} from '../../police/policePromotionRules';
import type { RuntimeState } from '../../runtime/types';

export type PolicePromotionExistingSaveRejectionCode =
  | 'police_identity_required'
  | 'police_rank_unrecognized'
  | 'police_promotion_route_unavailable'
  | 'police_promotion_state_conflict';

export interface PolicePromotionExistingSaveRejection {
  code: PolicePromotionExistingSaveRejectionCode;
  reason: string;
}

/**
 * Old saves are accepted only when a deterministic forward-only promotion
 * program can be created without guessing identity or historical evidence.
 */
export function evaluatePolicePromotionExistingSave(
  state: RuntimeState
): PolicePromotionExistingSaveRejection | undefined {
  if (state.player.currentIdentity !== 'police') {
    return {
      code: 'police_identity_required',
      reason: '这项系统目前只可加入当前身份为警察的香港旧存档；不会替市民或社团人物补造警察履历。'
    };
  }

  if (state.policePanel.careerPath.promotionProgress) {
    return {
      code: 'police_promotion_state_conflict',
      reason: '存档已经存在未绑定的晋升进度，为避免覆盖既有状态，本次未进行任何改动。'
    };
  }

  const rank = normalizePolicePromotionRank(state.lawIdentity.rank);
  if (rank.inputRankCode === 'unknown') {
    return {
      code: 'police_rank_unrecognized',
      reason: '当前警衔无法安全识别；请先在人物志或存档修复中确认警衔，本次未改动存档。'
    };
  }

  if (!getPolicePromotionRoute(state.lawIdentity.rank, state.world.worldpackId)) {
    return {
      code: 'police_promotion_route_unavailable',
      reason: '当前警衔已超出首版晋升路线范围；原有警衔和岗位保持不变，本次不建立空白进度。'
    };
  }

  return undefined;
}

function stateWithoutAllowedAttachmentChanges(state: RuntimeState): unknown {
  const { officialDlcBindings: _bindings, ...world } = state.world;
  const {
    targetRank: _targetRank,
    promotionProgress: _promotionProgress,
    ...careerPath
  } = state.policePanel.careerPath;
  return {
    ...state,
    world,
    policePanel: {
      ...state.policePanel,
      careerPath
    }
  };
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Initializes the promotion program at the save's current game time. Existing
 * rank, unit, posting, authority, money, history and evidence remain untouched.
 */
export function initializePolicePromotionExistingSave(
  stateBeforeBinding: RuntimeState,
  stateWithBinding: RuntimeState
): RuntimeState {
  const rejection = evaluatePolicePromotionExistingSave(stateBeforeBinding);
  if (rejection) throw new Error(rejection.reason);

  const initialized = normalizePoliceCareerProgress(stateWithBinding);
  const program = initialized.policePanel.careerPath.promotionProgress;
  if (!program) {
    throw new Error('无法建立稳定的晋升进度，原存档未被改动。');
  }
  if (program.evidence.length > 0 || program.processStage !== 'not_eligible') {
    throw new Error('旧档初始化不得追溯补写晋升证据或程序阶段，原存档未被改动。');
  }
  if (!sameJsonValue(
    initialized.world.officialDlcBindings ?? [],
    stateWithBinding.world.officialDlcBindings ?? []
  )) {
    throw new Error('旧档初始化不得改写其他 DLC 绑定，原存档未被改动。');
  }
  if (!sameJsonValue(
    stateWithoutAllowedAttachmentChanges(stateBeforeBinding),
    stateWithoutAllowedAttachmentChanges(initialized)
  )) {
    throw new Error('旧档初始化触及了警衔、岗位或其他既有事实，原存档未被改动。');
  }
  return initialized;
}
