import { expect, test } from '@playwright/test';
import { createBatch4aRuntimeState } from './batch4a-fixture';
import { installRuntimeStateSave, loadRuntimeSave } from './fixtures';

test.describe('Batch 4A 资产与收支面板', () => {
  test.beforeEach(async ({ page }) => {
    await installRuntimeStateSave(page, createBatch4aRuntimeState());
    await loadRuntimeSave(page);
  });

  test('资产按文字物品和 16:9 房产车辆卡片分层展示', async ({ page }) => {
    await page.getByRole('button', { name: '物品与资产', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '物品与资产' });
    await expect(dialog).toHaveClass(/asset-archive-modal--polished/);
    await expect(dialog.locator('.asset-summary-strip')).toBeVisible();

    await dialog.locator('.asset-sidebar-button', { hasText: '固定资产' }).click();
    const propertyCard = dialog.getByRole('button', { name: /通菜街唐楼分租房/ });
    await expect(propertyCard.locator('.asset-property-thumb')).toBeVisible();
    await expect(propertyCard.locator('.asset-property-info')).toBeVisible();
    const thumbRatio = await propertyCard.locator('.asset-property-thumb').evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.width / box.height;
    });
    expect(thumbRatio).toBeGreaterThan(1.72);
    expect(thumbRatio).toBeLessThan(1.84);

    await dialog.locator('.asset-sidebar-button', { hasText: '全部物品' }).click();
    const ordinaryCard = dialog.getByRole('button', { name: /巡逻记录簿/ });
    await expect(ordinaryCard.locator('.asset-property-thumb')).toHaveCount(0);
  });

  test('收支按概览、固定收支、流水和月报分层展示', async ({ page }) => {
    await page.getByRole('button', { name: '金钱与收支', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '金钱与收支' });
    await expect(dialog).toHaveClass(/finance-archive-modal--polished/);
    await expect(dialog.locator('.finance-summary-strip')).toBeVisible();
    await expect(dialog.locator('.finance-overview-panel')).toBeVisible();
    await expect(dialog.locator('.finance-cashflow-grid')).toBeVisible();
    await expect(dialog.locator('.finance-ledger-section')).toBeVisible();
    await expect(dialog.locator('.finance-report-section')).toBeVisible();
    await expect(dialog.getByText('唐楼月租')).toBeVisible();
    await expect(dialog.getByText('1984-11', { exact: true })).toBeVisible();
  });

  test('移动端两个面板没有横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '功能', exact: true }).click();

    for (const panelName of ['物品与资产', '金钱与收支']) {
      await page.getByRole('button', { name: panelName, exact: true }).scrollIntoViewIfNeeded();
      await page.getByRole('button', { name: panelName, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: panelName });
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    }
  });
});
