import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  BUILT_IN_COMFY_STYLE_RECIPES
} from '../../domain/imageGeneration/comfyStyleRecipes';
import {
  BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS,
  BUILT_IN_IMAGE_STYLE_PRESETS
} from '../../domain/imageGeneration/promptConversion';
import { ComfyStyleRecipeLibraryEditor } from './ComfyStyleRecipeLibraryEditor';

describe('ComfyStyleRecipeLibraryEditor', () => {
  it('opens every recipe field to players and duplicates built-ins as custom recipes', () => {
    const onChange = vi.fn();
    render(<ComfyStyleRecipeLibraryEditor
      recipes={[...structuredClone(BUILT_IN_COMFY_STYLE_RECIPES)]}
      stylePresets={BUILT_IN_IMAGE_STYLE_PRESETS}
      dialectPresets={BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS}
      onChange={onChange}
    />);

    expect(screen.getByText('8 套')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '提示词风格与 ComfyUI 配方边界' }))
      .toHaveTextContent('checkpoint／LoRA');
    const odaDetails = screen.getByText(/织田 non 成熟绘风 · 内置/).closest('details');
    if (!odaDetails) throw new Error('missing Oda recipe details');
    fireEvent.click(within(odaDetails).getByText(/织田 non 成熟绘风 · 内置/));
    expect(within(odaDetails).getAllByDisplayValue('0.6')).toHaveLength(2);
    fireEvent.click(within(odaDetails).getByRole('button', { name: '复制为自定义' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          origin: 'custom',
          name: '织田 non 成熟绘风（副本）'
        })
      ]),
      expect.stringContaining('复制')
    );
  });
});
