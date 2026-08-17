import type { ImageBrowserBoundaryTargetKind, ImageBrowserEndpointDefinition } from './types';

const ENDPOINTS: Record<ImageBrowserBoundaryTargetKind, ImageBrowserEndpointDefinition[]> = {
  'comfyui-core': [
    { label: '系统信息', path: '/system_stats', required: true },
    { label: '节点定义', path: '/object_info', required: true },
    { label: '功能标记', path: '/features', required: false }
  ],
  'sd-webui': [
    { label: 'API 文档', path: '/docs', required: false },
    { label: '运行选项', path: '/sdapi/v1/options', required: true },
    { label: '采样器', path: '/sdapi/v1/samplers', required: true },
    { label: '模型列表', path: '/sdapi/v1/sd-models', required: true }
  ]
};

export function getImageBrowserBoundaryEndpoints(
  targetKind: ImageBrowserBoundaryTargetKind
): ImageBrowserEndpointDefinition[] {
  return ENDPOINTS[targetKind].map((endpoint) => ({ ...endpoint }));
}
