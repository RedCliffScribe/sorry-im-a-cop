import { hkLateColonialCivilianOrganizations } from '../cityPower/hkLateColonialCivilianOrganizations';

export type InstitutionCategoryId =
  | 'all'
  | 'government_public'
  | 'legal_integrity'
  | 'media_entertainment'
  | 'medical_social'
  | 'education'
  | 'business_finance'
  | 'retail_food'
  | 'transport_utilities'
  | 'industrial_logistics'
  | 'property_professional'
  | 'community';

export interface InstitutionCategoryDefinition {
  id: InstitutionCategoryId;
  label: string;
}

export const institutionCategoryRegistry: InstitutionCategoryDefinition[] = [
  { id: 'all', label: '全部' },
  { id: 'government_public', label: '政府与公共权力' },
  { id: 'legal_integrity', label: '法律与廉政' },
  { id: 'media_entertainment', label: '媒体与娱乐' },
  { id: 'medical_social', label: '医疗与社会服务' },
  { id: 'education', label: '教育' },
  { id: 'business_finance', label: '商业与金融' },
  { id: 'retail_food', label: '零售与餐饮' },
  { id: 'transport_utilities', label: '交通与公用事业' },
  { id: 'industrial_logistics', label: '工业与物流' },
  { id: 'property_professional', label: '地产与专业服务' },
  { id: 'community', label: '社区' }
];

const anchorSectorTags = new Map(
  hkLateColonialCivilianOrganizations.map((organization) => [
    organization.organizationId,
    organization.sectorTags
  ])
);

function hasAnyTag(tags: string[], expected: string[]): boolean {
  return expected.some((tag) => tags.includes(tag));
}

export function getInstitutionCategory(
  organizationId: string,
  organizationType: string
): Exclude<InstitutionCategoryId, 'all'> {
  const tags = anchorSectorTags.get(organizationId) ?? [];

  if (
    organizationType === 'government' ||
    organizationType === 'police_force' ||
    hasAnyTag(tags, ['government', 'public_authority', 'civil_service'])
  ) {
    return 'government_public';
  }
  if (
    organizationType === 'icac' ||
    organizationType === 'legal' ||
    organizationType === 'court' ||
    hasAnyTag(tags, ['legal', 'court', 'law', 'integrity'])
  ) {
    return 'legal_integrity';
  }
  if (
    organizationType === 'media' ||
    organizationType === 'entertainment' ||
    hasAnyTag(tags, ['media', 'news', 'television', 'radio', 'film', 'music', 'entertainment'])
  ) {
    return 'media_entertainment';
  }
  if (
    hasAnyTag(tags, [
      'medical',
      'hospital',
      'healthcare',
      'charity',
      'social_service',
      'child_welfare',
      'family_service'
    ])
  ) {
    return 'medical_social';
  }
  if (hasAnyTag(tags, ['education', 'university', 'school', 'training'])) {
    return 'education';
  }
  if (
    organizationType === 'transport' ||
    hasAnyTag(tags, ['transport', 'utility', 'electricity', 'gas', 'telecom', 'aviation', 'tram', 'bus'])
  ) {
    return 'transport_utilities';
  }
  if (hasAnyTag(tags, ['retail', 'catering', 'restaurant', 'hotel', 'hospitality', 'food'])) {
    return 'retail_food';
  }
  if (hasAnyTag(tags, ['industrial', 'manufacturing', 'factory', 'logistics', 'cargo', 'warehouse'])) {
    return 'industrial_logistics';
  }
  if (
    organizationType === 'property' ||
    hasAnyTag(tags, [
      'property',
      'property_management',
      'housing',
      'professional_service',
      'insurance',
      'accounting'
    ])
  ) {
    return 'property_professional';
  }
  if (
    organizationType === 'community' ||
    organizationType === 'family' ||
    organizationType === 'public_service' ||
    hasAnyTag(tags, ['community', 'neighbourhood'])
  ) {
    return 'community';
  }
  return 'business_finance';
}
