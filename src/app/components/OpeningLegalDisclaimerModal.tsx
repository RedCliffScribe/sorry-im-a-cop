import { useId, useMemo, useState } from 'react';
import {
  OPENING_LEGAL_DISCLAIMER_TEXT,
  OPENING_LEGAL_DISCLAIMER_VERSION_LABEL,
  OPENING_LEGAL_IMPORTANT_NOTICE_PARAGRAPHS
} from '../legal/openingLegalDisclaimer';

interface OpeningLegalDisclaimerModalProps {
  isStarting?: boolean;
  onAccept?: () => void;
  onDecline: () => void;
  presentation?: 'full' | 'summary' | 'reference';
}

const sectionHeadingPattern = /^[一二三四五六七八九十]+、/;

export function OpeningLegalDisclaimerModal({
  isStarting = false,
  onAccept,
  onDecline,
  presentation = 'full'
}: OpeningLegalDisclaimerModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [isShowingFullDocument, setIsShowingFullDocument] = useState(
    presentation === 'full' || presentation === 'reference'
  );
  const blocks = useMemo(() => OPENING_LEGAL_DISCLAIMER_TEXT.split(/\n{2,}/), []);
  const isSummaryGate = presentation === 'summary';
  const isReference = presentation === 'reference';
  const showFullDocument = presentation === 'full' || isReference || isShowingFullDocument;
  const confirmationLabel = isSummaryGate
    ? '我已阅读并理解上述重要说明，并同意《法律声明、人工智能动态内容说明及使用条款》。'
    : '我已阅读、理解并同意上述法律声明、人工智能动态内容说明及使用条款。';

  return (
    <div className="opening-legal-backdrop">
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`opening-legal-dialog${showFullDocument ? '' : ' opening-legal-dialog--summary'}`}
        role="dialog"
      >
        <header className="opening-legal-header">
          <span className="opening-legal-kicker">
            {showFullDocument ? 'LEGAL NOTICE · AI CONTENT' : 'IMPORTANT NOTICE · AI CONTENT'}
          </span>
          <h2 id={titleId}>{showFullDocument ? '《对唔住，我系差人》' : '重要说明'}</h2>
          <p className="opening-legal-english-title">
            {showFullDocument ? "Sorry, I'm a Cop" : "《对唔住，我系差人》 · Sorry, I'm a Cop"}
          </p>
          {showFullDocument ? (
            <p className="opening-legal-document-title">法律声明、人工智能动态内容说明及使用条款</p>
          ) : null}
          <small>版本日期：{OPENING_LEGAL_DISCLAIMER_VERSION_LABEL}</small>
        </header>

        {showFullDocument ? (
          <div className="opening-legal-copy" id={descriptionId} tabIndex={0}>
            {blocks.map((block) =>
              sectionHeadingPattern.test(block) ? (
                <h3 key={block}>{block}</h3>
              ) : (
                <p key={block}>{block}</p>
              )
            )}
          </div>
        ) : (
          <div className="opening-legal-summary-copy" id={descriptionId} tabIndex={0}>
            {OPENING_LEGAL_IMPORTANT_NOTICE_PARAGRAPHS.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        )}

        {isReference ? (
          <footer className="opening-legal-footer opening-legal-footer--reference">
            <p>此入口仅供随时查阅，不会修改本机的声明同意记录。</p>
            <div className="opening-legal-actions opening-legal-actions--reference">
              <button type="button" onClick={onDecline}>关闭法律声明</button>
            </div>
          </footer>
        ) : (
          <footer className="opening-legal-footer">
            <div className="opening-legal-consent-block">
              <label className="opening-legal-confirmation">
                <input
                  checked={hasConfirmed}
                  onChange={(event) => setHasConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>{confirmationLabel}</span>
              </label>
              {isSummaryGate ? (
                <button
                  className="opening-legal-full-link"
                  type="button"
                  onClick={() => setIsShowingFullDocument((current) => !current)}
                >
                  {showFullDocument ? '返回重要说明' : '查看完整法律声明'}
                </button>
              ) : null}
            </div>
            <div className="opening-legal-actions">
              <button type="button" disabled={isStarting} onClick={onDecline}>
                {isSummaryGate ? '暂不进入' : '不同意并返回'}
              </button>
              <button type="button" disabled={!hasConfirmed || isStarting} onClick={onAccept}>
                {isStarting ? '处理中...' : isSummaryGate ? '同意并进入开局' : '同意并生成开局'}
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}
