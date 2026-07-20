import { useMemo, useState } from 'react';
import { formatPoliceText } from '../../domain/police/policeTerminology';
import { isAdultFemaleActorAt } from '../../domain/runtime/actorAge';
import { normalizeActorFemaleProfile } from '../../domain/runtime/femaleProfile';
import { removeActorFromRuntimeState } from '../../domain/runtime/removeActor';
import type {
  Actor,
  ActorAdultPrivateProfile,
  ActorFemaleProfile,
  ActorFemaleRelationshipEdge,
  AttributeBlock,
  MemoryItem,
  RuntimeState
} from '../../domain/runtime/types';

interface CharacterArchiveModalProps {
  state: RuntimeState;
  onClose: () => void;
  onStateChange?: (state: RuntimeState) => void;
  showAdultPrivateProfiles?: boolean;
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

function AdultPrivateProfileBlock({ profile }: { profile: ActorAdultPrivateProfile }) {
  const womb = profile.womb;
  const wombRecords = womb?.records ?? [];
  const pregnancy = womb?.pregnancy;
  const visiblePaternity =
    pregnancy?.paternityCandidates.filter((candidate) => candidate.visibility !== 'hidden') ?? [];
  const pregnancyHistory = womb?.pregnancyHistory ?? [];

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
                {visiblePaternity.length > 0 ? (
                  <>
                    <dt>已知父亲候选</dt>
                    <dd>
                      {visiblePaternity.map((candidate) => candidate.name ?? candidate.actorId ?? '身份未明').join('、')}
                    </dd>
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
              {pregnancy.status === 'pending_check' ? <small>结果尚未揭晓，存档与读档不会重新掷骰。</small> : null}
            </div>
          ) : womb?.lastPregnancyCheck ? (
            <div className="character-pregnancy-last-check">
              最近验孕：{formatProfileTime(womb.lastPregnancyCheck.checkedAt)} ·{' '}
              {womb.lastPregnancyCheck.result === 'positive' ? '阳性' : '阴性'}
            </div>
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
                    <small>{item.outcome === 'live_birth' ? '活产' : '妊娠终止'}</small>
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
  showAdultPrivateProfiles = true
}: CharacterArchiveModalProps) {
  const [search, setSearch] = useState('');
  const [importantOnly, setImportantOnly] = useState(false);
  const [presentOnly, setPresentOnly] = useState(false);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [pendingDeleteActorId, setPendingDeleteActorId] = useState<string | null>(null);

  const archiveActors = useMemo(
    () =>
      Object.values(state.actors)
        .filter((actor) => shouldShowInArchive(actor, state.player.actorId))
        .sort(sortActors),
    [state]
  );

  const filteredActors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return archiveActors.filter((actor) => {
      if (importantOnly && actor.importance < 60) return false;
      if (presentOnly && actor.presence !== 'present' && actor.presence !== 'nearby') return false;
      if (!query) return true;
      return actorSearchText(actor, getActorPlaceName(state, actor)).includes(query);
    });
  }, [archiveActors, importantOnly, presentOnly, search, state]);

  const selectedActor =
    filteredActors.find((actor) => actor.actorId === selectedActorId) ?? filteredActors[0] ?? archiveActors[0];
  const roleLines = selectedActor ? formatRoleProfile(selectedActor) : [];
  const recentActorMemories = selectedActor ? getRecentActorMemories(state, selectedActor.actorId) : [];
  const actorMemoryGroups = splitActorMemoriesByTier(recentActorMemories);
  const presentCount = archiveActors.filter((actor) => actor.presence === 'present' || actor.presence === 'nearby').length;
  const importantCount = archiveActors.filter((actor) => actor.importance >= 60).length;
  const selectedFemaleProfile = normalizeActorFemaleProfile(selectedActor?.femaleProfile);
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
                  <div className="character-avatar" aria-hidden="true">
                    {selectedActor.name.slice(0, 1)}
                  </div>
                  <div>
                    <h3>{formatActorName(selectedActor)}</h3>
                    <p>
                      {identityLabels[selectedActor.currentIdentity]} / {selectedActor.publicIdentity ?? selectedActor.positionSummary}
                    </p>
                    <div className="character-detail-tags">
                      <span>{presenceLabels[selectedActor.presence]}</span>
                      <span>{genderLabels[selectedActor.gender]}{selectedActor.computedAge ? ` ${selectedActor.computedAge}岁` : ''}</span>
                      <span>往来度 {selectedActor.interactionScore}</span>
                    </div>
                  </div>
                  {onStateChange ? (
                    <button
                      type="button"
                      className="character-delete-button"
                      onClick={() => setPendingDeleteActorId(selectedActor.actorId)}
                    >
                      删除人物
                    </button>
                  ) : null}
                </div>

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
            ) : (
              <p className="character-empty">还没有可显示的人物。</p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
