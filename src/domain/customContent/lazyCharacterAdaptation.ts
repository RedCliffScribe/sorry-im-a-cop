import type {
  CustomEventGroupRevision,
  CustomEventStage
} from './assetTypes';

export function resolveCustomEventCurrentStage(
  eventGroup: CustomEventGroupRevision,
  {
    currentStageId,
    usedStageIds = []
  }: {
    currentStageId?: string;
    usedStageIds?: readonly string[];
  } = {}
): CustomEventStage | undefined {
  return (
    eventGroup.stages.find(
      (stage) =>
        stage.stageId === currentStageId &&
        !usedStageIds.includes(stage.stageId)
    ) ??
    eventGroup.stages.find((stage) => !usedStageIds.includes(stage.stageId))
  );
}

export function collectCustomEventStageCharacterAssetIds(
  eventGroup: CustomEventGroupRevision,
  stage: CustomEventStage | undefined
): string[] {
  const ids = new Set(
    eventGroup.roleSlots.flatMap((slot) =>
      slot.fixedCharacterRef ? [slot.fixedCharacterRef.assetId] : []
    )
  );
  for (const node of stage?.eventNodes ?? []) {
    for (const usage of node.characterUsages) {
      if (usage.characterRef) ids.add(usage.characterRef.assetId);
    }
  }
  return [...ids];
}
