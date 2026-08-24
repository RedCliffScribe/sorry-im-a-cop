import { createRef, StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { DefaultAvgResourceResolver } from '../../../domain/avgResourcePack';
import {
  fixtureFixed,
  fixturePack,
  fixtureScene
} from '../../../domain/avgPresentation/testFixtures';
import type { StoryBlock } from '../../../domain/runtime/storyBlocks';
import { createInitialRuntimeState } from '../../../domain/runtime/initialState';
import type { RuntimeState, StoryEntry } from '../../../domain/runtime/types';
import { createDefaultAiSettings } from '../../../domain/settings/defaultSettings';
import type { DisplaySettings } from '../../../domain/settings/types';
import type {
  ActiveAvgResourceSession,
  AvgPresentationResourceRuntime
} from './avgPresentationResourceRuntime';
import {
  MemoryAvgVisualOverrideRepository,
  type AvgValidatedOverrideImage
} from '../../../domain/avgVisualOverride';
import {
  StoryPresentationPane,
  type StoryPresentationPaneHandle
} from './StoryPresentationPane';

const identity = {
  worldpackId: 'hk1988',
  kind: 'era_seed' as const,
  canonicalId: 'fixture_detective'
};

const playerIdentity = {
  worldpackId: 'hk1988',
  kind: 'era_seed' as const,
  canonicalId: 'fixture_player'
};

let originalCreateObjectUrl: PropertyDescriptor | undefined;
let originalRevokeObjectUrl: PropertyDescriptor | undefined;
let overrideUrlCounter = 0;

beforeEach(() => {
  originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  overrideUrlCounter = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => `blob:avg-pane-${++overrideUrlCounter}`)
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn()
  });
});

afterEach(() => {
  if (originalCreateObjectUrl) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

function overrideImage(seed: string): AvgValidatedOverrideImage {
  const blob = new Blob([seed], { type: 'image/png' });
  return {
    blob,
    mediaType: 'image/png',
    width: 768,
    height: 1152,
    byteLength: blob.size,
    sha256: seed.padEnd(64, '0').slice(0, 64)
  };
}

function entry(
  turn: number,
  blocks: StoryBlock[],
  environment?: {
    hour?: number;
    weatherCondition?: RuntimeState['environment']['weather']['condition'];
    weatherIntensity?: number;
  }
): StoryEntry {
  return {
    turnId: `turn_${turn}`,
    speaker: 'narrator',
    text: blocks.map((block) => block.text).join('\n'),
    gameTime: {
      year: 1988,
      month: 6,
      day: 12,
      hour: environment?.hour ?? 10,
      minute: turn
    },
    blocks,
    visualContext: {
      timeDescription: '上午十时',
      locationDescription: 'CID办公室',
      presentActorIds: ['npc_detective'],
      ...(environment?.weatherCondition
        ? {
            weatherDescription: environment.weatherCondition,
            structuredEnvironment: {
              weatherCondition: environment.weatherCondition,
              weatherIntensity: environment.weatherIntensity ?? 50,
              placeId: 'place_mong_kok_police_station'
            }
          }
        : {})
    }
  };
}

function dialogue(text: string, emotion: 'neutral' | 'serious' | 'surprised' = 'neutral'): StoryBlock {
  return {
    type: 'dialogue',
    text,
    speakerLabel: '陈探员',
    speakerActorId: 'npc_detective',
    emotion
  };
}

function createState(entries: StoryEntry[], turnCounter = entries.length): RuntimeState {
  const state = createInitialRuntimeState();
  const playerActor = state.actors[state.player.actorId]!;
  return {
    ...state,
    turnCounter,
    storyLog: entries,
    location: {
      ...state.location,
      currentPlaceId: 'place_mong_kok_police_station'
    },
    actors: {
      ...state.actors,
      [state.player.actorId]: {
        ...playerActor,
        stableIdentityRef: playerIdentity
      },
      npc_detective: {
        ...playerActor,
        actorId: 'npc_detective',
        name: '陈探员',
        aliases: [],
        stableIdentityRef: identity,
        currentSceneId: state.location.currentSceneId,
        currentPlaceId: 'place_mong_kok_police_station'
      }
    }
  };
}

function avgDisplaySettings(): DisplaySettings {
  return {
    ...createDefaultAiSettings().display,
    storyPresentationMode: 'avg'
  };
}

function createResourceRuntime(sceneAssetId = 'police_cid_office') {
  const pack = fixturePack({
    packId: 'fixture_base',
    version: '1.2.3',
    fixed: [
      fixtureFixed(identity, ['default', 'serious', 'surprised']),
      fixtureFixed(playerIdentity, ['default'])
    ],
    scenes: [fixtureScene({
      sceneAssetId,
      runtimePlaceIds: ['place_mong_kok_police_station'],
      tags: ['police', 'office']
    })]
  });
  const active: ActiveAvgResourceSession = {
    resolver: new DefaultAvgResourceResolver({ basePack: pack }),
    activePack: {
      worldpackId: 'hk1988',
      basePackId: pack.manifest.packId,
      basePackVersion: pack.manifest.version
    },
    displayName: '测试资源包',
    selectionToken: 'fixture_base@1.2.3'
  };
  const runtime: AvgPresentationResourceRuntime = {
    loadActivePack: vi.fn(async () => active),
    getAssetDisplayUrl: vi.fn(async (_packId, asset) => `https://assets.test/${asset.assetId}`),
    reset: vi.fn(),
    dispose: vi.fn()
  };
  return { runtime, active };
}

describe('StoryPresentationPane', () => {
  it('loads an existing save at the latest narrator final frame', async () => {
    const storyEntry = entry(3, [
      { type: 'narration', text: '档案室的风扇低声转动。', sourceStyle: 'tagged' },
      dialogue('“把最后一页拿给我。”', 'serious')
    ]);
    render(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={createState([storyEntry], 3)}
        saveId="save-existing"
        displaySettings={avgDisplaySettings()}
        textView={<div>原正文视图</div>}
      />
    );

    expect(await screen.findByText('“把最后一页拿给我。”')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('starts a newly arrived narrator entry at frame zero and advances without overrunning', async () => {
    const stateWithoutStory = createState([], 0);
    const view = render(
      <StoryPresentationPane
        entries={[]}
        runtimeState={stateWithoutStory}
        saveId="save-new-turn"
        displaySettings={avgDisplaySettings()}
        textView={<div>原正文视图</div>}
      />
    );
    expect(screen.getByText('等待第一段剧情')).toBeInTheDocument();

    const storyEntry = entry(1, [
      { type: 'narration', text: '门外传来两声短促的敲门声。', sourceStyle: 'tagged' },
      dialogue('“请进。”')
    ]);
    view.rerender(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={createState([storyEntry], 1)}
        saveId="save-new-turn"
        displaySettings={avgDisplaySettings()}
        textView={<div>原正文视图</div>}
      />
    );

    expect(await screen.findByText('门外传来两声短促的敲门声。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一句' }));
    expect(screen.getByText('“请进。”')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一句' })).toBeDisabled();
  });

  it('does not intercept Space or Enter while an input owns focus', async () => {
    const storyEntry = entry(1, [
      { type: 'narration', text: '第一句。', sourceStyle: 'tagged' },
      dialogue('第二句。')
    ]);
    const view = render(
      <>
        <input aria-label="行动输入" />
        <StoryPresentationPane
          entries={[]}
          runtimeState={createState([], 0)}
          saveId="save-keyboard"
          displaySettings={avgDisplaySettings()}
          textView={<div>原正文视图</div>}
        />
      </>
    );
    view.rerender(
      <>
        <input aria-label="行动输入" />
        <StoryPresentationPane
          entries={[storyEntry]}
          runtimeState={createState([storyEntry], 1)}
          saveId="save-keyboard"
          displaySettings={avgDisplaySettings()}
          textView={<div>原正文视图</div>}
        />
      </>
    );
    expect(await screen.findByText('第一句。')).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: '行动输入' });
    input.focus();
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: ' ' });
    expect(screen.getByText('第一句。')).toBeInTheDocument();
  });

  it('prefetches only unique sequence assets and keeps image DOM stable across carry and variants', async () => {
    const { runtime } = createResourceRuntime();
    const storyEntry = entry(2, [
      dialogue('“先看这张照片。”', 'serious'),
      { type: 'narration', text: '他没有移开视线。', sourceStyle: 'tagged' },
      dialogue('“这不可能。”', 'surprised')
    ]);
    render(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={createState([storyEntry], 2)}
        saveId="save-assets"
        displaySettings={avgDisplaySettings()}
        resourceRuntime={runtime}
        textView={<div>原正文视图</div>}
      />
    );

    expect(await screen.findByText('“这不可能。”')).toBeInTheDocument();
    await waitFor(() => expect(runtime.getAssetDisplayUrl).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole('button', { name: '重播本回合' }));
    expect(screen.getByText('“先看这张照片。”')).toBeInTheDocument();
    const sceneImage = screen.getByTestId('avg-scene-image');
    const portraitImage = screen.getByTestId('avg-portrait-image');
    expect(portraitImage).toHaveAttribute('src', expect.stringContaining('portrait_serious'));
    expect(screen.getByRole('region', { name: 'AVG 剧情演出' }))
      .toHaveAttribute('data-portrait-stage', 'active');

    fireEvent.click(screen.getByRole('button', { name: '下一句' }));
    expect(screen.getByText('他没有移开视线。')).toBeInTheDocument();
    expect(screen.getByText('旁白')).toBeInTheDocument();
    expect(screen.getByText('他没有移开视线。').closest('.avg-dialogue-layer'))
      .toHaveClass('avg-dialogue-layer--narration');
    expect(screen.getByRole('region', { name: 'AVG 剧情演出' }))
      .toHaveAttribute('data-portrait-stage', 'receded');
    expect(screen.getByTestId('avg-scene-image')).toBe(sceneImage);
    expect(screen.getByTestId('avg-portrait-image')).toBe(portraitImage);

    fireEvent.click(screen.getByRole('button', { name: '下一句' }));
    expect(screen.getByRole('region', { name: 'AVG 剧情演出' }))
      .toHaveAttribute('data-portrait-stage', 'active');
    expect(screen.getByTestId('avg-portrait-image')).toBe(portraitImage);
    expect(screen.getByTestId('avg-portrait-image')).toHaveAttribute(
      'src',
      expect.stringContaining('portrait_surprised')
    );
  });

  it('renders inner monologue with its own panel while the present NPC recedes', async () => {
    const { runtime } = createResourceRuntime();
    const storyEntry = entry(2, [
      dialogue('“你还想问什么？”', 'serious'),
      {
        type: 'inner_monologue',
        text: '他的手一直压着最下面那份文件。',
        actorId: 'player',
        emotion: 'thinking'
      }
    ]);
    render(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={createState([storyEntry], 2)}
        saveId="save-inner-panel"
        displaySettings={avgDisplaySettings()}
        resourceRuntime={runtime}
        textView={<div>原正文视图</div>}
      />
    );

    const text = await screen.findByText('他的手一直压着最下面那份文件。');
    expect(text.closest('.avg-dialogue-layer'))
      .toHaveClass('avg-dialogue-layer--inner_monologue');
    expect(screen.getByText('内心')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'AVG 剧情演出' }))
      .toHaveAttribute('data-portrait-stage', 'receded');
    expect(await screen.findByTestId('avg-portrait-image')).toHaveAttribute(
      'alt',
      expect.stringContaining('陈探员')
    );
  });

  it('re-resolves the current frame immediately when player portrait mode changes', async () => {
    const { runtime } = createResourceRuntime();
    const storyEntry = entry(1, [{
      type: 'dialogue',
      text: '这次由我来问。',
      speakerLabel: '玩家',
      speakerActorId: 'player',
      emotion: 'neutral'
    }]);
    const state = createState([storyEntry], 1);
    const hiddenSettings = avgDisplaySettings();
    const view = render(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={state}
        saveId="save-player-mode-toggle"
        displaySettings={hiddenSettings}
        resourceRuntime={runtime}
        textView={<div>原正文视图</div>}
      />
    );

    expect(await screen.findByText('这次由我来问。')).toBeInTheDocument();
    expect(screen.queryByTestId('avg-portrait-image')).not.toBeInTheDocument();

    view.rerender(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={state}
        saveId="save-player-mode-toggle"
        displaySettings={{ ...hiddenSettings, avgPlayerPortraitMode: 'show' }}
        resourceRuntime={runtime}
        textView={<div>原正文视图</div>}
      />
    );
    const playerPortrait = await screen.findByTestId('avg-portrait-image');
    expect(playerPortrait).toHaveAttribute('alt', expect.stringContaining('立绘'));
    expect(screen.getByRole('region', { name: 'AVG 剧情演出' }))
      .toHaveAttribute('data-portrait-stage', 'active');

    view.rerender(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={state}
        saveId="save-player-mode-toggle"
        displaySettings={hiddenSettings}
        resourceRuntime={runtime}
        textView={<div>原正文视图</div>}
      />
    );
    await waitFor(() => expect(screen.queryByTestId('avg-portrait-image')).not.toBeInTheDocument());
    expect(runtime.loadActivePack).toHaveBeenCalledTimes(1);
  });

  it('honors hidden/show for a player override without letting the override enable itself', async () => {
    const { runtime } = createResourceRuntime();
    const repository = new MemoryAvgVisualOverrideRepository();
    const storyEntry = entry(1, [{
      type: 'dialogue',
      text: '主角自定义立绘测试。',
      speakerLabel: '玩家',
      speakerActorId: 'player',
      emotion: 'happy'
    }]);
    const state = createState([storyEntry], 1);
    await repository.replaceActorOverride({
      visualPartitionId: 'save-player-override',
      worldpackId: 'hk1988',
      actorId: state.player.actorId
    }, overrideImage('player'));
    const hidden = avgDisplaySettings();
    const view = render(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={state}
        saveId="save-player-override"
        displaySettings={hidden}
        resourceRuntime={runtime}
        overrideRepository={repository}
        overrideRevision={1}
        textView={<div>原正文视图</div>}
      />
    );

    expect(await screen.findByText('主角自定义立绘测试。')).toBeInTheDocument();
    expect(screen.queryByTestId('avg-portrait-image')).not.toBeInTheDocument();

    view.rerender(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={state}
        saveId="save-player-override"
        displaySettings={{ ...hidden, avgPlayerPortraitMode: 'show' }}
        resourceRuntime={runtime}
        overrideRepository={repository}
        overrideRevision={1}
        textView={<div>原正文视图</div>}
      />
    );
    expect(await screen.findByTestId('avg-portrait-image')).toHaveAttribute(
      'src',
      expect.stringContaining('blob:avg-pane-')
    );
    expect(view.container.querySelector('.avg-portrait-layer'))
      .toHaveAttribute('data-portrait-source', 'save_override');

    view.rerender(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={state}
        saveId="save-player-override"
        displaySettings={hidden}
        resourceRuntime={runtime}
        overrideRepository={repository}
        overrideRevision={1}
        textView={<div>原正文视图</div>}
      />
    );
    await waitFor(() => expect(screen.queryByTestId('avg-portrait-image')).not.toBeInTheDocument());
  });

  it('re-resolves an override at the same current frame without replaying the entry', async () => {
    const { runtime } = createResourceRuntime();
    const repository = new MemoryAvgVisualOverrideRepository();
    const storyEntry = entry(3, [
      dialogue('第一句。', 'serious'),
      dialogue('第二句。', 'serious'),
      dialogue('第三句。', 'surprised')
    ]);
    const state = createState([storyEntry], 3);
    const view = render(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={state}
        saveId="save-frame-preserve"
        displaySettings={avgDisplaySettings()}
        resourceRuntime={runtime}
        overrideRepository={repository}
        overrideRevision={0}
        textView={<div>原正文视图</div>}
      />
    );
    expect(await screen.findByText('第三句。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重播本回合' }));
    fireEvent.click(screen.getByRole('button', { name: '下一句' }));
    expect(screen.getByText('第二句。')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    await repository.replaceActorOverride({
      visualPartitionId: 'save-frame-preserve',
      worldpackId: 'hk1988',
      actorId: 'npc_detective'
    }, overrideImage('detective'));
    view.rerender(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={state}
        saveId="save-frame-preserve"
        displaySettings={avgDisplaySettings()}
        resourceRuntime={runtime}
        overrideRepository={repository}
        overrideRevision={1}
        textView={<div>原正文视图</div>}
      />
    );

    await waitFor(() => expect(view.container.querySelector('.avg-portrait-layer'))
      .toHaveAttribute('data-portrait-source', 'save_override'));
    expect(screen.getByText('第二句。')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('commits asynchronously loaded asset URLs after the StrictMode effect replay', async () => {
    const { runtime } = createResourceRuntime();
    const storyEntry = entry(2, [dialogue('严格模式也应显示完整画面。', 'serious')]);
    render(
      <StrictMode>
        <StoryPresentationPane
          entries={[storyEntry]}
          runtimeState={createState([storyEntry], 2)}
          saveId="save-strict-assets"
          displaySettings={avgDisplaySettings()}
          resourceRuntime={runtime}
          textView={<div>原正文视图</div>}
        />
      </StrictMode>
    );

    expect(await screen.findByText('严格模式也应显示完整画面。')).toBeInTheDocument();
    expect(await screen.findByTestId('avg-scene-image')).toBeInTheDocument();
    expect(await screen.findByTestId('avg-portrait-image')).toBeInTheDocument();
    expect(screen.queryByText('读取当前画面…')).not.toBeInTheDocument();
  });

  it('carries the previous NPC and scene into a new entry that starts with narration', async () => {
    const { runtime } = createResourceRuntime();
    const previousEntry = entry(1, [dialogue('“明早再查。”', 'serious')]);
    const view = render(
      <StoryPresentationPane
        entries={[previousEntry]}
        runtimeState={createState([previousEntry], 1)}
        saveId="save-cross-entry"
        displaySettings={avgDisplaySettings()}
        resourceRuntime={runtime}
        textView={<div>原正文视图</div>}
      />
    );

    expect(await screen.findByText('“明早再查。”')).toBeInTheDocument();
    await screen.findByTestId('avg-portrait-image');

    const nextEntry = entry(2, [
      { type: 'narration', text: '几秒钟后，他把文件扔回桌上。', sourceStyle: 'tagged' },
      dialogue('“还有什么问题？”', 'serious')
    ]);
    const nextState = createState([previousEntry, nextEntry], 2);
    view.rerender(
      <StoryPresentationPane
        entries={nextState.storyLog}
        runtimeState={nextState}
        saveId="save-cross-entry"
        displaySettings={avgDisplaySettings()}
        resourceRuntime={runtime}
        textView={<div>原正文视图</div>}
      />
    );

    expect(await screen.findByText('几秒钟后，他把文件扔回桌上。')).toBeInTheDocument();
    const viewport = screen.getByRole('region', { name: 'AVG 剧情演出' });
    expect(screen.getByTestId('avg-portrait-image')).toHaveAttribute(
      'src',
      expect.stringContaining('portrait_serious')
    );
    expect(viewport).toHaveAttribute('data-scene-changed', 'false');
    expect(viewport).toHaveAttribute('data-portrait-changed', 'false');
    expect(viewport).toHaveAttribute('data-portrait-variant-changed', 'false');
  });

  it('clears carry state when switching saves', async () => {
    const { runtime } = createResourceRuntime();
    const previousEntry = entry(1, [dialogue('旧存档人物。', 'serious')]);
    const view = render(
      <StoryPresentationPane
        entries={[previousEntry]}
        runtimeState={createState([previousEntry], 1)}
        saveId="save-old"
        displaySettings={avgDisplaySettings()}
        resourceRuntime={runtime}
        textView={<div>原正文视图</div>}
      />
    );
    expect(await screen.findByText('旧存档人物。')).toBeInTheDocument();
    await screen.findByTestId('avg-portrait-image');

    const newEntry = entry(1, [
      { type: 'narration', text: '新存档从空镜开始。', sourceStyle: 'tagged' }
    ]);
    const newState = createState([newEntry], 1);
    view.rerender(
      <StoryPresentationPane
        entries={[newEntry]}
        runtimeState={newState}
        saveId="save-new"
        displaySettings={avgDisplaySettings()}
        resourceRuntime={runtime}
        textView={<div>原正文视图</div>}
      />
    );

    expect(await screen.findByText('新存档从空镜开始。')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('avg-portrait-image')).not.toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'AVG 剧情演出' })).toHaveAttribute(
      'data-scene-changed',
      'true'
    );
  });

  it('opens a loaded snapshot at its final frame when the visual partition is unchanged', async () => {
    const firstEntry = entry(1, [dialogue('同一存档链的旧进度。', 'serious')]);
    const view = render(
      <StoryPresentationPane
        entries={[firstEntry]}
        runtimeState={createState([firstEntry], 1)}
        saveId="shared-visual-partition"
        playbackRevision={0}
        displaySettings={avgDisplaySettings()}
        textView={<div>原正文视图</div>}
      />
    );
    expect(await screen.findByText('同一存档链的旧进度。')).toBeInTheDocument();

    const loadedEntry = entry(2, [
      { type: 'narration', text: '加载后的第一句。', sourceStyle: 'tagged' },
      dialogue('加载后的最后一句。', 'surprised')
    ]);
    const loadedState = createState([firstEntry, loadedEntry], 2);
    view.rerender(
      <StoryPresentationPane
        entries={loadedState.storyLog}
        runtimeState={loadedState}
        saveId="shared-visual-partition"
        playbackRevision={1}
        displaySettings={avgDisplaySettings()}
        textView={<div>原正文视图</div>}
      />
    );

    expect(await screen.findByText('加载后的最后一句。')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('renders safely without an installed resource pack and keeps Text mode available', async () => {
    const unavailableRuntime: AvgPresentationResourceRuntime = {
      loadActivePack: vi.fn(async () => undefined),
      getAssetDisplayUrl: vi.fn(async () => undefined),
      reset: vi.fn(),
      dispose: vi.fn()
    };
    const storyEntry = entry(1, [dialogue('缺少资源也不能丢正文。')]);
    render(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={createState([storyEntry], 1)}
        saveId="save-no-pack"
        displaySettings={avgDisplaySettings()}
        resourceRuntime={unavailableRuntime}
        textView={<div>完整原正文安全回退</div>}
      />
    );

    expect(await screen.findByText('缺少资源也不能丢正文。')).toBeInTheDocument();
    expect(screen.getByText('AVG 资源未启用，当前以中性背景演出')).toBeInTheDocument();
    expect(screen.queryByTestId('avg-scene-image')).not.toBeInTheDocument();
    expect(screen.queryByTestId('avg-portrait-image')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '原正文' }));
    expect(screen.getByText('完整原正文安全回退')).toBeInTheDocument();
  });

  it('exposes an imperative completion hook for non-blocking action submission', async () => {
    const paneRef = createRef<StoryPresentationPaneHandle>();
    const storyEntry = entry(1, [
      { type: 'narration', text: '当前演出第一句。', sourceStyle: 'tagged' },
      dialogue('当前演出最后一句。')
    ]);
    const view = render(
      <StoryPresentationPane
        ref={paneRef}
        entries={[]}
        runtimeState={createState([], 0)}
        saveId="save-complete"
        displaySettings={avgDisplaySettings()}
        textView={<div>原正文视图</div>}
      />
    );
    view.rerender(
      <StoryPresentationPane
        ref={paneRef}
        entries={[storyEntry]}
        runtimeState={createState([storyEntry], 1)}
        saveId="save-complete"
        displaySettings={avgDisplaySettings()}
        textView={<div>原正文视图</div>}
      />
    );

    expect(await screen.findByText('当前演出第一句。')).toBeInTheDocument();
    paneRef.current?.completeCurrentSequence();
    expect(await screen.findByText('当前演出最后一句。')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('switches to the original StoryLog view without mutating story data', async () => {
    const storyEntry = entry(4, [dialogue('原始台词。')]);
    const state = createState([storyEntry], 4);
    const onDisplaySettingsChange = vi.fn();
    render(
      <StoryPresentationPane
        entries={state.storyLog}
        runtimeState={state}
        saveId="save-mode"
        displaySettings={avgDisplaySettings()}
        onDisplaySettingsChange={onDisplaySettingsChange}
        textView={<div data-testid="original-story-view">完整原正文仍在这里</div>}
      />
    );
    expect(await screen.findByText('原始台词。')).toBeInTheDocument();
    const originalView = screen.getByTestId('original-story-view');
    expect(originalView.parentElement).toHaveAttribute('hidden');
    fireEvent.click(screen.getByRole('button', { name: '原正文' }));
    expect(screen.getByText('完整原正文仍在这里')).toBeInTheDocument();
    expect(screen.getByTestId('original-story-view')).toBe(originalView);
    expect(originalView.parentElement).not.toHaveAttribute('hidden');
    expect(onDisplaySettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ storyPresentationMode: 'text' })
    );
    expect(state.storyLog).toEqual([storyEntry]);
  });

  it('applies saved portrait layout and opens a zoomable portrait viewer', async () => {
    const { runtime } = createResourceRuntime();
    const storyEntry = entry(9, [
      dialogue('让我看清楚。', 'serious'),
      dialogue('这句不能因为查看立绘而提前出现。', 'neutral')
    ]);
    const displaySettings: DisplaySettings = {
      ...avgDisplaySettings(),
      avgPortraitLayout: {
        scalePercent: 132,
        horizontalOffsetPercent: -11,
        verticalOffsetPercent: 7
      }
    };
    render(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={createState([storyEntry], 9)}
        saveId="save-portrait-viewer"
        displaySettings={displaySettings}
        resourceRuntime={runtime}
        textView={<div>原正文视图</div>}
      />
    );

    const pane = screen.getByRole('region', { name: '剧情呈现' });
    expect(pane.style.getPropertyValue('--avg-portrait-user-scale')).toBe('1.32');
    expect(pane.style.getPropertyValue('--avg-portrait-user-offset-x')).toBe('-11%');
    expect(pane.style.getPropertyValue('--avg-portrait-user-offset-y')).toBe('7%');

    const portraitButton = await screen.findByRole('button', { name: '查看陈探员立绘大图' });
    const viewport = screen.getByRole('region', { name: 'AVG 剧情演出' });
    const dialogueBeforeOpen = viewport.querySelector('.avg-dialogue-text')?.textContent;
    const frameBeforeOpen = viewport.querySelector('.avg-frame-counter')?.textContent;
    fireEvent.click(portraitButton);
    expect(viewport.querySelector('.avg-dialogue-text')?.textContent).toBe(dialogueBeforeOpen);
    expect(viewport.querySelector('.avg-frame-counter')?.textContent).toBe(frameBeforeOpen);
    const dialog = screen.getByRole('dialog', { name: '陈探员立绘大图' });
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector('.avg-portrait-viewer-dialog')).not.toBeInTheDocument();
    expect(dialog.querySelector('.avg-portrait-viewer-artwork')).toHaveAttribute(
      'alt',
      '陈探员立绘'
    );
    expect(screen.getByText('100%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '放大立绘' }));
    expect(screen.getByText('125%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭立绘大图' }));
    expect(screen.queryByRole('dialog', { name: '陈探员立绘大图' })).not.toBeInTheDocument();
  });

  it('mounts the portrait viewer inside the active fullscreen element', async () => {
    const originalFullscreenElement = Object.getOwnPropertyDescriptor(
      document,
      'fullscreenElement'
    );
    const fullscreenHost = document.createElement('div');
    document.body.append(fullscreenHost);
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenHost
    });

    try {
      const { runtime } = createResourceRuntime();
      const storyEntry = entry(10, [dialogue('全屏里也要看清楚。', 'serious')]);
      render(
        <StoryPresentationPane
          entries={[storyEntry]}
          runtimeState={createState([storyEntry], 10)}
          saveId="save-fullscreen-portrait-viewer"
          displaySettings={avgDisplaySettings()}
          resourceRuntime={runtime}
          textView={<div>原正文视图</div>}
        />
      );

      fireEvent.click(await screen.findByRole('button', { name: '查看陈探员立绘大图' }));
      const dialog = screen.getByRole('dialog', { name: '陈探员立绘大图' });
      expect(fullscreenHost).toContainElement(dialog);

      fireEvent.click(screen.getByRole('button', { name: '关闭立绘大图' }));
      expect(screen.queryByRole('dialog', { name: '陈探员立绘大图' })).not.toBeInTheDocument();
    } finally {
      if (originalFullscreenElement) {
        Object.defineProperty(document, 'fullscreenElement', originalFullscreenElement);
      } else {
        Reflect.deleteProperty(document, 'fullscreenElement');
      }
      fullscreenHost.remove();
    }
  });

  it('keeps heavy rain outside an indoor police scene and leaves dialogue controls ungraded', async () => {
    const { runtime } = createResourceRuntime();
    const storyEntry = entry(5, [dialogue('室内雨夜仍然清楚。', 'serious')], {
      hour: 22,
      weatherCondition: 'heavy_rain',
      weatherIntensity: 82
    });
    render(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={createState([storyEntry], 5)}
        saveId="save-indoor-rain"
        displaySettings={avgDisplaySettings()}
        resourceRuntime={runtime}
        textView={<div>原正文视图</div>}
      />
    );

    expect(await screen.findByText('室内雨夜仍然清楚。')).toBeInTheDocument();
    const viewport = screen.getByRole('region', { name: 'AVG 剧情演出' });
    expect(viewport).toHaveAttribute('data-time-phase', 'night');
    expect(viewport).toHaveAttribute('data-weather-kind', 'heavy_rain');
    expect(viewport).toHaveAttribute('data-scene-exposure', 'indoor');
    expect(screen.queryByTestId('avg-weather-rain')).not.toBeInTheDocument();
    const dialogueLayer = screen.getByText('室内雨夜仍然清楚。').closest('.avg-dialogue-layer');
    expect(dialogueLayer?.closest('.avg-scene-layer')).toBeNull();
    expect(dialogueLayer?.closest('.avg-weather-overlay-layer')).toBeNull();
  });

  it('renders bounded outdoor rain and does not reload the scene for a weather-only change', async () => {
    const { runtime } = createResourceRuntime('mong_kok_dense_street');
    const clearEntry = entry(6, [dialogue('天气将变。', 'serious')], {
      hour: 16,
      weatherCondition: 'clear',
      weatherIntensity: 20
    });
    const view = render(
      <StoryPresentationPane
        entries={[clearEntry]}
        runtimeState={createState([clearEntry], 6)}
        saveId="save-outdoor-rain"
        displaySettings={avgDisplaySettings()}
        resourceRuntime={runtime}
        textView={<div>原正文视图</div>}
      />
    );
    expect(await screen.findByText('天气将变。')).toBeInTheDocument();
    await waitFor(() => expect(runtime.getAssetDisplayUrl).toHaveBeenCalledTimes(2));

    const rainEntry = entry(7, [dialogue('雨势加重。', 'serious')], {
      hour: 23,
      weatherCondition: 'heavy_rain',
      weatherIntensity: 88
    });
    const rainState = createState([clearEntry, rainEntry], 7);
    view.rerender(
      <StoryPresentationPane
        entries={rainState.storyLog}
        runtimeState={rainState}
        saveId="save-outdoor-rain"
        displaySettings={avgDisplaySettings()}
        resourceRuntime={runtime}
        textView={<div>原正文视图</div>}
      />
    );

    expect(await screen.findByText('雨势加重。')).toBeInTheDocument();
    const rain = await screen.findByTestId('avg-weather-rain');
    expect(rain.querySelectorAll('i')).toHaveLength(18);
    expect(screen.getByRole('region', { name: 'AVG 剧情演出' }))
      .toHaveAttribute('data-scene-exposure', 'outdoor');
    expect(runtime.getAssetDisplayUrl).toHaveBeenCalledTimes(2);
  });

  it('unmounts environment layers completely in Text mode', async () => {
    const storyEntry = entry(8, [dialogue('环境层只属于AVG。')], {
      weatherCondition: 'foggy',
      weatherIntensity: 50
    });
    render(
      <StoryPresentationPane
        entries={[storyEntry]}
        runtimeState={createState([storyEntry], 8)}
        saveId="save-text-environment"
        displaySettings={avgDisplaySettings()}
        textView={<div>原正文环境无关</div>}
      />
    );
    expect(await screen.findByTestId('avg-environment-lighting')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '原正文' }));
    expect(screen.getByText('原正文环境无关')).toBeInTheDocument();
    expect(screen.queryByTestId('avg-environment-lighting')).not.toBeInTheDocument();
    expect(screen.queryByTestId('avg-weather-overlay')).not.toBeInTheDocument();
  });
});
