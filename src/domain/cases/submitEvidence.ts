import { applyEquippedAssetsToRuntimeState } from '../assets/equipmentSlots';
import type {
  AssetItem,
  AssetItemId,
  CaseEvidence,
  CaseEvidenceType,
  CaseId,
  GameTime,
  RuntimeState,
  StandardAssetItem
} from '../runtime/types';

const STANDARD_ASSET_CATEGORIES = new Set(['equipment', 'general', 'document', 'valuable']);

function isStandardAssetItem(item: AssetItem): item is StandardAssetItem {
  return STANDARD_ASSET_CATEGORIES.has(item.category);
}

function toEvidenceType(item: StandardAssetItem): CaseEvidenceType {
  if (item.category === 'document') return 'document';
  if (item.category === 'equipment' || item.category === 'valuable') return 'physical';
  return 'other';
}

function stableToken(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function nextEvidenceId(state: RuntimeState, caseId: CaseId, itemId: AssetItemId): string {
  const base = `evidence_${stableToken(caseId) || 'case'}_${stableToken(itemId) || 'item'}`;
  if (!state.caseEvidence[base]) return base;

  let index = 2;
  let candidate = `${base}_${index}`;
  while (state.caseEvidence[candidate]) {
    index += 1;
    candidate = `${base}_${index}`;
  }
  return candidate;
}

export function submitAssetEvidenceToCase(
  state: RuntimeState,
  input: { caseId: CaseId; itemId: AssetItemId; gameTime?: GameTime }
): RuntimeState {
  const gameTime = input.gameTime ?? state.time;
  const caseFile = state.cases[input.caseId];
  if (!caseFile) {
    throw new Error(`Case not found: ${input.caseId}`);
  }

  const item = state.assets.items[input.itemId];
  if (!item) {
    throw new Error(`Asset item not found: ${input.itemId}`);
  }
  if (!isStandardAssetItem(item)) {
    throw new Error('Only standard asset items can be submitted as case evidence.');
  }
  if (!item.evidence) {
    throw new Error('Asset item is not marked as evidence.');
  }
  if (item.evidence.caseId !== input.caseId) {
    throw new Error('Asset evidence case does not match target case.');
  }

  const evidenceId = nextEvidenceId(state, input.caseId, input.itemId);
  const evidence: CaseEvidence = {
    evidenceId,
    caseId: input.caseId,
    title: item.name,
    evidenceType: toEvidenceType(item),
    sourceSummary: item.summary,
    summary: item.evidence.summary,
    submittedByActorId: state.player.actorId,
    submittedAt: gameTime,
    relatedActorIds: [...item.relatedActorIds],
    relatedPlaceIds: [...item.relatedPlaceIds],
    relatedAssetItemId: input.itemId,
    disputeSummary: item.evidence.disputed ? item.evidence.disputeSummary || '该证据存在争议。' : undefined,
    visibility: item.visibility,
    createdAt: gameTime,
    updatedAt: gameTime
  };

  const { [input.itemId]: _removedItem, ...remainingItems } = state.assets.items;
  const activity = {
    activityId: `activity_${evidenceId}_submitted`,
    kind: 'evidence_added' as const,
    gameTime,
    summary: `提交证据：${item.name}`,
    actorId: state.player.actorId,
    relatedEvidenceIds: [evidenceId],
    relatedActorIds: [state.player.actorId, ...item.relatedActorIds],
    relatedPlaceIds: [...item.relatedPlaceIds],
    visibleToPlayer: true
  };

  return applyEquippedAssetsToRuntimeState({
    ...state,
    cases: {
      ...state.cases,
      [input.caseId]: {
        ...caseFile,
        evidenceIds: caseFile.evidenceIds.includes(evidenceId) ? caseFile.evidenceIds : [...caseFile.evidenceIds, evidenceId],
        activityLog: [...caseFile.activityLog, activity],
        lastActivityAt: gameTime,
        updatedAt: gameTime
      }
    },
    caseEvidence: {
      ...state.caseEvidence,
      [evidenceId]: evidence
    },
    assets: {
      items: remainingItems,
      equippedItemIds: state.assets.equippedItemIds.filter((itemId) => itemId !== input.itemId)
    }
  });
}
