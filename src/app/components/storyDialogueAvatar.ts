import type { CharacterVisualPurpose } from '../../domain/imageGeneration/promptConversion';
import type {
  VisualAsset,
  VisualRepositorySnapshot
} from '../../domain/imageGeneration/visualRepository';

export const DIALOGUE_AVATAR_FALLBACK_ORDER: CharacterVisualPurpose[] = [
  'avatar-close-up',
  'half-body-medium',
  'knee-up-medium-full',
  'full-body'
];

export function findActorDialogueAvatarAsset(
  snapshot: VisualRepositorySnapshot,
  actorId: string,
  actorIdAliases?: Record<string, string>
): VisualAsset | undefined {
  const canonicalActorId = (candidate: string): string => {
    const visited = new Set<string>();
    let current = candidate;
    while (actorIdAliases?.[current] && !visited.has(current)) {
      visited.add(current);
      current = actorIdAliases[current];
    }
    return current;
  };
  for (const purpose of DIALOGUE_AVATAR_FALLBACK_ORDER) {
    const binding = Object.values(snapshot.bindings).find((candidate) =>
      candidate.subject.type === 'actor' &&
      canonicalActorId(candidate.subject.actorId) === actorId &&
      candidate.purpose === purpose
    );
    const asset = binding ? snapshot.assets[binding.imageId] : undefined;
    if (asset) return asset;
  }
  return undefined;
}
