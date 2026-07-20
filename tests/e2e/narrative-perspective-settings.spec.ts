import { expect, test } from '@playwright/test';
import { dismissDailyChangelog } from './fixtures';

async function openNarrativePerspectiveSettings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '游戏设置', exact: true }).click();
  return page.getByRole('radiogroup', { name: '正文叙事人称' });
}

test.describe('正文叙事人称设置', () => {
  test('defaults to second person and persists the selected perspective', async ({ page }) => {
    await page.goto('/');
    await dismissDailyChangelog(page);
    let group = await openNarrativePerspectiveSettings(page);

    await expect(group.getByRole('radio', { name: /第二人称/ })).toHaveAttribute('aria-checked', 'true');
    await group.getByRole('radio', { name: /第三人称/ }).click();
    await expect(group.getByRole('radio', { name: /第三人称/ })).toHaveAttribute('aria-checked', 'true');

    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = localStorage.getItem('sorry-im-a-cop-v2-ai-settings');
          return raw ? JSON.parse(raw).game?.narrativePerspective : null;
        })
      )
      .toBe('third_person');

    await page.reload();
    group = await openNarrativePerspectiveSettings(page);
    await expect(group.getByRole('radio', { name: /第三人称/ })).toHaveAttribute('aria-checked', 'true');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(group.getByRole('radio', { name: /第一人称/ })).toBeVisible();
    await expect(group.getByRole('radio', { name: /第二人称/ })).toBeVisible();
    await expect(group.getByRole('radio', { name: /第三人称/ })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    ).toBe(true);
  });
});
