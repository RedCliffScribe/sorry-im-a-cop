import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHANGELOG_STORAGE_KEY,
  formatLocalDateKey,
  recordDailyChangelogView,
  releaseNotes as currentReleaseNotes,
  shouldShowDailyChangelog
} from './releaseNotes';
import { APP_VERSION_LABEL } from '../releaseIdentity';

const previousReleaseNotes = currentReleaseNotes.slice(1);
const historicalReleaseNotes = currentReleaseNotes.slice(9);
const releaseNotes = historicalReleaseNotes.slice(4);

describe('releaseNotes', () => {
  beforeEach(() => localStorage.clear());

  it('groups updates by day and keeps every day newest-first with explicit times', () => {
    expect(currentReleaseNotes[0]?.updates[0]?.version).toBe(APP_VERSION_LABEL);
    expect(currentReleaseNotes[0]).toMatchObject({
      id: '2026-08-17',
      updates: [
        {
          id: '2026-08-17-v2.0.4-opening-profile-responsive-layout',
          time: '23:08',
          version: 'v2.0.4',
          title: '开局基础档案布局适配'
        },
        {
          id: '2026-08-17-v2.0.3-vacant-flat-exposure-continuity',
          time: '21:22',
          version: 'v2.0.3',
          title: '《空屋来电》防重复加固'
        }
      ]
    });
    expect(previousReleaseNotes[0]).toMatchObject({
      id: '2026-08-13',
      updates: [
        {
          id: '2026-08-13-v2.0.2-duty-and-work-schedules',
          time: '00:01',
          version: 'v2.0.2',
          title: '警察值班与市民上班安排'
        }
      ]
    });
    expect(previousReleaseNotes[1]).toMatchObject({
      id: '2026-08-12',
      updates: [
        {
          id: '2026-08-12-v2.0.1-character-candidate-silhouette-fix',
          time: '18:42',
          version: 'v2.0.1',
          title: '修复角色候选图误生成黑色剪影'
        },
        {
          id: '2026-08-12-v2.0.0-avg-story-presentation',
          time: '12:42',
          version: 'v2.0.0',
          title: 'AVG 正文演出正式上线'
        },
        {
          id: '2026-08-12-v1.7.81-urban-legends-save-deduplication',
          time: '11:05',
          version: 'v1.7.81',
          title: '都市怪谈同局去重加固'
        },
        {
          id: '2026-08-12-v1.7.80-balanced-judgement-rolls',
          time: '00:06',
          version: 'v1.7.80',
          title: '判定骰点分布优化'
        }
      ]
    });
    expect(previousReleaseNotes[2]).toMatchObject({
      id: '2026-08-11',
      updates: [
        {
          id: '2026-08-11-v1.7.79-urban-legends-incident-continuity',
          time: '23:32',
          version: 'v1.7.79',
          title: '都市怪谈持续事件防重复'
        }
      ]
    });
    expect(previousReleaseNotes[3]).toMatchObject({
      id: '2026-08-10',
      updates: [
        {
          id: '2026-08-10-v1.7.78-judgement-difficulty-balance',
          time: '21:09',
          version: 'v1.7.78',
          title: '判定难度与危险场景平衡'
        },
        {
          id: '2026-08-10-v1.7.77-relationship-repair-contract',
          time: '19:42',
          version: 'v1.7.77',
          title: '人脉缘分写回修复加固'
        }
      ]
    });
    expect(previousReleaseNotes[4]).toMatchObject({
      id: '2026-08-09',
      updates: [
        {
          id: '2026-08-09-v1.7.76-pregnancy-lifecycle-sync',
          time: '22:01',
          version: 'v1.7.76',
          title: '妊娠状态与记录同步修复'
        },
        {
          id: '2026-08-09-v1.7.75-existing-save-official-dlc-attachment',
          time: '00:39',
          version: 'v1.7.75',
          title: '已有存档可加入都市怪谈'
        }
      ]
    });
    expect(previousReleaseNotes[5]).toMatchObject({
      id: '2026-08-07',
      updates: [
        {
          id: '2026-08-07-v1.7.74-character-archive-manual-editing',
          time: '12:03',
          version: 'v1.7.74',
          title: '人物志资料手动修改'
        },
        {
          id: '2026-08-07-v1.7.73-relationship-profile-continuity',
          time: '11:17',
          version: 'v1.7.73',
          title: '人物关系档案同步修复'
        }
      ]
    });
    expect(previousReleaseNotes[6]).toMatchObject({
      id: '2026-08-06',
      updates: [
        {
          id: '2026-08-06-v1.7.72-npc-evolution-memory-continuity',
          time: '23:59',
          version: 'v1.7.72',
          title: '远场人物记忆衔接修复'
        },
        {
          id: '2026-08-06-v1.7.71-urban-legends-content-expansion',
          time: '22:54',
          version: 'v1.7.71',
          title: '都市怪谈内容扩展'
        },
        {
          id: '2026-08-06-v1.7.70-urban-legends-official-dlc-release',
          time: '21:10',
          version: 'v1.7.70',
          title: '都市怪谈官方 DLC 上线'
        },
        {
          id: '2026-08-06-v1.7.69-urban-legends-formal-content',
          time: '20:50',
          version: 'v1.7.69',
          title: '都市怪谈正式内容完成'
        },
        {
          id: '2026-08-06-v1.7.68-official-dlc-narrative-arc-foundation',
          time: '20:30',
          version: 'v1.7.68',
          title: '官方 DLC 与长期剧情弧底座'
        }
      ]
    });
    expect(previousReleaseNotes[7]).toMatchObject({
      id: '2026-08-05',
      updates: [
        {
          id: '2026-08-05-v1.7.67-relationship-manual-deletion',
          time: '22:18',
          version: 'v1.7.67',
          title: '人脉与缘分手动删除'
        },
        {
          id: '2026-08-05-v1.7.66-external-case-lead-recovery',
          time: '19:44',
          version: 'v1.7.66',
          title: '案件主办者写回修复'
        },
        {
          id: '2026-08-05-v1.7.65-relationship-identity-continuity',
          time: '17:27',
          version: 'v1.7.65',
          title: '人脉缘分与人物身份连续性修复'
        },
        {
          id: '2026-08-05-v1.7.64-npc-memory-time-anchors',
          time: '13:40',
          version: 'v1.7.64',
          title: '人物记忆日期稳定性修复'
        },
        {
          id: '2026-08-05-v1.7.63-finance-ledger-entry-time',
          time: '11:46',
          version: 'v1.7.63',
          title: '收支明细时间显示'
        }
      ]
    });
    expect(historicalReleaseNotes[0]).toMatchObject({
      id: '2026-08-03',
      updates: [
        {
          id: '2026-08-03-v1.7.62-workshop-uploader-download-count',
          time: '20:00',
          version: 'v1.7.62',
          title: '创意工坊作者与下载量展示'
        },
        {
          id: '2026-08-03-v1.7.61-police-identity-visual-link-recovery',
          time: '19:42',
          version: 'v1.7.61',
          title: '警务身份与人物头像关联修复'
        },
        {
          id: '2026-08-03-v1.7.60-writeback-final-reconciliation',
          time: '19:01',
          version: 'v1.7.60',
          title: '写回修复结果对账优化'
        },
        {
          id: '2026-08-03-v1.7.59-player-condition-lifecycle',
          time: '18:59',
          version: 'v1.7.59',
          title: '玩家身体状态生命周期修复'
        },
        {
          id: '2026-08-03-v1.7.58-finance-ledger-layout',
          time: '17:01',
          version: 'v1.7.58',
          title: '近期收支浏览优化'
        },
        {
          id: '2026-08-03-v1.7.57-online-creative-workshop-preview',
          time: '15:48',
          version: 'v1.7.57',
          title: '联网创意工坊首期预览'
        }
      ]
    });
    expect(historicalReleaseNotes[1]).toMatchObject({
      id: '2026-08-02',
      updates: [
        {
          id: '2026-08-02-v1.7.56-actor-backlog-save-repair',
          time: '23:40',
          version: 'v1.7.56',
          title: '人物建档欠账与存档修复'
        },
        {
          id: '2026-08-02-v1.7.55-relationship-history-guard',
          time: '23:38',
          version: 'v1.7.55',
          title: '人脉历史保留加固'
        },
        {
          id: '2026-08-02-v1.7.54-finance-ledger-recovery',
          time: '23:36',
          version: 'v1.7.54',
          title: '收支明细恢复修复'
        },
        {
          id: '2026-08-02-v1.7.53-image-network-diagnostics',
          time: '23:34',
          version: 'v1.7.53',
          title: '文生图网络诊断增强'
        },
        {
          id: '2026-08-02-v1.7.52-online-presence-efficiency',
          time: '23:32',
          version: 'v1.7.52',
          title: '在线统计降频与口径优化'
        },
        {
          id: '2026-08-02-v1.7.51-fixed-settings-boundaries',
          time: '22:05',
          version: 'v1.7.51',
          title: '设置固定规则显示修复'
        },
        {
          id: '2026-08-02-v1.7.50-mobile-fixed-asset-scroll',
          time: '19:34',
          version: 'v1.7.50',
          title: '手机版固定资产详情滑动修复'
        },
        {
          id: '2026-08-02-v1.7.49-historical-action-regeneration',
          time: '00:59',
          version: 'v1.7.49',
          title: '过往行动原位重发修复'
        },
        {
          id: '2026-08-02-v1.7.48-asset-removal-recovery-diagnostics',
          time: '00:37',
          version: 'v1.7.48',
          title: '资产移除写回与诊断修复'
        },
        {
          id: '2026-08-02-v1.7.47-relationship-continuity-evolution',
          time: '00:18',
          version: 'v1.7.47',
          title: '人脉缘分延续与人物推演修复'
        }
      ]
    });
    expect(historicalReleaseNotes[2]).toMatchObject({
      id: '2026-08-01',
      updates: [
        {
          id: '2026-08-01-v1.7.46-judgement-preflight-budget',
          time: '23:48',
          version: 'v1.7.46',
          title: '判定预检截断修复'
        },
        {
          id: '2026-08-01-v1.7.45-overall-reputation-sync',
          time: '23:09',
          version: 'v1.7.45',
          title: '整体口碑联动修复'
        },
        {
          id: '2026-08-01-v1.7.44-case-lead-owner-sync',
          time: '21:31',
          version: 'v1.7.44',
          title: '案件主办者同步修复'
        },
        {
          id: '2026-08-01-v1.7.43-comfy-workflow-delete',
          time: '20:48',
          version: 'v1.7.43',
          title: 'ComfyUI 工作流管理优化'
        },
        {
          id: '2026-08-01-v1.7.42-dialogue-avatar-layout',
          time: '20:45',
          version: 'v1.7.42',
          title: '正文头像对白排版优化'
        },
        {
          id: '2026-08-01-v1.7.41-case-writeback-recovery',
          time: '16:58',
          version: 'v1.7.41',
          title: '案件档案写回稳定性修复'
        },
        {
          id: '2026-08-01-v1.7.40-current-player-node-usage',
          time: '15:54',
          version: 'v1.7.40',
          title: '自定义事件主角节点绑定修复'
        },
        {
          id: '2026-08-01-v1.7.39-signal-lifecycle-archive',
          time: '15:15',
          version: 'v1.7.39',
          title: '风声生命周期与手动归档'
        },
        {
          id: '2026-08-01-v1.7.38-custom-events-player-portraits',
          time: '13:26',
          version: 'v1.7.38',
          title: '自定义事件角色与主角头像优化'
        },
        {
          id: '2026-08-01-v1.7.37-settings-scroll-boundary',
          time: '01:15',
          version: 'v1.7.37',
          title: '设置页面滚动显示修复'
        }
      ]
    });
    expect(historicalReleaseNotes[3]).toMatchObject({
      id: '2026-07-31',
      updates: [{
        id: '2026-07-31-v1.7.36-ai-process-trace',
        time: '22:24',
        version: 'v1.7.36',
        title: 'AI 处理轨迹与请求状态'
      }]
    });
    expect(releaseNotes).toHaveLength(11);
    expect(releaseNotes.map((entry) => entry.id)).toEqual([
      '2026-07-30',
      '2026-07-29',
      '2026-07-28',
      '2026-07-27',
      '2026-07-26',
      '2026-07-25',
      '2026-07-24',
      '2026-07-23',
      '2026-07-22',
      '2026-07-21',
      '2026-07-20'
    ]);
    expect(releaseNotes[0].updates.map((update) => update.id)).toEqual([
      '2026-07-30-v1.7.35-period-news-focus',
      '2026-07-30-v1.7.34-avg-art-production-spec',
      '2026-07-30-v1.7.33-era-figures-avg-design',
      '2026-07-30-v1.7.32-story-scene-planning-recovery',
      '2026-07-30-v1.7.31-turn-request-diagnostics',
      '2026-07-30-v1.7.30-event-character-opening-binding',
      '2026-07-30-v1.7.29-event-character-reuse'
    ]);
    expect(releaseNotes[0].updates.map((update) => update.time)).toEqual([
      '21:09',
      '21:01',
      '20:57',
      '14:13',
      '14:10',
      '12:09',
      '00:31'
    ]);
    expect(releaseNotes[0].updates[0].title).toBe(
      '香港报刊新闻聚焦优化'
    );
    expect(releaseNotes[0].updates[0].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('默认新闻价值'),
        expect.stringContaining('多个版面'),
        expect.stringContaining('同一套新闻价值判断')
      ])
    );
    expect(releaseNotes[0].updates[1].title).toBe(
      '香港 1988 AVG 美术生产规范'
    );
    expect(releaseNotes[0].updates[1].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('统一要求'),
        expect.stringContaining('单独授权')
      ])
    );
    expect(releaseNotes[0].updates[2].title).toBe(
      '资料库人物追加与 AVG 设计准备'
    );
    expect(releaseNotes[0].updates[2].items).toEqual(
      expect.arrayContaining([
        '追加了资料库人物。',
        expect.stringContaining('设计文档')
      ])
    );
    expect(releaseNotes[0].updates[3].title).toBe(
      '正文场景图规划恢复'
    );
    expect(releaseNotes[0].updates[3].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('安全整理'),
        expect.stringContaining('完整链路'),
        expect.stringContaining('尚未调用')
      ])
    );
    expect(releaseNotes[1].updates.map((update) => update.id)).toEqual([
      '2026-07-29-v1.7.28-worldpack-adaptation-scroll',
      '2026-07-29-v1.7.27-png-style-import',
      '2026-07-29-v1.7.26-first-act-opening-recovery',
      '2026-07-29-v1.7.25-weather-pacing',
      '2026-07-29-v1.7.24-local-experience-settlement',
      '2026-07-29-v1.7.23-novelai-combined-style',
      '2026-07-29-v1.7.22-police-command-ranks',
      '2026-07-29-v1.7.21-vehicle-writeback-visibility',
      '2026-07-29-v1.7.20-custom-character-generation-recovery',
      '2026-07-29-v1.7.19-opening-local-recovery-age-input'
    ]);
    expect(releaseNotes[1].updates.map((update) => update.time)).toEqual([
      '21:47',
      '19:58',
      '17:40',
      '14:23',
      '13:33',
      '11:40',
      '09:31',
      '09:27',
      '09:24',
      '09:19'
    ]);
    expect(releaseNotes[1].updates[0].title).toBe(
      '开局世界包适配弹窗滚动修复'
    );
    expect(releaseNotes[1].updates[0].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('独立上下滚动'),
        expect.stringContaining('手机实际可视高度'),
        expect.stringContaining('阻止滚动继续穿透')
      ])
    );
    expect(releaseNotes[1].updates[1].title).toBe(
      'PNG 画风导入与跨模型复用'
    );
    expect(releaseNotes[1].updates[1].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('一次性人物'),
        expect.stringContaining('原样保留画师标签'),
        expect.stringContaining('分别设为全局、指定人物或场景风格'),
        expect.stringContaining('不会被自动加载或执行')
      ])
    );
    expect(releaseNotes[1].updates[2].title).toBe(
      '经典港味第一幕人物开局修复'
    );
    expect(releaseNotes[1].updates[2].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('局部修复'),
        expect.stringContaining('不会取代职业事项'),
        expect.stringContaining('稳定人物 ID'),
        expect.stringContaining('不会被 AI 擅自标记')
      ])
    );
    expect(releaseNotes[1].updates[3].title).toBe(
      '香港天气节奏与连续降雨优化'
    );
    expect(releaseNotes[1].updates[3].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('默认 1988 开局不再固定细雨'),
        expect.stringContaining('普通降雨不会连续超过两个天气段'),
        expect.stringContaining('不会重设开始时间或截止时间')
      ])
    );
    expect(releaseNotes[1].updates[4].title).toBe(
      '经验结算与成长反馈优化'
    );
    expect(releaseNotes[1].updates[4].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('失败与大失败'),
        expect.stringContaining('无进展回合'),
        expect.stringContaining('稳定回合与来源标识'),
        expect.stringContaining('升级')
      ])
    );
    expect(releaseNotes[1].updates[5].title).toBe(
      'NovelAI 成熟柔绘轻写实预设'
    );
    expect(releaseNotes[1].updates[5].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('一套完整预设'),
        expect.stringContaining('手绘动漫插画'),
        expect.stringContaining('已有玩家提示词设置')
      ])
    );
    expect(releaseNotes[1].updates[6].title).toBe(
      '高级警衔、肩章与薪资档案补全'
    );
    expect(releaseNotes[1].updates[6].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('警务处长'),
        expect.stringContaining('肩章星徽'),
        expect.stringContaining('工资流水')
      ])
    );
    expect(releaseNotes[1].updates[7].title).toBe(
      '车辆购买写回与资产可见性修复'
    );
    expect(releaseNotes[1].updates[7].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('逐字段整理'),
        expect.stringContaining('购车扣款'),
        expect.stringContaining('交通工具概览')
      ])
    );
    expect(releaseNotes[1].updates[8].title).toBe(
      '自定义人物 AI 生成宽容化'
    );
    expect(releaseNotes[1].updates[8].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('本地整理'),
        expect.stringContaining('最多只请求一次'),
        expect.stringContaining('工作草稿')
      ])
    );
    expect(releaseNotes[1].updates[9].title).toBe(
      '开局局部恢复与年龄输入修复'
    );
    expect(releaseNotes[1].updates[9].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('逐位输入'),
        expect.stringContaining('普通社会关系'),
        expect.stringContaining('32K／64K')
      ])
    );
    expect(releaseNotes[2].updates.map((update) => update.id)).toEqual([
      '2026-07-28-v1.7.18-opening-memory-output-budget',
      '2026-07-28-v1.7.17-comfyui-workflow-file-import',
      '2026-07-28-v1.7.16-custom-content-selection-priority',
      '2026-07-28-v1.7.15-custom-content-delete-status',
      '2026-07-28-v1.7.14-opening-judgement-stability-v2',
      '2026-07-28-v1.7.13-relationship-evidence-recovery',
      '2026-07-28-v1.7.12-character-revision-lazy-adaptation'
    ]);
    expect(releaseNotes[2].updates.map((update) => update.time)).toEqual([
      '23:19',
      '20:53',
      '19:11',
      '18:20',
      '17:45',
      '09:01',
      '08:13'
    ]);
    expect(releaseNotes[2].updates[0].title).toBe(
      '开局人物记忆与输出上限修复'
    );
    expect(releaseNotes[2].updates[0].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('字符串记忆'),
        expect.stringContaining('统一取最小值'),
        expect.stringContaining('限制来源')
      ])
    );
    expect(releaseNotes[2].updates[1].title).toBe(
      'ComfyUI 工作流文件导入'
    );
    expect(releaseNotes[2].updates[1].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('工作流文件入口'),
        expect.stringContaining('SaveImage'),
        expect.stringContaining('Export Workflow (API)')
      ])
    );
    expect(releaseNotes[2].updates[2].title).toBe(
      '更多自定义人物与事件加入本局'
    );
    expect(releaseNotes[2].updates[2].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('上限由 3 项提高到 20 项'),
        expect.stringContaining('最多 3 项可设为本局重点'),
        expect.stringContaining('管理／加入本局内容')
      ])
    );
    expect(releaseNotes[2].updates[3].title).toBe(
      '自定义人物与事件管理优化'
    );
    expect(releaseNotes[2].updates[3].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('永久删除按钮'),
        expect.stringContaining('拒绝物理删除'),
        expect.stringContaining('已启用内容改为绿色')
      ])
    );
    expect(releaseNotes[2].updates[4].title).toBe(
      '开局与本地判定稳定性 V2'
    );
    expect(releaseNotes[2].updates[4].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('重试当前阶段'),
        expect.stringContaining('唯一 d100'),
        expect.stringContaining('独立对抗档案')
      ])
    );
    expect(releaseNotes[2].updates[5].title).toBe(
      '人脉与缘分关系建立修复'
    );
    expect(releaseNotes[2].updates[5].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('只移除该项'),
        expect.stringContaining('至少两条不同证据'),
        expect.stringContaining('不能虚构第二条证据')
      ])
    );
    expect(releaseNotes[3].updates.map((update) => update.id)).toEqual([
      '2026-07-27-v1.7.11-judgement-intent-recovery',
      '2026-07-27-v1.7.10-offscreen-opening-actors',
      '2026-07-27-v1.7.9-novelai-v4-protocol',
      '2026-07-27-v1.7.8-local-judgement-correction',
      '2026-07-27-v1.7.7-immersive-opening-recovery',
      '2026-07-27-v1.7.6-custom-progression-judgement-details',
      '2026-07-27-v1.7.5-judgement-retry-recovery',
      '2026-07-27-v1.7.4-mobile-dialogue-layout',
      '2026-07-27-v1.7.3-npc-library-import',
      '2026-07-27-v1.7.2-image-api-address',
      '2026-07-27-v1.7.1-local-judgement-real-api',
      '2026-07-27-v1.7.0-local-judgement',
      '2026-07-27-v1.6.1-cantonese-flavor',
      '2026-07-27-v1.6.0-image-generation',
      '2026-07-27-v1.6.0-worldpack-custom-content',
      '2026-07-27-v1.6.0-identity-writeback'
    ]);
    expect(releaseNotes[3].updates.map((update) => update.time)).toEqual([
      '23:59',
      '23:40',
      '21:55',
      '21:05',
      '19:58',
      '19:19',
      '17:19',
      '16:51',
      '16:22',
      '15:59',
      '15:14',
      '14:09',
      '13:38',
      '12:09',
      '12:08',
      '12:07'
    ]);
    expect(releaseNotes[3].updates[0].title).toBe(
      '判定、开局与自定义事件推进修复'
    );
    expect(releaseNotes[3].updates[0].items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('只允许 AI 返回指定字段补丁'),
        expect.stringContaining('远场亲属和离场同僚'),
        expect.stringContaining('当前阶段、已经采用的节点'),
        expect.stringContaining('不再自动占用三个“本局重点”名额')
      ])
    );
    expect(releaseNotes[3].updates[1].title).toBe('远场人物开局稳定性修复');
    expect(releaseNotes[3].updates[2].title).toBe('NovelAI V4/V4.5 生图修复');
    expect(releaseNotes[3].updates[3].title).toBe('判定校正与回合稳定性修复');
    expect(releaseNotes[4].updates.map((update) => update.id)).toEqual([
      '2026-07-26-v1.5.9-custom-content-evolution',
      '2026-07-26-v1.5.8-legacy-incident-origin',
      '2026-07-26-v1.5.8-asset-writeback'
    ]);
    expect(releaseNotes[4].updates.map((update) => update.time)).toEqual(['12:29', '08:10', '06:44']);
    expect(releaseNotes[4].updates[0].title).toBe('自定义内容工坊、世界包入口与后台演化更新');
    expect(releaseNotes[5].updates.map((update) => update.id)).toEqual([
      '2026-07-25-v1.5.7-paternity-records',
      '2026-07-25-v1.5.6-drama-writeback-stability',
      '2026-07-25-v1.5.5-persistent-prompts-pregnancy'
    ]);
    expect(releaseNotes[5].updates.map((update) => update.time)).toEqual(['20:16', '15:46', '11:02']);
    expect(releaseNotes[5].updates[0].title).toBe('父系候选与怀孕档案修复');
    expect(releaseNotes[6].updates.map((update) => update.id)).toEqual([
      '2026-07-24-v1.5.4-command-bar-density',
      '2026-07-24-v1.5.3-opening-home-economy',
      '2026-07-24-v1.5.2-player-vitals-writeback',
      '2026-07-24-v1.5.1-gameplay-settings',
      '2026-07-24-v1.5.0-opening-drama-tavern'
    ]);
    expect(releaseNotes[6].updates.map((update) => update.time)).toEqual([
      '22:49',
      '21:17',
      '13:26',
      '12:38',
      '11:24'
    ]);
    expect(releaseNotes[7].updates.map((update) => update.id)).toEqual([
      '2026-07-23-v1.4.1-mobile-workspace',
      '2026-07-23-v1.4.0-civilian-livelihood',
      '2026-07-23-v1.3.0-triad-responsibility-eu'
    ]);
    expect(releaseNotes[7].updates.map((update) => update.time)).toEqual(['22:15', '19:54', '07:26']);
    expect(releaseNotes[8].updates.map((update) => update.id)).toEqual([
      '2026-07-22-v1.2.8-probationary-inspector-opening',
      '2026-07-22-v1.2.7-police-rank-sync',
      '2026-07-22-v1.2.6-story-data-actor-profile',
      '2026-07-22-v1.2.5-actor-age-cross-year',
      '2026-07-22-v1.2.4-actor-writeback-stability'
    ]);
    expect(releaseNotes[8].updates.map((update) => update.time)).toEqual(['14:20', '13:34', '11:58', '05:27', '01:58']);
    expect(releaseNotes.at(-1)?.updates.at(-1)?.title).toBe('简体中文正式上线');
    expect(
      releaseNotes.every((entry) =>
        entry.updates.every((update) => /^\d{2}:\d{2}$/.test(update.time) && update.items.length > 0)
      )
    ).toBe(true);
  });

  it('shows once per local day and shows again when the latest entry changes', () => {
    const today = new Date(2026, 6, 20, 9, 0, 0);
    expect(formatLocalDateKey(today)).toBe('2026-07-20');
    expect(shouldShowDailyChangelog(localStorage, today)).toBe(true);

    recordDailyChangelogView(localStorage, today);
    expect(shouldShowDailyChangelog(localStorage, new Date(2026, 6, 20, 23, 59, 0))).toBe(false);
    expect(shouldShowDailyChangelog(localStorage, new Date(2026, 6, 21, 0, 1, 0))).toBe(true);

    const record = JSON.parse(localStorage.getItem(CHANGELOG_STORAGE_KEY) ?? '{}');
    record.latestUpdateId = 'older-update';
    localStorage.setItem(CHANGELOG_STORAGE_KEY, JSON.stringify(record));
    expect(shouldShowDailyChangelog(localStorage, today)).toBe(true);
  });

  it('fails open when the stored record is malformed', () => {
    localStorage.setItem(CHANGELOG_STORAGE_KEY, '{bad-json');
    expect(shouldShowDailyChangelog(localStorage, new Date(2026, 6, 20))).toBe(true);
  });
});
