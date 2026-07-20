import { useMemo, useState } from 'react';
import { selectPlayerMemoryLayers } from '../../domain/memory/playerMemoryLayers';
import type { GameTime, MemoryItem, RuntimeState } from '../../domain/runtime/types';

interface MemoryArchiveModalProps {
  state: RuntimeState;
  recentRawTurnLimit?: number;
  onClose: () => void;
}

type MemoryLayerId = 'short_term' | 'mid_term' | 'long_term';

const memoryLayers: Array<{ layerId: MemoryLayerId; label: string; emptyText: string }> = [
  {
    layerId: 'short_term',
    label: '短期记忆',
    emptyText: '暂无短期记忆。'
  },
  {
    layerId: 'mid_term',
    label: '中期记忆',
    emptyText: '暂无中期记忆。'
  },
  {
    layerId: 'long_term',
    label: '长期记忆',
    emptyText: '暂无长期记忆。'
  }
];

const memoryKindLabels: Record<MemoryItem['kind'], string> = {
  turn: '经历',
  actor: '人物',
  case: '案件',
  place: '地点',
  world: '世情',
  player: '自身'
};

const certaintyLabels: Record<MemoryItem['certainty'], string> = {
  fact: '确定',
  claim: '说法',
  rumor: '传闻',
  disputed: '存疑',
  unknown: '未明'
};

function formatGameTime(time: GameTime) {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function compareMemoryByTimeAndImportance(left: MemoryItem, right: MemoryItem) {
  return (
    right.gameTime.year - left.gameTime.year ||
    right.gameTime.month - left.gameTime.month ||
    right.gameTime.day - left.gameTime.day ||
    right.gameTime.hour - left.gameTime.hour ||
    right.gameTime.minute - left.gameTime.minute ||
    right.importance - left.importance
  );
}

function relatedActorNames(state: RuntimeState, memory: MemoryItem) {
  return memory.relatedActorIds
    .map((actorId) => {
      if (actorId === 'player' || actorId === state.player.actorId) return state.player.name;
      const actor = state.actors[actorId];
      if (!actor || actor.visibility === 'hidden') return null;
      return actor.englishName ? `${actor.name} / ${actor.englishName}` : actor.name;
    })
    .filter((name): name is string => Boolean(name));
}

function relatedPlaceNames(state: RuntimeState, memory: MemoryItem) {
  return memory.relatedPlaceIds
    .map((placeId) => {
      const place = state.places[placeId];
      return place?.name;
    })
    .filter((name): name is string => Boolean(name));
}

function relatedCaseTitles(state: RuntimeState, memory: MemoryItem) {
  return memory.relatedCaseIds
    .map((caseId) => {
      const caseFile = state.cases[caseId];
      return caseFile?.visibility === 'hidden' ? null : caseFile?.title;
    })
    .filter((title): title is string => Boolean(title));
}

function MemoryRelationRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="memory-relation-row">
      <span>{label}</span>
      <strong>{values.join(' / ')}</strong>
    </div>
  );
}

function MemoryCard({ state, memory }: { state: RuntimeState; memory: MemoryItem }) {
  const actors = relatedActorNames(state, memory);
  const places = relatedPlaceNames(state, memory);
  const cases = relatedCaseTitles(state, memory);

  return (
    <article className="memory-card">
      <header>
        <span>
          {memory.periodStart && memory.periodEnd
            ? `${formatGameTime(memory.periodStart)} 至 ${formatGameTime(memory.periodEnd)}`
            : formatGameTime(memory.gameTime)}
        </span>
        <div>
          <strong>{memoryKindLabels[memory.kind]}</strong>
          <small>{certaintyLabels[memory.certainty]}</small>
        </div>
      </header>
      <div className="memory-card-body">
        <p>{memory.text}</p>
        <footer>
          <MemoryRelationRow label="人物" values={actors} />
          <MemoryRelationRow label="地点" values={places} />
          <MemoryRelationRow label="案件" values={cases} />
        </footer>
      </div>
    </article>
  );
}

export function MemoryArchiveModal({ state, recentRawTurnLimit = 12, onClose }: MemoryArchiveModalProps) {
  const [activeLayerId, setActiveLayerId] = useState<MemoryLayerId>('short_term');
  const memoriesByLayer = useMemo(
    () => {
      const layers = selectPlayerMemoryLayers(state, recentRawTurnLimit);
      return {
        short_term: [...layers.shortTerm].sort(compareMemoryByTimeAndImportance),
        mid_term: [...layers.midTerm].sort(compareMemoryByTimeAndImportance),
        long_term: [...layers.longTerm].sort(compareMemoryByTimeAndImportance)
      } satisfies Record<MemoryLayerId, MemoryItem[]>;
    },
    [recentRawTurnLimit, state]
  );
  const layerCounts = useMemo(
    () =>
      memoryLayers.reduce<Record<MemoryLayerId, number>>(
        (counts, layer) => {
          counts[layer.layerId] = memoriesByLayer[layer.layerId].length;
          return counts;
        },
        { short_term: 0, mid_term: 0, long_term: 0 }
      ),
    [memoriesByLayer]
  );
  const activeLayer = memoryLayers.find((layer) => layer.layerId === activeLayerId) ?? memoryLayers[0];
  const activeMemories = memoriesByLayer[activeLayer.layerId];

  return (
    <div className="character-archive-backdrop" role="presentation">
      <section
        className="memory-archive-modal archive-info-modal archive-info-modal--memory feature-modal-frame"
        role="dialog"
        aria-modal="true"
        aria-label="回忆"
      >
        <header className="character-archive-header">
          <div>
            <h2>回忆</h2>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="memory-layer-tabs" role="tablist" aria-label="回忆分层">
          {memoryLayers.map((layer) => (
            <button
              key={layer.layerId}
              type="button"
              role="tab"
              aria-selected={activeLayerId === layer.layerId}
              className={activeLayerId === layer.layerId ? 'active' : undefined}
              onClick={() => setActiveLayerId(layer.layerId)}
            >
              <strong>{layer.label}</strong>
              <span>{layerCounts[layer.layerId]}</span>
            </button>
          ))}
        </div>

        <section className="memory-archive-content" role="tabpanel" aria-label={activeLayer.label}>
          {activeMemories.length ? (
            activeMemories.map((memory) => <MemoryCard key={memory.memoryId} state={state} memory={memory} />)
          ) : (
            <div className="memory-empty-state">{activeLayer.emptyText}</div>
          )}
        </section>
      </section>
    </div>
  );
}
