import { useEffect, useMemo, useRef, useState } from 'react';
import type { OpeningSetup } from '../../domain/runtime/initialState';
import type { AttributeBlock, CantoneseFlavorLevel, CurrentIdentity, OriginBackground, Trait } from '../../domain/runtime/types';
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
import { OpeningLegalDisclaimerModal } from '../components/OpeningLegalDisclaimerModal';
import {
  hasAcceptedOpeningLegalDisclaimer,
  recordOpeningLegalDisclaimerAcceptance
} from '../legal/openingLegalDisclaimer';

interface OpeningScreenProps {
  onStartGame: (setup: OpeningSetup) => void;
  onBack: () => void;
  isStarting?: boolean;
  error?: string | null;
  streamText?: string;
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

interface CantoneseFlavorOption {
  id: CantoneseFlavorLevel;
  label: string;
  summary: string;
}

interface OpeningPressureOption {
  id: NonNullable<OpeningSetup['openingPressure']>;
  label: string;
  summary: string;
}

const openingSteps = ['世界与剧本', '身份选择', '基础档案', '能力与特质', '确认生成'];
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
const customOriginBackgroundsStorageKey = 'sorry-im-a-cop-v2-custom-origin-backgrounds';
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

const cantoneseFlavorOptions: CantoneseFlavorOption[] = [
  { id: 'off', label: '关闭', summary: '对白保持标准中文，不主动加入粤语。' },
  { id: 'light', label: '轻微', summary: '少量称呼、语气词和港式口吻。' },
  { id: 'medium', label: '中等', summary: '主要对白带香港味，叙述仍易读。' },
  { id: 'heavy', label: '较多', summary: '人物对白较多粤语和港式句式。' },
  { id: 'full', label: '全粤语', summary: '对白尽量粤语化，适合强风味游玩。' }
];

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
    const raw = localStorage.getItem(customOriginBackgroundsStorageKey);
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
  streamText = ''
}: OpeningScreenProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [scenarioId, setScenarioId] = useState('hk_1988_crosscurrents');
  const [storypackInfluence, setStorypackInfluence] = useState<OpeningSetup['storypackInfluence']>('medium');
  const [currentIdentity, setCurrentIdentity] = useState<CurrentIdentity>('police');
  const [playerName, setPlayerName] = useState('');
  const [englishName, setEnglishName] = useState('');
  const [gender, setGender] = useState<OpeningSetup['gender']>('male');
  const [age, setAge] = useState(25);
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
  const [openingNote, setOpeningNote] = useState('');
  const [isLegalDisclaimerOpen, setIsLegalDisclaimerOpen] = useState(false);
  const attributeHoldTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const attributeHoldIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);

  const selectedScenario = hk1980sOpeningScenarios.find((scenario) => scenario.id === scenarioId) ?? hk1980sOpeningScenarios[2];
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
  const derivedBirthYear = calculateBirthYear(age, selectedScenario.time);
  const safeBirthMonth = normalizeBirthMonth(birthMonth);
  const maxBirthDay = getDaysInMonth(derivedBirthYear, safeBirthMonth);
  const safeBirthDay = normalizeBirthDay(birthDay, maxBirthDay);
  const birthDayOptions = useMemo(() => Array.from({ length: maxBirthDay }, (_, index) => index + 1), [maxBirthDay]);
  const derivedBirthDate = calculateBirthDate(age, selectedScenario.time, safeBirthMonth, safeBirthDay);
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
    cantoneseFlavorOptions.find((option) => option.id === cantoneseFlavor) ?? cantoneseFlavorOptions[2];
  const selectedOpeningPressure =
    openingPressureOptions.find((option) => option.id === openingPressure) ?? openingPressureOptions[0];
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
    localStorage.setItem(customOriginBackgroundsStorageKey, JSON.stringify(nextOriginBackgrounds));
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

  function updateAge(value: string) {
    const nextAge = normalizeOpeningAge(Number(value) || fallbackOpeningAge);
    const nextBirthYear = calculateBirthYear(nextAge, selectedScenario.time);
    setAge(nextAge);
    setBirthDay((current) => normalizeBirthDay(current, getDaysInMonth(nextBirthYear, safeBirthMonth)));
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
      assignmentSummary: role.label
    };
  }

  function createSetup(): OpeningSetup {
    return {
      playerName: resolvedPlayerName || undefined,
      englishName: englishName.trim() || undefined,
      gender,
      age,
      birthDate: derivedBirthDate,
      policeNumber: currentIdentity === 'police' && policeNumber.length === 4 ? policeNumber : undefined,
      currentIdentity,
      policePostingId: currentIdentity === 'police' ? postingId : undefined,
      civilianProfileId: currentIdentity === 'civilian' ? civilianProfileId : undefined,
      civilianCustomProfile:
        currentIdentity === 'civilian' && civilianProfileId === 'custom_occupation'
          ? {
              ...civilianCustomProfile,
              publicOccupation: customCivilianOccupation.trim(),
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
      lawIdentity: createLawIdentitySetup(),
      attributes,
      traits: selectedTraits,
      openingPressure,
      openingNote
    };
  }

  function handleStartGameRequest() {
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
                min={minOpeningAge}
                max={maxOpeningAge}
                value={age}
                onChange={(event) => updateAge(event.target.value)}
              />
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
          <nav className="opening-step-list" aria-label="开局步骤">
            {openingSteps.map((step, index) => (
              <button
                key={step}
                type="button"
                className={index === stepIndex ? 'active' : ''}
                aria-current={index === stepIndex ? 'step' : undefined}
                onClick={() => setStepIndex(index)}
              >
                {String(index + 1).padStart(2, '0')} {step}
              </button>
            ))}
          </nav>

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
                        <div className="opening-identity-profile-grid">
                          {civilianOpeningProfileOptions.map((profile) => (
                            <button
                              key={profile.id}
                              type="button"
                              aria-label={profile.label}
                              className={profile.id === civilianProfileId ? 'opening-choice active' : 'opening-choice'}
                              onClick={() => setCivilianProfileId(profile.id)}
                            >
                              <strong>{profile.label}</strong>
                              <span>{profile.workplaceLabel}</span>
                              <p>{profile.communitySummary}</p>
                            </button>
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
                        {cantoneseFlavorOptions.map((option) => (
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
                  <dd>{derivedBirthDate}</dd>
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
                  <dd>{storypackInfluenceLabels[storypackInfluence ?? 'medium']}</dd>
                  <dt>开局压力</dt>
                  <dd>{selectedOpeningPressure.label}</dd>
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
          <span>步骤 {stepIndex + 1}/5</span>
          {isStarting && streamText ? (
            <span className="opening-stream-preview" role="status">
              {streamText}
            </span>
          ) : null}
          {error ? <span className="opening-warning" role="alert">{error}</span> : null}
          <div>
            <button type="button" disabled={stepIndex === 0 || isStarting} onClick={() => setStepIndex((current) => Math.max(0, current - 1))}>
              上一步
            </button>
            {stepIndex < openingSteps.length - 1 ? (
              <button
                type="button"
                disabled={!canGoNext || isStarting}
                onClick={() => setStepIndex((current) => Math.min(openingSteps.length - 1, current + 1))}
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
