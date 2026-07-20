import { expect, test } from '@playwright/test';
import { createBatch3bRuntimeState } from './batch3b-fixture';
import { installRuntimeStateSave, loadRuntimeSave } from './fixtures';

test.describe('Batch 3B 组织面板', () => {
  test.beforeEach(async ({ page }) => {
    await installRuntimeStateSave(page, createBatch3bRuntimeState());
    await loadRuntimeSave(page);
  });

  test('警队按制度、权限与晋升层级展示中文资料', async ({ page }) => {
    await page.getByRole('button', { name: '警队', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '警队' });

    await expect(dialog.getByRole('heading', { name: '职级边界' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: '晋升路径' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: '警队气候' })).toBeVisible();
    await expect(dialog.getByText('公众目光')).toBeVisible();
    await expect(dialog.getByText('Current visible route')).toHaveCount(0);
    expect(await dialog.locator('.police-panel-card--boundary').evaluate((element) => getComputedStyle(element).overflowY)).toBe(
      'visible'
    );
    expect(await dialog.locator('.police-panel-body--force').evaluate((element) => getComputedStyle(element).overflowY)).toBe(
      'auto'
    );
    expect(
      await dialog
        .locator('.police-panel-card--career .police-panel-columns')
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length)
    ).toBe(1);
  });

  test('社团逐个展示架构与自身动态且不暴露诊断用语', async ({ page }) => {
    await page.getByRole('button', { name: '社团', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '社团' });

    await expect(dialog.getByText('隐藏省略')).toHaveCount(0);
    await expect(dialog.getByText('公开名号，细节待确认')).toHaveCount(0);
    await expect(dialog.getByText('街面公开可知')).toBeVisible();
    const sunYeeOn = dialog.getByRole('region', { name: '新义安社团面板' });
    const structure = sunYeeOn.getByLabel('新义安组织架构');
    await expect(structure.getByText('组织架构')).toBeVisible();
    await expect(structure.getByText('坐馆')).not.toBeVisible();
    await structure.getByText('组织架构').click();
    await expect(structure.getByText('坐馆')).toBeVisible();
    await expect(sunYeeOn.getByText('新义安旺角外围')).toBeVisible();
    await expect(sunYeeOn.getByText('街头传闻')).toBeVisible();
    await expect(sunYeeOn.getByText('中等风险')).toBeVisible();

    await dialog.getByRole('button', { name: /十四K/ }).click();
    const fourteenK = dialog.getByRole('region', { name: '十四K社团面板' });
    await expect(fourteenK.getByText('新义安旺角外围')).toHaveCount(0);
  });

  test('机构使用玩家可读来源并显示机构关系', async ({ page }) => {
    await page.getByRole('button', { name: '机构', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '机构' });

    await expect(dialog.getByText('公开资料').first()).toBeVisible();
    await expect(dialog.getByText('时代锚点')).toHaveCount(0);
    await expect(dialog.getByText('org_hsbc')).toHaveCount(0);
    await dialog.getByLabel('机构分类').getByRole('button', { name: /媒体/ }).click();
    await dialog.getByLabel('机构列表').getByRole('button', { name: /TVB/ }).click();
    await expect(dialog.getByText('何家荣 / Gary Ho')).toBeVisible();
    await expect(dialog.getByText('任职 / 记者 / 新闻部')).toBeVisible();
  });

  test('移动端三个组织面板没有横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '功能', exact: true }).click();

    for (const panelName of ['警队', '社团', '机构']) {
      await page.getByRole('button', { name: panelName, exact: true }).scrollIntoViewIfNeeded();
      await page.getByRole('button', { name: panelName, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: panelName });
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    }
  });
});
