import type { GameTime, RuntimeState, StoryEntry } from '../runtime/types';

export type StoryExportRange = 'currentChapter' | 'currentSave' | 'fromOpening';
export type StoryExportFormat = 'markdown' | 'text' | 'html';

export interface StoryExportOptions {
  range: StoryExportRange;
  format: StoryExportFormat;
  includeTimeLocation: boolean;
  includeCharacterNames: boolean;
  includeChapterSeparators: boolean;
  includePlayerActions: boolean;
}

export interface StoryExportArtifact {
  content: string;
  fileName: string;
  mimeType: string;
  entryCount: number;
}

interface PublicStoryEntry {
  speaker: StoryEntry['speaker'];
  text: string;
  gameTime: GameTime;
  turnNumber: number | null;
  isOpening: boolean;
}

interface StoryExportSection {
  key: string;
  label: string;
  time: GameTime;
  entries: PublicStoryEntry[];
}

const RANGE_LABELS: Record<StoryExportRange, string> = {
  currentChapter: '当前章节',
  currentSave: '当前存档全部正文',
  fromOpening: '从开局至今'
};

const FORMAT_META: Record<StoryExportFormat, { extension: string; mimeType: string }> = {
  markdown: { extension: 'md', mimeType: 'text/markdown;charset=utf-8' },
  text: { extension: 'txt', mimeType: 'text/plain;charset=utf-8' },
  html: { extension: 'html', mimeType: 'text/html;charset=utf-8' }
};

function cloneGameTime(time: GameTime): GameTime {
  return { ...time };
}

function extractTurnNumber(turnId: string): number | null {
  const match = /^(?:turn|player)_(\d+)$/.exec(turnId);
  return match ? Number(match[1]) : null;
}

function toPublicEntry(entry: StoryEntry): PublicStoryEntry {
  const turnNumber = extractTurnNumber(entry.turnId);
  return {
    speaker: entry.speaker,
    text: entry.text.trim(),
    gameTime: cloneGameTime(entry.gameTime),
    turnNumber,
    isOpening: entry.turnId === 'turn_0'
  };
}

function selectVisibleEntries(state: RuntimeState, range: StoryExportRange): PublicStoryEntry[] {
  const visibleEntries = state.storyLog
    .filter((entry) => entry.text.trim().length > 0)
    .map(toPublicEntry);

  if (range !== 'currentChapter' || visibleEntries.length === 0) {
    return visibleEntries;
  }

  let latestNarratorIndex = -1;
  for (let index = visibleEntries.length - 1; index >= 0; index -= 1) {
    if (visibleEntries[index].speaker === 'narrator') {
      latestNarratorIndex = index;
      break;
    }
  }
  const anchorIndex = latestNarratorIndex >= 0 ? latestNarratorIndex : visibleEntries.length - 1;
  const anchor = visibleEntries[anchorIndex];

  if (anchor.turnNumber === null) {
    return [anchor];
  }

  return visibleEntries.filter((entry) => entry.turnNumber === anchor.turnNumber);
}

function createSections(entries: PublicStoryEntry[]): StoryExportSection[] {
  const sections: StoryExportSection[] = [];
  const sectionByKey = new Map<string, StoryExportSection>();

  entries.forEach((entry, index) => {
    const key = entry.turnNumber === null ? `segment-${index}` : `turn-${entry.turnNumber}`;
    let section = sectionByKey.get(key);
    if (!section) {
      const fallbackNumber = sections.length + 1;
      section = {
        key,
        label: entry.isOpening
          ? '开场'
          : entry.turnNumber === null
            ? `剧情片段 ${fallbackNumber}`
            : `第 ${entry.turnNumber} 回合`,
        time: cloneGameTime(entry.gameTime),
        entries: []
      };
      sectionByKey.set(key, section);
      sections.push(section);
    }
    section.entries.push(entry);
    if (entry.speaker === 'narrator') {
      section.time = cloneGameTime(entry.gameTime);
    }
  });

  return sections;
}

function formatGameTime(time: GameTime): string {
  return `${time.year}年${String(time.month).padStart(2, '0')}月${String(time.day).padStart(2, '0')}日 ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function formatCurrentLocation(state: RuntimeState): string {
  const place = state.places[state.location.currentPlaceId];
  const scene = state.location.currentSceneId ? state.scenes[state.location.currentSceneId] : undefined;
  return [place?.name, scene?.name].filter(Boolean).join(' · ') || '未知地点';
}

function parseTaggedLine(line: string): { speaker: string | null; body: string } {
  const match = /^【([^】]+)】\s*(.*)$/.exec(line.trim());
  return match ? { speaker: match[1], body: match[2] || '' } : { speaker: null, body: line };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeMarkdownInline(value: string): string {
  return value.replaceAll('\\', '\\\\').replace(/([*_`[\]])/g, '\\$1').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function formatNarrativeMarkdown(text: string, includeCharacterNames: boolean): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) return '';
      const tagged = parseTaggedLine(line);
      const body = tagged.body.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      if (!includeCharacterNames || !tagged.speaker) return body;
      return `**${escapeMarkdownInline(tagged.speaker)}：** ${body}`;
    })
    .join('\n');
}

function formatNarrativeText(text: string, includeCharacterNames: boolean): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) return '';
      const tagged = parseTaggedLine(line);
      if (!includeCharacterNames || !tagged.speaker) return tagged.body;
      return `${tagged.speaker}：${tagged.body}`;
    })
    .join('\n');
}

function formatNarrativeHtml(text: string, includeCharacterNames: boolean): string {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const tagged = parseTaggedLine(line);
      const speaker = includeCharacterNames && tagged.speaker
        ? `<strong class="speaker">${escapeHtml(tagged.speaker)}：</strong>`
        : '';
      return `<p>${speaker}${speaker ? ' ' : ''}${escapeHtml(tagged.body)}</p>`;
    })
    .join('\n');
}

function filterSectionEntries(section: StoryExportSection, options: StoryExportOptions): PublicStoryEntry[] {
  return section.entries.filter((entry) => options.includePlayerActions || entry.speaker !== 'player');
}

function renderMarkdown(state: RuntimeState, sections: StoryExportSection[], options: StoryExportOptions): string {
  const lines = [
    '# 对唔住，我系差人',
    '',
    '*Sorry, I\'m a Cop*',
    '',
    ...(options.includeCharacterNames ? [`角色：${escapeMarkdownInline(state.player.name)}`, ''] : []),
    `导出范围：${RANGE_LABELS[options.range]}`,
    ...(options.includeTimeLocation
      ? [
          `当前时间：${formatGameTime(state.time)}`,
          `导出时地点：${escapeMarkdownInline(formatCurrentLocation(state))}`
        ]
      : []),
    ''
  ];

  sections.forEach((section, sectionIndex) => {
    const entries = filterSectionEntries(section, options);
    if (!entries.length) return;
    if (options.includeChapterSeparators) {
      if (sectionIndex > 0) lines.push('---', '');
      lines.push(`## ${section.label}`, '');
    }
    if (options.includeTimeLocation) {
      lines.push(`时间：${formatGameTime(section.time)}`, '');
    }
    entries.forEach((entry) => {
      lines.push(entry.speaker === 'player' ? '### 玩家行动' : '### 剧情正文', '');
      lines.push(
        entry.speaker === 'narrator'
          ? formatNarrativeMarkdown(entry.text, options.includeCharacterNames)
          : entry.text.replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
        ''
      );
    });
  });

  return lines.join('\n').trimEnd() + '\n';
}

function renderText(state: RuntimeState, sections: StoryExportSection[], options: StoryExportOptions): string {
  const lines = [
    '对唔住，我系差人',
    'Sorry, I\'m a Cop',
    '',
    ...(options.includeCharacterNames ? [`角色：${state.player.name}`] : []),
    `导出范围：${RANGE_LABELS[options.range]}`,
    ...(options.includeTimeLocation
      ? [
          `当前时间：${formatGameTime(state.time)}`,
          `导出时地点：${formatCurrentLocation(state)}`
        ]
      : []),
    ''
  ];

  sections.forEach((section, sectionIndex) => {
    const entries = filterSectionEntries(section, options);
    if (!entries.length) return;
    if (options.includeChapterSeparators) {
      if (sectionIndex > 0) lines.push('----------------------------------------', '');
      lines.push(section.label, '');
    }
    if (options.includeTimeLocation) {
      lines.push(`时间：${formatGameTime(section.time)}`, '');
    }
    entries.forEach((entry) => {
      lines.push(entry.speaker === 'player' ? '玩家行动' : '剧情正文');
      lines.push(
        entry.speaker === 'narrator'
          ? formatNarrativeText(entry.text, options.includeCharacterNames)
          : entry.text,
        ''
      );
    });
  });

  return lines.join('\n').trimEnd() + '\n';
}

function renderHtml(state: RuntimeState, sections: StoryExportSection[], options: StoryExportOptions): string {
  const sectionHtml = sections
    .map((section) => {
      const entries = filterSectionEntries(section, options);
      if (!entries.length) return '';
      const bodies = entries
        .map((entry) => {
          if (entry.speaker === 'player') {
            return `<div class="entry player-action"><h3>玩家行动</h3><p>${escapeHtml(entry.text)}</p></div>`;
          }
          return `<div class="entry narrative"><h3>剧情正文</h3>${formatNarrativeHtml(entry.text, options.includeCharacterNames)}</div>`;
        })
        .join('\n');
      return `<section class="story-section${options.includeChapterSeparators ? ' with-separator' : ''}">
        ${options.includeChapterSeparators ? `<h2>${escapeHtml(section.label)}</h2>` : ''}
        ${options.includeTimeLocation ? `<p class="time">时间：${escapeHtml(formatGameTime(section.time))}</p>` : ''}
        ${bodies}
      </section>`;
    })
    .filter(Boolean)
    .join('\n');

  return `<!doctype html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>对唔住，我系差人 - 剧情导出</title>
  <style>
    :root { color-scheme: light; font-family: "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", serif; }
    body { margin: 0; color: #28231d; background: #e8dfca; line-height: 1.8; }
    main { width: min(860px, calc(100% - 32px)); margin: 32px auto; padding: 40px; box-sizing: border-box; background: #fffaf0; box-shadow: 0 18px 60px rgba(49, 38, 20, .16); }
    h1, h2, h3 { color: #4b3514; }
    h1 { margin-bottom: 0; letter-spacing: .08em; }
    .english { margin-top: 0; color: #79694f; font-style: italic; }
    .meta { padding: 14px 18px; border-left: 3px solid #a3772f; background: #f4ead3; }
    .meta p, .time { margin: .2em 0; }
    .story-section { padding: 18px 0; }
    .story-section.with-separator + .story-section.with-separator { border-top: 1px solid #b9a98b; }
    .entry { margin: 18px 0; }
    .entry h3 { margin-bottom: 8px; font-size: 1rem; }
    .entry p { margin: .65em 0; white-space: pre-wrap; }
    .player-action { padding: 12px 16px; border-left: 3px solid #3d7581; background: #edf3f2; }
    .speaker { color: #7b5016; }
    @media (max-width: 600px) { main { margin: 0; width: 100%; padding: 24px 18px; box-shadow: none; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>对唔住，我系差人</h1>
      <p class="english">Sorry, I'm a Cop</p>
      <div class="meta">
        ${options.includeCharacterNames ? `<p>角色：${escapeHtml(state.player.name)}</p>` : ''}
        <p>导出范围：${escapeHtml(RANGE_LABELS[options.range])}</p>
        ${options.includeTimeLocation ? `<p>当前时间：${escapeHtml(formatGameTime(state.time))}</p><p>导出时地点：${escapeHtml(formatCurrentLocation(state))}</p>` : ''}
      </div>
    </header>
    ${sectionHtml}
  </main>
</body>
</html>
`;
}

function sanitizeFileComponent(value: string): string {
  const withoutForbiddenCharacters = value.trim().replace(/[<>:"/\\|?*]/g, '');
  return [...withoutForbiddenCharacters]
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, '_')
    .slice(0, 48) || '玩家';
}

function formatLocalDateStamp(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function countStoryExportEntries(state: RuntimeState, options: Pick<StoryExportOptions, 'range' | 'includePlayerActions'>): number {
  return selectVisibleEntries(state, options.range).filter(
    (entry) => options.includePlayerActions || entry.speaker !== 'player'
  ).length;
}

export function createStoryExport(
  state: RuntimeState,
  options: StoryExportOptions,
  exportedAt = new Date()
): StoryExportArtifact {
  const entries = selectVisibleEntries(state, options.range);
  const sections = createSections(entries);
  const meta = FORMAT_META[options.format];
  const dateStamp = formatLocalDateStamp(exportedAt);
  const fileName = `对唔住我系差人_${sanitizeFileComponent(state.player.name)}_${RANGE_LABELS[options.range]}_${dateStamp}.${meta.extension}`;
  const content = options.format === 'markdown'
    ? renderMarkdown(state, sections, options)
    : options.format === 'text'
      ? renderText(state, sections, options)
      : renderHtml(state, sections, options);

  return {
    content,
    fileName,
    mimeType: meta.mimeType,
    entryCount: entries.filter((entry) => options.includePlayerActions || entry.speaker !== 'player').length
  };
}
