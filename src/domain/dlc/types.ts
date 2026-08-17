import type { DramaSourceRef } from '../drama/types';

export type OfficialDlcType = 'narrative' | 'system' | 'hybrid';

export type DlcCompatibilityStatus = 'supported' | 'adapted' | 'unsupported';

export type DlcPriority = 'normal' | 'player_selected';

export type SaveDlcStatus = 'active' | 'paused' | 'completed';

export interface OfficialDlcWorldCompatibility {
  worldpackId: string;
  status: DlcCompatibilityStatus;
  reason?: string;
}

export interface OfficialDlcPresentation {
  /** Non-spoiler one-line copy used by the official catalog and new-game picker. */
  tagline: string;
  /** Short, non-spoiler experience labels; never used by Drama or Runtime. */
  experienceKeywords: readonly string[];
  /** Non-spoiler inventory shown in the catalog; never used as runtime truth. */
  contentHighlights?: readonly string[];
}

export interface OfficialDlcManifest {
  dlcId: string;
  title: string;
  description: string;
  type: OfficialDlcType;
  version: string;
  worldCompatibility: OfficialDlcWorldCompatibility[];
  /** Player-facing catalog metadata kept separate from execution contracts. */
  presentation?: OfficialDlcPresentation;
  dramaIntegration?: {
    enabled: boolean;
    priority: DlcPriority;
  };
  /** DLCs that must never coexist in one save (for example a frozen Alpha and
   * its formal replacement). Attachment flows must enforce this from data,
   * never from page-specific ID checks. */
  incompatibleDlcIds?: readonly string[];
}

export interface SaveDlcBinding {
  dlcId: string;
  version: string;
  status: SaveDlcStatus;
  /** Optional per-save planning switch; omitted legacy bindings remain enabled. */
  planningEnabled?: boolean;
  /** Wall-clock activation metadata for diagnostics; never used as runtime truth. */
  activatedAt?: string;
}

export const OFFICIAL_DLC_PROVIDER_ID = 'official-dlc' as const;

export type OfficialDlcSourceType =
  | 'official_dlc_event'
  | 'official_dlc_character'
  | 'official_dlc_news';

export interface OfficialDlcDramaSourceRef extends DramaSourceRef {
  providerId: typeof OFFICIAL_DLC_PROVIDER_ID;
  sourceType: OfficialDlcSourceType;
  dlcId: string;
  priorityClass?: DlcPriority;
}
