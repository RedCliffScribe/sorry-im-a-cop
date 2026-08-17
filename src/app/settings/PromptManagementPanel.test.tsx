import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import { PromptManagementPanel } from './PromptManagementPanel';

describe('PromptManagementPanel', () => {
  it('shows categorized prompt templates and edits an override', () => {
    const settings = createDefaultAiSettings();
    const onChange = vi.fn();

    render(<PromptManagementPanel settings={settings} onChange={onChange} />);

    expect(screen.getByText('提示词管理')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /正文/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /辅助生成/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /记忆/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /写回修复/ })).toBeInTheDocument();
    expect((screen.getByLabelText('提示词正文') as HTMLTextAreaElement).value).toContain('正文风格与显示格式');

    fireEvent.change(screen.getByLabelText('提示词正文'), { target: { value: 'CUSTOM_PROMPT_TEXT' } });

    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      prompts: {
        ...settings.prompts,
        overrides: {
          'narrative.styleAndDisplay': 'CUSTOM_PROMPT_TEXT'
        }
      }
    });
  });

  it('resets all prompt overrides to defaults', () => {
    const settings = {
      ...createDefaultAiSettings(),
      prompts: {
        overrides: {
          'narrative.styleAndDisplay': 'CUSTOM_PROMPT_TEXT'
        }
      }
    };
    const onChange = vi.fn();

    render(<PromptManagementPanel settings={settings} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '全部重置为默认' }));

    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      prompts: {
        ...settings.prompts,
        overrides: {}
      }
    });
  });

});
