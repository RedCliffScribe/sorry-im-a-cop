import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInitialRuntimeState } from '../../../domain/runtime/initialState';
import { MemoryAvgVisualOverrideRepository } from '../../../domain/avgVisualOverride';
import { DefaultAvgResourceResolver } from '../../../domain/avgResourcePack';
import {
  fixtureFixed,
  fixtureOutfit,
  fixturePack
} from '../../../domain/avgPresentation/testFixtures';
import type { AvgImageGenerationService } from '../../../domain/avgImageGeneration';
import { createDefaultImageApiProfile } from '../../../domain/imageGeneration/profile';
import type { ActiveAvgResourceSession } from './avgPresentationResourceRuntime';
import {
  AvgPortraitOverrideControl,
  AvgSceneOverrideControl
} from './AvgVisualOverrideControls';
import { AvgVisualOverrideDialog } from './AvgVisualOverrideDialog';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let originalCreateObjectUrl: PropertyDescriptor | undefined;
let originalRevokeObjectUrl: PropertyDescriptor | undefined;
const createObjectUrl = vi.fn(() => `blob:avg-override-${createObjectUrl.mock.calls.length}`);
const revokeObjectUrl = vi.fn();

beforeEach(() => {
  originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: createObjectUrl
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: revokeObjectUrl
  });
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
    width: 512,
    height: 1024,
    close: vi.fn()
  })));
});

afterEach(() => {
  createObjectUrl.mockClear();
  revokeObjectUrl.mockClear();
  if (originalCreateObjectUrl) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
  vi.unstubAllGlobals();
});

describe('AVG manual visual override controls', () => {
  it('previews before commit, persists the original file, and restores the default mapping', async () => {
    const repository = new MemoryAvgVisualOverrideRepository();
    const actor = createInitialRuntimeState().actors.player!;
    const onChanged = vi.fn();
    const props = {
      actor,
      visualPartitionId: 'chain_a',
      worldpackId: 'hk_1988',
      repository,
      revision: 0,
      onChanged
    };
    const view = render(<AvgPortraitOverrideControl {...props} />);
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([PNG.slice().buffer], 'player-custom.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByLabelText('待确认图片预览')).toBeInTheDocument();
    expect(screen.getByText('player-custom.png')).toBeInTheDocument();
    expect(screen.getByText('512 × 1024')).toBeInTheDocument();
    expect(await repository.getActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: actor.actorId
    })).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: '使用此图' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect((await repository.getActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: actor.actorId
    }))?.status).toBe('ready');

    view.rerender(<AvgPortraitOverrideControl {...props} revision={1} />);
    expect(await screen.findByText('当前来源：玩家替换')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '恢复默认' }));
    await waitFor(async () => expect(await repository.getActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: actor.actorId
    })).toBeUndefined());
    expect(onChanged).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(revokeObjectUrl).toHaveBeenCalled();
  });

  it('rejects SVG locally and leaves the current mapping unchanged', async () => {
    const repository = new MemoryAvgVisualOverrideRepository();
    const actor = createInitialRuntimeState().actors.player!;
    const view = render(
      <AvgPortraitOverrideControl
        actor={actor}
        visualPartitionId="chain_a"
        worldpackId="hk1988"
        repository={repository}
        onChanged={vi.fn()}
      />
    );
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, {
      target: { files: [new File(['<svg/>'], 'unsafe.svg', { type: 'image/svg+xml' })] }
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('只支持 PNG、WebP 或 JPEG/JPG');
    expect(await repository.getActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: actor.actorId
    })).toBeUndefined();
  });

  it('keeps an AI result as a candidate until explicit adoption, then records its task provenance', async () => {
    const repository = new MemoryAvgVisualOverrideRepository();
    const actor = createInitialRuntimeState().actors.player!;
    const profile = {
      ...createDefaultImageApiProfile('openai-images', 'profile-yuqing', '2026-08-10T00:00:00.000Z'),
      name: 'yuqing tianbohe',
      enabled: true
    };
    const blob = new Blob([PNG.slice().buffer], { type: 'image/png' });
    const candidate = {
      purpose: 'avg_character_portrait' as const,
      targetKey: `actor:${actor.actorId}`,
      taskId: 'task-avg-candidate',
      asset: {
        imageId: 'image-avg-candidate',
        scope: 'save' as const,
        saveId: 'chain_a',
        source: 'generated' as const,
        sourceTaskId: 'task-avg-candidate',
        mimeType: 'image/png' as const,
        width: 1024,
        height: 1536,
        byteLength: blob.size,
        contentHash: 'a'.repeat(64),
        blobKey: 'blob-avg-candidate',
        createdAt: '2026-08-10T00:00:00.000Z'
      },
      blob,
      profileId: profile.profileId,
      profileName: profile.name,
      providerType: profile.providerType,
      modelOrWorkflowLabel: 'tianbohe-image',
      positivePrompt: 'stable full body portrait',
      negativePrompt: 'cropped limbs',
      targetAspectRatio: '2:3',
      transparencyMode: 'prompt-only' as const
    };
    const service = {
      listRoutingOptions: vi.fn().mockResolvedValue({ profiles: [profile], workflows: [] }),
      findLatestCandidate: vi.fn().mockResolvedValue(undefined),
      generatePortrait: vi.fn().mockResolvedValue(candidate)
    } as unknown as AvgImageGenerationService;
    const onChanged = vi.fn();
    render(
      <AvgPortraitOverrideControl
        actor={actor}
        visualPartitionId="chain_a"
        worldpackId="hk1988"
        repository={repository}
        onChanged={onChanged}
        imageGeneration={{
          kind: 'portrait',
          service,
          saveId: 'chain_a',
          context: {
            worldpackId: 'hk1988',
            worldYear: 1988,
            actorId: actor.actorId,
            targetKey: `actor:${actor.actorId}`,
            identityLabel: actor.name
          }
        }}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: '生成候选图' }));
    expect(await screen.findByLabelText('AI 生成候选图预览')).toBeInTheDocument();
    expect(await repository.getActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: actor.actorId
    })).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: '使用此图' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    const stored = await repository.getActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: actor.actorId
    });
    expect(stored?.asset).toMatchObject({
      source: 'image_generation',
      sourceTaskId: 'task-avg-candidate'
    });
  });

  it('creates a user outfit without auto-selecting it, then stores an outfit-specific image', async () => {
    const repository = new MemoryAvgVisualOverrideRepository();
    const state = createInitialRuntimeState();
    const identity = {
      worldpackId: 'hk1988',
      kind: 'era_seed' as const,
      canonicalId: 'fixture_outfit_actor'
    };
    const actor = {
      ...state.actors.player!,
      stableIdentityRef: identity
    };
    const fixed = fixtureFixed(identity, ['default', 'serious']);
    fixed.outfits.formal = {
      ...fixtureOutfit(['default', 'serious']),
      outfitId: 'formal'
    };
    const pack = fixturePack({ packId: 'fixture_outfit_pack', fixed: [fixed] });
    const resourceSession: ActiveAvgResourceSession = {
      resolver: new DefaultAvgResourceResolver({ basePack: pack }),
      activePack: {
        worldpackId: 'hk1988',
        basePackId: pack.manifest.packId,
        basePackVersion: pack.manifest.version
      },
      displayName: '服装测试资源包',
      selectionToken: `${pack.manifest.packId}@${pack.manifest.version}`
    };
    const key = {
      visualPartitionId: 'chain_outfit',
      worldpackId: 'hk1988',
      actorId: actor.actorId
    };
    const onChanged = vi.fn();
    const view = render(
      <AvgPortraitOverrideControl
        actor={actor}
        visualPartitionId={key.visualPartitionId}
        worldpackId={key.worldpackId}
        repository={repository}
        resourceSession={resourceSession}
        onChanged={onChanged}
      />
    );

    fireEvent.click(screen.getByText('新建或编辑自定义服装'));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '红色礼服' } });
    fireEvent.change(screen.getByLabelText('视觉说明'), {
      target: { value: '红色丝绒修身晚礼服，保持人物脸、发型和身材。' }
    });
    fireEvent.click(screen.getByRole('button', { name: '新建服装' }));

    await waitFor(async () => expect(await repository.listUserOutfits(key)).toHaveLength(1));
    expect((await repository.getActorOutfitSelection(key, pack.manifest.packId)).selection)
      .toEqual({ type: 'resource_default' });
    const [created] = await repository.listUserOutfits(key);
    expect(created).toBeDefined();

    fireEvent.change(screen.getByLabelText('当前服装'), {
      target: { value: `user:${created!.outfitId}` }
    });
    await waitFor(async () => expect(
      (await repository.getActorOutfitSelection(key, pack.manifest.packId)).selection
    ).toEqual({ type: 'user_outfit', outfitId: created!.outfitId }));
    expect(screen.getByText(/自定义服装若尚未设置专属图片/)).toBeInTheDocument();

    const heading = await screen.findByRole('heading', {
      name: '当前服装专属立绘 · 红色礼服'
    });
    const section = heading.closest('section')!;
    const input = section.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, {
      target: {
        files: [new File([PNG.slice().buffer], 'red-evening.png', { type: 'image/png' })]
      }
    });
    expect(await within(section).findByLabelText('待确认图片预览')).toBeInTheDocument();
    fireEvent.click(within(section).getByRole('button', { name: '使用此图' }));

    await waitFor(async () => expect((await repository.getActorOutfitOverride({
      ...key,
      outfit: { type: 'user_outfit', outfitId: created!.outfitId }
    }))?.status).toBe('ready'));
    expect(await repository.getActorOverride(key)).toBeUndefined();
    expect(onChanged).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('refuses a permanent scene mapping without a stable runtime anchor', () => {
    render(
      <AvgSceneOverrideControl
        locationLabel="自由文本地点"
        repository={new MemoryAvgVisualOverrideRepository()}
        onChanged={vi.fn()}
      />
    );
    expect(screen.getByText('当前地点缺少稳定的场景或地点标识，暂不能永久替换背景。'))
      .toBeInTheDocument();
    expect(screen.queryByText('选择本地图片')).not.toBeInTheDocument();
  });

  it('portals the quick replacement dialog outside the AVG stage stacking context', () => {
    const runtimeState = createInitialRuntimeState();
    const view = render(
      <div className="avg-story-stage">
        <AvgVisualOverrideDialog
          runtimeState={runtimeState}
          visualPartitionId="chain_a"
          actorId="player"
          repository={new MemoryAvgVisualOverrideRepository()}
          revision={0}
          onChanged={vi.fn()}
        />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: '视觉' }));
    const dialog = screen.getByRole('dialog', { name: '替换当前 AVG 视觉' });
    expect(dialog.closest('.avg-story-stage')).toBeNull();
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    view.unmount();
  });
});
