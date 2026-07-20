import { expect, test } from '@playwright/test';
import { createBatch3aRuntimeState } from './batch3a-fixture';
import { dismissDailyChangelog, installRuntimeStateSave, loadRuntimeSave } from './fixtures';

test.describe('怀孕生命周期界面', () => {
  test('游戏设置可切换并保存怀孕机制强度', async ({ page }) => {
    await page.goto('/');
    await dismissDailyChangelog(page);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '游戏设置', exact: true }).click();

    const pregnancyMode = page.getByLabel('怀孕机制强度');
    await expect(pregnancyMode).toHaveValue('standard');
    await pregnancyMode.selectOption('high');
    await expect(pregnancyMode).toHaveValue('high');

    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '游戏设置', exact: true }).click();
    await expect(page.getByLabel('怀孕机制强度')).toHaveValue('high');
  });

  test('人物志显示孕期阶段和日期但不泄露隐藏候选或随机值', async ({ page }) => {
    const state = createBatch3aRuntimeState();
    const lily = state.actors.npc_lily;
    lily.femaleProfile = {
      ...lily.femaleProfile,
      adultPrivateProfile: {
        enabled: true,
        ageConfirmedAdult: false,
        profileStatus: 'ready',
        womb: {
          status: '待验孕',
          cervixStatus: '紧闭',
          records: [
            {
              date: '1984-12-27',
              description: '已登记一次明确的受孕风险。',
              pregnancyCheckDate: '1985-01-19'
            }
          ],
          pregnancy: {
            pregnancyId: 'preg_npc_lily_19841227_e2e',
            status: 'pending_check',
            registeredAt: { year: 1984, month: 12, day: 27, hour: 18, minute: 15 },
            checkDueAt: { year: 1985, month: 1, day: 19, hour: 18, minute: 15 },
            confirmationDueAt: { year: 1985, month: 2, day: 10, hour: 18, minute: 15 },
            deliveryWindowAt: { year: 1985, month: 9, day: 13, hour: 18, minute: 15 },
            dueAt: { year: 1985, month: 9, day: 23, hour: 18, minute: 15 },
            deliveryDeadlineAt: { year: 1985, month: 10, day: 3, hour: 18, minute: 15 },
            chancePercent: 20,
            rollPercent: 7.321,
            riskTypes: ['unprotected'],
            riskSummaries: ['已登记一次明确的受孕风险。'],
            paternityCandidates: [
              { actorId: 'player', name: '玩家', visibility: 'player_known' },
              { actorId: 'npc_secret', name: '隐藏候选人', visibility: 'hidden' }
            ]
          }
        },
        partProfiles: {
          胸部: { description: '乳房外观档案已记录。' },
          小穴: { description: '小穴外观档案已记录。' },
          屁穴: { description: '屁穴外观档案已记录。' }
        }
      }
    };

    await installRuntimeStateSave(page, state);
    await loadRuntimeSave(page);
    await page.getByRole('button', { name: '人物志', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '人物志' });
    await dialog.getByRole('button', { name: /何丽莲/ }).click();
    await dialog.getByText('女性档案', { exact: true }).click();
    await dialog.getByText('香闺秘档', { exact: true }).click();

    await expect(dialog.getByText('待验孕', { exact: true })).toBeVisible();
    await expect(dialog.getByText('1985年1月19日 18:15')).toBeVisible();
    await expect(dialog.getByText('玩家', { exact: true })).toBeVisible();
    await expect(dialog.getByText('结果尚未揭晓，存档与读档不会重新掷骰。')).toBeVisible();
    await expect(dialog.getByText('隐藏候选人', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('7.321', { exact: true })).toHaveCount(0);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
});
