import { describe, expect, it } from 'vitest';
import type { CurrentMatter } from '../runtime/types';
import { resolveCurrentMatterIdentity } from './currentMatterIdentity';

function matter(overrides: Partial<CurrentMatter> = {}): CurrentMatter {
  return {
    id: 'matter_delivery',
    title: '核对夜班送货',
    summary: '确认送货时间和签收人。',
    status: 'active',
    priority: 50,
    visibility: 'known',
    source: 'player_work',
    matterKind: 'livelihood',
    relatedActorIds: ['actor_driver'],
    relatedPlaceIds: ['place_market'],
    relatedCaseIds: [],
    relatedOrganizationIds: ['org_employer'],
    createdAt: { year: 1988, month: 7, day: 1, hour: 9, minute: 0 },
    updatedAt: { year: 1988, month: 7, day: 1, hour: 9, minute: 0 },
    ...overrides
  };
}

describe('current matter stable identity', () => {
  it('keeps the exact id when the caller reuses it', () => {
    const existing = matter();
    expect(
      resolveCurrentMatterIdentity({ [existing.id]: existing }, {
        id: existing.id,
        title: '不同标题也不应改 ID'
      })
    ).toMatchObject({ canonicalId: existing.id, matchedBy: 'exact_id' });
  });

  it('merges a regenerated id when title and structured scope identify the same matter', () => {
    const existing = matter();
    expect(
      resolveCurrentMatterIdentity({ [existing.id]: existing }, {
        id: 'matter_delivery_turn_42',
        title: '核对夜班送货',
        matterKind: 'livelihood',
        relatedActorIds: ['actor_driver'],
        relatedPlaceIds: ['place_market'],
        relatedOrganizationIds: ['org_employer']
      })
    ).toMatchObject({ canonicalId: existing.id, matchedBy: 'same_title_and_scope' });
  });

  it('uses a shared case as the strongest stable scope', () => {
    const existing = matter({
      id: 'matter_case_followup',
      title: '继续查案',
      matterKind: 'case',
      relatedCaseIds: ['case_001']
    });
    expect(
      resolveCurrentMatterIdentity({ [existing.id]: existing }, {
        id: 'matter_case_followup_new',
        title: '核对新的证词',
        matterKind: 'case',
        relatedCaseIds: ['case_001']
      })
    ).toMatchObject({ canonicalId: existing.id, matchedBy: 'shared_case' });
  });

  it('does not merge generic same-title matters with no shared structured scope', () => {
    const existing = matter({
      id: 'matter_first_customer',
      title: '处理投诉',
      relatedActorIds: ['actor_customer_a'],
      relatedPlaceIds: ['place_shop_a'],
      relatedOrganizationIds: ['org_shop_a']
    });
    expect(
      resolveCurrentMatterIdentity({ [existing.id]: existing }, {
        id: 'matter_second_customer',
        title: '处理投诉',
        matterKind: 'livelihood',
        relatedActorIds: ['actor_customer_b'],
        relatedPlaceIds: ['place_shop_b'],
        relatedOrganizationIds: ['org_shop_b']
      })
    ).toMatchObject({ canonicalId: 'matter_second_customer', matchedBy: 'new' });
  });
});
