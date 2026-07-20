import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { MapArchiveModal } from './MapArchiveModal';

describe('MapArchiveModal', () => {
  it('renders a schematic Hong Kong map with zoom and locate controls', () => {
    const state = createInitialRuntimeState();

    render(<MapArchiveModal state={state} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: '地图' });

    expect(within(dialog).getByRole('img', { name: '香港示意地图' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '放大地图' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '缩小地图' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '全港视角' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '定位我' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('缩放 125%');
  });

  it('drafts a natural-language movement action without submitting a turn', () => {
    const state = createInitialRuntimeState();
    const onDraftPlayerAction = vi.fn();

    render(<MapArchiveModal state={state} onClose={vi.fn()} onDraftPlayerAction={onDraftPlayerAction} />);
    const dialog = screen.getByRole('dialog', { name: '地图' });
    const placeList = within(dialog).getByLabelText('地点列表');

    fireEvent.click(within(placeList).getByRole('button', { name: /油麻地警署/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: '前往此处' }));

    expect(onDraftPlayerAction).toHaveBeenCalledWith(expect.stringContaining('油麻地警署'));
  });

  it('renders canonical and runtime places without exposing the whole map as prompt context', () => {
    const state = createInitialRuntimeState();
    state.places.place_runtime_back_alley = {
      placeId: 'place_runtime_back_alley',
      name: '金星游戏机中心后巷',
      regionId: 'region_kowloon',
      districtId: 'district_mong_kok',
      type: 'industrial_building',
      category: 'street_life',
      summary: '一次盘问后由剧情固定下来的后巷。',
      publicKnowledge: '附近街坊知道这里夜里常有人聚集。',
      currentState: '地面潮湿，墙边堆着纸箱。',
      relatedActorIds: [],
      relatedCaseIds: [],
      relatedPressureIds: [],
      source: 'runtime_generated',
      canonical: false,
      visualAnchor: {
        mapId: 'hk_1988_main',
        x: 0.49,
        y: 0.39,
        precision: 'approximate',
        source: 'runtime_inferred',
        basisPlaceIds: ['place_mong_kok_police_station']
      }
    };

    render(<MapArchiveModal state={state} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '地图' });
    expect(dialog).toHaveTextContent('旺角警署');
    expect(dialog).toHaveTextContent('金星游戏机中心后巷');
    expect(dialog).toHaveTextContent('当前地点');
    expect(dialog).toHaveTextContent('新发现');
    expect(dialog).not.toHaveTextContent('运行时生成');
    expect(dialog).not.toHaveTextContent('地图锚点');
    expect(dialog).not.toHaveTextContent('固定地点');
    expect(dialog).not.toHaveTextContent('已定位');
    expect(dialog).not.toHaveTextContent('可信度');
    expect(dialog).not.toHaveTextContent('runtime_inferred');
    expect(dialog).not.toHaveTextContent('place_runtime_back_alley');
    expect(dialog).not.toHaveTextContent('region_kowloon');
    expect(dialog).not.toHaveTextContent('district_mong_kok');
    expect(dialog).not.toHaveTextContent('industrial_building');
    expect(dialog).not.toHaveTextContent('street_life');
    expect(dialog).not.toHaveTextContent(/\bhigh\b/);

    fireEvent.change(within(dialog).getByPlaceholderText('搜索地点 / 英文名 / 区域 / 类型'), {
      target: { value: '后巷' }
    });

    const placeList = within(dialog).getByLabelText('地点列表');
    expect(within(placeList).getByRole('button', { name: /金星游戏机中心后巷/ })).toBeInTheDocument();
    expect(within(placeList).queryByRole('button', { name: /湾仔警察总部/ })).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('地点详情')).toHaveTextContent('九龙');
    expect(within(dialog).getByLabelText('地点详情')).toHaveTextContent('旺角');
    expect(within(dialog).getByLabelText('地点详情')).toHaveTextContent('工业建筑');
    expect(within(dialog).getByLabelText('地点详情')).toHaveTextContent('街头生活');
    expect(within(dialog).getByLabelText('地点详情')).not.toHaveTextContent('概略位置');
    expect(within(dialog).getByLabelText('地点详情')).not.toHaveTextContent('图上位置');
    expect(within(dialog).getByLabelText('地点详情')).not.toHaveTextContent('runtime_inferred');
    expect(within(dialog).getByLabelText('地点详情')).not.toHaveTextContent('place_mong_kok_police_station');
  });
});
