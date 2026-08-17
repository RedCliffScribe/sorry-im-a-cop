import { expect, test } from '@playwright/test';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import { installRuntimeStateSave, loadRuntimeSave } from './fixtures';

const longSuggestedActions = [
  '伸手拦住家明，压下他准备拔警棍的手，用带队老兵的身份重新拿回局面主导权。',
  '顺水推舟，既然家明已经发话，把手按在腰间枪袋上，盯着黄毛插在兜里的手，冷冷要求他慢慢拿出身份证。',
  '半开玩笑地对黄毛说：“我搭档新出更，火气大得很，不想今晚去差馆蹲一宿就配合点。”'
];

test.describe('游戏主界面', () => {
  test.beforeEach(async ({ page }) => {
    const runtimeState = createInitialRuntimeState({
      playerName: '浏览器测试员',
      englishName: 'Browser Tester',
      policeNumber: '4382'
    });
    runtimeState.storyLog[0].suggestedActions = longSuggestedActions;
    await installRuntimeStateSave(page, runtimeState);
    await loadRuntimeSave(page);
  });

  test('三栏、行动区与顶部操作同时可用', async ({ page }) => {
    await page.setViewportSize({ width: 2048, height: 1280 });

    await expect(page.locator('.game-shell--play')).toBeVisible();
    await expect(page.locator('.game-left-rail')).toBeVisible();
    await expect(page.locator('.game-story-column')).toBeVisible();
    await expect(page.getByLabel('功能入口')).toBeVisible();
    await expect(page.getByPlaceholder('输入你的行动……')).toBeVisible();
    await expect(page.getByRole('button', { name: '保存进度' })).toBeVisible();
    await expect(page.getByRole('button', { name: '读取进度' })).toBeVisible();
    await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible();

    const commandDockBox = await page.locator('.game-command-dock').evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { height: box.height, bottom: box.bottom };
    });
    const commandStackBox = await page.locator('.command-stack').evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { height: box.height, bottom: box.bottom };
    });
    expect(commandDockBox.height - commandStackBox.height).toBeLessThanOrEqual(32);
    expect(Math.abs(commandDockBox.bottom - commandStackBox.bottom)).toBeLessThanOrEqual(8);

    const actionDensity = await page.evaluate(() => {
      const optionList = document.querySelector<HTMLElement>('.suggested-action-list');
      const option = optionList?.querySelector<HTMLElement>('button');
      const commandBar = document.querySelector<HTMLElement>('.command-bar');
      if (!optionList || !option || !commandBar) {
        throw new Error('Missing command dock elements');
      }
      return {
        listFlexWrap: getComputedStyle(optionList).flexWrap,
        listHeight: optionList.getBoundingClientRect().height,
        optionHeight: option.getBoundingClientRect().height,
        commandBarHeight: commandBar.getBoundingClientRect().height
      };
    });
    expect(actionDensity.listFlexWrap).toBe('nowrap');
    expect(actionDensity.listHeight).toBeLessThanOrEqual(actionDensity.optionHeight + 10);
    expect(actionDensity.commandBarHeight).toBeLessThanOrEqual(52);

    const firstOption = page.getByRole('button', { name: longSuggestedActions[0] });
    await expect(firstOption).toHaveText('伸手拦住家明');
    await expect(firstOption).toHaveAttribute('title', longSuggestedActions[0]);
    await firstOption.hover();
    await firstOption.click();
    await expect(page.getByLabel('玩家行动')).toHaveValue(longSuggestedActions[0]);

    const boxes = await Promise.all(
      ['.game-left-rail', '.game-story-column', '.game-right-rail'].map((selector) =>
        page.locator(selector).evaluate((element) => {
          const box = element.getBoundingClientRect();
          return { left: box.left, right: box.right, width: box.width };
        })
      )
    );
    expect(boxes.every((box) => box.width > 0)).toBe(true);
    expect(boxes[0].right).toBeLessThanOrEqual(boxes[1].left);
    expect(boxes[1].right).toBeLessThanOrEqual(boxes[2].left);

    const topbarCenter = await page.locator('.game-topbar').evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left + box.width / 2;
    });
    const timeCenter = await page.locator('.game-time-block').evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left + box.width / 2;
    });
    expect(Math.abs(timeCenter - topbarCenter)).toBeLessThanOrEqual(1);
  });

  test('移动端用身份、正文与功能工作区代替整页纵向堆叠', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    ).toBe(true);
    await expect(page.locator('.game-shell--play')).toBeVisible();
    await expect(page.getByRole('navigation', { name: '移动端主界面区域' })).toBeVisible();
    await expect(page.getByRole('button', { name: '打开行动编辑器' })).toBeVisible();
    await expect(page.getByRole('button', { name: '重ROLL上一回合' })).toBeVisible();
    await expect(page.locator('.game-story-column')).toBeVisible();
    await expect(page.locator('.game-left-rail')).toBeHidden();
    await expect(page.locator('.game-right-rail')).toBeHidden();

    const frameOverflow = await page.locator('.game-frame').evaluate((element) => getComputedStyle(element).overflowY);
    expect(frameOverflow).toBe('hidden');

    const frameMetrics = await page.locator('.game-frame').evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight
    }));
    expect(frameMetrics.scrollHeight).toBeLessThanOrEqual(frameMetrics.clientHeight + 1);

    const mobileDensity = await page.evaluate(() => {
      const metrics = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) {
          throw new Error(`Missing mobile layout element: ${selector}`);
        }
        const box = element.getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          fontSize: Number.parseFloat(getComputedStyle(element).fontSize)
        };
      };
      return {
        story: metrics('.story-panel'),
        dock: metrics('.game-command-dock'),
        suggestion: metrics('.suggested-action-list button'),
        draft: metrics('.command-mobile-draft-trigger'),
        send: metrics('.command-primary-action'),
        time: metrics('.game-time-block strong'),
        location: metrics('.game-time-block span')
      };
    });
    expect(mobileDensity.story.height).toBeGreaterThan(mobileDensity.dock.height * 3);
    expect(mobileDensity.dock.height).toBeLessThanOrEqual(110);
    expect(mobileDensity.suggestion.fontSize).toBeLessThanOrEqual(12);
    expect(mobileDensity.draft.height).toBeLessThanOrEqual(50);
    expect(mobileDensity.draft.fontSize).toBeLessThanOrEqual(13);
    expect(mobileDensity.send.width).toBeLessThanOrEqual(82);
    expect(mobileDensity.send.height).toBeLessThanOrEqual(50);
    expect(mobileDensity.send.fontSize).toBeLessThanOrEqual(13);
    expect(mobileDensity.time.fontSize).toBeLessThanOrEqual(14);
    expect(mobileDensity.location.fontSize).toBeLessThanOrEqual(12);

    const suggestedActionScroll = await page.getByLabel('建议行动').evaluate((element) => {
      const before = element.scrollLeft;
      element.scrollLeft = element.scrollWidth;
      return {
        before,
        after: element.scrollLeft,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: getComputedStyle(element).overflowX,
        touchAction: getComputedStyle(element).touchAction
      };
    });
    expect(suggestedActionScroll.scrollWidth).toBeGreaterThan(suggestedActionScroll.clientWidth);
    expect(suggestedActionScroll.after).toBeGreaterThan(suggestedActionScroll.before);
    expect(suggestedActionScroll.overflowX).toBe('auto');
    expect(suggestedActionScroll.touchAction).toBe('pan-x');

    await page.getByRole('button', { name: '打开行动编辑器' }).click();
    const editor = page.getByRole('dialog', { name: '编辑玩家行动' });
    await expect(editor).toBeVisible();
    await editor.getByRole('textbox', { name: '编辑行动内容' }).fill('去值日室核对案件记录。');
    await editor.getByRole('button', { name: '确定' }).click();
    await expect(editor).toBeHidden();
    await expect(page.getByRole('button', { name: '打开行动编辑器' })).toContainText('去值日室核对案件记录。');

    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    ).toBe(true);
    await expect(page.getByRole('button', { name: '重ROLL上一回合' })).toBeVisible();
    await expect(page.getByRole('button', { name: '打开行动编辑器' })).toBeVisible();
    await expect(page.getByRole('button', { name: '执行行动' })).toBeVisible();

    await page.getByRole('button', { name: '功能', exact: true }).click();
    await expect(page.locator('.game-story-column')).toBeHidden();
    await expect(page.locator('.game-right-rail')).toBeVisible();
    const mapButton = page.getByRole('button', { name: '地图', exact: true });
    await expect(mapButton).toBeVisible();
    expect(await mapButton.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(0);

    await page.getByRole('button', { name: '身份' }).click();
    await expect(page.locator('.game-left-rail')).toBeVisible();
    await expect(page.locator('.game-right-rail')).toBeHidden();

    await page.getByRole('button', { name: '正文' }).click();
    await expect(page.getByRole('button', { name: '打开行动编辑器' })).toBeVisible();
  });

  for (const panel of [
    { button: '地图', dialog: '地图' },
    { button: '案件', dialog: '案件' },
    { button: '人物志', dialog: '人物志' },
    { button: '物品与资产', dialog: '物品与资产' },
    { button: '战斗', dialog: '战斗记录' },
    { button: '回忆', dialog: '回忆' }
  ]) {
    test(`可以打开并关闭${panel.button}面板`, async ({ page }) => {
      await page.getByRole('button', { name: panel.button, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: panel.dialog });
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(0);
      await dialog.getByRole('button', { name: '关闭', exact: true }).click();
      await expect(dialog).toBeHidden();
    });
  }
});
