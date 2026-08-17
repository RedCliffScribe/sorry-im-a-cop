import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import { HomeScreen } from './HomeScreen';

describe('HomeScreen custom content entry', () => {
  it('opens the official DLC catalog without entering the new-game flow', () => {
    const onOfficialDlc = vi.fn();
    const onStart = vi.fn();
    render(
      <HomeScreen
        settings={createDefaultAiSettings()}
        isSettingsLoaded={false}
        onStart={onStart}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onLanguageChange={vi.fn()}
        onOfficialDlc={onOfficialDlc}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'DLC剧情' }));

    expect(onOfficialDlc).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('opens the dedicated workshop without entering the new-game flow', () => {
    const onCustomContent = vi.fn();
    const onStart = vi.fn();
    render(
      <HomeScreen
        settings={createDefaultAiSettings()}
        isSettingsLoaded={false}
        onStart={onStart}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onLanguageChange={vi.fn()}
        onCustomContent={onCustomContent}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '自定义内容' }));

    expect(onCustomContent).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('opens the independent creative workshop without entering settings or a new game', () => {
    const onCreativeWorkshop = vi.fn();
    const onSettings = vi.fn();
    const onStart = vi.fn();
    render(
      <HomeScreen
        settings={createDefaultAiSettings()}
        isSettingsLoaded={false}
        onStart={onStart}
        onLoad={vi.fn()}
        onSettings={onSettings}
        onLanguageChange={vi.fn()}
        onCreativeWorkshop={onCreativeWorkshop}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '创意工坊' }));

    expect(onCreativeWorkshop).toHaveBeenCalledTimes(1);
    expect(onSettings).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });
});
