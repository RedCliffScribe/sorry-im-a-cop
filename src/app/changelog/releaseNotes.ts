import { APP_VERSION_LABEL } from '../releaseIdentity';

export interface ReleaseNoteEntry {
  id: string;
  date: string;
  title: string;
  summary: string;
  items: readonly string[];
}

export const CHANGELOG_STORAGE_KEY = 'sorry-im-a-cop-v2-changelog-daily-view';

export const releaseNotes: readonly ReleaseNoteEntry[] = [
  {
    id: '2026-07-20-v1.0.0',
    date: '2026年7月20日',
    title: `简体中文 ${APP_VERSION_LABEL} 正式上线`,
    summary: '《对唔住，我系差人》首个简体中文正式版本现已上线，欢迎进入属于你的港岛人生。',
    items: [
      '支持警察、社团与普通市民三种起源；身份转换与卧底路线按公开身份切换主界面。',
      '主剧情、NPC 记忆、案件、关系、新闻、城市局势与重要组织可随游戏时间持续演化。',
      '首页固定为夜港视觉；开局、设置、游戏与功能面板提供深色和明快主题，并针对桌面、平板与手机重排主要工作区。',
      '提供首次使用引导、API 模型能力建议、叙事人称选择、本地存档及 ZIP 导入导出。',
      '动态剧情与存档保存在玩家本地；法律声明可从首页随时查阅。',
      `当前版本：${APP_VERSION_LABEL} · 简体中文。`
    ]
  }
] as const;

interface ChangelogDailyViewRecord {
  localDate: string;
  latestEntryId: string;
}

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function formatLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shouldShowDailyChangelog(storage?: Storage, now = new Date()): boolean {
  const latestEntryId = releaseNotes[0]?.id;
  if (!latestEntryId) return false;

  try {
    const raw = resolveStorage(storage)?.getItem(CHANGELOG_STORAGE_KEY);
    if (!raw) return true;
    const record = JSON.parse(raw) as Partial<ChangelogDailyViewRecord>;
    return record.localDate !== formatLocalDateKey(now) || record.latestEntryId !== latestEntryId;
  } catch {
    return true;
  }
}

export function recordDailyChangelogView(storage?: Storage, now = new Date()): void {
  const latestEntryId = releaseNotes[0]?.id;
  if (!latestEntryId) return;

  try {
    resolveStorage(storage)?.setItem(
      CHANGELOG_STORAGE_KEY,
      JSON.stringify({
        localDate: formatLocalDateKey(now),
        latestEntryId
      } satisfies ChangelogDailyViewRecord)
    );
  } catch {
    // A blocked localStorage only means the notice may be offered again later.
  }
}
