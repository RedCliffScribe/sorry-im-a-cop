import { expect, test } from '@playwright/test';
import { dismissDailyChangelog } from './fixtures';

test.describe('首次使用 API 引导', () => {
  test('非阻塞提示、六类功能说明、设置直达与移动端滚动均正常', async ({ page }) => {
    const consoleProblems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        consoleProblems.push(`${message.type()}: ${message.text()}`);
      }
    });

    await page.goto('/');
    await dismissDailyChangelog(page);
    await page.evaluate(() => {
      localStorage.removeItem('sorry-im-a-cop-v2-ai-settings');
      localStorage.removeItem('sorry-im-a-cop-v2-first-use-guide');
    });
    await page.reload();

    const hint = page.getByRole('complementary', { name: '首次使用提示' });
    await expect(hint).toBeVisible();
    await expect(page.getByRole('button', { name: '开始游戏' })).toBeEnabled();
    await expect(page.getByRole('button', { name: '设置', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '新手引导', exact: true })).toBeVisible();

    await hint.getByRole('button', { name: '打开新手引导' }).click();
    let dialog = page.getByRole('dialog', { name: '首次使用引导' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('一份 API 档案可以复用')).toBeVisible();
    for (const title of ['写回修复', '记忆总结', '向量检索', 'NPC 模拟', '远场演化', '辅助生成']) {
      await expect(dialog.getByRole('heading', { name: title })).toBeAttached();
      await expect(dialog.getByRole('button', { name: `配置${title}` })).toBeAttached();
    }
    await expect(dialog.getByText('当前：待主剧情配置')).toHaveCount(5);
    await expect(dialog.getByText('当前：未启用')).toHaveCount(1);

    const desktopMetrics = await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const copy = element.querySelector<HTMLElement>('.first-use-guide-copy');
      const footer = element.querySelector<HTMLElement>('.first-use-guide-footer');
      return {
        withinViewport:
          bounds.left >= 0 &&
          bounds.right <= window.innerWidth &&
          bounds.top >= 0 &&
          bounds.bottom <= window.innerHeight,
        copyScrolls: Boolean(copy && copy.scrollHeight > copy.clientHeight),
        footerVisible: Boolean(footer && footer.getBoundingClientRect().bottom <= bounds.bottom)
      };
    });
    expect(desktopMetrics).toEqual({ withinViewport: true, copyScrolls: true, footerVisible: true });

    await dialog.getByRole('button', { name: '前往主剧情 API 配置' }).click();
    await expect(page.getByRole('heading', { name: 'API 配置' })).toBeVisible();
    await page.getByRole('button', { name: '关闭设置' }).click();

    await page.getByRole('button', { name: '新手引导', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '首次使用引导' });
    await dialog.getByRole('button', { name: '配置向量检索' }).click();
    await expect(page.getByRole('region', { name: '向量检索 API 路由' })).toBeVisible();
    await page.getByRole('button', { name: '关闭设置' }).click();

    await page.getByRole('button', { name: '新手引导', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '首次使用引导' });
    await dialog.getByRole('button', { name: '配置远场演化' }).click();
    await expect(page.getByRole('heading', { name: '远场演化' })).toBeVisible();
    await page.getByRole('button', { name: '关闭设置' }).click();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '新手引导', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '首次使用引导' });
    await expect(dialog).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    ).toBe(true);
    const mobileMetrics = await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const copy = element.querySelector<HTMLElement>('.first-use-guide-copy');
      const footer = element.querySelector<HTMLElement>('.first-use-guide-footer');
      const cards = element.querySelector<HTMLElement>('.first-use-guide-grid');
      return {
        withinViewport:
          bounds.left >= 0 &&
          bounds.right <= window.innerWidth &&
          bounds.top >= 0 &&
          bounds.bottom <= window.innerHeight,
        copyScrolls: Boolean(copy && copy.scrollHeight > copy.clientHeight),
        footerVisible: Boolean(footer && footer.getBoundingClientRect().bottom <= bounds.bottom),
        cardColumns: cards ? getComputedStyle(cards).gridTemplateColumns.split(' ').length : 0
      };
    });
    expect(mobileMetrics).toEqual({
      withinViewport: true,
      copyScrolls: true,
      footerVisible: true,
      cardColumns: 1
    });
    expect(consoleProblems).toEqual([]);
  });
});
