import type {
  DramaChannelId,
  DramaChannelSettings,
  DramaMaterialBudget,
  DramaMaterialLevel,
  DramaPacingPreset,
  DramaticContentSettings
} from './types';

export const dramaChannelIds: DramaChannelId[] = [
  'work_livelihood',
  'relationships',
  'cases_law',
  'organizations',
  'city_news',
  'era_storypack',
  'screen_characters',
  'custom_characters',
  'custom_events'
];

export const defaultDramaChannels: DramaChannelSettings = {
  work_livelihood: 'medium',
  relationships: 'medium',
  cases_law: 'medium',
  organizations: 'medium',
  city_news: 'medium',
  era_storypack: 'medium',
  screen_characters: 'medium',
  custom_characters: 'medium',
  custom_events: 'medium'
};

export const defaultDramaticContentSettings: DramaticContentSettings = {
  pacing: 'original',
  materialLevel: 'standard',
  planningRoute: 'auto',
  channels: { ...defaultDramaChannels }
};

const pacingGuides: Record<DramaPacingPreset, string[]> = {
  original: [
    '默认保持旧版主回合流程；没有用户明确要求尽快呈现的自定义内容时，不执行新增前台规划。',
    '存在本局重点内容时，只允许为该明确意图执行窄规划，不开放普通静态种子或世界主动投喂。'
  ],
  life: [
    '保留较多安静空间，生活、工作、营生、家庭和关系优先。',
    '动态内容低频回流，重大升级必须有充分事实基础。',
    '允许连续多个普通生活回合。'
  ],
  balanced: [
    '日常与事件保持平衡，已有动态自然回流。',
    '新内容不要连续堆叠；优先延续当前最相关的矛盾，不按类别机械轮换。'
  ],
  dramatic: [
    '世界主动把有意义的选择带到玩家附近，玩家不必持续自己当导演。',
    '日常场景可以承担信息、关系、压力或伏笔功能。',
    '事件必须与玩家生活相交，玩家仍可无视、拒绝或变通。'
  ],
  cinematic: [
    '允许更高密度和更强辨识度，更积极让 Storypack、银幕角色、组织、新闻和关系进入前台。',
    '更高巧合容忍不等于每回合枪战、死人、内鬼或重大案件。',
    '重大事件之后必须保留余波、关系反应和缓冲。'
  ],
  custom: [
    '严格遵守当前自定义偏好；这些偏好只指导 LLM，不转换成本地触发概率。',
    '素材预算只决定可见候选数量，不代表每回合必须使用。'
  ]
};

export function describeDramaPacing(settings: DramaticContentSettings): string {
  const guide = pacingGuides[settings.pacing].join(' ');
  if (settings.pacing !== 'custom') return guide;
  const custom = settings.custom ?? {};
  return [
    guide,
    `世界主动度=${custom.worldInitiative ?? 'medium'}`,
    `已有动态回流=${custom.existingDynamicsReturn ?? 'medium'}`,
    `新种子曝光=${custom.newSeedExposure ?? 'medium'}`,
    `安静留白=${custom.quietSpace ?? 'medium'}`,
    `偶然交集容忍=${custom.coincidenceTolerance ?? 'normal'}`,
    `重大升级倾向=${custom.majorEscalation ?? 'medium'}`,
    `关系人物主动程度=${custom.relationshipInitiative ?? 'medium'}`
  ].join('；');
}

const materialBudgets: Record<DramaMaterialLevel, DramaMaterialBudget> = {
  minimal: { dynamicLimit: 4, staticLimit: 2, supportLimit: 1, quietWindowTurns: 4 },
  restrained: { dynamicLimit: 5, staticLimit: 2, supportLimit: 1, quietWindowTurns: 5 },
  standard: { dynamicLimit: 6, staticLimit: 3, supportLimit: 1, quietWindowTurns: 6 },
  rich: { dynamicLimit: 8, staticLimit: 4, supportLimit: 1, quietWindowTurns: 8 },
  extended: { dynamicLimit: 10, staticLimit: 5, supportLimit: 1, quietWindowTurns: 10 }
};

export function resolveDramaMaterialBudget(settings: DramaticContentSettings): DramaMaterialBudget {
  const base = materialBudgets[settings.materialLevel] ?? materialBudgets.standard;
  if (settings.pacing !== 'custom' || !settings.custom) return { ...base };
  return {
    dynamicLimit: Math.max(1, Math.trunc(settings.custom.dynamicLimit ?? base.dynamicLimit)),
    staticLimit: Math.max(0, Math.trunc(settings.custom.staticLimit ?? base.staticLimit)),
    supportLimit: Math.min(1, Math.max(0, Math.trunc(settings.custom.supportLimit ?? base.supportLimit))),
    quietWindowTurns: Math.max(1, Math.trunc(settings.custom.quietWindowTurns ?? base.quietWindowTurns))
  };
}

export function normalizeDramaticContentSettings(
  value: Partial<DramaticContentSettings> | undefined
): DramaticContentSettings {
  return {
    ...defaultDramaticContentSettings,
    ...value,
    channels: {
      ...defaultDramaChannels,
      ...value?.channels
    },
    custom: value?.custom
      ? {
          worldInitiative: 'medium',
          existingDynamicsReturn: 'medium',
          newSeedExposure: 'medium',
          quietSpace: 'medium',
          coincidenceTolerance: 'normal',
          majorEscalation: 'medium',
          relationshipInitiative: 'medium',
          ...value.custom
        }
      : undefined
  };
}
