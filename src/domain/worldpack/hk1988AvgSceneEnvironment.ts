import type {
  AvgEnvironmentWorldpackAdapter,
  AvgSceneEnvironmentProfile,
  AvgSceneExposure,
  AvgSceneLightingProfile
} from '../avgEnvironment/types';

const OUTDOOR_NATURAL = [
  'causeway_bay_commercial_street',
  'central_business_street',
  'construction_site_1988',
  'container_yard',
  'hillside_cemetery_path',
  'mid_levels_residence_exterior',
  'mong_kok_dense_street',
  'outlying_residential_district',
  'peak_mountain_road',
  'school_campus_entrance',
  'scrap_yard_hideout',
  'tsim_sha_tsui_harbourfront',
  'urban_nullah_channel',
  'victoria_harbour_view',
  'wan_chai_mixed_street'
] as const;

const OUTDOOR_MIXED = [
  'police_rooftop_surveillance_post',
  'police_station_front',
  'roadside_police_checkpoint',
  'rooftop_water_tank_maze',
  'service_back_alley',
  'wet_market_loading_lane'
] as const;

const SEMI_OUTDOOR_MIXED = [
  'bus_depot_maintenance_floor',
  'customs_police_cargo_inspection_bay',
  'dockside_cargo_shed',
  'ferry_pier',
  'marine_police_boathouse',
  'pedestrian_subway_1988',
  'police_vehicle_garage',
  'public_housing_corridor',
  'smuggling_boat_pier'
] as const;

const VEHICLE_MIXED = [
  'ferry_vehicle_cargo_deck_1988'
] as const;

const INDOOR_NIGHTLIFE = [
  'billiards_hall_backroom',
  'dance_hall_management_room',
  'illegal_betting_room',
  'karaoke_private_room_1988',
  'mahjong_parlor_backroom',
  'massage_parlour_management_office',
  'nightclub',
  'nightclub_backstage_office',
  'triad_clubhouse',
  'underground_gambling_den'
] as const;

const INDOOR_MIXED = [
  'apartment_crime_scene_working_class',
  'boxing_gym_backroom',
  'luxury_mansion_living_room',
  'old_tenement_safehouse',
  'residential_flat_middle_class',
  'tenement_stairwell_crime_scene'
] as const;

const INDOOR_ARTIFICIAL = [
  'abandoned_factory_floor',
  'bank_hall',
  'bank_vault_corridor',
  'business_office',
  'church_community_hall',
  'colonial_courtroom',
  'dockworkers_canteen',
  'film_studio',
  'forensic_laboratory_1988',
  'funeral_parlour_backroom',
  'harbour_police_command_post',
  'high_end_restaurant',
  'hospital_corridor',
  'hotel_lobby',
  'hotel_room_crime_scene',
  'industrial_building_corridor',
  'industrial_warehouse_meeting_floor',
  'jewellery_shop_robbery_scene',
  'law_office',
  'loan_shark_collection_office',
  'marine_police_base_duty_room',
  'morgue_autopsy_room',
  'new_territories_police_outpost',
  'pawn_shop_back_office',
  'police_armoury',
  'police_briefing_room',
  'police_canteen',
  'police_cell_block',
  'police_cid_office',
  'police_custody_booking',
  'police_evidence_room',
  'police_interrogation_room',
  'police_lineup_room',
  'police_locker_room',
  'police_operations_room',
  'police_radio_dispatch_room',
  'police_records_archive',
  'police_report_room_kowloon',
  'police_safehouse_flat',
  'police_superintendent_office',
  'police_undercover_liaison_office',
  'police_witness_interview_room',
  'printing_shop_basement',
  'prison_visiting_room',
  'record_company_office',
  'seafood_restaurant_private_room',
  'taxi_garage_society_office',
  'tea_restaurant',
  'triad_backroom_accounting_office',
  'triad_branch_hall_kowloon',
  'triad_teahouse_upper_room',
  'triad_waterfront_union_office',
  'tv_station_corridor',
  'wholesale_fruit_warehouse'
] as const;

function entries(
  ids: readonly string[],
  exposure: AvgSceneExposure,
  lightingProfile: AvgSceneLightingProfile
): [string, AvgSceneEnvironmentProfile][] {
  return ids.map((sceneAssetId) => [sceneAssetId, { exposure, lightingProfile }]);
}

export const HK1988_AVG_SCENE_ENVIRONMENT_PROFILES: Readonly<
  Record<string, AvgSceneEnvironmentProfile>
> = Object.freeze(Object.fromEntries([
  ...entries(OUTDOOR_NATURAL, 'outdoor', 'natural'),
  ...entries(OUTDOOR_MIXED, 'outdoor', 'mixed'),
  ...entries(SEMI_OUTDOOR_MIXED, 'semi_outdoor', 'mixed'),
  ...entries(VEHICLE_MIXED, 'vehicle', 'mixed'),
  ...entries(INDOOR_NIGHTLIFE, 'indoor', 'nightlife'),
  ...entries(INDOOR_MIXED, 'indoor', 'mixed'),
  ...entries(INDOOR_ARTIFICIAL, 'indoor', 'artificial')
]));

export const hk1988AvgEnvironmentAdapter: AvgEnvironmentWorldpackAdapter = {
  resolveSceneProfile(sceneAssetId) {
    return sceneAssetId
      ? HK1988_AVG_SCENE_ENVIRONMENT_PROFILES[sceneAssetId]
      : undefined;
  }
};
