import { describe, expect, it } from 'vitest';
import { selectContext } from '../../context/selectContext';
import {
  getProjectedDramaPayload,
  listProjectedDramaSources,
  validateProjectedDramaRef
} from '../../drama/sourceRegistry';
import { createInitialRuntimeState } from '../../runtime/initialState';
import type { OfficialDlcDramaSourceRef } from '../types';
import {
  urbanLegendsAlphaCharacters,
  urbanLegendsAlphaEventGroup,
  urbanLegendsAlphaManifest,
  urbanLegendsAlphaNewsTemplate,
  urbanLegendsAlphaPlaces
} from './content';
import { urbanLegendsAlphaProvider } from './provider';

function contextFor(identity: 'police' | 'civilian' | 'gang_member') {
  const state = createInitialRuntimeState({ currentIdentity: identity });
  state.world.officialDlcBindings = [{
    dlcId: urbanLegendsAlphaManifest.dlcId,
    version: urbanLegendsAlphaManifest.version,
    status: 'active'
  }];
  return { state, context: selectContext(state, `测试 ${identity}`) };
}

describe('Urban Legends Alpha official DLC content provider', () => {
  it('keeps Alpha frozen out of new saves while preserving its runtime manifest', () => {
    const state = createInitialRuntimeState({
      officialDlcIds: [urbanLegendsAlphaManifest.dlcId]
    });
    expect(state.world.officialDlcBindings).toEqual([]);
    expect(contextFor('police').context.officialDlcBindings).toEqual([
      expect.objectContaining({
        dlcId: urbanLegendsAlphaManifest.dlcId,
        version: urbanLegendsAlphaManifest.version,
        status: 'active'
      })
    ]);
  });

  it('ships one Hong Kong 1988 manifest with the requested event assets', () => {
    expect(urbanLegendsAlphaManifest).toMatchObject({
      dlcId: 'urban_legends_alpha',
      title: '都市怪谈 Alpha',
      type: 'narrative',
      version: '1.0.0',
      worldCompatibility: [{ worldpackId: 'hk_1988', status: 'supported' }],
      dramaIntegration: { enabled: true, priority: 'player_selected' }
    });
    expect(urbanLegendsAlphaEventGroup.stages.map((stage) => stage.title)).toEqual([
      '街坊传闻',
      '第一批线索',
      '利益冲突',
      '真相调查',
      '结局余波'
    ]);
    expect(urbanLegendsAlphaEventGroup.stages).toHaveLength(5);
    expect(urbanLegendsAlphaCharacters).toHaveLength(6);
    expect(urbanLegendsAlphaPlaces).toHaveLength(3);
    expect(urbanLegendsAlphaNewsTemplate.headline).toBe('市民传闻夜间巴士出现异常');
  });

  it('projects the event, six characters and news only for an active HK1988 binding', () => {
    const { context } = contextFor('police');
    const sources = urbanLegendsAlphaProvider.list(context);
    expect(sources).toHaveLength(8);
    expect(sources.filter((item) => item.ref.sourceType === 'official_dlc_event')).toHaveLength(1);
    expect(sources.filter((item) => item.ref.sourceType === 'official_dlc_character')).toHaveLength(6);
    expect(sources.filter((item) => item.ref.sourceType === 'official_dlc_news')).toHaveLength(1);
    const event = sources.find((item) => item.ref.sourceType === 'official_dlc_event');
    expect(event?.priorityClass).toBe('user_requested');
    expect(event?.mandatory).toBe(false);
    expect(event?.ref).toMatchObject({
      providerId: 'official-dlc',
      sourceType: 'official_dlc_event',
      sourceId: urbanLegendsAlphaEventGroup.eventGroupId,
      dlcId: urbanLegendsAlphaManifest.dlcId
    });

    const pausedState = contextFor('police').state;
    pausedState.world.officialDlcBindings![0]!.status = 'paused';
    expect(urbanLegendsAlphaProvider.list(selectContext(pausedState, '暂停'))).toEqual([]);
    pausedState.world.officialDlcBindings![0]!.status = 'completed';
    expect(urbanLegendsAlphaProvider.list(selectContext(pausedState, '完成'))).toEqual([]);
    pausedState.world.worldpackId = 'other_worldpack';
    pausedState.world.officialDlcBindings![0]!.status = 'active';
    expect(urbanLegendsAlphaProvider.list(selectContext(pausedState, '不兼容'))).toEqual([]);
  });

  it('keeps one event arc while adapting the entry route to police, civilian and society identities', () => {
    const eventSourceIds = new Set<string>();
    for (const identity of ['police', 'civilian', 'gang_member'] as const) {
      const { context } = contextFor(identity);
      const event = urbanLegendsAlphaProvider.list(context).find(
        (item) => item.ref.sourceType === 'official_dlc_event'
      )!;
      const payload = urbanLegendsAlphaProvider.getExecutionPayload(context, event.ref);
      expect(payload?.detailedContext).toContain('午夜末班车');
      expect(payload?.detailedContext).toContain(
        identity === 'police'
          ? '报案、失踪记录或夜间巡逻'
          : identity === 'civilian'
            ? '街坊传闻或工作往来'
            : '地盘传闻或利益冲突'
      );
      expect(payload?.detailedContext).toContain('默认解释为 ambiguous');
      expect(payload?.forbiddenAdaptations.join('\n')).toContain('不能确认鬼魂');
      eventSourceIds.add(event.ref.sourceId);
    }
    expect(eventSourceIds).toEqual(new Set([urbanLegendsAlphaEventGroup.eventGroupId]));
  });

  it('uses only existing writeback kinds and exposes registry payloads without a DLC runtime', () => {
    const { context } = contextFor('police');
    const event = listProjectedDramaSources(context).find(
      (item) => item.ref.providerId === 'official-dlc' && item.ref.sourceType === 'official_dlc_event'
    )!;
    const payload = getProjectedDramaPayload(context, event.ref);
    expect(payload).toBeDefined();
    expect(payload?.forbiddenAdaptations.join('\n')).toContain('currentMatter');
    expect(payload?.detailedContext).not.toContain('DLC 专属 Runtime');
    expect(validateProjectedDramaRef(context, event.ref)).toBe(true);

    const character = listProjectedDramaSources(context).find(
      (item) => item.ref.sourceType === 'official_dlc_character'
    )!;
    const characterPayload = getProjectedDramaPayload(context, character.ref);
    expect(characterPayload?.detailedContext).toContain(character.ref.sourceId);
    expect(validateProjectedDramaRef(context, character.ref)).toBe(true);

    const paused = contextFor('police').state;
    paused.world.officialDlcBindings![0]!.status = 'paused';
    expect(getProjectedDramaPayload(selectContext(paused, '暂停'), event.ref)).toBeUndefined();
  });

  it('rejects a foreign DLC ref even when the source type looks valid', () => {
    const { context } = contextFor('police');
    const foreignRef: OfficialDlcDramaSourceRef = {
      providerId: 'official-dlc',
      sourceType: 'official_dlc_event',
      sourceId: urbanLegendsAlphaEventGroup.eventGroupId,
      dlcId: 'other_official_dlc'
    };
    expect(urbanLegendsAlphaProvider.getExecutionPayload(context, foreignRef)).toBeUndefined();
    expect(validateProjectedDramaRef(context, foreignRef)).toBe(false);
  });
});
