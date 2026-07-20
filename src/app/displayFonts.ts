import type { DisplayFontFamilyId } from '../domain/settings/types';

export interface DisplayFontOption {
  id: DisplayFontFamilyId;
  label: string;
  description: string;
}

export const displayFontOptions: DisplayFontOption[] = [
  {
    id: 'readable',
    label: '系统易读',
    description: '优先使用正黑、雅黑或苹方，适合长时间阅读界面。'
  },
  {
    id: 'serif',
    label: '现代衬线',
    description: '优先使用 Noto Serif，保留书卷感但比传统档案体更舒展。'
  },
  {
    id: 'system',
    label: '时代档案体',
    description: '沿用原有宋体与明体组合，正式感最强。'
  },
  {
    id: 'ming',
    label: '港式明体',
    description: '接近繁体报刊与旧式印刷品的字面气质。'
  },
  {
    id: 'song',
    label: '宋体',
    description: '使用经典宋体，笔画清晰、排版紧凑。'
  },
  {
    id: 'fangsong',
    label: '仿宋',
    description: '适合公文、记录和较轻的时代书写感。'
  },
  {
    id: 'kai',
    label: '楷体',
    description: '手写感最明显，适合短段落，不建议长时间阅读界面。'
  },
  {
    id: 'mono',
    label: '等宽',
    description: '适合数据、终端和冷静的记录感。'
  }
];

const displayFontStacks: Record<DisplayFontFamilyId, string> = {
  readable: '"Microsoft JhengHei", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif',
  serif: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif',
  system: 'var(--font-document)',
  ming: '"PMingLiU", "MingLiU", "MingLiU_HKSCS", "Noto Serif TC", serif',
  song: 'SimSun, "STSong", "Songti SC", serif',
  fangsong: 'FangSong, "STFangsong", serif',
  kai: 'KaiTi, "STKaiti", "Kaiti SC", serif',
  mono: '"Cascadia Mono", Consolas, "Microsoft JhengHei", "Microsoft YaHei", monospace'
};

export function getDisplayFontStack(
  fontFamily: DisplayFontFamilyId | undefined,
  fallback: DisplayFontFamilyId = 'readable'
): string {
  return displayFontStacks[fontFamily ?? fallback] ?? displayFontStacks[fallback];
}

export function getDisplayFontOption(fontFamily: DisplayFontFamilyId | undefined): DisplayFontOption {
  return displayFontOptions.find((option) => option.id === fontFamily) ?? displayFontOptions[0];
}
