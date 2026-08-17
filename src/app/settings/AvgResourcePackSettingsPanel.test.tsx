import { fireEvent, render, screen } from '@testing-library/react';
import type { AvgResourcePackManagerApi } from '../../domain/avgResourcePack';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import { AvgResourcePackSettingsPanel } from './AvgResourcePackSettingsPanel';

function managerStub(): AvgResourcePackManagerApi {
  return {
    list: vi.fn(async () => []),
    getSelection: vi.fn(async () => undefined),
    install: vi.fn(),
    uninstall: vi.fn(async () => undefined),
    selectBase: vi.fn(async () => undefined)
  } as AvgResourcePackManagerApi;
}

describe('AvgResourcePackSettingsPanel', () => {
  it('stores the player portrait switch as an explicit presentation mode', async () => {
    const displaySettings = createDefaultAiSettings().display;
    const onDisplaySettingsChange = vi.fn();
    const view = render(
      <AvgResourcePackSettingsPanel
        manager={managerStub()}
        displaySettings={displaySettings}
        onDisplaySettingsChange={onDisplaySettingsChange}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: /正文演出显示主角立绘/ });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(onDisplaySettingsChange).toHaveBeenCalledWith({
      ...displaySettings,
      avgPlayerPortraitMode: 'show'
    });

    view.rerender(
      <AvgResourcePackSettingsPanel
        manager={managerStub()}
        displaySettings={{ ...displaySettings, avgPlayerPortraitMode: 'show' }}
        onDisplaySettingsChange={onDisplaySettingsChange}
      />
    );
    expect(screen.getByRole('checkbox', { name: /正文演出显示主角立绘/ })).toBeChecked();
  });
});
