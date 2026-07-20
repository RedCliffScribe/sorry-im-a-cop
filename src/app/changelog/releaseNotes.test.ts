import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHANGELOG_STORAGE_KEY,
  formatLocalDateKey,
  recordDailyChangelogView,
  releaseNotes,
  shouldShowDailyChangelog
} from './releaseNotes';

describe('releaseNotes', () => {
  beforeEach(() => localStorage.clear());

  it('starts the public release with one formal launch entry', () => {
    expect(releaseNotes).toHaveLength(1);
    expect(releaseNotes[0].id).toBe('2026-07-20-v1.0.0');
    expect(releaseNotes[0].title).toBe('简体中文 v1.0.0 正式上线');
    expect(releaseNotes.every((entry) => entry.items.length > 0)).toBe(true);
  });

  it('shows once per local day and shows again when the latest entry changes', () => {
    const today = new Date(2026, 6, 20, 9, 0, 0);
    expect(formatLocalDateKey(today)).toBe('2026-07-20');
    expect(shouldShowDailyChangelog(localStorage, today)).toBe(true);

    recordDailyChangelogView(localStorage, today);
    expect(shouldShowDailyChangelog(localStorage, new Date(2026, 6, 20, 23, 59, 0))).toBe(false);
    expect(shouldShowDailyChangelog(localStorage, new Date(2026, 6, 21, 0, 1, 0))).toBe(true);

    const record = JSON.parse(localStorage.getItem(CHANGELOG_STORAGE_KEY) ?? '{}');
    record.latestEntryId = 'older-entry';
    localStorage.setItem(CHANGELOG_STORAGE_KEY, JSON.stringify(record));
    expect(shouldShowDailyChangelog(localStorage, today)).toBe(true);
  });

  it('fails open when the stored record is malformed', () => {
    localStorage.setItem(CHANGELOG_STORAGE_KEY, '{bad-json');
    expect(shouldShowDailyChangelog(localStorage, new Date(2026, 6, 20))).toBe(true);
  });
});
