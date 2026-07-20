import type { AssetItem, AttributeBlock, RuntimeState, StandardAssetItem } from '../../domain/runtime/types';
import {
  ATTRIBUTE_POINT_CAP,
  experienceNeededForNextLevel,
  normalizePlayerProgression,
  type PlayerAttributeKey
} from '../../domain/progression/playerProgression';
import { formatCurrencyAmount } from '../../domain/worldpack/economyConfig';

const attributeLabels: Array<[keyof AttributeBlock, string]> = [
  ['body', '体魄'],
  ['action', '行动'],
  ['perception', '观察'],
  ['thinking', '思考'],
  ['negotiation', '交涉'],
  ['will', '意志']
];

type PoliceRankCode =
  | 'cp'
  | 'dcp'
  | 'sacp'
  | 'acp'
  | 'csp'
  | 'ssp'
  | 'sp'
  | 'cip'
  | 'sip'
  | 'ip'
  | 'pi'
  | 'ssgt'
  | 'sgt'
  | 'spc'
  | 'pc'
  | 'unknown';

interface PoliceRankDisplay {
  code: PoliceRankCode;
  zh: string;
  en: string;
  label: string;
}

const policeRankDisplays: Array<PoliceRankDisplay & { patterns: RegExp[] }> = [
  { code: 'cp', zh: '警务处长', en: 'Commissioner of Police', label: '', patterns: [/\bcommissioner of police\b/i, /警务处长|警務處處長/] },
  { code: 'dcp', zh: '副处长', en: 'Deputy Commissioner', label: '', patterns: [/\bdeputy commissioner\b/i, /副处长|副處長/] },
  {
    code: 'sacp',
    zh: '高级助理处长',
    en: 'Senior Assistant Commissioner',
    label: '',
    patterns: [/\bsenior assistant commissioner\b/i, /\bsacp\b/i, /高级助理处长|高級助理處長/]
  },
  {
    code: 'acp',
    zh: '助理处长',
    en: 'Assistant Commissioner',
    label: '',
    patterns: [/\bassistant commissioner\b/i, /\bacp\b/i, /助理处长|助理處長/]
  },
  { code: 'csp', zh: '总警司', en: 'Chief Superintendent', label: '', patterns: [/\bchief superintendent\b/i, /\bcsp\b/i, /总警司|總警司/] },
  { code: 'ssp', zh: '高级警司', en: 'Senior Superintendent', label: '', patterns: [/\bsenior superintendent\b/i, /\bssp\b/i, /高级警司|高級警司/] },
  { code: 'sp', zh: '警司', en: 'Superintendent', label: '', patterns: [/\bsuperintendent\b/i, /\bsp\b/i, /警司/] },
  { code: 'cip', zh: '总督察', en: 'Chief Inspector', label: '', patterns: [/\bchief inspector\b/i, /\bcip\b/i, /\bci\b/i, /总督察|總督察/] },
  { code: 'sip', zh: '高级督察', en: 'Senior Inspector', label: '', patterns: [/\bsenior inspector\b/i, /\bsip\b/i, /高级督察|高級督察/] },
  { code: 'pi', zh: '见习督察', en: 'Probationary Inspector', label: '', patterns: [/\bprobationary inspector\b/i, /\bpi\b/i, /见习督察|見習督察/] },
  { code: 'ip', zh: '督察', en: 'Inspector', label: '', patterns: [/\binspector\b/i, /\bip\b/i, /督察/] },
  { code: 'ssgt', zh: '警署警长', en: 'Station Sergeant', label: '', patterns: [/\bstation sergeant\b/i, /\bssgt\b/i, /警署警长|警署警長/] },
  { code: 'sgt', zh: '警长', en: 'Sergeant', label: '', patterns: [/\bsergeant\b/i, /\bsgt\b/i, /警长|警長/] },
  {
    code: 'spc',
    zh: '高级警员',
    en: 'Senior Police Constable',
    label: '',
    patterns: [/\bsenior police constable\b/i, /\bsenior constable\b/i, /\bspc\b/i, /高级警员|高級警員/]
  },
  { code: 'pc', zh: '警员', en: 'Police Constable', label: '', patterns: [/\bpolice constable\b/i, /\bconstable\b/i, /\bpc\b/i, /警员|警員/] }
];

const policeRankDisplayDefaults = policeRankDisplays.map((rank) => ({
  ...rank,
  label: `${rank.zh} / ${rank.en}`
}));

function formatGender(gender: RuntimeState['player']['gender']) {
  if (gender === 'male') return '男';
  if (gender === 'female') return '女';
  if (gender === 'nonbinary') return '非二元';
  return undefined;
}

function attributePercent(value: number) {
  return `${Math.max(0, Math.min(100, value))}%`;
}

function vitalsPercent(current: number, max: number) {
  if (max <= 0) return '0%';
  return `${Math.max(0, Math.min(100, Math.round((current / max) * 100)))}%`;
}

function isEquipmentAsset(item: AssetItem | undefined): item is StandardAssetItem {
  return item?.category === 'equipment';
}

function isInternalAssetId(value: string): boolean {
  return /^asset_[a-z0-9_:-]+$/i.test(value.trim());
}

function normalizePoliceRank(rank: string | undefined): PoliceRankDisplay {
  const source = rank?.trim() || '警员';
  const display = policeRankDisplayDefaults.find(({ patterns }) => patterns.some((pattern) => pattern.test(source)));
  if (display) return display;
  return { code: 'unknown', zh: source, en: source, label: source };
}

function extractLocalLabel(value: string | undefined) {
  const source = value?.trim();
  if (!source) return undefined;
  const parenthetical = source.match(/[（(]([^（）()]+)[）)]/);
  if (parenthetical) return parenthetical[1].replace(/\s+[A-Z]{1,5}$/u, '').trim();
  return source;
}

function formatPoliceUnit(state: RuntimeState) {
  const station = extractLocalLabel(state.lawIdentity.stationOrPost);
  const assignment = extractLocalLabel(state.lawIdentity.assignmentSummary);
  const unitParts = [station, assignment].filter(Boolean);
  return {
    station,
    assignment,
    label: unitParts.length > 0 ? unitParts.join(' · ') : (extractLocalLabel(state.lawIdentity.department) ?? '待定单位')
  };
}

function RoyalPoliceBadgeGlyph() {
  return (
    <>
      <path className="police-badge-crown" d="M23 12l4 4 5-7 5 7 4-4 2 10H21l2-10z" />
      <path className="police-badge-wreath" d="M15 27c-7 10-4 24 7 30M49 27c7 10 4 24-7 30" />
      <path className="police-badge-wreath" d="M19 31l-5-2M18 37l-6-1M20 43l-6 1M23 49l-5 3M45 31l5-2M46 37l6-1M44 43l6 1M41 49l5 3" />
      <path className="police-badge-shield" d="M22 27h20v16c0 7-5 11-10 14-5-3-10-7-10-14V27z" />
      <path className="police-badge-harbour" d="M26 40h12M27 36h10M30 31h4M24 44c4-2 6-2 10 0s5 2 7 0" />
      <path className="police-badge-ribbon" d="M17 55h30" />
    </>
  );
}

function PoliceBadgeMark() {
  return (
    <svg className="police-id-badge" viewBox="0 0 64 64" role="img" aria-label="皇家香港警察警章">
      <RoyalPoliceBadgeGlyph />
    </svg>
  );
}

function RankCrownRight({ x, y = 25, scale = 1 }: { x: number; y?: number; scale?: number }) {
  return (
    <g className="rank-crown-right" transform={`translate(${x} ${y}) rotate(90) scale(${scale})`}>
      <path className="rank-fill" d="M-16 9h32L14-8 7-3 0-13-7-3l-7-5-2 17z" />
      <path className="rank-stroke" d="M-16 9h32M-13 13h26M-16 9L14-8 7-3 0-13-7-3l-7-5-2 17z" />
      <path className="rank-stroke rank-crown-cross" d="M0-13v-5M-3-16h6" />
    </g>
  );
}

function RankBathStar({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g className="rank-bath-star" transform={`translate(${x} ${y}) scale(${scale})`}>
      <path
        className="rank-fill rank-stroke rank-bath-star-rays"
        d="M0-12l2.3 7.4 4.5-2.2-2.2 4.5L12 0 4.6 2.3l2.2 4.5-4.5-2.2L0 12l-2.3-7.4-4.5 2.2 2.2-4.5L-12 0l7.4-2.3-2.2-4.5 4.5 2.2L0-12z"
      />
      <circle className="rank-bath-star-core" r="3.4" />
      <path className="rank-bath-star-detail" d="M-2.1 0h4.2M0-2.1v4.2" />
    </g>
  );
}

function RankShoulderChevron({
  x,
  centerY = 25,
  depth = 14,
  halfHeight = 14
}: {
  x: number;
  centerY?: number;
  depth?: number;
  halfHeight?: number;
}) {
  return (
    <path
      className="rank-stroke rank-chevron rank-shoulder-chevron"
      data-direction="left"
      data-points-to="badge-number"
      d={`M${x} ${centerY - halfHeight}L${x - depth} ${centerY}L${x} ${centerY + halfHeight}`}
    />
  );
}

function RankCrossedBatons() {
  return (
    <g className="rank-command-wreath">
      <path className="rank-stroke" d="M-14 13L14-13M14 13L-14-13M-16 16h32" />
      <path className="rank-stroke" d="M-15-12c-10 8-10 24 0 32M15-12c10 8 10 24 0 32" />
      <path className="rank-stroke rank-wreath-leaves" d="M-17-7l-6-2M-19 0l-6-1M-18 7l-6 2M-14 14l-5 4M17-7l6-2M19 0l6-1M18 7l6 2M14 14l5 4" />
    </g>
  );
}

function RankRoyalPoliceBadge({ x = 82, y = 25 }: { x?: number; y?: number }) {
  return (
    <g className="rank-rhkp-crest" transform={`translate(${x} ${y}) rotate(90) scale(0.56) translate(-32 -32)`}>
      <RoyalPoliceBadgeGlyph />
    </g>
  );
}

function RankBoardLabel({ children }: { children: string }) {
  return (
    <text className="rank-board-label" x="17" y="25" textAnchor="middle" transform="rotate(90 17 25)">
      {children}
    </text>
  );
}

function PoliceRankInsignia({ rank, badgeNumber }: { rank: PoliceRankDisplay; badgeNumber?: string }) {
  const code = rank.code;
  const boardLabel = code === 'pc' || code === 'spc' || code === 'sgt' ? (badgeNumber ?? '0000') : 'RHKP';

  return (
    <span className="police-rank-insignia" role="img" aria-label={`${rank.zh}职级标志`}>
      <svg
        viewBox="0 0 156 50"
        aria-hidden="true"
        data-orientation="horizontal"
        data-direction="right"
        data-badge-number-end="left"
      >
        <defs>
          <linearGradient id="police-rank-patch-gradient" x1="0" y1="0" x2="156" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#182a31" />
            <stop offset="0.48" stopColor="#07141b" />
            <stop offset="1" stopColor="#102229" />
          </linearGradient>
          <pattern id="police-rank-patch-weave" width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M0 0l4 4M4 0L0 4" stroke="rgba(244, 224, 166, 0.16)" strokeWidth="0.35" />
          </pattern>
        </defs>
        <path
          className="rank-patch rank-shoulder-board"
          d="M2 2h121c18 0 31 10 31 23s-13 23-31 23H2z"
          fill="url(#police-rank-patch-gradient)"
        />
        <path
          className="rank-patch-texture"
          d="M4 4h118c16 0 29 9 29 21s-13 21-29 21H4z"
          fill="url(#police-rank-patch-weave)"
        />
        <path className="rank-patch-inner" d="M6 6h115c14 0 26 8 26 19s-12 19-26 19H6z" />
        <path className="rank-patch-seam" d="M29 7v36" />
        <circle className="rank-shoulder-button" cx="139" cy="25" r="3.2" />
        <circle className="rank-shoulder-button-highlight" cx="138.2" cy="24.2" r="0.8" />
        <RankBoardLabel>{boardLabel}</RankBoardLabel>
        {code === 'spc' ? <RankShoulderChevron x={83} depth={21} /> : null}
        {code === 'sgt' ? (
          <>
            <RankShoulderChevron x={65} depth={12} halfHeight={13} />
            <RankShoulderChevron x={79} depth={12} halfHeight={13} />
            <RankShoulderChevron x={93} depth={12} halfHeight={13} />
          </>
        ) : null}
        {code === 'ssgt' ? <RankRoyalPoliceBadge /> : null}
        {code === 'pi' ? <RankBathStar x={86} y={25} /> : null}
        {code === 'ip' ? (
          <>
            <RankBathStar x={73} y={25} />
            <RankBathStar x={101} y={25} />
          </>
        ) : null}
        {code === 'sip' ? (
          <>
            <path className="rank-stroke rank-senior-inspector-bar" d="M49 11v28" />
            <RankBathStar x={76} y={25} />
            <RankBathStar x={104} y={25} />
          </>
        ) : null}
        {code === 'cip' ? (
          <>
            <RankBathStar x={74} y={14} scale={0.88} />
            <RankBathStar x={74} y={36} scale={0.88} />
            <RankBathStar x={104} y={25} scale={0.92} />
          </>
        ) : null}
        {code === 'sp' ? <RankCrownRight x={88} scale={0.82} /> : null}
        {code === 'ssp' ? (
          <>
            <RankBathStar x={63} y={25} scale={0.9} />
            <RankCrownRight x={101} scale={0.76} />
          </>
        ) : null}
        {code === 'csp' ? (
          <>
            <RankBathStar x={57} y={25} scale={0.82} />
            <RankBathStar x={81} y={25} scale={0.82} />
            <RankCrownRight x={113} scale={0.7} />
          </>
        ) : null}
        {code === 'acp' ? (
          <g transform="translate(82 23) scale(0.9)"><RankCrossedBatons /></g>
        ) : null}
        {code === 'sacp' ? (
          <>
            <g transform="translate(76 23) scale(0.82)"><RankCrossedBatons /></g>
            <RankBathStar x={113} y={25} scale={0.8} />
          </>
        ) : null}
        {code === 'dcp' ? (
          <>
            <g transform="translate(72 23) scale(0.78)"><RankCrossedBatons /></g>
            <RankCrownRight x={113} scale={0.66} />
          </>
        ) : null}
        {code === 'cp' ? (
          <>
            <g transform="translate(63 23) scale(0.7)"><RankCrossedBatons /></g>
            <RankBathStar x={98} y={25} scale={0.72} />
            <RankCrownRight x={124} scale={0.58} />
          </>
        ) : null}
        {code === 'unknown' ? (
          <text className="rank-text" x="86" y="31" textAnchor="middle">
            RANK
          </text>
        ) : null}
      </svg>
    </span>
  );
}

function PlayerNameHeading({
  state,
  onOpenDossier
}: {
  state: RuntimeState;
  onOpenDossier?: () => void;
}) {
  return (
    <>
      <h2>
        <button type="button" className="player-dossier-trigger" onClick={onOpenDossier} disabled={!onOpenDossier}>
          {state.player.name}
        </button>
      </h2>
      {state.player.englishName ? <p>{state.player.englishName}</p> : null}
    </>
  );
}

function TriadIdentityCard({
  state,
  identityLine,
  onOpenDossier
}: {
  state: RuntimeState;
  identityLine: string;
  onOpenDossier?: () => void;
}) {
  const actor = state.actors[state.player.actorId];
  const profile = actor?.roleProfiles.triad;
  const organizationName = profile?.societyName ??
    (profile?.organizationId ? state.organizations[profile.organizationId]?.name : undefined) ??
    '街面关系未明';
  const publicRole = profile?.roleTitle ?? actor?.publicIdentity ?? '外围人物';

  return (
    <section className="identity-route-card triad-id-card" aria-label="社团公开身份卡">
      <header className="identity-route-header">
        <span className="triad-id-seal" aria-hidden="true">義</span>
        <div>
          <strong>街面名册</strong>
          <span>STREET AFFILIATION</span>
        </div>
      </header>
      <div className="identity-route-person">
        <div className="identity-route-photo" role="img" aria-label="玩家照片预留位" />
        <div className="identity-route-person-copy">
          <PlayerNameHeading state={state} onOpenDossier={onOpenDossier} />
          {identityLine ? <span>{identityLine}</span> : null}
        </div>
      </div>
      <dl className="identity-route-grid">
        <div>
          <dt>字头</dt>
          <dd>{organizationName}</dd>
        </div>
        <div>
          <dt>公开位置</dt>
          <dd>{publicRole}</dd>
        </div>
        <div>
          <dt>身份层级</dt>
          <dd>{profile?.rankSummary ?? '外围关系'}</dd>
        </div>
        <div>
          <dt>活动范围</dt>
          <dd title={profile?.territorySummary}>{profile?.territorySummary ?? '尚未固定'}</dd>
        </div>
      </dl>
    </section>
  );
}

function CivilianIdentityCard({
  state,
  identityLine,
  onOpenDossier
}: {
  state: RuntimeState;
  identityLine: string;
  onOpenDossier?: () => void;
}) {
  const actor = state.actors[state.player.actorId];
  const profile = actor?.roleProfiles.civilian;
  const workplace = profile?.workplacePlaceId ? state.places[profile.workplacePlaceId]?.name : undefined;
  const occupation = profile?.publicOccupation ?? actor?.publicIdentity ?? '普通市民';

  return (
    <section className="identity-route-card civilian-id-card" aria-label="市民公开身份卡">
      <header className="identity-route-header">
        <span className="civilian-id-monogram" aria-hidden="true">HK</span>
        <div>
          <strong>社区生活档案</strong>
          <span>CIVIL LIFE RECORD</span>
        </div>
      </header>
      <div className="identity-route-person">
        <div className="identity-route-photo" role="img" aria-label="玩家照片预留位" />
        <div className="identity-route-person-copy">
          <PlayerNameHeading state={state} onOpenDossier={onOpenDossier} />
          {identityLine ? <span>{identityLine}</span> : null}
        </div>
      </div>
      <dl className="identity-route-grid">
        <div>
          <dt>公开职业</dt>
          <dd>{occupation}</dd>
        </div>
        <div>
          <dt>工作地点</dt>
          <dd>{workplace ?? '日常地点尚未登记'}</dd>
        </div>
        <div className="identity-route-grid-wide">
          <dt>社区关系</dt>
          <dd title={profile?.communitySummary}>{profile?.communitySummary || '尚未形成稳定社区关系。'}</dd>
        </div>
      </dl>
    </section>
  );
}

interface PlayerPanelProps {
  state: RuntimeState;
  onOpenEquipment?: () => void;
  onOpenDossier?: () => void;
  onSpendAttributePoint?: (attribute: PlayerAttributeKey) => void;
}

export function PlayerPanel({
  state,
  onOpenEquipment,
  onOpenDossier,
  onSpendAttributePoint
}: PlayerPanelProps) {
  const playerActor = state.actors[state.player.actorId];
  const age = playerActor?.computedAge;
  const equippedItems = (state.assets.equippedItemIds ?? [])
    .map((itemId) => state.assets.items[itemId])
    .filter(isEquipmentAsset);
  const equipmentSlotLabels = Array.from(
    { length: 3 },
    (_, index) => {
      const fallback = state.player.equipment[index];
      if (!fallback || isInternalAssetId(fallback)) return equippedItems[index]?.name ?? '空槽';
      return equippedItems[index]?.name ?? fallback;
    }
  );
  const genderLabel = formatGender(state.player.gender);
  const identityLine = [genderLabel, age ? `${age}岁` : ''].filter(Boolean).join(' · ');
  const sexValue = genderLabel ?? '未录入';
  const ageValue = age ? `${age}岁` : '未录入';
  const isPoliceIdentity = state.player.currentIdentity === 'police';
  const policeRank = normalizePoliceRank(state.lawIdentity.rank);
  const policeUnit = formatPoliceUnit(state);
  const progression = normalizePlayerProgression(state.player.progression);
  const nextLevelExperience = experienceNeededForNextLevel(progression.level);
  const experienceProgress = vitalsPercent(progression.experience, nextLevelExperience);
  const cashOnHand = state.finance?.cashOnHand ?? state.player.economy.cashOnHand;
  const bankBalance = state.finance?.bankBalance ?? state.player.economy.bankBalance;

  return (
    <section className="player-panel" aria-label="玩家">
      {isPoliceIdentity ? (
        <section className="police-id-card" aria-label="皇家香港警察个人信息卡">
          <header className="police-id-header">
            <PoliceBadgeMark />
            <div>
              <strong>皇家香港警察</strong>
              <span>ROYAL HONG KONG POLICE</span>
            </div>
          </header>

          <div className="police-id-main">
            <div className="police-id-photo" aria-hidden="true" />
            <div className="police-id-person">
              <PlayerNameHeading state={state} onOpenDossier={onOpenDossier} />
              <div className="police-id-demographics">
                <div>
                  <span>性别 / Sex</span>
                  <strong>{sexValue}</strong>
                </div>
                <div>
                  <span>年龄 / Age</span>
                  <strong>{ageValue}</strong>
                </div>
              </div>
            </div>
          </div>

          <dl className="police-id-grid">
            <div>
              <dt>
                警员编号
                <span>Badge No.</span>
              </dt>
              <dd className="police-id-number-row">
                <span className="police-id-number">{state.player.policeNumber ?? '待生成'}</span>
                <PoliceRankInsignia rank={policeRank} badgeNumber={state.player.policeNumber} />
              </dd>
            </div>
            <div>
              <dt>
                职级 / Rank
              </dt>
              <dd>{policeRank.label}</dd>
            </div>
            <div>
              <dt>
                所属单位 / Station / Unit
              </dt>
              <dd>
                {policeUnit.station ? (
                  <>
                    <span>{policeUnit.station}</span>
                    {policeUnit.assignment ? ` · ${policeUnit.assignment}` : ''}
                  </>
                ) : (
                  policeUnit.label
                )}
              </dd>
            </div>
          </dl>
        </section>
      ) : state.player.currentIdentity === 'gang_member' ? (
        <TriadIdentityCard state={state} identityLine={identityLine} onOpenDossier={onOpenDossier} />
      ) : (
        <CivilianIdentityCard state={state} identityLine={identityLine} onOpenDossier={onOpenDossier} />
      )}

      <section className="player-other-info" aria-label="玩家其他信息">
        <dl>
          {!isPoliceIdentity ? (
            <>
              <dt>身份</dt>
              <dd>{playerActor?.publicIdentity ?? state.player.currentIdentity}</dd>
            </>
          ) : null}
          <dt>等级</dt>
          <dd className="player-level-progress">
            <strong>Lv.{progression.level}</strong>
            <span
              className="player-experience-compact"
              role="progressbar"
              aria-label="等级经验"
              aria-valuemin={0}
              aria-valuemax={nextLevelExperience}
              aria-valuenow={progression.experience}
              title={`经验 ${progression.experience} / ${nextLevelExperience}`}
            >
              <i aria-hidden="true">
                <b style={{ width: experienceProgress }} />
              </i>
              <small>{progression.experience}/{nextLevelExperience}</small>
            </span>
          </dd>
          <dt>现金</dt>
          <dd>{formatCurrencyAmount(cashOnHand, state.world.worldpackId)}</dd>
          <dt>存款</dt>
          <dd>{formatCurrencyAmount(bankBalance, state.world.worldpackId)}</dd>
          <dt>住所</dt>
          <dd>{state.player.homeBase.placeName ?? state.player.homeBase.housingType}</dd>
          <dt>衣着</dt>
          <dd>{state.player.clothing}</dd>
          <dt>装备</dt>
          <dd className="player-equipment-slots">
            {equipmentSlotLabels.map((label, index) => (
              <button
                key={`${index}-${label}`}
                type="button"
                onClick={onOpenEquipment}
                disabled={!onOpenEquipment}
                title="点击更换装备"
              >
                <span>{index + 1}</span>
                <strong>{label}</strong>
              </button>
            ))}
          </dd>
        </dl>
      </section>

      <div className="player-vitals-list" aria-label="生命体力">
        <h3>状态</h3>
        <div className="player-vitals-row">
          <span>生命</span>
          <i aria-hidden="true">
            <b style={{ width: vitalsPercent(state.player.vitals.health, state.player.vitals.maxHealth) }} />
          </i>
          <strong>
            {state.player.vitals.health}/{state.player.vitals.maxHealth}
          </strong>
        </div>
        <div className="player-vitals-row">
          <span>体力</span>
          <i aria-hidden="true">
            <b style={{ width: vitalsPercent(state.player.vitals.stamina, state.player.vitals.maxStamina) }} />
          </i>
          <strong>
            {state.player.vitals.stamina}/{state.player.vitals.maxStamina}
          </strong>
        </div>
        <p title={state.player.vitals.conditionSummary}>{state.player.vitals.conditionSummary}</p>
      </div>

      <div className="player-attribute-list" aria-label="六维能力">
        <div className="player-attribute-heading">
          <h3>能力</h3>
          <span>{progression.unspentAttributePoints}点自由点数</span>
        </div>
        {attributeLabels.map(([key, label]) => (
          <div key={key} className="player-attribute-row">
            <span>{label}</span>
            <i aria-hidden="true">
              <b style={{ width: attributePercent(state.player.attributes[key]) }} />
            </i>
            <strong>{state.player.attributes[key]}</strong>
            <button
              type="button"
              className="player-attribute-quick-add"
              disabled={
                !onSpendAttributePoint ||
                progression.unspentAttributePoints <= 0 ||
                state.player.attributes[key] >= ATTRIBUTE_POINT_CAP
              }
              onClick={() => onSpendAttributePoint?.(key)}
              title={progression.unspentAttributePoints > 0 ? `提升${label}` : '没有可用的自由点数'}
              aria-label={`提升${label}`}
            >
              +
            </button>
          </div>
        ))}
      </div>

      <div className="player-trait-list" aria-label="特质">
        <h3>特质</h3>
        {state.player.activeTraits.length > 0 ? (
          <div>
            {state.player.activeTraits.slice(0, 6).map((trait) => (
              <span key={trait.traitId} title={trait.effectSummary || trait.description}>
                {trait.name}
              </span>
            ))}
          </div>
        ) : (
          <p>暂无</p>
        )}
      </div>
    </section>
  );
}
