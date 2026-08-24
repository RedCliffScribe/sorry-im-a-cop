import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modalComponentFiles = [
  'AssetArchiveModal.tsx',
  'CaseArchiveModal.tsx',
  'CharacterArchiveModal.tsx',
  'CombatArchiveModal.tsx',
  'DiagnosticExportModal.tsx',
  'DynamicMattersPanelModal.tsx',
  'FinanceArchiveModal.tsx',
  'GrayNetworkPanelModal.tsx',
  'MapArchiveModal.tsx',
  'MemoryArchiveModal.tsx',
  'NewsPaperModal.tsx',
  'PlayerDossierModal.tsx',
  'PolicePanelModal.tsx',
  'RelationshipThreadPanelModal.tsx',
  'ReputationArchiveModal.tsx',
  'SaveManagerModal.tsx',
  'SocialInstitutionPanelModal.tsx'
];

describe('功能面板稳定框架', () => {
  it.each(modalComponentFiles)('%s 的每个对话框都使用统一稳定框架', (fileName) => {
    const source = readFileSync(`src/app/components/${fileName}`, 'utf8');
    const dialogOpeningTags = source.match(/<section\b[^>]*\brole="dialog"/gs) ?? [];

    expect(dialogOpeningTags.length).toBeGreaterThan(0);
    for (const openingTag of dialogOpeningTags) {
      expect(openingTag).toContain('feature-modal-frame');
    }
  });

  it('公共样式固定外框高度并把内容变化交给内部滚动区', () => {
    const css = readFileSync('src/styles/global.css', 'utf8');
    const frameRule = css.match(/\.feature-modal-frame\s*\{([\s\S]*?)\}/)?.[1] ?? '';

    expect(frameRule).toContain('--feature-modal-height: 820px');
    expect(frameRule).toContain('height: min(');
    expect(frameRule).toContain('min-height: 0');
    expect(frameRule).toContain('max-height: none');
    expect(frameRule).toContain('overflow: hidden');
    expect(css).toContain('.feature-modal-frame--utility');
    expect(css).toContain('.feature-modal-frame--detail');
    expect(css).toContain('scrollbar-gutter: stable');
  });
});
