import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChangelogModal } from './ChangelogModal';

describe('ChangelogModal', () => {
  it('shows one page per day with newest timed updates first', () => {
    const onClose = vi.fn();
    render(<ChangelogModal onClose={onClose} />);

    const dialog = screen.getByRole('dialog', { name: '更新日志' });
    expect(
      within(dialog).getByRole('heading', {
        name: '《警队晋升》官方 DLC 上线'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('22:46')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.20')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '人物往来度稳定性修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('17:05')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.19')).toBeInTheDocument();
    expect(within(dialog).getByText('1 / 30')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /较新一条/ })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '人物志与人脉写入稳定性修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('11:20')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.18')).toBeInTheDocument();
    expect(within(dialog).getByText('2 / 30')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '案件归档精确绑定优化'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('18:25')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.17')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '多案件归档与结案记忆修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('15:04')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.16')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: 'AVG 首次相遇图像稳定性修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('12:32')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.15')).toBeInTheDocument();
    expect(within(dialog).getByText('3 / 30')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /较新一条/ })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '案件归档与重复证据修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('19:18')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.14')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: 'NPC在场与远场归属修复'
      })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '身份与岗位写回提示优化'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('10:00')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.12')).toBeInTheDocument();
    expect(within(dialog).getByText('4 / 30')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /较新一条/ })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '全屏沉浸式立绘查看修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('13:19')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.11')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '怀孕状态写回稳定性修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('12:18')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.9')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: 'AVG立绘布局与大图查看'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('10:57')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.8')).toBeInTheDocument();
    expect(within(dialog).getByText('5 / 30')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /较新一条/ })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '沉浸式剧情阅读模式'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('23:08')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.7')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '旺角冰室场景匹配修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('21:35')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.6')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '七日值班安排与界面优化'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('10:04')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.5')).toBeInTheDocument();
    expect(within(dialog).getByText('6 / 30')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /较新一条/ })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '《空屋来电》防重复加固'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('21:22')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.3')).toBeInTheDocument();
    expect(within(dialog).getByText('7 / 30')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /较新一条/ })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '警察值班与市民上班安排'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('00:01')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.2')).toBeInTheDocument();
    expect(within(dialog).getByText('8 / 30')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /较新一条/ })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '修复角色候选图误生成黑色剪影'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('18:42')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '都市怪谈同局去重加固'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('11:05')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.1')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.0')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '判定骰点分布优化'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('00:06')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.80')).toBeInTheDocument();
    expect(within(dialog).getByText('9 / 30')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '都市怪谈持续事件防重复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('23:32')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.79')).toBeInTheDocument();
    expect(within(dialog).getByText('10 / 30')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /较新一条/ })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '判定难度与危险场景平衡'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('21:09')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.78')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '人脉缘分写回修复加固'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('19:42')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.77')).toBeInTheDocument();
    expect(within(dialog).getByText('11 / 30')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /较新一条/ })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '妊娠状态与记录同步修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('22:01')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.76')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '已有存档可加入都市怪谈'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('00:39')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.75')).toBeInTheDocument();
    expect(within(dialog).getByText('12 / 30')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /较新一条/ })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '人物志资料手动修改'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('12:03')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.74')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '人物关系档案同步修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('11:17')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.73')).toBeInTheDocument();
    expect(within(dialog).getByText('13 / 30')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /较新一条/ })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '远场人物记忆衔接修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('23:59')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.72')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '都市怪谈内容扩展'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('22:54')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.71')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '都市怪谈官方 DLC 上线'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('21:10')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.70')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '都市怪谈正式内容完成'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('20:50')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.69')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '官方 DLC 与长期剧情弧底座'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('20:30')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.68')).toBeInTheDocument();
    expect(within(dialog).getByText('14 / 30')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /较新一条/ })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '人脉与缘分手动删除'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('22:18')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.67')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '案件主办者写回修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('19:44')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.66')).toBeInTheDocument();
    expect(within(dialog).getByText('17:27')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.65')).toBeInTheDocument();
    expect(within(dialog).getByText('13:40')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.64')).toBeInTheDocument();
    expect(within(dialog).getByText('11:46')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.63')).toBeInTheDocument();
    expect(within(dialog).getByText('15 / 30')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /较新一条/ })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));
    expect(
      within(dialog).getByRole('heading', {
        name: '创意工坊作者与下载量展示'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('20:00')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.62')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '警务身份与人物头像关联修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('19:42')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.61')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '写回修复结果对账优化'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('19:01')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.60')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '玩家身体状态生命周期修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('18:59')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.59')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '近期收支浏览优化'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('17:01')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.58')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '联网创意工坊首期预览'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('15:48')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.57')).toBeInTheDocument();
    expect(within(dialog).getByText('16 / 30')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /较新一条/ })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '人物建档欠账与存档修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('23:40')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.56')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '人脉历史保留加固'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('23:38')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.55')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '收支明细恢复修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('23:36')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.54')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '文生图网络诊断增强'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('23:34')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.53')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '在线统计降频与口径优化'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('23:32')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.52')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '设置固定规则显示修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('22:05')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.51')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '手机版固定资产详情滑动修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('19:34')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.50')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '过往行动原位重发修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('00:59')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.49')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '资产移除写回与诊断修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('00:37')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.48')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '人脉缘分延续与人物推演修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('00:18')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.47')).toBeInTheDocument();
    expect(within(dialog).getByText('17 / 30')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));

    expect(
      within(dialog).getByRole('heading', {
        name: '整体口碑联动修复'
      })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '案件主办者同步修复'
      })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: 'ComfyUI 工作流管理优化'
      })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '正文头像对白排版优化'
      })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '案件档案写回稳定性修复'
      })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '自定义事件主角节点绑定修复'
      })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '风声生命周期与手动归档'
      })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '自定义事件角色与主角头像优化'
      })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '设置页面滚动显示修复'
      })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '判定预检截断修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('23:48')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.46')).toBeInTheDocument();
    expect(within(dialog).getByText('23:09')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.45')).toBeInTheDocument();
    expect(within(dialog).getByText('21:31')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.44')).toBeInTheDocument();
    expect(within(dialog).getByText('20:48')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.43')).toBeInTheDocument();
    expect(within(dialog).getByText('20:45')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.42')).toBeInTheDocument();
    expect(within(dialog).getByText('16:58')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.41')).toBeInTheDocument();
    expect(within(dialog).getByText('15:54')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.40')).toBeInTheDocument();
    expect(within(dialog).getByText('15:15')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.39')).toBeInTheDocument();
    expect(within(dialog).getByText('13:26')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.38')).toBeInTheDocument();
    expect(within(dialog).getByText('01:15')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.37')).toBeInTheDocument();
    expect(within(dialog).getByText('18 / 30')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));
    expect(
      within(dialog).getByRole('heading', {
        name: 'AI 处理轨迹与请求状态'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('22:24')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.36')).toBeInTheDocument();
    expect(within(dialog).getByText('19 / 30')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));
    expect(
      within(dialog).getByRole('heading', {
        name: '香港报刊新闻聚焦优化'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('21:09')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.35')).toBeInTheDocument();
    expect(within(dialog).getByText('20 / 30')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));
    expect(
      within(dialog).getByRole('heading', {
        name: 'NovelAI 成熟柔绘轻写实预设'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('11:40')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.23')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '高级警衔、肩章与薪资档案补全'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('09:31')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.22')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '车辆购买写回与资产可见性修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('09:27')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.21')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '自定义人物 AI 生成宽容化'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('09:24')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.20')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '开局局部恢复与年龄输入修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('09:19')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.19')).toBeInTheDocument();
    expect(within(dialog).getByText('21 / 30')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));
    expect(
      within(dialog).getByRole('heading', {
        name: '开局人物记忆与输出上限修复'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('23:19')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.18')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: 'ComfyUI 工作流文件导入'
      })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '更多自定义人物与事件加入本局'
      })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', {
        name: '开局与本地判定稳定性 V2'
      })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('17:45')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.15')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: '人脉与缘分关系建立修复' })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('09:01')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: '自定义人物跨世界适配与按需登场' })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('08:13')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.12')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));
    expect(
      within(dialog).getByRole('heading', { name: 'NovelAI V4/V4.5 生图修复' })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: '判定校正与回合稳定性修复' })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: '沉浸档开局稳定性修复' })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: '本局自定义推进与判定详情优化' })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: '移动端对话排版修复' })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: '人物志 NPC 导入自定义人物库' })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: '文生图 API 配置入口优化' })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: '判定与对抗稳定性修复' })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: '对抗与判定系统 V1.1' })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: '当前存档粤语风味更改' })
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: '文生图与视觉资产系统' })).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: '世界包、自定义内容与开局便利性' })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: '机构、警察岗位与结构化写回修复' })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('21:55')).toBeInTheDocument();
    expect(within(dialog).getByText('21:05')).toBeInTheDocument();
    expect(within(dialog).getByText('19:58')).toBeInTheDocument();
    expect(within(dialog).getByText('19:19')).toBeInTheDocument();
    expect(within(dialog).getByText('17:19')).toBeInTheDocument();
    expect(within(dialog).getByText('16:51')).toBeInTheDocument();
    expect(within(dialog).getByText('16:22')).toBeInTheDocument();
    expect(within(dialog).getByText('15:59')).toBeInTheDocument();
    expect(within(dialog).getByText('15:14')).toBeInTheDocument();
    expect(within(dialog).getByText('14:09')).toBeInTheDocument();
    expect(within(dialog).getByText('13:38')).toBeInTheDocument();
    expect(within(dialog).getByText('12:09')).toBeInTheDocument();
    expect(within(dialog).getByText('12:08')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.9')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.8')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.7')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.6')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.5')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.4')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.3')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.2')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.1')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.7.0')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.6.1')).toBeInTheDocument();
    expect(within(dialog).getAllByText('v1.6.0')).toHaveLength(3);
    expect(within(dialog).getByText('23 / 30')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));
    expect(
      within(dialog).getByRole('heading', { name: '自定义内容工坊、世界包入口与后台演化更新' })
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: '新旧存档写回警告修复' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: '物品与资产写回修复' })).toBeInTheDocument();
    expect(within(dialog).getByText('12:29')).toBeInTheDocument();
    expect(within(dialog).getByText('08:10')).toBeInTheDocument();
    expect(within(dialog).getByText('v1.5.9')).toBeInTheDocument();
    expect(within(dialog).getAllByText('v1.5.8')).toHaveLength(2);
    expect(within(dialog).getByText('24 / 30')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));
    expect(within(dialog).getByRole('heading', { name: '父系候选与怀孕档案修复' })).toBeInTheDocument();
    expect(within(dialog).getByText('25 / 30')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));
    expect(within(dialog).getByRole('heading', { name: '行动选项与输入栏布局优化' })).toBeInTheDocument();
    expect(within(dialog).getByText('26 / 30')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));
    expect(within(dialog).getByRole('heading', { name: '手机主界面与功能面板布局优化' })).toBeInTheDocument();
    expect(within(dialog).getByText('27 / 30')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));
    expect(within(dialog).getByRole('heading', { name: '见习督察开局路线修复' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: '警衔晋升同步修复' })).toBeInTheDocument();
    expect(within(dialog).getByText('28 / 30')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '较早一条 →' }));
    expect(within(dialog).getByRole('heading', { name: '正文篇幅与演绎风格优化' })).toBeInTheDocument();
    expect(within(dialog).getByText('29 / 30')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('更新日志页码')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '关闭更新日志' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
