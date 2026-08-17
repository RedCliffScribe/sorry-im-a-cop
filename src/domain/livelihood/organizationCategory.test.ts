import { describe, expect, it } from 'vitest';
import { getInstitutionCategory, institutionCategoryRegistry } from './organizationCategory';

describe('organizationCategory', () => {
  it('uses registered livelihood categories for known era anchors', () => {
    expect(getInstitutionCategory('org_queen_mary_hospital', 'public_service')).toBe('medical_social');
    expect(getInstitutionCategory('org_hku', 'public_service')).toBe('education');
    expect(getInstitutionCategory('org_clp', 'business')).toBe('transport_utilities');
    expect(getInstitutionCategory('org_hk_supreme_court', 'legal')).toBe('legal_integrity');
  });

  it('keeps runtime organizations usable through type fallbacks', () => {
    expect(getInstitutionCategory('org_runtime_shop', 'business')).toBe('business_finance');
    expect(getInstitutionCategory('org_runtime_street_group', 'community')).toBe('community');
  });

  it('registers all finalized institution categories', () => {
    expect(institutionCategoryRegistry.map((category) => category.id)).toEqual([
      'all',
      'government_public',
      'legal_integrity',
      'media_entertainment',
      'medical_social',
      'education',
      'business_finance',
      'retail_food',
      'transport_utilities',
      'industrial_logistics',
      'property_professional',
      'community'
    ]);
  });
});
