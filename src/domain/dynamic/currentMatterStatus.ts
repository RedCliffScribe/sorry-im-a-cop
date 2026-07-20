import type { CurrentMatter } from '../runtime/types';

type MatterStatusFields = Pick<CurrentMatter, 'status' | 'title' | 'summary' | 'currentHook' | 'consequenceHint'>;
type MatterTextFields = Pick<CurrentMatter, 'title' | 'summary' | 'currentHook' | 'consequenceHint'>;

const explicitTerminalTitlePattern = /[（(](?:已完成|已平息|已瓦解|已解决|已结束)[）)]$/;

export function hasTerminalCurrentMatterOutcome(matter: MatterTextFields): boolean {
  return explicitTerminalTitlePattern.test(matter.title.trim());
}

export function isArchivedCurrentMatter(matter: MatterStatusFields): boolean {
  if (matter.status === 'resolved' || matter.status === 'archived') return true;
  return matter.status === 'dormant' && hasTerminalCurrentMatterOutcome(matter);
}

export function normalizeCurrentMatterStatus(matter: MatterStatusFields): CurrentMatter['status'] {
  if (matter.status === 'dormant' && hasTerminalCurrentMatterOutcome(matter)) return 'resolved';
  return matter.status;
}

export const displayCurrentMatterStatus = normalizeCurrentMatterStatus;
