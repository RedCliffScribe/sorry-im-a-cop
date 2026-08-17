import type { ComfyWorkflowTemplate, ImageApiProfile } from './profile';
import type {
  ImageGenerationDefaults,
  ReferenceImageSnapshot,
  ReferenceImageTransportSnapshot,
  VisualAsset
} from './visualRepository';

export interface ReferenceImageCapability {
  supported: boolean;
  maxImages: number;
  label: string;
  reason: string;
  transport: ReferenceImageTransportSnapshot;
}

const unsupported = (reason: string): ReferenceImageCapability => ({
  supported: false,
  maxImages: 0,
  label: '当前组合不支持参考图',
  reason,
  transport: { kind: 'none' }
});

export function resolveReferenceImageCapability(input: {
  profile?: ImageApiProfile;
  workflow?: ComfyWorkflowTemplate;
  generationParameters?: ImageGenerationDefaults;
}): ReferenceImageCapability {
  const { profile, workflow, generationParameters } = input;
  if (!profile) return unsupported('请先明确选择图片档案。');
  switch (profile.providerType) {
    case 'openai-images':
      return profile.config.apiVariant === 'openai-official'
        ? {
          supported: true,
          maxImages: 16,
          label: 'OpenAI 图片编辑（最多 16 张）',
          reason: '参考图会以 multipart image[] 发送到官方 /images/edits。',
          transport: { kind: 'openai-image-edit', maxImages: 16 }
        }
        : unsupported('OpenAI 兼容档案的编辑协议并不统一；不会猜测兼容服务字段。');
    case 'xai-images':
      return {
        supported: true,
        maxImages: 1,
        label: 'Grok 图片编辑（1 张）',
        reason: '参考图会以 data URL 写入 xAI /images/edits 的 image.url。',
        transport: { kind: 'xai-image-edit', maxImages: 1 }
      };
    case 'gemini-image':
      return {
        supported: true,
        maxImages: 3,
        label: 'Gemini 多模态参考（最多 3 张）',
        reason: '采用对新旧 Gemini 图片模型都保守的 3 张上限。',
        transport: { kind: 'gemini-multimodal', maxImages: 3 }
      };
    case 'alibaba-model-studio':
      return profile.config.protocolVariant === 'multimodal-generation-sync'
        ? {
          supported: true,
          maxImages: 3,
          label: '阿里百炼多图编辑（最多 3 张）',
          reason: '参考图会作为 data URL 写入 multimodal messages.content。',
          transport: { kind: 'alibaba-multimodal', maxImages: 3 }
        }
        : unsupported('当前阿里档案不是已冻结的同步多模态协议；异步图像协议不自动猜测参考图字段。');
    case 'novelai-image': {
      const parameters = generationParameters?.providerType === 'novelai-image'
        ? generationParameters.imageToImage
        : undefined;
      return {
        supported: true,
        maxImages: 1,
        label: 'NovelAI Image2Image（1 张）',
        reason: '使用生成预设中的 Strength 与 Noise；未配置时采用保守默认值。',
        transport: {
          kind: 'novelai-img2img',
          maxImages: 1,
          strength: parameters?.strength ?? 0.65,
          noise: parameters?.noise ?? 0.1
        }
      };
    }
    case 'comfyui-workflow':
      return workflow?.bindings.referenceImage
        ? {
          supported: true,
          maxImages: 1,
          label: 'ComfyUI 工作流参考图（1 张）',
          reason: '先上传到 input，再把返回文件名写入工作流明确绑定的输入。',
          transport: { kind: 'comfy-upload-workflow', maxImages: 1 }
        }
        : unsupported('所选 ComfyUI 工作流没有配置“参考图片”输入绑定。');
    case 'sd-webui': {
      const parameters = generationParameters?.providerType === 'sd-webui'
        ? generationParameters.imageToImage
        : undefined;
      return {
        supported: true,
        maxImages: 1,
        label: 'SD WebUI img2img（1 张）',
        reason: '参考图会写入 init_images，并改走 /sdapi/v1/img2img。',
        transport: {
          kind: 'sd-webui-img2img',
          maxImages: 1,
          denoisingStrength: parameters?.denoisingStrength ?? 0.55
        }
      };
    }
  }
}

export function snapshotReferenceAssets(
  assets: readonly VisualAsset[],
  capability: ReferenceImageCapability
): ReferenceImageSnapshot[] {
  if (!assets.length) return [];
  if (!capability.supported || capability.transport.kind === 'none') {
    throw new Error(capability.reason);
  }
  if (assets.length > capability.maxImages) {
    throw new Error(`当前参考图协议最多允许 ${capability.maxImages} 张。`);
  }
  const ids = new Set<string>();
  return assets.map((asset) => {
    if (ids.has(asset.imageId)) throw new Error('参考图片不能重复。');
    ids.add(asset.imageId);
    if (asset.source === 'builtin') {
      throw new Error('游戏内置美术属于只读本体内容，不能作为文生图参考图发送。');
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType)) {
      throw new Error(`参考图 ${asset.imageId} 的格式不受当前传输层支持。`);
    }
    return {
      imageId: asset.imageId,
      mimeType: asset.mimeType as ReferenceImageSnapshot['mimeType'],
      width: asset.width,
      height: asset.height,
      byteLength: asset.byteLength,
      contentHash: asset.contentHash
    };
  });
}

export function assertReferenceTransportMatches(
  references: readonly ReferenceImageSnapshot[],
  transport: ReferenceImageTransportSnapshot
): void {
  if (!references.length) {
    if (transport.kind !== 'none') throw new Error('没有参考图时，冻结传输类型必须为 none。');
    return;
  }
  if (transport.kind === 'none') throw new Error('已选择参考图，但没有冻结可执行的参考图传输协议。');
  if (references.length > transport.maxImages) {
    throw new Error(`冻结参考图数量超过 ${transport.kind} 的上限。`);
  }
}
