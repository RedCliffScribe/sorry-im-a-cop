import type { ImagePromptModifier } from './types';

export type ImagePromptPresetOrigin = 'built-in' | 'custom';

export interface ImageStylePreset {
  stylePresetId: string;
  origin: ImagePromptPresetOrigin;
  name: string;
  description: string;
  hidden: boolean;
  order: number;
  modifiers: {
    global: ImagePromptModifier;
    character: ImagePromptModifier;
    narrativeScene: ImagePromptModifier;
  };
}

export interface ImageStyleSelection {
  globalStylePresetId: string;
  characterStylePresetId?: string;
  narrativeSceneStylePresetId?: string;
  characterStyleMode: ImageStyleCompositionMode;
  narrativeSceneStyleMode: ImageStyleCompositionMode;
}

export const IMAGE_STYLE_COMPOSITION_MODES = [
  'inherit-global',
  'replace-global'
] as const;

export type ImageStyleCompositionMode = (typeof IMAGE_STYLE_COMPOSITION_MODES)[number];

export const IMAGE_PROMPT_DIALECT_FAMILIES = [
  'general-english-natural',
  'openai-gpt-image',
  'gemini-image',
  'chinese-natural',
  'generic-english-tags',
  'sd-sdxl',
  'pony',
  'illustrious',
  'novelai',
  'flux'
] as const;

export type ImagePromptDialectFamily = (typeof IMAGE_PROMPT_DIALECT_FAMILIES)[number];

export interface ImagePromptDialectPreset {
  dialectPresetId: string;
  origin: ImagePromptPresetOrigin;
  name: string;
  description: string;
  family: ImagePromptDialectFamily;
  hidden: boolean;
  order: number;
  renderingInstruction: string;
  positivePrefix: string;
  positiveSuffix: string;
  negativePrefix: string;
  negativeSuffix: string;
}

const modifier = (positive: string, negative = ''): ImagePromptModifier => ({ positive, negative });

export const DEFAULT_IMAGE_STYLE_PRESET_ID = 'builtin-style-hong-kong-crime-realism';
export const NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_ID =
  'builtin-style-hong-kong-mature-crime-anime';
export const NOVELAI_CALIBRATED_IMAGE_STYLE_PRESET_IDS = {
  odaNonIzayoiSeishinLightRealism:
    'builtin-style-nai-oda-non-izayoi-seishin-light-realism'
} as const;
export const COMFYUI_CALIBRATED_IMAGE_STYLE_PRESET_IDS = {
  asianBlendCharacter: 'builtin-style-comfy-asianblend-character',
  duchaitenCharacter: 'builtin-style-comfy-duchaiten-character',
  duchaitenScene: 'builtin-style-comfy-duchaiten-scene',
  rinSoftSketch: 'builtin-style-comfy-rin-softsketch',
  waiMatureAnime: 'builtin-style-comfy-wai-mature-anime',
  hojoUrbanManga: 'builtin-style-comfy-hojo-urban-manga',
  odaNon: 'builtin-style-comfy-oda-non',
  izayoiSeishin: 'builtin-style-comfy-izayoi-seishin'
} as const;

export const LEGACY_DEFAULT_IMAGE_STYLE_PRESET_V1: ImageStylePreset = {
  stylePresetId: DEFAULT_IMAGE_STYLE_PRESET_ID,
  origin: 'built-in',
  name: '港产警匪写实插画',
  description: '默认风格。写实香港警匪叙事、克制的电影光影与明确的年代质感。',
  hidden: false,
  order: 0,
  modifiers: {
    global: modifier('港产警匪写实插画风格，克制的电影光影，真实材质，符合故事年代的香港城市质感。'),
    character: modifier('角色造型务实可信，服装和装备符合香港警匪题材与所属年代。'),
    narrativeScene: modifier('场景保持香港警匪片式的现实空间感、环境叙事和紧张但不过度夸张的氛围。')
  }
};

export const LEGACY_NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_V1: ImageStylePreset = {
  stylePresetId: NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_ID,
  origin: 'built-in',
  name: '1980 年代港产成熟犯罪动画',
  description: '给 NovelAI、Pony、Illustrious 等动漫原生模型的独立可选风格；不会由写实插画预设自动替换而来。',
  hidden: false,
  order: 4,
  modifiers: {
    global: modifier(
      '1980 年代香港成熟犯罪动画插画，成年人物比例与克制表演，硬派写实的角色设计，手绘动画关键帧般的绘制感；低饱和褪色色彩、细微旧胶片颗粒和可信的旧布料、皮革、金属磨损。保持动漫插画媒介，不要转成照片或三维渲染。',
      '避免幼态、萌系、Q 版、偶像式美化、光滑塑料皮肤、现代高亮数码上色、霓虹赛博朋克、照片、真人摄影、三维渲染、文字、水印、签名和标志。'
    ),
    character: modifier(
      '成熟犯罪动画角色设定图，面部年龄感、身份特征和服装结构清楚，姿态克制，轮廓适合人物面板展示。',
      '避免少年化、少女化、夸张英雄姿势、时尚写真摆拍、标题文字、边框、拼贴或宣传版式。'
    ),
    narrativeScene: modifier(
      '1980 年代犯罪动画剧情镜头，人物行动、空间关系和主要光源明确，背景服务当前叙事而不喧宾夺主。',
      '避免空泛棚拍背景、无关额外人物、现代物件、过度华丽灯光和宣传海报排版。'
    )
  }
};

export const BUILT_IN_IMAGE_STYLE_PRESETS: readonly ImageStylePreset[] = [
  {
    stylePresetId: DEFAULT_IMAGE_STYLE_PRESET_ID,
    origin: 'built-in',
    name: '1980 年代港产写实插画',
    description: '默认风格。半油画质感、经典手绘电影海报级的人物刻画、真实旧材质与克制的旧胶片气质。',
    hidden: false,
    order: 0,
    modifiers: {
      global: modifier(
        '将画面呈现为 1980 年代写实叙事插画，而不是照片或现代数字绘画。使用克制的半油画笔触和经典手绘电影海报般的完成度，保持自然的人体、面部与空间结构；采用电影化构图和光影，并加入轻微褪色、细颗粒与旧胶片气质。布料、皮革、金属和旧衣物应呈现可信的纹理、重量、磨损与使用痕迹。',
        '避免当代数码摄影感、塑料般光滑的皮肤或材质、过度锐化和磨皮、动漫赛璐璐、霓虹赛博朋克、廉价三维渲染感，以及无依据的现代服饰、道具或环境元素。'
      ),
      character: modifier(
        '借用经典手绘电影海报对核心人物的刻画层次：面部结构真实，神态克制，轮廓、体积与明暗层次清楚；服装结构和材质可读，旧衣物保留褪色、褶皱、磨损与生活痕迹。这里的“电影海报级”只表示人物刻画与手绘完成度，画面本身仍是没有文字和宣传排版的角色插画。',
        '避免时尚写真式摆拍、过度美化、蜡像皮肤、夸张英雄姿势、全新道具服质感，以及标题文字、边框、拼贴或宣传版式。'
      ),
      narrativeScene: modifier(
        '场景像 1980 年代剧情电影的正式手绘插画镜头：构图服务当前叙事，人物与环境层次明确，现场光线可信，轻微旧胶片色彩与细颗粒统一覆盖画面，同时保留地点真实的生活和使用痕迹。',
        '避免空泛棚拍背景、过度华丽的现代灯光、抢夺叙事重点的海报标题、文字、边框、拼贴或宣传排版。'
      )
    }
  },
  {
    stylePresetId: 'builtin-style-cinematic-still',
    origin: 'built-in',
    name: '写实电影剧照',
    description: '接近真人电影定格，强调摄影机、镜头光学和自然表演。',
    hidden: false,
    order: 1,
    modifiers: {
      global: modifier('写实电影剧照质感，自然肤质和材质，可信的镜头光学、景深与现场光线。'),
      character: modifier('人物像电影定妆照，表情和姿态自然克制。'),
      narrativeScene: modifier('场景像剧情片中的真实镜头，构图服务人物行动和叙事信息。')
    }
  },
  {
    stylePresetId: 'builtin-style-visual-novel-painterly',
    origin: 'built-in',
    name: '视觉小说厚涂',
    description: '适合未来 AVG 表现的厚涂角色与场景插画。',
    hidden: false,
    order: 2,
    modifiers: {
      global: modifier('高完成度视觉小说厚涂插画，轮廓明确，色彩层次丰富，光影统一。'),
      character: modifier('角色立绘式造型，五官清晰，服装结构可读，边缘和细节适合界面展示。'),
      narrativeScene: modifier('视觉小说事件插画式构图，人物情绪、动作和场景信息一目了然。')
    }
  },
  {
    stylePresetId: 'builtin-style-anime-cel',
    origin: 'built-in',
    name: '日系动画赛璐璐',
    description: '清晰线稿、分区上色和动画式明暗。',
    hidden: false,
    order: 3,
    modifiers: {
      global: modifier('日系动画赛璐璐插画，干净线稿，明确色块，统一的动画式明暗层次。'),
      character: modifier('角色设计清晰、轮廓易识别，面部与服装细节适合动画角色设定。'),
      narrativeScene: modifier('动画分镜式场景构图，动作方向明确，背景细节与人物保持统一。')
    }
  },
  {
    stylePresetId: NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_ID,
    origin: 'built-in',
    name: 'NAI 推荐·日漫写实',
    description: '面向 NovelAI V4/V4.5 的日漫写实推荐。故事年代仍由人物、服装与场景事实决定，不影响 GPT 等自然语言模型的默认风格。',
    hidden: false,
    order: 4,
    modifiers: {
      global: modifier(
        'NovelAI 日漫写实插画：以成熟日本动画定格或视觉小说事件图为媒介，使用干净线稿、柔和绘画式明暗、低饱和配色和电影化构图；人体、面部、空间和材质可信，但仍然明确属于动画插画。成年人物比例自然，表演克制，布料、皮革与金属有可读的褶皱、重量和磨损。画风年代可参考 2008 年前后的成熟日漫；故事发生年代必须服从人物、服装、道具与场景事实，不转成真人照片。',
        '避免真人摄影、照片级写实、三维渲染、幼态、萌系、Q 版、偶像式美化、少年脸、光滑塑料皮肤、现代高亮数码上色、霓虹赛博朋克、文字、水印、签名和标志。'
      ),
      character: modifier(
        '成熟日漫写实角色图，保持输入中的实际成年年龄、职业气质和身份特征；五官自然耐看，面部结构、服装层次与材质清楚，姿态自然克制，轮廓适合人物面板展示。',
        '避免少年化、少女化、美少年偶像脸、夸张英雄姿势、时尚写真摆拍、标题文字、边框、拼贴或宣传版式。'
      ),
      narrativeScene: modifier(
        '日漫写实犯罪剧情镜头，像成熟动画电影或视觉小说中的正式事件图：人物行动、空间关系与主要光源明确，环境具有真实生活痕迹，背景服务当前叙事；具体年代完全服从正文事实。',
        '避免空泛棚拍背景、无关额外人物、无依据的现代物件、过度华丽灯光和宣传海报排版。'
      )
    }
  },
  {
    stylePresetId: 'builtin-style-hong-kong-comic-ink',
    origin: 'built-in',
    name: '经典港漫彩墨',
    description: '港漫式有力线条、彩墨层次与戏剧化张力。',
    hidden: false,
    order: 5,
    modifiers: {
      global: modifier('经典港漫彩墨风格，有力墨线，浓淡彩墨层次，强烈但可读的戏剧光影。'),
      character: modifier('人物轮廓硬朗、神态鲜明，保留身份一致性与服装结构。'),
      narrativeScene: modifier('港漫分格式叙事张力，透视与动作富有冲击力，但不改变正文事实。')
    }
  },
  {
    stylePresetId: 'builtin-style-noir-graphic-novel',
    origin: 'built-in',
    name: '黑色电影／图像小说',
    description: '低饱和、高反差、阴影主导的犯罪图像小说风格。',
    hidden: false,
    order: 6,
    modifiers: {
      global: modifier('黑色电影与犯罪图像小说风格，低饱和色彩，高反差光影，深重阴影和压迫感。'),
      character: modifier('人物轮廓和面部特征在明暗对比中仍然清晰可辨。'),
      narrativeScene: modifier('利用阴影、空间纵深和环境细节强化犯罪叙事氛围。')
    }
  },
  {
    stylePresetId: COMFYUI_CALIBRATED_IMAGE_STYLE_PRESET_IDS.asianBlendCharacter,
    origin: 'built-in',
    name: 'AsianBlend 半写实方向（提示词）',
    description: '跨供应商的半写实人物提示词方向，不会加载 AsianBlend 模型，也不保证复现其画风；ComfyUI 可另选同名风格配方。',
    hidden: false,
    order: 7,
    modifiers: {
      global: modifier(
        '成熟的东亚半写实人物插画，面部结构自然耐看，皮肤保留细微质感，服装、皮革和首饰细节清晰；使用克制的电影光线和略带绘画感的真实色彩。',
        '避免幼态、偶像滤镜、蜡像皮肤、过强磨皮、现代时尚目录构图，以及无依据改变人物年龄、身份、服装或裸露程度。'
      ),
      character: modifier(
        '人物采用成熟半写实角色肖像表现，眼神和表情自然，身份特征清楚，服装结构与材质可读；适合作为后续参考图和角色身份底图。',
        '避免证件照式正中构图、夸张摆拍、过度光滑皮肤和无依据替换发型、服装或配饰。'
      ),
      narrativeScene: modifier(
        '场景保持半写实人物表现与可信空间关系，环境光应真实作用于人物、服装和地面材质。',
        '避免把环境简化成摄影棚背景，或把故事地点擅自转成日本街巷、现代商业街和无关城市。'
      )
    }
  },
  {
    stylePresetId: COMFYUI_CALIBRATED_IMAGE_STYLE_PRESET_IDS.duchaitenCharacter,
    origin: 'built-in',
    name: 'Duchaiten 半油画方向（提示词）',
    description: '跨供应商的半油画人物提示词方向，不会加载 Duchaiten 模型；画面与身份保持能力由实际模型和工作流决定。',
    hidden: false,
    order: 8,
    modifiers: {
      global: modifier(
        '成熟半写实叙事插画，融合哑光油画与水粉质感、清楚而克制的笔触、褪色胶片色彩和温暖的实景侧光；材质具有重量、磨损和手绘层次。',
        '避免现代商业摄影的高光皮肤、塑料材质、廉价三维渲染、海报文字和宣传排版。'
      ),
      character: modifier(
        '半身人物以自然成人比例、清楚面部体积和克制神态呈现，服装保持真实织物褶皱和旧皮革质感；构图具有电影人物插画的层次。',
        '避免擅自改变身份、年龄、服装和裸露程度；使用参考图时不要把风格化结果误称为同一张脸的可靠复刻。'
      ),
      narrativeScene: modifier(
        '人物与环境采用统一的手绘油画和水粉媒介，现场光、空气透视与旧胶片色彩连贯。',
        '避免孤立棚拍人物、空白背景、现代数码锐化和无依据新增人物。'
      )
    }
  },
  {
    stylePresetId: COMFYUI_CALIBRATED_IMAGE_STYLE_PRESET_IDS.duchaitenScene,
    origin: 'built-in',
    name: 'Duchaiten 雨夜方向（提示词）',
    description: '跨供应商的旧香港雨夜场景提示词方向，不会加载 Duchaiten 模型；精确人数仍需模型或工作流控制。',
    hidden: false,
    order: 9,
    modifiers: {
      global: modifier(
        '手绘犯罪剧情场景插画，哑光油画与水粉笔触、褪色模拟胶片色彩、潮湿空气和可信旧材质共同形成克制的电影氛围。',
        '避免照片、现代数字概念图、赛博朋克堆光、塑料材质、宣传文字和无关现代元素。'
      ),
      character: modifier(
        '人物作为剧情场景中的行动者融入环境，保持成人比例、身份特征、当前服装和克制表演。',
        '避免人物占满画面、摆拍、无依据换装或增加无关角色。'
      ),
      narrativeScene: modifier(
        '环境主导的宽幅剧情镜头，突出旧香港雨夜、仓库、码头、积水反光、旧金属、木箱和远景雾气等正文实际存在的元素；使用非对称构图、明确前中后景和可信透视。',
        '避免日本住宅街、现代摩天楼、空泛摄影棚、近距离人物肖像和无依据增加人群；只靠提示词不能保证精确人数。'
      )
    }
  },
  {
    stylePresetId: COMFYUI_CALIBRATED_IMAGE_STYLE_PRESET_IDS.rinSoftSketch,
    origin: 'built-in',
    name: 'Rin SoftSketch 柔绘方向（提示词）',
    description: '跨供应商的柔和手绘提示词方向，不会加载 Rin SoftSketch 模型，也不作为身份复刻保证。',
    hidden: false,
    order: 10,
    modifiers: {
      global: modifier(
        '柔和手绘插画，轻盈线条、细腻草图边缘、哑光绘画式明暗、低饱和色彩和微妙纸张纹理；整体温柔但仍保留成熟剧情气质。',
        '避免幼态萌系、过亮糖果色、塑料皮肤、三维渲染和无依据改变故事年代。'
      ),
      character: modifier(
        '成熟人物采用柔和而有表现力的线稿和绘画式上色，五官耐看、神态含蓄、服装褶皱自然，适合人物面板展示。',
        '避免无依据改变人物身份、服装和裸露程度；使用参考图时不要宣称风格化后必然保持同一张脸。'
      ),
      narrativeScene: modifier(
        '场景像柔和视觉小说事件图，人物、环境、光线和情绪具有统一的手绘笔触与色彩节奏。',
        '避免空白背景、环境与人物画风分离，以及无依据替换地点、时代或人物关系。'
      )
    }
  },
  {
    stylePresetId: COMFYUI_CALIBRATED_IMAGE_STYLE_PRESET_IDS.waiMatureAnime,
    origin: 'built-in',
    name: 'WAI 成熟日漫方向（提示词）',
    description: '跨供应商的成熟日漫提示词方向，不会加载 WAI checkpoint 或玩家 LoRA；实际画风由所用模型决定。',
    hidden: false,
    order: 11,
    modifiers: {
      global: modifier(
        '成熟日系动画插画，清楚线稿、克制赛璐璐与绘画式混合明暗、自然成人比例、低饱和电影配色和完整背景绘制。',
        '避免幼态、萌系、Q 版、偶像滤镜、现代高亮手游上色、照片和三维渲染。'
      ),
      character: modifier(
        '成年角色设计清楚，面部、发型、服装层次和身份气质可读；姿态自然，适合作为人物立绘或头像来源。',
        '避免校园少女模板、夸张胸腰比例、无依据改变年龄、服装或裸露程度。'
      ),
      narrativeScene: modifier(
        '成熟动画电影或视觉小说事件图式场景，人物行动、空间关系、地点信息和主要光源清楚。',
        '避免简单背景、无关角色、无依据现代物件和宣传海报排版。'
      )
    }
  },
  {
    stylePresetId: COMFYUI_CALIBRATED_IMAGE_STYLE_PRESET_IDS.hojoUrbanManga,
    origin: 'built-in',
    name: '北条司都市漫画方向（提示词）',
    description: '仅提供都市犯罪漫画的提示词近似，不会加载画风 LoRA，也不保证复现特定画师风格；ComfyUI 配方可管理玩家本地资产。',
    hidden: false,
    order: 12,
    modifiers: {
      global: modifier(
        '1980 年代成熟都市犯罪漫画插画，干净而有表现力的线稿、克制赛璐璐明暗、绘制完整的城市背景和复古印刷色彩；成人角色比例自然，兼具写实结构与漫画魅力。',
        '避免幼态、现代萌系、Q 版、照片、三维渲染、无依据的未来科技和现代高亮手游上色。'
      ),
      character: modifier(
        '都市犯罪漫画主角式人物表现，五官成熟利落，眼神和姿态自然自信，服装剪裁、褶皱和配饰清楚。',
        '避免学生制服模板、夸张英雄姿势、无依据改变身份、服装或裸露程度。'
      ),
      narrativeScene: modifier(
        '复古都市漫画剧情镜头，清楚呈现人物行动、街道或室内空间、实景光源和犯罪叙事张力。',
        '避免空白背景、无关人物和宣传文字版式。'
      )
    }
  },
  {
    stylePresetId: COMFYUI_CALIBRATED_IMAGE_STYLE_PRESET_IDS.odaNon,
    origin: 'built-in',
    name: '织田 non 成熟绘风方向（提示词）',
    description: '仅提供成熟剧情漫画的提示词近似，不会加载画风 LoRA，也不保证复现特定画师风格；ComfyUI 配方可管理玩家本地资产。',
    hidden: false,
    order: 13,
    modifiers: {
      global: modifier(
        '成熟日系剧情漫画插画，优雅流畅的轮廓线、富有表现力的成人面部、柔和绘画式明暗、温暖克制的肤色与具有重量的服装褶皱；构图强调人物情绪和电影感。',
        '避免幼态、Q 版、塑料皮肤、过度数码锐化、照片和三维渲染；不得仅因风格擅自改变服装或裸露程度。'
      ),
      character: modifier(
        '成熟人物肖像具有清楚眼神、唇形和面部体积，线条优雅，头发、衣料和配饰细节丰富；保持输入中的身份、年龄、当前装扮和剧情状态。',
        '避免少女模板、无依据换装、无依据增加裸露、夸张摆拍和空白证件照背景。'
      ),
      narrativeScene: modifier(
        '使用成熟剧情漫画式的人物表演和柔和电影光线，环境与人物保持统一线条、色彩和绘画层次。',
        '避免环境过空、人物脱离场景、无关角色和无依据改变地点年代。'
      )
    }
  },
  {
    stylePresetId: COMFYUI_CALIBRATED_IMAGE_STYLE_PRESET_IDS.izayoiSeishin,
    origin: 'built-in',
    name: '十六夜清心柔绘方向（提示词）',
    description: '仅提供柔和成熟插画的提示词近似，不会加载画风 LoRA，也不保证复现特定画师风格；ComfyUI 配方可管理玩家本地资产。',
    hidden: false,
    order: 14,
    modifiers: {
      global: modifier(
        '成熟日系柔绘插画，精致成人面部、细腻而有表现力的线稿、柔和通透的绘画式明暗、克制色彩和清楚衣料首饰细节；气质安静而具有剧情感。',
        '避免幼态、萌系、Q 版、塑料皮肤、过曝高光、照片和三维渲染；不得仅因风格擅自改变服装或裸露程度。'
      ),
      character: modifier(
        '成年人物以柔和精致的五官、自然目光和细腻线条表现，服装、头发与配饰具有清楚的层次；保持输入中的身份、年龄、当前装扮和情绪。',
        '避免少女模板、无依据换装、无依据增加裸露、夸张身体比例和空白证件照背景。'
      ),
      narrativeScene: modifier(
        '柔和成熟的剧情插画镜头，人物表演、环境空气、主要光源和色彩关系统一，背景仍须完整服务正文。',
        '避免空泛背景、人物与环境画风脱节、无关角色和无依据改变地点年代。'
      )
    }
  },
  {
    stylePresetId:
      NOVELAI_CALIBRATED_IMAGE_STYLE_PRESET_IDS.odaNonIzayoiSeishinLightRealism,
    origin: 'built-in',
    name: 'NAI·织田 non × 十六夜清心·轻写实',
    description:
      '一套面向 NovelAI V4/V4.5 的组合预设：融合成熟流畅线条、安静细腻柔绘与少量真实骨相和材质；只近似视觉方向，不保证复现特定画师风格。',
    hidden: false,
    order: 15,
    modifiers: {
      global: modifier(
        '成熟日系剧情插画，优雅流畅而细腻的轮廓线，富有表现力的成人面部，柔和通透的绘画式渐变明暗，克制温暖的肤色和电影感构图；略微加强柔和颧骨、自然比例双眼、鼻唇体积、真实人体比例、手部结构、衣料重量与环境材质，但保持精致手绘动漫插画媒介，不转成真人照片。',
        '避免幼态、萌系、Q 版、娃娃脸、过大双眼、夸张身体比例、塑料磨皮、油亮高光、过曝、僵硬平涂、过度数码锐化、僵硬手部、照片级写实、真人摄影和三维渲染；不得仅因风格擅自改变身份、年龄、服装或裸露程度。'
      ),
      character: modifier(
        '成年人物具有自然成熟的眼神、比例克制的双眼、唇形、鼻部和柔和颧骨体积，线条优雅细致，肤色使用柔和绘画渐变，头发、衣料、首饰与随身物件层次清楚；略微写实的骨相、手部与布料褶皱服务人物可信度，保持输入中的身份、年龄、当前装扮、情绪和剧情状态。',
        '避免少女或少年模板、过大双眼、磨皮娃娃脸、夸张胸腰比例、僵硬手指、空白证件照背景、无依据换装或增加裸露。'
      ),
      narrativeScene: modifier(
        '成熟柔绘剧情镜头，人物表演自然克制，环境空气、主要光源、空间层次和色彩关系统一；以细腻手绘线条与柔和明暗呈现完整背景，并用少量真实材质和可信透视增强香港叙事现场感。',
        '避免人物与环境画风脱节、空泛背景、无关角色、错误年代物件、过强照片感、宣传海报排版和无依据改变地点。'
      )
    }
  }
] as const;

export const DEFAULT_IMAGE_PROMPT_DIALECT_PRESET_ID = 'builtin-dialect-general-en';
export const OPENAI_GPT_IMAGE_PROMPT_DIALECT_PRESET_ID =
  'builtin-dialect-openai-gpt-image';
export const GEMINI_IMAGE_PROMPT_DIALECT_PRESET_ID =
  'builtin-dialect-gemini-image';

export const LEGACY_DEFAULT_IMAGE_PROMPT_DIALECT_V1: ImagePromptDialectPreset = {
  dialectPresetId: DEFAULT_IMAGE_PROMPT_DIALECT_PRESET_ID,
  origin: 'built-in',
  name: '通用英文自然语言',
  description: '适合支持完整自然语言描述的通用图片模型。',
  family: 'general-english-natural',
  hidden: false,
  order: 0,
  renderingInstruction: '将每个语义段转换成简洁、明确、自然的英文视觉描述。保留段落职责和所有事实，不添加故事内容。',
  positivePrefix: '',
  positiveSuffix: '',
  negativePrefix: '',
  negativeSuffix: ''
};

export const LEGACY_ILLUSTRIOUS_IMAGE_PROMPT_DIALECT_V1: ImagePromptDialectPreset = {
  dialectPresetId: 'builtin-dialect-illustrious',
  origin: 'built-in',
  name: 'Illustrious',
  description: '兼顾自然语言与可识别标签的 Illustrious 系格式。',
  family: 'illustrious',
  hidden: false,
  order: 5,
  renderingInstruction: '转换为 Illustrious 系模型易理解的英文描述：主体和关系使用清晰自然语言，稳定外观、构图和画风可使用简洁标签；不要添加未知角色或作品标签。',
  positivePrefix: '',
  positiveSuffix: '',
  negativePrefix: '',
  negativeSuffix: ''
};

export const LEGACY_NOVELAI_IMAGE_PROMPT_DIALECT_V1: ImagePromptDialectPreset = {
  dialectPresetId: 'builtin-dialect-novelai',
  origin: 'built-in',
  name: 'NovelAI',
  description: '按主体到环境的顺序组织 NovelAI 可识别标签。',
  family: 'novelai',
  hidden: false,
  order: 6,
  renderingInstruction: '转换为 NovelAI 易识别的英文标签，重要内容靠前，按人物数量、身份外观、服装状态、动作、构图、场景、光影和风格排序；不要添加未知作品或角色标签。',
  positivePrefix: '',
  positiveSuffix: '',
  negativePrefix: '',
  negativeSuffix: ''
};

function resolveDialectFromModelHint(modelHint?: string): string | undefined {
  const normalized = modelHint?.trim().toLocaleLowerCase('en-US') ?? '';
  if (!normalized) return undefined;
  if (
    normalized.includes('nai-diffusion')
    || normalized.includes('novelai')
    || /\bnai(?:[-_\s]|$)/u.test(normalized)
  ) {
    return 'builtin-dialect-novelai';
  }
  if (normalized.includes('illustrious')) return 'builtin-dialect-illustrious';
  if (normalized.includes('pony')) return 'builtin-dialect-pony';
  if (normalized.includes('flux')) return 'builtin-dialect-flux';
  if (
    normalized.includes('sdxl')
    || normalized.includes('stable-diffusion-xl')
    || normalized.includes('stable diffusion xl')
    || /\bsd[-_\s]?1[._-]?5\b/u.test(normalized)
    || /\bsd[-_\s]?3(?:[._-]?\d+)?\b/u.test(normalized)
  ) {
    return 'builtin-dialect-sd-sdxl';
  }
  return undefined;
}

export function resolveDefaultImagePromptDialectPresetId(
  providerType: string,
  modelHint?: string
): string {
  const modelDialect = resolveDialectFromModelHint(modelHint);
  if (modelDialect) return modelDialect;
  switch (providerType) {
    case 'openai-images':
      return OPENAI_GPT_IMAGE_PROMPT_DIALECT_PRESET_ID;
    case 'gemini-image':
      return GEMINI_IMAGE_PROMPT_DIALECT_PRESET_ID;
    case 'alibaba-model-studio':
      return 'builtin-dialect-general-zh';
    case 'novelai-image':
      return 'builtin-dialect-novelai';
    case 'sd-webui':
      return 'builtin-dialect-sd-sdxl';
    case 'comfyui-workflow':
      return 'builtin-dialect-generic-en-tags';
    default:
      return DEFAULT_IMAGE_PROMPT_DIALECT_PRESET_ID;
  }
}

export function resolveBuiltInImagePromptDialectFamily(
  dialectPresetId: string
): ImagePromptDialectFamily | undefined {
  return BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS.find(
    (preset) => preset.dialectPresetId === dialectPresetId
  )?.family;
}

export const BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS: readonly ImagePromptDialectPreset[] = [
  {
    dialectPresetId: DEFAULT_IMAGE_PROMPT_DIALECT_PRESET_ID,
    origin: 'built-in',
    name: '通用英文自然语言',
    description: '适合 Grok 及没有专用渲染方案的完整自然语言图片模型。',
    family: 'general-english-natural',
    hidden: false,
    order: 0,
    renderingInstruction: '面向通用自然语言图片模型，将每个语义段改写为简洁、连贯的英文视觉指令，使用完整短句而不是逗号标签。把主体、年代、媒介、材质、光线和胶片质感组织成模型可以直接绘制的内容；“电影海报级”只表示人物刻画与手绘完成度，除非原始要求明确提出，否则不得添加标题文字、边框、拼贴或宣传排版。保留段落职责和全部事实，不添加故事内容。',
    positivePrefix: '',
    positiveSuffix: '',
    negativePrefix: '',
    negativeSuffix: ''
  },
  {
    dialectPresetId: OPENAI_GPT_IMAGE_PROMPT_DIALECT_PRESET_ID,
    origin: 'built-in',
    name: 'OpenAI GPT Image 推荐',
    description: '面向 OpenAI Images 的自然语言创意简报；具体、分层、可维护，负向要求会以可见 Constraints 段合并传输。',
    family: 'openai-gpt-image',
    hidden: false,
    order: 1,
    renderingInstruction: [
      '目标模型是 OpenAI GPT Image。把每个冻结语义段改写为简洁、具体、可直接绘制的英文自然语言，使用完整短句；不要使用 Stable Diffusion 逗号标签堆、权重语法、LoRA 名称或跨模型质量标签。',
      '在每段职责不变且不得移动事实的前提下，按适用内容依次表达场景或背景、主体、关键外观与当前装扮、动作与人物关系、景别视角、光线情绪、媒介材质和硬约束。复杂内容使用短句，不要压成一个难以维护的长段落。',
      '人物必须具体说明输入中已有的成年年龄感、身体入画范围、视线、姿态、动作与物体交互。只有输入明确给出时才写镜头或焦段；不得用空泛的 professional、8k、masterpiece 或 cinematic 替代人物、材质、构图和光线事实。',
      'style 段是玩家选择的权威画风。默认“1980 年代港产写实插画”应表达为 realistic hand-painted narrative illustration、restrained oil-brush texture、hand-painted movie-poster-level character rendering、believable worn fabric/leather/metal 和 faded analog film character；它不是 photorealistic photograph，也不表示真的生成海报标题、边框或宣传排版。',
      '每段 negative 只返回该段真正需要排除的视觉矛盾或多余元素，不得塞回 positive，也不要自行添加 Avoid、Negative prompt 或 Constraints 标题；本地传输编译器会统一生成最终可见约束段。',
      '不要虚构图中文字。除非原始语义明确要求文字，否则保留无字幕、无水印、无标志、无边框和无海报排版的约束。'
    ].join('\n'),
    positivePrefix: 'Create one production-ready game narrative illustration from the following visual brief.',
    positiveSuffix: 'Treat every stated identity, era, clothing, action, composition, and visual-medium detail as binding. Do not add captions, speech balloons, logos, watermarks, borders, or poster typography unless explicitly requested.',
    negativePrefix: '',
    negativeSuffix: ''
  },
  {
    dialectPresetId: GEMINI_IMAGE_PROMPT_DIALECT_PRESET_ID,
    origin: 'built-in',
    name: 'Gemini 原生图片推荐',
    description: '面向 Gemini 原生图片模型；使用明确的一图指令，并围绕主体、环境、风格媒介与构图细节组织自然语言。',
    family: 'gemini-image',
    hidden: false,
    order: 2,
    renderingInstruction: [
      '目标模型是 Gemini 原生图片模型。把每个冻结语义段转换为清楚、描述性强、可直接生成的一组英文自然语言短句；不要输出解释、Markdown、JSON、Stable Diffusion 权重或逗号标签堆。',
      '每段只处理自己的事实。适用时按主体、环境与背景、动作和人物关系、关键外观与当前装扮、构图视角、光线色彩、艺术风格与媒介的顺序表达；具体细节优先于空泛的高质量形容词。',
      '人物场景必须保留输入给出的成年年龄感、身体入画范围、视线、姿态、人与物体的交互和空间关系。不得因为模型具备常识而补写正文没有的人物、职业、地点、服装、道具或事件。',
      'style 段是玩家选择的权威画风。默认“1980 年代港产写实插画”应明确写成 hand-painted realistic narrative illustration with restrained semi-oil texture、movie-poster-level character rendering without poster layout、believable worn cloth/leather/metal 和 faded analog-film color；不得改成真人照片、现代数码海报或三维渲染。',
      '每段 negative 只保留明确要避免的视觉元素或事实冲突，不得写进 positive，也不要添加 Avoid 或 Negative prompt 标题；Gemini 没有独立负向字段时，本地编译器会把它们变成最终可见的自然语言避免项。',
      '请求的目标始终是一张图片。除非输入明确要求图中文字，否则不要生成字幕、对话气泡、水印、标志、边框或海报文字。'
    ].join('\n'),
    positivePrefix: 'Generate a single image from this subject, context, and style brief.',
    positiveSuffix: 'Preserve the stated character identities, era, clothing, action, setting, composition, and artistic medium. Do not add captions, speech balloons, logos, watermarks, borders, or poster typography unless explicitly requested.',
    negativePrefix: '',
    negativeSuffix: ''
  },
  {
    dialectPresetId: 'builtin-dialect-general-zh',
    origin: 'built-in',
    name: '通用中文自然语言',
    description: '适合原生理解中文自然语言的图片模型。',
    family: 'chinese-natural',
    hidden: false,
    order: 3,
    renderingInstruction: '将每个语义段整理成简洁、明确的中文视觉描述。保留段落职责和所有事实，不添加故事内容。',
    positivePrefix: '',
    positiveSuffix: '',
    negativePrefix: '',
    negativeSuffix: ''
  },
  {
    dialectPresetId: 'builtin-dialect-generic-en-tags',
    origin: 'built-in',
    name: '通用英文视觉标签',
    description: '逗号分隔的英文视觉标签，不绑定某个模型家族。',
    family: 'generic-english-tags',
    hidden: false,
    order: 4,
    renderingInstruction: '把每个语义段转换为简洁的英文视觉标签，使用逗号分隔；保持人物、动作、场景和构图事实，不使用模型专属质量标签。',
    positivePrefix: '',
    positiveSuffix: '',
    negativePrefix: '',
    negativeSuffix: ''
  },
  {
    dialectPresetId: 'builtin-dialect-sd-sdxl',
    origin: 'built-in',
    name: 'Stable Diffusion／SDXL',
    description: '面向常见 SD 1.5、SDXL 与兼容微调模型的清晰英文提示词。',
    family: 'sd-sdxl',
    hidden: false,
    order: 5,
    renderingInstruction: '转换为 Stable Diffusion/SDXL 易理解的英文短语和标签，按主体、身份、动作、场景、构图、风格、质量排序；不要擅自添加 LoRA、权重或模型名。',
    positivePrefix: '',
    positiveSuffix: '',
    negativePrefix: '',
    negativeSuffix: ''
  },
  {
    dialectPresetId: 'builtin-dialect-pony',
    origin: 'built-in',
    name: 'Pony',
    description: '面向 Pony 系模型的英文标签顺序；质量前缀完全可见、可改。',
    family: 'pony',
    hidden: false,
    order: 6,
    renderingInstruction: '转换为 Pony 系模型常用的简洁英文标签，先人物数量和主体，再身份、外观、动作、场景与构图；不要创造输入中没有的角色属性。',
    positivePrefix: 'score_9, score_8_up, score_7_up',
    positiveSuffix: '',
    negativePrefix: 'score_4, score_3, score_2, score_1',
    negativeSuffix: ''
  },
  {
    dialectPresetId: 'builtin-dialect-illustrious',
    origin: 'built-in',
    name: 'Illustrious',
    description: '适合 Illustrious 系及明确标注 Illustrious 的 ComfyUI checkpoint。',
    family: 'illustrious',
    hidden: false,
    order: 7,
    renderingInstruction: '转换为 Illustrious 系易理解的英文提示词：主体、人物关系、动作和空间使用清晰简短的自然语言，稳定外观、服装、构图、媒介和质感可使用简洁标签。必须保留输入 style 段的传统绘画媒介、年代、笔触、材质和旧胶片要求；存在对应语义时，明确表达为 traditional media、realistic narrative illustration、restrained visible oil brushwork、hand-painted movie-poster rendering、faded analog film color 和 fine film grain，不要只剩空泛的 cinematic 或 high quality。当输入要求写实叙事插画、半油画或手绘电影海报级完成度时，不得弱化或改写成 photo、photorealistic 或 modern digital art。把每段最重要的视觉约束放在该段开头；不要添加未知作品、角色、画师、LoRA、权重或模型名。',
    positivePrefix: '',
    positiveSuffix: '',
    negativePrefix: '',
    negativeSuffix: ''
  },
  {
    dialectPresetId: 'builtin-dialect-novelai',
    origin: 'built-in',
    name: 'NovelAI',
    description: '面向 NovelAI V4/V4.5 动漫插画模型；只转换语法，不替玩家改变所选媒介或风格。',
    family: 'novelai',
    hidden: false,
    order: 8,
    renderingInstruction: [
      '目标模型是 NovelAI V4/V4.5 动漫插画模型。把每个语义段转换为简洁、稳定、逗号分隔的英文视觉标签，不使用面向 GPT Image 的完整自然语言段落。',
      '单人物图优先使用 NovelAI 官方主体标签 1boy、1girl 或 1other，并紧接 solo、adult male、adult female、30s 等真实年龄语义，再按固定身份与核心外观、当前服装状态、动作表情、景别构图、场景光影排列；不要使用 1man 或 1woman 代替官方主体计数标签，也不要因为 1boy/1girl 就把成年人画成少年或少女。',
      '多人场景中，基础段负责 1boy、2girls 等总人数标签、地点、风格和构图；每个 character-identity、scene-appearance 与对应 persistent-requirement 会被本地编译器合并成独立角色段。角色段只写 boy、girl 或 other，不带数字，最终使用 | 与基础段分隔，避免角色特征互相串色。',
      '多人存在明确互动关系时，只有原始语义已经说明施动、受动或相互动作，才可在对应独立角色段使用 source#、target# 或 mutual# 动作标签；不得凭常识发明互动，也不得用这套 V4 动作语法改写角色关系。',
      'style 段是玩家选择的权威媒介和画风约束。只把它翻译成 NovelAI 可识别的英文标签，不得把写实插画、油画、摄影、动漫、赛璐璐或其他媒介擅自替换成另一种媒介。模型是否擅长该风格不构成改写玩家选择的理由。',
      '当 style 明确选择“NAI 推荐·日漫写实”或具有同等语义时，把风格标签放在对应 style 段前部，优先使用 anime screencap, official art, year 2008, anime coloring, clean lineart, soft painterly shading, muted color 和 cinematic composition。仅在输入确实要求更强写实度时加入 realistic，并保证它修饰动漫插画而不是转成 photorealistic；可按原始语义使用 game cg、depth of field 或 soft focus，但不要混入画师名、版权角色或未知作品标签。',
      'NovelAI V4、V4.5 Full 与 Curated 的自动质量标签不同。不得在转换阶段无条件混用 masterpiece、best quality、amazing quality、very aesthetic、absurdres 等跨模型质量串；由生成预设的“添加质量标签”开关或玩家自定义前后缀负责。',
      '正向和负向内容必须保持分离：不得把 negative 内容改写成 Avoid、Negative prompt 或 Undesired content 段塞进 positive。不得为了适配默认 UC 而删改玩家明确选择的正向胶片颗粒、传统媒介或材质要求。',
      '人物锚点只负责身份与稳定外观；场景临时服装、伤势、湿污、伪装或裸露状态优先于默认服装。每张图保持一个清晰时刻、一个主构图和一个主要光源。',
      '成年人物必须保持输入年龄感和成年人比例；除非资料如此要求，不要擅自增加 elderly、old man、deep wrinkles、caricature、exaggerated facial features、bishounen 或 youthful face。人物图要求 solo 时不得增加背景人物、额外手臂或他人的手；只有输入确实要求手部可见时才强化手部构图。',
      '不得添加未知作品、角色、画师、版权 IP、LoRA、embedding 或模型名称；不得用 cowboy 作为膝上景别标签，使用 knee-up、medium full shot 等无职业歧义表达。若输入中的 cowboy 指职业或服装，必须表达为 western cowboy outfit，不得误译为 denim clothing。'
    ].join('\n'),
    positivePrefix: '',
    positiveSuffix: '',
    negativePrefix: 'lowres, bad anatomy, bad hands, extra digits, missing fingers, text, watermark, signature, logo, blurry',
    negativeSuffix: ''
  },
  {
    dialectPresetId: 'builtin-dialect-flux',
    origin: 'built-in',
    name: 'FLUX',
    description: '面向 FLUX 系模型的具体英文自然语言描述。',
    family: 'flux',
    hidden: false,
    order: 9,
    renderingInstruction: '转换为具体、连贯的英文自然语言视觉描述，明确主体、空间关系、动作、构图、光线和风格；避免堆叠空泛质量词。',
    positivePrefix: '',
    positiveSuffix: '',
    negativePrefix: '',
    negativeSuffix: ''
  }
] as const;

export const DEFAULT_IMAGE_STYLE_SELECTION: ImageStyleSelection = {
  globalStylePresetId: DEFAULT_IMAGE_STYLE_PRESET_ID,
  characterStyleMode: 'inherit-global',
  narrativeSceneStyleMode: 'inherit-global'
};

export function cloneBuiltInImageStylePresets(): ImageStylePreset[] {
  return [...structuredClone(BUILT_IN_IMAGE_STYLE_PRESETS)];
}

export function cloneBuiltInImagePromptDialectPresets(): ImagePromptDialectPreset[] {
  return [...structuredClone(BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS)];
}

export function createCustomImageStylePreset(
  name: string,
  stylePresetId = `custom-style:${crypto.randomUUID()}`
): ImageStylePreset {
  return {
    stylePresetId,
    origin: 'custom',
    name: name.trim() || '未命名自定义风格',
    description: '',
    hidden: false,
    order: Number.MAX_SAFE_INTEGER,
    modifiers: {
      global: modifier(''),
      character: modifier(''),
      narrativeScene: modifier('')
    }
  };
}

export function duplicateImageStylePreset(
  source: ImageStylePreset,
  stylePresetId = `custom-style:${crypto.randomUUID()}`
): ImageStylePreset {
  return {
    ...structuredClone(source),
    stylePresetId,
    origin: 'custom',
    name: `${source.name} 副本`,
    hidden: false,
    order: Number.MAX_SAFE_INTEGER
  };
}

export function createCustomImagePromptDialectPreset(
  name: string,
  dialectPresetId = `custom-dialect:${crypto.randomUUID()}`
): ImagePromptDialectPreset {
  return {
    dialectPresetId,
    origin: 'custom',
    name: name.trim() || '未命名自定义格式',
    description: '',
    family: 'general-english-natural',
    hidden: false,
    order: Number.MAX_SAFE_INTEGER,
    renderingInstruction: '把每个语义段转换为目标模型可理解的视觉提示词，保留事实和段落职责，不添加新内容。',
    positivePrefix: '',
    positiveSuffix: '',
    negativePrefix: '',
    negativeSuffix: ''
  };
}

export function duplicateImagePromptDialectPreset(
  source: ImagePromptDialectPreset,
  dialectPresetId = `custom-dialect:${crypto.randomUUID()}`
): ImagePromptDialectPreset {
  return {
    ...structuredClone(source),
    dialectPresetId,
    origin: 'custom',
    name: `${source.name} 副本`,
    hidden: false,
    order: Number.MAX_SAFE_INTEGER
  };
}

export function normalizePresetOrder<T extends { order: number }>(presets: readonly T[]): T[] {
  return [...presets]
    .sort((left, right) => left.order - right.order)
    .map((preset, order) => ({ ...preset, order }));
}

export function resolveSelectedImageStyleModifiers(
  presets: readonly ImageStylePreset[],
  selection: ImageStyleSelection,
  kind: 'character' | 'narrative-scene'
): ImagePromptModifier[] {
  const byId = new Map(presets.map((preset) => [preset.stylePresetId, preset]));
  const globalPreset = byId.get(selection.globalStylePresetId);
  if (!globalPreset) throw new Error(`找不到当前全局图片风格：${selection.globalStylePresetId}`);
  const specificId = kind === 'character'
    ? selection.characterStylePresetId
    : selection.narrativeSceneStylePresetId;
  const compositionMode = kind === 'character'
    ? selection.characterStyleMode
    : selection.narrativeSceneStyleMode;
  const specificPreset = specificId && specificId !== globalPreset.stylePresetId
    ? byId.get(specificId)
    : undefined;
  const selected = specificPreset && compositionMode === 'replace-global'
    ? [specificPreset]
    : [
      globalPreset,
      ...(specificPreset ? [specificPreset] : [])
    ];
  if (selected.some((preset) => !preset)) throw new Error(`找不到当前${kind === 'character' ? '人物' : '场景'}图片风格。`);
  return selected.flatMap((preset) => {
    const resolved = preset!;
    return [
      structuredClone(resolved.modifiers.global),
      structuredClone(kind === 'character'
        ? resolved.modifiers.character
        : resolved.modifiers.narrativeScene)
    ];
  });
}

export function restoreBuiltInImageStylePreset(
  presets: readonly ImageStylePreset[],
  stylePresetId: string
): ImageStylePreset[] {
  const builtIn = BUILT_IN_IMAGE_STYLE_PRESETS.find((preset) => preset.stylePresetId === stylePresetId);
  if (!builtIn) throw new Error('只能恢复内置图片风格。');
  return normalizePresetOrder(presets.map((preset) => preset.stylePresetId === stylePresetId
    ? structuredClone(builtIn)
    : structuredClone(preset)));
}

export function restoreBuiltInImagePromptDialectPreset(
  presets: readonly ImagePromptDialectPreset[],
  dialectPresetId: string
): ImagePromptDialectPreset[] {
  const builtIn = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS.find(
    (preset) => preset.dialectPresetId === dialectPresetId
  );
  if (!builtIn) throw new Error('只能恢复内置图片提示词格式。');
  return normalizePresetOrder(presets.map((preset) => preset.dialectPresetId === dialectPresetId
    ? structuredClone(builtIn)
    : structuredClone(preset)));
}
