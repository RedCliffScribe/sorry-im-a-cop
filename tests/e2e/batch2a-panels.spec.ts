import { expect, test } from '@playwright/test';
import { createBatch2aRuntimeState } from './batch2a-fixture';
import { installRuntimeStateSave, loadRuntimeSave } from './fixtures';

test.describe('Batch 2A 信息面板', () => {
  test.beforeEach(async ({ page }) => {
    await installRuntimeStateSave(page, createBatch2aRuntimeState());
    await loadRuntimeSave(page);
  });

  test('动态和案件使用玩家可读的分层详情', async ({ page }) => {
    await page.getByRole('button', { name: '动态', exact: true }).click();
    const dynamicDialog = page.getByRole('dialog', { name: '城市脉搏' });
    await expect(dynamicDialog.getByText('通菜街巡逻交更')).toBeVisible();
    await expect(dynamicDialog.getByText('当前进展')).toBeVisible();
    await expect(dynamicDialog.getByText('后续影响')).toBeVisible();
    await expect(dynamicDialog.getByText('隐藏项不会在普通界面显示')).toHaveCount(0);
    await dynamicDialog.getByRole('button', { name: '关闭' }).click();

    await page.getByRole('button', { name: '案件', exact: true }).click();
    const caseDialog = page.getByRole('dialog', { name: '案件' });
    await expect(caseDialog.getByRole('region', { name: '办理中' })).toContainText('花园街持械勒索案');
    await expect(caseDialog.getByText('案卷已经移交重案组，玩家只保留知情身份。')).toHaveCount(0);
    await expect(caseDialog.getByText(/实物 · 1984-12-29 08:30/)).toBeVisible();
  });

  test('新闻呈现报纸版面且回忆只有三层', async ({ page }) => {
    await page.getByRole('button', { name: '新闻', exact: true }).click();
    const newsDialog = page.getByRole('dialog', { name: '新闻' });
    await expect(newsDialog.getByRole('heading', { name: '大公报' })).toBeVisible();
    await expect(newsDialog.getByText('1984年香港版')).toBeVisible();
    await expect(newsDialog.getByText('与你有关')).toBeVisible();
    await newsDialog.getByRole('button', { name: '关闭' }).click();

    await page.getByRole('button', { name: '回忆', exact: true }).click();
    const memoryDialog = page.getByRole('dialog', { name: '回忆' });
    await expect(memoryDialog.getByRole('tab')).toHaveCount(3);
    await expect(memoryDialog.getByText('你已经把小说初稿寄给报社')).toBeVisible();
  });

  test('移动端四个信息面板没有横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '功能', exact: true }).click();

    for (const panelName of ['动态', '案件', '新闻', '回忆']) {
      await page.getByRole('button', { name: panelName, exact: true }).scrollIntoViewIfNeeded();
      await page.getByRole('button', { name: panelName, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: panelName === '动态' ? '城市脉搏' : panelName });
      await expect(dialog).toBeVisible();
      expect(
        await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)
      ).toBe(true);
      await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    }
  });
});
