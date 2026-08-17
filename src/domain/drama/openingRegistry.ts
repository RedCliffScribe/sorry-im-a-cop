export interface DramaticOpeningDefinition {
  id: string;
  groupId: string;
  title: string;
  summary: string;
  planningInstruction: string;
  requiredFunctions: string[];
  optionalFunctions: string[];
  forbiddenOutcomes: string[];
  sourceProviderIds: string[];
  hardRequirements?: {
    featureFlags?: string[];
    yearFrom?: number;
    yearTo?: number;
  };
  softAffinities?: {
    identityIds?: string[];
    roleTags?: string[];
    sectorIds?: string[];
  };
}

export interface DramaticOpeningGroup {
  id: string;
  title: string;
  summary: string;
}

export const dramaticOpeningGroups: DramaticOpeningGroup[] = [
  { id: 'everyday', title: '日常有味', summary: '从生活、工作、街坊与家人建立第一幕。' },
  { id: 'conflict', title: '现实冲突', summary: '让一个尚未解决的现实局面来到玩家眼前。' },
  { id: 'organization', title: '组织与关系', summary: '从组织内部、人际试探或舆论压力进入。' },
  { id: 'cinematic', title: '高戏剧入口', summary: '提高第一幕辨识度，但不预设结果或替玩家决定。' }
];

export const dramaticOpeningDefinitions: DramaticOpeningDefinition[] = [
  {
    id: 'mentor_lead',
    groupId: 'everyday',
    title: '师徒带路',
    summary: '由一名资深人物带玩家进入地区或工作环境，并留下可继续也可忽略的异常。',
    planningInstruction: '以一名并非全知的资深人物引路，展示现实做法、人情与制度，并形成一次可互动局面。',
    requiredFunctions: ['experienced_contact', 'interactive_situation'],
    optionalFunctions: ['local_custom', 'minor_anomaly'],
    forbiddenOutcomes: ['omniscient_mentor', 'forced_follow_up'],
    sourceProviderIds: ['runtime', 'storypack']
  },
  {
    id: 'first_shift',
    groupId: 'everyday',
    title: '工作第一天',
    summary: '从新岗位、新更次或新安排切入，建立工作关系与现实阻力。',
    planningInstruction: '从玩家当前岗位或营生切入，建立具体工作关系，并留出一次实际判断空间。',
    requiredFunctions: ['player_role_context', 'work_relation'],
    optionalFunctions: ['livelihood_matter', 'organization_pressure'],
    forbiddenOutcomes: ['career_simulation', 'automatic_success'],
    sourceProviderIds: ['runtime', 'livelihood']
  },
  {
    id: 'neighborhood_acquaintance',
    groupId: 'everyday',
    title: '街坊与熟人',
    summary: '由邻居、店主、同学、熟客、房东或摊贩建立城市生活网络。',
    planningInstruction: '从玩家合理可接触的街坊或熟人进入，先建立生活联系，不必立即形成重大案件。',
    requiredFunctions: ['local_contact', 'place_anchor'],
    optionalFunctions: ['relationship_thread', 'minor_matter'],
    forbiddenOutcomes: ['automatic_major_case'],
    sourceProviderIds: ['runtime', 'era']
  },
  {
    id: 'family_entanglement',
    groupId: 'everyday',
    title: '家庭牵连',
    summary: '让家人、同住者或家庭经济压力自然进入第一幕。',
    planningInstruction: '从家庭、学校、工作、债务、感情或职业风险切入，但不要自动升级为犯罪。',
    requiredFunctions: ['family_relation'],
    optionalFunctions: ['economic_pressure', 'work_pressure'],
    forbiddenOutcomes: ['automatic_crime', 'forced_obligation'],
    sourceProviderIds: ['runtime']
  },
  {
    id: 'on_duty_scene',
    groupId: 'conflict',
    title: '当值现场',
    summary: '开局已处于一个明确但尚未处理完毕的警务、工作或公共现场。',
    planningInstruction: '建立一个尺度与身份相符的在场局面，不要在开局自动解决，也不要默认升级为重大暴力。',
    requiredFunctions: ['active_scene', 'player_decision_boundary'],
    optionalFunctions: ['current_matter', 'organization_pressure'],
    forbiddenOutcomes: ['resolved_before_choice', 'automatic_armed_crime'],
    sourceProviderIds: ['runtime', 'storypack']
  },
  {
    id: 'personal_request',
    groupId: 'conflict',
    title: '人情委托',
    summary: '一名合理关系人物提出有条件的请求，玩家可以帮助、拒绝、拖延或谈条件。',
    planningInstruction: '让请求来自已建立或可合理建立的关系，明确条件与代价，不替玩家答应。',
    requiredFunctions: ['requesting_actor', 'player_choice'],
    optionalFunctions: ['relationship_thread', 'current_matter'],
    forbiddenOutcomes: ['automatic_acceptance'],
    sourceProviderIds: ['runtime']
  },
  {
    id: 'gray_temptation',
    groupId: 'conflict',
    title: '灰色诱惑',
    summary: '从金钱、便利、情报、机会、礼物或程序通融制造边界选择。',
    planningInstruction: '呈现诱惑和现实利益，但不要把玩家写成已经接受，也不要预设道德结论。',
    requiredFunctions: ['temptation_offer', 'player_choice'],
    optionalFunctions: ['finance_pressure', 'reputation_pressure'],
    forbiddenOutcomes: ['automatic_acceptance', 'prejudged_morality'],
    sourceProviderIds: ['runtime']
  },
  {
    id: 'witness_or_intrusion',
    groupId: 'conflict',
    title: '目击与误入',
    summary: '玩家偶然看见、听见或进入某个局面，并保留无视或离开的权利。',
    planningInstruction: '让玩家不是事件中心，只提供可感知事实与选择，不强迫其成为调查者。',
    requiredFunctions: ['observable_scene', 'exit_option'],
    optionalFunctions: ['signal', 'current_matter'],
    forbiddenOutcomes: ['forced_investigator', 'forced_intervention'],
    sourceProviderIds: ['runtime', 'storypack']
  },
  {
    id: 'organization_internal',
    groupId: 'organization',
    title: '组织内部',
    summary: '从警队、社团、雇主、媒体、医疗、学校或家庭内部压力切入。',
    planningInstruction: '展示组织当前方向、人物关系与内部压力，但不要把组织目标自动变成玩家任务。',
    requiredFunctions: ['player_role_context', 'organization_context'],
    optionalFunctions: ['organization_evolution', 'current_matter'],
    forbiddenOutcomes: ['automatic_mission'],
    sourceProviderIds: ['runtime']
  },
  {
    id: 'relationship_actor',
    groupId: 'organization',
    title: '关系人物',
    summary: '由一名可能长期相关的人物推动第一幕，但不预设其关系走向。',
    planningInstruction: '使用与身份和地点相容的同事、上线、邻居、家属、客户、记者或店主，不自动发展为恋爱。',
    requiredFunctions: ['relationship_actor'],
    optionalFunctions: ['relationship_thread', 'organization_relation'],
    forbiddenOutcomes: ['automatic_romance', 'forced_intimacy'],
    sourceProviderIds: ['runtime', 'screen-character']
  },
  {
    id: 'identity_probe',
    groupId: 'organization',
    title: '身份试探',
    summary: '有人试探玩家的可靠性、规矩、人情、能力或边界。',
    planningInstruction: '设置一次有现实动机的试探，结果必须由玩家行动与后续事实决定。',
    requiredFunctions: ['testing_actor', 'player_choice'],
    optionalFunctions: ['organization_relation', 'reputation_pressure'],
    forbiddenOutcomes: ['automatic_pass', 'automatic_failure'],
    sourceProviderIds: ['runtime']
  },
  {
    id: 'media_pressure',
    groupId: 'organization',
    title: '舆论与媒体',
    summary: '由新闻、采访、投诉、偷拍视频、公众议论或机构回应进入第一幕。',
    planningInstruction: '让媒体压力与当前事实和玩家位置有关，不让每条新闻自动生成采访或问询。',
    requiredFunctions: ['public_issue'],
    optionalFunctions: ['news_issue', 'organization_response'],
    forbiddenOutcomes: ['automatic_interview', 'universal_knowledge'],
    sourceProviderIds: ['runtime', 'storypack']
  },
  {
    id: 'era_storm',
    groupId: 'cinematic',
    title: '时代风暴',
    summary: '让移民、身份、股市、地产、工业转移、边境或九七焦虑落到玩家生活。',
    planningInstruction: '把时代压力转化为人物与现实处境，不写成历史知识讲解。',
    requiredFunctions: ['era_pressure', 'personal_consequence'],
    optionalFunctions: ['historical_event', 'news_issue'],
    forbiddenOutcomes: ['history_lecture'],
    sourceProviderIds: ['era', 'storypack', 'runtime']
  },
  {
    id: 'classic_hong_kong',
    groupId: 'cinematic',
    title: '经典港味',
    summary: '积极使用时代场所、行业、人情与港片式关系结构，不复演原作剧情。',
    planningInstruction: '提高香港时代辨识度；按世界开关使用 Storypack 与影视角色，但只把其作为人物和时代锚点。',
    requiredFunctions: ['hong_kong_period_texture'],
    optionalFunctions: ['storypack', 'screen_character'],
    forbiddenOutcomes: ['fixed_plot_reenactment'],
    sourceProviderIds: ['storypack', 'screen-character', 'era']
  },
  {
    id: 'two_line_cross',
    groupId: 'cinematic',
    title: '多线交叉',
    summary: '让两条存在现实联系的压力交叉，不同时启动三条以上无关主线。',
    planningInstruction: '只组合两条具有明确人物、地点或因果联系的压力，并为玩家保留清晰选择。',
    requiredFunctions: ['two_related_pressures'],
    optionalFunctions: ['relationship_thread', 'current_matter', 'news_issue'],
    forbiddenOutcomes: ['three_unrelated_mainlines'],
    sourceProviderIds: ['runtime', 'storypack']
  },
  {
    id: 'compatible_random_mix',
    groupId: 'cinematic',
    title: '随机混合',
    summary: '由开局 LLM 在合法候选中选择相容结构，本地不进行概率抽卡。',
    planningInstruction: '从提供的合法结构中选择最适合当前身份、地点和年份的一种或两种兼容结构。',
    requiredFunctions: ['llm_structure_choice'],
    optionalFunctions: ['runtime_source', 'static_source'],
    forbiddenOutcomes: ['local_random_draw', 'incompatible_structure_mix'],
    sourceProviderIds: ['runtime', 'storypack', 'screen-character', 'era']
  }
];

export function getDramaticOpeningDefinition(id: string | undefined) {
  return dramaticOpeningDefinitions.find((definition) => definition.id === id);
}

export function getDramaticOpeningSourceRef(id: string | undefined) {
  const definition = getDramaticOpeningDefinition(id);
  return definition
    ? {
        providerId: 'opening-registry',
        sourceType: 'dramatic_opening_definition',
        sourceId: definition.id
      }
    : undefined;
}

export function composeDramaticOpeningGuide(id: string | undefined): string {
  const definition = getDramaticOpeningDefinition(id);
  if (!definition) return '';
  return [
    `戏剧化开局结构：${definition.title}`,
    definition.summary,
    `编排要求：${definition.planningInstruction}`,
    `必须承担的功能：${definition.requiredFunctions.join('、') || '无'}`,
    `可选功能：${definition.optionalFunctions.join('、') || '无'}`,
    `禁止结果：${definition.forbiddenOutcomes.join('、') || '无'}`,
    '最多新建四名开局人物；人物、事件和结果仍须通过现有开局 Schema 与写回规则确认。',
    '该结构只约束第一幕的组织方式，不声明世界事实，不替玩家作出选择。'
  ].join('\n');
}
