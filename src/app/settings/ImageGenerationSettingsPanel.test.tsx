import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IndexedDbImageProbeStore } from '../../domain/imageGeneration/probe';
import {
  type ComfyWorkflowTemplate,
  IndexedDbImageCredentialRepository,
  IndexedDbImageProfileRepository,
  createDefaultImageApiProfile
} from '../../domain/imageGeneration/profile';
import { TEST_JPEG_BASE64 } from '../../domain/imageGeneration/providers/providerTestUtils';
import {
  IndexedDbImagePromptTemplateRepository,
  createEmptyImagePromptTemplateSettings,
  serializeImagePromptTemplateSettings
} from '../../domain/imageGeneration/promptConversion';
import { ImageGenerationSettingsPanel } from './ImageGenerationSettingsPanel';
import {
  IndexedDbImageGenerationPresetRepository,
  createImageGenerationPreset
} from '../../domain/imageGeneration/generationPresets';
import {
  IndexedDbImageAutomationSettingsRepository,
  createDefaultImageAutomationSettings
} from '../../domain/imageGeneration/automationSettings';
import { APP_VERSION_LABEL } from '../releaseIdentity';

function repositories(prefix: string) {
  return {
    profileRepository: new IndexedDbImageProfileRepository(`${prefix}-profiles-${crypto.randomUUID()}`),
    credentialRepository: new IndexedDbImageCredentialRepository(`${prefix}-credentials-${crypto.randomUUID()}`),
    probeStore: new IndexedDbImageProbeStore(`${prefix}-probes-${crypto.randomUUID()}`)
  };
}

describe('ImageGenerationSettingsPanel', () => {
  it('opens the PNG style library as a separate local asset page', async () => {
    render(<ImageGenerationSettingsPanel {...repositories('png-style-tab')} />);
    fireEvent.click(screen.getByRole('tab', { name: 'PNG画风库' }));
    expect(await screen.findByRole('heading', { name: 'PNG 画风库' })).toBeInTheDocument();
    expect(screen.getByText(/只在本机读取 PNG 元数据/)).toBeInTheDocument();
    expect(screen.getByText(/不会被执行或自动加载/)).toBeInTheDocument();
    expect(screen.getByLabelText('导入 PNG 画风文件')).toHaveAttribute('accept', 'image/png,.png');
  });

  it('starts unconfigured with exactly seven approved providers and no callable probes', async () => {
    render(<ImageGenerationSettingsPanel {...repositories('empty')} />);

    expect(screen.getByRole('heading', { name: '文生图设置' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'API 与模型' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: '当前图片档案' })).toBeInTheDocument();
    expect(screen.getByText('尚未配置')).toBeInTheDocument();
    expect(within(screen.getByLabelText('新增图片档案后端')).getAllByRole('option')).toHaveLength(7);
    expect(await screen.findByLabelText('API 根地址')).toHaveValue('https://api.openai.com/v1');
    expect(screen.getByText(/下方已经展开 API 地址表单/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '检查配置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '测试连接' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '生成测试图' })).not.toBeInTheDocument();
    expect(screen.getByText(/不支持任意供应商 JSON 或脚本/)).toBeInTheDocument();
  });

  it('creates an isolated profile and credential, runs all three probes, then relocks after cleanup', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image-probe-test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/models')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/images/generations')) {
        return new Response(JSON.stringify({ id: 'request-safe-1', data: [{ b64_json: TEST_JPEG_BASE64 }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`unexpected URL ${url}`);
    });
    render(
      <ImageGenerationSettingsPanel
        {...repositories('full')}
        fetchImpl={fetchMock}
        probeEnvironment="local-browser"
      />
    );

    const apiBaseUrl = await screen.findByLabelText('API 根地址');
    fireEvent.change(apiBaseUrl, { target: { value: 'https://images.example.com/v1' } });
    expect(apiBaseUrl).toHaveValue('https://images.example.com/v1');
    fireEvent.change(screen.getByLabelText('档案名称'), { target: { value: '我的 OpenAI 图片档案' } });
    fireEvent.change(screen.getByLabelText(/默认测试模型/), { target: { value: 'test-image-model' } });
    fireEvent.click(screen.getByLabelText(/启用此档案/));
    fireEvent.change(screen.getByLabelText('新凭据名称'), { target: { value: '本机测试 Key' } });
    fireEvent.change(screen.getByLabelText('Token'), { target: { value: 'runtime-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存新凭据并关联' }));
    expect(await screen.findByText(/凭据已保存到独立本机仓库/)).toBeInTheDocument();
    expect(screen.getByLabelText('Token')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: '保存图片档案' }));
    expect(await screen.findByText(/图片档案已保存/)).toBeInTheDocument();
    expect(screen.getByText('1 个本机档案')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '检查配置' }));
    expect(await screen.findAllByText(/不代表连接或生图成功/)).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    expect(await screen.findAllByText(/通过：模型目录/)).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '生成测试图' }));
    const dialog = await screen.findByRole('dialog', { name: '生成测试费用确认' });
    expect(dialog).toHaveTextContent('可能产生费用');
    expect(dialog).toHaveTextContent('a single red apple');
    fireEvent.click(within(dialog).getByRole('button', { name: '确认并生成测试图' }));

    expect(await screen.findByText(/real-passed：真实图片生成探针通过/)).toBeInTheDocument();
    expect(screen.getByText('自动模式证据有效')).toBeInTheDocument();
    expect(screen.getByText('独立测试图')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: '下载测试图' })).toHaveAttribute(
      'download',
      expect.stringMatching(/\.jpg$/)
    );
    expect(screen.getAllByText('已到达')).toHaveLength(6);
    expect(screen.getByText('request-safe-1')).toBeInTheDocument();
    expect(screen.getByText('总耗时')).toBeInTheDocument();
    expect(screen.getByText(/本地校验 → 认证检查 → 提交任务/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: '下载脱敏证据 JSON' }));
    expect(screen.getByText(/已下载当前档案的脱敏证据 JSON/)).toBeInTheDocument();
    const exportedBlob = createObjectUrl.mock.calls
      .map(([blob]) => blob)
      .find((blob) => blob instanceof Blob && blob.type === 'application/json');
    expect(exportedBlob).toBeInstanceOf(Blob);
    expect(await (exportedBlob as Blob).text()).toContain('request-safe-1');
    expect(await (exportedBlob as Blob).text()).not.toContain('runtime-secret');

    fireEvent.change(screen.getByLabelText(/默认测试模型/), { target: { value: 'changed-image-model' } });
    fireEvent.click(screen.getByRole('button', { name: '保存图片档案' }));
    await waitFor(() => expect(screen.getByText('自动模式已锁定')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '清除当前档案测试记录' }));
    await waitFor(() => expect(screen.queryByText('独立测试图')).not.toBeInTheDocument());
    expect(screen.getByText('自动模式已锁定')).toBeInTheDocument();
    expect(screen.getByText(/测试记录已清除/)).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '删除档案' }));
    await waitFor(() => expect(screen.getByText('尚未配置')).toBeInTheDocument());
    expect(screen.queryByText(/不代表连接或生图成功/)).not.toBeInTheDocument();
    expect(screen.getByText(/图片档案、关联预设和测试证据已删除/)).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('exposes automation preferences behind the runtime evidence gate and managed prompt templates', () => {
    render(<ImageGenerationSettingsPanel {...repositories('boundaries')} />);

    expect(
      screen.getByText(`${APP_VERSION_LABEL} · 正式版`)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '自动化规则' }));
    const automation = screen.getByRole('region', { name: '自动化规则' });
    expect(automation).toHaveTextContent('真实生成通过证据');
    expect(screen.getByRole('button', { name: '保存自动化规则' })).toBeEnabled();

    fireEvent.click(screen.getByRole('tab', { name: '提示词模板' }));
    fireEvent.click(screen.getByLabelText('当前辅助生成路由的模型支持图片输入'));
    const templates = screen.getByRole('region', { name: '提示词模板设置' });
    expect(templates).toHaveTextContent('图片管理只管理资产与绑定');
    const comfyUiStyles = screen.getByRole('complementary', { name: 'ComfyUI 实测风格说明' });
    expect(comfyUiStyles).toHaveTextContent('AsianBlend、Duchaiten 人物／雨夜场景');
    expect(comfyUiStyles).toHaveTextContent('北条司、织田 non 和十六夜清心');
    expect(comfyUiStyles).toHaveTextContent('不会加载 checkpoint 或 LoRA');
    expect(screen.getByLabelText('人物图覆盖风格')).toHaveTextContent('织田 non 成熟绘风方向（提示词）');
    expect(screen.getByLabelText('人物图覆盖风格')).toHaveTextContent('十六夜清心柔绘方向（提示词）');
    expect(screen.getByRole('heading', { name: 'ComfyUI 风格配方库' })).toBeInTheDocument();
    expect(screen.getByText('16 套')).toBeInTheDocument();
    expect(screen.getAllByText('NAI·织田 non × 十六夜清心·轻写实').length).toBeGreaterThan(0);
    expect(screen.getByText('8 套')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '提示词风格与 ComfyUI 配方边界' }))
      .toHaveTextContent('没有模型映射时只能选择“仅提示词近似”');
    const novelAiRecommendation = screen.getByRole('complementary', { name: 'NovelAI 风格建议' });
    expect(novelAiRecommendation).toHaveTextContent('NAI 推荐·日漫写实');
    expect(novelAiRecommendation).toHaveTextContent('不会随模型切换自动覆盖玩家选择');
    expect(screen.getByText(/OpenAI GPT Image、Gemini 原生图片与 NovelAI/))
      .toHaveTextContent('三套独立内置方案');
    fireEvent.click(within(novelAiRecommendation).getByRole('button', { name: '人物图使用 NAI 推荐' }));
    fireEvent.click(within(novelAiRecommendation).getByRole('button', { name: '场景图使用 NAI 推荐' }));
    expect(screen.getByLabelText('人物图覆盖风格')).toHaveValue('builtin-style-hong-kong-mature-crime-anime');
    expect(screen.getByLabelText('场景图覆盖风格')).toHaveValue('builtin-style-hong-kong-mature-crime-anime');
    expect(screen.getByLabelText('人物图风格组合方式')).toHaveValue('replace-global');
    expect(screen.getByLabelText('场景图风格组合方式')).toHaveValue('replace-global');
    expect(screen.getByLabelText('全局默认图片风格')).toHaveValue('builtin-style-hong-kong-crime-realism');
    const styleSummary = screen.getByRole('complementary', { name: '当前图片风格组合' });
    expect(styleSummary).toHaveTextContent('NAI 推荐·日漫写实（覆盖全局“1980 年代港产写实插画”）');
    expect(screen.getByRole('button', { name: '导出文生图模板' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '导入文生图模板' })).toBeEnabled();
    expect(screen.getByLabelText('导入文生图模板文件')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存提示词设置' })).toBeEnabled();
    expect((screen.getByLabelText('回合正文场景规划任务指令') as HTMLTextAreaElement).value)
      .toContain('requestedMaxScenes');
    const sceneInstructionGroup = screen.getByRole('group', { name: '回合正文场景规划' });
    fireEvent.change(within(sceneInstructionGroup).getByRole('textbox', { name: '回合正文场景规划任务指令' }), {
      target: { value: '临时覆盖' }
    });
    fireEvent.click(within(sceneInstructionGroup).getByRole('button', { name: '恢复此项默认指令' }));
    expect((within(sceneInstructionGroup).getByRole('textbox') as HTMLTextAreaElement).value)
      .toContain('requestedMaxScenes');
  });

  it('saves a character default route and an optional separate scene route', async () => {
    const repos = repositories('split-automation');
    const automationSettingsRepository = new IndexedDbImageAutomationSettingsRepository(
      `split-automation-settings-${crypto.randomUUID()}`
    );
    const characterProfile = createDefaultImageApiProfile('openai-images', 'profile-ui-character');
    if (characterProfile.providerType !== 'openai-images') throw new Error('expected OpenAI character profile');
    characterProfile.name = '人物默认档案';
    characterProfile.enabled = true;
    characterProfile.models = [{ modelId: 'character-model', source: 'manual' }];
    characterProfile.defaultModelId = 'character-model';
    const sceneProfile = createDefaultImageApiProfile('openai-images', 'profile-ui-scene');
    if (sceneProfile.providerType !== 'openai-images') throw new Error('expected OpenAI scene profile');
    sceneProfile.name = '场景独立档案';
    sceneProfile.enabled = true;
    sceneProfile.models = [{ modelId: 'scene-model', source: 'manual' }];
    sceneProfile.defaultModelId = 'scene-model';
    await repos.profileRepository.putProfile(characterProfile);
    await repos.profileRepository.putProfile(sceneProfile);

    render(<ImageGenerationSettingsPanel
      {...repos}
      automationSettingsRepository={automationSettingsRepository}
    />);
    fireEvent.click(screen.getByRole('tab', { name: '自动化规则' }));
    await waitFor(() => expect(screen.getByLabelText('人物默认自动图片档案')).toHaveTextContent('人物默认档案'));
    expect(screen.getByText(/场景自动任务默认复用人物自动路由/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('人物默认自动图片档案'), { target: { value: characterProfile.profileId } });
    fireEvent.change(screen.getByLabelText('新 NPC 角色图'), { target: { value: 'automatic' } });
    fireEvent.change(screen.getByLabelText('正文场景图'), { target: { value: 'automatic' } });
    fireEvent.click(screen.getByLabelText('场景自动任务使用独立图片档案'));
    fireEvent.change(screen.getByLabelText('场景独立自动图片档案'), { target: { value: sceneProfile.profileId } });
    fireEvent.click(screen.getByRole('button', { name: '保存自动化规则' }));

    expect(await screen.findByText(/自动化规则已保存/)).toBeInTheDocument();
    await expect(automationSettingsRepository.load()).resolves.toMatchObject({
      characterMode: 'automatic',
      sceneMode: 'automatic',
      characterAutomaticProfileId: characterProfile.profileId,
      sceneAutomaticRouting: 'separate',
      sceneAutomaticProfileId: sceneProfile.profileId
    });
  });

  it('deletes profile-bound presets and safely detaches automatic modes without deleting generated assets', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const repos = repositories('profile-lifecycle');
    const generationPresetRepository = new IndexedDbImageGenerationPresetRepository(
      `profile-lifecycle-presets-${crypto.randomUUID()}`
    );
    const automationSettingsRepository = new IndexedDbImageAutomationSettingsRepository(
      `profile-lifecycle-automation-${crypto.randomUUID()}`
    );
    const profile = createDefaultImageApiProfile(
      'openai-images',
      'profile-delete',
      '2026-07-23T07:00:00.000Z'
    );
    if (profile.providerType !== 'openai-images') throw new Error('expected OpenAI profile');
    profile.name = '待删除图片档案';
    profile.enabled = true;
    profile.models = [{ modelId: 'gpt-image-test', source: 'manual' }];
    profile.defaultModelId = 'gpt-image-test';
    await repos.profileRepository.putProfile(profile);
    await generationPresetRepository.save(createImageGenerationPreset({
      name: '待删除半身像预设',
      profileId: profile.profileId,
      providerType: profile.providerType,
      variantKey: 'half-body-medium',
      routingTarget: { kind: 'model', modelId: 'gpt-image-test' },
      targetAspectRatio: '3:4',
      generationParameters: {
        providerType: 'openai-images',
        requestedImageCount: 1,
        size: { mode: 'dimensions', width: 1024, height: 1536 },
        quality: 'medium',
        outputFormat: 'png',
        background: 'opaque'
      },
      now: '2026-07-23T07:00:00.000Z'
    }));
    await automationSettingsRepository.save({
      ...createDefaultImageAutomationSettings('2026-07-23T07:00:00.000Z'),
      revision: 2,
      characterMode: 'automatic',
      sceneMode: 'automatic',
      characterAutomaticProfileId: profile.profileId
    });

    render(<ImageGenerationSettingsPanel
      {...repos}
      generationPresetRepository={generationPresetRepository}
      automationSettingsRepository={automationSettingsRepository}
    />);

    expect(await screen.findByText('待删除图片档案')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '删除档案' }));
    await waitFor(() => expect(screen.getByText('尚未配置')).toBeInTheDocument());

    await expect(generationPresetRepository.list(profile.profileId)).resolves.toEqual([]);
    await expect(automationSettingsRepository.load()).resolves.toMatchObject({
      characterMode: 'manual',
      sceneMode: 'manual',
      characterAutomaticProfileId: undefined,
      characterAutomaticWorkflowTemplateId: undefined
    });
    expect(screen.getByText(/独立凭据和已生成图片未删除/)).toBeInTheDocument();
  });

  it('persists common prompt templates independently from image profiles', async () => {
    const promptTemplateRepository = new IndexedDbImagePromptTemplateRepository(`settings-prompts-${crypto.randomUUID()}`);
    render(<ImageGenerationSettingsPanel {...repositories('prompt-save')} promptTemplateRepository={promptTemplateRepository} />);
    fireEvent.click(screen.getByRole('tab', { name: '提示词模板' }));
    fireEvent.click(screen.getByLabelText('当前辅助生成路由的模型支持图片输入'));
    const globalGroup = screen.getByRole('group', { name: '全局画风与质量要求' });
    fireEvent.change(within(globalGroup).getByRole('textbox', { name: '正向模板' }), {
      target: { value: '香港犯罪剧情写实电影感' }
    });
    fireEvent.change(screen.getByLabelText('回合正文场景规划任务指令'), {
      target: { value: '玩家自定义场景规划指令' }
    });
    fireEvent.click(screen.getByRole('button', { name: '保存提示词设置' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已保存模板修订'));
    await expect(promptTemplateRepository.load()).resolves.toMatchObject({
      conversionCapabilities: { imageInputEnabled: true },
      conversionInstructions: { 'turn-scene-plan': '玩家自定义场景规划指令' },
      revision: 2,
      modifiers: { global: { positive: '香港犯罪剧情写实电影感', negative: '' } }
    });
  });

  it('loads a validated template import into the editor without saving until confirmed', async () => {
    const promptTemplateRepository = new IndexedDbImagePromptTemplateRepository(`settings-prompts-import-${crypto.randomUUID()}`);
    const source = createEmptyImagePromptTemplateSettings('2026-07-23T05:00:00.000Z');
    source.revision = 12;
    source.modifiers.global.positive = 'imported cinematic noir';
    source.conversionInstructions['turn-scene-plan'] = '导入的场景规划指令';
    const rawJson = serializeImagePromptTemplateSettings(source, '2026-07-23T06:00:00.000Z');

    render(<ImageGenerationSettingsPanel {...repositories('prompt-import')} promptTemplateRepository={promptTemplateRepository} />);
    fireEvent.click(screen.getByRole('tab', { name: '提示词模板' }));
    const file = new File([rawJson], 'image-prompts.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: vi.fn().mockResolvedValue(rawJson) });
    fireEvent.change(screen.getByLabelText('导入文生图模板文件'), { target: { files: [file] } });

    expect(await screen.findByRole('status')).toHaveTextContent('模板已载入编辑区');
    expect(screen.getByLabelText('回合正文场景规划任务指令')).toHaveValue('导入的场景规划指令');
    expect(within(screen.getByRole('group', { name: '全局画风与质量要求' })).getByRole('textbox', { name: '正向模板' }))
      .toHaveValue('imported cinematic noir');
    await expect(promptTemplateRepository.load()).resolves.toMatchObject({
      revision: 1,
      modifierDefaultsState: 'built-in'
    });

    fireEvent.click(screen.getByRole('button', { name: '保存提示词设置' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已保存模板修订 2'));
    await expect(promptTemplateRepository.load()).resolves.toMatchObject({
      revision: 2,
      modifiers: { global: { positive: 'imported cinematic noir', negative: '' } }
    });
  });

  it('rejects an invalid template import without replacing the current editor', async () => {
    render(<ImageGenerationSettingsPanel {...repositories('prompt-import-invalid')} />);
    fireEvent.click(screen.getByRole('tab', { name: '提示词模板' }));
    const editor = screen.getByLabelText('回合正文场景规划任务指令');
    fireEvent.change(editor, { target: { value: '保留当前未保存内容' } });
    const invalid = JSON.stringify({ format: 'unknown-format', version: 1 });
    const file = new File([invalid], 'invalid.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: vi.fn().mockResolvedValue(invalid) });
    fireEvent.change(screen.getByLabelText('导入文生图模板文件'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('导入失败'));
    expect(editor).toHaveValue('保留当前未保存内容');
  });

  it('accepts only a validated ComfyUI API workflow and exposes it as the generation target', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const repos = repositories('comfy-workflow');
    render(<ImageGenerationSettingsPanel {...repos} />);

    fireEvent.change(screen.getByLabelText('新增图片档案后端'), { target: { value: 'comfyui-workflow' } });
    fireEvent.click(screen.getByRole('button', { name: '新增图片档案' }));
    expect(screen.getByText(/只接受“Export Workflow \(API\)”JSON/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('模板名称'), { target: { value: '最小安全工作流' } });
    fireEvent.change(screen.getByLabelText('正向提示词节点 ID'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('负向提示词节点 ID'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('参考图片节点 ID'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Checkpoint节点 ID'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Seed节点 ID'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('宽度节点 ID'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('高度节点 ID'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('步数节点 ID'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('CFG节点 ID'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('采样器节点 ID'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('调度器节点 ID'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('输出节点 ID（逗号分隔）'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('API 工作流 JSON'), {
      target: {
        value: JSON.stringify({
          '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
          '2': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
          '3': {
            class_type: 'KSampler',
            inputs: { seed: 1, steps: 20, cfg: 7, sampler_name: 'euler', scheduler: 'normal' }
          },
          '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'test.safetensors' } },
          '5': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512 } },
          '6': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' } },
          '9': { class_type: 'SaveImage', inputs: { images: ['8', 0] } }
        })
      }
    });
    fireEvent.click(screen.getByRole('button', { name: '校验并保存工作流' }));
    expect(await screen.findByText(/API 工作流已保存/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除工作流“最小安全工作流”' })).toBeInTheDocument();
    await expect(repos.profileRepository.listWorkflowTemplates()).resolves.toEqual([
      expect.objectContaining({
        bindings: {
          positivePrompt: { nodeId: '1', inputName: 'text' },
          negativePrompt: { nodeId: '2', inputName: 'text' },
          referenceImage: { nodeId: '6', inputName: 'image' },
          checkpoint: { nodeId: '4', inputName: 'ckpt_name' },
          seed: { nodeId: '3', inputName: 'seed' },
          width: { nodeId: '5', inputName: 'width' },
          height: { nodeId: '5', inputName: 'height' },
          steps: { nodeId: '3', inputName: 'steps' },
          cfg: { nodeId: '3', inputName: 'cfg' },
          sampler: { nodeId: '3', inputName: 'sampler_name' },
          scheduler: { nodeId: '3', inputName: 'scheduler' }
        }
      })
    ]);

    fireEvent.click(screen.getByRole('button', { name: '保存图片档案' }));
    expect(await screen.findByText(/图片档案已保存/)).toBeInTheDocument();
    expect((screen.getByLabelText('生成测试工作流') as HTMLSelectElement).value).not.toBe('');
    expect(within(screen.getByLabelText('生成测试工作流')).getByRole('option', { name: '最小安全工作流' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除工作流“最小安全工作流”' }));
    expect(await screen.findByText('API 工作流“最小安全工作流”已删除。')).toBeInTheDocument();
    await expect(repos.profileRepository.listWorkflowTemplates()).resolves.toEqual([]);
    expect(within(screen.getByLabelText('生成测试工作流')).queryByRole('option', { name: '最小安全工作流' })).not.toBeInTheDocument();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('已经生成的图片与历史任务记录不会删除'));
  });

  it('blocks deletion while a saved generation preset still references the workflow', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const repos = repositories('comfy-workflow-delete-guard');
    const generationPresetRepository = new IndexedDbImageGenerationPresetRepository(
      `comfy-workflow-delete-guard-presets-${crypto.randomUUID()}`
    );
    const profile = createDefaultImageApiProfile(
      'comfyui-workflow',
      'profile-comfy-delete',
      '2026-08-01T00:00:00.000Z'
    );
    profile.name = '正在使用工作流的档案';
    profile.enabled = true;
    await repos.profileRepository.putProfile(profile);
    const workflow = {
      workflowTemplateId: 'workflow-in-use',
      name: '正在使用的工作流',
      apiWorkflow: {
        '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
        '9': { class_type: 'SaveImage', inputs: { images: ['1', 0] } }
      },
      workflowHash: 'a'.repeat(64),
      bindings: { positivePrompt: { nodeId: '1', inputName: 'text' } },
      outputNodeIds: ['9'],
      revision: 1,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z'
    } satisfies ComfyWorkflowTemplate;
    await repos.profileRepository.putWorkflowTemplate(workflow);
    await generationPresetRepository.save(createImageGenerationPreset({
      name: '人物头像预设',
      profileId: profile.profileId,
      providerType: 'comfyui-workflow',
      variantKey: 'avatar-close-up',
      routingTarget: { kind: 'comfy-workflow', workflowTemplateId: workflow.workflowTemplateId },
      targetAspectRatio: '1:1',
      generationParameters: {
        providerType: 'comfyui-workflow',
        workflowTemplateId: workflow.workflowTemplateId,
        overrides: {}
      },
      now: '2026-08-01T00:00:00.000Z'
    }));

    render(
      <ImageGenerationSettingsPanel
        {...repos}
        generationPresetRepository={generationPresetRepository}
      />
    );

    confirm.mockClear();
    fireEvent.click(await screen.findByRole('button', { name: '删除工作流“正在使用的工作流”' }));
    expect(await screen.findByText(/仍被 正在使用工作流的档案／人物头像预设 使用/)).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    await expect(repos.profileRepository.listWorkflowTemplates()).resolves.toEqual([
      expect.objectContaining({ workflowTemplateId: 'workflow-in-use' })
    ]);
  });

  it('keeps unconfigured optional ComfyUI bindings under workflow control', async () => {
    const repos = repositories('comfy-minimal-bindings');
    render(<ImageGenerationSettingsPanel {...repos} />);

    fireEvent.change(screen.getByLabelText('新增图片档案后端'), { target: { value: 'comfyui-workflow' } });
    fireEvent.click(screen.getByRole('button', { name: '新增图片档案' }));
    fireEvent.change(screen.getByLabelText('模板名称'), { target: { value: '只替换提示词' } });
    fireEvent.change(screen.getByLabelText('正向提示词节点 ID'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('输出节点 ID（逗号分隔）'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('API 工作流 JSON'), {
      target: {
        value: JSON.stringify({
          '6': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
          '9': { class_type: 'SaveImage', inputs: { images: ['8', 0] } }
        })
      }
    });
    fireEvent.click(screen.getByRole('button', { name: '校验并保存工作流' }));

    expect(await screen.findByText(/API 工作流已保存/)).toBeInTheDocument();
    await expect(repos.profileRepository.listWorkflowTemplates()).resolves.toEqual([
      expect.objectContaining({
        bindings: { positivePrompt: { nodeId: '6', inputName: 'text' } }
      })
    ]);
  });

  it('creates, validates, saves, and restores a typed provider preset', async () => {
    const repos = repositories('generation-preset');
    const generationPresetRepository = new IndexedDbImageGenerationPresetRepository(`settings-generation-presets-${crypto.randomUUID()}`);
    const profile = createDefaultImageApiProfile('openai-images', '2026-07-23T07:00:00.000Z');
    if (profile.providerType !== 'openai-images') throw new Error('expected OpenAI profile');
    profile.name = '预设测试档案';
    profile.enabled = true;
    profile.models = [{ modelId: 'gpt-image-test', source: 'manual' }];
    profile.defaultModelId = 'gpt-image-test';
    await repos.profileRepository.putProfile(profile);

    render(<ImageGenerationSettingsPanel {...repos} generationPresetRepository={generationPresetRepository} />);
    fireEvent.click(screen.getByRole('tab', { name: '生成预设' }));
    expect(await screen.findByRole('group', { name: 'OpenAI Images 参数' })).toBeInTheDocument();
    expect(screen.getByText('内置默认')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('质量'), { target: { value: 'high' } });
    fireEvent.change(screen.getByLabelText('输出格式'), { target: { value: 'webp' } });
    fireEvent.change(screen.getByLabelText('压缩质量 0–100'), { target: { value: '81' } });
    fireEvent.click(screen.getByRole('button', { name: '保存生成预设' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('生成预设修订 1 已保存'));
    await expect(generationPresetRepository.get(profile.profileId, 'half-body-medium')).resolves.toMatchObject({
      routingTarget: { kind: 'model', modelId: 'gpt-image-test' },
      generationParameters: { providerType: 'openai-images', quality: 'high', outputFormat: 'webp', outputCompression: 81 }
    });

    fireEvent.click(screen.getByRole('button', { name: '恢复内置默认' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('恢复内置默认值'));
    await expect(generationPresetRepository.get(profile.profileId, 'half-body-medium')).resolves.toBeUndefined();
    expect(screen.getByLabelText('质量')).toHaveValue('medium');
  });

  it('shows which browser request failed and lists only safe origin-level network evidence', async () => {
    const repos = repositories('network-diagnostic');
    const profile = createDefaultImageApiProfile('openai-images', '2026-08-02T00:00:00.000Z');
    profile.name = '跨域诊断档案';
    profile.enabled = true;
    await repos.profileRepository.putProfile(profile);
    await repos.probeStore.saveOutcome({
      record: {
        verificationId: 'network-failure-1',
        scope: 'runtime-profile',
        profileId: profile.profileId,
        providerType: 'openai-images',
        verdict: 'real-failed',
        adapterRevision: 'p1-a',
        executionFingerprint: 'execution-safe',
        environment: 'pages-browser',
        startedAt: '2026-08-02T00:00:00.000Z',
        completedAt: '2026-08-02T00:00:01.000Z',
        completedStages: ['local-validation', 'authentication', 'submit'],
        safeSummary: '供应商返回结果后的临时图片下载未取得浏览器可读取的 HTTP 响应：Failed to fetch',
        blockerOrFailureCode: 'provider-network-failed',
        networkFailure: {
          requestRole: 'generated-image-download',
          method: 'GET',
          targetOrigin: 'https://cdn.example',
          pageOrigin: 'https://simc.pages.dev',
          crossOrigin: true,
          securePage: true,
          insecureTarget: false,
          localNetworkAccessExpected: false,
          corsPreflightExpected: false,
          responseReached: false,
          browserErrorName: 'TypeError',
          likelyCauses: ['cors-response', 'browser-network-dns-tls']
        }
      }
    });

    render(<ImageGenerationSettingsPanel {...repos} />);

    expect(await screen.findByText('下载供应商返回的临时图片')).toBeInTheDocument();
    expect(screen.getByText('GET https://cdn.example')).toBeInTheDocument();
    expect(screen.getByText(/否；浏览器在响应可读前拒绝或中断/)).toBeInTheDocument();
    expect(screen.getByText(/跨域响应未获浏览器许可/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('signature=');
  });
});
