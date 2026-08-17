export const CHARACTER_VISUAL_PURPOSES = [
  'avatar-close-up',
  'half-body-medium',
  'knee-up-medium-full',
  'full-body'
] as const;

export type CharacterVisualPurpose = (typeof CHARACTER_VISUAL_PURPOSES)[number];
export const LEGACY_CHARACTER_VISUAL_PURPOSE = 'cowboy-medium-full' as const;

export function normalizeCharacterVisualPurpose(value: unknown): unknown {
  return value === LEGACY_CHARACTER_VISUAL_PURPOSE ? 'knee-up-medium-full' : value;
}

export const CHARACTER_VISUAL_PURPOSE_LABELS: Record<CharacterVisualPurpose, string> = {
  'avatar-close-up': '头像特写（CU）',
  'half-body-medium': '半身像（MS）',
  'knee-up-medium-full': '膝上立绘（MFS）',
  'full-body': '全身立绘（FS）'
};

export const DEFAULT_CHARACTER_VISUAL_PURPOSE: CharacterVisualPurpose = 'half-body-medium';

export const CHARACTER_VIEW_ANGLES = [
  'auto',
  'front',
  'three-quarter-left',
  'three-quarter-right',
  'profile-left',
  'profile-right',
  'rear'
] as const;

export type CharacterViewAngle = (typeof CHARACTER_VIEW_ANGLES)[number];

export const CHARACTER_VIEW_ANGLE_LABELS: Record<CharacterViewAngle, string> = {
  auto: '自动',
  front: '正面',
  'three-quarter-left': '左前方四分之三视角',
  'three-quarter-right': '右前方四分之三视角',
  'profile-left': '左侧面',
  'profile-right': '右侧面',
  rear: '背面'
};

export const CHARACTER_VIEW_ANGLE_PROMPTS: Record<CharacterViewAngle, string> = {
  auto: '',
  front: '正面视角，人物正对镜头',
  'three-quarter-left': '左前方四分之三视角，人物略微转向画面右侧',
  'three-quarter-right': '右前方四分之三视角，人物略微转向画面左侧',
  'profile-left': '左侧面视角，清晰呈现人物侧脸轮廓',
  'profile-right': '右侧面视角，清晰呈现人物侧脸轮廓',
  rear: '背面视角，以人物背部为主要可见面'
};

export const CHARACTER_CAMERA_ELEVATIONS = [
  'auto',
  'eye-level',
  'slight-high',
  'slight-low'
] as const;

export type CharacterCameraElevation = (typeof CHARACTER_CAMERA_ELEVATIONS)[number];

export const CHARACTER_CAMERA_ELEVATION_LABELS: Record<CharacterCameraElevation, string> = {
  auto: '自动',
  'eye-level': '平视',
  'slight-high': '轻微俯视',
  'slight-low': '轻微仰视'
};

export const CHARACTER_CAMERA_ELEVATION_PROMPTS: Record<CharacterCameraElevation, string> = {
  auto: '',
  'eye-level': '镜头与人物视线大致平齐',
  'slight-high': '镜头轻微高于人物视线，轻微俯视',
  'slight-low': '镜头轻微低于人物视线，轻微仰视'
};

export interface CharacterComposition {
  viewAngle: CharacterViewAngle;
  cameraElevation: CharacterCameraElevation;
}

export const DEFAULT_CHARACTER_COMPOSITION: CharacterComposition = {
  viewAngle: 'auto',
  cameraElevation: 'auto'
};

export interface ImagePromptModifier {
  positive: string;
  negative: string;
}

export interface ImagePromptModifierSet {
  global: ImagePromptModifier;
  characterCommon: ImagePromptModifier;
  characterViews: Record<CharacterVisualPurpose, ImagePromptModifier>;
  narrativeScene: ImagePromptModifier;
}

export const EMPTY_IMAGE_PROMPT_MODIFIERS: ImagePromptModifierSet = {
  global: { positive: '', negative: '' },
  characterCommon: { positive: '', negative: '' },
  characterViews: {
    'avatar-close-up': { positive: '', negative: '' },
    'half-body-medium': { positive: '', negative: '' },
    'knee-up-medium-full': { positive: '', negative: '' },
    'full-body': { positive: '', negative: '' }
  },
  narrativeScene: { positive: '', negative: '' }
};

export const DEFAULT_IMAGE_PROMPT_MODIFIERS: ImagePromptModifierSet = {
  global: {
    positive: '画面主体明确，视觉叙事清晰；保持人物、时代、地点和情境与输入资料一致。',
    negative: '避免无关文字、水印、界面元素、重复主体、明显肢体错误和与输入资料冲突的内容。'
  },
  characterCommon: {
    positive: '单人角色形象图；人物身份特征清晰、稳定，服装与可见装备完整且符合锚点。',
    negative: '避免多人拼接、同一人物重复出现、身份特征漂移、服装结构无故改变和无关背景抢占主体。'
  },
  characterViews: {
    'avatar-close-up': {
      positive: '头像特写构图，以头部和肩部为主，面部特征清晰，保留少量头顶与肩部空间。',
      negative: '避免裁掉头顶、面部过小、全身构图和大面积复杂背景。'
    },
    'half-body-medium': {
      positive: '半身构图，从腰部附近以上入画，脸部、上半身体态和主要服装特征清晰。',
      negative: '避免只剩面部特写、裁切关键上肢、主体过小和完整全身远景。'
    },
    'knee-up-medium-full': {
      positive: '膝上构图，从膝盖附近以上入画，兼顾脸部、姿态、手部动作与服装整体轮廓。',
      negative: '避免特定职业装扮联想、裁切头顶或双手、主体过小和脚部占据主要画面。'
    },
    'full-body': {
      positive: '完整全身构图，从头顶到脚部完整入画，人物站姿或动作轮廓清晰，四周保留安全边距。',
      negative: '避免裁掉头顶、手部或脚部，避免人物过小、身体比例明显失真和半身裁切。'
    }
  },
  narrativeScene: {
    positive: '叙事场景插图；地点、人物关系、动作、情绪和光线共同服务于当前正文情节。',
    negative: '避免与正文冲突的额外人物、错误服装、错误地点、无关道具、字幕、对话框和界面元素。'
  }
};

export interface SemanticImagePrompt {
  positive: string;
  negative: string;
  segments: SemanticImagePromptSegment[];
}

export const SEMANTIC_IMAGE_PROMPT_SEGMENT_KINDS = [
  'subject',
  'character-identity',
  'scene-appearance',
  'composition',
  'style',
  'artist-style',
  'quality',
  'persistent-requirement',
  'one-time-requirement'
] as const;

export type SemanticImagePromptSegmentKind = (typeof SEMANTIC_IMAGE_PROMPT_SEGMENT_KINDS)[number];

export interface SemanticImagePromptSegment {
  segmentId: string;
  kind: SemanticImagePromptSegmentKind;
  priority: number;
  positive: string;
  negative: string;
  required: boolean;
  renderPolicy?: 'transform' | 'preserve-literal';
  provenance?: {
    kind: 'png-style';
    presetId: string;
    imageHash: string;
    parserVersion: number;
  };
}

export interface PromptConversionRunOptions {
  signal?: AbortSignal;
}

export type PromptConversionTaskKind =
  | 'character-anchor'
  | 'character-anchor-from-images'
  | 'character-view-batch'
  | 'turn-scene-plan'
  | 'scene-shot-prompt'
  | 'provider-prompt-render';

export type PromptConversionInstructionSet = Record<PromptConversionTaskKind, string>;

export const PROMPT_CONVERSION_TASK_LABELS: Record<PromptConversionTaskKind, string> = {
  'character-anchor': '人物资料生成角色锚点',
  'character-anchor-from-images': '从已有图片提取角色锚点',
  'character-view-batch': '角色四景别提示词',
  'turn-scene-plan': '回合正文场景规划',
  'scene-shot-prompt': '单个场景镜头提示词',
  'provider-prompt-render': '模型提示词格式转换'
};

export class PromptConversionContractError extends Error {
  readonly code: string;
  readonly taskKind: PromptConversionTaskKind;
  readonly issues: string[];
  readonly attempts: number;

  constructor(
    code: string,
    taskKind: PromptConversionTaskKind,
    message: string,
    issues: string[] = [],
    attempts = 0
  ) {
    super(message);
    this.name = 'PromptConversionContractError';
    this.code = code;
    this.taskKind = taskKind;
    this.issues = issues;
    this.attempts = attempts;
  }
}
