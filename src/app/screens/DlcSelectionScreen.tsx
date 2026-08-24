import { useMemo, useState } from 'react';
import {
  getOfficialDlcWorldpackTitle,
  officialDlcManifests,
  isOfficialDlcSupportedByWorldpack
} from '../../domain/dlc/manifest';
import type { OfficialDlcManifest } from '../../domain/dlc/types';
import {
  getOfficialDlcCoverImage,
  getOfficialDlcExperienceKeywords,
  getOfficialDlcTagline,
  presentOfficialDlcCompatibility
} from './officialDlcPresentation';

interface DlcSelectionScreenProps {
  worldpackId: string;
  onBack: () => void;
  onContinue: (selectedDlcIds: string[]) => void;
  initialSelectedDlcIds?: string[];
  /** Test/preview seam; production uses only the released public catalog. */
  manifests?: readonly OfficialDlcManifest[];
}

export function DlcSelectionScreen({
  worldpackId,
  onBack,
  onContinue,
  initialSelectedDlcIds = [],
  manifests = officialDlcManifests
}: DlcSelectionScreenProps) {
  const [selectedDlcIds, setSelectedDlcIds] = useState<string[]>(() =>
    initialSelectedDlcIds.filter((dlcId) => {
      const manifest = manifests.find((item) => item.dlcId === dlcId);
      return manifest ? isOfficialDlcSupportedByWorldpack(manifest, worldpackId) : false;
    })
  );
  const supportedCount = useMemo(
    () => manifests.filter((manifest) => isOfficialDlcSupportedByWorldpack(manifest, worldpackId)).length,
    [manifests, worldpackId]
  );
  const worldpackTitle = getOfficialDlcWorldpackTitle(worldpackId);

  function toggleDlc(dlcId: string) {
    const manifest = manifests.find((item) => item.dlcId === dlcId);
    if (!manifest || !isOfficialDlcSupportedByWorldpack(manifest, worldpackId)) return;
    setSelectedDlcIds((current) =>
      current.includes(dlcId) ? current.filter((id) => id !== dlcId) : [...current, dlcId]
    );
  }

  function continueWithValidSelection() {
    onContinue(selectedDlcIds.filter((dlcId) => {
      const manifest = manifests.find((item) => item.dlcId === dlcId);
      return manifest ? isOfficialDlcSupportedByWorldpack(manifest, worldpackId) : false;
    }));
  }

  return (
    <main className="official-dlc-selection-screen">
      <header className="official-dlc-header">
        <button type="button" className="worldpack-back-button" onClick={onBack}>
          <span aria-hidden="true">←</span>
          返回世界包
        </button>
        <div className="official-dlc-heading">
          <p className="worldpack-selection-kicker">OFFICIAL EXTENSIONS</p>
          <h1>官方扩展选择</h1>
          <p>选择结果只属于这局新存档；所有官方 DLC 默认不勾选。</p>
        </div>
        <div aria-hidden="true" />
      </header>

      <div className="official-dlc-selection-world">
        <span>当前世界</span>
        <strong>{worldpackTitle}</strong>
        <small>只有完成该世界适配的扩展可以加入本局。</small>
      </div>

      <section className="official-dlc-selection-list" aria-label="本世界包可用的官方DLC">
        {manifests.length === 0 ? (
          <div className="official-dlc-empty">
            <strong>当前没有可选择的官方 DLC</strong>
            <p>你可以直接继续开局；尚未发布的官方内容不会提前写入存档。</p>
          </div>
        ) : (
          manifests.map((manifest) => {
            const compatibility = presentOfficialDlcCompatibility(manifest, worldpackId);
            const checked = selectedDlcIds.includes(manifest.dlcId);
            const keywords = getOfficialDlcExperienceKeywords(manifest);
            const coverImage = getOfficialDlcCoverImage(manifest);
            return (
              <label
                className={`official-dlc-selection-row${compatibility.supported ? '' : ' is-unsupported'}${checked ? ' is-selected' : ''}`}
                key={manifest.dlcId}
              >
                <input
                  type="checkbox"
                  aria-label={`将${manifest.title}加入本局`}
                  checked={checked}
                  disabled={!compatibility.supported}
                  onChange={() => toggleDlc(manifest.dlcId)}
                />
                <span className="official-dlc-selection-mark" aria-hidden="true">
                  {coverImage ? <img src={coverImage} alt="" /> : manifest.title.slice(0, 1)}
                </span>
                <span className="official-dlc-selection-copy">
                  <strong>{manifest.title}</strong>
                  <small className="official-dlc-selection-tagline">
                    {getOfficialDlcTagline(manifest) ?? manifest.description}
                  </small>
                  <small>{compatibility.reason}</small>
                  {keywords.length > 0 ? (
                    <span className="official-dlc-selection-keywords" aria-label="体验关键词">
                      {keywords.map((keyword) => <i key={keyword}>{keyword}</i>)}
                    </span>
                  ) : null}
                </span>
                <em>
                  <span>{compatibility.supported ? `v${manifest.version}` : compatibility.statusLabel}</span>
                  <small>{checked ? '已选择' : compatibility.supported ? '可选择' : '锁定'}</small>
                </em>
              </label>
            );
          })
        )}
      </section>

      <footer className="official-dlc-selection-footer">
        <span>已选择 {selectedDlcIds.length} 项 · 当前世界可用 {supportedCount} 项</span>
        <div>
          <button type="button" className="official-dlc-secondary-button" onClick={onBack}>
            返回
          </button>
          <button type="button" className="official-dlc-primary-button" onClick={continueWithValidSelection}>
            继续开局
          </button>
        </div>
      </footer>
    </main>
  );
}
