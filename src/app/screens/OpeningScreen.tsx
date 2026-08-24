import { useEffect, useMemo, useRef, useState } from 'react';
import type { OpeningSetup } from '../../domain/runtime/initialState';
import type {
  AttributeBlock,
  CantoneseFlavorLevel,
  CurrentIdentity,
  GameDifficultyLevel,
  OriginBackground,
  Trait
} from '../../domain/runtime/types';
import { cantoneseFlavorProfiles } from '../../domain/settings/cantoneseFlavor';
import { gameDifficultyProfiles } from '../../domain/settings/gameDifficulty';
import {
  getAllowedPoliceDepartments,
  getAllowedPolicePostings,
  getAllowedPoliceRoles,
  getAllowedTriadTerritories,
  getAllowedTriadRoles,
  getCivilianOpeningProfile,
  getPoliceDepartment,
  getPolicePosting,
  getPoliceRank,
  getPoliceRole,
  getTriadRank,
  getTriadSociety,
  getTriadTerritory,
  resolveTriadOpeningProfile,
  civilianOpeningProfileOptions,
  hk1980sOpeningScenarios,
  hk1980sOriginBackgroundOptions,
  identityOpeningOptions,
  policeRankOptions,
  triadRankOptions,
  triadSocietyOptions,
  type CivilianOpeningProfileOption,
  type PoliceDepartmentId,
  type PoliceRankId,
  type TriadRankId
} from '../../domain/worldpack/hk1980sOpening';
import civilianGroupImg from '../../assets/identity/civilian-group.webp';
import policeGroupImg from '../../assets/identity/police-group.webp';
import triadGroupImg from '../../assets/identity/triad-group.webp';
import story1980Img from '../../assets/storypack/1980.webp';
import story1984Img from '../../assets/storypack/1984.webp';
import story1988Img from '../../assets/storypack/1988.webp';
import story1990Img from '../../assets/storypack/1990.webp';
import story1994Img from '../../assets/storypack/1994.webp';
import story1996Img from '../../assets/storypack/1996.webp';
import {
  OpeningCharacterTemplateDialog,
  type OpeningCharacterTemplateDialogMode
} from '../components/OpeningCharacterTemplateDialog';
import { OpeningLegalDisclaimerModal } from '../components/OpeningLegalDisclaimerModal';
import {
  hasAcceptedOpeningLegalDisclaimer,
  recordOpeningLegalDisclaimerAcceptance
} from '../legal/openingLegalDisclaimer';
import { CUSTOM_ORIGIN_BACKGROUNDS_STORAGE_KEY } from '../opening/customOriginStorage';
import {
  dramaticOpeningDefinitions,
  dramaticOpeningGroups,
  getDramaticOpeningDefinition
} from '../../domain/drama/openingRegistry';
import { IndexedDbCustomContentRepository } from '../../domain/customContent/IndexedDbCustomContentRepository';
import {
  loadNewGameCustomContentLibrary,
  MAX_NEW_GAME_CUSTOM_CONTENT_PRIORITIES,
  MAX_NEW_GAME_CUSTOM_CONTENT_SELECTIONS,
  type NewGameCustomContentLibrary,
  type NewGameCustomContentOption,
  type NewGameCustomContentReviewItem
} from '../../domain/customContent/newGameSelection';
import {
  OPENING_CHARACTER_TEMPLATE_WORLDPACK_ID,
  deleteOpeningCharacterTemplate,
  loadOpeningCharacterTemplates,
  saveOpeningCharacterTemplate,
  type OpeningCharacterTemplate,
  type OpeningCharacterTemplateProfile
} from '../../domain/opening/openingCharacterTemplateStore';

interface OpeningScreenProps {
  onStartGame: (setup: OpeningSetup) => void;
  onBack: () => void;
  isStarting?: boolean;
  error?: string | null;
  streamText?: string;
  customContentReview?: NewGameCustomContentReviewItem[];
  onApproveCustomContentReview?: () => void;
  onCancelCustomContentReview?: () => void;
  officialDlcIds?: string[];
}

interface AttributePreset {
  id: string;
  name: string;
  summary: string;
  attributes: AttributeBlock;
}

interface OriginBackgroundDraft {
  name: string;
  definition: string;
  backgroundSummary: string;
}

interface OpeningPressureOption {
  id: NonNullable<OpeningSetup['openingPressure']>;
  label: string;
  summary: string;
}

const openingSteps = [
  '世界与剧本',
  '身份选择',
  '基础档案',
  '能力与特质',
  '戏剧化开局',
  '自定义内容',
  '确认生成'
];
const storypackInfluenceLabels: Record<string, string> = {
  off: '关闭',
  low: '低',
  medium: '中',
  high: '高'
};
const freePointBudget = 60;
const baseAttributeTotal = 300;
const maxOpeningTraits = 3;
const attributeHoldDelayMs = 300;
const attributeHoldRepeatMs = 75;
const minOpeningAge = 16;
const civilianOccupationGroups: Array<{
  id: CivilianOpeningProfileOption['occupationGroup'];
  label: string;
  summary: string;
}> = [
  { id: 'frontline', label: '基层与街面职业', summary: '接触面广、收入较低，容易从日常事件进入城市关系。' },
  { id: 'professional', label: '专业与办公室职业', summary: '拥有明确行业入口，但权限仍受岗位和保密边界约束。' },
  { id: 'management', label: '中层管理与经营', summary: '能调动有限人手或经营资源，不等于机构高层。' },
  { id: 'free', label: '自由选择', summary: '无业或自定义职业，保留更开放的生活起点。' }
];
const maxOpeningAge = 90;
const fallbackOpeningAge = 25;
const defaultBirthMonth = 4;
const defaultBirthDay = 18;
const birthMonthOptions = Array.from({ length: 12 }, (_, index) => index + 1);
const identityImageMap: Record<string, string> = {
  civilian: civilianGroupImg,
  police: policeGroupImg,
  gang_member: triadGroupImg
};
const scenarioImageMap: Record<string, string> = {
  hk_1980_growth_pressure: story1980Img,
  hk_1984_joint_declaration: story1984Img,
  hk_1988_crosscurrents: story1988Img,
  hk_1990_transition_begins: story1990Img,
  hk_1994_urban_fracture: story1994Img,
  hk_1996_handover_eve: story1996Img
};
const scenarioYearMap: Record<string, string> = {
  hk_1980_growth_pressure: '1980',
  hk_1984_joint_declaration: '1984',
  hk_1988_crosscurrents: '1988',
  hk_1990_transition_begins: '1990',
  hk_1994_urban_fracture: '1994',
  hk_1996_handover_eve: '1996'
};
const civilianCustomLocationOptions = civilianOpeningProfileOptions
  .filter((profile) => profile.employmentStatus === 'employed')
  .map((profile) => ({
    placeId: profile.workplacePlaceId,
    label: profile.workplaceLabel
  }))
  .filter((option, index, options) => options.findIndex((candidate) => candidate.placeId === option.placeId) === index);
const defaultAppearanceByIdentity: Record<CurrentIdentity, string> = {
  police: '制服整洁，神情仍带一点新人谨慎。',
  civilian: '穿着符合当前生活与收入状况的日常衣服，神情带着普通生活的疲惫和警觉。',
  gang_member: '穿着不起眼的街头便服，神情谨慎，不敢把字头名号挂在脸上。'
};

const openingPressureOptions: OpeningPressureOption[] = [
  { id: 'relaxed', label: '轻松开局', summary: '普通日常第一幕：日常执勤、生活小事、街坊寒暄或普通人情请求。' },
  { id: 'routine', label: '日常开局', summary: '有小麻烦或普通压力，但玩家有充足观察和选择空间。' },
  { id: 'standard', label: '标准开局', summary: '有明确矛盾或案件苗头，但不直接升级成危机。' },
  { id: 'tense', label: '棘手开局', summary: '压力较强，局面已有阻力、牵连或时间成本。' },
  { id: 'high', label: '高压开局', summary: '高风险第一幕，可有紧迫事件，但仍保留玩家可行动空间。' }
];

const attributePresets: AttributePreset[] = [
  {
    id: 'balanced',
    name: '稳健新人',
    summary: '六维均衡。',
    attributes: { body: 50, action: 50, perception: 50, thinking: 50, negotiation: 50, will: 50 }
  },
  {
    id: 'street',
    name: '街头实干',
    summary: '街面处理。',
    attributes: { body: 54, action: 56, perception: 56, thinking: 48, negotiation: 52, will: 54 }
  },
  {
    id: 'talker',
    name: '会做人',
    summary: '人情周旋。',
    attributes: { body: 46, action: 48, perception: 52, thinking: 56, negotiation: 60, will: 52 }
  },
  {
    id: 'investigator',
    name: '查案脑',
    summary: '线索判断。',
    attributes: { body: 46, action: 48, perception: 60, thinking: 60, negotiation: 50, will: 50 }
  },
  {
    id: 'firearms',
    name: '枪法训练',
    summary: '危险处置。',
    attributes: { body: 52, action: 60, perception: 54, thinking: 48, negotiation: 46, will: 50 }
  },
  {
    id: 'tough',
    name: '硬骨头',
    summary: '扛压耐耗。',
    attributes: { body: 60, action: 50, perception: 48, thinking: 46, negotiation: 46, will: 60 }
  }
];

const openingTraits: Trait[] = [
  {
    traitId: 'trait_steady_hands',
    name: '枪法稳',
    source: 'opening',
    description: '射击训练成绩稳定。',
    effectSummary: '枪械、威慑和危险场景判定时获得稳定性参考。',
    scopes: ['firearms', 'danger'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_quick_feet',
    name: '手脚快',
    source: 'opening',
    description: '反应快，行动不拖泥带水。',
    effectSummary: '追逐、救急和突发危险中更容易抢到先机。',
    scopes: ['action', 'emergency'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_night_shift',
    name: '熬得夜',
    source: 'opening',
    description: '对夜班、蹲守和长时间值勤更能忍。',
    effectSummary: '夜场、蹲点和疲劳场景中更稳定。',
    scopes: ['stamina', 'night'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_reads_the_room',
    name: '会看场面',
    source: 'opening',
    description: '能较快判断现场谁在说谎、谁在看风向。',
    effectSummary: '街面交涉、盘问和社交判断时获得叙事权重。',
    scopes: ['street', 'social'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_remembers_faces',
    name: '记人快',
    source: 'opening',
    description: '对人脸、称呼和小细节记得牢。',
    effectSummary: '重逢、认人和关系线索更容易接上。',
    scopes: ['memory', 'npc'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_not_superstitious',
    name: '不信巧合',
    source: 'opening',
    description: '遇到重复细节会本能起疑。',
    effectSummary: '疑点、口供矛盾和隐藏牵连更容易被注意。',
    scopes: ['investigation', 'suspicion'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_paperwork_clean',
    name: '文书细',
    source: 'opening',
    description: '记录、时间和程序细节比较稳。',
    effectSummary: '档案、报告和程序风险场景更少出纰漏。',
    scopes: ['paperwork', 'discipline'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_local_roots',
    name: '街坊底',
    source: 'opening',
    description: '从屋邨、街市和老街坊之间长大，懂底层人情。',
    effectSummary: '屋邨、街市、小贩和街坊网络中更容易打听消息或取得信任。',
    scopes: ['community', 'street'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_cha_chaan_teng_ear',
    name: '茶餐厅耳',
    source: 'opening',
    description: '习惯在茶餐厅、冰室和士多里听人说闲话。',
    effectSummary: '街坊传闻、夜场动静和小道消息更容易被你接上。',
    scopes: ['rumor', 'community'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_hates_debt',
    name: '人情账清',
    source: 'opening',
    description: '记得谁帮过谁，也知道哪些好处不能随便收。',
    effectSummary: '面对托付、搭桥和灰色好处时更容易保持主动。',
    scopes: ['relationship', 'favor'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_soft_heart',
    name: '肯听苦衷',
    source: 'opening',
    description: '愿意多听一句，不急着把人当成麻烦处理。',
    effectSummary: '家庭纠纷、求情和底层困境中更容易问出真实处境。',
    scopes: ['empathy', 'family'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_by_the_book',
    name: '守规矩',
    source: 'opening',
    description: '对纪律和程序有基本敬畏。',
    effectSummary: '面对灰色好处和越界命令时提供性格锚点。',
    scopes: ['discipline', 'risk'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_discipline_hawk',
    name: '程序硬',
    source: 'opening',
    description: '重视证据链、记录和正式流程。',
    effectSummary: '内部压力、越界命令和程序风险中更能守住手续。',
    scopes: ['discipline', 'internal'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_bold',
    name: '胆大',
    source: 'opening',
    description: '敢压上去，不太怕场面失控。',
    effectSummary: '冲突、威慑和危险谈判中更容易主动。',
    scopes: ['danger', 'will'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_tight_lipped',
    name: '嘴严',
    source: 'opening',
    description: '不轻易透露底牌。',
    effectSummary: '卧底、线人和内部消息场景更可靠。',
    scopes: ['secret', 'informant'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_informant_touch',
    name: '线人缘',
    source: 'opening',
    description: '更容易让边缘人物愿意开口。',
    effectSummary: '消息、街坊和灰色圈接触时更容易破冰。',
    scopes: ['informant', 'street'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_nightlife_sense',
    name: '夜场熟',
    source: 'opening',
    description: '懂夜总会、酒吧和娱乐场的基本规矩。',
    effectSummary: '夜场冲突、看场关系和消费局中更懂门道。',
    scopes: ['nightlife', 'triad'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_dock_knowledge',
    name: '码头路熟',
    source: 'opening',
    description: '对码头、货仓和运输圈有些认识。',
    effectSummary: '走私、货运和海边社区场景有额外参照。',
    scopes: ['dock', 'smuggling'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_old_street_face',
    name: '老街坊脸',
    source: 'opening',
    description: '看起来不像高高在上的外人。',
    effectSummary: '屋邨、小贩和街坊网络中更容易被接受。',
    scopes: ['community', 'street'],
    status: 'active',
    visibility: 'player_known'
  },
  {
    traitId: 'trait_academy_star',
    name: '警校优等',
    source: 'opening',
    description: '训练成绩漂亮，基础动作和理论规矩扎实。',
    effectSummary: '程序、理论和上级初印象较好，遇到标准流程更稳。',
    scopes: ['academy', 'reputation'],
    status: 'active',
    visibility: 'player_known'
  }
];

const attributeLabels: Array<{ key: keyof AttributeBlock; label: string; description: string }> = [
  { key: 'body', label: '体魄', description: '影响体力消耗、负伤承受、搏斗和长时间执勤的稳定性' },
  { key: 'action', label: '行动', description: '影响反应速度、追逐、突入、闪避和危险现场处置' },
  { key: 'perception', label: '观察', description: '影响发现现场细节、读懂表情、识别尾随与异常动静' },
  { key: 'thinking', label: '思考', description: '影响推理判断、计划安排、识破漏洞和复杂局面的取舍' },
  { key: 'negotiation', label: '交涉', description: '影响盘问谈判、安抚街坊、周旋人情与压住场面的能力' },
  { key: 'will', label: '意志', description: '影响抗压坚持、抵抗诱惑、承受威胁与灰色压力的韧性' }
];

function formatTimeLabel(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatFullTime(time: { year: number; month: number; day: number; hour: number; minute: number }) {
  return `${formatTimeLabel(time.year, time.month, time.day)} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function normalizeOpeningAge(age: number) {
  return Number.isFinite(age) ? Math.max(minOpeningAge, Math.min(maxOpeningAge, Math.floor(age))) : fallbackOpeningAge;
}

function readValidOpeningAgeDraft(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) &&
    parsed >= minOpeningAge &&
    parsed <= maxOpeningAge
    ? parsed
    : undefined;
}

function resolveOpeningAgeDraft(value: string): number {
  if (!value.trim()) return fallbackOpeningAge;
  return normalizeOpeningAge(Number(value));
}

function normalizeBirthMonth(month: number) {
  return Number.isFinite(month) ? Math.max(1, Math.min(12, Math.floor(month))) : defaultBirthMonth;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function normalizeBirthDay(day: number, maxDay: number) {
  return Number.isFinite(day) ? Math.max(1, Math.min(maxDay, Math.floor(day))) : Math.min(defaultBirthDay, maxDay);
}

function calculateBirthYear(age: number, scenarioTime: { year: number }) {
  return scenarioTime.year - normalizeOpeningAge(age);
}

function calculateBirthDate(age: number, scenarioTime: { year: number }, month: number, day: number) {
  const birthYear = calculateBirthYear(age, scenarioTime);
  const safeMonth = normalizeBirthMonth(month);
  const safeDay = normalizeBirthDay(day, getDaysInMonth(birthYear, safeMonth));
  return formatTimeLabel(birthYear, safeMonth, safeDay);
}

function attributeTotal(attributes: AttributeBlock) {
  return Object.values(attributes).reduce((total, value) => total + value, 0);
}

function remainingAttributePoints(attributes: AttributeBlock) {
  return baseAttributeTotal + freePointBudget - attributeTotal(attributes);
}

function applyAttributeDelta(attributes: AttributeBlock, key: keyof AttributeBlock, delta: number): AttributeBlock {
  const currentValue = attributes[key];
  if (delta > 0) {
    const remaining = remainingAttributePoints(attributes);
    if (remaining <= 0 || currentValue >= 80) return attributes;
    return {
      ...attributes,
      [key]: Math.min(80, currentValue + delta, currentValue + remaining)
    };
  }

  if (delta < 0) {
    if (currentValue <= 30) return attributes;
    return {
      ...attributes,
      [key]: Math.max(30, currentValue + delta)
    };
  }

  return attributes;
}

function isOriginBackground(value: unknown): value is OriginBackground {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OriginBackground>;
  return (
    typeof candidate.originBackgroundId === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.definition === 'string' &&
    typeof candidate.backgroundSummary === 'string'
  );
}

function loadCustomOriginBackgrounds(): OriginBackground[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(CUSTOM_ORIGIN_BACKGROUNDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOriginBackground);
  } catch {
    return [];
  }
}

function createCustomOriginBackgroundId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `custom_origin_${crypto.randomUUID()}`;
  }

  return `custom_origin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyOriginBackgroundDraft(): OriginBackgroundDraft {
  return { name: '', definition: '', backgroundSummary: '' };
}

function normalizePoliceNumberInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 4);
}

export function OpeningScreen({
  onStartGame,
  onBack,
  isStarting = false,
  error = null,
  streamText = '',
  customContentReview = [],
  onApproveCustomContentReview,
  onCancelCustomContentReview,
  officialDlcIds = []
}: OpeningScreenProps) {
  const customContentRepository = useMemo(
    () => new IndexedDbCustomContentRepository(),
    []
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [scenarioId, setScenarioId] = useState('hk_1988_crosscurrents');
  const [storypackInfluence, setStorypackInfluence] = useState<OpeningSetup['storypackInfluence']>('high');
  const [screenCharacterSeedsEnabled, setScreenCharacterSeedsEnabled] = useState(true);
  const [dramaticOpeningEnabled, setDramaticOpeningEnabled] = useState(false);
  const [dramaticOpeningGroupId, setDramaticOpeningGroupId] = useState(dramaticOpeningGroups[0].id);
  const [dramaticOpeningId, setDramaticOpeningId] = useState(dramaticOpeningDefinitions[0].id);
  const [currentIdentity, setCurrentIdentity] = useState<CurrentIdentity>('police');
  const [playerName, setPlayerName] = useState('');
  const [englishName, setEnglishName] = useState('');
  const [gender, setGender] = useState<OpeningSetup['gender']>('male');
  const [age, setAge] = useState(fallbackOpeningAge);
  const [ageDraft, setAgeDraft] = useState(String(fallbackOpeningAge));
  const [birthMonth, setBirthMonth] = useState(defaultBirthMonth);
  const [birthDay, setBirthDay] = useState(defaultBirthDay);
  const [personality, setPersonality] = useState('谨慎，观察欲强，还没有完全适应街面规则。');
  const [appearance, setAppearance] = useState(defaultAppearanceByIdentity.police);
  const [cantoneseFlavor, setCantoneseFlavor] = useState<CantoneseFlavorLevel>('medium');
  const [policeNumber, setPoliceNumber] = useState('');
  const [customOriginBackgrounds, setCustomOriginBackgrounds] = useState<OriginBackground[]>(() => loadCustomOriginBackgrounds());
  const [originBackgroundId, setOriginBackgroundId] = useState(hk1980sOriginBackgroundOptions[0].originBackgroundId);
  const [originEditorMode, setOriginEditorMode] = useState<'closed' | 'new' | 'edit'>('closed');
  const [editingOriginBackgroundId, setEditingOriginBackgroundId] = useState<string | null>(null);
  const [originDraft, setOriginDraft] = useState<OriginBackgroundDraft>(() => emptyOriginBackgroundDraft());
  const [originDraftError, setOriginDraftError] = useState('');
  const [rankId, setRankId] = useState<PoliceRankId>('pc');
  const [departmentId, setDepartmentId] = useState<PoliceDepartmentId>('uniform');
  const [roleId, setRoleId] = useState('patrol_constable');
  const [postingId, setPostingId] = useState('mong_kok_police_station');
  const [civilianProfileId, setCivilianProfileId] = useState(civilianOpeningProfileOptions[0].id);
  const [customCivilianOccupation, setCustomCivilianOccupation] = useState('');
  const [customCivilianEmployerName, setCustomCivilianEmployerName] = useState('');
  const [customCivilianPlaceId, setCustomCivilianPlaceId] = useState(civilianCustomLocationOptions[0].placeId);
  const [customCivilianCommunitySummary, setCustomCivilianCommunitySummary] = useState('');
  const [triadSocietyId, setTriadSocietyId] = useState(triadSocietyOptions[0].id);
  const [triadTerritoryPlaceId, setTriadTerritoryPlaceId] = useState(triadSocietyOptions[0].defaultTerritoryPlaceId);
  const [triadRankId, setTriadRankId] = useState<TriadRankId>('outside_associate');
  const [triadRoleId, setTriadRoleId] = useState('street_runner');
  const [selectedPresetId, setSelectedPresetId] = useState(attributePresets[0].id);
  const [attributes, setAttributes] = useState<AttributeBlock>(attributePresets[0].attributes);
  const [selectedTraitIds, setSelectedTraitIds] = useState<string[]>([]);
  const [openingPressure, setOpeningPressure] = useState<NonNullable<OpeningSetup['openingPressure']>>('relaxed');
  const [gameDifficulty, setGameDifficulty] = useState<GameDifficultyLevel>('standard');
  const [openingNote, setOpeningNote] = useState('');
  const [customContentLibrary, setCustomContentLibrary] =
    useState<NewGameCustomContentLibrary>({
      characters: [],
      events: [],
      projects: []
    });
  const [customContentLibraryStatus, setCustomContentLibraryStatus] = useState<
    'loading' | 'ready' | 'error'
  >('loading');
  const [customContentNotice, setCustomContentNotice] = useState<string | null>(
    null
  );
  const [selectedCustomContentKeys, setSelectedCustomContentKeys] = useState<
    string[]
  >([]);
  const [prioritizedCustomContentKeys, setPrioritizedCustomContentKeys] =
    useState<string[]>([]);
  const [
    openingCustomSupportSelectionKey,
    setOpeningCustomSupportSelectionKey
  ] = useState<string | undefined>();
  const [isLegalDisclaimerOpen, setIsLegalDisclaimerOpen] = useState(false);
  const [characterTemplates, setCharacterTemplates] = useState<
    OpeningCharacterTemplate[]
  >(() => loadOpeningCharacterTemplates());
  const [characterTemplateDialogMode, setCharacterTemplateDialogMode] =
    useState<OpeningCharacterTemplateDialogMode>();
  const [characterTemplateName, setCharacterTemplateName] = useState('');
  const [activeCharacterTemplateId, setActiveCharacterTemplateId] =
    useState<string>();
  const [characterTemplateStatus, setCharacterTemplateStatus] =
    useState('');
  const attributeHoldTimeoutRef = useRef<number | null>(null);
  const attributeHoldIntervalRef = useRef<number | null>(null);

  const selectedScenario = hk1980sOpeningScenarios.find((scenario) => scenario.id === scenarioId) ?? hk1980sOpeningScenarios[2];
  const selectedDramaticOpening = getDramaticOpeningDefinition(dramaticOpeningId);
  const visibleDramaticOpenings = dramaticOpeningDefinitions.filter(
    (definition) => definition.groupId === dramaticOpeningGroupId
  );
  const allowedDepartments = getAllowedPoliceDepartments(rankId);
  const selectedDepartment = allowedDepartments.find((department) => department.id === departmentId) ?? allowedDepartments[0];
  const allowedPostings = getAllowedPolicePostings(selectedDepartment.id);
  const selectedPosting = allowedPostings.find((posting) => posting.id === postingId) ?? allowedPostings[0];
  const allowedRoles = getAllowedPoliceRoles(selectedDepartment.id, rankId);
  const selectedRole = allowedRoles.find((role) => role.id === roleId) ?? allowedRoles[0];
  const selectedCustomCivilianPlace =
    civilianCustomLocationOptions.find((option) => option.placeId === customCivilianPlaceId) ?? civilianCustomLocationOptions[0];
  const civilianCustomProfile = {
    publicOccupation: customCivilianOccupation,
    workplacePlaceId: selectedCustomCivilianPlace.placeId,
    workplaceLabel: selectedCustomCivilianPlace.label,
    employerName: customCivilianEmployerName,
    communitySummary: customCivilianCommunitySummary
  };
  const selectedCivilianProfile = getCivilianOpeningProfile(civilianProfileId, civilianCustomProfile);
  const selectedTriadSociety = getTriadSociety(triadSocietyId);
  const allowedTriadTerritories = getAllowedTriadTerritories(selectedTriadSociety.id);
  const selectedTriadTerritory = getTriadTerritory(selectedTriadSociety.id, triadTerritoryPlaceId);
  const selectedTriadRank = getTriadRank(triadRankId);
  const allowedTriadRoles = getAllowedTriadRoles(selectedTriadRank.id);
  const selectedTriadRole = allowedTriadRoles.find((role) => role.id === triadRoleId) ?? allowedTriadRoles[0];
  const selectedTriadProfile = resolveTriadOpeningProfile({
    societyId: selectedTriadSociety.id,
    territoryPlaceId: selectedTriadTerritory.placeId,
    rankId: selectedTriadRank.id,
    roleId: selectedTriadRole.id
  });
  const validDraftAge = readValidOpeningAgeDraft(ageDraft);
  const displayedAge = validDraftAge ?? age;
  const resolvedAge = resolveOpeningAgeDraft(ageDraft);
  const derivedBirthYear = calculateBirthYear(
    displayedAge,
    selectedScenario.time
  );
  const safeBirthMonth = normalizeBirthMonth(birthMonth);
  const maxBirthDay = getDaysInMonth(derivedBirthYear, safeBirthMonth);
  const safeBirthDay = normalizeBirthDay(birthDay, maxBirthDay);
  const birthDayOptions = useMemo(() => Array.from({ length: maxBirthDay }, (_, index) => index + 1), [maxBirthDay]);
  const derivedBirthDate = calculateBirthDate(
    displayedAge,
    selectedScenario.time,
    safeBirthMonth,
    safeBirthDay
  );
  const resolvedBirthDate = calculateBirthDate(
    resolvedAge,
    selectedScenario.time,
    safeBirthMonth,
    birthDay
  );
  const resolvedPlayerName = playerName.trim();
  const resolvedEnglishName = englishName.trim();
  const playerNameSummary = resolvedPlayerName || '留空，开局生成';
  const englishNameSummary = resolvedEnglishName || '留空，按中文名生成';
  const remainingPoints = remainingAttributePoints(attributes);
  const selectedTraits = useMemo(
    () => openingTraits.filter((trait) => selectedTraitIds.includes(trait.traitId)),
    [selectedTraitIds]
  );
  const allOriginBackgrounds = useMemo(
    () => [...hk1980sOriginBackgroundOptions, ...customOriginBackgrounds],
    [customOriginBackgrounds]
  );
  const selectedOriginBackground =
    allOriginBackgrounds.find((originBackground) => originBackground.originBackgroundId === originBackgroundId) ??
    hk1980sOriginBackgroundOptions[0];
  const selectedCantoneseFlavor =
    cantoneseFlavorProfiles.find((option) => option.id === cantoneseFlavor) ?? cantoneseFlavorProfiles[2];
  const selectedOpeningPressure =
    openingPressureOptions.find((option) => option.id === openingPressure) ?? openingPressureOptions[0];
  const selectedGameDifficulty =
    gameDifficultyProfiles.find((option) => option.id === gameDifficulty) ??
    gameDifficultyProfiles[2];
  const allCustomContentOptions = useMemo(
    () => [
      ...customContentLibrary.projects,
      ...customContentLibrary.events,
      ...customContentLibrary.characters
    ],
    [customContentLibrary]
  );
  const selectedCustomContentOptions = allCustomContentOptions.filter((option) =>
    selectedCustomContentKeys.includes(option.selection.selectionKey)
  );
  const prioritizedCustomContentOptions = selectedCustomContentOptions.filter(
    (option) =>
      prioritizedCustomContentKeys.includes(option.selection.selectionKey)
  );
  const selectedOpeningCustomSupport = allCustomContentOptions.find(
    (option) =>
      option.selection.selectionKey === openingCustomSupportSelectionKey
  );
  const compatibleCharacterTemplates = characterTemplates.filter(
    (template) =>
      template.worldpackId === OPENING_CHARACTER_TEMPLATE_WORLDPACK_ID
  );
  const activeCharacterTemplate =
    compatibleCharacterTemplates.find(
      (template) => template.id === activeCharacterTemplateId
    ) ?? null;
  const customCivilianOccupationMissing =
    currentIdentity === 'civilian' && civilianProfileId === 'custom_occupation' && customCivilianOccupation.trim().length === 0;
  const canGoNext = (stepIndex !== 3 || remainingPoints >= 0) && (stepIndex !== 2 || !customCivilianOccupationMissing);
  const canStartGame = remainingPoints >= 0 && !customCivilianOccupationMissing;

  function stopAttributeHold() {
    if (attributeHoldTimeoutRef.current !== null) {
      window.clearTimeout(attributeHoldTimeoutRef.current);
      attributeHoldTimeoutRef.current = null;
    }
    if (attributeHoldIntervalRef.current !== null) {
      window.clearInterval(attributeHoldIntervalRef.current);
      attributeHoldIntervalRef.current = null;
    }
  }

  useEffect(() => stopAttributeHold, []);

  useEffect(() => {
    let active = true;
    setCustomContentLibraryStatus('loading');
    void loadNewGameCustomContentLibrary({
      repository: customContentRepository,
      worldpackId: 'hk_1988'
    })
      .then((library) => {
        if (!active) return;
        setCustomContentLibrary(library);
        setCustomContentLibraryStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setCustomContentLibraryStatus('error');
      });
    return () => {
      active = false;
    };
  }, [customContentRepository]);

  function selectIdentity(identity: CurrentIdentity) {
    setCurrentIdentity(identity);
    setAppearance((current) =>
      Object.values(defaultAppearanceByIdentity).includes(current) ? defaultAppearanceByIdentity[identity] : current
    );
  }

  function selectRank(nextRankId: PoliceRankId) {
    const nextDepartments = getAllowedPoliceDepartments(nextRankId);
    const nextDepartment = nextDepartments.some((department) => department.id === departmentId)
      ? selectedDepartment
      : nextDepartments[0];
    const nextPostings = getAllowedPolicePostings(nextDepartment.id);
    const nextPosting = nextPostings.some((posting) => posting.id === postingId) ? selectedPosting : nextPostings[0];
    const nextRoles = getAllowedPoliceRoles(nextDepartment.id, nextRankId);

    setRankId(nextRankId);
    setDepartmentId(nextDepartment.id);
    setPostingId(nextPosting?.id ?? '');
    setRoleId(nextRoles[0]?.id ?? '');
  }

  function selectDepartment(nextDepartmentId: PoliceDepartmentId) {
    const nextPostings = getAllowedPolicePostings(nextDepartmentId);
    const nextPosting = nextPostings.some((posting) => posting.id === postingId) ? selectedPosting : nextPostings[0];
    const nextRoles = getAllowedPoliceRoles(nextDepartmentId, rankId);
    setDepartmentId(nextDepartmentId);
    setPostingId(nextPosting?.id ?? '');
    setRoleId(nextRoles[0]?.id ?? '');
  }

  function selectTriadRank(nextRankId: TriadRankId) {
    const nextRoles = getAllowedTriadRoles(nextRankId);
    setTriadRankId(nextRankId);
    setTriadRoleId((currentRoleId) =>
      nextRoles.some((role) => role.id === currentRoleId) ? currentRoleId : (nextRoles[0]?.id ?? '')
    );
  }

  function selectTriadSociety(nextSocietyId: string) {
    const nextTerritories = getAllowedTriadTerritories(nextSocietyId);
    const fallbackTerritory = getTriadTerritory(nextSocietyId, undefined);
    setTriadSocietyId(nextSocietyId);
    setTriadTerritoryPlaceId((currentPlaceId) =>
      nextTerritories.some((territory) => territory.placeId === currentPlaceId)
        ? currentPlaceId
        : fallbackTerritory.placeId
    );
  }

  function persistCustomOriginBackgrounds(nextOriginBackgrounds: OriginBackground[]) {
    setCustomOriginBackgrounds(nextOriginBackgrounds);
    localStorage.setItem(CUSTOM_ORIGIN_BACKGROUNDS_STORAGE_KEY, JSON.stringify(nextOriginBackgrounds));
  }

  function buildOpeningCharacterTemplateProfile(): OpeningCharacterTemplateProfile {
    const templateAge = resolveOpeningAgeDraft(ageDraft);
    const templateBirthYear = calculateBirthYear(
      templateAge,
      selectedScenario.time
    );
    const templateBirthDay = normalizeBirthDay(
      birthDay,
      getDaysInMonth(templateBirthYear, safeBirthMonth)
    );
    return {
      playerName,
      englishName,
      gender: gender === 'female' ? 'female' : 'male',
      age: templateAge,
      birthMonth: safeBirthMonth,
      birthDay: templateBirthDay,
      personality,
      appearance,
      cantoneseFlavor,
      policeNumber,
      currentIdentity,
      police:
        currentIdentity === 'police'
          ? {
              rankId,
              departmentId: selectedDepartment.id,
              postingId: selectedPosting?.id ?? '',
              roleId: selectedRole?.id ?? ''
            }
          : undefined,
      civilian:
        currentIdentity === 'civilian'
          ? {
              profileId: civilianProfileId,
              customOccupation: customCivilianOccupation,
              customEmployerName: customCivilianEmployerName,
              customPlaceId: selectedCustomCivilianPlace.placeId,
              customCommunitySummary: customCivilianCommunitySummary
            }
          : undefined,
      triad:
        currentIdentity === 'gang_member'
          ? {
              societyId: selectedTriadSociety.id,
              territoryPlaceId: selectedTriadTerritory.placeId,
              rankId: selectedTriadRank.id,
              roleId: selectedTriadRole.id
            }
          : undefined,
      originBackground: { ...selectedOriginBackground },
      attributePresetId: selectedPresetId,
      attributes: { ...attributes },
      traitIds: [...selectedTraitIds]
    };
  }

  function openCharacterTemplateDialog(
    mode: OpeningCharacterTemplateDialogMode
  ) {
    if (mode === 'save') commitAgeDraft();
    const refreshedTemplates = loadOpeningCharacterTemplates();
    setCharacterTemplates(refreshedTemplates);
    setCharacterTemplateName(
      activeCharacterTemplate?.label ||
        resolvedPlayerName ||
        '未命名人物'
    );
    setCharacterTemplateStatus('');
    setCharacterTemplateDialogMode(mode);
  }

  function saveCharacterTemplate(mode: 'copy' | 'update') {
    const label = characterTemplateName.trim();
    if (!label) {
      setCharacterTemplateStatus('请填写人物模板名称。');
      return;
    }
    commitAgeDraft();
    const targetId =
      mode === 'update' ? activeCharacterTemplate?.id : undefined;
    const templates = saveOpeningCharacterTemplate({
      ...(targetId ? { id: targetId } : {}),
      label,
      worldpackId: OPENING_CHARACTER_TEMPLATE_WORLDPACK_ID,
      profile: buildOpeningCharacterTemplateProfile()
    });
    const savedTemplate = targetId
      ? templates.find((template) => template.id === targetId)
      : templates[0];
    setCharacterTemplates(templates);
    setActiveCharacterTemplateId(savedTemplate?.id);
    setCharacterTemplateName(savedTemplate?.label ?? label);
    setCharacterTemplateStatus(
      targetId
        ? '当前人物模板已更新。'
        : '当前人物已另存为新模板。'
    );
  }

  function deleteCharacterTemplate(templateId: string) {
    const templates = deleteOpeningCharacterTemplate(templateId);
    setCharacterTemplates(templates);
    if (activeCharacterTemplateId === templateId) {
      setActiveCharacterTemplateId(undefined);
    }
    setCharacterTemplateStatus('人物模板已删除。');
  }

  function loadCharacterTemplate(template: OpeningCharacterTemplate) {
    if (
      template.worldpackId !== OPENING_CHARACTER_TEMPLATE_WORLDPACK_ID
    ) {
      setCharacterTemplateStatus(
        '该人物模板属于另一个世界包，不能在当前开局读取。'
      );
      return;
    }

    const profile = template.profile;
    if (profile.originBackground) {
      const isBuiltInOrigin = hk1980sOriginBackgroundOptions.some(
        (origin) =>
          origin.originBackgroundId ===
          profile.originBackground?.originBackgroundId
      );
      const isKnownCustomOrigin = customOriginBackgrounds.some(
        (origin) =>
          origin.originBackgroundId ===
          profile.originBackground?.originBackgroundId
      );
      if (!isBuiltInOrigin && !isKnownCustomOrigin) {
        persistCustomOriginBackgrounds([
          ...customOriginBackgrounds,
          profile.originBackground
        ]);
      }
      setOriginBackgroundId(profile.originBackground.originBackgroundId);
    }

    setCurrentIdentity(profile.currentIdentity);
    setPlayerName(profile.playerName);
    setEnglishName(profile.englishName);
    setGender(profile.gender);
    setAge(profile.age);
    setAgeDraft(String(profile.age));
    setBirthMonth(profile.birthMonth);
    setBirthDay(profile.birthDay);
    setPersonality(profile.personality);
    setAppearance(profile.appearance);
    setCantoneseFlavor(profile.cantoneseFlavor);
    setPoliceNumber(profile.policeNumber);

    if (profile.currentIdentity === 'police') {
      const nextRank =
        policeRankOptions.find(
          (option) => option.id === profile.police?.rankId
        ) ?? policeRankOptions[0];
      const nextDepartments = getAllowedPoliceDepartments(nextRank.id);
      const nextDepartment =
        nextDepartments.find(
          (option) => option.id === profile.police?.departmentId
        ) ?? nextDepartments[0];
      const nextPostings = getAllowedPolicePostings(nextDepartment.id);
      const nextPosting =
        nextPostings.find(
          (option) => option.id === profile.police?.postingId
        ) ?? nextPostings[0];
      const nextRoles = getAllowedPoliceRoles(
        nextDepartment.id,
        nextRank.id
      );
      const nextRole =
        nextRoles.find(
          (option) => option.id === profile.police?.roleId
        ) ?? nextRoles[0];
      setRankId(nextRank.id);
      setDepartmentId(nextDepartment.id);
      setPostingId(nextPosting?.id ?? '');
      setRoleId(nextRole?.id ?? '');
    } else if (profile.currentIdentity === 'civilian') {
      const nextCivilianProfileId = civilianOpeningProfileOptions.some(
        (option) => option.id === profile.civilian?.profileId
      )
        ? profile.civilian?.profileId
        : civilianOpeningProfileOptions[0].id;
      const nextCustomPlaceId = civilianCustomLocationOptions.some(
        (option) => option.placeId === profile.civilian?.customPlaceId
      )
        ? profile.civilian?.customPlaceId
        : civilianCustomLocationOptions[0].placeId;
      setCivilianProfileId(nextCivilianProfileId ?? civilianOpeningProfileOptions[0].id);
      setCustomCivilianOccupation(
        profile.civilian?.customOccupation ?? ''
      );
      setCustomCivilianEmployerName(
        profile.civilian?.customEmployerName ?? ''
      );
      setCustomCivilianPlaceId(
        nextCustomPlaceId ?? civilianCustomLocationOptions[0].placeId
      );
      setCustomCivilianCommunitySummary(
        profile.civilian?.customCommunitySummary ?? ''
      );
    } else {
      const nextSociety =
        triadSocietyOptions.find(
          (option) => option.id === profile.triad?.societyId
        ) ?? triadSocietyOptions[0];
      const nextTerritories = getAllowedTriadTerritories(nextSociety.id);
      const nextTerritory =
        nextTerritories.find(
          (option) =>
            option.placeId === profile.triad?.territoryPlaceId
        ) ?? nextTerritories[0];
      const nextRank =
        triadRankOptions.find(
          (option) => option.id === profile.triad?.rankId
        ) ?? triadRankOptions[0];
      const nextRoles = getAllowedTriadRoles(nextRank.id);
      const nextRole =
        nextRoles.find(
          (option) => option.id === profile.triad?.roleId
        ) ?? nextRoles[0];
      setTriadSocietyId(nextSociety.id);
      setTriadTerritoryPlaceId(nextTerritory?.placeId ?? '');
      setTriadRankId(nextRank.id);
      setTriadRoleId(nextRole?.id ?? '');
    }

    setSelectedPresetId(
      attributePresets.some(
        (preset) => preset.id === profile.attributePresetId
      )
        ? profile.attributePresetId
        : 'custom'
    );
    setAttributes({ ...profile.attributes });
    setSelectedTraitIds(
      profile.traitIds.filter((traitId) =>
        openingTraits.some((trait) => trait.traitId === traitId)
      )
    );
    setOriginEditorMode('closed');
    setEditingOriginBackgroundId(null);
    setOriginDraftError('');
    setActiveCharacterTemplateId(template.id);
    setCharacterTemplateName(template.label);
    setCharacterTemplateDialogMode(undefined);
    setCharacterTemplateStatus(
      `已读取人物模板“${template.label}”；世界、剧本与戏剧化开局未改变。`
    );
    setStepIndex(2);
  }

  function startNewOriginBackground() {
    setOriginEditorMode('new');
    setEditingOriginBackgroundId(null);
    setOriginDraft(emptyOriginBackgroundDraft());
    setOriginDraftError('');
  }

  function startEditOriginBackground(originBackground: OriginBackground) {
    setOriginEditorMode('edit');
    setEditingOriginBackgroundId(originBackground.originBackgroundId);
    setOriginDraft({
      name: originBackground.name,
      definition: originBackground.definition,
      backgroundSummary: originBackground.backgroundSummary
    });
    setOriginDraftError('');
  }

  function deleteCustomOriginBackground(originBackgroundIdToDelete: string) {
    const nextOriginBackgrounds = customOriginBackgrounds.filter(
      (originBackground) => originBackground.originBackgroundId !== originBackgroundIdToDelete
    );
    persistCustomOriginBackgrounds(nextOriginBackgrounds);
    if (originBackgroundId === originBackgroundIdToDelete) {
      setOriginBackgroundId(hk1980sOriginBackgroundOptions[0].originBackgroundId);
    }
    if (editingOriginBackgroundId === originBackgroundIdToDelete) {
      setOriginEditorMode('closed');
      setEditingOriginBackgroundId(null);
      setOriginDraft(emptyOriginBackgroundDraft());
      setOriginDraftError('');
    }
  }

  function saveOriginBackgroundDraft() {
    const name = originDraft.name.trim();
    const definition = originDraft.definition.trim();
    const backgroundSummary = originDraft.backgroundSummary.trim();

    if (!name || !definition || !backgroundSummary) {
      setOriginDraftError('名称、成长环境和早年牵连都需要填写。');
      return;
    }

    if (originEditorMode === 'edit' && editingOriginBackgroundId) {
      const nextOriginBackgrounds = customOriginBackgrounds.map((originBackground) =>
        originBackground.originBackgroundId === editingOriginBackgroundId
          ? { ...originBackground, name, definition, backgroundSummary }
          : originBackground
      );
      persistCustomOriginBackgrounds(nextOriginBackgrounds);
      setOriginBackgroundId(editingOriginBackgroundId);
    } else {
      const nextOriginBackground: OriginBackground = {
        originBackgroundId: createCustomOriginBackgroundId(),
        name,
        definition,
        backgroundSummary
      };
      persistCustomOriginBackgrounds([...customOriginBackgrounds, nextOriginBackground]);
      setOriginBackgroundId(nextOriginBackground.originBackgroundId);
    }

    setOriginEditorMode('closed');
    setEditingOriginBackgroundId(null);
    setOriginDraft(emptyOriginBackgroundDraft());
    setOriginDraftError('');
  }

  function updateAttribute(key: keyof AttributeBlock, value: number) {
    setSelectedPresetId('custom');
    setAttributes((current) => ({
      ...current,
      [key]: Math.max(30, Math.min(80, Number.isNaN(value) ? current[key] : value))
    }));
  }

  function adjustAttribute(key: keyof AttributeBlock, delta: number) {
    setSelectedPresetId('custom');
    setAttributes((current) => applyAttributeDelta(current, key, delta));
  }

  function startAttributeHold(key: keyof AttributeBlock, delta: number) {
    stopAttributeHold();
    attributeHoldTimeoutRef.current = window.setTimeout(() => {
      adjustAttribute(key, delta);
      attributeHoldIntervalRef.current = window.setInterval(() => {
        adjustAttribute(key, delta);
      }, attributeHoldRepeatMs);
    }, attributeHoldDelayMs);
  }

  function handlePreset(preset: AttributePreset) {
    stopAttributeHold();
    setSelectedPresetId(preset.id);
    setAttributes(preset.attributes);
  }

  function toggleTrait(traitId: string) {
    setSelectedTraitIds((current) => {
      if (current.includes(traitId)) return current.filter((id) => id !== traitId);
      if (current.length >= maxOpeningTraits) return current;
      return [...current, traitId];
    });
  }

  function updateBirthDayForAge(nextAge: number) {
    const nextBirthYear = calculateBirthYear(nextAge, selectedScenario.time);
    setBirthDay((current) => normalizeBirthDay(current, getDaysInMonth(nextBirthYear, safeBirthMonth)));
  }

  function updateAgeDraft(value: string) {
    if (!/^\d*$/.test(value)) return;
    setAgeDraft(value);
    const nextAge = readValidOpeningAgeDraft(value);
    if (nextAge === undefined) return;
    setAge(nextAge);
    updateBirthDayForAge(nextAge);
  }

  function commitAgeDraft(): number {
    const nextAge = resolveOpeningAgeDraft(ageDraft);
    setAge(nextAge);
    setAgeDraft(String(nextAge));
    updateBirthDayForAge(nextAge);
    return nextAge;
  }

  function navigateToStep(nextStepIndex: number) {
    if (stepIndex === 2 && nextStepIndex !== 2) {
      commitAgeDraft();
    }
    setStepIndex(
      Math.max(0, Math.min(openingSteps.length - 1, nextStepIndex))
    );
  }

  function updateBirthMonth(value: string) {
    const nextMonth = normalizeBirthMonth(Number(value));
    setBirthMonth(nextMonth);
    setBirthDay((current) => normalizeBirthDay(current, getDaysInMonth(derivedBirthYear, nextMonth)));
  }

  function createLawIdentitySetup(): OpeningSetup['lawIdentity'] | undefined {
    if (currentIdentity !== 'police') return undefined;

    const rank = getPoliceRank(rankId);
    const department = getPoliceDepartment(selectedDepartment.id);
    const role = selectedRole ?? getPoliceRole(roleId);
    const posting = selectedPosting ?? getPolicePosting(postingId);

    return {
      stationOrPost: posting.label,
      department: department.label,
      rank: rank.label,
      assignmentSummary: role.label,
      authoritySummary: role.authoritySummary,
      accessSummary: role.accessSummary,
      dutySummary: role.dutySummary
    };
  }

  function toggleCustomContent(option: NewGameCustomContentOption) {
    const key = option.selection.selectionKey;
    const selected = selectedCustomContentKeys.includes(key);
    if (selected) {
      setSelectedCustomContentKeys((current) =>
        current.filter((item) => item !== key)
      );
      setPrioritizedCustomContentKeys((current) =>
        current.filter((item) => item !== key)
      );
      if (openingCustomSupportSelectionKey === key) {
        setOpeningCustomSupportSelectionKey(undefined);
      }
      setCustomContentNotice(null);
      return;
    }
    const effectiveTargetKey =
      option.selection.kind === 'content_project'
        ? `event_group:${option.selection.focusEventGroupId}:${option.selection.focusEventGroupRevision}`
        : `${option.selection.kind}:${option.selection.assetId}:${option.selection.revision}`;
    const duplicatesExistingTarget = selectedCustomContentOptions.some(
      (selectedOption) => {
        const selectedTargetKey =
          selectedOption.selection.kind === 'content_project'
            ? `event_group:${selectedOption.selection.focusEventGroupId}:${selectedOption.selection.focusEventGroupRevision}`
            : `${selectedOption.selection.kind}:${selectedOption.selection.assetId}:${selectedOption.selection.revision}`;
        return selectedTargetKey === effectiveTargetKey;
      }
    );
    if (duplicatesExistingTarget) {
      setCustomContentNotice(
        '同一个焦点事件不能同时通过内容项目和事件组重复选择。'
      );
      return;
    }
    if (
      selectedCustomContentKeys.length >=
      MAX_NEW_GAME_CUSTOM_CONTENT_SELECTIONS
    ) {
      setCustomContentNotice(
        `每个存档最多启用 ${MAX_NEW_GAME_CUSTOM_CONTENT_SELECTIONS} 项自定义内容。`
      );
      return;
    }
    const requiresOpeningAdaptation = option.deploymentMode !== 'native';
    if (
      requiresOpeningAdaptation &&
      prioritizedCustomContentKeys.length >=
        MAX_NEW_GAME_CUSTOM_CONTENT_PRIORITIES
    ) {
      setCustomContentNotice(
        `需要世界适配的内容必须设为本局重点；本局重点最多 ${MAX_NEW_GAME_CUSTOM_CONTENT_PRIORITIES} 项，避免批量 AI 适配阻塞开局。`
      );
      return;
    }
    setSelectedCustomContentKeys((current) => [...current, key]);
    if (
      requiresOpeningAdaptation ||
      prioritizedCustomContentKeys.length <
        MAX_NEW_GAME_CUSTOM_CONTENT_PRIORITIES
    ) {
      setPrioritizedCustomContentKeys((current) => [...current, key]);
    }
    setCustomContentNotice(null);
  }

  function toggleCustomContentPriority(option: NewGameCustomContentOption) {
    const key = option.selection.selectionKey;
    const prioritized = prioritizedCustomContentKeys.includes(key);
    if (prioritized) {
      if (option.deploymentMode !== 'native') {
        setCustomContentNotice(
          '需要世界适配的内容必须保持为本局重点，才能在开局前完成一次明确适配。'
        );
        return;
      }
      setPrioritizedCustomContentKeys((current) =>
        current.filter((item) => item !== key)
      );
      if (openingCustomSupportSelectionKey === key) {
        setOpeningCustomSupportSelectionKey(undefined);
      }
      setCustomContentNotice(null);
      return;
    }
    if (
      prioritizedCustomContentKeys.length >=
      MAX_NEW_GAME_CUSTOM_CONTENT_PRIORITIES
    ) {
      setCustomContentNotice(
        `每个存档最多设置 ${MAX_NEW_GAME_CUSTOM_CONTENT_PRIORITIES} 项本局重点内容。`
      );
      return;
    }
    setPrioritizedCustomContentKeys((current) => [...current, key]);
    setCustomContentNotice(null);
  }

  function createSetup(): OpeningSetup {
    const setupAge = resolveOpeningAgeDraft(ageDraft);
    return {
      playerName: resolvedPlayerName || undefined,
      englishName: englishName.trim() || undefined,
      gender,
      age: setupAge,
      birthDate: calculateBirthDate(
        setupAge,
        selectedScenario.time,
        safeBirthMonth,
        birthDay
      ),
      policeNumber: currentIdentity === 'police' && policeNumber.length === 4 ? policeNumber : undefined,
      currentIdentity,
      policePostingId: currentIdentity === 'police' ? postingId : undefined,
      civilianProfileId: currentIdentity === 'civilian' ? civilianProfileId : undefined,
      civilianCustomProfile:
        currentIdentity === 'civilian' && civilianProfileId === 'custom_occupation'
          ? {
              publicOccupation: customCivilianOccupation.trim(),
              workplacePlaceId: civilianCustomProfile.workplacePlaceId,
              workplaceLabel: civilianCustomProfile.workplaceLabel,
              ...(customCivilianEmployerName.trim() ? { employerName: customCivilianEmployerName.trim() } : {}),
              communitySummary: customCivilianCommunitySummary.trim() || undefined
            }
          : undefined,
      triadSocietyId: currentIdentity === 'gang_member' ? selectedTriadSociety.id : undefined,
      triadTerritoryPlaceId: currentIdentity === 'gang_member' ? selectedTriadTerritory.placeId : undefined,
      triadRankId: currentIdentity === 'gang_member' ? selectedTriadRank.id : undefined,
      triadRoleId: currentIdentity === 'gang_member' ? selectedTriadRole.id : undefined,
      triadProfileId: undefined,
      originBackground: selectedOriginBackground,
      personality,
      appearance,
      cantoneseFlavor,
      startTime: selectedScenario.time,
      storypackInfluence,
      screenCharacterSeedsEnabled,
      dramaticOpeningId: dramaticOpeningEnabled ? dramaticOpeningId : undefined,
      customContentSelections: selectedCustomContentOptions.map((option) => ({
        ...option.selection,
        prioritized: prioritizedCustomContentKeys.includes(
          option.selection.selectionKey
        )
      })),
      openingCustomSupportSelectionKey: dramaticOpeningEnabled
        ? openingCustomSupportSelectionKey
        : undefined,
      lawIdentity: createLawIdentitySetup(),
      attributes,
      traits: selectedTraits,
      openingPressure,
      gameDifficulty,
      openingNote,
      officialDlcIds
    };
  }

  function handleStartGameRequest() {
    commitAgeDraft();
    if (hasAcceptedOpeningLegalDisclaimer()) {
      onStartGame(createSetup());
      return;
    }

    setIsLegalDisclaimerOpen(true);
  }

  function handleAcceptLegalDisclaimer() {
    recordOpeningLegalDisclaimerAcceptance();
    setIsLegalDisclaimerOpen(false);
    onStartGame(createSetup());
  }

  function renderCommonProfileFields() {
    return (
      <div className="profile-basic-grid">
        <div className="profile-basic-left">
          <div className="profile-name-row">
            <label className="opening-field">
              玩家姓名
              <input aria-label="玩家姓名" value={playerName} onChange={(event) => setPlayerName(event.target.value)} />
            </label>
            <label className="opening-field">
              英文名
              <input
                aria-label="英文名"
                placeholder="留空后按中文名生成"
                title="留空则按中文名、性别和80-90年代香港习惯生成"
                value={englishName}
                onChange={(event) => setEnglishName(event.target.value)}
              />
            </label>
          </div>
          <div className="profile-inline-row profile-inline-row--birth">
            <label className="opening-field profile-field--gender">
              性别
              <select aria-label="性别" value={gender} onChange={(event) => setGender(event.target.value as OpeningSetup['gender'])}>
                <option value="male">男性</option>
                <option value="female">女性</option>
              </select>
            </label>
            <label className="opening-field profile-field--age">
              年龄
              <input
                aria-label="年龄"
                type="number"
                inputMode="numeric"
                min={minOpeningAge}
                max={maxOpeningAge}
                step={1}
                value={ageDraft}
                onChange={(event) => updateAgeDraft(event.target.value)}
                onBlur={commitAgeDraft}
              />
              <small className="field-note">可输入 16–90 岁的整数。</small>
            </label>
            <label className="opening-field profile-field--birth-month">
              出生月
              <select aria-label="出生月" value={safeBirthMonth} onChange={(event) => updateBirthMonth(event.target.value)}>
                {birthMonthOptions.map((month) => (
                  <option key={month} value={month}>
                    {month}月
                  </option>
                ))}
              </select>
            </label>
            <label className="opening-field profile-field--birth-day">
              出生日
              <select aria-label="出生日" value={safeBirthDay} onChange={(event) => setBirthDay(Number(event.target.value))}>
                {birthDayOptions.map((day) => (
                  <option key={day} value={day}>
                    {day}日
                  </option>
                ))}
              </select>
            </label>
            <small className="field-note profile-birth-date-note">推导出生日期：{derivedBirthDate}</small>
          </div>
          {currentIdentity === 'police' ? (
            <label className="opening-field">
              警员编号
              <input
                aria-label="警员编号"
                inputMode="numeric"
                placeholder="如 9527"
                value={policeNumber}
                onChange={(event) => setPoliceNumber(normalizePoliceNumberInput(event.target.value))}
              />
              <small className="field-note">四位数字；不填则开局生成。</small>
            </label>
          ) : (
            <div className="profile-note profile-note--compact">
              <strong>{currentIdentity === 'civilian' ? selectedCivilianProfile.publicOccupation : selectedTriadProfile.roleTitle}</strong>
              <p>
                {currentIdentity === 'civilian'
                  ? selectedCivilianProfile.workplaceLabel
                  : `${selectedTriadProfile.societyName} · ${selectedTriadProfile.territorySummary}`}
              </p>
            </div>
          )}
        </div>
        <div className="profile-basic-right">
          <label className="opening-field">
            样貌
            <textarea aria-label="样貌" value={appearance} onChange={(event) => setAppearance(event.target.value)} />
          </label>
          <label className="opening-field">
            性格
            <textarea aria-label="性格" value={personality} onChange={(event) => setPersonality(event.target.value)} />
          </label>
        </div>
      </div>
    );
  }

  function renderOriginBackgroundPanel() {
    return (
      <section className="origin-background-panel" aria-label="出身与背景">
        <div className="origin-background-header">
          <div>
            <h3>出身与背景</h3>
            <p className="muted">选择一个最接近你早年经历的出身轮廓，它会成为角色亲属、住所和人际牵连的底色。</p>
          </div>
          <button type="button" onClick={startNewOriginBackground}>
            新建自定义
          </button>
        </div>

        <div className="origin-card-scroll">
          {allOriginBackgrounds.map((originBackground) => {
            const isCustom = customOriginBackgrounds.some(
              (customOriginBackground) => customOriginBackground.originBackgroundId === originBackground.originBackgroundId
            );

            return (
              <article
                key={originBackground.originBackgroundId}
                className={
                  originBackground.originBackgroundId === selectedOriginBackground.originBackgroundId
                    ? 'origin-card active'
                    : 'origin-card'
                }
              >
                <button
                  type="button"
                  className="origin-select-button"
                  aria-label={`选择${originBackground.name}`}
                  onClick={() => setOriginBackgroundId(originBackground.originBackgroundId)}
                >
                  <strong>{originBackground.name}</strong>
                  <span>成长环境</span>
                  <p>{originBackground.definition}</p>
                  <span>早年牵连</span>
                  <p>{originBackground.backgroundSummary}</p>
                </button>
                {isCustom ? (
                  <div className="origin-card-actions">
                    <button type="button" aria-label={`编辑${originBackground.name}`} onClick={() => startEditOriginBackground(originBackground)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      aria-label={`删除${originBackground.name}`}
                      onClick={() => deleteCustomOriginBackground(originBackground.originBackgroundId)}
                    >
                      删除
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        {originEditorMode !== 'closed' ? (
          <section className="origin-editor" aria-label="自定义出身编辑">
            <label>
              自定义名称
              <input
                aria-label="自定义名称"
                value={originDraft.name}
                onChange={(event) => setOriginDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              成长环境
              <textarea
                aria-label="成长环境"
                value={originDraft.definition}
                onChange={(event) => setOriginDraft((current) => ({ ...current, definition: event.target.value }))}
              />
            </label>
            <label>
              早年牵连
              <textarea
                aria-label="早年牵连"
                value={originDraft.backgroundSummary}
                onChange={(event) => setOriginDraft((current) => ({ ...current, backgroundSummary: event.target.value }))}
              />
            </label>
            {originDraftError ? <p className="opening-warning">{originDraftError}</p> : null}
            <div className="origin-editor-actions">
              <button type="button" onClick={saveOriginBackgroundDraft}>
                保存自定义出身
              </button>
              <button
                type="button"
                onClick={() => {
                  setOriginEditorMode('closed');
                  setEditingOriginBackgroundId(null);
                  setOriginDraft(emptyOriginBackgroundDraft());
                  setOriginDraftError('');
                }}
              >
                取消
              </button>
            </div>
          </section>
        ) : null}
      </section>
    );
  }

  function renderCustomContentGroup(
    title: string,
    options: NewGameCustomContentOption[]
  ) {
    if (options.length === 0) return null;
    return (
      <section className="opening-custom-content-group" aria-label={title}>
        <h4>{title}</h4>
        <div className="opening-custom-content-grid">
          {options.map((option) => {
            const key = option.selection.selectionKey;
            const isSelected = selectedCustomContentKeys.includes(key);
            const isPrioritized = prioritizedCustomContentKeys.includes(key);
            const isOpeningSupport =
              openingCustomSupportSelectionKey === key;
            return (
              <article
                key={key}
                className={
                  isSelected
                    ? 'opening-custom-content-card selected'
                    : 'opening-custom-content-card'
                }
              >
                <label>
                  <input
                    type="checkbox"
                    aria-label={`本局选择${option.title}`}
                    checked={isSelected}
                    onChange={() => toggleCustomContent(option)}
                  />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.summary}</small>
                    {option.projectTitle ? (
                      <small>所属项目：{option.projectTitle}</small>
                    ) : null}
                    {option.focusTitle ? (
                      <small>当前焦点事件组：{option.focusTitle}</small>
                    ) : null}
                  </span>
                  <span className="opening-custom-content-badges">
                    <em>
                      {option.deploymentMode === 'native'
                        ? '原生适配'
                        : '开局前生成适配'}
                    </em>
                    {option.defaultEnabledForNewGame ? (
                      <em>新游戏推荐</em>
                    ) : null}
                  </span>
                </label>
                {isSelected ? (
                  <label className="opening-custom-priority-choice">
                    <input
                      type="checkbox"
                      aria-label={`将${option.title}设为本局重点`}
                      checked={isPrioritized}
                      disabled={
                        option.deploymentMode !== 'native' && isPrioritized
                      }
                      onChange={() => toggleCustomContentPriority(option)}
                    />
                    <span>
                      本局重点（尽快登场）
                      {option.deploymentMode !== 'native' ? (
                        <small>需要世界适配，必须占用一个重点名额</small>
                      ) : null}
                    </span>
                  </label>
                ) : null}
                {isSelected && isPrioritized && dramaticOpeningEnabled ? (
                  <label className="opening-custom-support-choice">
                    <input
                      type="radio"
                      name="opening-custom-support"
                      aria-label={`将${option.title}用于第一幕支持`}
                      checked={isOpeningSupport}
                      onChange={() =>
                        setOpeningCustomSupportSelectionKey(key)
                      }
                    />
                    第一幕支持
                  </label>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderCustomContentSelection() {
    const optionCount = allCustomContentOptions.length;
    return (
      <section
        className="opening-custom-content-selection"
        aria-label="本局自定义内容"
      >
        <header>
          <div>
            <h3>本局自定义内容</h3>
            <p>
              可启用多项已发布 revision；最多 3 项设为本局重点，其余原生内容只作为自然登场候选，不会挤进开局生成。
            </p>
          </div>
          <strong aria-label="本局自定义内容选择数量">
            已启用 {selectedCustomContentKeys.length}/
            {MAX_NEW_GAME_CUSTOM_CONTENT_SELECTIONS} · 本局重点{' '}
            {prioritizedCustomContentKeys.length}/
            {MAX_NEW_GAME_CUSTOM_CONTENT_PRIORITIES}
          </strong>
        </header>
        {customContentLibraryStatus === 'loading' ? (
          <p className="muted" role="status">
            正在读取香港 1988 可用内容……
          </p>
        ) : null}
        {customContentLibraryStatus === 'error' ? (
          <p className="opening-warning" role="alert">
            本地自定义内容库读取失败；你仍可不选内容并继续开局。
          </p>
        ) : null}
        {customContentLibraryStatus === 'ready' && optionCount === 0 ? (
          <p className="muted">
            当前没有已审核、已启用并投放到香港 1988 的人物、事件组或内容项目。
          </p>
        ) : null}
        {renderCustomContentGroup('内容项目', customContentLibrary.projects)}
        {renderCustomContentGroup('事件组', customContentLibrary.events)}
        {renderCustomContentGroup('人物', customContentLibrary.characters)}
        {customContentNotice ? (
          <p className="opening-warning" role="alert">
            {customContentNotice}
          </p>
        ) : null}
        {selectedCustomContentKeys.length > 0 ? (
          <div className="opening-custom-content-routing">
            {dramaticOpeningEnabled ? (
              <>
                <p>
                  第一幕最多使用一项“本局重点”作为支持；其余已启用内容不会注入第一幕，开局结构仍以当前戏剧化开局为主来源。
                </p>
                <button
                  type="button"
                  className={
                    openingCustomSupportSelectionKey ? '' : 'selected'
                  }
                  onClick={() =>
                    setOpeningCustomSupportSelectionKey(undefined)
                  }
                >
                  第一幕不使用自定义支持
                </button>
              </>
            ) : (
              <p>
                戏剧化开局关闭：所选内容不会改写自然第一幕。最多 3 项本局重点会尽快寻找合理入口，其余原生内容按场景和关系自然候选。
              </p>
            )}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <main className="opening-screen">
      <section className="opening-shell" aria-label="开局向导">
        <header className="opening-header">
          <div>
            <p className="home-kicker">Hong Kong 1980-1996</p>
            <h1>开局向导</h1>
            <p className="muted">分页确认剧本时代、身份、基础档案、能力特质和开局要求。</p>
          </div>
          <button type="button" onClick={onBack}>
            返回首页
          </button>
        </header>

        <div className="opening-layout">
          <aside className="opening-sidebar">
            <nav className="opening-step-list" aria-label="开局步骤">
              {openingSteps.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  className={index === stepIndex ? 'active' : ''}
                  aria-current={index === stepIndex ? 'step' : undefined}
                  onClick={() => navigateToStep(index)}
                >
                  {String(index + 1).padStart(2, '0')} {step}
                </button>
              ))}
            </nav>
            <section
              className="opening-template-tools"
              aria-label="开局人物模板"
            >
              <p>人物模板</p>
              <div>
                <button
                  type="button"
                  onClick={() => openCharacterTemplateDialog('save')}
                >
                  保存人物
                </button>
                <button
                  type="button"
                  aria-label="读取人物"
                  onClick={() => openCharacterTemplateDialog('load')}
                >
                  读取人物
                  {compatibleCharacterTemplates.length > 0 ? (
                    <span>{compatibleCharacterTemplates.length}</span>
                  ) : null}
                </button>
              </div>
              {characterTemplateStatus ? (
                <small role="status">{characterTemplateStatus}</small>
              ) : null}
            </section>
          </aside>

          <section className={stepIndex === 1 ? 'opening-page opening-page-stretch' : 'opening-page'}>
            {stepIndex === 0 ? (
              <>
                <h2>世界与剧本</h2>
                <section className="worldpack-setup-row" aria-label="世界包与剧情包设置">
                  <div className="worldpack-card">
                    <div>
                      <strong>1980-1996 香港</strong>
                      <p>港英后期高密度城市：制度、金钱、人情、媒体、社团与家庭压力共存。</p>
                    </div>
                    <span>官方世界包</span>
                  </div>
                  <label className="opening-field storypack-strength-field worldpack-toggle-field">
                    影视角色入世
                    <span className="opening-toggle-line">
                      <input
                        type="checkbox"
                        aria-label="影视角色入世"
                        checked={screenCharacterSeedsEnabled}
                        onChange={(event) => setScreenCharacterSeedsEnabled(event.target.checked)}
                      />
                      <strong>{screenCharacterSeedsEnabled ? '开启' : '关闭'}</strong>
                    </span>
                    <small>仅允许影视角色作为候选 NPC 入世；不会复演原作剧情。</small>
                  </label>
                  <label className="opening-field storypack-strength-field">
                    剧情素材影响
                    <select
                      aria-label="剧情素材影响"
                      value={storypackInfluence}
                      onChange={(event) => setStorypackInfluence(event.target.value as OpeningSetup['storypackInfluence'])}
                    >
                      <option value="off">关闭</option>
                      <option value="low">低</option>
                      <option value="medium">中</option>
                      <option value="high">高</option>
                    </select>
                  </label>
                </section>
                <div className="scenario-card-grid">
                  {hk1980sOpeningScenarios.map((scenario) => {
                    const isSelected = scenario.id === scenarioId;
                    const year = scenarioYearMap[scenario.id];
                    return (
                      <button
                        key={scenario.id}
                        type="button"
                        aria-label={scenario.title}
                        className={isSelected ? `story-card story-card--${year} selected` : `story-card story-card--${year}`}
                        onClick={() => setScenarioId(scenario.id)}
                      >
                        <img className="story-card__bg" src={scenarioImageMap[scenario.id]} alt="" />
                        <div className="story-card__glow" />
                        <div className="story-card__overlay" />
                        <div className="story-card__content">
                          <span className="story-card__date">{scenario.dateLabel}</span>
                          <strong>{scenario.title}</strong>
                          <p>{scenario.summary}</p>
                          <div className="scenario-card-detail">{scenario.detail}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {stepIndex === 1 ? (
              <>
                <h2>身份选择</h2>
                <p className="muted">这里先决定你从什么社会位置进入香港。后续剧情可以改变身份，但开局只需要一个清晰入口。</p>
                <div className="identity-choice-grid">
                  {identityOpeningOptions.map((identity) => {
                    const isSelected = identity.id === currentIdentity;
                    return (
                      <button
                        key={identity.id}
                        type="button"
                        aria-label={identity.title}
                        className={isSelected
                          ? `identity-card identity-card--${identity.id} selected`
                          : `identity-card identity-card--${identity.id}`}
                        onClick={() => selectIdentity(identity.id)}
                      >
                        <div className="identity-card__glow" />
                        <img className="identity-card__figure" src={identityImageMap[identity.id]} alt="" />
                        <div className="identity-card__shade" />
                        <div className="identity-card__content">
                          <h3>{identity.title}</h3>
                          <p>{identity.summary}</p>
                          <small>{identity.detail}</small>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {stepIndex === 2 ? (
              <>
                <h2>基础档案</h2>
                <div className="opening-profile-layout">
                  <div className="profile-left-stack">
                    {renderCommonProfileFields()}
                    {currentIdentity === 'police' ? (
                      <div className="opening-form-grid">
                        <label className="opening-field">
                          警阶
                          <select aria-label="警阶" value={rankId} onChange={(event) => selectRank(event.target.value as PoliceRankId)}>
                            {policeRankOptions.map((rank) => (
                              <option key={rank.id} value={rank.id}>
                                {rank.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="opening-field">
                          部门
                          <select
                            aria-label="部门"
                            value={selectedDepartment.id}
                            onChange={(event) => selectDepartment(event.target.value as PoliceDepartmentId)}
                          >
                            {allowedDepartments.map((department) => (
                              <option key={department.id} value={department.id}>
                                {department.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="opening-field">
                          驻点
                          <select aria-label="驻点" value={selectedPosting?.id ?? ''} onChange={(event) => setPostingId(event.target.value)}>
                            {allowedPostings.map((posting) => (
                              <option key={posting.id} value={posting.id}>
                                {posting.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="opening-field">
                          岗位
                          <select aria-label="岗位" value={selectedRole?.id ?? ''} onChange={(event) => setRoleId(event.target.value)}>
                            {allowedRoles.map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : currentIdentity === 'civilian' ? (
                      <fieldset className="opening-identity-profile-panel">
                        <legend>市民生活档案</legend>
                        <p className="field-note">选择工作、无业或自定义生活入口；它会成为后续家庭、街坊、警队和社团关系的出身层。</p>
                        <div className="opening-identity-profile-groups">
                          {civilianOccupationGroups.map((group) => (
                            <section key={group.id} className="opening-identity-profile-group" aria-label={group.label}>
                              <header>
                                <h4>{group.label}</h4>
                                <p>{group.summary}</p>
                              </header>
                              <div className="opening-identity-profile-grid">
                                {civilianOpeningProfileOptions
                                  .filter((profile) => profile.occupationGroup === group.id)
                                  .map((profile) => (
                                    <button
                                      key={profile.id}
                                      type="button"
                                      aria-label={profile.label}
                                      className={profile.id === civilianProfileId ? 'opening-choice active' : 'opening-choice'}
                                      onClick={() => setCivilianProfileId(profile.id)}
                                    >
                                      <strong>{profile.label}</strong>
                                      <span>{profile.employerName ?? profile.workplaceLabel}</span>
                                      <p>{profile.communitySummary}</p>
                                    </button>
                                  ))}
                              </div>
                            </section>
                          ))}
                        </div>
                        {civilianProfileId === 'custom_occupation' ? (
                          <section className="opening-custom-profile-editor" aria-label="自定义市民职业">
                            <label className="opening-field">
                              自定义职业
                              <input
                                aria-label="自定义职业"
                                placeholder="例如：私家侦探助理、自由摄影师"
                                value={customCivilianOccupation}
                                onChange={(event) => setCustomCivilianOccupation(event.target.value)}
                              />
                            </label>
                            <label className="opening-field">
                              雇主／经营机构（可选）
                              <input
                                aria-label="自定义职业雇主"
                                placeholder="例如：明光摄影社；自由职业可留空"
                                value={customCivilianEmployerName}
                                onChange={(event) => setCustomCivilianEmployerName(event.target.value)}
                              />
                              <small className="field-note">
                                如需建立正式工作关系，请在这里填写雇主／经营机构；只写在背景描述中的机构不会自动建档。留空时会改用朋友、邻居、房东或街坊等普通社会关系。
                              </small>
                            </label>
                            <label className="opening-field">
                              工作／日常地点
                              <select
                                aria-label="自定义职业地点"
                                value={selectedCustomCivilianPlace.placeId}
                                onChange={(event) => setCustomCivilianPlaceId(event.target.value)}
                              >
                                {civilianCustomLocationOptions.map((option) => (
                                  <option key={option.placeId} value={option.placeId}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="opening-field opening-custom-profile-editor__wide">
                              职业接触面（可选）
                              <textarea
                                aria-label="自定义职业接触面"
                                placeholder="例如：经常接触记者、冲印店老板和夜场宣传人员。"
                                value={customCivilianCommunitySummary}
                                onChange={(event) => setCustomCivilianCommunitySummary(event.target.value)}
                              />
                            </label>
                            {customCivilianOccupationMissing ? (
                              <p className="opening-warning opening-custom-profile-editor__wide">请填写自定义职业后再继续。</p>
                            ) : null}
                          </section>
                        ) : null}
                      </fieldset>
                    ) : (
                      <fieldset className="opening-identity-profile-panel">
                        <legend>社团身份档案</legend>
                        <p className="field-note">
                          像警察开局一样分别选择字头、活动区域、层级与职务；一个字头可有多条地区活动线。可选至地区中层骨干，但不开放叔伯辈、坐馆或话事人。
                        </p>
                        <div className="opening-form-grid triad-opening-selectors">
                          <label className="opening-field">
                            社团字头
                            <select aria-label="社团字头" value={selectedTriadSociety.id} onChange={(event) => selectTriadSociety(event.target.value)}>
                              {triadSocietyOptions.map((society) => (
                                <option key={society.id} value={society.id}>
                                  {society.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="opening-field">
                            活动区域
                            <select
                              aria-label="社团活动区域"
                              value={selectedTriadTerritory.placeId}
                              onChange={(event) => setTriadTerritoryPlaceId(event.target.value)}
                            >
                              {allowedTriadTerritories.map((territory) => (
                                <option key={territory.placeId} value={territory.placeId}>
                                  {territory.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="opening-field">
                            社团层级
                            <select
                              aria-label="社团层级"
                              value={selectedTriadRank.id}
                              onChange={(event) => selectTriadRank(event.target.value as TriadRankId)}
                            >
                              {triadRankOptions.map((rank) => (
                                <option key={rank.id} value={rank.id}>
                                  {rank.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="opening-field">
                            社团职务
                            <select aria-label="社团职务" value={selectedTriadRole.id} onChange={(event) => setTriadRoleId(event.target.value)}>
                              {allowedTriadRoles.map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="triad-opening-preview" aria-label="社团身份权限预览">
                          <strong>{selectedTriadProfile.label}</strong>
                          <span><b>字头网络：</b>{selectedTriadSociety.networkSummary}</span>
                          <span><b>活动区域：</b>{selectedTriadProfile.territorySummary}</span>
                          <p>{selectedTriadRole.summary}</p>
                          <p><b>权限边界：</b>{selectedTriadRank.authoritySummary}</p>
                          <p><b>风险：</b>{selectedTriadProfile.riskSummary}</p>
                        </div>
                      </fieldset>
                    )}
                    <fieldset className="cantonese-flavor-panel">
                      <legend>粤语风味</legend>
                      <p className="field-note">控制人物对白里粤语和港式口吻的比例，会写入开局提示词。</p>
                      <div className="cantonese-flavor-grid">
                        {cantoneseFlavorProfiles.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            aria-label={option.label}
                            className={option.id === cantoneseFlavor ? 'opening-choice cantonese-flavor-card active' : 'opening-choice cantonese-flavor-card'}
                            onClick={() => setCantoneseFlavor(option.id)}
                          >
                            <strong>{option.label}</strong>
                            <p>{option.summary}</p>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                  {renderOriginBackgroundPanel()}
                </div>
              </>
            ) : null}

            {stepIndex === 3 ? (
              <>
                <h2>能力与特质</h2>
                <div className="ability-traits-dual-panel">
                  <div className="ability-traits-left">
                    <h3>预设模板</h3>
                    <div className="attribute-preset-grid">
                      {attributePresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          aria-label={preset.name}
                          className={selectedPresetId === preset.id ? 'opening-choice attribute-preset-card active' : 'opening-choice attribute-preset-card'}
                          onClick={() => handlePreset(preset)}
                        >
                          <strong>{preset.name}</strong>
                          <span>{preset.summary}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ability-traits-right">
                    <div className="attribute-section-header">
                      <h3>六维能力</h3>
                      <span className={remainingPoints < 0 ? 'opening-warning' : 'field-note'}>剩余自由点：{remainingPoints}</span>
                    </div>
                    <div className="attribute-grid">
                      {attributeLabels.map(({ key, label, description }) => {
                        const val = attributes[key];
                        return (
                        <div key={key} className="attribute-compact-item">
                          <label htmlFor={`attr-${key}`} title={`${label}：${description}`}>
                            <span>{label}</span>
                            <small>{description}</small>
                          </label>
                          <div className="ability-stepper">
                            <button
                              type="button"
                              className="ability-stepper__btn"
                              aria-label={`减少${label}`}
                              disabled={val <= 30}
                              onMouseDown={() => startAttributeHold(key, -1)}
                              onMouseUp={stopAttributeHold}
                              onMouseLeave={stopAttributeHold}
                              onBlur={stopAttributeHold}
                              onTouchStart={() => startAttributeHold(key, -1)}
                              onTouchEnd={stopAttributeHold}
                              onClick={() => adjustAttribute(key, -1)}
                            >
                              −
                            </button>
                            <input
                              id={`attr-${key}`}
                              className="ability-stepper__input"
                              aria-label={label}
                              type="number"
                              min={30}
                              max={80}
                              value={val}
                              onChange={(event) => updateAttribute(key, Number(event.target.value))}
                            />
                            <button
                              type="button"
                              className="ability-stepper__btn"
                              aria-label={`增加${label}`}
                              disabled={remainingPoints <= 0 || val >= 80}
                              onMouseDown={() => startAttributeHold(key, 1)}
                              onMouseUp={stopAttributeHold}
                              onMouseLeave={stopAttributeHold}
                              onBlur={stopAttributeHold}
                              onTouchStart={() => startAttributeHold(key, 1)}
                              onTouchEnd={stopAttributeHold}
                              onClick={() => adjustAttribute(key, 1)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );})}
                    </div>
                  </div>
                </div>
                <p className="field-note">最多选择 {maxOpeningTraits} 项</p>
                <div className="trait-choice-grid">
                  {openingTraits.map((trait) => {
                    const isSelected = selectedTraitIds.includes(trait.traitId);
                    const isDisabled = !isSelected && selectedTraitIds.length >= maxOpeningTraits;

                    return (
                      <label
                        key={trait.traitId}
                        className={
                          isSelected ? 'trait-choice active' : isDisabled ? 'trait-choice disabled' : 'trait-choice'
                        }
                      >
                        <span>
                          <strong>{trait.name}</strong>
                          <small>{trait.effectSummary}</small>
                        </span>
                        <input
                          aria-label={trait.name}
                          type="checkbox"
                          checked={isSelected}
                          disabled={isDisabled}
                          onChange={() => toggleTrait(trait.traitId)}
                        />
                      </label>
                    );
                  })}
                </div>
              </>
            ) : null}

            {stepIndex === 4 ? (
              <>
                <h2>戏剧化开局</h2>
                <label className="dramatic-opening-master-switch">
                  <span>
                    <strong>启用戏剧化开局</strong>
                    <small>只编排第一幕结构，不替玩家决定，也不预设结果。</small>
                  </span>
                  <span className="opening-toggle-line">
                    <input
                      type="checkbox"
                      aria-label="启用戏剧化开局"
                      checked={dramaticOpeningEnabled}
                      onChange={(event) => {
                        setDramaticOpeningEnabled(event.target.checked);
                        if (!event.target.checked) {
                          setOpeningCustomSupportSelectionKey(undefined);
                        }
                      }}
                    />
                    <strong>{dramaticOpeningEnabled ? '开启' : '关闭'}</strong>
                  </span>
                </label>
                {!dramaticOpeningEnabled ? (
                  <section className="dramatic-opening-disabled-note">
                    <strong>保持现有自然开局</strong>
                    <p>
                      游戏将根据世界、身份、岗位、出身、人物资料和开局要求自然生成第一幕，
                      不额外保证特定事件、人物组合或戏剧结构。
                    </p>
                  </section>
                ) : (
                  <>
                    <div className="dramatic-opening-group-tabs" role="tablist" aria-label="戏剧化开局分类">
                      {dramaticOpeningGroups.map((group) => (
                        <button
                          key={group.id}
                          type="button"
                          role="tab"
                          aria-selected={group.id === dramaticOpeningGroupId}
                          className={group.id === dramaticOpeningGroupId ? 'active' : ''}
                          onClick={() => {
                            setDramaticOpeningGroupId(group.id);
                            const firstDefinition = dramaticOpeningDefinitions.find(
                              (definition) => definition.groupId === group.id
                            );
                            if (firstDefinition) setDramaticOpeningId(firstDefinition.id);
                          }}
                        >
                          <strong>{group.title}</strong>
                          <small>{group.summary}</small>
                        </button>
                      ))}
                    </div>
                    <div className="dramatic-opening-card-grid">
                      {visibleDramaticOpenings.map((definition) => (
                        <button
                          key={definition.id}
                          type="button"
                          className={definition.id === dramaticOpeningId ? 'dramatic-opening-card selected' : 'dramatic-opening-card'}
                          onClick={() => setDramaticOpeningId(definition.id)}
                        >
                          <strong>{definition.title}</strong>
                          <span>{definition.summary}</span>
                        </button>
                      ))}
                    </div>
                    <section className="dramatic-opening-selection-summary">
                      <strong>当前结构：{selectedDramaticOpening?.title ?? '未选择'}</strong>
                      <p>{selectedDramaticOpening?.planningInstruction}</p>
                      <dl>
                        <dt>开局素材量</dt>
                        <dd>标准</dd>
                        <dt>长期戏剧节奏</dt>
                        <dd>原版节奏（游戏中可调整）</dd>
                        <dt>内容来源</dt>
                        <dd>动态事实优先；Storypack 与影视角色服从世界开关</dd>
                        <dt>规划路由</dt>
                        <dd>自动：有辅助线路时优先使用，否则跟随主剧情</dd>
                      </dl>
                    </section>
                  </>
                )}
              </>
            ) : null}

            {stepIndex === 5 ? (
              <>
                <h2>自定义内容</h2>
                {renderCustomContentSelection()}
              </>
            ) : null}

            {stepIndex === 6 ? (
              <>
                <h2>确认生成</h2>
                <label className="opening-field">
                  开局压力
                  <select
                    aria-label="开局压力"
                    value={openingPressure}
                    onChange={(event) => setOpeningPressure(event.target.value as NonNullable<OpeningSetup['openingPressure']>)}
                  >
                    {openingPressureOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <small>{selectedOpeningPressure.summary}</small>
                </label>
                <fieldset className="cantonese-flavor-panel game-difficulty-opening-panel">
                  <legend>游戏难度</legend>
                  <p className="field-note">
                    控制本局之后的本地判定目标值；不改变六维，也不会取消天然的大成功或大失败。
                  </p>
                  <div className="cantonese-flavor-grid" role="radiogroup" aria-label="游戏难度">
                    {gameDifficultyProfiles.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={option.id === gameDifficulty}
                        aria-label={`${option.label}，判定目标值${option.modifier >= 0 ? '+' : ''}${option.modifier}`}
                        className={
                          option.id === gameDifficulty
                            ? 'opening-choice cantonese-flavor-card active'
                            : 'opening-choice cantonese-flavor-card'
                        }
                        onClick={() => setGameDifficulty(option.id)}
                      >
                        <strong>
                          {option.label}（{option.modifier >= 0 ? '+' : ''}
                          {option.modifier}）
                        </strong>
                        <p>{option.summary}</p>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="opening-field">
                  开局额外要求
                  <textarea
                    aria-label="开局额外要求"
                    value={openingNote}
                    onChange={(event) => setOpeningNote(event.target.value)}
                    placeholder="例如：希望开局就有一个旧同学牵出的麻烦。"
                  />
                </label>
                <dl className="opening-summary">
                  <dt>玩家</dt>
                  <dd>{playerNameSummary}</dd>
                  <dt>英文名</dt>
                  <dd>{englishNameSummary}</dd>
                  <dt>剧本</dt>
                  <dd>{selectedScenario.title}</dd>
                  <dt>时间</dt>
                  <dd>{formatFullTime(selectedScenario.time)}</dd>
                  <dt>身份</dt>
                  <dd>{identityOpeningOptions.find((identity) => identity.id === currentIdentity)?.title ?? currentIdentity}</dd>
                  <dt>档案</dt>
                  <dd>
                    {currentIdentity === 'police'
                      ? `${getPoliceRank(rankId).label} / ${selectedDepartment.label} / ${selectedPosting?.label ?? '未选择驻点'} / ${
                          selectedRole?.label ?? '未选择岗位'
                        }`
                      : currentIdentity === 'civilian'
                        ? `${selectedCivilianProfile.publicOccupation} / ${selectedCivilianProfile.workplaceLabel}`
                        : `${selectedTriadProfile.societyName} / ${selectedTriadProfile.startPlaceLabel} / ${selectedTriadProfile.rankSummary} / ${selectedTriadProfile.roleTitle}`}
                  </dd>
                  <dt>出生日期</dt>
                  <dd>{resolvedBirthDate}</dd>
                  <dt>年龄</dt>
                  <dd>{resolvedAge} 岁</dd>
                  {currentIdentity === 'police' ? (
                    <>
                      <dt>警员编号</dt>
                      <dd>{policeNumber || '未填写，开局生成四位数字'}</dd>
                    </>
                  ) : null}
                  <dt>出身与背景</dt>
                  <dd>
                    <strong>{selectedOriginBackground.name}</strong>：{selectedOriginBackground.definition}
                    {selectedOriginBackground.backgroundSummary}
                  </dd>
                  <dt>剧情素材影响</dt>
                  <dd>{storypackInfluenceLabels[storypackInfluence ?? 'high']}</dd>
                  <dt>影视角色入世</dt>
                  <dd>{screenCharacterSeedsEnabled ? '开启' : '关闭'}</dd>
                  <dt>戏剧化开局</dt>
                  <dd>{dramaticOpeningEnabled ? selectedDramaticOpening?.title ?? '已开启' : '关闭（自然开局）'}</dd>
                  <dt>本局自定义内容</dt>
                  <dd>
                    {selectedCustomContentOptions
                      .map((option) => option.title)
                      .join('、') || '未选择'}
                  </dd>
                  <dt>本局重点内容</dt>
                  <dd>
                    {prioritizedCustomContentOptions
                      .map((option) => option.title)
                      .join('、') || '未设置'}
                  </dd>
                  <dt>第一幕自定义支持</dt>
                  <dd>
                    {dramaticOpeningEnabled
                      ? selectedOpeningCustomSupport?.title ?? '不使用'
                      : '关闭戏剧化开局，不注入第一幕'}
                  </dd>
                  <dt>开局压力</dt>
                  <dd>{selectedOpeningPressure.label}</dd>
                  <dt>游戏难度</dt>
                  <dd>
                    {selectedGameDifficulty.label}（判定目标值
                    {selectedGameDifficulty.modifier >= 0 ? '+' : ''}
                    {selectedGameDifficulty.modifier}）
                  </dd>
                  <dt>粤语风味</dt>
                  <dd>{selectedCantoneseFlavor.label}</dd>
                  <dt>特质</dt>
                  <dd>{selectedTraits.map((trait) => trait.name).join('、') || '无'}</dd>
                  <dt>开局要求</dt>
                  <dd>{openingNote.trim() || '无'}</dd>
                </dl>
              </>
            ) : null}
          </section>
        </div>

        <footer className="opening-footer">
          <span>步骤 {stepIndex + 1}/{openingSteps.length}</span>
          {isStarting && streamText ? (
            <span className="opening-stream-preview" role="status">
              {streamText}
            </span>
          ) : null}
          {error ? <span className="opening-warning" role="alert">{error}</span> : null}
          <div>
            <button type="button" disabled={stepIndex === 0 || isStarting} onClick={() => navigateToStep(stepIndex - 1)}>
              上一步
            </button>
            {stepIndex < openingSteps.length - 1 ? (
              <button
                type="button"
                disabled={!canGoNext || isStarting}
                onClick={() => navigateToStep(stepIndex + 1)}
              >
                下一步
              </button>
            ) : (
              <button type="button" disabled={!canStartGame || isStarting} onClick={handleStartGameRequest}>
                {isStarting ? '生成中...' : '生成开局'}
              </button>
            )}
          </div>
        </footer>
      </section>
      {characterTemplateDialogMode ? (
        <OpeningCharacterTemplateDialog
          mode={characterTemplateDialogMode}
          templates={compatibleCharacterTemplates}
          activeTemplateId={activeCharacterTemplateId}
          templateName={characterTemplateName}
          status={characterTemplateStatus}
          onTemplateNameChange={setCharacterTemplateName}
          onSaveCopy={() => saveCharacterTemplate('copy')}
          onUpdate={() => saveCharacterTemplate('update')}
          onLoad={loadCharacterTemplate}
          onDelete={deleteCharacterTemplate}
          onClose={() => setCharacterTemplateDialogMode(undefined)}
        />
      ) : null}
      {customContentReview.length > 0 ? (
        <div className="opening-custom-review-backdrop">
          <section
            className="opening-custom-review-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="opening-custom-review-title"
          >
            <header>
              <div>
                <p className="home-kicker">CUSTOM CONTENT ADAPTATION</p>
                <h2 id="opening-custom-review-title">
                  确认本局世界包适配
                </h2>
              </div>
            </header>
            <p>
              以下内容已生成香港 1988 的存档级适配快照。确认只会固化这次适配并继续开局，不会把内容自动写成已经发生的事实。
            </p>
            <div
              className="opening-custom-review-list"
              role="region"
              aria-label="本局世界包适配项目"
              tabIndex={0}
            >
              {customContentReview.map((item) => (
                <article key={item.selectionKey}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.kind === 'event_group' ? '事件组' : '人物'} ·
                    待审核
                  </span>
                  <ul>
                    {item.summaryLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <footer>
              <button
                type="button"
                onClick={onCancelCustomContentReview}
              >
                返回修改选择
              </button>
              <button
                type="button"
                onClick={onApproveCustomContentReview}
              >
                确认适配并继续生成
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {isLegalDisclaimerOpen ? (
        <OpeningLegalDisclaimerModal
          isStarting={isStarting}
          onAccept={handleAcceptLegalDisclaimer}
          onDecline={() => setIsLegalDisclaimerOpen(false)}
        />
      ) : null}
    </main>
  );
}
