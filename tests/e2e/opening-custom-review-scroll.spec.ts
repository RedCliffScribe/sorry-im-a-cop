import { expect, test, type Page } from '@playwright/test';

async function mountWorldpackAdaptationReview(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"]').forEach((node) => node.remove());
    const backdrop = document.createElement('div');
    backdrop.className = 'opening-custom-review-backdrop';
    const dialog = document.createElement('section');
    dialog.className = 'opening-custom-review-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', '确认本局世界包适配');
    dialog.innerHTML = [
      '<header><div><p class="home-kicker">CUSTOM CONTENT ADAPTATION</p>',
      '<h2>确认本局世界包适配</h2></div></header>',
      '<p>以下内容已生成香港 1988 的存档级适配快照。</p>',
      '<div class="opening-custom-review-list" role="region" aria-label="本局世界包适配项目" tabindex="0"></div>',
      '<footer><button>返回修改选择</button><button>确认适配并继续生成</button></footer>'
    ].join('');
    const list = dialog.querySelector('.opening-custom-review-list');
    for (let index = 1; index <= 20; index += 1) {
      const article = document.createElement('article');
      article.innerHTML = [
        `<strong>跨世界人物 ${index}</strong>`,
        '<span>人物 · 待审核</span>',
        '<ul>',
        '<li>适配摘要第一行，说明人物身份与本地世界关系。</li>',
        '<li>适配摘要第二行，说明进入剧情的方式与限制。</li>',
        '<li>适配摘要第三行，说明稳定人物引用。</li>',
        '</ul>'
      ].join('');
      list?.append(article);
    }
    backdrop.append(dialog);
    document.body.append(backdrop);
  });
}

test('worldpack adaptation review keeps a real scroll region on phone and desktop', async ({
  page
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await mountWorldpackAdaptationReview(page);

  const reviewList = page.getByRole('region', {
    name: '本局世界包适配项目'
  });
  const mobileMetrics = await reviewList.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    minHeight: getComputedStyle(element).minHeight,
    overflowY: getComputedStyle(element).overflowY,
    touchAction: getComputedStyle(element).touchAction
  }));
  expect(mobileMetrics.scrollHeight).toBeGreaterThan(mobileMetrics.clientHeight);
  expect(mobileMetrics.minHeight).toBe('0px');
  expect(mobileMetrics.overflowY).toBe('auto');
  expect(mobileMetrics.touchAction).toBe('pan-y');

  await reviewList.hover();
  await page.mouse.wheel(0, 900);
  await expect
    .poll(() => reviewList.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  const mobileFooter = page
    .getByRole('dialog', { name: '确认本局世界包适配' })
    .locator('footer');
  await expect(mobileFooter).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  await mountWorldpackAdaptationReview(page);
  const desktopList = page.getByRole('region', {
    name: '本局世界包适配项目'
  });
  expect(
    await desktopList.evaluate(
      (element) => element.scrollHeight > element.clientHeight
    )
  ).toBe(true);
  await desktopList.hover();
  await page.mouse.wheel(0, 1200);
  await expect
    .poll(() => desktopList.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(
    page
      .getByRole('dialog', { name: '确认本局世界包适配' })
      .locator('footer')
  ).toBeInViewport();
  expect(consoleErrors).toEqual([]);
});
