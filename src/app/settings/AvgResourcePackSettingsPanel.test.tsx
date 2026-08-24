import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('previews portrait layout edits before explicitly saving them', async () => {
    const displaySettings = createDefaultAiSettings().display;
    const onDisplaySettingsChange = vi.fn();
    render(
      <AvgResourcePackSettingsPanel
        manager={managerStub()}
        displaySettings={displaySettings}
        onDisplaySettingsChange={onDisplaySettingsChange}
      />
    );

    const preview = screen.getByTestId('avg-layout-preview-stage');
    expect(preview.style.getPropertyValue('--avg-portrait-user-scale')).toBe('1');
    fireEvent.change(screen.getByRole('slider', { name: '立绘大小' }), {
      target: { value: '135' }
    });
    fireEvent.change(screen.getByRole('slider', { name: '立绘左右位置' }), {
      target: { value: '-12' }
    });
    fireEvent.change(screen.getByRole('slider', { name: '立绘上下位置' }), {
      target: { value: '8' }
    });

    expect(preview.style.getPropertyValue('--avg-portrait-user-scale')).toBe('1.35');
    expect(preview.style.getPropertyValue('--avg-portrait-user-offset-x')).toBe('-12%');
    expect(preview.style.getPropertyValue('--avg-portrait-user-offset-y')).toBe('8%');
    expect(onDisplaySettingsChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '保存立绘布局' }));
    await waitFor(() => expect(onDisplaySettingsChange).toHaveBeenCalledWith({
      ...displaySettings,
      avgPortraitLayout: {
        scalePercent: 135,
        horizontalOffsetPercent: -12,
        verticalOffsetPercent: 8
      }
    }));
    expect(screen.getByText('立绘大小与位置已保存。')).toBeInTheDocument();
  });
});
