import { expect, test } from '@playwright/test';
import {
  OPENING_LEGAL_DISCLAIMER_VERSION,
  OPENING_LEGAL_DISCLAIMER_VERSION_LABEL
} from '../../src/app/legal/openingLegalDisclaimer';
import { APP_VERSION_LABEL } from '../../src/app/releaseIdentity';
import { dismissDailyChangelog } from './fixtures';

async function acceptImportantNotice(page: import('@playwright/test').Page) {
  const notice = page.getByRole('dialog', { name: '重要说明' });
  await expect(notice).toBeVisible();
  await notice.getByRole('checkbox').check();
  await notice.getByRole('button', { name: '同意并进入开局' }).click();
}

async function enterHongKongOpening(page: import('@playwright/test').Page) {
  await expect(page.getByRole('heading', { name: '选择世界包' })).toBeVisible();
  await page
    .getByRole('button', { name: '选择香港 1988世界包' })
    .click();
  await expect(page.getByRole('heading', { name: '剧情扩展选择' })).toBeVisible();
  await page.getByRole('button', { name: '继续开局' }).click();
  await expect(page.getByRole('heading', { name: '开局向导' })).toBeVisible();
}

test.describe('首页与开局向导', () => {
  test('桌面端可以从主页进入基础档案', async ({ page }) => {
    await page.goto('/');
    await dismissDailyChangelog(page);

    const mainMenu = page.getByLabel('主菜单');
    await expect(mainMenu).toBeVisible();
    await expect(page.locator('.home-backdrop')).toBeVisible();
    expect(
      await page.locator('.home-backdrop > image').first().evaluate(async (image: SVGImageElement) => {
        const source = image.href.baseVal;
        if (!source) return false;
        const probe = new Image();
        const loaded = new Promise<boolean>((resolve) => {
          probe.onload = () => resolve(probe.naturalWidth > 0);
          probe.onerror = () => resolve(false);
        });
        probe.src = source;
        return loaded;
      })
    ).toBe(true);
    await expect(mainMenu.getByRole('button', { name: '开始游戏' })).toBeVisible();
    const releaseInfo = page.getByRole('group', { name: '版本、版权与法律信息' });
    await expect(releaseInfo.getByText(APP_VERSION_LABEL)).toBeVisible();
    await expect(releaseInfo.getByText('© 2026 RedCliffScribe · 非商业本地互动叙事游戏')).toBeVisible();
    await expect(releaseInfo.getByRole('link', { name: '源码' })).toHaveAttribute(
      'href',
      'https://github.com/RedCliffScribe/sorry-im-a-cop'
    );
    await expect(releaseInfo.getByRole('link', { name: '源码' })).toHaveAttribute('target', '_blank');
    await expect(releaseInfo.getByRole('link', { name: '源码' })).toHaveAttribute('rel', 'noreferrer');
    await expect(releaseInfo.getByRole('link', { name: '纠错与权利通知' })).toHaveAttribute(
      'href',
      'mailto:kale014@gmail.com'
    );
    await releaseInfo.getByRole('button', { name: '法律声明' }).click();
    const legalReference = page.getByRole('dialog', { name: '《对唔住，我系差人》' });
    await expect(legalReference).toBeVisible();
    await expect(legalReference.getByRole('checkbox')).toHaveCount(0);
    await legalReference.getByRole('button', { name: '关闭法律声明' }).click();
    await expect(mainMenu.getByRole('button', { name: '读取游戏' })).toBeVisible();
    await expect(mainMenu.getByRole('button', { name: '设置' })).toBeVisible();

    await mainMenu.getByRole('button', { name: '开始游戏' }).click();
    await acceptImportantNotice(page);
    await enterHongKongOpening(page);
    await expect(page.getByRole('heading', { name: '世界与剧本' })).toBeVisible();

    const steps = page.getByRole('navigation', { name: '开局步骤' });
    await expect(steps.getByRole('button', { name: /基础档案/ })).toBeVisible();
    await steps.getByRole('button', { name: /基础档案/ }).click();

    await expect(page.getByRole('heading', { name: '基础档案' })).toBeVisible();
    await expect(page.getByLabel('出身与背景')).toBeVisible();
    expect(await page.locator('.opening-footer').evaluate((element) => element.clientHeight)).toBeGreaterThan(0);
  });

  test('警队开局可选择 EU，且驻点与职级岗位严格联动', async ({ page }) => {
    await page.goto('/');
    await dismissDailyChangelog(page);
    await page.getByRole('button', { name: '开始游戏' }).click();
    await acceptImportantNotice(page);
    await enterHongKongOpening(page);
    await page.getByRole('button', { name: /基础档案/ }).click();

    await page.getByLabel('警阶').selectOption('probationary_inspector');
    await expect(page.getByLabel('部门')).toHaveValue('uniform');
    await expect(page.getByLabel('部门').getByRole('option')).toHaveText([
      'Uniform Branch（军装巡逻）',
      'Criminal Investigation Department（刑事侦缉处 CID）',
      'Emergency Unit（冲锋队 EU）',
      'Police Tactical Unit（机动部队 PTU）'
    ]);
    await expect(page.getByLabel('岗位')).toHaveValue('patrol_sub_unit_commander');

    await page.getByLabel('部门').selectOption('eu');
    await expect(page.getByLabel('驻点').getByRole('option')).toHaveText([
      'Emergency Unit Hong Kong Island（港岛总区冲锋队）',
      'Emergency Unit Kowloon East（东九龙总区冲锋队）',
      'Emergency Unit Kowloon West（西九龙总区冲锋队）',
      'Emergency Unit New Territories North（新界北总区冲锋队）',
      'Emergency Unit New Territories South（新界南总区冲锋队）'
    ]);
    await expect(page.getByLabel('岗位')).toHaveValue('eu_probationary_platoon_commander');

    const euPosting = await page.getByLabel('驻点').inputValue();
    await page.getByLabel('警阶').selectOption('pc');
    await expect(page.getByLabel('驻点')).toHaveValue(euPosting);
    await expect(page.getByLabel('岗位').getByRole('option')).toHaveText([
      'Emergency Vehicle Crew Officer（冲锋车车组警员）',
      'Emergency Vehicle Driver（冲锋车司机）'
    ]);
    await expect(page.getByLabel('岗位')).toHaveValue('eu_vehicle_crew');

    await page.getByLabel('警阶').selectOption('sergeant');
    await expect(page.getByLabel('驻点')).toHaveValue(euPosting);
    await expect(page.getByLabel('岗位')).toHaveValue('eu_vehicle_commander');

    await page.getByLabel('警阶').selectOption('inspector');
    await expect(page.getByLabel('驻点')).toHaveValue(euPosting);
    await expect(page.getByLabel('岗位')).toHaveValue('eu_platoon_commander');

    await page.getByLabel('警阶').selectOption('chief_inspector');
    await expect(page.getByLabel('驻点')).toHaveValue(euPosting);
    await expect(page.getByLabel('岗位')).toHaveValue('eu_headquarters_operations_officer');

    await page.getByLabel('警阶').selectOption('probationary_inspector');
    await page.getByLabel('部门').selectOption('ptu');
    await expect(page.getByLabel('驻点')).toHaveValue('ptu_barracks');
    await expect(page.getByLabel('岗位')).toHaveValue('platoon_commander');

    await page.getByLabel('部门').selectOption('cid');
    await expect(page.getByLabel('岗位')).toHaveValue('team_investigator');
  });

  test('移动端开局页没有横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await dismissDailyChangelog(page);
    const homeLayout = await page.evaluate(() => {
      const changelog = document.querySelector('.home-changelog-button')?.getBoundingClientRect();
      const release = document.querySelector('.home-release-footer')?.getBoundingClientRect();
      return {
        pageHasNoHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        releaseInsideViewport: Boolean(release && release.left >= 0 && release.right <= window.innerWidth),
        footerItemsDoNotOverlap: Boolean(changelog && release && changelog.right <= release.left)
      };
    });
    expect(homeLayout).toEqual({
      pageHasNoHorizontalOverflow: true,
      releaseInsideViewport: true,
      footerItemsDoNotOverlap: true
    });
    await page.getByRole('button', { name: '开始游戏' }).click();
    await acceptImportantNotice(page);
    await enterHongKongOpening(page);
    await page.getByRole('button', { name: /基础档案/ }).click();

    await expect(page.getByRole('heading', { name: '基础档案' })).toBeVisible();
    await expect(page.getByLabel('出身与背景')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    ).toBe(true);
    expect(await page.locator('.opening-layout').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
    expect(await page.locator('.opening-step-list').evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(0);
    expect(await page.locator('.opening-footer').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(0);
  });

  test('生成开局前必须明确同意版本化声明，且长文在桌面与移动端独立滚动', async ({ page }) => {
    await page.goto('/');
    await dismissDailyChangelog(page);
    await page.evaluate(() => localStorage.removeItem('sorry-im-a-cop-v2-opening-legal-acceptance'));
    await page.getByRole('button', { name: '开始游戏' }).click();

    let dialog = page.getByRole('dialog', { name: '重要说明' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('本游戏依据公开历史与人物资料构建时代背景。')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '同意并进入开局' })).toBeDisabled();
    await dialog.getByRole('button', { name: '查看完整法律声明' }).click();

    dialog = page.getByRole('dialog', { name: '《对唔住，我系差人》' });
    await expect(dialog.getByText('kale014@gmail.com')).toBeAttached();
    await dialog.getByRole('button', { name: '返回重要说明' }).click();
    dialog = page.getByRole('dialog', { name: '重要说明' });
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: '同意并进入开局' }).click();

    await enterHongKongOpening(page);
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('sorry-im-a-cop-v2-opening-legal-acceptance') ?? '{}').version)
    ).toBe(OPENING_LEGAL_DISCLAIMER_VERSION);
    await page.evaluate(() => localStorage.removeItem('sorry-im-a-cop-v2-opening-legal-acceptance'));
    await page.getByRole('button', { name: /确认生成/ }).click();
    await page.getByRole('button', { name: '生成开局' }).click();

    dialog = page.getByRole('dialog', { name: '《对唔住，我系差人》' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Sorry, I'm a Cop", { exact: true })).toBeVisible();
    await expect(dialog.getByText(`版本日期：${OPENING_LEGAL_DISCLAIMER_VERSION_LABEL}`)).toBeVisible();
    await expect(dialog.getByText('kale014@gmail.com')).toBeAttached();
    await expect(dialog.getByText(/待配置/)).toHaveCount(0);
    const acceptButton = dialog.getByRole('button', { name: '同意并生成开局' });
    await expect(acceptButton).toBeDisabled();

    const desktopLayout = await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const copy = element.querySelector<HTMLElement>('.opening-legal-copy');
      const footer = element.querySelector<HTMLElement>('.opening-legal-footer');
      return {
        withinViewport: bounds.left >= 0 && bounds.right <= window.innerWidth && bounds.top >= 0 && bounds.bottom <= window.innerHeight,
        copyScrolls: Boolean(copy && copy.scrollHeight > copy.clientHeight),
        footerVisible: Boolean(footer && footer.getBoundingClientRect().bottom <= bounds.bottom)
      };
    });
    expect(desktopLayout).toEqual({ withinViewport: true, copyScrolls: true, footerVisible: true });

    await dialog.getByRole('checkbox').check();
    await expect(acceptButton).toBeEnabled();
    await dialog.getByRole('button', { name: '不同意并返回' }).click();
    await expect(dialog).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '生成开局' }).click();
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const mobileLayout = await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const copy = element.querySelector<HTMLElement>('.opening-legal-copy');
      const footer = element.querySelector<HTMLElement>('.opening-legal-footer');
      return {
        withinViewport: bounds.left >= 0 && bounds.right <= window.innerWidth && bounds.top >= 0 && bounds.bottom <= window.innerHeight,
        copyScrolls: Boolean(copy && copy.scrollHeight > copy.clientHeight),
        footerVisible: Boolean(footer && footer.getBoundingClientRect().bottom <= bounds.bottom)
      };
    });
    expect(mobileLayout).toEqual({ withinViewport: true, copyScrolls: true, footerVisible: true });
  });
});
