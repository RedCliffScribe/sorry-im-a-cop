import type { AssetItem, FixedAsset, VehicleAsset } from '../domain/runtime/types';

const propertyTongLauSubdividedRoom = new URL(
  '../assets/assets/properties/asset-property-001-01-tong-lau-subdivided-room.webp',
  import.meta.url
).href;
const propertyTongLauRentedFlat = new URL(
  '../assets/assets/properties/asset-property-001-02-tong-lau-rented-flat.webp',
  import.meta.url
).href;
const propertyTongLauFamilyFlat = new URL(
  '../assets/assets/properties/asset-property-001-03-tong-lau-family-flat.webp',
  import.meta.url
).href;
const propertyPublicHousingSmallUnit = new URL(
  '../assets/assets/properties/asset-property-001-04-public-housing-small-unit.webp',
  import.meta.url
).href;
const propertyEstateFamilyFlat = new URL(
  '../assets/assets/properties/asset-property-002-01-estate-family-flat.webp',
  import.meta.url
).href;
const propertyPrivateEstateMiddleClassFlat = new URL(
  '../assets/assets/properties/asset-property-002-02-private-estate-middle-class-flat.webp',
  import.meta.url
).href;
const propertyHighriseSeaviewApartment = new URL(
  '../assets/assets/properties/asset-property-002-03-highrise-seaview-apartment.webp',
  import.meta.url
).href;
const propertyHillsideLuxuryResidence = new URL(
  '../assets/assets/properties/asset-property-002-04-hillside-luxury-residence.webp',
  import.meta.url
).href;
const propertyTeaRestaurantShopfront = new URL(
  '../assets/assets/properties/asset-property-003-01-tea-restaurant-shopfront.webp',
  import.meta.url
).href;
const propertyNightclubKaraokePremise = new URL(
  '../assets/assets/properties/asset-property-003-02-nightclub-karaoke-premise.webp',
  import.meta.url
).href;
const propertySmallNewspaperOffice = new URL(
  '../assets/assets/properties/asset-property-003-03-small-newspaper-office.webp',
  import.meta.url
).href;
const propertyFactoryBuildingUnit = new URL(
  '../assets/assets/properties/asset-property-003-04-factory-building-unit.webp',
  import.meta.url
).href;
const propertySouthsideLuxuryVilla = new URL(
  '../assets/assets/properties/asset-property-004-01-southside-luxury-villa.webp',
  import.meta.url
).href;
const propertyWarehouseUnit = new URL(
  '../assets/assets/properties/asset-property-004-02-warehouse-unit.webp',
  import.meta.url
).href;
const propertyGarageRepairShop = new URL(
  '../assets/assets/properties/asset-property-004-03-garage-repair-shop.webp',
  import.meta.url
).href;
const propertyParkingSpaceCarpark = new URL(
  '../assets/assets/properties/asset-property-004-04-parking-space-carpark.webp',
  import.meta.url
).href;

const vehiclePolicePatrolCar = new URL('../assets/assets/vehicles/asset-vehicle-005-01-police-patrol-car.webp', import.meta.url)
  .href;
const vehiclePoliceRiotVan = new URL('../assets/assets/vehicles/asset-vehicle-005-02-police-riot-van.webp', import.meta.url).href;
const vehiclePoliceMotorcycle = new URL('../assets/assets/vehicles/asset-vehicle-005-03-police-motorcycle.webp', import.meta.url).href;
const vehicleRedTaxi = new URL('../assets/assets/vehicles/asset-vehicle-005-04-red-taxi.webp', import.meta.url).href;
const vehicleOldBudgetJapaneseCar = new URL(
  '../assets/assets/vehicles/asset-vehicle-006-01-old-budget-japanese-car.webp',
  import.meta.url
).href;
const vehicleStandardJapaneseCar = new URL(
  '../assets/assets/vehicles/asset-vehicle-006-02-standard-japanese-car.webp',
  import.meta.url
).href;
const vehicleMiddleClassFamilySedan = new URL(
  '../assets/assets/vehicles/asset-vehicle-006-03-middle-class-family-sedan.webp',
  import.meta.url
).href;
const vehicleLuxuryEuropeanSedan = new URL(
  '../assets/assets/vehicles/asset-vehicle-006-04-luxury-european-sedan.webp',
  import.meta.url
).href;
const vehicleLuxurySportsCar = new URL('../assets/assets/vehicles/asset-vehicle-007-01-luxury-sports-car.webp', import.meta.url)
  .href;
const vehicleNeighborhoodMotorcycle = new URL(
  '../assets/assets/vehicles/asset-vehicle-007-02-neighborhood-motorcycle.webp',
  import.meta.url
).href;
const vehicleModifiedYouthMotorcycle = new URL(
  '../assets/assets/vehicles/asset-vehicle-007-03-modified-youth-motorcycle.webp',
  import.meta.url
).href;
const vehicleTriadYouthMotorcycle = new URL(
  '../assets/assets/vehicles/asset-vehicle-007-04-triad-youth-motorcycle.webp',
  import.meta.url
).href;
const vehicleMediumGoodsTruck = new URL('../assets/assets/vehicles/asset-vehicle-008-01-medium-goods-truck.webp', import.meta.url)
  .href;
const vehiclePublicLightBus = new URL('../assets/assets/vehicles/asset-vehicle-008-02-public-light-bus.webp', import.meta.url).href;
const vehicleFishingBoatSmallBoat = new URL(
  '../assets/assets/vehicles/asset-vehicle-008-03-fishing-boat-small-boat.webp',
  import.meta.url
).href;
const vehicleLuxuryYachtSpeedboat = new URL(
  '../assets/assets/vehicles/asset-vehicle-008-04-luxury-yacht-speedboat.webp',
  import.meta.url
).href;

export type AssetVisualKind = 'property' | 'vehicle';

export interface AssetVisualAsset {
  id: string;
  label: string;
  kind: AssetVisualKind;
  url: string;
}

const propertyVisuals = {
  tong_lau_subdivided_room: {
    id: 'tong_lau_subdivided_room',
    label: '唐楼分租房',
    kind: 'property',
    url: propertyTongLauSubdividedRoom
  },
  tong_lau_rented_flat: {
    id: 'tong_lau_rented_flat',
    label: '唐楼租住单位',
    kind: 'property',
    url: propertyTongLauRentedFlat
  },
  tong_lau_family_flat: {
    id: 'tong_lau_family_flat',
    label: '唐楼家庭单位',
    kind: 'property',
    url: propertyTongLauFamilyFlat
  },
  public_housing_small_unit: {
    id: 'public_housing_small_unit',
    label: '公屋小单位',
    kind: 'property',
    url: propertyPublicHousingSmallUnit
  },
  estate_family_flat: {
    id: 'estate_family_flat',
    label: '屋苑家庭单位',
    kind: 'property',
    url: propertyEstateFamilyFlat
  },
  private_estate_middle_class_flat: {
    id: 'private_estate_middle_class_flat',
    label: '中产私人屋苑',
    kind: 'property',
    url: propertyPrivateEstateMiddleClassFlat
  },
  highrise_seaview_apartment: {
    id: 'highrise_seaview_apartment',
    label: '高层海景单位',
    kind: 'property',
    url: propertyHighriseSeaviewApartment
  },
  hillside_luxury_residence: {
    id: 'hillside_luxury_residence',
    label: '半山高级住宅',
    kind: 'property',
    url: propertyHillsideLuxuryResidence
  },
  tea_restaurant_shopfront: {
    id: 'tea_restaurant_shopfront',
    label: '茶餐厅铺面',
    kind: 'property',
    url: propertyTeaRestaurantShopfront
  },
  nightclub_karaoke_premise: {
    id: 'nightclub_karaoke_premise',
    label: '夜场卡拉OK',
    kind: 'property',
    url: propertyNightclubKaraokePremise
  },
  small_newspaper_office: {
    id: 'small_newspaper_office',
    label: '小型报社办公室',
    kind: 'property',
    url: propertySmallNewspaperOffice
  },
  factory_building_unit: {
    id: 'factory_building_unit',
    label: '工厂大厦单位',
    kind: 'property',
    url: propertyFactoryBuildingUnit
  },
  southside_luxury_villa: {
    id: 'southside_luxury_villa',
    label: '南区豪宅别墅',
    kind: 'property',
    url: propertySouthsideLuxuryVilla
  },
  warehouse_unit: {
    id: 'warehouse_unit',
    label: '仓库单位',
    kind: 'property',
    url: propertyWarehouseUnit
  },
  garage_repair_shop: {
    id: 'garage_repair_shop',
    label: '车房维修铺',
    kind: 'property',
    url: propertyGarageRepairShop
  },
  parking_space_carpark: {
    id: 'parking_space_carpark',
    label: '停车场车位',
    kind: 'property',
    url: propertyParkingSpaceCarpark
  }
} satisfies Record<string, AssetVisualAsset>;

const vehicleVisuals = {
  police_patrol_car: { id: 'police_patrol_car', label: '警用巡逻车', kind: 'vehicle', url: vehiclePolicePatrolCar },
  police_riot_van: { id: 'police_riot_van', label: '警用冲锋车', kind: 'vehicle', url: vehiclePoliceRiotVan },
  police_motorcycle: { id: 'police_motorcycle', label: '警用电单车', kind: 'vehicle', url: vehiclePoliceMotorcycle },
  red_taxi: { id: 'red_taxi', label: '红色的士', kind: 'vehicle', url: vehicleRedTaxi },
  old_budget_japanese_car: { id: 'old_budget_japanese_car', label: '旧款日本私家车', kind: 'vehicle', url: vehicleOldBudgetJapaneseCar },
  standard_japanese_car: { id: 'standard_japanese_car', label: '普通日本私家车', kind: 'vehicle', url: vehicleStandardJapaneseCar },
  middle_class_family_sedan: { id: 'middle_class_family_sedan', label: '中产家庭轿车', kind: 'vehicle', url: vehicleMiddleClassFamilySedan },
  luxury_european_sedan: { id: 'luxury_european_sedan', label: '高级欧洲轿车', kind: 'vehicle', url: vehicleLuxuryEuropeanSedan },
  luxury_sports_car: { id: 'luxury_sports_car', label: '豪华跑车', kind: 'vehicle', url: vehicleLuxurySportsCar },
  neighborhood_motorcycle: { id: 'neighborhood_motorcycle', label: '普通电单车', kind: 'vehicle', url: vehicleNeighborhoodMotorcycle },
  modified_youth_motorcycle: { id: 'modified_youth_motorcycle', label: '改装青年电单车', kind: 'vehicle', url: vehicleModifiedYouthMotorcycle },
  triad_youth_motorcycle: { id: 'triad_youth_motorcycle', label: '社团青年电单车', kind: 'vehicle', url: vehicleTriadYouthMotorcycle },
  medium_goods_truck: { id: 'medium_goods_truck', label: '中型货车', kind: 'vehicle', url: vehicleMediumGoodsTruck },
  public_light_bus: { id: 'public_light_bus', label: '公共小巴', kind: 'vehicle', url: vehiclePublicLightBus },
  fishing_boat_small_boat: { id: 'fishing_boat_small_boat', label: '小艇渔船', kind: 'vehicle', url: vehicleFishingBoatSmallBoat },
  luxury_yacht_speedboat: { id: 'luxury_yacht_speedboat', label: '豪华游艇快艇', kind: 'vehicle', url: vehicleLuxuryYachtSpeedboat }
} satisfies Record<string, AssetVisualAsset>;

export function resolveAssetVisualAsset(item: AssetItem): AssetVisualAsset | null {
  if (item.category === 'fixedAsset') return selectPropertyVisual(item);
  if (item.category === 'vehicle') return selectVehicleVisual(item);
  return null;
}

function selectPropertyVisual(item: FixedAsset): AssetVisualAsset {
  const explicit = readExplicitVisual(item, propertyVisuals);
  if (explicit) return explicit;

  const clue = buildPropertyClue(item);

  if (item.fixedAssetType === 'parkingSpace' || item.primaryUse === 'parking') return propertyVisuals.parking_space_carpark;
  if (hasAny(clue, ['车房', '修车', 'garage', 'repair shop'])) return propertyVisuals.garage_repair_shop;
  if (item.fixedAssetType === 'storage' || item.primaryUse === 'storage' || hasAny(clue, ['仓库', '货仓', 'warehouse'])) {
    return propertyVisuals.warehouse_unit;
  }
  if (hasAny(clue, ['别墅', '浅水湾', '南区', '赤柱', '豪宅', 'villa', 'southside'])) return propertyVisuals.southside_luxury_villa;
  if (hasAny(clue, ['半山', '山顶', '高级住宅', 'luxury residence'])) return propertyVisuals.hillside_luxury_residence;
  if (hasAny(clue, ['海景', '高层', 'seaview', 'highrise'])) return propertyVisuals.highrise_seaview_apartment;

  if (item.fixedAssetType === 'businessPremise' || item.primaryUse === 'business') {
    if (hasAny(clue, ['夜总会', '夜场', '卡拉ok', 'karaoke', '酒吧', '舞厅'])) return propertyVisuals.nightclub_karaoke_premise;
    if (hasAny(clue, ['茶餐厅', '冰室', '餐厅', '饭店', '食肆'])) return propertyVisuals.tea_restaurant_shopfront;
    if (hasAny(clue, ['报社', '报馆', '编辑部', 'newspaper'])) return propertyVisuals.small_newspaper_office;
    if (hasAny(clue, ['工厂', '厂房', 'factory', 'industrial'])) return propertyVisuals.factory_building_unit;
    return propertyVisuals.tea_restaurant_shopfront;
  }

  if (hasAny(clue, ['公屋', '屋邨', 'public housing'])) return propertyVisuals.public_housing_small_unit;
  if (hasAny(clue, ['私人屋苑', '中产', 'estate', 'middle class'])) return propertyVisuals.private_estate_middle_class_flat;
  if (hasAny(clue, ['屋苑', '家庭单位'])) return propertyVisuals.estate_family_flat;
  if (hasAny(clue, ['劏房', '分租', '板间', 'subdivided'])) return propertyVisuals.tong_lau_subdivided_room;
  if (hasAny(clue, ['唐楼']) && hasAny(clue, ['父母', '家人', '家庭'])) return propertyVisuals.tong_lau_family_flat;
  if (hasAny(clue, ['唐楼']) && hasAny(clue, ['租', 'rented'])) return propertyVisuals.tong_lau_rented_flat;
  if (hasAny(clue, ['唐楼'])) return propertyVisuals.tong_lau_rented_flat;
  if (item.holdingRelation === 'rented' || item.primaryUse === 'home') return propertyVisuals.tong_lau_rented_flat;

  return propertyVisuals.private_estate_middle_class_flat;
}

function selectVehicleVisual(item: VehicleAsset): AssetVisualAsset {
  const explicit = readExplicitVisual(item, vehicleVisuals);
  if (explicit) return explicit;

  const clue = buildVehicleClue(item);
  const mode = item.mobilityProfile?.mode;

  if (item.vehicleType === 'policeVehicle') {
    if (mode === 'motorcycle' || hasAny(clue, ['电单车', '摩托', 'motorcycle'])) return vehicleVisuals.police_motorcycle;
    if (hasAny(clue, ['冲锋车', '警车', 'van', 'riot'])) return vehicleVisuals.police_riot_van;
    return vehicleVisuals.police_patrol_car;
  }
  if (item.vehicleType === 'taxi' || mode === 'taxi' || hasAny(clue, ['的士', 'taxi'])) return vehicleVisuals.red_taxi;
  if (item.vehicleType === 'boat' || mode === 'boat') {
    if (hasAny(clue, ['游艇', '快艇', '豪华', 'yacht', 'speedboat'])) return vehicleVisuals.luxury_yacht_speedboat;
    return vehicleVisuals.fishing_boat_small_boat;
  }
  if (hasAny(clue, ['小巴', 'minibus', 'public light bus'])) return vehicleVisuals.public_light_bus;
  if (hasAny(clue, ['货车', 'truck', 'lorry'])) return vehicleVisuals.medium_goods_truck;
  if (item.vehicleType === 'motorcycle' || mode === 'motorcycle' || hasAny(clue, ['电单车', '摩托', 'motorcycle'])) {
    if (hasAny(clue, ['社团', '古惑', '飞仔', 'triad'])) return vehicleVisuals.triad_youth_motorcycle;
    if (hasAny(clue, ['改装', 'modified'])) return vehicleVisuals.modified_youth_motorcycle;
    return vehicleVisuals.neighborhood_motorcycle;
  }
  if (hasAny(clue, ['跑车', 'sports car'])) return vehicleVisuals.luxury_sports_car;
  if (hasAny(clue, ['豪华', '欧洲', '平治', '宝马', 'benz', 'bmw', 'luxury'])) return vehicleVisuals.luxury_european_sedan;
  if (hasAny(clue, ['家庭', '中产', 'family'])) return vehicleVisuals.middle_class_family_sedan;
  if (hasAny(clue, ['旧', '二手', 'cheap', 'budget', 'old'])) return vehicleVisuals.old_budget_japanese_car;
  if (item.vehicleType === 'privateCar' || mode === 'car') return vehicleVisuals.standard_japanese_car;

  return vehicleVisuals.standard_japanese_car;
}

function buildPropertyClue(item: FixedAsset): string {
  return normalizeClue([
    item.itemId,
    item.name,
    item.summary,
    item.detail,
    item.fixedAssetType,
    item.holdingRelation,
    item.primaryUse,
    item.locationSummary,
    item.ownershipSummary,
    item.accessSummary,
    item.placeId,
    ...item.relatedPlaceIds,
    serializeWorldpackAssetData(item)
  ]);
}

function buildVehicleClue(item: VehicleAsset): string {
  return normalizeClue([
    item.itemId,
    item.name,
    item.summary,
    item.detail,
    item.vehicleType,
    item.holdingRelation,
    item.condition,
    item.locationSummary,
    item.accessSummary,
    item.mobilityProfile?.mode,
    item.mobilityProfile?.availabilitySummary,
    ...item.relatedPlaceIds,
    serializeWorldpackAssetData(item)
  ]);
}

function readExplicitVisual<T extends Record<string, AssetVisualAsset>>(item: AssetItem, table: T): AssetVisualAsset | null {
  const rawId = item.worldpackAssetData?.assetVisualId ?? item.worldpackAssetData?.visualAssetId;
  if (typeof rawId !== 'string') return null;
  return table[rawId] ?? null;
}

function serializeWorldpackAssetData(item: AssetItem): string {
  if (!item.worldpackAssetData) return '';
  try {
    return JSON.stringify(item.worldpackAssetData);
  } catch {
    return '';
  }
}

function normalizeClue(parts: Array<string | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')
    .toLowerCase();
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle.toLowerCase()));
}
