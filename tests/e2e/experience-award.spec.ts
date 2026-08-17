import { expect, test } from '@playwright/test';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import { installRuntimeStateSave, loadRuntimeSave } from './fixtures';

test('经验到账与升级提示在桌面及手机宽度保持可见且不溢出', async ({
  page
}) => {
  const runtimeState = createInitialRuntimeState({
    playerName: '经验验收员',
    englishName: 'Experience Tester',
    policeNumber: '4628'
  });
  runtimeState.player.progression = {
    level: 2,
    experience: 10,
    experienceToNextLevel: 200,
    unspentAttributePoints: 5
  };
  runtimeState.storyLog = [
    {
      turnId: 'turn_0001',
      speaker: 'player',
      text: '我根据证物编号重新核对登记时间。',
      gameTime: runtimeState.time
    },
    {
      turnId: 'turn_0001',
      speaker: 'narrator',
      text: '登记簿上的时间差证明了证物曾被提前移动。',
      gameTime: runtimeState.time,
      suggestedActions: ['继续核对签收人'],
      experienceAward: {
        awardId: 'xp:turn_0001',
        turnId: 'turn_0001',
        total: 20,
        sources: [
          {
            kind: 'judgement',
            sourceId: 'judgement:check_xp_e2e',
            amount: 10,
            reason: '困难思考判定成功'
          },
          {
            kind: 'case_progress',
            sourceId: 'case-evidence:evidence_xp_e2e',
            amount: 10,
            reason: '案件取得关键进展'
          }
        ],
        capped: false,
        levelsGained: 1,
        attributePointsGained: 5,
        levelAfter: 2
      }
    }
  ];
  runtimeState.turnCounter = 1;

  await installRuntimeStateSave(page, runtimeState);
  await loadRuntimeSave(page);

  const award = page.getByLabel('本回合经验');
  await expect(award).toBeVisible();
  await expect(award).toContainText('本回合 +20 经验');
  await expect(award).toContainText('困难思考判定成功');
  await expect(award).toContainText('案件取得关键进展');
  await expect(page.getByText('升至 2 级，获得 5 点可分配属性。')).toBeVisible();

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await expect(award).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    ).toBe(true);
  }
});
