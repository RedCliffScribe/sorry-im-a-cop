import { createInitialPolicePanel } from './policePanel';
import type { PoliceCareerPathState, PoliceClimateEntry, PolicePanelState, RuntimeState } from '../runtime/types';
import {
  projectPolicePostingOpportunities,
  type PolicePostingOpportunityProjection,
  type PolicePostingRouteIndexEntry
} from './policePostingContent';

export interface PolicePanelProjection {
  available: boolean;
  institutionName: string;
  institutionNameEn: string;
  unitName: string;
  eraSummary: string;
  localChain: string[];
  unitSummary: string;
  rankBoundary: PolicePanelState['rankBoundary'];
  careerPath: PoliceCareerPathState;
  postingRouteIndex: PolicePostingRouteIndexEntry[];
  postingOpportunities: PolicePostingOpportunityProjection[];
  climate: PoliceClimateEntry[];
  relatedActorIds: string[];
  actionHints: string[];
  diagnostics: {
    selectedClimateKeys: string[];
    omittedClimateCount: number;
  };
}

export function projectPolicePanelContext(
  state: RuntimeState,
  playerInput = ''
): PolicePanelProjection {
  const playerActor = state.actors[state.player.actorId] ?? {
    actorId: state.player.actorId,
    currentIdentity: state.player.currentIdentity
  };
  const basePanel = state.policePanel ?? createInitialPolicePanel(playerActor, state.lawIdentity, state.time);
  const available = state.player.currentIdentity === 'police' && state.lawIdentity.status === 'active';
  const climate = basePanel.climate.slice(0, 4);
  const postingOpportunities = projectPolicePostingOpportunities(state, playerInput);

  return {
    available,
    institutionName: basePanel.institutionName,
    institutionNameEn: basePanel.institutionNameEn,
    unitName: basePanel.unitName,
    eraSummary: basePanel.eraSummary,
    localChain: basePanel.localChain.slice(0, 6),
    unitSummary: basePanel.unitSummary,
    rankBoundary: {
      can: basePanel.rankBoundary.can.slice(0, 6),
      cannot: basePanel.rankBoundary.cannot.slice(0, 6),
      contacts: basePanel.rankBoundary.contacts.slice(0, 6)
    },
    careerPath: {
      ...basePanel.careerPath,
      knownRequirements: basePanel.careerPath.knownRequirements.slice(0, 6),
      opportunities: basePanel.careerPath.opportunities.slice(0, 4),
      obstacles: basePanel.careerPath.obstacles.slice(0, 4),
      suggestedActions: basePanel.careerPath.suggestedActions.slice(0, 4),
      dynamicAssessment: { ...basePanel.careerPath.dynamicAssessment }
    },
    postingRouteIndex: postingOpportunities.routeIndex,
    postingOpportunities: postingOpportunities.opportunities,
    climate,
    relatedActorIds: basePanel.relatedActorIds.slice(0, 8),
    actionHints: basePanel.actionHints.slice(0, 4),
    diagnostics: {
      selectedClimateKeys: climate.map((entry) => entry.key),
      omittedClimateCount: Math.max(0, basePanel.climate.length - climate.length)
    }
  };
}
