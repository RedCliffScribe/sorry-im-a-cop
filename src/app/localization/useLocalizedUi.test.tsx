import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { AppLocale } from '../../domain/localization/appLocale';
import { useLocalizedUi } from './useLocalizedUi';

function LocalizedFixture({ locale }: { locale: AppLocale }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dynamicLabel, setDynamicLabel] = useState('读取游戏');
  useLocalizedUi(rootRef, locale);

  return (
    <div ref={rootRef}>
      <span>游戏设置</span>
      <button type="button" aria-label="更新内容" onClick={() => setDynamicLabel('保存游戏')}>
        {dynamicLabel}
      </button>
      <span data-locale-preserve="true">简体中文 / 繁體中文</span>
    </div>
  );
}

describe('useLocalizedUi', () => {
  it('converts initial and dynamic UI text, preserves locale labels, and restores Simplified Chinese', async () => {
    const view = render(<LocalizedFixture locale="zh-Hant-HK" />);

    await waitFor(() => expect(screen.getByText('遊戲設置')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '更新內容' })).toHaveTextContent('讀取遊戲');
    expect(screen.getByText('简体中文 / 繁體中文')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('zh-Hant-HK');

    fireEvent.click(screen.getByRole('button', { name: '更新內容' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '更新內容' })).toHaveTextContent('保存遊戲'));

    view.rerender(<LocalizedFixture locale="zh-CN" />);
    await waitFor(() => expect(screen.getByText('游戏设置')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '更新内容' })).toHaveTextContent('保存游戏');
    expect(document.documentElement.lang).toBe('zh-CN');
  });
});
