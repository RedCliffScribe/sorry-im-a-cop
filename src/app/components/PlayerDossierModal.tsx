import {
  ATTRIBUTE_POINT_CAP,
  PLAYER_ATTRIBUTE_KEYS,
  experienceNeededForNextLevel,
  normalizePlayerProgression,
  spendPlayerAttributePoint
} from '../../domain/progression/playerProgression';
import type { Actor, AttributeBlock, GameTime, MemoryItem, RuntimeState, SecretFact } from '../../domain/runtime/types';

interface PlayerDossierModalProps {
  state: RuntimeState;
  onClose: () => void;
  onStateChange: (state: RuntimeState) => void;
}

const attributeLabels: Record<keyof AttributeBlock, string> = {
  body: '体魄',
  action: '行动',
  perception: '观察',
  thinking: '思考',
  negotiation: '交涉',
  will: '意志'
};

function formatGender(gender: RuntimeState['player']['gender']) {
  if (gender === 'male') return '男';
  if (gender === 'female') return '女';
  if (gender === 'nonbinary') return '非二元';
  return '未知';
}

function formatTime(time: GameTime): string {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function timeSortValue(time: GameTime): number {
  return (((time.year * 100 + time.month) * 100 + time.day) * 100 + time.hour) * 100 + time.minute;
}

function formatLocation(state: RuntimeState): string {
  const place = state.places[state.location.currentPlaceId];
  const scene = state.location.currentSceneId ? state.scenes[state.location.currentSceneId] : undefined;
  return [place?.name ?? state.location.currentPlaceId, scene?.name].filter(Boolean).join(' · ');
}

function compactRows(rows: Array<[string, string | number | undefined]>): Array<[string, string]> {
  return rows
    .map(([label, value]) => [label, value === undefined ? undefined : String(value)] as [string, string | undefined])
    .filter((row): row is [string, string] => Boolean(row[1]?.trim()));
}

function InfoRows({ rows }: { rows: Array<[string, string | number | undefined]> }) {
  const compacted = compactRows(rows);
  if (!compacted.length) return <p className="player-dossier-empty">暂无记录。</p>;

  return (
    <div className="player-dossier-field-list">
      {compacted.map(([label, value]) => (
        <div className="player-dossier-field-row" key={label}>
          <span className="player-dossier-field-label">{label}</span>
          <span className="player-dossier-field-value">{value}</span>
        </div>
      ))}
    </div>
  );
}

function isPlayerMemory(state: RuntimeState, memory: MemoryItem): boolean {
  if (memory.visibility === 'hidden' || memory.visibility === 'private') return false;
  if (memory.tier && memory.tier !== 'long_term') return false;
  if (memory.kind === 'player') return true;
  return memory.relatedActorIds.includes(state.player.actorId) || memory.relatedActorIds.includes('player');
}

function getPlayerRecords(state: RuntimeState): MemoryItem[] {
  return Object.values(state.memories)
    .filter((memory) => isPlayerMemory(state, memory))
    .sort(
      (left, right) =>
        timeSortValue(right.gameTime) - timeSortValue(left.gameTime) ||
        right.importance - left.importance ||
        left.memoryId.localeCompare(right.memoryId)
    )
    .slice(0, 8);
}

function getCurrentIdentityRows(
  state: RuntimeState,
  playerActor: Actor | undefined,
  age: number | undefined
): Array<[string, string | number | undefined]> {
  const commonRows: Array<[string, string | number | undefined]> = [
    ['性别', formatGender(state.player.gender)],
    ['年龄', age ? `${age}岁` : undefined],
    ['生日', state.player.birthDate],
    ['当前身份', playerActor?.publicIdentity ?? state.player.currentIdentity]
  ];

  if (state.player.currentIdentity === 'police') {
    const profile = playerActor?.roleProfiles.police;
    return [
      ...commonRows,
      ['警员编号', state.player.policeNumber],
      ['职级', profile?.rank ?? state.lawIdentity.rank],
      ['警署', profile?.stationOrPost ?? state.lawIdentity.stationOrPost],
      ['部门', profile?.department ?? state.lawIdentity.department],
      ['岗位', profile?.assignmentSummary ?? state.lawIdentity.assignmentSummary],
      ['当前位置', formatLocation(state)]
    ];
  }

  if (state.player.currentIdentity === 'gang_member') {
    const profile = playerActor?.roleProfiles.triad;
    const organizationName =
      profile?.societyName ??
      (profile?.organizationId ? state.organizations[profile.organizationId]?.name : undefined);
    return [
      ...commonRows,
      ['字头 / 圈层', organizationName],
      ['公开位置', profile?.roleTitle],
      ['身份层级', profile?.rankSummary],
      ['活动范围', profile?.territorySummary],
      ['当前位置', formatLocation(state)]
    ];
  }

  const profile = playerActor?.roleProfiles.civilian;
  const workplace = profile?.workplacePlaceId ? state.places[profile.workplacePlaceId]?.name : undefined;
  return [
    ...commonRows,
    ['公开职业', profile?.publicOccupation],
    ['工作地点', workplace],
    ['合法身份', profile?.legalStatusSummary],
    ['社区关系', profile?.communitySummary],
    ['当前位置', formatLocation(state)]
  ];
}

function getPlayerKnownPrivateFacts(state: RuntimeState): SecretFact[] {
  return Object.values(state.secretFacts)
    .filter((fact) => {
      if (!fact.playerCharacterKnown || fact.publicKnown || fact.revealState === 'publicly_revealed') return false;
      if (fact.ownerType === 'player') return fact.ownerId === state.player.actorId;
      return fact.ownerType === 'actor' && fact.ownerId === state.player.actorId;
    })
    .sort((left, right) => right.importance - left.importance || left.secretId.localeCompare(right.secretId));
}

export function PlayerDossierModal({ state, onClose, onStateChange }: PlayerDossierModalProps) {
  const playerActor = state.actors[state.player.actorId];
  const age = playerActor?.computedAge;
  const records = getPlayerRecords(state);
  const privateFacts = getPlayerKnownPrivateFacts(state);
  const progression = normalizePlayerProgression(state.player.progression);
  const nextLevelExperience = experienceNeededForNextLevel(progression.level);
  const experienceProgress = Math.min(100, (progression.experience / nextLevelExperience) * 100);

  const addAttributePoint = (attribute: keyof AttributeBlock) => {
    const result = spendPlayerAttributePoint(state.player, attribute);
    if (!result.applied) return;
    const actor = state.actors[state.player.actorId];
    onStateChange({
      ...state,
      player: result.player,
      actors: actor
        ? {
            ...state.actors,
            [state.player.actorId]: {
              ...actor,
              attributes: result.player.attributes
            }
          }
        : state.actors
    });
  };

  return (
    <div className="character-archive-backdrop" role="presentation">
      <section
        className="player-dossier-modal feature-modal-frame feature-modal-frame--utility"
        role="dialog"
        aria-modal="true"
        aria-label="主角资料"
      >
        <header className="character-archive-header">
          <div>
            <h2>主角资料</h2>
            <p>PLAYER DOSSIER</p>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="player-dossier-body">
          <section className="player-dossier-identity" aria-label="身份头部">
            <div className="player-dossier-photo" aria-hidden="true">
              {(state.player.name || playerActor?.name || '主').slice(0, 1)}
            </div>
            <div className="player-dossier-title">
              <h3>{state.player.name || playerActor?.name || '未命名'}</h3>
              {state.player.englishName || playerActor?.englishName ? <p>{state.player.englishName ?? playerActor?.englishName}</p> : null}
            </div>
            <InfoRows rows={getCurrentIdentityRows(state, playerActor, age)} />
            {privateFacts.length > 0 ? (
              <section className="player-dossier-private-facts" aria-label="私密身份事实">
                <h4>
                  私密身份事实
                  <span>主角已知 · 未公开</span>
                </h4>
                <div>
                  {privateFacts.map((fact) => (
                    <p key={fact.secretId}>{fact.summary}</p>
                  ))}
                </div>
              </section>
            ) : null}
          </section>

          <section className="player-dossier-card" aria-label="人物档案">
            <h3>人物档案</h3>
            <InfoRows
              rows={[
                ['出身背景', state.player.originBackground.name],
                ['背景摘要', state.player.originBackground.backgroundSummary],
                ['人物简介', playerActor?.profileSummary],
                ['外貌', playerActor?.appearance ?? state.player.appearance],
                ['当前衣着', playerActor?.clothing ?? state.player.clothing],
                ['性格', playerActor?.personality ?? state.player.personality],
                ['动机', playerActor?.motivation],
                ['长期目标', playerActor?.longTermGoal],
                ['价值观', playerActor?.values]
              ]}
            />

            <section className="player-progression" aria-label="等级成长">
              <div className="player-progression-header">
                <div>
                  <h4>等级成长</h4>
                  <p>Lv.{progression.level}</p>
                </div>
                <span>可用属性点 {progression.unspentAttributePoints}</span>
              </div>
              <div className="player-experience-row">
                <span>经验</span>
                <div className="player-experience-track" aria-hidden="true">
                  <span style={{ width: `${experienceProgress}%` }} />
                </div>
                <strong>{progression.experience} / {nextLevelExperience}</strong>
              </div>
              <div className="player-attribute-grid">
                {PLAYER_ATTRIBUTE_KEYS.map((attribute) => {
                  const value = state.player.attributes[attribute];
                  const disabled = progression.unspentAttributePoints <= 0 || value >= ATTRIBUTE_POINT_CAP;
                  return (
                    <div className="player-attribute-row" key={attribute}>
                      <span>{attributeLabels[attribute]}</span>
                      <strong>{value}</strong>
                      <button
                        type="button"
                        className="player-attribute-add"
                        disabled={disabled}
                        onClick={() => addAttributePoint(attribute)}
                        title={value >= ATTRIBUTE_POINT_CAP ? '该属性已达到上限' : '消耗 1 点自由属性点'}
                        aria-label={`提升${attributeLabels[attribute]}`}
                      >
                        +
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </section>

          <section className="player-dossier-card player-dossier-card--records" aria-label="长期记录">
            <h3>长期记录</h3>
            {records.length > 0 ? (
              <div className="player-dossier-record-list">
                {records.map((record) => (
                  <article key={record.memoryId}>
                    <span>
                      {formatTime(record.gameTime)} / 重要度 {record.importance}
                    </span>
                    <p>{record.text}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="player-dossier-empty">暂无主角长期记录。</p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
