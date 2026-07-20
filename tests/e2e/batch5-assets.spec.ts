import { mkdir } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createBatch2bRuntimeState } from './batch2b-fixture';
import { createBatch4aRuntimeState } from './batch4a-fixture';
import { installRuntimeStateSave, loadRuntimeSave } from './fixtures';

const screenshotDirectory = 'output/playwright/ui-batch5';

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'narrow', width: 900, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
] as const;

async function expectImageDecoded(image: Locator): Promise<void> {
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element) => {
        const node = element as HTMLImageElement;
        return node.complete && node.naturalWidth > 0 && node.naturalHeight > 0;
      })
    )
    .toBe(true);
}

async function expectNoHorizontalOverflow(container: Locator): Promise<void> {
  expect(await container.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
}

async function expectSixteenByNine(stage: Locator): Promise<void> {
  const box = await stage.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs((box?.width ?? 0) / (box?.height ?? 1) - 16 / 9)).toBeLessThan(0.04);
}

async function takeViewportScreenshot(page: Page, fileName: string): Promise<void> {
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({ path: `${screenshotDirectory}/${fileName}`, fullPage: false });
}

for (const viewport of viewports) {
  test(`房产与车辆资源在 ${viewport.name} 视口正确解码和排版`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await installRuntimeStateSave(page, createBatch4aRuntimeState());
    await loadRuntimeSave(page);
    if (viewport.width <= 820) {
      await page.getByRole('button', { name: '功能', exact: true }).click();
    }

    const archiveButton = page.getByRole('button', { name: '物品与资产', exact: true });
    await archiveButton.scrollIntoViewIfNeeded();
    await archiveButton.click();

    const archiveDialog = page.getByRole('dialog', { name: '物品与资产' });
    await expectNoHorizontalOverflow(archiveDialog);

    await archiveDialog.locator('.asset-sidebar-button', { hasText: '固定资产' }).click();
    const propertyCard = archiveDialog.getByRole('button', { name: /通菜街唐楼分租房/ });
    const propertyThumbnail = propertyCard.locator('.asset-property-thumb img');
    await expectImageDecoded(propertyThumbnail);
    await expect(propertyThumbnail).toHaveAttribute('src', /\.webp$/);
    await expectSixteenByNine(propertyCard.locator('.asset-property-thumb'));
    await propertyCard.click();

    const propertyDialog = page.getByRole('dialog', { name: '通菜街唐楼分租房详情' });
    const propertyImage = propertyDialog.locator('.asset-detail-visual-image');
    await expectImageDecoded(propertyImage);
    await expect(propertyImage).toHaveAttribute('src', /\.webp$/);
    await expectSixteenByNine(propertyImage);
    await expectNoHorizontalOverflow(propertyDialog);
    await takeViewportScreenshot(page, `property-${viewport.name}.png`);
    await propertyDialog.getByRole('button', { name: '关闭', exact: true }).click();

    await archiveDialog.locator('.asset-sidebar-button', { hasText: '交通工具' }).click();
    const vehicleCard = archiveDialog.getByRole('button', { name: /本田旧电单车/ });
    const vehicleThumbnail = vehicleCard.locator('.asset-property-thumb img');
    await expectImageDecoded(vehicleThumbnail);
    await expect(vehicleThumbnail).toHaveAttribute('src', /\.webp$/);
    await expectSixteenByNine(vehicleCard.locator('.asset-property-thumb'));
    await vehicleCard.click();

    const vehicleDialog = page.getByRole('dialog', { name: '本田旧电单车详情' });
    const vehicleImage = vehicleDialog.locator('.asset-detail-visual-image');
    await expectImageDecoded(vehicleImage);
    await expect(vehicleImage).toHaveAttribute('src', /\.webp$/);
    await expectSixteenByNine(vehicleImage);
    await expectNoHorizontalOverflow(vehicleDialog);
    await takeViewportScreenshot(page, `vehicle-${viewport.name}.png`);
  });

  test(`战斗资源在 ${viewport.name} 视口正确解码并完成演出`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await installRuntimeStateSave(page, createBatch2bRuntimeState());
    await loadRuntimeSave(page);
    if (viewport.width <= 820) {
      await page.getByRole('button', { name: '功能', exact: true }).click();
    }

    const combatButton = page.getByRole('button', { name: '战斗', exact: true });
    await combatButton.scrollIntoViewIfNeeded();
    await combatButton.click();
    const recordDialog = page.getByRole('dialog', { name: '战斗记录' });
    await recordDialog.getByRole('button', { name: /查看花园街后巷持械拘捕详情/ }).click();

    const detailDialog = page.getByRole('dialog', { name: '战斗详情' });
    const stage = detailDialog.getByRole('region', { name: '战斗演出' });
    const background = stage.locator('.combat-visual-background');
    const player = stage.locator('.combat-visual-player');
    const enemy = stage.locator('.combat-visual-enemy');

    await expectImageDecoded(background);
    await expectImageDecoded(player);
    await expectImageDecoded(enemy);
    await expect(background).toHaveAttribute('src', /\.webp$/);
    await expect(player).toHaveAttribute('src', /\.webp$/);
    await expect(enemy).toHaveAttribute('src', /\.webp$/);
    await expectSixteenByNine(stage);
    await expectNoHorizontalOverflow(detailDialog);

    await expect(stage.locator('.combat-visual-result-stamp')).toBeVisible({ timeout: 6_000 });
    await expect(stage.locator('.combat-visual-result-stamp')).toContainText('成功');
    await takeViewportScreenshot(page, `combat-${viewport.name}.png`);
  });
}
