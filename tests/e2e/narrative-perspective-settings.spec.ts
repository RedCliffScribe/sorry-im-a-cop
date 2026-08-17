import { expect, test } from '@playwright/test';
import { dismissDailyChangelog } from './fixtures';

async function openNarrativePerspectiveSettings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '游戏设置', exact: true }).click();
  return page.getByRole('radiogroup', { name: '正文叙事人称' });
}

async function openPlayerPortrayalSettings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '游戏设置', exact: true }).click();
  return page.getByRole('combobox', { name: '正文演绎风格' });
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

  test('defaults to natural, exposes three styles, and persists original portrayal', async ({ page }) => {
    await page.goto('/');
    await dismissDailyChangelog(page);
    let select = await openPlayerPortrayalSettings(page);

    await expect(select).toHaveValue('natural');
    await expect(select.locator('option[value="original"]')).toHaveText(/原始/);
    await expect(select.locator('option[value="player_led"]')).toHaveText(/玩家主导/);
    await expect(select.locator('option[value="natural"]')).toHaveText(/自然代演/);
    await page.getByRole('button', { name: '示例' }).hover();
    await expect(page.getByRole('tooltip')).toContainText('阿强，寻晚你去咗边');

    await select.selectOption('original');
    await expect(select).toHaveValue('original');
    await expect(page.getByText(/可配合酒馆预设继续调整成自己喜欢的风格/)).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = localStorage.getItem('sorry-im-a-cop-v2-ai-settings');
          return raw ? JSON.parse(raw).game?.playerPortrayalMode : null;
        })
      )
      .toBe('original');

    await page.reload();
    select = await openPlayerPortrayalSettings(page);
    await expect(select).toHaveValue('original');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(select).toBeVisible();
    await page.getByRole('button', { name: '示例' }).hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    ).toBe(true);
    expect(
      await page
        .locator('.settings-overlay')
        .evaluate((element) => element.scrollWidth <= element.clientWidth)
    ).toBe(true);
  });
});
