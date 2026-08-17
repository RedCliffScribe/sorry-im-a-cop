export type OpeningExecutionStage =
  | 'preparing_opening'
  | 'generating_opening_blueprint'
  | 'validating_opening_blueprint'
  | 'generating_opening_cast'
  | 'validating_opening_cast'
  | 'repairing_opening_cast_fields'
  | 'generating_opening_profiles'
  | 'validating_opening_profiles'
  | 'repairing_opening_profile'
  | 'generating_opening_narrative'
  | 'repairing_opening_narrative_trace'
  | 'preparing_action_preview'
  | 'generating_opening_state'
  | 'repairing_opening_runtime_domain'
  | 'validating_opening_data'
  | 'repairing_opening_json'
  | 'repairing_opening_blueprint_fields'
  | 'regenerating_opening_narrative'
  | 'retrying_opening_phase'
  | 'applying_opening'
  | 'saving_opening';

export const openingExecutionStageLabels: Record<OpeningExecutionStage, string> = {
  preparing_opening: '正在准备开局',
  generating_opening_blueprint: '正在建立人物与剧情蓝图',
  validating_opening_blueprint: '正在校验开局人物设定',
  generating_opening_cast: '正在建立最小人物蓝图',
  validating_opening_cast: '正在校验人物槽位与身份',
  repairing_opening_cast_fields: '正在修复人物蓝图的局部字段',
  generating_opening_profiles: '正在补全人物档案',
  validating_opening_profiles: '正在逐人物校验档案',
  repairing_opening_profile: '正在修复当前人物档案',
  generating_opening_narrative: '正在生成正文',
  repairing_opening_narrative_trace: '正在修复戏剧执行回执',
  preparing_action_preview: '正在整理人物与行动选项',
  generating_opening_state: '正在生成开局运行状态',
  repairing_opening_runtime_domain: '正在修复当前运行态领域',
  validating_opening_data: '正在校验开局数据',
  repairing_opening_json: '结构化结果修复中',
  repairing_opening_blueprint_fields: '正在补齐开局人物资料',
  regenerating_opening_narrative: '正文篇幅不足，正在重新生成正文',
  retrying_opening_phase: '正在重新生成当前开局阶段',
  applying_opening: '正在提交开局状态',
  saving_opening: '正在保存'
};
