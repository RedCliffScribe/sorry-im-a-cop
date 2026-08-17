import { expect, test } from '@playwright/test';
import { dismissDailyChangelog } from './fixtures';

test.describe('文生图提示词传输与风格主权', () => {
  test('桌面和移动端都能查看并选择 NAI 推荐风格与模型语法说明', async ({ page }) => {
    test.setTimeout(90_000);
    const consoleProblems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        consoleProblems.push(`${message.type()}: ${message.text()}`);
      }
    });
    await page.route('**/api/analytics/**', (route) => route.fulfill({ status: 204 }));

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissDailyChangelog(page);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '文生图设置', exact: true }).click();
    await page.getByRole('tab', { name: '提示词模板' }).click();

    await expect(page.getByRole('heading', { name: '图片风格预设库' })).toBeVisible();
    const recommendation = page.getByRole('complementary', { name: 'NovelAI 风格建议' });
    await expect(recommendation).toContainText('NAI 推荐·日漫写实');
    await expect(recommendation).toContainText('不会随模型切换自动覆盖玩家选择');
    await recommendation.getByRole('button', { name: '人物图使用 NAI 推荐' }).click();
    await recommendation.getByRole('button', { name: '场景图使用 NAI 推荐' }).click();
    await expect(page.getByLabel('人物图覆盖风格')).toHaveValue('builtin-style-hong-kong-mature-crime-anime');
    await expect(page.getByLabel('场景图覆盖风格')).toHaveValue('builtin-style-hong-kong-mature-crime-anime');
    await expect(page.getByLabel('全局默认图片风格')).toHaveValue('builtin-style-hong-kong-crime-realism');
    await expect(page.getByText('NAI 推荐·日漫写实 · 内置')).toBeVisible();
    await recommendation.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'output/playwright/phase1am-nai-recommended-style-desktop.png'
    });
    await page.getByText('NovelAI · 内置', { exact: true }).click();
    const novelAiDetails = page.locator('details[open]').filter({ hasText: 'NovelAI · 内置' });
    await expect(novelAiDetails.getByLabel('模型语法与标签转换指令')).toBeVisible();
    await expect(page.getByText(/不会替玩家更换所选媒介或画风/)).toBeVisible();
    await expect(novelAiDetails.getByLabel('模型语法与标签转换指令'))
      .toHaveValue(/anime screencap, official art, year 2008/);

    const desktopOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(desktopOverflow).toBe(false);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('NAI 推荐·日漫写实 · 内置')).toBeVisible();
    await recommendation.scrollIntoViewIfNeeded();
    const mobileOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(mobileOverflow).toBe(false);
    await page.screenshot({
      path: 'output/playwright/phase1am-nai-recommended-style-mobile.png'
    });
    expect(consoleProblems).toEqual([]);
  });
});
