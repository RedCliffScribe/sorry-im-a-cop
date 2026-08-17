import {
  createDefaultAdultRelationshipStyleGuide,
  createOriginalNarrativeStyleAndDisplayGuide,
  resolvePromptText
} from '../prompts/promptRegistry';
import type { NarrativeLengthLevel } from '../settings/narrativeLength';
import { resolveNarrativePerspective } from '../settings/narrativePerspective';
import { resolvePlayerPortrayalMode } from '../settings/playerPortrayal';
import type { NarrativePerspective, PlayerPortrayalMode, PromptSettings } from '../settings/types';

export function createNarrativeStyleAndDisplayGuide(
  level?: NarrativeLengthLevel,
  promptSettings?: PromptSettings,
  playerPortrayalMode?: PlayerPortrayalMode
): string {
  if (resolvePlayerPortrayalMode(playerPortrayalMode) === 'original') {
    return createOriginalNarrativeStyleAndDisplayGuide(level);
  }
  return resolvePromptText('narrative.styleAndDisplay', promptSettings, level);
}

export const narrativeStyleAndDisplayGuide = createNarrativeStyleAndDisplayGuide('standard');

interface NarrativePerspectiveSubject {
  playerName?: string;
  playerGender?: 'male' | 'female' | 'nonbinary' | 'unknown';
}

export function createNarrativePerspectiveGuide(
  perspective?: NarrativePerspective,
  subject: NarrativePerspectiveSubject = {}
): string {
  const resolved = resolveNarrativePerspective(perspective);
  const playerName = subject.playerName?.trim() || '玩家姓名';
  const thirdPersonPronoun =
    subject.playerGender === 'male' ? '他' : subject.playerGender === 'female' ? '她' : playerName;
  const selectedRule: Record<NarrativePerspective, string> = {
    first_person:
      '- 本局选择第一人称：在【旁白】中叙述玩家的动作、处境和可感知体验时，固定以“我”指代玩家；不得切换为“你”，也不得改用玩家姓名或“他/她”叙述玩家。',
    second_person:
      '- 本局选择第二人称：在【旁白】中叙述玩家的动作、处境和可感知体验时，固定以“你”指代玩家；不得切换为叙述者的“我”，也不得改用玩家姓名或“他/她”叙述玩家。',
    third_person: `- 本局选择第三人称：在【旁白】中使用玩家姓名“${playerName}”或代词“${thirdPersonPronoun}”叙述玩家；不得使用“你”称呼玩家，也不得把玩家叙述成“我”。`
  };

  return [
    '正文叙事人称（硬约束，优先于可编辑文风）：',
    selectedRule[resolved],
    '- 单个回合内和跨回合都必须保持所选人称，不得在段落之间来回切换。',
    '- 该规则只约束【旁白】对玩家的叙述。人物对白仍按说话关系自然使用“我、你、他/她”；玩家明确说出的对白可以自称“我”，不视为叙事人称切换。是否允许模型补全未逐字输入的玩家对白，由“正文演绎风格”单独决定。'
  ].join('\n');
}

export function createPlayerPortrayalGuide(
  mode?: PlayerPortrayalMode,
  scope: 'turn' | 'opening' = 'turn'
): string {
  const resolved = resolvePlayerPortrayalMode(mode);
  const lengthRule =
    '- 本模式只改变正文的组织和主角输入如何被演绎，不改变“正文篇幅”设置；必须完成当前篇幅档位的目标与最低字符数，不能因主角少说话、场景简单或启用酒馆预设而自行缩短。';

  if (resolved === 'original' && scope === 'opening') {
    return [
      '正文演绎风格（硬约束，高于可编辑文风与酒馆预设）：',
      '- 本局选择“原始”：恢复 1.0 版先立场面、再承接行动、再写人物与环境反馈的经典组织方式，保留较多香港现场氛围和生活质感。',
      '- 开局阶段没有普通回合的玩家行动输入。姓名、身份、职业、性格、外貌、关系和压力等建档字段只是背景事实，不能当成主角已经说过、决定或承诺的内容。',
      '- “开局额外要求”若明确包含主角要说、要做或要表达的内容，可以按 1.0 版较宽松的方式自然整理成主角对白与动作；只允许补充低风险衔接，不能新增观点、事实、条件、让步、目标或计划。',
      '- 不得替玩家接受或拒绝机会、作出承诺、付款、动用权限、暴露秘密、改变目标或阵营、升级关系、同意亲密行为、施暴、拘捕或进入新的行动目标；必须停在第一个实质选择之前。',
      '- 可以配合酒馆预设调整措辞、节奏、修辞与对白口味；发生冲突时，玩家决定权、事实边界、正文篇幅和结构化写回仍优先。',
      lengthRule
    ].join('\n');
  }

  if (resolved === 'original') {
    return [
      '正文演绎风格（硬约束，高于可编辑文风与酒馆预设）：',
      '- 本局选择“原始”：恢复 1.0 版先立场面、再承接行动、再写 NPC/环境反馈与局面变化的经典组织方式，允许比当前精炼写法保留更多氛围、感官和生活质感。',
      '- 玩家输入是本回合的内容方向。可以把其中已经表达的动作、询问、态度和核心意思自然整理成主角对白与动作，也可以直接从行动造成的结果切入；无需逐字照抄或逐项重述。',
      '- 只允许为已经表达的内容补充自然称呼、语气、动作衔接和低风险表演细节；不得加入输入没有表达的新观点、新问题、新事实、新条件、新让步、新主张、谎言或后续计划。',
      '- 不得把玩家未输入的心理、决定、承诺、同意、拒绝、立场变化、关系升级、资源使用、秘密暴露、主动施暴、拘捕、离开或新目标写成已经发生的事实。',
      '- 回合停在下一次需要玩家作实质选择的位置；拿不准是否越界时，宁可停下并把后续放入 suggestedActions。',
      '- 可以配合酒馆预设调整措辞、节奏、修辞与对白口味；发生冲突时，玩家决定权、事实边界、正文篇幅和结构化写回仍优先。',
      lengthRule
    ].join('\n');
  }

  if (resolved === 'natural' && scope === 'opening') {
    return [
      '正文演绎风格（硬约束，高于可编辑文风与酒馆预设）：',
      '- 本局选择“自然代演”，但开局阶段还没有普通回合的玩家行动输入。姓名、身份、职业、性格、外貌、关系和压力等建档字段只是背景事实，不得把它们擅自改写成玩家已经说过、决定或承诺的内容。',
      '- 如果“开局额外要求”明确写了主角要说或要做的内容，必须把该内容在 narrativeText 中真正演出来：说话使用玩家姓名标签，动作使用【旁白】；可以润色措辞、称呼、语气和必要衔接，但不得新增观点、问题、事实、条件、让步、主张或后续计划。',
      '- 如果“开局额外要求”没有明确的主角说话或动作，只建立现场、NPC 行动与可观察局面，不得为了让主角显得活跃而编造对白、心理、态度、表情、感官体验或自主动作。',
      '- 绝对不得替玩家接受或拒绝机会、选择条件、承诺、签署、付款、动用物品或权限、暴露秘密、改变目标或阵营、升级或结束关系、同意或升级亲密行为、主动施暴、拘捕、离开或进入新的行动目标。',
      '- 开局必须停在第一个需要玩家回答或作出实质选择的位置，并把选择交给玩家输入或 suggestedActions；拿不准时按“玩家主导”处理。',
      lengthRule
    ].join('\n');
  }

  if (resolved === 'natural') {
    return [
      '正文演绎风格（硬约束，高于可编辑文风与酒馆预设）：',
      '- 本局选择“自然代演”：玩家输入给出本回合要说和要做的内容、目标、立场与授权范围；必须把这些内容在 narrativeText 中真正演出来，而不是只写 NPC 的回答或输入之后的结果。',
      '- 输入含有询问、告知、回答、反驳、解释、请求等说话内容时，必须使用玩家姓名标签，把输入的核心意思润色成符合既有性格、说话风格、粤语风味和当前关系的自然完整对白；只演一次，不要先复述再换词重复。',
      '- 输入含有动作时，用【旁白】把该动作及其不可缺少的执行过程写进现场。可以补全完成已授权内容不可缺少、立即可逆且低风险的衔接动作；不得借“润色”或“小动作”跨入新的目的、地点、对象或行动阶段。',
      '- 润色只能改善措辞、称呼、语气和句子连贯性，不得加入玩家输入没有表达的新观点、新问题、新事实、新条件、新让步、新主张或后续计划。',
      '- 绝对不得替玩家作决定：不得擅自接受或拒绝提议、选择条件、承诺或发誓、签署或付款、动用物品或权限、认罪或撒谎、暴露秘密或证据、改变目标或阵营、升级或结束关系、同意或升级亲密行为、主动施暴、拘捕、离开或进入新的行动目标。',
      '- 不得替玩家编造经历、知识、证据、立场、谎言或未提供的事实；不得把恐惧、愤怒、喜欢、愉悦、信任、同意、拒绝等内心态度写成既定事实，除非玩家输入或结构化状态已经明确。',
      '- “准备、打算、想要、尝试、等待机会、观察后再决定”只授权围绕该意图进行当场表达或必要过程，不等于后续选择、结果或承诺已经发生。',
      '- 一旦下一句话或下一动作会改变玩家的利益、义务、风险、关系、身份、资源或未来路线，立即停在决定前，把选择留给玩家输入或 suggestedActions。拿不准时按“玩家主导”处理。',
      '- 玩家对白使用玩家姓名标签，不要用【你】代替玩家说话；输出前静默删除所有越过既定目标、立场或上述决定边界的代演内容。',
      lengthRule
    ].join('\n');
  }

  return [
    '正文演绎风格（硬约束，高于可编辑文风与酒馆预设）：',
    '- 本局选择“玩家主导”：只有玩家明确输入的对白和动作才能写成玩家已经说过或做过的事实。',
    '- 不得把玩家未输入的对白、想法、判断、决定、承诺、主观感受、表情、身体反应或额外动作写成已经发生的事实。',
    '- 玩家输入中的“准备、打算、想要、尝试、等待机会、观察后再决定”等目的或意图，不等于后续动作已经执行；只承接玩家明确做出的部分，停在下一步实际动作之前。',
    '- 玩家输入定义本回合玩家行动的有限包络，而不是一句必须跳过的完成摘要。可以展开该行动本身必需的执行过程、直接接触对象、正在核对或观察的具体内容，以及它立即造成的可观察结果；不得越过行动目标，追加新的自主选择、目的、承诺或后续行动。',
    '- 例如“核对登记簿”允许写正在比对的栏目、发现的矛盾、既有 NPC 对问题的回答与核对直接形成的信息，但不自动授权签字、勾选、盖章、重新叠放、推回或递交文书、清空文件框；“去找某人谈话”允许写到达、对方是否接待和围绕已说明目的的回应，但不能替玩家追加未输入的论点、让步或承诺。',
    '- 玩家明确行动的授权范围写完后，正文只能继续 NPC 的行动、对白和环境造成的客观后果；若下一句仍以玩家为主语，必须确认该动作或状态已经在输入、行动必要过程或既有事实中明确成立。',
    '- 不要换词复述玩家输入；应把玩家已经授权的行动真正演成现场，再停在下一次需要玩家决定的位置。简单事务最多使用一个真正有用的环境锚点，不要轮流罗列视觉、听觉、嗅觉和触觉。',
    '- 可以写玩家明确行动所造成、任何旁观者都能确认的必要物理结果，但不得据此替玩家决定舒适、恐惧、愤怒、喜欢、愉悦、同意或拒绝。',
    '- 回合必须停在玩家下一次决定、回答、接受、拒绝、升级、停止或离开的前一刻；把选择留给玩家输入，不得替玩家跨过该边界。',
    '- 玩家明确说出的对白使用玩家姓名标签，不要用【你】代替玩家说话。',
    '- 输出前静默删除所有超出行动有限包络、替玩家新增的动作、姿势、目光、表情、感官体验、身体反应、心理和决定；删除后应改用已授权行动内的具体内容、NPC 回应、信息、限制或直接后果保持现场完整，不得用其它玩家动作补句。',
    lengthRule
  ].join('\n');
}

export function createPlayerControlOutputRule(mode?: PlayerPortrayalMode): string {
  const resolved = resolvePlayerPortrayalMode(mode);
  if (resolved === 'natural') {
    return '玩家控制最高优先级：必须把玩家本回合输入的说话和动作内容真正写入 narrativeText；可以按人物口吻润色措辞和补必要衔接，但不得新增观点、问题、事实、条件、让步、主张或计划，也不得替玩家接受或拒绝、承诺、付款、动用权限、暴露秘密、改变目标、升级关系或作出任何会改变利益、义务、风险和未来路线的决定；输出前必须静默删除越界内容。';
  }
  if (resolved === 'original') {
    return '玩家控制最高优先级：按 1.0 原始写法自然承接玩家本回合已经表达的动作、询问、态度与核心意思，可整理成主角对白和低风险动作衔接，但不得新增观点、事实、条件、承诺、同意、拒绝、资源使用、关系升级、秘密暴露或后续目标；所有实质决定仍必须留给玩家。';
  }
  return '玩家控制最高优先级：玩家输入是本回合玩家动作的封闭清单。写完明确动作后，只推进 NPC 与环境后果；不得补玩家的微动作、姿势、目光、感官、身体反应、心理或决定。输出前必须静默删除任何越界句。';
}

export function createPlayerActionLock(playerInput: string, mode?: PlayerPortrayalMode): string {
  const resolved = resolvePlayerPortrayalMode(mode);
  if (resolved === 'natural') {
    return `下方原文定义本回合玩家要说和要做的内容、目标、立场与授权范围，不是要求逐字照抄的台词：\n${playerInput}\n\n必须先把这段输入在 narrativeText 中真正演出来，再承接 NPC 与环境反应。输入含有询问、告知、回答、反驳、解释、请求等说话内容时，使用玩家姓名标签，把核心意思润色成符合玩家既有性格、说话风格、粤语风味和当前关系的自然完整对白；输入含有动作时，用【旁白】写出该动作及其必要过程。只演一次，不要复述输入后再换词重复。润色只能改善措辞、称呼、语气与连贯性，不得新增观点、问题、事实、谎言、条件、让步、主张、计划或后续目标。可以补全完成已授权内容不可缺少、立即可逆且低风险的衔接动作；不得擅自接受或拒绝、承诺、签署、付款、动用物品或权限、暴露秘密或证据、升级或结束关系、同意或升级亲密行为、施暴、拘捕、离开或转入新的行动。遇到会改变利益、义务、风险、关系、身份、资源或未来路线的节点，必须停在决定前并交给玩家。不得把未明确的内心态度、感官体验或身体反应写成事实；拿不准时按“玩家主导”处理。`;
  }

  if (resolved === 'original') {
    return `下方原文是本回合玩家已经表达的内容方向：\n${playerInput}\n\n按 1.0 原始写法把已有动作、询问、态度与核心意思自然融入“场面—行动—反馈—局面变化”之中。可以将已经表达的意思整理成主角对白，也可以从行动过程或直接结果切入；无需逐字照抄或逐项重述。只允许补自然称呼、语气、低风险动作衔接和现场质感，不得新增观点、问题、事实、谎言、条件、让步、承诺、同意、拒绝、付款、权限使用、秘密暴露、关系升级、暴力、拘捕、离开或后续目标。停在下一次实质选择之前。酒馆预设可以调整语言风味，但不得覆盖这些边界或正文篇幅合同。`;
  }

  return `下方原文定义本回合玩家行动的有限包络，不是可以继续添加新决定的动作提纲：\n${playerInput}\n\n正文可以把这项已获授权的行动真正演成现场：展开完成该行动所必需的过程、直接接触对象、正在读取/核对/调查的具体内容，以及它立即造成的可观察结果；不要换词复述输入，也不得越过其目标执行尚未授权的下一步、目的、准备或意图。例如“补齐编号”只允许写补齐的具体栏目和现场直接反馈，不授权继续合上、推回或递交登记簿；“逐项核对”允许写被核对内容、矛盾和相关 NPC 回答，但不授权签字、勾选、盖章、重新叠放物件或清空文件框。不得用“玩家手掌下传来、耳边听见、闻到、感觉到”等句式替玩家建立主观感官体验；改写为行动对象、NPC 或环境中镜头可观察的事实。行动包络结束后停在下一次需要玩家选择的位置，输出前删除所有越界的玩家微动作、姿势、目光、感官、身体反应、心理和决定。`;
}

export function createAdultRelationshipStyleGuide(promptSettings?: PromptSettings): string {
  return resolvePromptText('relationship.adultStyleGuide', promptSettings);
}

export const adultRelationshipStyleGuide = createDefaultAdultRelationshipStyleGuide();
