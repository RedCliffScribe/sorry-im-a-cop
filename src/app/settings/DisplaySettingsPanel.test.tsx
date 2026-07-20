import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import { DisplaySettingsPanel } from './DisplaySettingsPanel';

describe('DisplaySettingsPanel', () => {
  it('edits theme, interface, narration and dialogue settings independently', () => {
    const settings = createDefaultAiSettings();
    const onChange = vi.fn();

    render(<DisplaySettingsPanel settings={settings} onChange={onChange} />);

    expect(screen.getByLabelText('界面主题')).toHaveValue('dark');
    expect(screen.getByLabelText('界面字体')).toHaveValue('readable');
    expect(screen.getAllByRole('option', { name: '现代衬线' })).toHaveLength(3);
    expect(screen.getAllByRole('option', { name: '港式明体' })).toHaveLength(3);
    expect(screen.getAllByRole('option', { name: '仿宋' })).toHaveLength(3);

    fireEvent.change(screen.getByLabelText('界面主题'), { target: { value: 'light' } });
    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      display: {
        ...settings.display,
        uiTheme: 'light'
      }
    });

    fireEvent.change(screen.getByLabelText('界面字体'), { target: { value: 'serif' } });
    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      display: {
        ...settings.display,
        interfaceFontFamily: 'serif'
      }
    });

    fireEvent.change(screen.getByLabelText('旁白字体'), { target: { value: 'serif' } });
    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      display: {
        ...settings.display,
        narrationFontFamily: 'serif'
      }
    });

    fireEvent.change(screen.getByLabelText('对白字号'), { target: { value: '20' } });
    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      display: {
        ...settings.display,
        dialogueFontSize: 20
      }
    });
  });
});
