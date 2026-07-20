import { expect, test } from '@playwright/test';
import { createBatch2bRuntimeState } from './batch2b-fixture';
import { installRuntimeStateSave, loadRuntimeSave } from './fixtures';

test.describe('Batch 2B 视觉交互面板', () => {
  test.beforeEach(async ({ page }) => {
    await installRuntimeStateSave(page, createBatch2bRuntimeState());
    await loadRuntimeSave(page);
  });

  test('地图主体宽于两侧资料并隐藏工程定位信息', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.getByRole('button', { name: '地图', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '地图' });
    const map = dialog.getByRole('region', { name: '香港地图' });
    const list = dialog.getByRole('complementary', { name: '地点列表' });
    const detail = dialog.getByRole('region', { name: '地点详情' });

    await expect(map).toBeVisible();
    await expect(dialog).toContainText('当前位置');
    await expect(dialog).not.toContainText('固定地点');
    await expect(dialog).not.toContainText('已定位');
    await expect(dialog).not.toContainText('概略位置');
    await expect(dialog).not.toContainText('可信度');

    const mapBox = await map.boundingBox();
    const listBox = await list.boundingBox();
    const detailBox = await detail.boundingBox();
    expect(mapBox && listBox && mapBox.width > listBox.width * 2).toBe(true);
    expect(mapBox && detailBox && mapBox.width > detailBox.width * 1.7).toBe(true);
  });

  test('战斗详情保留16比9演出并把结果放在记录首位', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.getByRole('button', { name: '战斗', exact: true }).click();
    const recordDialog = page.getByRole('dialog', { name: '战斗记录' });
    await recordDialog.getByRole('button', { name: /查看花园街后巷持械拘捕详情/ }).click();
    const detailDialog = page.getByRole('dialog', { name: '战斗详情' });
    const stage = detailDialog.getByRole('region', { name: '战斗演出' });

    await expect(stage).toBeVisible();
    await expect(detailDialog.locator('.combat-detail-summary-row > :first-child')).toContainText('结果');
    await expect(detailDialog.locator('.combat-detail-scroll')).toBeVisible();
    const stageBox = await stage.boundingBox();
    expect(stageBox && Math.abs(stageBox.width / stageBox.height - 16 / 9) < 0.03).toBe(true);
  });

  test('移动端地图与战斗详情没有横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '功能', exact: true }).click();

    await page.getByRole('button', { name: '地图', exact: true }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: '地图', exact: true }).click();
    const mapDialog = page.getByRole('dialog', { name: '地图' });
    expect(await mapDialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await mapDialog.getByRole('button', { name: '关闭', exact: true }).click();

    await page.getByRole('button', { name: '战斗', exact: true }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: '战斗', exact: true }).click();
    await page.getByRole('dialog', { name: '战斗记录' }).getByRole('button', { name: /查看花园街后巷持械拘捕详情/ }).click();
    const combatDialog = page.getByRole('dialog', { name: '战斗详情' });
    expect(await combatDialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
});
