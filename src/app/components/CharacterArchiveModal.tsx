import { useMemo, useState } from 'react';
import { IndexedDbCustomContentRepository } from '../../domain/customContent/IndexedDbCustomContentRepository';
import { importRuntimeActorToCustomLibrary } from '../../domain/customContent/runtimeActorImport';
import { ImagePromptConversionProbe } from '../../domain/imageGeneration/promptConversion';
import { IndexedDbVisualRepository, type VisualRepository } from '../../domain/imageGeneration/visualRepository';
import { formatPoliceText } from '../../domain/police/policeTerminology';
import { deriveActorAgeAt, isAdultFemaleActorAt } from '../../domain/runtime/actorAge';
import { normalizeActorFemaleProfile } from '../../domain/runtime/femaleProfile';
import {
  createManualActorProfileDraft,
  type ManualActorProfileDraft
} from '../../domain/runtime/manualActorProfile';
import { removeActorFromRuntimeState } from '../../domain/runtime/removeActor';
import type {
  Actor,
  ActorAdultPrivateProfile,
  ActorFemaleProfile,
  ActorFemaleRelationshipEdge,
  ActorPregnancyPaternityCandidate,
  AttributeBlock,
  MemoryItem,
  RuntimeState
} from '../../domain/runtime/types';
import { useChineseSearchNormalizer } from '../localization/useChineseSearchNormalizer';
import { CharacterVisualPanel, CharacterVisualThumbnail } from './CharacterVisualPanel';
import type { AvgVisualOverrideRepository } from '../../domain/avgVisualOverride';
import { AvgPortraitOverrideControl } from './avg/AvgVisualOverrideControls';
import {
  buildAvgPortraitGenerationContext,
  type AvgImageGenerationService
} from '../../domain/avgImageGeneration';
import type { AvgPresentationResourceRuntime } from './avg/avgPresentationResourceRuntime';

interface CharacterArchiveModalProps {
  state: RuntimeState;
  onClose: () => void;
  onStateChange?: (state: RuntimeState) => void;
  onUpdateActorProfile?: (actorId: string, draft: ManualActorProfileDraft) => Promise<void>;
  showAdultPrivateProfiles?: boolean;
  visualSaveId?: string;
  visualRepository?: VisualRepository;
  customContentRepository?: IndexedDbCustomContentRepository;
  createPromptConversion?: () => ImagePromptConversionProbe | null;
  onOpenImageSettings?: () => void;
  onVisualRepositoryChanged?: () => void;
  avgOverrideRepository?: AvgVisualOverrideRepository;
  avgOverrideRevision?: number;
  avgImageGenerationService?: AvgImageGenerationService;
  avgResourceRuntime?: AvgPresentationResourceRuntime;
  onAvgOverrideChanged?: () => void;
}

interface CharacterProfileEditorProps {
  actor: Actor;
  onCancel: () => void;
  onSave: (draft: ManualActorProfileDraft) => Promise<void>;
}

function CharacterProfileEditor({ actor, onCancel, onSave }: CharacterProfileEditorProps) {
  const [draft, setDraft] = useState<ManualActorProfileDraft>(() => createManualActorProfileDraft(actor));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setTextField<K extends Exclude<keyof ManualActorProfileDraft, 'aliases' | 'equipment' | 'gender'>>(
    field: K,
    value: ManualActorProfileDraft[K]
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function setListField(field: 'aliases' | 'equipment', value: string) {
    setDraft((current) => ({ ...current, [field]: value.split(/\r?\n/) }));
  }

  return (
    <form
      className="character-profile-editor"
      aria-label="修改人物资料"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        try {
          await onSave(draft);
        } catch (saveError) {
          setError(saveError instanceof Error ? saveError.message : '人物资料保存失败，请稍后重试。');
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="character-profile-editor-notice">
        <strong>当前存档本地修改</strong>
        <span>不会改动人物ID、身份结构、组织、历史正文、记忆、案件、图片绑定或全局自定义人物。</span>
        <span>你实际改过的稳定资料将优先于后续AI写回；衣着、关系等动态摘要仍可随剧情变化。</span>
      </div>

      <section>
        <h4>基础资料</h4>
        <div className="character-profile-editor-grid">
          <label>
            <span>姓名 *</span>
            <input value={draft.name} maxLength={60} onChange={(event) => setTextField('name', event.target.value)} />
          </label>
          <label>
            <span>英文名</span>
            <input value={draft.englishName} maxLength={100} onChange={(event) => setTextField('englishName', event.target.value)} />
          </label>
          <label>
            <span>常用称呼</span>
            <input value={draft.callName} maxLength={60} onChange={(event) => setTextField('callName', event.target.value)} />
          </label>
          <label>
            <span>性别</span>
            <select
              value={draft.gender}
              onChange={(event) => setDraft((current) => ({ ...current, gender: event.target.value as Actor['gender'] }))}
            >
              <option value="male">男</option>
              <option value="female">女</option>
              <option value="nonbinary">非二元</option>
              <option value="unknown">未知</option>
            </select>
          </label>
          <label>
            <span>出生日期</span>
            <input
              type="date"
              value={draft.birthDate}
              onChange={(event) => setTextField('birthDate', event.target.value)}
            />
          </label>
          <label className="character-profile-editor-wide">
            <span>别名（每行一项）</span>
            <textarea value={draft.aliases.join('\n')} onChange={(event) => setListField('aliases', event.target.value)} />
          </label>
        </div>
      </section>

      <section>
        <h4>身份显示</h4>
        <p className="character-profile-editor-readonly">结构身份：{identityLabels[actor.currentIdentity]}（不可在此修改）</p>
        <div className="character-profile-editor-grid">
          <label>
            <span>公开身份</span>
            <input value={draft.publicIdentity} maxLength={160} onChange={(event) => setTextField('publicIdentity', event.target.value)} />
          </label>
          <label>
            <span>角色定位</span>
            <input value={draft.positionSummary} maxLength={300} onChange={(event) => setTextField('positionSummary', event.target.value)} />
          </label>
          <label className="character-profile-editor-wide">
            <span>实际身份摘要</span>
            <textarea value={draft.actualIdentitySummary} maxLength={600} onChange={(event) => setTextField('actualIdentitySummary', event.target.value)} />
          </label>
        </div>
      </section>

      <section>
        <h4>人物档案</h4>
        <div className="character-profile-editor-grid">
          <label className="character-profile-editor-wide">
            <span>人物简介</span>
            <textarea value={draft.profileSummary} maxLength={1200} onChange={(event) => setTextField('profileSummary', event.target.value)} />
          </label>
          <label className="character-profile-editor-wide">
            <span>外貌</span>
            <textarea value={draft.appearance} maxLength={1200} onChange={(event) => setTextField('appearance', event.target.value)} />
          </label>
          <label>
            <span>衣着</span>
            <textarea value={draft.clothing} maxLength={800} onChange={(event) => setTextField('clothing', event.target.value)} />
          </label>
          <label>
            <span>装备（每行一项）</span>
            <textarea value={draft.equipment.join('\n')} onChange={(event) => setListField('equipment', event.target.value)} />
          </label>
        </div>
      </section>

      <section>
        <h4>行为倾向</h4>
        <div className="character-profile-editor-grid">
          {([
            ['personality', '性格'],
            ['speechStyle', '说话风格'],
            ['motivation', '动机'],
            ['longTermGoal', '长期目标'],
            ['values', '价值观']
          ] as const).map(([field, label]) => (
            <label key={field}>
              <span>{label}</span>
              <textarea value={draft[field]} maxLength={600} onChange={(event) => setTextField(field, event.target.value)} />
            </label>
          ))}
        </div>
      </section>

      <section>
        <h4>当前关系摘要</h4>
        <div className="character-profile-editor-grid">
          {([
            ['relationshipSummary', '关系摘要'],
            ['attitudeTowardPlayer', '对玩家态度'],
            ['trustTendency', '信任/戒备'],
            ['entanglementSummary', '重要牵连']
          ] as const).map(([field, label]) => (
            <label key={field}>
              <span>{label}</span>
              <textarea value={draft[field]} maxLength={800} onChange={(event) => setTextField(field, event.target.value)} />
            </label>
          ))}
        </div>
      </section>

      {error ? <div className="character-profile-editor-error" role="alert">{error}</div> : null}
      <div className="character-profile-editor-actions">
        <button type="button" disabled={saving} onClick={onCancel}>取消</button>
        <button type="submit" className="character-profile-editor-save" disabled={saving}>
          {saving ? '正在保存…' : '保存修改'}
        </button>
      </div>
    </form>
  );
}

const identityLabels: Record<Actor['currentIdentity'], string> = {
  civilian: '普通市民',
  gang_member: '社团分子',
  police: '警察'
};

const genderLabels: Record<Actor['gender'], string> = {
  male: '男',
  female: '女',
  nonbinary: '非二元',
  unknown: '未知'
};

const presenceLabels: Record<Actor['presence'], string> = {
  present: '在场',
  nearby: '附近',
  mentioned: '被提及',
  absent: '不在场'
};

const attributeLabels: Array<[keyof AttributeBlock, string]> = [
  ['body', '体魄'],
  ['action', '行动'],
  ['perception', '观察'],
  ['thinking', '思考'],
  ['negotiation', '交涉'],
  ['will', '意志']
];

function shouldShowInArchive(actor: Actor, playerActorId: string): boolean {
  if (actor.actorId === playerActorId) return false;
  if (actor.visibility === 'hidden' || actor.visibility === 'private') return false;
  if (actor.presence === 'present' || actor.presence === 'nearby') return true;
  if (actor.interactionScore > 0) return true;
  return actor.importance >= 60;
}

function actorSearchText(actor: Actor, placeName?: string) {
  return [
    actor.name,
    actor.englishName,
    ...actor.aliases,
    actor.callName,
    identityLabels[actor.currentIdentity],
    actor.publicIdentity,
    actor.actualIdentitySummary,
    actor.positionSummary,
    placeName,
    actor.profileSummary,
    actor.relationshipSummary,
    actor.attitudeTowardPlayer
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function getActorPlaceName(state: RuntimeState, actor: Actor) {
  if (!actor.currentPlaceId) return undefined;
  return state.places[actor.currentPlaceId]?.name ?? actor.currentPlaceId;
}

function getActorSceneName(state: RuntimeState, actor: Actor) {
  if (!actor.currentSceneId) return undefined;
  return state.scenes[actor.currentSceneId]?.name ?? actor.currentSceneId;
}

function formatLocation(state: RuntimeState, actor: Actor) {
  const place = getActorPlaceName(state, actor);
  const scene = getActorSceneName(state, actor);
  return [place, scene].filter(Boolean).join(' / ') || '未知';
}

function gameTimeSortKey(memory: MemoryItem): number {
  const { year, month, day, hour, minute } = memory.gameTime;
  return (((year * 12 + month) * 31 + day) * 24 + hour) * 60 + minute;
}

function formatMemoryGameTime(memory: { gameTime: MemoryItem['gameTime'] }): string {
  const { year, month, day, hour, minute } = memory.gameTime;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function getRecentActorMemories(state: RuntimeState, actorId: string): MemoryItem[] {
  return Object.values(state.memories)
    .filter((memory) => memory.kind === 'actor' && memory.relatedActorIds.includes(actorId))
    .filter((memory) => !memory.compressedIntoMemoryId)
    .filter((memory) => memory.visibility !== 'hidden' && memory.visibility !== 'private')
    .sort(
      (left, right) =>
        gameTimeSortKey(right) - gameTimeSortKey(left) ||
        left.memoryId.localeCompare(right.memoryId)
    );
}

function splitActorMemoriesByTier(memories: MemoryItem[]) {
  return {
    longTerm: memories.filter((memory) => memory.tier === 'long_term'),
    stage: memories.filter((memory) => memory.tier === 'mid_term'),
    recent: memories.filter((memory) => memory.tier !== 'mid_term' && memory.tier !== 'long_term')
  };
}

function renderMemoryItems(memories: MemoryItem[], emptyText: string, ariaLabel: string) {
  return (
    <div className="character-recent-memory-list" aria-label={ariaLabel}>
      {memories.length > 0 ? (
        memories.map((memory) => (
          <article key={memory.memoryId}>
            <span>{formatMemoryGameTime(memory)}</span>
            <p>{memory.text}</p>
          </article>
        ))
      ) : (
        <p>{emptyText}</p>
      )}
    </div>
  );
}

function formatActorName(actor: Actor) {
  return actor.englishName ? `${actor.name} / ${actor.englishName}` : actor.name;
}

function formatActorAliasSummary(actor: Actor): string | undefined {
  const aliases = Array.from(new Set([...actor.aliases, actor.callName].map((value) => value?.trim()).filter(Boolean)));
  return aliases.length > 0 ? aliases.join(' / ') : undefined;
}

function formatOptionalPoliceText(value: string | undefined): string | undefined {
  return value?.trim() ? formatPoliceText(value) : undefined;
}

function formatOptionalPolicePrefix(label: string, value: string | undefined): string | undefined {
  const formatted = formatOptionalPoliceText(value);
  return formatted ? `${label}：${formatted}` : undefined;
}

function formatRoleProfile(actor: Actor): string[] {
  const lines: string[] = [];
  const { police, triad, civilian } = actor.roleProfiles;

  if (police) {
    lines.push(
      [
        '警队',
        formatOptionalPoliceText(police.rank),
        formatOptionalPoliceText(police.department),
        formatOptionalPoliceText(police.stationOrPost),
        formatOptionalPoliceText(police.postRole ?? police.assignmentSummary),
        formatOptionalPolicePrefix('卧底/掩护', police.covertStatus)
      ]
        .filter(Boolean)
        .join(' / ')
    );
    if (police.dutySummary) lines.push(`职责：${formatPoliceText(police.dutySummary)}`);
    if (police.institutionalReputation) lines.push(`内部口碑：${formatPoliceText(police.institutionalReputation)}`);
  }

  if (triad) {
    lines.push(
      [
        '社团',
        triad.societyName,
        triad.roleTitle,
        triad.rankSummary,
        triad.territorySummary,
        triad.coverIdentitySummary ? `掩护：${triad.coverIdentitySummary}` : undefined
      ]
        .filter(Boolean)
        .join(' / ')
    );
    if (triad.obligationSummary) lines.push(`义务：${triad.obligationSummary}`);
    if (triad.riskSummary) lines.push(`风险：${triad.riskSummary}`);
  }

  if (civilian) {
    lines.push(['市民', civilian.publicOccupation, civilian.communitySummary].filter(Boolean).join(' / '));
    if (civilian.familyEconomicSummary) lines.push(`家庭/经济：${civilian.familyEconomicSummary}`);
    if (civilian.legalStatusSummary) lines.push(`法律状态：${civilian.legalStatusSummary}`);
  }

  return lines.filter(Boolean);
}

function sortActors(left: Actor, right: Actor) {
  const presenceScore = (actor: Actor) => (actor.presence === 'present' ? 3 : actor.presence === 'nearby' ? 2 : actor.presence === 'mentioned' ? 1 : 0);
  return (
    presenceScore(right) - presenceScore(left) ||
    right.importance - left.importance ||
    right.interactionScore - left.interactionScore ||
    left.name.localeCompare(right.name)
  );
}

function profileText(value: string | undefined): string {
  return value?.trim() || '暂无记录';
}

function getFemaleRelationshipEdges(profile: ActorFemaleProfile): ActorFemaleRelationshipEdge[] {
  if (profile.relationshipNetworkEdges?.length) return profile.relationshipNetworkEdges;
  return (profile.relationshipNetwork ?? []).map((relation) => ({
    targetName: '相关关系',
    relation
  }));
}

function FemaleMetaItem({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{profileText(value)}</strong>
    </div>
  );
}

function FemaleDriveItem({ label, value }: { label: string; value: string | undefined }) {
  return (
    <article>
      <strong>{label}</strong>
      <p>{profileText(value)}</p>
    </article>
  );
}

function FemaleRelationshipNetwork({ edges }: { edges: ActorFemaleRelationshipEdge[] }) {
  return (
    <div className="character-female-network">
      <h5>重要女性关系网</h5>
      {edges.length > 0 ? (
        <ul>
          {edges.map((edge, index) => (
            <li key={`${edge.targetName}-${edge.relation}-${index}`}>
              <strong>{edge.targetName}</strong>
              <span>{edge.note ? `${edge.relation}：${edge.note}` : edge.relation}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>暂无记录。</p>
      )}
    </div>
  );
}

const adultPrivatePartRows = [
  ['胸部', '胸部描述'],
  ['小穴', '小穴描述'],
  ['屁穴', '屁穴描述']
] as const;

const privateProfilePlaceholders = new Set(['pending', '待补全', '暂无记录', 'NO RECORDS']);

const pregnancyStageLabels = {
  pending_check: '待验孕',
  suspected: '疑似怀孕',
  confirmed: '已确认怀孕',
  delivery_due: '待产',
  postpartum: '产后恢复'
} as const;

function formatProfileTime(time: { year: number; month: number; day: number; hour: number; minute: number }): string {
  return `${time.year}年${time.month}月${time.day}日 ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function privateProfileText(value: string | undefined, fallback = '未记录具体内容'): string {
  const text = value?.trim();
  return text && !privateProfilePlaceholders.has(text) ? text : fallback;
}

function visiblePaternityCandidates(
  candidates: ActorPregnancyPaternityCandidate[] | undefined
): ActorPregnancyPaternityCandidate[] {
  return (candidates ?? []).filter((candidate) => candidate.visibility !== 'hidden');
}

function formatPaternityCandidates(candidates: ActorPregnancyPaternityCandidate[] | undefined): string | undefined {
  const names = visiblePaternityCandidates(candidates)
    .map((candidate) => candidate.name ?? candidate.actorId)
    .filter((candidate): candidate is string => Boolean(candidate));
  return names.length > 0 ? names.join('、') : undefined;
}

function AdultPrivateProfileBlock({ profile }: { profile: ActorAdultPrivateProfile }) {
  const womb = profile.womb;
  const wombRecords = womb?.records ?? [];
  const pregnancy = womb?.pregnancy;
  const currentPaternity = formatPaternityCandidates(pregnancy?.paternityCandidates);
  const pendingPregnancyChecks = womb?.pendingPregnancyChecks ?? [];
  const pregnancyHistory = womb?.pregnancyHistory ?? [];
  const paternityRecords = Array.from(
    wombRecords.reduce<
      Map<
        string,
        {
          date?: string;
          candidates: string;
          result?: 'positive' | 'negative';
        }
      >
    >((records, record, index) => {
      const candidates = formatPaternityCandidates(record.paternityCandidates);
      if (!candidates) return records;
      records.set(record.pregnancyId ?? `${record.date ?? 'unknown'}-${index}`, {
        date: record.date,
        candidates,
        result: record.pregnancyCheckResult
      });
      return records;
    }, new Map()).values()
  );

  return (
    <details className="character-female-private-panel">
      <summary>香闺秘档</summary>
      <div className="character-female-private-content">
        <div className="character-female-private-parts">
          {adultPrivatePartRows.map(([key, label]) => {
            const partProfile = profile.partProfiles?.[key];
            return (
              <article key={key}>
                <strong>{label}</strong>
                <p>{privateProfileText(partProfile?.description, '未记录具体描述')}</p>
                {partProfile?.imagePromptAnchor ? (
                  <div className="character-female-private-anchor">
                    <span>生图锚点</span>
                    <code>{partProfile.imagePromptAnchor}</code>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        <div className="character-female-private-tags">
          <article>
            <strong>性癖</strong>
            <p>{privateProfileText(profile.fetishNotes)}</p>
          </article>
          <article>
            <strong>敏感点</strong>
            <p>{privateProfileText(profile.sensitivePoints)}</p>
          </article>
        </div>

        <section className="character-female-womb-panel">
          <header>
            <h5>子宫档案</h5>
            <span>状态：{privateProfileText(womb?.status, '未受孕')}</span>
          </header>
          <dl>
            <dt>宫口状态</dt>
            <dd>{privateProfileText(womb?.cervixStatus, '紧闭')}</dd>
          </dl>
          {pregnancy ? (
            <div className="character-pregnancy-lifecycle">
              <div className="character-pregnancy-stage">
                <strong>{pregnancyStageLabels[pregnancy.status]}</strong>
                <span>登记于 {formatProfileTime(pregnancy.registeredAt)}</span>
              </div>
              <dl>
                <dt>验孕日期</dt>
                <dd>{formatProfileTime(pregnancy.checkDueAt)}</dd>
                {pregnancy.status === 'pending_check' && pendingPregnancyChecks.length > 0 ? (
                  <>
                    <dt>后续待判定</dt>
                    <dd>
                      {pendingPregnancyChecks.length} 项：
                      {pendingPregnancyChecks.map((item) => {
                        const candidates = formatPaternityCandidates(item.paternityCandidates);
                        return `${formatProfileTime(item.checkDueAt)}${candidates ? `（父系候选：${candidates}）` : ''}`;
                      }).join('、')}
                    </dd>
                  </>
                ) : null}
                {pregnancy.status !== 'pending_check' ? (
                  <>
                    <dt>确认节点</dt>
                    <dd>{formatProfileTime(pregnancy.confirmationDueAt)}</dd>
                  </>
                ) : null}
                {['confirmed', 'delivery_due', 'postpartum'].includes(pregnancy.status) ? (
                  <>
                    <dt>预产日期</dt>
                    <dd>{formatProfileTime(pregnancy.dueAt)}</dd>
                  </>
                ) : null}
                {currentPaternity ? (
                  <>
                    <dt>当前父系候选</dt>
                    <dd>{currentPaternity}</dd>
                  </>
                ) : null}
                {pregnancy.childActorId ? (
                  <>
                    <dt>孩子档案</dt>
                    <dd>{pregnancy.childName ?? pregnancy.childActorId}</dd>
                  </>
                ) : null}
                {pregnancy.postpartumUntil ? (
                  <>
                    <dt>恢复至</dt>
                    <dd>{formatProfileTime(pregnancy.postpartumUntil)}</dd>
                  </>
                ) : null}
              </dl>
              {pregnancy.status === 'pending_check' ? (
                <small>
                  结果尚未揭晓，存档与读档不会重新掷骰。同日风险合并，跨日风险分别排期；较早判定成功后，后续待判定自动取消。
                </small>
              ) : null}
            </div>
          ) : womb?.lastPregnancyCheck ? (
            <div className="character-pregnancy-last-check">
              最近验孕：{formatProfileTime(womb.lastPregnancyCheck.checkedAt)} ·{' '}
              {womb.lastPregnancyCheck.result === 'positive' ? '阳性' : '阴性'}
            </div>
          ) : null}
          {paternityRecords.length > 0 ? (
            <dl>
              <dt>父系记录</dt>
              <dd>
                {paternityRecords.map((record, index) => (
                  <span key={`${record.date ?? 'unknown'}-${record.candidates}-${index}`}>
                    {index > 0 ? '；' : ''}
                    {record.date ? `${record.date}：` : ''}
                    {record.candidates}
                    {record.result ? `（验孕${record.result === 'positive' ? '阳性' : '阴性'}）` : ''}
                  </span>
                ))}
              </dd>
            </dl>
          ) : null}
          <div className="character-female-womb-records">
            <strong>记录</strong>
            {wombRecords.length > 0 ? (
              <ul>
                {wombRecords.map((record, index) => (
                  <li key={`${record.date ?? 'unknown'}-${index}`}>
                    {record.date ? <span>{record.date}</span> : null}
                    <p>{record.description}</p>
                    {record.pregnancyCheckDate ? <small>孕检期：{record.pregnancyCheckDate}</small> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>无接触记录。</p>
            )}
          </div>
          {pregnancyHistory.length > 0 ? (
            <div className="character-pregnancy-history">
              <strong>妊娠历史</strong>
              <ul>
                {pregnancyHistory.map((item) => (
                  <li key={item.pregnancyId}>
                    <span>{formatProfileTime(item.endedAt)}</span>
                    <p>{item.summary}</p>
                    <small>
                      {item.outcome === 'live_birth' ? '活产' : '妊娠终止'}
                      {formatPaternityCandidates(item.paternityCandidates)
                        ? ` · 父系候选：${formatPaternityCandidates(item.paternityCandidates)}`
                        : ''}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </details>
  );
}

function FemaleProfileBlock({
  profile,
  adultPrivateProfile
}: {
  profile: ActorFemaleProfile;
  adultPrivateProfile?: ActorAdultPrivateProfile;
}) {
  const relationshipEdges = getFemaleRelationshipEdges(profile);

  return (
    <details className="character-female-profile-panel">
      <summary>
        <span>女性档案</span>
        <small>点击展开</small>
      </summary>
      <div className="character-female-profile-content">
        <section className="character-female-card character-female-appearance-card">
          <h4>外貌档案</h4>
          <blockquote>{profileText(profile.appearanceDescription)}</blockquote>
          <div className="character-female-meta-grid">
            <FemaleMetaItem label="生日" value={profile.birthday} />
            <FemaleMetaItem label="称呼" value={profile.addressToPlayer} />
            <FemaleMetaItem label="身材" value={profile.bodyDescription} />
            <FemaleMetaItem label="衣着" value={profile.clothingStyle} />
          </div>
        </section>

        <section className="character-female-card character-female-drive-card">
          <h4>关系驱动</h4>
          <div className="character-female-drive-grid">
            <FemaleDriveItem label="核心性格特征" value={profile.personalityCore} />
            <FemaleDriveItem label="好感突破条件" value={profile.affectionProgressionCondition} />
            <FemaleDriveItem label="关系突破条件" value={profile.relationshipProgressionCondition} />
          </div>
          <FemaleRelationshipNetwork edges={relationshipEdges} />
        </section>

        {adultPrivateProfile && adultPrivateProfile.enabled !== false ? (
          <AdultPrivateProfileBlock profile={adultPrivateProfile} />
        ) : null}
      </div>
    </details>
  );
}

export function CharacterArchiveModal({
  state,
  onClose,
  onStateChange,
  onUpdateActorProfile,
  showAdultPrivateProfiles = true,
  visualSaveId,
  visualRepository,
  customContentRepository,
  createPromptConversion,
  onOpenImageSettings,
  onVisualRepositoryChanged,
  avgOverrideRepository,
  avgOverrideRevision,
  avgImageGenerationService,
  avgResourceRuntime,
  onAvgOverrideChanged
}: CharacterArchiveModalProps) {
  const [search, setSearch] = useState('');
  const normalizeSearchText = useChineseSearchNormalizer(Boolean(search.trim()));
  const [importantOnly, setImportantOnly] = useState(false);
  const [presentOnly, setPresentOnly] = useState(false);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [pendingDeleteActorId, setPendingDeleteActorId] = useState<string | null>(null);
  const [pendingImportActorId, setPendingImportActorId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{
    actorId: string;
    kind: 'success' | 'already_exists' | 'error';
    message: string;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [editingActorId, setEditingActorId] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<'profile' | 'visual'>('profile');
  const [visualRefreshKey, setVisualRefreshKey] = useState(0);
  const imageRepository = useMemo(
    () => visualRepository ?? (visualSaveId ? new IndexedDbVisualRepository() : undefined),
    [visualRepository, visualSaveId]
  );
  const characterLibraryRepository = useMemo(
    () => customContentRepository ?? new IndexedDbCustomContentRepository(),
    [customContentRepository]
  );

  const archiveActors = useMemo(
    () =>
      Object.values(state.actors)
        .filter((actor) => shouldShowInArchive(actor, state.player.actorId))
        .sort(sortActors),
    [state]
  );

  const filteredActors = useMemo(() => {
    const query = normalizeSearchText(search);
    return archiveActors.filter((actor) => {
      if (importantOnly && actor.importance < 60) return false;
      if (presentOnly && actor.presence !== 'present' && actor.presence !== 'nearby') return false;
      if (!query) return true;
      return normalizeSearchText(actorSearchText(actor, getActorPlaceName(state, actor))).includes(query);
    });
  }, [archiveActors, importantOnly, normalizeSearchText, presentOnly, search, state]);

  const selectedActor =
    filteredActors.find((actor) => actor.actorId === selectedActorId) ?? filteredActors[0] ?? archiveActors[0];
  const roleLines = selectedActor ? formatRoleProfile(selectedActor) : [];
  const recentActorMemories = selectedActor ? getRecentActorMemories(state, selectedActor.actorId) : [];
  const actorMemoryGroups = splitActorMemoriesByTier(recentActorMemories);
  const presentCount = archiveActors.filter((actor) => actor.presence === 'present' || actor.presence === 'nearby').length;
  const importantCount = archiveActors.filter((actor) => actor.importance >= 60).length;
  const selectedFemaleProfile = normalizeActorFemaleProfile(selectedActor?.femaleProfile);
  const selectedActorAge = selectedActor ? deriveActorAgeAt(selectedActor, state.time) : undefined;
  const selectedAdultPrivateProfile =
    selectedActor && selectedFemaleProfile && showAdultPrivateProfiles && isAdultFemaleActorAt(selectedActor, state.time)
      ? selectedFemaleProfile.adultPrivateProfile
      : undefined;

  return (
    <div className="character-archive-backdrop" role="presentation">
      <section
        className="character-archive-modal character-archive-modal--people feature-modal-frame"
        role="dialog"
        aria-modal="true"
        aria-label="人物志"
      >
        <header className="character-archive-header">
          <div>
            <h2>人物志</h2>
            <p>NPC Archive</p>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="character-archive-stats" aria-label="人物志统计">
          <span>
            已记录 <strong>{archiveActors.length}</strong>
          </span>
          <span>
            在场 <strong>{presentCount}</strong>
          </span>
          <span>
            重要 <strong>{importantCount}</strong>
          </span>
          <span>
            当前显示 <strong>{filteredActors.length}</strong>
          </span>
        </div>

        <div className="character-archive-body">
          <aside className="character-roster" aria-label="人物列表">
            <label className="character-search">
              <span>搜索</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="姓名 / 身份 / 地点 / 关系"
              />
            </label>
            <div className="character-filter-row">
              <button type="button" className={importantOnly ? 'active' : ''} onClick={() => setImportantOnly((value) => !value)}>
                仅重要NPC
              </button>
              <button type="button" className={presentOnly ? 'active' : ''} onClick={() => setPresentOnly((value) => !value)}>
                仅在场
              </button>
            </div>

            <div className="character-roster-list">
              {filteredActors.length > 0 ? (
                filteredActors.map((actor) => (
                  <button
                    key={actor.actorId}
                    type="button"
                    className={selectedActor?.actorId === actor.actorId ? 'active' : ''}
                    onClick={() => {
                      setSelectedActorId(actor.actorId);
                      setPendingDeleteActorId(null);
                      setPendingImportActorId(null);
                      setImportStatus(null);
                      setEditingActorId(null);
                      setDetailView('profile');
                    }}
                  >
                    <span className="character-roster-line">
                      <strong title={actor.name}>{actor.name}</strong>
                      <small title={actor.publicIdentity ?? identityLabels[actor.currentIdentity]}>
                        {actor.publicIdentity ?? identityLabels[actor.currentIdentity]}
                      </small>
                    </span>
                  </button>
                ))
              ) : (
                <p className="character-empty">没有符合筛选的人物。</p>
              )}
            </div>
          </aside>

          <section className="character-detail" aria-label="人物详情">
            {selectedActor ? (
              <>
                <div className="character-detail-title">
                  <div className="character-avatar">
                    {visualSaveId && imageRepository ? (
                      <CharacterVisualThumbnail
                        repository={imageRepository}
                        visualSaveId={visualSaveId}
                        actorId={selectedActor.actorId}
                        actorName={selectedActor.name}
                        refreshKey={visualRefreshKey}
                      />
                    ) : <span aria-hidden="true">{selectedActor.name.slice(0, 1)}</span>}
                  </div>
                  <div>
                    <h3>{formatActorName(selectedActor)}</h3>
                    <p>
                      {identityLabels[selectedActor.currentIdentity]} / {selectedActor.publicIdentity ?? selectedActor.positionSummary}
                    </p>
                    <div className="character-detail-tags">
                      <span>{presenceLabels[selectedActor.presence]}</span>
                      <span>{genderLabels[selectedActor.gender]}{typeof selectedActorAge === 'number' ? ` ${selectedActorAge}岁` : ''}</span>
                      <span>往来度 {selectedActor.interactionScore}</span>
                    </div>
                  </div>
                  <div className="character-detail-title-actions">
                    {onUpdateActorProfile && editingActorId !== selectedActor.actorId ? (
                      <button
                        type="button"
                        className="character-profile-edit-button"
                        onClick={() => {
                          setEditingActorId(selectedActor.actorId);
                          setPendingImportActorId(null);
                          setPendingDeleteActorId(null);
                          setImportStatus(null);
                          setDetailView('profile');
                        }}
                      >
                        修改资料
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="character-library-import-button"
                      disabled={isImporting}
                      onClick={() => {
                        setPendingImportActorId(selectedActor.actorId);
                        setPendingDeleteActorId(null);
                        setImportStatus(null);
                      }}
                    >
                      导入自定义人物库
                    </button>
                    {onStateChange ? (
                      <button
                        type="button"
                        className="character-delete-button"
                        onClick={() => {
                          setPendingDeleteActorId(selectedActor.actorId);
                          setPendingImportActorId(null);
                          setImportStatus(null);
                        }}
                      >
                        删除人物
                      </button>
                    ) : null}
                  </div>
                </div>

                {pendingImportActorId === selectedActor.actorId ? (
                  <div className="character-library-import-confirmation">
                    <span>
                      将“{selectedActor.name}”复制为一份待审核草稿。不会带入本局关系、记忆、位置或当前状态；请到首页“自定义”中编辑并发布，之后才能用于新开局。
                    </span>
                    <div>
                      <button
                        type="button"
                        disabled={isImporting}
                        onClick={() => setPendingImportActorId(null)}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        className="character-library-import-confirm-button"
                        disabled={isImporting}
                        onClick={async () => {
                          setIsImporting(true);
                          setImportStatus(null);
                          try {
                            const sourceCharacterAssetId =
                              state.customContent?.characterRuntimeBindings.find(
                                (binding) => binding.actorId === selectedActor.actorId
                              )?.characterAssetId;
                            const result = await importRuntimeActorToCustomLibrary({
                              repository: characterLibraryRepository,
                              worldpackId: state.world.worldpackId,
                              actor: selectedActor,
                              sourceCharacterAssetId
                            });
                            setImportStatus({
                              actorId: selectedActor.actorId,
                              kind:
                                result.status === 'imported'
                                  ? 'success'
                                  : 'already_exists',
                              message:
                                result.status === 'imported'
                                  ? `已将“${selectedActor.name}”保存为待审核草稿。请到首页“自定义”中编辑并发布。`
                                  : `“${selectedActor.name}”已经在自定义人物库中，无需重复导入。`
                            });
                            setPendingImportActorId(null);
                          } catch (error) {
                            setImportStatus({
                              actorId: selectedActor.actorId,
                              kind: 'error',
                              message:
                                error instanceof Error
                                  ? `导入失败：${error.message}`
                                  : '导入失败，请稍后重试。'
                            });
                          } finally {
                            setIsImporting(false);
                          }
                        }}
                      >
                        {isImporting ? '正在导入…' : '确认导入'}
                      </button>
                    </div>
                  </div>
                ) : null}

                {importStatus?.actorId === selectedActor.actorId ? (
                  <div
                    className={`character-library-import-status character-library-import-status--${importStatus.kind}`}
                    role={importStatus.kind === 'error' ? 'alert' : 'status'}
                  >
                    {importStatus.message}
                  </div>
                ) : null}

                {onStateChange && pendingDeleteActorId === selectedActor.actorId ? (
                  <div className="character-delete-confirmation" role="alert">
                    <span>
                      确定删除“{selectedActor.name}”？人物档案和当前人物关联将被移除，已经发生的正文、案件、新闻和记忆仍会保留。
                    </span>
                    <div>
                      <button type="button" onClick={() => setPendingDeleteActorId(null)}>
                        取消
                      </button>
                      <button
                        type="button"
                        className="character-delete-confirm-button"
                        onClick={() => {
                          onStateChange(removeActorFromRuntimeState(state, selectedActor.actorId));
                          setPendingDeleteActorId(null);
                          setSelectedActorId(null);
                        }}
                      >
                        确认删除
                      </button>
                    </div>
                  </div>
                ) : null}

                {editingActorId === selectedActor.actorId && onUpdateActorProfile ? (
                  <CharacterProfileEditor
                    key={selectedActor.actorId}
                    actor={selectedActor}
                    onCancel={() => setEditingActorId(null)}
                    onSave={async (draft) => {
                      await onUpdateActorProfile(selectedActor.actorId, draft);
                      setEditingActorId(null);
                    }}
                  />
                ) : (
                <>
                <div className="character-detail-view-switch" role="tablist" aria-label="人物详情内容">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailView === 'profile'}
                    className={detailView === 'profile' ? 'active' : ''}
                    onClick={() => setDetailView('profile')}
                  >
                    资料
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailView === 'visual'}
                    className={detailView === 'visual' ? 'active' : ''}
                    disabled={!visualSaveId || (!imageRepository && !avgOverrideRepository)}
                    onClick={() => setDetailView('visual')}
                  >
                    视觉内容
                  </button>
                </div>

                {detailView === 'profile' ? (
                  <>

                <div className="character-summary-strip">
                  <strong>{selectedActor.attitudeTowardPlayer}</strong>
                  <span>{selectedActor.relationshipSummary}</span>
                </div>

                <div className="character-section-grid">
                  <section>
                    <h4>身份</h4>
                    <dl>
                      {formatActorAliasSummary(selectedActor) ? (
                        <>
                          <dt>别名/称呼</dt>
                          <dd>{formatActorAliasSummary(selectedActor)}</dd>
                        </>
                      ) : null}
                      <dt>当前位置</dt>
                      <dd>{formatLocation(state, selectedActor)}</dd>
                      <dt>实际身份</dt>
                      <dd>{selectedActor.actualIdentitySummary ?? selectedActor.positionSummary}</dd>
                      <dt>角色定位</dt>
                      <dd>{selectedActor.positionSummary}</dd>
                      {roleLines.length > 0 ? (
                        <>
                          <dt>身份资料</dt>
                          <dd>{roleLines.join('；')}</dd>
                        </>
                      ) : null}
                    </dl>
                  </section>

                  <section>
                    <h4>人物</h4>
                    <dl>
                      <dt>简介</dt>
                      <dd>{selectedActor.profileSummary}</dd>
                      <dt>外貌</dt>
                      <dd>{selectedActor.appearance}</dd>
                      <dt>衣着</dt>
                      <dd>{selectedActor.clothing}</dd>
                      <dt>装备</dt>
                      <dd>{selectedActor.equipment.length ? selectedActor.equipment.join(' / ') : '无'}</dd>
                    </dl>
                  </section>
                </div>

                <div className="character-section-grid">
                  <section>
                    <h4>行为倾向</h4>
                    <dl>
                      <dt>性格</dt>
                      <dd>{selectedActor.personality}</dd>
                      <dt>说话风格</dt>
                      <dd>{selectedActor.speechStyle}</dd>
                      <dt>动机</dt>
                      <dd>{selectedActor.motivation}</dd>
                      <dt>目标</dt>
                      <dd>{selectedActor.longTermGoal}</dd>
                      <dt>价值观</dt>
                      <dd>{selectedActor.values}</dd>
                    </dl>
                  </section>

                  <section>
                    <h4>关系</h4>
                    <dl>
                      <dt>信任/戒备</dt>
                      <dd>{selectedActor.trustTendency}</dd>
                      <dt>重要牵连</dt>
                      <dd>{selectedActor.entanglementSummary}</dd>
                      <dt>状态</dt>
                      <dd>{[selectedActor.statusSummary, selectedActor.bodyConditionSummary].filter(Boolean).join('；')}</dd>
                    </dl>
                  </section>
                </div>

                {selectedFemaleProfile ? (
                  <FemaleProfileBlock profile={selectedFemaleProfile} adultPrivateProfile={selectedAdultPrivateProfile} />
                ) : null}

                <section className="character-attribute-panel">
                  <h4>能力</h4>
                  <div>
                    {attributeLabels.map(([key, label]) => (
                      <span key={key}>
                        {label}
                        <strong>{selectedActor.attributes[key]}</strong>
                      </span>
                    ))}
                  </div>
                </section>

                <section className="character-trait-panel">
                  <h4>特质</h4>
                  <div className="character-trait-list">
                    {selectedActor.activeTraits.length > 0 ? (
                      selectedActor.activeTraits.map((trait) => (
                        <article key={trait.traitId}>
                          <strong>{trait.name}</strong>
                          <span>{trait.effectSummary}</span>
                          <p>{trait.description}</p>
                        </article>
                      ))
                    ) : (
                      <p>暂无稳定特质。</p>
                    )}
                  </div>
                  {selectedActor.traitProgress.length > 0 ? (
                    <div className="character-trait-progress-list" aria-label="特质进度">
                      {selectedActor.traitProgress.map((progress) => (
                        <article key={progress.traitId}>
                          <strong>
                            {progress.name} {progress.progress}/{progress.maxProgress}
                          </strong>
                          <p>{progress.reason}</p>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="character-memory-panel">
                  <h4>记忆</h4>
                  <div className="character-memory-subtitle">
                    <strong>近期记忆</strong>
                    <span>最近仍需保持精确连续性的具体往来。</span>
                  </div>
                  {renderMemoryItems(actorMemoryGroups.recent, '暂无近期记忆条目。', '近期记忆')}
                  <div className="character-memory-subtitle">
                    <strong>阶段记忆</strong>
                    <span>一段时期内多次互动形成的阶段摘要。</span>
                  </div>
                  {renderMemoryItems(actorMemoryGroups.stage, '暂无阶段记忆条目。', '阶段记忆')}
                  <div className="character-memory-subtitle">
                    <strong>长期记忆</strong>
                    <span>跨时期仍会影响人物行为与关系的经历。</span>
                  </div>
                  {renderMemoryItems(actorMemoryGroups.longTerm, '暂无长期记忆条目。', '长期记忆')}
                </section>

                  </>
                ) : visualSaveId && (imageRepository || avgOverrideRepository) ? (
                  <>
                    {avgOverrideRepository && onAvgOverrideChanged ? (
                      <AvgPortraitOverrideControl
                        actor={selectedActor}
                        visualPartitionId={visualSaveId}
                        worldpackId={state.world.worldpackId}
                        repository={avgOverrideRepository}
                        revision={avgOverrideRevision}
                        imageGeneration={avgImageGenerationService ? {
                          kind: 'portrait',
                          service: avgImageGenerationService,
                          saveId: visualSaveId,
                          context: buildAvgPortraitGenerationContext(state, selectedActor),
                          onOpenSettings: onOpenImageSettings
                        } : undefined}
                        resourceRuntime={avgResourceRuntime}
                        onChanged={onAvgOverrideChanged}
                      />
                    ) : null}
                    {imageRepository ? (
                      <CharacterVisualPanel
                        actor={selectedActor}
                        visualSaveId={visualSaveId}
                        worldYear={state.time.year}
                        repository={imageRepository}
                        createPromptConversion={createPromptConversion}
                        onOpenSettings={onOpenImageSettings}
                        onRepositoryChanged={() => {
                          setVisualRefreshKey((value) => value + 1);
                          onVisualRepositoryChanged?.();
                        }}
                      />
                    ) : null}
                  </>
                ) : null}

                </>
                )}

              </>
            ) : (
              <p className="character-empty">还没有可显示的人物。</p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
