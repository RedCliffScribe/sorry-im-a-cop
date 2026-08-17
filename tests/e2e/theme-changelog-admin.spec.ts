import { expect, test } from '@playwright/test';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import { releaseNotes } from '../../src/app/changelog/releaseNotes';
import { dismissDailyChangelog, installRuntimeStateSave, loadRuntimeSave } from './fixtures';

const changelogStorageKey = 'sorry-im-a-cop-v2-changelog-daily-view';

const analyticsPayload = {
  ok: true,
  generatedAt: '2026-07-20T12:00:00.000Z',
  timezone: 'Asia/Shanghai',
  onlineWindowSeconds: 120,
  summary: {
    currentOnline: 7,
    todayPeakOnline: 18,
    todayUniqueVisitors: 42,
    todayPageViews: 96,
    todaySessions: 54,
    totalVisitors: 812,
    totalSessions: 1_204,
    returningVisitors: 318,
    active7d: 210,
    active30d: 601,
    averageSessionMinutes: 28.4,
    lastEventAt: '2026-07-20T11:59:30.000Z'
  },
  daily: [
    { day: '2026-07-19', page_views: 80, sessions_started: 45, unique_visitors: 35, peak_online: 12 },
    { day: '2026-07-20', page_views: 96, sessions_started: 54, unique_visitors: 42, peak_online: 18 }
  ],
  regions: [{ country_code: 'HK', region: 'Kowloon', city: 'Hong Kong', visitors: 28 }],
  languages: [{ language: 'zh-CN', visitors: 42 }],
  devices: [{ device_class: 'desktop', visitors: 30, average_width: 1440 }],
  versions: [{ app_version: '1.0.0', visitors: 42 }],
  referrers: [{ referrer_host: 'direct', sessions: 40 }]
};

test.describe('明快主题、更新日志与运营后台', () => {
  test('最新日志每日首次自动出现、可逐条查看并从首页再次打开', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((key) => localStorage.removeItem(key), changelogStorageKey);
    await page.reload();

    let dialog = page.getByRole('dialog', { name: '更新日志' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: releaseNotes[0].updates[0].title })
    ).toBeVisible();
    await expect(
      dialog.getByText(releaseNotes[0].updates[0].time, { exact: true })
    ).toBeVisible();
    await expect(
      dialog
        .getByLabel(releaseNotes[0].updates[0].title)
        .getByText(releaseNotes[0].updates[0].version, { exact: true })
    ).toBeVisible();
    await expect(
      dialog.getByText(`1 / ${releaseNotes.length}`, { exact: true })
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: /较新一条/ })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: '较早一条 →' })).toBeVisible();
    await dialog.getByRole('button', { name: '较早一条 →' }).click();
    await expect(
      dialog.getByRole('heading', { name: releaseNotes[1].updates[0].title })
    ).toBeVisible();
    await expect(
      dialog.getByText(`2 / ${releaseNotes.length}`, { exact: true })
    ).toBeVisible();
    await dialog.getByRole('button', { name: '较早一条 →' }).click();
    await expect(
      dialog.getByRole('heading', { name: releaseNotes[2].updates[0].title })
    ).toBeVisible();
    await expect(
      dialog.getByText(`3 / ${releaseNotes.length}`, { exact: true })
    ).toBeVisible();
    await dialog.getByRole('button', { name: '关闭更新日志' }).click();

    await page.reload();
    await expect(page.getByRole('dialog', { name: '更新日志' })).toHaveCount(0);
    await page.getByRole('button', { name: /更新日志/ }).click();
    dialog = page.getByRole('dialog', { name: '更新日志' });
    await expect(dialog).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        withinViewport: rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight,
        pageHasNoHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth
      };
    });
    expect(bounds).toEqual({ withinViewport: true, pageHasNoHorizontalOverflow: true });
  });

  test('明快主题即时生效并跨刷新保存，但首页始终保持暗色夜景', async ({ page }) => {
    const runtimeState = createInitialRuntimeState({
      playerName: '周星星',
      englishName: 'Stephen Chow',
      policeNumber: '1642'
    });
    runtimeState.storyLog = [
      {
        turnId: 'turn_1',
        speaker: 'player',
        text: '我先请她坐下，把今晚的事情慢慢讲清楚。',
        gameTime: runtimeState.time
      },
      {
        turnId: 'turn_1',
        speaker: 'narrator',
        text: '【旁白】窗外的霓虹掠过百叶窗，在桌面留下缓慢移动的光。\n【钟楚虹】我记得那辆车的颜色，也记得司机说话的口音。',
        gameTime: runtimeState.time,
        suggestedActions: ['追问车牌', '核对时间', '请她辨认照片']
      }
    ];
    runtimeState.turnCounter = 1;
    await installRuntimeStateSave(page, runtimeState);
    const readHomeVisualSignature = () => page.evaluate(() => {
      const styleOf = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`缺少首页验收节点：${selector}`);
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          borderColor: style.borderColor,
          boxShadow: style.boxShadow,
          color: style.color,
          filter: style.filter
        };
      };

      return {
        backdrop: styleOf('.home-backdrop'),
        shade: styleOf('.home-shade'),
        panel: styleOf('.home-panel'),
        primaryAction: styleOf('.home-actions button:first-child'),
        secondaryAction: styleOf('.home-actions button:nth-child(2)'),
        changelogButton: styleOf('.home-changelog-button'),
        releaseFooter: styleOf('.home-release-footer')
      };
    });
    const darkHomeSignature = await readHomeVisualSignature();

    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '显示设置', exact: true }).click();
    await page.getByLabel('界面主题').selectOption('light');

    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'light');
    await expect(page.getByText('米白纸张、浅蓝灰框架与深色文字，适合明亮环境和长时间阅读。')).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const value = localStorage.getItem('sorry-im-a-cop-v2-ai-settings');
      return value ? JSON.parse(value).display?.uiTheme : null;
    })).toBe('light');

    const settingsColors = await page.locator('.settings-screen').evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    expect(settingsColors.background).not.toBe('rgb(4, 10, 14)');
    expect(settingsColors.color).not.toBe('rgb(231, 238, 242)');

    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    await page.reload();
    await dismissDailyChangelog(page);
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'dark');
    await expect(page.locator('.app-font-root')).toHaveAttribute('data-ui-theme', 'dark');
    await expect(page.locator('.home-backdrop')).toBeVisible();
    expect(await readHomeVisualSignature()).toEqual(darkHomeSignature);

    await loadRuntimeSave(page);
    await expect(page.getByLabel('游戏界面')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'light');
    await expect(page.locator('.app-font-root')).toHaveAttribute('data-ui-theme', 'light');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const contrastReport = await page.evaluate(() => {
      const targets = [
        '.story-segment-narration',
        '.story-dialogue-speaker',
        '.story-segment-dialogue p',
        '.story-entry-player p',
        '.player-other-info dt',
        '.player-other-info dd',
        '.game-time-block strong',
        '.game-weather-trigger',
        '.game-panel-nav button',
        '.game-footer-turn'
      ];

      const parseColor = (value: string) => {
        const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!match) throw new Error(`无法解析颜色：${value}`);
        return {
          red: Number(match[1]),
          green: Number(match[2]),
          blue: Number(match[3]),
          alpha: match[4] === undefined ? 1 : Number(match[4])
        };
      };
      const linear = (channel: number) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (color: ReturnType<typeof parseColor>) =>
        0.2126 * linear(color.red) + 0.7152 * linear(color.green) + 0.0722 * linear(color.blue);
      const contrast = (foreground: ReturnType<typeof parseColor>, background: ReturnType<typeof parseColor>) => {
        const high = Math.max(luminance(foreground), luminance(background));
        const low = Math.min(luminance(foreground), luminance(background));
        return (high + 0.05) / (low + 0.05);
      };
      const findOpaqueBackground = (element: Element) => {
        let current: Element | null = element;
        while (current) {
          const color = parseColor(getComputedStyle(current).backgroundColor);
          if (color.alpha === 1) return color;
          current = current.parentElement;
        }
        return parseColor('rgb(255, 255, 255)');
      };

      return targets.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`缺少对比度验收节点：${selector}`);
        const foreground = parseColor(getComputedStyle(element).color);
        const background = findOpaqueBackground(element);
        return {
          selector,
          color: getComputedStyle(element).color,
          background: `rgb(${background.red}, ${background.green}, ${background.blue})`,
          ratio: Number(contrast(foreground, background).toFixed(2))
        };
      });
    });

    for (const entry of contrastReport) {
      expect(entry.ratio, `${entry.selector} 对比度不足：${JSON.stringify(entry)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('统计后台使用令牌读取聚合数据，并在移动端保持可用', async ({ page }) => {
    let authorization = '';
    await page.route('**/api/admin/analytics', async (route) => {
      authorization = route.request().headers().authorization ?? '';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analyticsPayload) });
    });

    await page.goto('/admin/analytics');
    const login = page.getByRole('region', { name: '后台登录' });
    await login.getByLabel('后台访问令牌').fill('test-private-token');
    await login.getByRole('button', { name: '进入后台' }).click();

    await expect(page.getByRole('heading', { name: '公开版运行统计' })).toBeVisible();
    await expect(page.getByText('最近活跃', { exact: true })).toBeVisible();
    await expect(page.getByText('累计独立访客')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'IP 归属地区' })).toBeVisible();
    await expect(page.getByText('812')).toBeVisible();
    expect(authorization).toBe('Bearer test-private-token');

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
