import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import { SettingsScreen } from './SettingsScreen';

describe('SettingsScreen image generation destination', () => {
  it('opens the frozen text-to-image settings path directly and keeps it in the main settings navigation', () => {
    render(
      <SettingsScreen
        initialDestination="imageGeneration"
        settings={createDefaultAiSettings()}
        saves={[]}
        onSettingsChange={vi.fn()}
        onRuntimeDramaticContentChange={vi.fn()}
        onRuntimeCantoneseFlavorChange={vi.fn()}
        onClearData={vi.fn(async () => undefined)}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: '文生图设置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '文生图设置' })).toHaveClass('active');

    fireEvent.click(screen.getByRole('button', { name: 'API 配置' }));
    expect(screen.getByRole('heading', { name: 'API 配置' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '文生图设置' }));
    expect(screen.getByRole('heading', { name: '当前图片档案' })).toBeInTheDocument();
  });
});

describe('SettingsScreen AVG resource destination', () => {
  it('exposes the independent AVG resource-pack settings page', async () => {
    render(
      <SettingsScreen
        initialDestination="avgResources"
        settings={createDefaultAiSettings()}
        saves={[]}
        onSettingsChange={vi.fn()}
        onRuntimeDramaticContentChange={vi.fn()}
        onRuntimeCantoneseFlavorChange={vi.fn()}
        onClearData={vi.fn(async () => undefined)}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'AVG 演出设置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AVG 演出设置' })).toHaveClass('active');
    expect(await screen.findByText('未安装')).toBeInTheDocument();
    expect(screen.getByText(/存档、玩家图片和剧情 DLC 分开保存/u)).toBeInTheDocument();
  });
});

describe('SettingsScreen viewport layout', () => {
  it('constrains the desktop grid row and gives the long sidebar its own scroll area', () => {
    const css = readFileSync('src/styles/global.css', 'utf8');
    const settingsScreenRules = [...css.matchAll(/\.settings-screen\s*\{([\s\S]*?)\}/g)].map(
      (match) => match[1]
    );
    const settingsSidebarRules = [...css.matchAll(/\.settings-sidebar\s*\{([\s\S]*?)\}/g)].map(
      (match) => match[1]
    );
    const settingsNavRules = [...css.matchAll(/\.settings-sidebar nav\s*\{([\s\S]*?)\}/g)].map(
      (match) => match[1]
    );

    const desktopScreenRule =
      settingsScreenRules.find((rule) => rule.includes('grid-template-columns: 280px')) ?? '';
    const desktopSidebarRule =
      settingsSidebarRules.find((rule) => rule.includes('grid-template-rows: auto minmax')) ?? '';
    const desktopNavRule = settingsNavRules.find((rule) => rule.includes('overflow-y: auto')) ?? '';
    const mobileScreenRule =
      settingsScreenRules.find((rule) => rule.includes('min-height: calc(100svh')) ?? '';
    const mobileSidebarRule =
      settingsSidebarRules.find((rule) => rule.includes('grid-template-rows: auto auto auto')) ?? '';
    const mobileNavRule = settingsNavRules.find((rule) => rule.includes('overflow: visible')) ?? '';

    expect(desktopScreenRule).toContain('grid-template-rows: minmax(0, 1fr)');
    expect(desktopSidebarRule).toContain('min-height: 0');
    expect(desktopNavRule).toContain('min-height: 0');
    expect(desktopNavRule).toContain('overscroll-behavior: contain');
    expect(mobileScreenRule).toContain('grid-template-rows: auto');
    expect(mobileSidebarRule).toContain('min-height: auto');
    expect(mobileNavRule).toContain('padding-right: 0');
  });
});
