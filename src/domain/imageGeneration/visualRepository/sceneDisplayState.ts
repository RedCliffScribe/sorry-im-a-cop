import { storySceneDisplayStateSchema } from './schemas';
import type { StorySceneDisplayState } from './types';

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function appendSceneShots(input: {
  current?: StorySceneDisplayState;
  saveId: string;
  turnId: string;
  shotIds: string[];
  updatedAt: string;
}): StorySceneDisplayState {
  if (input.current && (input.current.saveId !== input.saveId || input.current.turnId !== input.turnId)) {
    throw new Error('场景显示状态不属于当前存档或回合。');
  }
  return storySceneDisplayStateSchema.parse({
    saveId: input.saveId,
    turnId: input.turnId,
    activeShotIds: unique([...(input.current?.activeShotIds ?? []), ...input.shotIds]),
    pendingReplacement: input.current?.pendingReplacement,
    updatedAt: input.updatedAt
  });
}

export function beginSceneReplacement(
  current: StorySceneDisplayState,
  scenePlanId: string,
  operation: 'replace-group' | 'replace-shot',
  shotIds: string[],
  targetShotIds: string[],
  updatedAt: string
): StorySceneDisplayState {
  if (!shotIds.length) throw new Error('替换计划至少需要一个 SceneShot。');
  if (!targetShotIds.length) throw new Error('替换计划必须冻结被替换的 SceneShot。');
  if (current.pendingReplacement && current.pendingReplacement.scenePlanId !== scenePlanId) {
    throw new Error('当前回合已有另一项待决替换，不能并行覆盖显示状态。');
  }
  if (operation === 'replace-shot') {
    if (shotIds.length !== 1 || targetShotIds.length !== 1) throw new Error('单图重生必须一对一替换 SceneShot。');
    if (!current.activeShotIds.includes(targetShotIds[0]!)) throw new Error('被重生的场景图已不在当前显示组。');
  }
  return storySceneDisplayStateSchema.parse({
    ...current,
    pendingReplacement: {
      scenePlanId,
      operation,
      shotIds: unique(shotIds),
      targetShotIds: unique(targetShotIds)
    },
    updatedAt
  });
}

export function resolveSceneReplacement(input: {
  current: StorySceneDisplayState;
  succeededShotIds: string[];
  allTasksTerminal: boolean;
  updatedAt: string;
}): StorySceneDisplayState {
  const pending = input.current.pendingReplacement;
  if (!pending) throw new Error('当前没有待决的场景替换计划。');
  const pendingIds = new Set(pending.shotIds);
  const succeeded = new Set(input.succeededShotIds.filter((shotId) => pendingIds.has(shotId)));
  const operation = pending.operation ?? 'replace-group';
  const targets = pending.targetShotIds ?? input.current.activeShotIds;
  const replacementReady = operation === 'replace-shot'
    ? succeeded.has(pending.shotIds[0]!)
    : pending.shotIds.every((shotId) => succeeded.has(shotId));
  if (replacementReady) {
    const activeShotIds = operation === 'replace-shot'
      ? input.current.activeShotIds.map((shotId) => shotId === targets[0] ? pending.shotIds[0]! : shotId)
      : pending.shotIds;
    return storySceneDisplayStateSchema.parse({
      ...input.current,
      activeShotIds,
      pendingReplacement: undefined,
      updatedAt: input.updatedAt
    });
  }
  if (input.allTasksTerminal) {
    return storySceneDisplayStateSchema.parse({
      ...input.current,
      pendingReplacement: undefined,
      updatedAt: input.updatedAt
    });
  }
  return storySceneDisplayStateSchema.parse(input.current);
}
