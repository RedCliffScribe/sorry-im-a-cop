import { useState } from 'react';
import {
  officialDlcManifests,
  officialDlcRuntimeManifests,
  getOfficialDlcRuntimeManifest
} from '../../domain/dlc/manifest';
import type { OfficialDlcManifest, SaveDlcStatus } from '../../domain/dlc/types';
import type { ExistingSaveDlcCandidate } from '../../domain/dlc/existingSave';
import type { RuntimeState } from '../../domain/runtime/types';
import {
  getOfficialDlcCoverImage,
  getOfficialDlcContentHighlights,
  getOfficialDlcExperienceKeywords,
  getOfficialDlcTagline,
  presentOfficialDlcCompatibility
} from './officialDlcPresentation';

interface OfficialDlcScreenProps {
  currentState?: RuntimeState | null;
  onBack: () => void;
  onStatusChange?: (dlcId: string, status: SaveDlcStatus) => void;
  onVersionUpgrade?: (dlcId: string, targetVersion: string) => void;
  onListExistingSaveCandidates?: (dlcId: string) => Promise<ExistingSaveDlcCandidate[]>;
  onAttachToExistingSave?: (saveId: string, dlcId: string) => Promise<void>;
  /** Test/preview seam; production uses only the released public catalog. */
  availableManifests?: readonly OfficialDlcManifest[];
  /** Keeps frozen save-compatible manifests separate from the public catalog. */
  runtimeManifests?: readonly OfficialDlcManifest[];
}

type DlcTab = 'available' | 'current';

const statusLabels: Record<SaveDlcStatus, string> = {
  active: '进行中',
  paused: '已暂停',
  completed: '已完成'
};

const statusDescriptions: Record<SaveDlcStatus, string> = {
  active: '扩展会在合适时机继续参与这局世界，但不会覆盖玩家当前明确行动。',
  paused: '新的扩展内容已暂停；已经发生的人物、关系、新闻与世界事实会继续保留。',
  completed: '主要内容已经结束；人物、关系和这段经历留下的世界影响会继续保留。'
};

const typeLabels: Record<OfficialDlcManifest['type'], string> = {
  narrative: '叙事扩展',
  system: '系统扩展',
  hybrid: '综合扩展'
};

export function OfficialDlcScreen({
  currentState,
  onBack,
  onStatusChange,
  onVersionUpgrade,
  onListExistingSaveCandidates,
  onAttachToExistingSave,
  availableManifests = officialDlcManifests,
  runtimeManifests = officialDlcRuntimeManifests
}: OfficialDlcScreenProps) {
  const [tab, setTab] = useState<DlcTab>('available');
  const [attachmentManifest, setAttachmentManifest] = useState<OfficialDlcManifest | null>(null);
  const [attachmentCandidates, setAttachmentCandidates] = useState<ExistingSaveDlcCandidate[]>([]);
  const [isAttachmentLoading, setIsAttachmentLoading] = useState(false);
  const [attachingSaveId, setAttachingSaveId] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  async function openExistingSaveAttachment(manifest: OfficialDlcManifest) {
    if (!onListExistingSaveCandidates || !onAttachToExistingSave) return;
    setAttachmentManifest(manifest);
    setAttachmentCandidates([]);
    setAttachmentError(null);
    setIsAttachmentLoading(true);
    try {
      setAttachmentCandidates(await onListExistingSaveCandidates(manifest.dlcId));
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : '读取已有存档失败。');
    } finally {
      setIsAttachmentLoading(false);
    }
  }

  async function attachToExistingSave(candidate: ExistingSaveDlcCandidate) {
    if (!attachmentManifest || !onAttachToExistingSave || !candidate.eligibility.eligible) return;
    const confirmed = window.confirm(
      `将《${attachmentManifest.title}》加入“${candidate.saveName}”？\n\n加入前会自动建立独立备份。扩展从当前游戏时间开始寻找自然入口，不补写过去，也不会改动已有角色、关系、案件、新闻或记忆。`
    );
    if (!confirmed) return;

    setAttachingSaveId(candidate.saveId);
    setAttachmentError(null);
    try {
      await onAttachToExistingSave(candidate.saveId, attachmentManifest.dlcId);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : '加入 DLC 失败，原存档未被改动。');
      setAttachingSaveId(null);
    }
  }

  return (
    <main className="official-dlc-screen">
      <header className="official-dlc-header">
        <button type="button" className="worldpack-back-button" onClick={onBack}>
          <span aria-hidden="true">←</span>
          返回首页
        </button>
        <div className="official-dlc-heading">
          <p className="worldpack-selection-kicker">OFFICIAL STORY ARCHIVE</p>
          <h1>DLC 剧情</h1>
          <p>浏览官方剧情档案，或管理当前存档已经选择的扩展。</p>
        </div>
        <div aria-hidden="true" />
      </header>

      <nav className="official-dlc-tabs" aria-label="DLC内容分类">
        <button
          type="button"
          className={tab === 'available' ? 'is-active' : undefined}
          aria-pressed={tab === 'available'}
          onClick={() => setTab('available')}
        >
          可用 DLC
        </button>
        <button
          type="button"
          className={tab === 'current' ? 'is-active' : undefined}
          aria-pressed={tab === 'current'}
          onClick={() => setTab('current')}
        >
          当前 DLC 内容
        </button>
      </nav>

      <section className="official-dlc-content" aria-live="polite">
        {tab === 'available' ? (
          <AvailableDlcList
            manifests={availableManifests}
            onAttachToExistingSave={
              onListExistingSaveCandidates && onAttachToExistingSave
                ? (manifest) => void openExistingSaveAttachment(manifest)
                : undefined
            }
          />
        ) : (
          <CurrentDlcList
            currentState={currentState}
            onStatusChange={onStatusChange}
            onVersionUpgrade={onVersionUpgrade}
            availableManifests={availableManifests}
            runtimeManifests={runtimeManifests}
          />
        )}
      </section>

      {attachmentManifest ? (
        <ExistingSaveDlcAttachmentDialog
          manifest={attachmentManifest}
          candidates={attachmentCandidates}
          isLoading={isAttachmentLoading}
          attachingSaveId={attachingSaveId}
          error={attachmentError}
          onAttach={(candidate) => void attachToExistingSave(candidate)}
          onClose={() => {
            if (attachingSaveId) return;
            setAttachmentManifest(null);
            setAttachmentCandidates([]);
            setAttachmentError(null);
          }}
        />
      ) : null}
    </main>
  );
}

function OfficialDlcArchiveVisual({
  manifest
}: {
  manifest: OfficialDlcManifest;
}) {
  const coverImage = getOfficialDlcCoverImage(manifest);
  return (
    <div
      className="official-dlc-card-visual"
      data-dlc-type={manifest.type}
      data-has-cover={coverImage ? 'true' : 'false'}
    >
      {coverImage ? (
        <img src={coverImage} alt={`${manifest.title}封面`} />
      ) : null}
      <span>OFFICIAL ARCHIVE</span>
      <strong aria-hidden="true">{manifest.title.slice(0, 1)}</strong>
      <small>{typeLabels[manifest.type]}</small>
    </div>
  );
}

function DlcKeywordList({ keywords }: { keywords: readonly string[] }) {
  if (keywords.length === 0) return null;
  return (
    <ul className="official-dlc-keywords" aria-label="体验关键词">
      {keywords.map((keyword) => <li key={keyword}>{keyword}</li>)}
    </ul>
  );
}

function DlcContentHighlights({ manifest }: { manifest: OfficialDlcManifest }) {
  const highlights = getOfficialDlcContentHighlights(manifest);
  if (highlights.length === 0) return null;
  return (
    <div className="official-dlc-highlights">
      <strong>收录内容</strong>
      <ul>
        {highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
      </ul>
    </div>
  );
}

function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = candidate.split('.').map((part) => Number(part));
  const currentParts = current.split('.').map((part) => Number(part));
  if (
    candidateParts.some((part) => !Number.isInteger(part) || part < 0) ||
    currentParts.some((part) => !Number.isInteger(part) || part < 0)
  ) {
    return false;
  }
  const length = Math.max(candidateParts.length, currentParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (candidateParts[index] ?? 0) - (currentParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

function AvailableDlcList({
  manifests,
  onAttachToExistingSave
}: {
  manifests: readonly OfficialDlcManifest[];
  onAttachToExistingSave?: (manifest: OfficialDlcManifest) => void;
}) {
  if (manifests.length === 0) {
    return (
      <div className="official-dlc-empty">
        <strong>当前没有已发布的官方 DLC</strong>
        <p>这里会展示可用于新存档的官方剧情档案。尚未发布的内容不会提前出现在选择列表。</p>
      </div>
    );
  }

  return (
    <div className="official-dlc-list">
      {manifests.map((manifest) => (
        <article className="official-dlc-card" key={manifest.dlcId}>
          <OfficialDlcArchiveVisual manifest={manifest} />
          <div className="official-dlc-card-copy">
            <div className="official-dlc-card-heading">
              <div>
                <p className="official-dlc-card-kicker">{typeLabels[manifest.type]}</p>
                <h2>{manifest.title}</h2>
              </div>
              <span>当前官方版本 v{manifest.version}</span>
            </div>
            {getOfficialDlcTagline(manifest) ? (
              <p className="official-dlc-card-tagline">{getOfficialDlcTagline(manifest)}</p>
            ) : null}
            <p>{manifest.description}</p>
            <DlcKeywordList keywords={getOfficialDlcExperienceKeywords(manifest)} />
            <DlcContentHighlights manifest={manifest} />
            <div className="official-dlc-compatibility" aria-label="支持世界包">
              {manifest.worldCompatibility.map((compatibility) => {
                const presentation = presentOfficialDlcCompatibility(
                  manifest,
                  compatibility.worldpackId
                );
                return (
                  <div
                    className={presentation.supported ? 'is-supported' : 'is-unsupported'}
                    key={compatibility.worldpackId}
                  >
                    <span>
                      <strong>{presentation.worldpackTitle}</strong>
                      <small>{presentation.statusLabel}</small>
                    </span>
                    <p>{presentation.reason}</p>
                  </div>
                );
              })}
            </div>
            <p className="official-dlc-card-note">
              新游戏可在选择世界包后直接勾选；兼容的已有存档也可以从当前游戏时间安全加入。
            </p>
            {manifest.type === 'narrative' && onAttachToExistingSave ? (
              <button
                type="button"
                className="official-dlc-attach-button"
                onClick={() => onAttachToExistingSave(manifest)}
              >
                加入已有存档
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function ExistingSaveDlcAttachmentDialog({
  manifest,
  candidates,
  isLoading,
  attachingSaveId,
  error,
  onAttach,
  onClose
}: {
  manifest: OfficialDlcManifest;
  candidates: readonly ExistingSaveDlcCandidate[];
  isLoading: boolean;
  attachingSaveId: string | null;
  error: string | null;
  onAttach: (candidate: ExistingSaveDlcCandidate) => void;
  onClose: () => void;
}) {
  const eligibleCount = candidates.filter((candidate) => candidate.eligibility.eligible).length;
  return (
    <div className="official-dlc-attachment-overlay" role="presentation">
      <section
        className="official-dlc-attachment-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`将${manifest.title}加入已有存档`}
      >
        <header>
          <div>
            <p className="official-dlc-card-kicker">ADD TO EXISTING SAVE</p>
            <h2>将《{manifest.title}》加入已有存档</h2>
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(attachingSaveId)}>
            关闭
          </button>
        </header>

        <div className="official-dlc-attachment-notice">
          <strong>从存档当前时间开始</strong>
          <p>不会补写过去，不会重置人物、关系、案件、新闻或记忆；确认后会先自动建立一份加入前备份。</p>
        </div>

        {isLoading ? (
          <p className="official-dlc-attachment-state">正在审计已有存档……</p>
        ) : candidates.length === 0 ? (
          <p className="official-dlc-attachment-state">当前浏览器中没有可供选择的存档。</p>
        ) : (
          <>
            <p className="official-dlc-attachment-summary">
              找到 {candidates.length} 份存档，其中 {eligibleCount} 份可以加入。
            </p>
            <ul className="official-dlc-attachment-list" aria-label="已有存档列表">
              {candidates.map((candidate) => (
                <li
                  key={candidate.saveId}
                  data-eligible={candidate.eligibility.eligible ? 'true' : 'false'}
                >
                  <div>
                    <strong>{candidate.saveName}</strong>
                    <span>{candidate.playerName} · 回合 {candidate.turnCounter}</span>
                    <small>游戏时间：{candidate.gameDateLabel}</small>
                    <p>{candidate.eligibility.reason}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!candidate.eligibility.eligible || Boolean(attachingSaveId)}
                    onClick={() => onAttach(candidate)}
                  >
                    {attachingSaveId === candidate.saveId ? '正在加入并读取…' : '加入并读取'}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {error ? <p className="official-dlc-attachment-error" role="alert">{error}</p> : null}
      </section>
    </div>
  );
}

function CurrentDlcList({
  currentState,
  onStatusChange,
  onVersionUpgrade,
  availableManifests,
  runtimeManifests
}: Pick<OfficialDlcScreenProps, 'currentState' | 'onStatusChange' | 'onVersionUpgrade'> & {
  availableManifests: readonly OfficialDlcManifest[];
  runtimeManifests: readonly OfficialDlcManifest[];
}) {
  if (!currentState) {
    return (
      <div className="official-dlc-empty">
        <strong>当前没有正在运行的存档</strong>
        <p>开始或读取游戏后，这里会显示该存档已经选择的官方 DLC。</p>
      </div>
    );
  }

  const bindings = currentState.world.officialDlcBindings ?? [];
  if (bindings.length === 0) {
    return (
      <div className="official-dlc-empty">
        <strong>本存档没有绑定 DLC</strong>
        <p>这是正常状态。你可以切换到“可用 DLC”，主动把兼容扩展加入已有存档；系统不会自动添加。</p>
      </div>
    );
  }

  return (
    <div className="official-dlc-list">
      {bindings.map((binding) => {
        const manifest = getOfficialDlcRuntimeManifest(
          binding.dlcId,
          binding.version,
          runtimeManifests
        );
        const catalogManifest = availableManifests.find((item) => item.dlcId === binding.dlcId);
        const title = manifest?.title ?? '旧版官方 DLC';
        const type = manifest?.type ?? 'narrative';
        const compatibility = manifest
          ? presentOfficialDlcCompatibility(manifest, currentState.world.worldpackId)
          : undefined;
        const versionDiffers = catalogManifest?.version !== undefined
          && catalogManifest.version !== binding.version;
        const upgradeAvailable = Boolean(
          manifest &&
          catalogManifest &&
          isNewerVersion(catalogManifest.version, binding.version) &&
          runtimeManifests.some(
            (item) => item.dlcId === binding.dlcId && item.version === catalogManifest.version
          )
        );

        return (
          <article className="official-dlc-card" data-dlc-status={binding.status} key={binding.dlcId}>
            {manifest ? (
              <OfficialDlcArchiveVisual manifest={manifest} />
            ) : (
              <div
                className="official-dlc-card-visual"
                data-dlc-type={type}
                data-has-cover="false"
              >
                <span>OFFICIAL ARCHIVE</span>
                <strong aria-hidden="true">{title.slice(0, 1)}</strong>
                <small>{typeLabels[type]}</small>
              </div>
            )}
            <div className="official-dlc-card-copy">
              <div className="official-dlc-card-heading">
                <div>
                  <p className="official-dlc-card-kicker">{typeLabels[type]}</p>
                  <h2>{title}</h2>
                </div>
                <span className={`official-dlc-status is-${binding.status}`}>
                  {statusLabels[binding.status]}
                </span>
              </div>

              {manifest ? (
                <>
                  {getOfficialDlcTagline(manifest) ? (
                    <p className="official-dlc-card-tagline">{getOfficialDlcTagline(manifest)}</p>
                  ) : null}
                  <p>{manifest.description}</p>
                  <DlcKeywordList keywords={getOfficialDlcExperienceKeywords(manifest)} />
                  <DlcContentHighlights manifest={manifest} />
                </>
              ) : (
                <p>本存档保留了一项旧版官方扩展。当前目录缺少其展示资料，但原有绑定仍会按存档记录保留。</p>
              )}

              <dl className="official-dlc-metadata">
                <div>
                  <dt>存档版本</dt>
                  <dd>v{binding.version}</dd>
                </div>
                <div>
                  <dt>当前世界</dt>
                  <dd>
                    {compatibility
                      ? `${compatibility.worldpackTitle} · ${compatibility.statusLabel}`
                      : '旧版兼容记录'}
                  </dd>
                </div>
                <div>
                  <dt>当前状态</dt>
                  <dd>{statusLabels[binding.status]}</dd>
                </div>
              </dl>

              <p className="official-dlc-card-note">{statusDescriptions[binding.status]}</p>
              {versionDiffers ? (
                <p className="official-dlc-version-note">
                  官方目录当前版本为 v{catalogManifest.version}；本存档继续使用原绑定版本，不会自动升级。
                </p>
              ) : catalogManifest ? null : (
                <p className="official-dlc-version-note">这项内容当前不提供给新存档选择，但不会影响已有存档继续读取。</p>
              )}

              {upgradeAvailable && onVersionUpgrade && binding.status !== 'completed' ? (
                <button
                  type="button"
                  className="official-dlc-upgrade-button"
                  onClick={() => {
                    const targetVersion = catalogManifest!.version;
                    if (window.confirm(
                      `将本存档的${title}升级至 v${targetVersion}？\n\n新剧情会从当前游戏时间开始寻找自然入口；既有《午夜末班车》剧情弧、人物、记忆和世界事实都会保留，不会补写过去。`
                    )) {
                      onVersionUpgrade(binding.dlcId, targetVersion);
                    }
                  }}
                >
                  升级本存档至 v{catalogManifest!.version}
                </button>
              ) : null}

              {manifest?.type === 'narrative' && onStatusChange && binding.status !== 'completed' ? (
                <button
                  type="button"
                  className="official-dlc-status-button"
                  onClick={() =>
                    onStatusChange(
                      binding.dlcId,
                      binding.status === 'paused' ? 'active' : 'paused'
                    )
                  }
                >
                  {binding.status === 'paused' ? '恢复后续剧情' : '暂停后续剧情'}
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
