import type { PromptContext } from '../context/selectContext';
import { withDramaSourceCoherenceMetadata } from '../drama/coherence';
import type { ExecutionPayload, PlanningSource } from '../drama/types';
import type { ProjectedDramaSourceProvider } from '../drama/sourceRegistry';
import {
  OFFICIAL_DLC_PROVIDER_ID,
  type OfficialDlcDramaSourceRef,
  type OfficialDlcManifest
} from './types';
import { isOfficialDlcSupportedByWorldpack } from './manifest';

/** Test-only manifest: never added to the production registry or new saves. */
export const officialDlcTestStubManifest: OfficialDlcManifest = {
  dlcId: 'official_dlc_test',
  title: 'Official DLC 测试 Stub',
  description: '仅用于自动化验证官方 DLC 来源过滤与执行载荷。',
  type: 'hybrid',
  version: '0.0.1-test',
  worldCompatibility: [{ worldpackId: 'hk_1988', status: 'supported' }],
  dramaIntegration: { enabled: true, priority: 'normal' }
};

function testRef(
  sourceType: OfficialDlcDramaSourceRef['sourceType'],
  sourceId: string
): OfficialDlcDramaSourceRef {
  return {
    providerId: OFFICIAL_DLC_PROVIDER_ID,
    sourceType,
    sourceId,
    dlcId: officialDlcTestStubManifest.dlcId
  };
}

function testSource(
  ref: OfficialDlcDramaSourceRef,
  title: string,
  summary: string,
  channelId: PlanningSource['channelIds'][number],
  score: number
): PlanningSource {
  return withDramaSourceCoherenceMetadata({
    ref,
    title,
    plannerSummary: summary,
    sourceStatus: 'undecided_suggestion',
    reusePolicy: 'context_reusable',
    priorityClass: 'normal',
    channelIds: [channelId],
    softAffinities: {},
    mandatory: false,
    score,
    relatedActorIds: [],
    relatedOrganizationIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: []
  });
}

const testSources = [
  testSource(
    testRef('official_dlc_character', 'test_npc'),
    'DLC测试人物',
    '仅用于验证官方 DLC 人物来源可以进入规划。',
    'custom_characters',
    40
  ),
  testSource(
    testRef('official_dlc_event', 'test_event'),
    'DLC测试事件',
    '仅用于验证官方 DLC 事件来源可以进入规划。',
    'custom_events',
    45
  ),
  testSource(
    testRef('official_dlc_news', 'test_news'),
    'DLC测试新闻',
    '仅用于验证官方 DLC 新闻来源可以进入规划。',
    'city_news',
    35
  )
] as const;

export const officialDlcTestStubProvider: ProjectedDramaSourceProvider = {
  providerId: OFFICIAL_DLC_PROVIDER_ID,
  list(context: PromptContext): PlanningSource[] {
    const binding = context.officialDlcBindings?.find(
      (candidate) => candidate.dlcId === officialDlcTestStubManifest.dlcId
    );
    const supported = isOfficialDlcSupportedByWorldpack(
      officialDlcTestStubManifest,
      context.worldpackId
    );
    return supported && binding?.status === 'active' ? testSources.map((source) => ({
      ...source,
      ref: { ...source.ref },
      evidenceRefs: source.evidenceRefs?.map((ref) => ({ ...ref }))
    })) : [];
  },
  getExecutionPayload(context: PromptContext, ref): ExecutionPayload | undefined {
    const binding = context.officialDlcBindings?.find(
      (candidate) => candidate.dlcId === officialDlcTestStubManifest.dlcId
    );
    if (binding?.status !== 'active') return undefined;
    const source = testSources.find(
      (candidate) => candidate.ref.sourceType === ref.sourceType && candidate.ref.sourceId === ref.sourceId
    );
    if (!source) return undefined;
    return {
      ref: { ...source.ref },
      detailedContext: source.plannerSummary,
      confirmedFacts: [],
      mutableElements: [source.plannerSummary],
      forbiddenAdaptations: ['这是测试 Stub，不得写入正式 DLC 内容或 Runtime 事实。']
    };
  }
};
