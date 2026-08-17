import { createVisualBindingId } from './IndexedDbVisualRepository';
import type {
  PortableVisualBlob,
  VisualArchiveData,
  VisualRepositorySnapshot,
  VisualSubjectRef
} from './types';

function rebaseSubject(subject: VisualSubjectRef, saveId: string): VisualSubjectRef {
  return { ...subject, saveId };
}

export function rebaseVisualArchiveSaveId(data: VisualArchiveData, nextSaveId: string): VisualArchiveData {
  if (!nextSaveId.trim()) throw new Error('导入视觉资料需要有效的新存档 ID。');
  const source = data.snapshot;
  const blobKeys = new Map<string, string>();
  const assets = Object.fromEntries(Object.values(source.assets).map((asset) => {
    const blobKey = `${encodeURIComponent(nextSaveId)}:${asset.blobKey}`;
    blobKeys.set(asset.blobKey, blobKey);
    return [asset.imageId, {
      ...asset,
      ...(asset.scope === 'save' ? { saveId: nextSaveId } : {}),
      blobKey,
      ...(asset.originSubject ? { originSubject: rebaseSubject(asset.originSubject, nextSaveId) } : {})
    }];
  }));
  const bindings = Object.fromEntries(Object.values(source.bindings).map((binding) => {
    const subject = rebaseSubject(binding.subject, nextSaveId);
    const bindingId = createVisualBindingId(nextSaveId, subject, binding.purpose, binding.variantKey);
    return [bindingId, { ...binding, bindingId, saveId: nextSaveId, subject }];
  }));
  const snapshot: VisualRepositorySnapshot = {
    ...source,
    saveId: nextSaveId,
    characterAnchors: Object.fromEntries(Object.entries(source.characterAnchors).map(([id, value]) => [id, { ...value, saveId: nextSaveId }])),
    scenePlans: Object.fromEntries(Object.entries(source.scenePlans).map(([id, value]) => [id, { ...value, saveId: nextSaveId }])),
    tasks: Object.fromEntries(Object.entries(source.tasks).map(([id, task]) => [id, {
      ...task,
      saveId: nextSaveId,
      intent: { ...task.intent, saveId: nextSaveId }
    }])),
    characterBatches: Object.fromEntries(Object.entries(source.characterBatches).map(([id, value]) => [id, { ...value, saveId: nextSaveId }])),
    assets,
    bindings,
    storySceneDisplayStates: Object.fromEntries(Object.entries(source.storySceneDisplayStates).map(([id, value]) => [id, { ...value, saveId: nextSaveId }]))
  };
  const blobs: PortableVisualBlob[] = data.blobs.map((blob) => {
    const blobKey = blobKeys.get(blob.blobKey);
    if (!blobKey) throw new Error(`视觉 Blob 没有对应图片元数据：${blob.imageId}`);
    return { ...blob, blobKey };
  });
  return { snapshot, blobs };
}
