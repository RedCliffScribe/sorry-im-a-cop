import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  urbanLegendsFormalManifest,
  urbanLegendsFormalV1_1Manifest,
  urbanLegendsFormalV1Manifest
} from '../../domain/dlc/urbanLegends/content';
import { urbanLegendsAlphaManifest } from '../../domain/dlc/urbanLegendsAlpha/content';
import type { OfficialDlcManifest } from '../../domain/dlc/types';
import type { ExistingSaveDlcCandidate } from '../../domain/dlc/existingSave';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { OfficialDlcScreen } from './OfficialDlcScreen';

describe('OfficialDlcScreen', () => {
  const eligibleSave: ExistingSaveDlcCandidate = {
    saveId: 'save_eligible',
    rollbackChainId: 'chain_eligible',
    saveName: '旺角旧档',
    saveKind: 'manual',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
    playerName: '陈启明',
    worldpackId: 'hk_1988',
    gameDateLabel: '1988-09-15 星期四 09:00',
    turnCounter: 37,
    eligibility: {
      eligible: true,
      code: 'eligible',
      reason: '可以从当前游戏时间加入；不会补写过去，也不会改动已有世界事实。'
    }
  };

  const olderUrbanLegendsManifest: OfficialDlcManifest = {
    ...urbanLegendsFormalManifest,
    title: '都市怪谈（旧档案版）',
    description: '旧版存档绑定的非剧透内容说明。',
    version: '0.9.0',
    presentation: {
      tagline: '旧路线留下的城市传闻。',
      experienceKeywords: ['旧版关键词']
    },
    worldCompatibility: [{
      worldpackId: 'hk_1988',
      status: 'supported',
      reason: '旧版香港适配说明。'
    }]
  };

  it('publishes the formal DLC and keeps frozen Alpha out of the public catalog', () => {
    render(<OfficialDlcScreen onBack={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'DLC 剧情' })).toBeInTheDocument();
    expect(screen.queryByText('都市怪谈 Alpha')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '都市怪谈' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /开启|关闭|安装|下载/ })).not.toBeInTheDocument();
  });

  it('renders a non-spoiler archive card with the source-release fallback', () => {
    const { container } = render(
      <OfficialDlcScreen
        onBack={vi.fn()}
        availableManifests={[urbanLegendsFormalManifest]}
      />
    );

    expect(screen.getByRole('heading', { name: '都市怪谈' })).toBeInTheDocument();
    expect(screen.getByText('当前官方版本 v1.2.0')).toBeInTheDocument();
    expect(screen.getByText(/末班车、空屋电话、海旁灯号/)).toBeInTheDocument();
    expect(screen.getByText('香港 1988')).toBeInTheDocument();
    expect(screen.getByText('五条长期剧情弧')).toBeInTheDocument();
    expect(screen.getByText('完整长剧情弧：《深夜叉烧包》')).toBeInTheDocument();
    expect(screen.getByText('完整长剧情弧：《最后一份外卖》')).toBeInTheDocument();
    expect(screen.getByText('十二组可独立流动的香港城市短传闻')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '都市怪谈封面' })).not.toBeInTheDocument();
    expect(container.querySelector('.official-dlc-card-visual'))
      .toHaveAttribute('data-has-cover', 'false');
    expect(screen.queryByText(/arcInstanceId|Drama 来源|turn_/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /开启|关闭|安装|下载/ })).not.toBeInTheDocument();
  });

  it('lists audited existing saves and confirms a safe attach-and-load action', async () => {
    const blockedSave: ExistingSaveDlcCandidate = {
      ...eligibleSave,
      saveId: 'save_alpha',
      saveName: 'Alpha 测试旧档',
      eligibility: {
        eligible: false,
        code: 'incompatible_binding',
        reason: '这个存档已绑定测试版 Alpha，不能再加入正式版；原测试存档仍可继续游玩。'
      }
    };
    const onListExistingSaveCandidates = vi.fn().mockResolvedValue([eligibleSave, blockedSave]);
    const onAttachToExistingSave = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <OfficialDlcScreen
        onBack={vi.fn()}
        onListExistingSaveCandidates={onListExistingSaveCandidates}
        onAttachToExistingSave={onAttachToExistingSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '加入已有存档' }));
    const dialog = await screen.findByRole('dialog', { name: '将都市怪谈加入已有存档' });
    expect(onListExistingSaveCandidates).toHaveBeenCalledWith('urban_legends');
    expect(await within(dialog).findByText('旺角旧档')).toBeInTheDocument();
    expect(within(dialog).getByText('找到 2 份存档，其中 1 份可以加入。')).toBeInTheDocument();
    const blockedRow = within(dialog).getByText('Alpha 测试旧档').closest('li');
    expect(blockedRow).not.toBeNull();
    expect(within(blockedRow as HTMLElement).getByRole('button', { name: '加入并读取' })).toBeDisabled();

    const eligibleRow = within(dialog).getByText('旺角旧档').closest('li');
    fireEvent.click(within(eligibleRow as HTMLElement).getByRole('button', { name: '加入并读取' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/自动建立独立备份.*不补写过去/s));
    await waitFor(() => expect(onAttachToExistingSave).toHaveBeenCalledWith(
      'save_eligible',
      'urban_legends'
    ));
    confirm.mockRestore();
  });

  it('shows an empty current-save state and keeps the tab local to the page', () => {
    render(<OfficialDlcScreen onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '当前 DLC 内容' }));

    expect(screen.getByText('当前没有正在运行的存档')).toBeInTheDocument();
  });

  it('treats a legacy save without bindings as a normal empty state', () => {
    const state = createInitialRuntimeState();
    state.world.officialDlcBindings = undefined;
    render(<OfficialDlcScreen currentState={state} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '当前 DLC 内容' }));

    expect(screen.getByText('本存档没有绑定 DLC')).toBeInTheDocument();
    expect(screen.getByText(/这是正常状态/)).toBeInTheDocument();
  });

  it('shows a frozen Alpha binding without leaking diagnostics into the player page', () => {
    const state = createInitialRuntimeState();
    state.world.officialDlcBindings = [{
      dlcId: 'urban_legends_alpha',
      version: '1.0.0',
      status: 'active'
    }];
    render(<OfficialDlcScreen currentState={state} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '当前 DLC 内容' }));

    expect(screen.getByRole('heading', { name: '都市怪谈 Alpha' })).toBeInTheDocument();
    expect(screen.getAllByText('进行中')).toHaveLength(2);
    expect(screen.getByText('香港 1988 · 支持')).toBeInTheDocument();
    expect(screen.queryByText(/Drama 来源|最近推进|turn_/)).not.toBeInTheDocument();
  });

  it('uses the exact save-version runtime manifest instead of current catalog metadata', () => {
    const state = createInitialRuntimeState();
    state.world.officialDlcBindings = [{
      dlcId: 'urban_legends',
      version: '0.9.0',
      status: 'paused'
    }];
    render(
      <OfficialDlcScreen
        currentState={state}
        onBack={vi.fn()}
        availableManifests={[urbanLegendsFormalManifest]}
        runtimeManifests={[urbanLegendsFormalManifest, olderUrbanLegendsManifest]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '当前 DLC 内容' }));

    expect(screen.getByRole('heading', { name: '都市怪谈（旧档案版）' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /封面/ })).not.toBeInTheDocument();
    expect(screen.getByText('旧路线留下的城市传闻。')).toBeInTheDocument();
    expect(screen.getByText('旧版关键词')).toBeInTheDocument();
    expect(screen.queryByText('末班车驶过之后，谁在替城市讲述失踪？')).not.toBeInTheDocument();
    expect(screen.getByText('v0.9.0')).toBeInTheDocument();
    expect(screen.getByText(/官方目录当前版本为 v1.2.0/)).toBeInTheDocument();
    expect(screen.getByText(/不会自动升级/)).toBeInTheDocument();
  });

  it('offers an explicit confirmed upgrade for a bound v1 save without changing it silently', () => {
    const state = createInitialRuntimeState();
    state.world.officialDlcBindings = [{
      dlcId: 'urban_legends',
      version: '1.0.0',
      status: 'active'
    }];
    const onVersionUpgrade = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <OfficialDlcScreen
        currentState={state}
        onBack={vi.fn()}
        onVersionUpgrade={onVersionUpgrade}
        availableManifests={[urbanLegendsFormalManifest]}
        runtimeManifests={[
          urbanLegendsFormalV1Manifest,
          urbanLegendsFormalV1_1Manifest,
          urbanLegendsFormalManifest
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '当前 DLC 内容' }));
    expect(screen.getByText('完整长剧情弧：《午夜末班车》')).toBeInTheDocument();
    expect(screen.queryByText('完整长剧情弧：《深夜叉烧包》')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '升级本存档至 v1.2.0' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/既有《午夜末班车》剧情弧.*都会保留/));
    expect(onVersionUpgrade).toHaveBeenCalledWith('urban_legends', '1.2.0');
    expect(state.world.officialDlcBindings[0]?.version).toBe('1.0.0');
    confirm.mockRestore();
  });

  it('shows the exact frozen v1.1 catalog before a player chooses the v1.2 upgrade', () => {
    const state = createInitialRuntimeState();
    state.world.officialDlcBindings = [{
      dlcId: 'urban_legends',
      version: '1.1.0',
      status: 'active'
    }];
    const onVersionUpgrade = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <OfficialDlcScreen
        currentState={state}
        onBack={vi.fn()}
        onVersionUpgrade={onVersionUpgrade}
        availableManifests={[urbanLegendsFormalManifest]}
        runtimeManifests={[urbanLegendsFormalV1_1Manifest, urbanLegendsFormalManifest]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '当前 DLC 内容' }));
    expect(screen.getByText('四条长期剧情弧')).toBeInTheDocument();
    expect(screen.getByText('完整长剧情弧：《深夜叉烧包》')).toBeInTheDocument();
    expect(screen.queryByText('完整长剧情弧：《最后一份外卖》')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '升级本存档至 v1.2.0' }));
    expect(onVersionUpgrade).toHaveBeenCalledWith('urban_legends', '1.2.0');
    expect(state.world.officialDlcBindings[0]?.version).toBe('1.1.0');
    confirm.mockRestore();
  });

  it('falls back to a read-only legacy card when the exact save-version manifest is unavailable', () => {
    const state = createInitialRuntimeState();
    state.world.officialDlcBindings = [{
      dlcId: 'urban_legends',
      version: '0.9.0',
      status: 'active'
    }];
    render(
      <OfficialDlcScreen
        currentState={state}
        onBack={vi.fn()}
        onStatusChange={vi.fn()}
        availableManifests={[urbanLegendsFormalManifest]}
        runtimeManifests={[urbanLegendsFormalManifest]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '当前 DLC 内容' }));

    expect(screen.getByRole('heading', { name: '旧版官方 DLC' })).toBeInTheDocument();
    expect(screen.getByText('旧版兼容记录')).toBeInTheDocument();
    expect(screen.queryByText('末班车驶过之后，谁在替城市讲述失踪？')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /暂停后续剧情|恢复后续剧情/ })).not.toBeInTheDocument();
  });

  it('offers only whole-DLC pause or resume and never exposes controls for completed content', () => {
    const onStatusChange = vi.fn();
    const state = createInitialRuntimeState();
    state.world.officialDlcBindings = [{
      dlcId: urbanLegendsAlphaManifest.dlcId,
      version: urbanLegendsAlphaManifest.version,
      status: 'active'
    }];
    const { rerender } = render(
      <OfficialDlcScreen
        currentState={state}
        onBack={vi.fn()}
        onStatusChange={onStatusChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '当前 DLC 内容' }));
    fireEvent.click(screen.getByRole('button', { name: '暂停后续剧情' }));
    expect(onStatusChange).toHaveBeenCalledWith('urban_legends_alpha', 'paused');

    state.world.officialDlcBindings[0] = {
      ...state.world.officialDlcBindings[0],
      status: 'completed'
    };
    rerender(
      <OfficialDlcScreen
        currentState={state}
        onBack={vi.fn()}
        onStatusChange={onStatusChange}
      />
    );
    expect(screen.getAllByText('已完成')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /暂停后续剧情|恢复后续剧情/ })).not.toBeInTheDocument();
  });

  it('uses a friendly compatibility fallback when an old manifest is unavailable', () => {
    const state = createInitialRuntimeState();
    state.world.officialDlcBindings = [{
      dlcId: 'retired_internal_id',
      version: '1.0.0',
      status: 'paused'
    }];
    render(
      <OfficialDlcScreen
        currentState={state}
        onBack={vi.fn()}
        runtimeManifests={[]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '当前 DLC 内容' }));

    expect(screen.getByRole('heading', { name: '旧版官方 DLC' })).toBeInTheDocument();
    expect(screen.getByText('旧版兼容记录')).toBeInTheDocument();
    expect(screen.queryByText('retired_internal_id')).not.toBeInTheDocument();
  });
});
