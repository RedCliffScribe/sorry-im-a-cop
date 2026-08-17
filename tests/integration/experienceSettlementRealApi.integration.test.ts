import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { JudgementRecoveryTrace } from '../../src/domain/conflict/judgementRecoveryTrace';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import { parseRuntimeSaveRecord } from '../../src/domain/persistence/saveArchiveSchema';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import type {
  CaseFile,
  CurrentMatter,
  ExperienceAwardSourceKind,
  GameDifficultyLevel,
  RuntimeState
} from '../../src/domain/runtime/types';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import type { AiSettings } from '../../src/domain/settings/types';
import { runPlayerTurn } from '../../src/domain/turn/TurnEngine';

const shouldRun = process.env.COPV2_RUN_EXPERIENCE_REAL_API === '1';
const settingsPath =
  process.env.COPV2_REAL_API_SETTINGS_PATH ??
  'sorry-im-a-cop-v2-api-settings.json';
const outputPath = path.resolve(
  process.env.COPV2_EXPERIENCE_REAL_API_OUTPUT_PATH ??
    path.join('output', 'experience-real-api', 'latest.json')
);
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_EXPERIENCE_REQUEST_TIMEOUT_MS ?? 900_000)
);

interface RouteChoice {
  id: string;
  profileId: string;
  profileName: string;
  model: string;
}

type ExpectedResult =
  | { kind: 'judgement_success' }
  | { kind: 'judgement_failure' }
  | { kind: 'structured_progress'; sourceKind: ExperienceAwardSourceKind }
  | { kind: 'daily_zero' };

interface Scenario {
  id: string;
  routeId: string;
  title: string;
  playerInput: string;
  roll: number;
  gameDifficulty: GameDifficultyLevel;
  expected: ExpectedResult;
  prepare?: (state: RuntimeState) => void;
}

const routes: RouteChoice[] = [
  {
    id: 'mimo',
    profileId: 'api_xiaomi_mimo',
    profileName: 'xiaomi-mimo',
    model: 'mimo-v2.5'
  },
  {
    id: 'mimo-compatible',
    profileId: 'api_tianbohe',
    profileName: 'tianbohe',
    model: 'ocz-mimo-v2.5-free'
  },
  {
    id: 'grok',
    profileId: 'api_yuqing',
    profileName: 'yuqing',
    model: 'grok-4.3-fast'
  },
  {
    id: 'gemini',
    profileId: 'api_yuqing',
    profileName: 'yuqing',
    model: '企业cli-gemini-3-flash-preview'
  }
];

function createMatter(
  state: RuntimeState,
  id: string,
  title: string
): CurrentMatter {
  return {
    id,
    title,
    summary: `${title}已经具备完成条件。`,
    status: 'active',
    priority: 65,
    visibility: 'known',
    source: 'police',
    matterKind: 'police_work',
    currentHook: '完成最后的确定性归档步骤。',
    relatedActorIds: [state.player.actorId],
    relatedPlaceIds: [state.location.currentPlaceId],
    relatedCaseIds: [],
    relatedOrganizationIds: [],
    createdAt: state.time,
    updatedAt: state.time
  };
}

function attachRiskMatter(
  state: RuntimeState,
  id: string,
  title: string,
  summary: string
): void {
  const matter = createMatter(state, id, title);
  matter.summary = summary;
  matter.currentHook = summary;
  state.dynamicEvents.currentMatters[id] = matter;
}

function createCase(state: RuntimeState, caseId: string): CaseFile {
  return {
    caseId,
    title: '货仓失窃案',
    caseType: '盗窃',
    status: 'investigating',
    playerRole: 'lead',
    summary: '玩家负责整理已经取得的正式材料。',
    currentFocus: '登记已经取得的签收证明。',
    playerVisibleProgress: '调查材料已经齐备。',
    internalProgressSummary: '等待本回合确定性归档。',
    relatedActorIds: [],
    relatedPlaceIds: [state.location.currentPlaceId],
    relatedOrganizationIds: [],
    evidenceIds: [],
    activityLog: [],
    unreadActivityCount: 0,
    visibility: 'player_known',
    createdAt: state.time,
    updatedAt: state.time
  };
}

const scenarios: Scenario[] = [
  {
    id: 'success_observation',
    routeId: 'grok',
    title: '成功判定：辨认车牌',
    playerInput:
      '雨夜里可疑客货车即将驶离，我只有几秒辨认被泥水遮住的车牌与轮胎纹。看错会直接误导追查，请按真实不确定性进行一次观察判定。',
    roll: 12,
    gameDifficulty: 'standard',
    expected: { kind: 'judgement_success' },
    prepare: (state) => {
      attachRiskMatter(
        state,
        'matter_identify_departing_vehicle',
        '辨认正在驶离的可疑车辆',
        '可疑车辆正在雨中驶离，泥水遮挡车牌；辨认错误会把追查引向错误方向。'
      );
    }
  },
  {
    id: 'success_negotiation',
    routeId: 'grok',
    title: '成功判定：争取证人配合',
    playerInput:
      '关键证人担心得罪老板，拒绝签署已经核对的口供。我必须在不许诺好处的前提下说服他当场确认；失败会让材料延误，请进行一次交涉判定。',
    roll: 18,
    gameDifficulty: 'easy',
    expected: { kind: 'judgement_success' },
    prepare: (state) => {
      attachRiskMatter(
        state,
        'matter_secure_witness_statement',
        '争取关键证人确认口供',
        '证人因惧怕雇主而拒绝签署，交涉失败会导致证据提交延误。'
      );
    }
  },
  {
    id: 'critical_thinking',
    routeId: 'gemini',
    title: '大成功判定：矛盾时序',
    playerInput:
      '三份值班记录的时间互相冲突，我必须根据步行距离与停电时间判断唯一可成立的顺序；结论会决定下一步搜查方向，请进行一次思考判定。',
    roll: 2,
    gameDifficulty: 'standard',
    expected: { kind: 'judgement_success' },
    prepare: (state) => {
      attachRiskMatter(
        state,
        'matter_resolve_timeline_conflict',
        '判断冲突值班记录的唯一时序',
        '三份记录相互矛盾，分析错误会令下一步搜查方向失准。'
      );
    }
  },
  {
    id: 'failure_endurance',
    routeId: 'gemini',
    title: '失败判定：撑开防火门',
    playerInput:
      '受热变形的防火门仍压着伤者手臂，我尝试持续用肩背撑开门板；力量不足会令伤势加重，请按危险难度进行一次体魄判定。',
    roll: 94,
    gameDifficulty: 'brutal',
    expected: { kind: 'judgement_failure' },
    prepare: (state) => {
      attachRiskMatter(
        state,
        'matter_release_trapped_casualty',
        '撑开变形防火门救出伤者',
        '防火门受热变形并压住伤者，持续力量不足会加重伤势。'
      );
    }
  },
  {
    id: 'critical_failure_will',
    routeId: 'grok',
    title: '大失败判定：威吓下守住口供',
    playerInput:
      '嫌疑人准确说出我的家人住址，逼我删掉正式口供。我试图压住恐惧并继续复述记录；动摇会破坏证词，请进行一次意志判定。',
    roll: 99,
    gameDifficulty: 'hard',
    expected: { kind: 'judgement_failure' },
    prepare: (state) => {
      attachRiskMatter(
        state,
        'matter_resist_witness_intimidation',
        '在威吓下守住正式口供',
        '嫌疑人以玩家家人安全施压，动摇会破坏已经形成的证词。'
      );
    }
  },
  {
    id: 'progress_matter_one',
    routeId: 'gemini',
    title: '无判定进展：完成证物归还',
    playerInput:
      '证物接收人已经签名、编号也核对无误，我只把回执归档并将现有事项 matter_return_evidence 标记为 resolved。全部事实已确定，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'structured_progress', sourceKind: 'matter_resolved' },
    prepare: (state) => {
      state.dynamicEvents.currentMatters.matter_return_evidence = createMatter(
        state,
        'matter_return_evidence',
        '归还证物并归档'
      );
    }
  },
  {
    id: 'progress_matter_commitment',
    routeId: 'grok',
    title: '无判定进展：完成街坊互助登记',
    playerInput:
      '陈美玲已经签下双方事先谈妥的互助登记表，我核对签名后把现有事项 matter_neighbor_commitment 标记为 resolved；没有争议和失败可能，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: {
      kind: 'structured_progress',
      sourceKind: 'matter_resolved'
    },
    prepare: (state) => {
      state.dynamicEvents.currentMatters.matter_neighbor_commitment = createMatter(
        state,
        'matter_neighbor_commitment',
        '完成街坊互助登记'
      );
    }
  },
  {
    id: 'progress_evidence',
    routeId: 'grok',
    title: '无判定进展：登记已取得证据',
    playerInput:
      '仓库经理已经交来盖章的门禁记录，我核对编号后将它作为新证据 evidence_gate_log 写入既有案件 case_real_xp。材料真实且已经取得，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'structured_progress', sourceKind: 'case_progress' },
    prepare: (state) => {
      state.cases.case_real_xp = createCase(state, 'case_real_xp');
    }
  },
  {
    id: 'daily_tea',
    routeId: 'mimo',
    title: '日常零经验：喝茶休息',
    playerInput:
      '我在空闲的值班室喝完一杯温茶，洗净杯子后坐回原位。没有阻碍、没有调查进展、没有训练成果，也不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'daily_zero' }
  },
  {
    id: 'daily_walk',
    routeId: 'mimo',
    title: '日常零经验：例行走到档案室',
    playerInput:
      '走廊畅通无阻，我按熟悉路线从值班室走到档案室门口。没有风险、没有新发现、没有重要进展，也不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'daily_zero' }
  },
  {
    id: 'case_stage',
    routeId: 'grok',
    title: '案件进展：正式移交检控',
    playerInput:
      '检控部门已经发来正式接收编号，所有材料均已签收。我把既有案件 case_real_xp 的状态更新为 submitted_to_prosecutions；这是已经发生的确定事实，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'structured_progress', sourceKind: 'case_progress' },
    prepare: (state) => {
      state.cases.case_real_xp = createCase(state, 'case_real_xp');
    }
  },
  {
    id: 'matter_two',
    routeId: 'gemini',
    title: '事项进展：完成投诉簿交接',
    playerInput:
      '接班警员已经签收投诉簿并核对页码，我完成交接，把现有事项 matter_handover_log 标记为 resolved。手续全部完成，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'structured_progress', sourceKind: 'matter_resolved' },
    prepare: (state) => {
      state.dynamicEvents.currentMatters.matter_handover_log = createMatter(
        state,
        'matter_handover_log',
        '投诉簿交接'
      );
    }
  },
  {
    id: 'success_chase',
    routeId: 'grok',
    title: '成功判定：巷道追逐',
    playerInput:
      '抢包疑犯正翻过湿滑矮墙逃进后巷，我必须在岔路前追上并截住他；失足会失去目标，请进行一次追逐判定。',
    roll: 14,
    gameDifficulty: 'standard',
    expected: { kind: 'judgement_success' },
    prepare: (state) => {
      attachRiskMatter(
        state,
        'matter_intercept_bag_snatcher',
        '在后巷截住抢包疑犯',
        '疑犯正利用湿滑后巷逃跑，追逐失败会失去目标。'
      );
    }
  },
  {
    id: 'failure_firearm',
    routeId: 'grok',
    title: '失败判定：低光射击',
    playerInput:
      '持刀疑犯躲在昏暗货架后并向人质靠近，我尝试在视野受阻时击中他手边的金属障碍迫使其停步；误判会危及人质，请进行一次枪械判定。',
    roll: 97,
    gameDifficulty: 'brutal',
    expected: { kind: 'judgement_failure' },
    prepare: (state) => {
      attachRiskMatter(
        state,
        'matter_stop_armed_suspect',
        '阻止持刀疑犯接近人质',
        '货仓照明不足且人质近在疑犯身旁，错误射击会造成严重后果。'
      );
    }
  },
  {
    id: 'progress_evidence_receipt',
    routeId: 'grok',
    title: '案件进展：登记银行回执',
    playerInput:
      '银行已经交来盖章转账回执，我核对编号后将新证据 evidence_bank_receipt 写入既有案件 case_bank_receipt。材料已经取得，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'structured_progress', sourceKind: 'case_progress' },
    prepare: (state) => {
      state.cases.case_bank_receipt = createCase(state, 'case_bank_receipt');
    }
  },
  {
    id: 'matter_radio_handover',
    routeId: 'grok',
    title: '事项进展：完成电台交接',
    playerInput:
      '接班警员已经核对电台编号并签收，我完成最后登记，把现有事项 matter_radio_handover 标记为 resolved；没有不确定性，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'structured_progress', sourceKind: 'matter_resolved' },
    prepare: (state) => {
      state.dynamicEvents.currentMatters.matter_radio_handover = createMatter(
        state,
        'matter_radio_handover',
        '完成电台交接'
      );
    }
  },
  {
    id: 'success_melee',
    routeId: 'gemini',
    title: '成功判定：控制持棍者',
    playerInput:
      '醉汉突然挥棍砸向旁人，我必须贴近控制其手腕并夺下木棍；动作失败会让旁人受伤，请进行一次近身格斗判定。',
    roll: 11,
    gameDifficulty: 'hard',
    expected: { kind: 'judgement_success' },
    prepare: (state) => {
      attachRiskMatter(
        state,
        'matter_disarm_drunken_assailant',
        '控制挥棍伤人的醉汉',
        '醉汉正在挥棍攻击旁人，控制动作失败会造成即时伤害。'
      );
    }
  },
  {
    id: 'failure_observation',
    routeId: 'gemini',
    title: '失败判定：浓雾辨认目标',
    playerInput:
      '码头雾气遮住远处人影，我尝试在几秒内判断谁正把证物箱搬上货车；认错会惊动无关工人并放走真正目标，请进行一次观察判定。',
    roll: 93,
    gameDifficulty: 'hard',
    expected: { kind: 'judgement_failure' },
    prepare: (state) => {
      attachRiskMatter(
        state,
        'matter_identify_dock_suspect',
        '在浓雾中辨认搬运证物者',
        '码头能见度极低，辨认错误会惊动无关人员并失去真正目标。'
      );
    }
  },
  {
    id: 'success_will',
    routeId: 'gemini',
    title: '成功判定：爆炸后保持指挥',
    playerInput:
      '近距离爆炸震得我耳鸣，现场群众开始推挤。我必须压住慌乱并连续发出清晰疏散指令；失控会引发踩踏，请进行一次意志判定。',
    roll: 5,
    gameDifficulty: 'hard',
    expected: { kind: 'judgement_success' },
    prepare: (state) => {
      attachRiskMatter(
        state,
        'matter_direct_post_blast_evacuation',
        '爆炸后维持疏散秩序',
        '爆炸造成耳鸣与群众推挤，指挥失控可能引发踩踏。'
      );
    }
  },
  {
    id: 'matter_photo_archive',
    routeId: 'gemini',
    title: '事项进展：完成现场照片归档',
    playerInput:
      '鉴证员已经交来带编号的现场照片，我核对封套后完成归档，把现有事项 matter_photo_archive 标记为 resolved。手续已经完成，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'structured_progress', sourceKind: 'matter_resolved' },
    prepare: (state) => {
      state.dynamicEvents.currentMatters.matter_photo_archive = createMatter(
        state,
        'matter_photo_archive',
        '完成现场照片归档'
      );
    }
  },
  {
    id: 'case_stage_charged',
    routeId: 'gemini',
    title: '案件进展：正式落案起诉',
    playerInput:
      '法院登记处已经发回正式落案编号。我将既有案件 case_formal_charge 的状态更新为 charged；手续已完成，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'structured_progress', sourceKind: 'case_progress' },
    prepare: (state) => {
      state.cases.case_formal_charge = createCase(state, 'case_formal_charge');
    }
  },
  {
    id: 'matter_key_return',
    routeId: 'gemini',
    title: '事项进展：完成钥匙归还',
    playerInput:
      '管理员已经清点并签收全部值班钥匙，我登记归还时间，把现有事项 matter_key_return 标记为 resolved；没有风险，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'structured_progress', sourceKind: 'matter_resolved' },
    prepare: (state) => {
      state.dynamicEvents.currentMatters.matter_key_return = createMatter(
        state,
        'matter_key_return',
        '完成值班钥匙归还'
      );
    }
  },
  {
    id: 'daily_breakfast',
    routeId: 'mimo',
    title: '日常零经验：吃早餐',
    playerInput:
      '我在没有任务的休息时间吃完一份普通早餐，把餐具放回托盘。没有训练、调查、风险或重要进展，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'daily_zero' }
  },
  {
    id: 'daily_wash_hands',
    routeId: 'mimo',
    title: '日常零经验：洗手整理',
    playerInput:
      '我到洗手间洗净双手，整理衣袖后返回原位。没有新发现、工作成果、关系进展或判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'daily_zero' }
  },
  {
    id: 'daily_read_notice',
    routeId: 'mimo',
    title: '日常零经验：阅读旧通告',
    playerInput:
      '我把墙上早已读过的普通值班通告再看一遍，没有新增内容，也没有形成训练或调查成果，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'daily_zero' }
  },
  {
    id: 'daily_check_clock',
    routeId: 'mimo',
    title: '日常零经验：查看时钟',
    playerInput:
      '我抬头看了一眼墙上的时钟，然后继续坐在原位。没有阻碍、新发现、工作进展或重要社交，也不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'daily_zero' }
  },
  {
    id: 'matter_uniform_receipt',
    routeId: 'mimo-compatible',
    title: '事项进展：完成制服签收',
    playerInput:
      '仓务员已经核对制服尺码并签收旧制服，我保存回执，把现有事项 matter_uniform_receipt 标记为 resolved；事实已确定，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'structured_progress', sourceKind: 'matter_resolved' },
    prepare: (state) => {
      state.dynamicEvents.currentMatters.matter_uniform_receipt = createMatter(
        state,
        'matter_uniform_receipt',
        '完成制服签收'
      );
    }
  },
  {
    id: 'matter_mail_log',
    routeId: 'mimo-compatible',
    title: '事项进展：完成邮件登记',
    playerInput:
      '收件人已经签收全部公函，我核对回条后把现有事项 matter_mail_log 标记为 resolved。没有争议与失败可能，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'structured_progress', sourceKind: 'matter_resolved' },
    prepare: (state) => {
      state.dynamicEvents.currentMatters.matter_mail_log = createMatter(
        state,
        'matter_mail_log',
        '完成公函登记'
      );
    }
  },
  {
    id: 'matter_manifest_archive',
    routeId: 'mimo-compatible',
    title: '事项进展：完成货运清单归档',
    playerInput:
      '船公司已经交来盖章货运清单，我核对页码后完成归档，把现有事项 matter_manifest_archive 标记为 resolved。手续已经完成，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'structured_progress', sourceKind: 'matter_resolved' },
    prepare: (state) => {
      state.dynamicEvents.currentMatters.matter_manifest_archive = createMatter(
        state,
        'matter_manifest_archive',
        '完成货运清单归档'
      );
    }
  },
  {
    id: 'matter_medical_form',
    routeId: 'mimo-compatible',
    title: '事项进展：完成医疗表归档',
    playerInput:
      '医务室已经盖章确认表格内容，我把回执归档，并将现有事项 matter_medical_form 标记为 resolved。全部手续已完成，不需要判定。',
    roll: 50,
    gameDifficulty: 'standard',
    expected: { kind: 'structured_progress', sourceKind: 'matter_resolved' },
    prepare: (state) => {
      state.dynamicEvents.currentMatters.matter_medical_form = createMatter(
        state,
        'matter_medical_form',
        '完成医疗表归档'
      );
    }
  }
];

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key|tp|pst)-[A-Za-z0-9_-]{10,}\b/g, '[REDACTED]')
    .slice(0, 800);
}

function isExternalFailure(message: string): boolean {
  return /(?:HTTP\s*(?:429|5\d\d)|timeout|超时|network|fetch failed|ECONN|socket)/i.test(
    message
  );
}

function isRecoverableGenerationFailure(message: string): boolean {
  return /(?:不是有效 JSON|格式无效|Schema|schema|缺少必要信息|连续无效)/i.test(
    message
  );
}

async function writeSanitizedResults(
  results: Array<Record<string, unknown>>,
  completed: boolean
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        acceptedTurnCount: results.filter((result) => result.accepted).length,
        routes: routes.map(({ profileName, model }) => ({ profileName, model })),
        results
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

async function loadPreviousResults(): Promise<Array<Record<string, unknown>>> {
  try {
    const parsed = JSON.parse(await readFile(outputPath, 'utf8')) as {
      results?: unknown;
    };
    return Array.isArray(parsed.results)
      ? parsed.results.filter(
          (result): result is Record<string, unknown> =>
            Boolean(result) && typeof result === 'object' && !Array.isArray(result)
        )
      : [];
  } catch {
    return [];
  }
}

function createScenarioState(scenario: Scenario): RuntimeState {
  const state = createInitialRuntimeState({
    playerName: '周启明',
    englishName: 'Chow Kai-ming',
    age: 29,
    currentIdentity: 'police',
    policePostingId: 'mk_uniform_patrol',
    gameDifficulty: scenario.gameDifficulty,
    screenCharacterSeedsEnabled: false,
    openingPressure: 'routine'
  });
  scenario.prepare?.(state);
  return state;
}

function createRouteSettings(settings: AiSettings, route: RouteChoice): AiSettings {
  return {
    ...settings,
    mainNarrator: {
      apiProfileId: route.profileId,
      model: route.model,
      maxTokensMode: 'custom',
      maxTokens: 12_288,
      temperature: 0.2
    }
  };
}

function requireRoute(settings: AiSettings, route: RouteChoice): void {
  const profile = settings.apiProfiles.find((candidate) => candidate.id === route.profileId);
  if (!profile || !profile.models.includes(route.model)) {
    throw new Error(`缺少真实验收线路：${route.profileName}/${route.model}`);
  }
}

function assertScenarioResult(
  scenario: Scenario,
  before: RuntimeState,
  after: RuntimeState
): void {
  const newChecks = Object.values(after.judgementChecks).filter(
    (check) => !before.judgementChecks[check.checkId]
  );
  const narratorEntry = [...after.storyLog]
    .reverse()
    .find((entry) => entry.speaker === 'narrator');
  const award = narratorEntry?.experienceAward;

  if (scenario.expected.kind === 'judgement_success') {
    expect(newChecks).toHaveLength(1);
    expect(['success', 'critical_success']).toContain(
      newChecks[0]?.outcome
    );
    expect(award?.sources.some((source) => source.kind === 'judgement')).toBe(true);
    expect(award?.total).toBeGreaterThan(0);
  } else if (scenario.expected.kind === 'judgement_failure') {
    expect(newChecks).toHaveLength(1);
    expect(['failure', 'critical_failure']).toContain(newChecks[0]?.outcome);
    expect(award?.sources.some((source) => source.kind === 'judgement')).toBe(true);
    expect(award?.total).toBeGreaterThan(0);
  } else if (scenario.expected.kind === 'structured_progress') {
    expect(newChecks).toHaveLength(0);
    expect(
      award?.sources.some((source) => source.kind === scenario.expected.sourceKind)
    ).toBe(true);
    expect(award?.total).toBeGreaterThan(0);
  } else {
    expect(newChecks).toHaveLength(0);
    expect(award).toBeUndefined();
  }

  expect(after.turnCounter).toBe(before.turnCounter + 1);
  const now = new Date().toISOString();
  const loaded = parseRuntimeSaveRecord(
    JSON.parse(
      JSON.stringify({
        saveId: `save_xp_${scenario.id}`,
        saveName: scenario.title,
        saveKind: 'manual',
        createdAt: now,
        updatedAt: now,
        playerName: after.player.name,
        worldpackId: after.world.worldpackId,
        gameDateLabel: `${after.time.year}-${after.time.month}-${after.time.day}`,
        turnCounter: after.turnCounter,
        runtimeState: after
      })
    )
  ).runtimeState;
  expect(loaded.player.progression).toEqual(after.player.progression);
  expect(
    loaded.storyLog.find(
      (entry) =>
        entry.turnId === narratorEntry?.turnId && entry.speaker === 'narrator'
    )?.experienceAward
  ).toEqual(award);
}

describe.skipIf(!shouldRun)('experience settlement through real APIs', () => {
  it(
    'completes thirty accepted turns across judgement, progress and zero-award controls',
    async () => {
      const settings = importApiSettings(
        createDefaultAiSettings(),
        await readFile(settingsPath, 'utf8')
      );
      routes.forEach((route) => requireRoute(settings, route));
      const results = await loadPreviousResults();
      await writeSanitizedResults(results, false);

      for (const scenario of scenarios) {
        const route = routes.find((candidate) => candidate.id === scenario.routeId)!;
        if (
          results.some(
            (result) =>
              result.scenario === scenario.id &&
              result.route === route.profileName &&
              result.model === route.model &&
              result.accepted === true
          )
        ) {
          continue;
        }
        let accepted = false;
        let lastFailure = '';
        for (let attempt = 1; attempt <= 3 && !accepted; attempt += 1) {
          const before = createScenarioState(scenario);
          const startedAt = performance.now();
          let rawTextLength = 0;
          let rawTextContainedJsonObject = false;
          let judgementTrace: JudgementRecoveryTrace | undefined;
          try {
            const narrator = createNarratorClientFromSettings(
              createRouteSettings(settings, route)
            );
            const after = await runPlayerTurn({
              state: before,
              playerInput: scenario.playerInput,
              narrator,
              judgementRoll: scenario.roll,
              enableJudgementPreflight: true,
              gameSettings: {
                ...createDefaultAiSettings().game,
                narrativeLengthLevel: 'brief',
                pregnancyMode: 'off',
                dramaticContent: {
                  ...createDefaultAiSettings().game.dramaticContent,
                  enabled: false
                }
              },
              onRawText: (rawText) => {
                rawTextLength = rawText.length;
                rawTextContainedJsonObject =
                  rawText.includes('{') && rawText.includes('}');
              },
              onJudgementRecoveryTrace: (trace) => {
                judgementTrace = trace;
              },
              signal: AbortSignal.timeout(requestTimeoutMs * 3)
            });
            assertScenarioResult(scenario, before, after);
            const entry = [...after.storyLog]
              .reverse()
              .find((candidate) => candidate.speaker === 'narrator');
            results.push({
              scenario: scenario.id,
              route: route.profileName,
              model: route.model,
              accepted: true,
              attempt,
              durationMs: Math.round(performance.now() - startedAt),
              rawTextLength,
              rawTextContainedJsonObject,
              judgementStages:
                judgementTrace?.stages.map(({ stage, status }) => ({
                  stage,
                  status
                })) ?? [],
              judgementOutcome: Object.values(after.judgementChecks)[0]?.outcome ?? null,
              experienceTotal: entry?.experienceAward?.total ?? 0,
              experienceSources:
                entry?.experienceAward?.sources.map((source) => source.kind) ?? [],
              saveRoundTrip: true
            });
            accepted = true;
          } catch (error) {
            lastFailure = safeError(error);
            results.push({
              scenario: scenario.id,
              route: route.profileName,
              model: route.model,
              accepted: false,
              attempt,
              externalFailure: isExternalFailure(lastFailure),
              recoverableGenerationFailure:
                isRecoverableGenerationFailure(lastFailure),
              durationMs: Math.round(performance.now() - startedAt),
              rawTextLength,
              rawTextContainedJsonObject,
              judgementStages:
                judgementTrace?.stages.map(({ stage, status }) => ({
                  stage,
                  status
                })) ?? [],
              error: lastFailure
            });
          }
          await writeSanitizedResults(results, false);
        }
        if (!accepted) {
          await writeSanitizedResults(results, false);
          throw new Error(`${scenario.id} 未取得有效通过回合：${lastFailure}`);
        }
      }

      await writeSanitizedResults(results, true);
      expect(results.filter((result) => result.accepted)).toHaveLength(30);
    },
    14_400_000
  );
});
