import { useEffect, useState } from 'react';
import type { AiSettings } from '../../domain/settings/types';
import hongKongBackdrop from '../../assets/storypack/1988.webp';
import homeTitleMark from '../../assets/ui/home-title-hk-retro.webp';
import { resolveAppLocale, type AppLocale } from '../../domain/localization/appLocale';
import { ChangelogModal } from '../components/ChangelogModal';
import { FirstUseGuideHint, FirstUseGuideModal } from '../components/FirstUseGuide';
import { OpeningLegalDisclaimerModal } from '../components/OpeningLegalDisclaimerModal';
import {
  hasAcceptedOpeningLegalDisclaimer,
  OPENING_LEGAL_NOTICE_CONTACT_ADDRESS,
  recordOpeningLegalDisclaimerAcceptance
} from '../legal/openingLegalDisclaimer';
import {
  recordFirstUseGuideDismissal,
  shouldOfferFirstUseGuide
} from '../onboarding/firstUseGuide';
import { recordDailyChangelogView, shouldShowDailyChangelog } from '../changelog/releaseNotes';
import {
  APP_COPYRIGHT_OWNER,
  APP_COPYRIGHT_YEAR,
  APP_SOURCE_REPOSITORY_URL,
  APP_VERSION_LABEL,
  getAppEditionLabel
} from '../releaseIdentity';
import type { SettingsDestination } from '../settings/settingsNavigation';

type HomeLegalPresentation = 'summary' | 'reference';

interface HomeScreenProps {
  settings: AiSettings;
  isSettingsLoaded: boolean;
  onStart: () => void;
  onLoad: () => void;
  onSettings: (destination?: SettingsDestination) => void;
  onLanguageChange: (locale: AppLocale) => void;
  onCustomContent?: () => void;
  onCreativeWorkshop?: () => void;
  onOfficialDlc?: () => void;
}

export function HomeScreen({
  settings,
  isSettingsLoaded,
  onStart,
  onLoad,
  onSettings,
  onLanguageChange,
  onCustomContent,
  onCreativeWorkshop,
  onOfficialDlc
}: HomeScreenProps) {
  const [legalPresentation, setLegalPresentation] = useState<HomeLegalPresentation | null>(null);
  const [isFirstUseGuideOpen, setIsFirstUseGuideOpen] = useState(false);
  const [isFirstUseHintVisible, setIsFirstUseHintVisible] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const locale = resolveAppLocale(settings.game.language);
  const isTraditional = locale === 'zh-Hant-HK';
  const workshopEnabled = import.meta.env.DEV || import.meta.env.VITE_WORKSHOP_ENABLED === 'true';

  useEffect(() => {
    if (!isSettingsLoaded) return;
    setIsFirstUseHintVisible(shouldOfferFirstUseGuide(settings));
  }, [isSettingsLoaded, settings]);

  useEffect(() => {
    if (!isSettingsLoaded || !shouldShowDailyChangelog()) return;
    recordDailyChangelogView();
    setIsChangelogOpen(true);
  }, [isSettingsLoaded]);

  function handleStartRequest() {
    if (hasAcceptedOpeningLegalDisclaimer()) {
      onStart();
      return;
    }

    setLegalPresentation('summary');
  }

  function handleAcceptLegalNotice() {
    recordOpeningLegalDisclaimerAcceptance();
    setLegalPresentation(null);
    onStart();
  }

  function dismissFirstUseGuide() {
    recordFirstUseGuideDismissal();
    setIsFirstUseHintVisible(false);
    setIsFirstUseGuideOpen(false);
  }

  function openGuideDestination(destination: SettingsDestination) {
    setIsFirstUseGuideOpen(false);
    onSettings(destination);
  }

  function openCustomContentWorkshop() {
    if (onCustomContent) {
      onCustomContent();
      return;
    }
    window.location.assign('/custom-content');
  }

  function openCreativeWorkshop() {
    if (onCreativeWorkshop) {
      onCreativeWorkshop();
      return;
    }
    window.location.assign('/workshop');
  }

  function openOfficialDlc() {
    onOfficialDlc?.();
  }

  return (
    <main className="home-screen">
      <svg
        className="home-backdrop"
        viewBox="0 0 1434 1024"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <clipPath id="home-neon-title-clip">
            <path d="M156 252h104v236H156z" />
          </clipPath>
          <clipPath id="home-neon-figure-clip">
            <path d="M254 250h126v246H254z" />
          </clipPath>
          <clipPath id="home-neon-side-signs-clip">
            <path d="M350 456h61v139H350z" />
          </clipPath>
          <radialGradient id="home-police-red-glow">
            <stop offset="0" stopColor="#ff553f" stopOpacity="0.95" />
            <stop offset="0.3" stopColor="#e42c24" stopOpacity="0.5" />
            <stop offset="1" stopColor="#d71f1f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="home-police-blue-glow">
            <stop offset="0" stopColor="#8ed7ff" stopOpacity="0.95" />
            <stop offset="0.3" stopColor="#258bd8" stopOpacity="0.5" />
            <stop offset="1" stopColor="#1768be" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="home-society-lamp-glow">
            <stop offset="0" stopColor="#ffe6aa" stopOpacity="0.62" />
            <stop offset="0.42" stopColor="#d99a48" stopOpacity="0.24" />
            <stop offset="1" stopColor="#8a4518" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="home-society-table-glow">
            <stop offset="0" stopColor="#f4bd68" stopOpacity="0.2" />
            <stop offset="0.55" stopColor="#b56524" stopOpacity="0.08" />
            <stop offset="1" stopColor="#6d3517" stopOpacity="0" />
          </radialGradient>
        </defs>

        <image href={hongKongBackdrop} width="1434" height="1024" />
        <image
          className="home-neon-copy home-neon-title-copy"
          href={hongKongBackdrop}
          width="1434"
          height="1024"
          clipPath="url(#home-neon-title-clip)"
        />
        <image
          className="home-neon-copy home-neon-figure-copy"
          href={hongKongBackdrop}
          width="1434"
          height="1024"
          clipPath="url(#home-neon-figure-clip)"
        />
        <image
          className="home-neon-copy home-neon-side-signs-copy"
          href={hongKongBackdrop}
          width="1434"
          height="1024"
          clipPath="url(#home-neon-side-signs-clip)"
        />

        <g className="home-police-lights">
          <ellipse
            className="home-police-flash home-police-flash-red"
            cx="684"
            cy="552"
            rx="48"
            ry="28"
            fill="url(#home-police-red-glow)"
          />
          <ellipse
            className="home-police-flash home-police-flash-blue"
            cx="704"
            cy="552"
            rx="48"
            ry="28"
            fill="url(#home-police-blue-glow)"
          />
        </g>

        <g className="home-harbour-pinlights">
          <circle cx="792" cy="382" r="2.1" />
          <circle cx="817" cy="419" r="1.8" />
          <circle cx="842" cy="366" r="2.2" />
          <circle cx="873" cy="433" r="1.7" />
          <circle cx="906" cy="352" r="2" />
          <circle cx="931" cy="396" r="1.6" />
          <circle cx="958" cy="336" r="2.1" />
          <circle cx="982" cy="424" r="1.7" />
          <circle cx="1011" cy="372" r="2" />
          <circle cx="1048" cy="302" r="1.8" />
          <circle cx="1074" cy="389" r="2.1" />
          <circle cx="1102" cy="445" r="1.6" />
          <circle cx="1144" cy="342" r="2" />
          <circle cx="1176" cy="410" r="1.7" />
          <circle cx="1210" cy="365" r="2.1" />
          <circle cx="1241" cy="438" r="1.7" />
        </g>

        <ellipse
          className="home-society-lamp"
          cx="1191"
          cy="695"
          rx="82"
          ry="38"
          fill="url(#home-society-lamp-glow)"
        />
        <ellipse
          className="home-society-table-light"
          cx="1178"
          cy="804"
          rx="132"
          ry="68"
          fill="url(#home-society-table-glow)"
        />
      </svg>
      <div className="home-shade" aria-hidden="true" />
      <div className="home-language-switch" role="group" aria-label="Language / 语言" data-locale-preserve="true">
        <button
          type="button"
          aria-pressed={!isTraditional}
          className={!isTraditional ? 'active' : undefined}
          onClick={() => onLanguageChange('zh-CN')}
        >
          简体中文
        </button>
        <span aria-hidden="true">/</span>
        <button
          type="button"
          aria-pressed={isTraditional}
          className={isTraditional ? 'active' : undefined}
          onClick={() => onLanguageChange('zh-Hant-HK')}
        >
          繁體中文
        </button>
      </div>
      <section className="home-panel" aria-label="主菜单">
        <h1 className="home-title-heading">
          <span className="visually-hidden">{isTraditional ? '對唔住，我係差人' : '对唔住，我系差人'}</span>
          <img
            className="home-title-mark"
            src={homeTitleMark}
            alt=""
            aria-hidden="true"
          />
        </h1>
        <p className="home-english-title">Sorry, I'm a Cop</p>
        <div className="home-actions">
          <button type="button" data-index="01" aria-label="开始游戏" onClick={handleStartRequest}>
            开始游戏
          </button>
          <button type="button" data-index="02" aria-label="读取游戏" onClick={onLoad}>
            读取游戏
          </button>
          <button
            type="button"
            data-index="03"
            aria-label="自定义内容"
            onClick={openCustomContentWorkshop}
          >
            自定义内容
          </button>
          <button
            type="button"
            data-index="04"
            aria-label="官方DLC"
            onClick={openOfficialDlc}
          >
            官方DLC
          </button>
          {workshopEnabled ? (
            <button
              type="button"
              data-index="05"
              aria-label="创意工坊"
              onClick={openCreativeWorkshop}
            >
              创意工坊
            </button>
          ) : null}
          <button type="button" data-index="06" aria-label="设置" onClick={() => onSettings('api')}>
            设置
          </button>
          <button
            type="button"
            data-index="07"
            aria-label="新手引导"
            onClick={() => setIsFirstUseGuideOpen(true)}
          >
            新手引导
          </button>
        </div>
        {isFirstUseHintVisible ? (
          <FirstUseGuideHint
            onOpen={() => setIsFirstUseGuideOpen(true)}
            onDismiss={dismissFirstUseGuide}
          />
        ) : null}
      </section>
      <button
        type="button"
        className="home-changelog-button"
        aria-label="打开更新日志"
        onClick={() => setIsChangelogOpen(true)}
      >
        <span>更新日志</span>
        <small>CHANGELOG</small>
      </button>
      <footer className="home-release-footer" aria-label="版本、版权与法律信息" role="group">
        <div className="home-release-version">
          <strong>{APP_VERSION_LABEL}</strong>
          <span>{getAppEditionLabel(locale)}</span>
        </div>
        <p>© {APP_COPYRIGHT_YEAR} {APP_COPYRIGHT_OWNER} · 非商业本地互动叙事游戏</p>
        <nav aria-label="法律、源码与联系">
          <button type="button" onClick={() => setLegalPresentation('reference')}>
            法律声明
          </button>
          <a href={APP_SOURCE_REPOSITORY_URL} target="_blank" rel="noreferrer">
            源码
          </a>
          <a href={`mailto:${OPENING_LEGAL_NOTICE_CONTACT_ADDRESS}`}>纠错与权利通知</a>
        </nav>
      </footer>
      {isChangelogOpen ? <ChangelogModal onClose={() => setIsChangelogOpen(false)} /> : null}
      {legalPresentation ? (
        <OpeningLegalDisclaimerModal
          presentation={legalPresentation}
          onAccept={handleAcceptLegalNotice}
          onDecline={() => setLegalPresentation(null)}
        />
      ) : null}
      {isFirstUseGuideOpen ? (
        <FirstUseGuideModal
          settings={settings}
          onClose={() => setIsFirstUseGuideOpen(false)}
          onComplete={dismissFirstUseGuide}
          onOpenSettings={openGuideDestination}
        />
      ) : null}
    </main>
  );
}
