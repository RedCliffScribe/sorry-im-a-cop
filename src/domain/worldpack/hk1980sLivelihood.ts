import type { OrganizationId } from '../runtime/types';

export interface LivelihoodOrganizationProfile {
  organizationId: OrganizationId;
  sectorIds: string[];
  workplaceKinds: string[];
  commonOccupationTags: string[];
  workRelationFunctions: string[];
  directionThemes: string[];
  pressureThemes: string[];
  matterThemes: string[];
  externalContactKinds: string[];
}

export interface EverydayEmployerTemplate {
  templateId: string;
  organizationType: string;
  activeYears: { from: number; to: number };
  sectorIds: string[];
  workplaceKinds: string[];
  namePatterns: string[];
  publicKnowledgeTemplate: string;
  promptSafeProfile: string;
  commonOccupationTags: string[];
  workRelationFunctions: string[];
  directionThemes: string[];
  pressureThemes: string[];
  matterThemes: string[];
  externalContactKinds: string[];
}

export interface OpeningLivelihoodMetadata {
  profileId: string;
  occupationGroupId: string;
  employmentStatusId: string;
  workUnitSummary?: string;
  positionSummary?: string;
  dutySummary?: string;
  decisionScopeSummary?: string;
  accessSummary?: string;
  sectorIds: string[];
  roleTags: string[];
}

export interface EverydayEmployerTemplateSelectionInput {
  year: number;
  sectorIds?: string[];
  roleTags?: string[];
  limit?: number;
}

function profile(
  organizationId: string,
  sectorIds: string[],
  workplaceKinds: string[],
  commonOccupationTags: string[],
  workRelationFunctions: string[],
  directionThemes: string[],
  pressureThemes: string[],
  matterThemes: string[],
  externalContactKinds: string[]
): LivelihoodOrganizationProfile {
  return {
    organizationId,
    sectorIds,
    workplaceKinds,
    commonOccupationTags,
    workRelationFunctions,
    directionThemes,
    pressureThemes,
    matterThemes,
    externalContactKinds
  };
}

export const hk1980sLivelihoodOrganizationProfiles: LivelihoodOrganizationProfile[] = [
  profile(
    'org_queen_elizabeth_hospital',
    ['medical', 'public_service'],
    ['hospital', 'emergency_department', 'ward'],
    ['doctor', 'nurse', 'clerk', 'laboratory', 'social_worker', 'support'],
    ['shift_coordination', 'clinical_handover', 'patient_family', 'police_inquiry'],
    ['bed_turnover', 'emergency_capacity', 'staffing'],
    ['night_shift_shortage', 'sensitive_patient', 'paperwork'],
    ['shift_cover', 'patient_record', 'family_request', 'police_question'],
    ['patients', 'families', 'ambulance', 'police', 'social_service']
  ),
  profile(
    'org_kwong_wah_hospital',
    ['medical', 'charity'],
    ['hospital', 'ward', 'outpatient'],
    ['doctor', 'nurse', 'clerk', 'social_worker', 'support'],
    ['shift_coordination', 'patient_family', 'community_referral'],
    ['community_care', 'patient_flow', 'staffing'],
    ['crowding', 'family_pressure', 'limited_resources'],
    ['shift_cover', 'patient_identity', 'referral', 'family_request'],
    ['patients', 'families', 'police', 'charity_network']
  ),
  profile(
    'org_tvb',
    ['media', 'entertainment'],
    ['television_station', 'studio', 'production_office'],
    ['reporter', 'editor', 'camera', 'production', 'runner', 'publicity'],
    ['assignment', 'field_cooperation', 'source_contact', 'legal_review'],
    ['program_schedule', 'news_confirmation', 'production_delivery'],
    ['deadline', 'editorial_limit', 'commercial_pressure'],
    ['interview', 'verification', 'delayed_item', 'anonymous_source'],
    ['police', 'artists', 'lawyers', 'advertisers', 'sources']
  ),
  profile(
    'org_atv',
    ['media', 'entertainment'],
    ['television_station', 'newsroom', 'production_office'],
    ['reporter', 'editor', 'camera', 'production', 'research'],
    ['assignment', 'field_cooperation', 'source_contact', 'legal_review'],
    ['news_confirmation', 'program_delivery', 'audience_competition'],
    ['deadline', 'editorial_dispute', 'resource_pressure'],
    ['interview', 'verification', 'editing', 'source_protection'],
    ['police', 'artists', 'lawyers', 'sources']
  ),
  profile(
    'org_ming_pao',
    ['media', 'press'],
    ['newspaper_office', 'newsroom', 'archive'],
    ['reporter', 'editor', 'photographer', 'researcher', 'proofreader', 'advertising'],
    ['assignment', 'field_cooperation', 'source_contact', 'legal_review'],
    ['confirm_story', 'publication_balance', 'public_interest'],
    ['deadline', 'legal_risk', 'commercial_pressure'],
    ['interview', 'verification', 'held_story', 'anonymous_source'],
    ['police', 'lawyers', 'sources', 'public_bodies']
  ),
  profile(
    'org_hsbc',
    ['finance', 'banking'],
    ['bank_office', 'branch', 'operations_office'],
    ['clerk', 'teller', 'operations', 'customer_service', 'accounting'],
    ['supervision', 'customer_service', 'document_review', 'compliance'],
    ['service_continuity', 'document_accuracy', 'client_relationship'],
    ['audit', 'confidentiality', 'suspicious_transaction'],
    ['document_check', 'customer_complaint', 'account_discrepancy'],
    ['customers', 'businesses', 'auditors', 'lawyers', 'police']
  ),
  profile(
    'org_hang_seng_bank',
    ['finance', 'banking'],
    ['bank_office', 'branch'],
    ['clerk', 'teller', 'operations', 'customer_service'],
    ['supervision', 'customer_service', 'document_review'],
    ['service_continuity', 'document_accuracy'],
    ['audit', 'confidentiality', 'client_pressure'],
    ['document_check', 'customer_complaint', 'account_discrepancy'],
    ['customers', 'businesses', 'auditors', 'police']
  ),
  profile(
    'org_mtrc',
    ['transport', 'public_utility'],
    ['station', 'operations_office', 'maintenance_depot'],
    ['station_staff', 'operations', 'maintenance', 'customer_service'],
    ['shift_coordination', 'passenger_service', 'maintenance_handover'],
    ['safe_service', 'peak_capacity', 'maintenance'],
    ['service_disruption', 'crowding', 'equipment_failure'],
    ['incident_report', 'shift_cover', 'passenger_complaint'],
    ['passengers', 'police', 'contractors', 'emergency_service']
  ),
  profile(
    'org_kmb',
    ['transport', 'bus'],
    ['depot', 'route_office', 'terminus'],
    ['driver', 'dispatcher', 'clerk', 'maintenance'],
    ['route_coordination', 'shift_assignment', 'vehicle_handover'],
    ['service_reliability', 'route_capacity', 'fleet_readiness'],
    ['traffic', 'staffing', 'vehicle_condition'],
    ['shift_change', 'incident_report', 'passenger_complaint'],
    ['passengers', 'police', 'repairers', 'transport_authority']
  ),
  profile(
    'org_wing_on_department_store',
    ['retail', 'department_store'],
    ['department_store', 'sales_floor', 'stockroom'],
    ['sales', 'supervisor', 'buyer', 'cashier', 'stock'],
    ['roster', 'customer_service', 'stock_coordination', 'supplier_contact'],
    ['sales_stability', 'stock_supply', 'customer_service'],
    ['rent', 'shrinkage', 'supplier_delay'],
    ['customer_complaint', 'stock_shortage', 'refund', 'shift_cover'],
    ['customers', 'suppliers', 'landlord', 'police']
  ),
  profile(
    'org_maxims',
    ['catering', 'hospitality'],
    ['restaurant', 'banquet', 'kitchen', 'office'],
    ['floor_staff', 'cook', 'supervisor', 'purchasing', 'clerk'],
    ['roster', 'service_coordination', 'supplier_contact', 'customer_handling'],
    ['service_quality', 'stable_supply', 'banquet_delivery'],
    ['food_cost', 'staffing', 'customer_dispute'],
    ['shift_cover', 'supplier_delay', 'customer_complaint'],
    ['customers', 'suppliers', 'venue', 'police']
  ),
  profile(
    'org_cheung_kong_group',
    ['property', 'commercial'],
    ['corporate_office', 'property_site', 'management_office'],
    ['administration', 'leasing', 'project', 'property_management', 'accounting'],
    ['document_flow', 'tenant_contact', 'contractor_coordination'],
    ['project_delivery', 'occupancy', 'cost_control'],
    ['tenant_dispute', 'contractor_delay', 'public_attention'],
    ['document_check', 'tenant_request', 'contractor_issue'],
    ['tenants', 'contractors', 'lawyers', 'government']
  ),
  profile(
    'org_royal_hk_jockey_club',
    ['entertainment', 'hospitality', 'public_interest'],
    ['racecourse', 'club_office', 'betting_branch'],
    ['customer_service', 'operations', 'hospitality', 'security', 'clerk'],
    ['event_coordination', 'customer_handling', 'security_contact'],
    ['event_readiness', 'public_order', 'service_control'],
    ['crowd_pressure', 'integrity_risk', 'media_attention'],
    ['event_duty', 'customer_dispute', 'security_report'],
    ['customers', 'police', 'media', 'suppliers']
  ),
  profile(
    'org_queen_mary_hospital',
    ['medical', 'public_service', 'teaching_hospital'],
    ['hospital', 'emergency_department', 'ward', 'teaching_unit'],
    ['doctor', 'nurse', 'clerk', 'laboratory', 'social_worker', 'support'],
    ['shift_coordination', 'clinical_handover', 'patient_family', 'police_inquiry'],
    ['patient_flow', 'specialist_service', 'teaching'],
    ['staffing', 'sensitive_patient', 'bed_pressure'],
    ['shift_cover', 'patient_record', 'family_request', 'police_question'],
    ['patients', 'families', 'university', 'ambulance', 'police']
  ),
  profile(
    'org_prince_of_wales_hospital',
    ['medical', 'public_service', 'teaching_hospital'],
    ['hospital', 'emergency_department', 'ward'],
    ['doctor', 'nurse', 'clerk', 'laboratory', 'social_worker', 'support'],
    ['shift_coordination', 'clinical_handover', 'patient_family'],
    ['new_territories_service', 'patient_flow', 'teaching'],
    ['staffing', 'new_facility_pressure', 'bed_pressure'],
    ['shift_cover', 'patient_record', 'family_request'],
    ['patients', 'families', 'university', 'ambulance', 'police']
  ),
  profile(
    'org_hong_kong_sanatorium',
    ['medical', 'private_healthcare'],
    ['hospital', 'clinic', 'ward'],
    ['doctor', 'nurse', 'clerk', 'customer_service', 'support'],
    ['appointment_coordination', 'patient_family', 'confidentiality'],
    ['service_quality', 'specialist_service', 'patient_privacy'],
    ['sensitive_patient', 'client_expectation', 'staffing'],
    ['appointment', 'record', 'family_request', 'privacy_question'],
    ['patients', 'families', 'private_doctors', 'insurers']
  ),
  profile(
    'org_tung_wah_group',
    ['charity', 'medical', 'education', 'social_service'],
    ['hospital', 'school', 'community_center', 'office'],
    ['doctor', 'nurse', 'teacher', 'social_worker', 'clerk', 'support'],
    ['case_referral', 'family_contact', 'service_coordination'],
    ['community_service', 'care_continuity', 'education_support'],
    ['limited_resources', 'sensitive_case', 'service_demand'],
    ['referral', 'family_request', 'shift_cover', 'service_record'],
    ['families', 'hospitals', 'schools', 'government', 'community']
  ),
  profile(
    'org_hku',
    ['education', 'university', 'research'],
    ['campus', 'faculty_office', 'laboratory', 'administration'],
    ['teacher', 'researcher', 'administrator', 'technician', 'clerk', 'support'],
    ['teaching_coordination', 'student_contact', 'research_handover'],
    ['teaching', 'research', 'student_service'],
    ['funding', 'deadline', 'student_pressure'],
    ['class_arrangement', 'document_check', 'student_request', 'research_task'],
    ['students', 'hospitals', 'government', 'professional_bodies']
  ),
  profile(
    'org_cuhk',
    ['education', 'university', 'research'],
    ['campus', 'college', 'faculty_office', 'laboratory'],
    ['teacher', 'researcher', 'administrator', 'technician', 'clerk', 'support'],
    ['teaching_coordination', 'student_contact', 'college_coordination'],
    ['teaching', 'research', 'student_service'],
    ['funding', 'deadline', 'campus_growth'],
    ['class_arrangement', 'document_check', 'student_request', 'research_task'],
    ['students', 'hospital', 'government', 'new_territories_community']
  ),
  profile(
    'org_clp',
    ['utility', 'electricity', 'engineering'],
    ['office', 'maintenance_depot', 'customer_service_center'],
    ['engineer', 'technician', 'maintenance', 'clerk', 'customer_service'],
    ['dispatch', 'maintenance_handover', 'customer_contact'],
    ['safe_supply', 'maintenance', 'service_continuity'],
    ['equipment_failure', 'storm_damage', 'customer_pressure'],
    ['repair_call', 'inspection', 'customer_complaint', 'shift_cover'],
    ['customers', 'contractors', 'government', 'emergency_service']
  ),
  profile(
    'org_hk_electric',
    ['utility', 'electricity', 'engineering'],
    ['office', 'maintenance_depot', 'customer_service_center'],
    ['engineer', 'technician', 'maintenance', 'clerk', 'customer_service'],
    ['dispatch', 'maintenance_handover', 'customer_contact'],
    ['safe_supply', 'maintenance', 'service_continuity'],
    ['equipment_failure', 'weather', 'customer_pressure'],
    ['repair_call', 'inspection', 'customer_complaint'],
    ['customers', 'contractors', 'government', 'emergency_service']
  ),
  profile(
    'org_towngas',
    ['utility', 'gas', 'maintenance'],
    ['office', 'maintenance_depot', 'customer_site'],
    ['engineer', 'technician', 'installer', 'clerk', 'customer_service'],
    ['dispatch', 'safety_handover', 'customer_contact'],
    ['safe_service', 'maintenance', 'installation'],
    ['leak_report', 'equipment_condition', 'customer_pressure'],
    ['repair_call', 'safety_check', 'customer_complaint'],
    ['customers', 'contractors', 'fire_service', 'property_managers']
  ),
  profile(
    'org_hk_tramways',
    ['transport', 'tram', 'maintenance'],
    ['terminus', 'depot', 'route_office'],
    ['driver', 'conductor', 'dispatcher', 'maintenance', 'clerk'],
    ['shift_assignment', 'vehicle_handover', 'passenger_service'],
    ['service_reliability', 'vehicle_readiness', 'safe_operation'],
    ['traffic', 'vehicle_condition', 'staffing'],
    ['shift_change', 'incident_report', 'passenger_complaint'],
    ['passengers', 'police', 'repairers', 'transport_authority']
  ),
  profile(
    'org_cathay_pacific',
    ['transport', 'aviation', 'tourism', 'cargo'],
    ['airport', 'operations_office', 'cargo_terminal'],
    ['cabin_crew', 'ground_staff', 'ticketing', 'cargo', 'operations', 'clerk'],
    ['flight_handover', 'passenger_service', 'cargo_coordination'],
    ['schedule_reliability', 'passenger_service', 'cargo_delivery'],
    ['delay', 'security', 'weather', 'passenger_pressure'],
    ['passenger_request', 'cargo_check', 'shift_cover', 'incident_report'],
    ['travellers', 'freight_agents', 'police', 'customs', 'travel_agents']
  ),
  profile(
    'org_po_leung_kuk',
    ['charity', 'social_service', 'education'],
    ['community_center', 'school', 'care_facility', 'office'],
    ['social_worker', 'teacher', 'care_worker', 'clerk', 'support'],
    ['case_referral', 'family_contact', 'service_coordination'],
    ['family_support', 'child_welfare', 'education_service'],
    ['limited_resources', 'sensitive_case', 'family_pressure'],
    ['visit', 'referral', 'family_request', 'service_record'],
    ['families', 'schools', 'hospitals', 'government', 'community']
  ),
  profile(
    'org_caritas_hk',
    ['charity', 'social_service', 'community'],
    ['community_center', 'service_office', 'school'],
    ['social_worker', 'community_worker', 'teacher', 'clerk', 'support'],
    ['case_referral', 'family_contact', 'community_coordination'],
    ['family_support', 'community_service', 'education_service'],
    ['limited_resources', 'sensitive_case', 'service_demand'],
    ['visit', 'referral', 'family_request', 'service_record'],
    ['families', 'schools', 'hospitals', 'government', 'community']
  ),
  profile(
    'org_hk_housing_society',
    ['housing', 'property_management', 'public_service'],
    ['housing_estate', 'management_office', 'maintenance_site'],
    ['housing_officer', 'property_management', 'clerk', 'maintenance', 'social_worker'],
    ['tenant_contact', 'repair_coordination', 'contractor_handover'],
    ['estate_maintenance', 'tenant_service', 'housing_delivery'],
    ['repair_backlog', 'tenant_dispute', 'contractor_delay'],
    ['repair_request', 'tenant_complaint', 'document_check'],
    ['tenants', 'contractors', 'government', 'community']
  )
];

function employerTemplate(
  templateId: string,
  organizationType: string,
  sectorIds: string[],
  workplaceKinds: string[],
  commonOccupationTags: string[],
  workRelationFunctions: string[],
  directionThemes: string[],
  pressureThemes: string[],
  matterThemes: string[],
  externalContactKinds: string[]
): EverydayEmployerTemplate {
  return {
    templateId,
    organizationType,
    activeYears: { from: 1980, to: 1996 },
    sectorIds,
    workplaceKinds,
    namePatterns: [],
    publicKnowledgeTemplate: '本地日常雇主，只在成为实际雇主、事项或关系主体后进入当前存档。',
    promptSafeProfile: '只提供职业关系与压力素材，不自动宣布任何具体事件已经发生。',
    commonOccupationTags,
    workRelationFunctions,
    directionThemes,
    pressureThemes,
    matterThemes,
    externalContactKinds
  };
}

export const hk1980sEverydayEmployerTemplates: EverydayEmployerTemplate[] = [
  employerTemplate('private_clinic', 'medical', ['medical'], ['clinic'], ['doctor', 'assistant', 'clerk'], ['patient_service', 'referral'], ['stable_service'], ['staffing', 'sensitive_patient'], ['appointment', 'record', 'family_request'], ['patients', 'pharmacy', 'hospital']),
  employerTemplate('care_home', 'social_service', ['care', 'social_service'], ['care_home'], ['care_worker', 'nurse', 'clerk'], ['family_contact', 'shift_handover'], ['resident_care'], ['staffing', 'family_pressure'], ['shift_cover', 'resident_request'], ['families', 'hospital', 'charity']),
  employerTemplate('school', 'education', ['education'], ['school', 'training_room'], ['teacher', 'clerk', 'support'], ['class_coordination', 'parent_contact'], ['teaching_continuity'], ['parent_pressure', 'staffing'], ['class_cover', 'student_issue'], ['parents', 'education_department', 'community']),
  employerTemplate('tea_restaurant', 'business', ['catering', 'retail'], ['restaurant'], ['floor_staff', 'cook', 'cashier'], ['roster', 'customer_service', 'supplier_contact'], ['lunch_trade', 'stable_supply'], ['food_cost', 'rent', 'street_pressure'], ['shift_cover', 'supplier_delay', 'customer_complaint'], ['customers', 'suppliers', 'landlord', 'street_contacts']),
  employerTemplate('small_retail', 'business', ['retail'], ['shop', 'market_stall'], ['sales', 'cashier', 'owner'], ['customer_service', 'stock_coordination'], ['stable_trade', 'stable_supply'], ['rent', 'shrinkage', 'supplier_delay'], ['refund', 'stock_shortage', 'customer_complaint'], ['customers', 'suppliers', 'landlord']),
  employerTemplate('light_factory', 'business', ['manufacturing'], ['factory', 'workshop'], ['production', 'packing', 'supervisor', 'clerk'], ['shift_handover', 'quality_check', 'shipping'], ['order_delivery', 'safe_output'], ['overtime', 'injury', 'order_pressure'], ['shift_cover', 'quality_issue', 'wage_question'], ['workers', 'suppliers', 'transporters']),
  employerTemplate('transport_firm', 'business', ['transport', 'logistics'], ['warehouse', 'transport_office', 'garage'], ['driver', 'loader', 'dispatcher', 'clerk'], ['dispatch', 'cargo_handover', 'vehicle_coordination'], ['on_time_delivery', 'vehicle_readiness'], ['cargo_loss', 'vehicle_condition', 'late_payment'], ['route_change', 'cargo_check', 'customer_request'], ['customers', 'warehouses', 'customs_brokers', 'repairers']),
  employerTemplate('hotel_guesthouse', 'hospitality', ['hotel', 'tourism'], ['hotel', 'guesthouse'], ['front_desk', 'housekeeping', 'service', 'supervisor'], ['guest_service', 'roster', 'security_contact'], ['occupancy', 'service_quality'], ['guest_dispute', 'staffing', 'security'], ['guest_request', 'shift_cover', 'incident_report'], ['guests', 'travel_agents', 'police', 'suppliers']),
  employerTemplate('professional_office', 'professional_service', ['legal', 'accounting', 'insurance', 'property'], ['office'], ['clerk', 'assistant', 'professional', 'agent'], ['document_flow', 'client_contact', 'filing'], ['client_delivery', 'document_accuracy'], ['deadline', 'confidentiality', 'client_pressure'], ['file_check', 'client_request', 'missing_document'], ['clients', 'banks', 'lawyers', 'government']),
  employerTemplate('construction_repair', 'contractor', ['construction', 'repair'], ['worksite', 'workshop'], ['technician', 'worker', 'foreman', 'clerk'], ['site_coordination', 'supplier_contact', 'safety_handover'], ['job_completion', 'safe_work'], ['injury', 'payment_delay', 'material_shortage'], ['repair_call', 'material_check', 'site_dispute'], ['clients', 'suppliers', 'property_managers']),
  employerTemplate('media_studio', 'media', ['media', 'production'], ['studio', 'office'], ['photographer', 'writer', 'production', 'assistant'], ['assignment', 'client_contact', 'production_handover'], ['delivery', 'source_confirmation'], ['deadline', 'client_pressure', 'legal_risk'], ['interview', 'editing', 'source_contact'], ['clients', 'artists', 'publishers', 'sources']),
  employerTemplate('community_charity', 'social_service', ['community', 'charity'], ['community_center', 'office'], ['social_worker', 'organizer', 'clerk'], ['case_referral', 'family_contact', 'community_coordination'], ['service_continuity', 'family_support'], ['limited_resources', 'sensitive_case'], ['visit', 'referral', 'family_request'], ['families', 'schools', 'hospitals', 'government'])
];

function normalizedTagSet(values: string[] | undefined): Set<string> {
  return new Set((values ?? []).map((value) => value.trim()).filter(Boolean));
}

export function selectEverydayEmployerTemplates({
  year,
  sectorIds,
  roleTags,
  limit = 4
}: EverydayEmployerTemplateSelectionInput): EverydayEmployerTemplate[] {
  const sectors = normalizedTagSet(sectorIds);
  const roles = normalizedTagSet(roleTags);
  if (sectors.size === 0 && roles.size === 0) return [];

  return hk1980sEverydayEmployerTemplates
    .filter(
      (template) =>
        year >= template.activeYears.from &&
        year <= template.activeYears.to
    )
    .map((template) => {
      const sectorScore = template.sectorIds.filter((tag) => sectors.has(tag)).length;
      const roleScore = template.commonOccupationTags.filter((tag) => roles.has(tag)).length;
      return {
        template,
        score: sectorScore * 10 + roleScore
      };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.template.templateId.localeCompare(right.template.templateId)
    )
    .slice(0, Math.max(0, limit))
    .map(({ template }) => template);
}

export function formatEverydayEmployerTemplateCandidates(
  input: EverydayEmployerTemplateSelectionInput
): string {
  const templates = selectEverydayEmployerTemplates(input);
  if (templates.length === 0) return 'none';

  return templates
    .map(
      (template) =>
        `- templateId=${template.templateId} organizationType=${template.organizationType} workplaceKinds=${template.workplaceKinds.join(',') || 'none'} relationFunctions=${template.workRelationFunctions.join(',') || 'none'} directionThemes=${template.directionThemes.join(',') || 'none'} pressureThemes=${template.pressureThemes.join(',') || 'none'} matterThemes=${template.matterThemes.join(',') || 'none'} externalContacts=${template.externalContactKinds.join(',') || 'none'}`
    )
    .join('\n');
}

export const openingLivelihoodMetadataByProfileId: Record<string, OpeningLivelihoodMetadata> = {
  tea_restaurant_clerk: {
    profileId: 'tea_restaurant_clerk',
    occupationGroupId: 'frontline',
    employmentStatusId: 'employed',
    workUnitSummary: '楼面与外卖轮班',
    positionSummary: '茶餐厅伙计',
    dutySummary: '负责楼面、外卖、收拾与轮班杂务。',
    decisionScopeSummary: '可处理一般客人要求和桌面安排；赊账、供货与长期街面安排需先交代。',
    accessSummary: '接触熟客、街坊、同班伙计、供货与楼面消息。',
    sectorIds: ['catering', 'retail'],
    roleTags: ['floor_staff', 'shift_work', 'customer_contact']
  },
  factory_worker: {
    profileId: 'factory_worker',
    occupationGroupId: 'frontline',
    employmentStatusId: 'employed',
    workUnitSummary: '生产与包装线',
    positionSummary: '电子厂职员',
    dutySummary: '按班完成生产、包装和交接。',
    decisionScopeSummary: '可处理本工位日常问题；排班、订单与停线由管工决定。',
    accessSummary: '接触工友、管工、货运人员和本班生产资料。',
    sectorIds: ['manufacturing'],
    roleTags: ['production', 'shift_work']
  },
  market_transport_helper: {
    profileId: 'market_transport_helper',
    occupationGroupId: 'frontline',
    employmentStatusId: 'employed',
    workUnitSummary: '果栏夜班运输与跟车',
    positionSummary: '运输帮工',
    dutySummary: '负责搬运、点货、跟车与交接。各班按实际开工结算，不是固定月薪岗位。',
    decisionScopeSummary: '可处理本次搬运与交接；路线、货单改动和长期安排需由运输行负责人确认。',
    accessSummary: '接触夜班工人、司机、批发商、货仓与当更货物流向。',
    sectorIds: ['transport', 'logistics'],
    roleTags: ['loader', 'shift_work', 'cargo_handover']
  },
  media_runner: {
    profileId: 'media_runner',
    occupationGroupId: 'frontline',
    employmentStatusId: 'employed',
    workUnitSummary: '制作部门',
    positionSummary: '传媒助理',
    dutySummary: '处理送片、通告、场务与制作跑腿。',
    decisionScopeSummary: '可安排自身跑腿顺序；采编、播出和敏感内容由编辑及制作人员决定。',
    accessSummary: '接触场务、司机、制作人员、艺人助理和有限通告资料。',
    sectorIds: ['media', 'entertainment'],
    roleTags: ['production_assistant', 'runner']
  },
  news_production_staff: {
    profileId: 'news_production_staff',
    occupationGroupId: 'professional',
    employmentStatusId: 'employed',
    workUnitSummary: '新闻制作组',
    positionSummary: '新闻制作助理',
    dutySummary: '参与采访联络、资料整理与节目制作。',
    decisionScopeSummary: '可安排采访联络和资料核实；最终播出与报道尺度由编辑链决定。',
    accessSummary: '接触记者、摄影、编辑、消息来源和公开采访资料。',
    sectorIds: ['media', 'press'],
    roleTags: ['reporting', 'production', 'source_contact']
  },
  nightlife_staff: {
    profileId: 'nightlife_staff',
    occupationGroupId: 'frontline',
    employmentStatusId: 'employed',
    workUnitSummary: '夜场楼面轮班',
    positionSummary: '夜场侍应',
    dutySummary: '负责楼面接待、酒水服务、收台与交班。',
    decisionScopeSummary: '可处理普通顾客要求；赊账、赶客、看场与长期人事安排需交由领班或经理。',
    accessSummary: '接触领班、同班侍应、熟客、看场、的士司机和当值警员。',
    sectorIds: ['entertainment', 'hospitality'],
    roleTags: ['floor_staff', 'shift_work', 'customer_contact']
  },
  bank_employee: {
    profileId: 'bank_employee',
    occupationGroupId: 'professional',
    employmentStatusId: 'employed',
    workUnitSummary: '银行柜面后勤与文件组',
    positionSummary: '银行文员',
    dutySummary: '处理文件、客户资料和柜面后勤。',
    decisionScopeSummary: '可处理常规资料流转；信贷、冻结账户与调查决定不在权限内。',
    accessSummary: '接触本人岗位所需客户资料和内部流程，受保密要求约束。',
    sectorIds: ['finance', 'banking'],
    roleTags: ['clerk', 'document_access', 'customer_contact']
  },
  property_company_employee: {
    profileId: 'property_company_employee',
    occupationGroupId: 'professional',
    employmentStatusId: 'employed',
    workUnitSummary: '租务与项目行政组',
    positionSummary: '地产公司行政职员',
    dutySummary: '处理租务、项目和承办商文件流转。',
    decisionScopeSummary: '可处理自身职级内的资料与联络；审批、融资和项目决策由主管负责。',
    accessSummary: '接触本职所需租约、项目资料、承办商和租客联络记录。',
    sectorIds: ['property', 'professional_service'],
    roleTags: ['clerk', 'document_access', 'contractor_contact']
  },
  secondary_school_teacher: {
    profileId: 'secondary_school_teacher',
    occupationGroupId: 'professional',
    employmentStatusId: 'employed',
    workUnitSummary: '中学教学与学生事务',
    positionSummary: '中学教师',
    dutySummary: '负责教学、班务、学生情况和家长沟通。',
    decisionScopeSummary: '可处理日常课堂与学生事务；纪律处分、资源调配和校务决定需由校方处理。',
    accessSummary: '接触学生、家长、同事及职责范围内的校务资料。',
    sectorIds: ['education'],
    roleTags: ['teacher', 'student_contact', 'parent_contact']
  },
  hospital_nurse: {
    profileId: 'hospital_nurse',
    occupationGroupId: 'professional',
    employmentStatusId: 'employed',
    workUnitSummary: '护理轮班',
    positionSummary: '医院护士',
    dutySummary: '负责护理、交班、病人观察与家属沟通。',
    decisionScopeSummary: '可按护理职责处理日常情况；诊断、调床和重大医疗决定需经医生与主管。',
    accessSummary: '接触本班病人、护理记录、同班医护和必要查询。',
    sectorIds: ['medical', 'public_service'],
    roleTags: ['nurse', 'shift_work', 'patient_contact']
  },
  import_export_officer: {
    profileId: 'import_export_officer',
    occupationGroupId: 'professional',
    employmentStatusId: 'employed',
    workUnitSummary: '订单与货运文件组',
    positionSummary: '进出口公司业务员',
    dutySummary: '处理订单、货运文件和客户联络。',
    decisionScopeSummary: '可协调常规订单与交接；跳过核验、改变货权或重大付款安排需由负责人决定。',
    accessSummary: '接触本职订单、客户、船务、货仓、司机和报关行联络。',
    sectorIds: ['trade', 'transport', 'logistics'],
    roleTags: ['sales', 'document_access', 'cargo_handover']
  },
  law_firm_employee: {
    profileId: 'law_firm_employee',
    occupationGroupId: 'professional',
    employmentStatusId: 'employed',
    workUnitSummary: '律师楼档案与客户联络',
    positionSummary: '律师楼文员',
    dutySummary: '处理档案、排期、送件和客户联络。',
    decisionScopeSummary: '可按程序流转文件；法律意见、代表承诺和案件策略必须由执业律师决定。',
    accessSummary: '接触职责范围内的客户档案、法院排期和文件往来，受保密义务约束。',
    sectorIds: ['legal', 'professional_service'],
    roleTags: ['clerk', 'document_access', 'client_contact']
  },
  hospitality_assistant_manager: {
    profileId: 'hospitality_assistant_manager',
    occupationGroupId: 'management',
    employmentStatusId: 'employed',
    workUnitSummary: '餐饮门店营运',
    positionSummary: '餐饮副经理',
    dutySummary: '负责一处分店的轮班、人手、楼面和顾客事务。',
    decisionScopeSummary: '可处理门店日常营运；集团采购、长期人事和跨店安排需向区域管理层交代。',
    accessSummary: '接触员工排班、门店记录、供应商、熟客和商场管理人员。',
    sectorIds: ['catering', 'retail'],
    roleTags: ['supervisor', 'roster', 'supplier_contact']
  },
  department_store_supervisor: {
    profileId: 'department_store_supervisor',
    occupationGroupId: 'management',
    employmentStatusId: 'employed',
    workUnitSummary: '百货销售部门',
    positionSummary: '百货公司部门主管',
    dutySummary: '负责一个销售部门的人手、货品、陈列和顾客投诉。',
    decisionScopeSummary: '可处理部门日常安排；公司采购、财务和跨部门人事不在权限内。',
    accessSummary: '接触售货员、保安、供货商、顾客投诉和本部门库存资料。',
    sectorIds: ['retail'],
    roleTags: ['supervisor', 'stock_coordination', 'customer_contact']
  },
  small_company_manager: {
    profileId: 'small_company_manager',
    occupationGroupId: 'management',
    employmentStatusId: 'employed',
    workUnitSummary: '小型贸易公司日常营运',
    positionSummary: '受雇经理',
    dutySummary: '负责订单、收支、人手和客户关系，并向东主交代。',
    decisionScopeSummary: '可处理获授权的日常营运；公司所有权、重大借贷和长期方向由东主决定。',
    accessSummary: '接触公司账目、订单、员工、客户、司机和银行往来。',
    sectorIds: ['trade', 'professional_service'],
    roleTags: ['manager', 'document_access', 'client_contact']
  },
  self_employed_merchant: {
    profileId: 'self_employed_merchant',
    occupationGroupId: 'free',
    employmentStatusId: 'self_employed',
    workUnitSummary: '自营店铺',
    positionSummary: '自营商户',
    dutySummary: '负责日常经营、进货、顾客与账目。',
    decisionScopeSummary: '可决定本店日常安排，但受租约、供货、现金与街面环境约束。',
    accessSummary: '接触员工、供货商、熟客、房东和附近商户。',
    sectorIds: ['retail', 'self_employed'],
    roleTags: ['owner', 'customer_contact', 'supplier_contact']
  },
  unemployed: {
    profileId: 'unemployed',
    occupationGroupId: 'free',
    employmentStatusId: 'unemployed',
    positionSummary: '暂时无业',
    dutySummary: '目前没有固定工作职责。',
    decisionScopeSummary: '可自行安排求职、散工和生活事务。',
    accessSummary: '主要依靠家人、旧同事、散工介绍与社区关系寻找机会。',
    sectorIds: [],
    roleTags: ['job_seeking']
  },
  custom_occupation: {
    profileId: 'custom_occupation',
    occupationGroupId: 'free',
    employmentStatusId: 'custom',
    sectorIds: [],
    roleTags: ['custom_occupation']
  }
};

export function getOpeningLivelihoodMetadata(
  profileId: string
): OpeningLivelihoodMetadata | undefined {
  return openingLivelihoodMetadataByProfileId[profileId];
}

export function getLivelihoodOrganizationProfile(
  organizationId: string | undefined
): LivelihoodOrganizationProfile | undefined {
  if (!organizationId) return undefined;
  return hk1980sLivelihoodOrganizationProfiles.find(
    (profile) => profile.organizationId === organizationId
  );
}
