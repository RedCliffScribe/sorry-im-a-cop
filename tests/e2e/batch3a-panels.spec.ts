import { expect, test } from '@playwright/test';
import { createBatch3aRuntimeState } from './batch3a-fixture';
import { installRuntimeStateSave, loadRuntimeSave } from './fixtures';

test.describe('Batch 3A 人物与关系面板', () => {
  test.beforeEach(async ({ page }) => {
    await installRuntimeStateSave(page, createBatch3aRuntimeState());
    await loadRuntimeSave(page);
  });

  test('人物志保留人物层级和默认折叠的女性档案', async ({ page }) => {
    await page.getByRole('button', { name: '人物志', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '人物志' });

    const rosterWidth = await dialog.locator('.character-roster').evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    const detailWidth = await dialog.locator('.character-detail').evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    expect(rosterWidth).toBeLessThanOrEqual(217);
    expect(detailWidth).toBeGreaterThan(rosterWidth * 3);

    const rosterEntry = dialog.getByRole('button', { name: /麦志强/ });
    await expect(rosterEntry).toBeVisible();
    const rosterIntro = rosterEntry.locator('.character-roster-line small');
    await expect(rosterIntro).toHaveAttribute('title', '旺角警署值日警长');
    await expect(rosterIntro).toHaveCSS('white-space', 'nowrap');
    expect(await rosterEntry.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(60);
    await expect(dialog.getByText('玩家早更巡逻的直属值日警长')).toBeVisible();
    await dialog.getByRole('button', { name: /何丽莲/ }).click();
    await expect(dialog.getByText('女性档案')).toBeVisible();
    await expect(dialog.getByText('外貌档案')).not.toBeVisible();
    await expect(dialog.getByText('最近仍需保持精确连续性的具体往来。')).toBeVisible();
  });

  test('人物志删除人物需要二次确认并按人物 ID 移除', async ({ page }) => {
    await page.getByRole('button', { name: '人物志', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '人物志' });

    await dialog.getByRole('button', { name: /麦志强/ }).click();
    await dialog.getByRole('button', { name: '删除人物' }).click();
    await expect(dialog.getByRole('alert')).toContainText('确定删除“麦志强”');
    await expect(dialog.getByRole('button', { name: /何丽莲/ })).toBeVisible();

    await dialog.getByRole('button', { name: '确认删除' }).click();

    await expect(dialog.getByRole('button', { name: /麦志强/ })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /何丽莲/ })).toBeVisible();
  });

  test('人脉与缘份保持独立且不显示工程用语', async ({ page }) => {
    await page.getByRole('button', { name: '人脉', exact: true }).click();
    const networkDialog = page.getByRole('dialog', { name: '人脉' });
    await expect(networkDialog.getByRole('heading', { name: '报馆消息线' })).toBeVisible();
    await expect(networkDialog.getByText('何家荣 / Gary Ho')).toBeVisible();
    await expect(networkDialog.getByText('休班后的约定')).toHaveCount(0);
    await expect(networkDialog.getByText('最近实质变化')).toBeVisible();
    await expect(networkDialog.getByText('上次心跳')).toHaveCount(0);
    await networkDialog.getByRole('button', { name: '关闭' }).click();

    await page.getByRole('button', { name: '缘份', exact: true }).click();
    const fateDialog = page.getByRole('dialog', { name: '缘份' });
    await expect(fateDialog.getByRole('heading', { name: '休班后的约定' })).toBeVisible();
    await expect(fateDialog.getByText('何丽莲 / Lily Ho')).toBeVisible();
    await expect(fateDialog.getByText('报馆消息线')).toHaveCount(0);
  });

  test('口碑圈层提供可读刻度且变动记录局部滚动', async ({ page }) => {
    await page.getByRole('button', { name: '口碑', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '口碑' });

    await expect(dialog.getByText('286/1000')).toBeVisible();
    await expect(dialog.locator('.reputation-meter')).toHaveCount(12);
    await expect(dialog.locator('.reputation-log-scroll')).toBeVisible();
    await expect(dialog.getByText('街坊第一次记住玩家的警员编号。')).toBeVisible();
    await expect(dialog.getByText('第 8 次公开评价变化。')).toHaveCount(0);
  });

  test('移动端四个面板没有横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '功能', exact: true }).click();

    for (const panelName of ['人物志', '人脉', '缘份', '口碑']) {
      await page.getByRole('button', { name: panelName, exact: true }).scrollIntoViewIfNeeded();
      await page.getByRole('button', { name: panelName, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: panelName });
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    }
  });
});
