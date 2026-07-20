export function stableBackgroundIdFragment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized.slice(0, 96) || 'unknown';
}

export function backgroundTrackMemoryPrefix(trackId: string): string {
  return `memory_bg_${stableBackgroundIdFragment(trackId)}_`;
}

export function stableBackgroundMemoryId(trackId: string, transition: string, reviewKey: string): string {
  return `${backgroundTrackMemoryPrefix(trackId)}${stableBackgroundIdFragment(transition)}_${stableBackgroundIdFragment(reviewKey)}`;
}

export function stableBackgroundActivityId(trackId: string, transition: string, reviewKey: string): string {
  return `case_activity_bg_${stableBackgroundIdFragment(trackId)}_${stableBackgroundIdFragment(transition)}_${stableBackgroundIdFragment(reviewKey)}`;
}

export function stableBackgroundOutcomeId(trackId: string, reviewKey: string): string {
  return `outcome_bg_${stableBackgroundIdFragment(trackId)}_${stableBackgroundIdFragment(reviewKey)}`;
}
