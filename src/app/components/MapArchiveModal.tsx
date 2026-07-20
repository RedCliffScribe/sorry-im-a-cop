import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { useMemo, useState } from 'react';
import { createMapViewModel, type MapPoint } from '../../domain/map/mapViewModel';
import type { Place, RuntimeState } from '../../domain/runtime/types';

interface MapArchiveModalProps {
  state: RuntimeState;
  onClose: () => void;
  onDraftPlayerAction?: (actionText: string) => void;
}

interface MapViewState {
  zoom: number;
  panX: number;
  panY: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

const MIN_ZOOM = 0.85;
const MAX_ZOOM = 3.2;

const regionLabels: Record<string, string> = {
  region_harbour: '维港',
  region_hong_kong: '香港',
  region_hong_kong_island: '港岛',
  region_kowloon: '九龙',
  region_new_territories: '新界'
};

const districtLabels: Record<string, string> = {
  district_aberdeen: '香港仔',
  district_admiralty: '金钟',
  district_admiralty_wan_chai: '金钟 / 湾仔',
  district_causeway_bay: '铜锣湾',
  district_central: '中环',
  district_central_admiralty: '中环 / 金钟',
  district_central_mid_levels: '中环 / 半山',
  district_central_sheung_wan: '中环 / 上环',
  district_chai_wan: '柴湾',
  district_cheung_sha_wan: '长沙湾',
  district_clear_water_bay: '清水湾',
  district_happy_valley: '跑马地',
  district_hung_hom: '红磡',
  district_hung_hom_causeway_bay: '红磡 / 铜锣湾',
  district_kowloon_city: '九龙城',
  district_kowloon_city_kai_tak: '九龙城 / 启德',
  district_kowloon_tong: '九龙塘',
  district_kwai_chung: '葵涌',
  district_kwun_tong: '观塘',
  district_lai_chi_kok: '荔枝角',
  district_mong_kok: '旺角',
  district_mong_kok_yau_ma_tei: '旺角 / 油麻地',
  district_north: '新界北',
  district_north_point: '北角',
  district_pok_fu_lam: '薄扶林',
  district_pok_fu_lam_mid_levels: '薄扶林 / 半山',
  district_repulse_bay: '浅水湾',
  district_san_po_kong: '新蒲岗',
  district_sha_tin: '沙田',
  district_sha_tin_ma_liu_shui: '沙田 / 马料水',
  district_sham_shui_po: '深水埗',
  district_sheung_wan: '上环',
  district_sheung_wan_sai_ying_pun: '上环 / 西营盘',
  district_stanley: '赤柱',
  district_tai_kok_tsui: '大角咀',
  district_to_kwa_wan: '土瓜湾',
  district_tsim_sha_tsui: '尖沙咀',
  district_tsuen_wan: '荃湾',
  district_tuen_mun: '屯门',
  district_unknown: '地区未明',
  district_wan_chai: '湾仔',
  district_wong_chuk_hang_aberdeen: '黄竹坑 / 香港仔',
  district_yau_ma_tei: '油麻地',
  district_yau_ma_tei_mong_kok: '油麻地 / 旺角',
  district_yau_tong: '油塘',
  district_yuen_long: '元朗'
};

const placeTypeLabels: Record<string, string> = {
  airport: '机场',
  bank_headquarters: '银行总部',
  bank_office: '银行办事处',
  bar_nightlife_district: '酒吧夜场区',
  beach_residential_area: '海滩住宅区',
  border_rail_station: '边境铁路站',
  ceremonial_pier: '礼宾码头',
  civic_venue: '公共文化场地',
  container_terminal: '货柜码头',
  court: '法院',
  dense_enclave: '高密度街区',
  department_store: '百货公司',
  electronics_street_market: '电子街市',
  ferry_pier: '渡轮码头',
  ferry_terminal: '客运码头',
  film_company: '电影公司',
  film_studio: '电影片场',
  garment_industry_district: '制衣工业区',
  government_agency: '政府机构',
  government_office: '政府办公地',
  government_residence: '官邸',
  industrial_area: '工业区',
  industrial_building: '工业建筑',
  luxury_shopping_complex: '高端商场',
  magistracy: '裁判司署',
  media_cluster: '媒体机构群',
  mixed_use_mansion: '综合大厦',
  mtr_kcr_interchange: '地铁/九铁换乘站',
  mtr_station: '地铁站',
  nightlife_district: '夜生活街区',
  office_finance_complex: '金融办公区',
  office_government_district: '政府办公区',
  office_tower: '办公大楼',
  old_factory_blocks: '旧厂厦区',
  opera_theatre: '戏曲剧院',
  performance_sports_venue: '演出体育场地',
  performance_venue: '演出场地',
  police_headquarters: '警察总部',
  police_station: '警署',
  prison: '监狱',
  private_hospital: '私家医院',
  public_broadcaster: '公共广播机构',
  public_hospital: '公立医院',
  public_park: '公园',
  racecourse: '马场',
  radio_station: '电台',
  railway_station: '铁路站',
  red_light_street: '红灯街区',
  road_tunnel: '行车隧道',
  shipyard_industrial_area: '船厂工业区',
  shopping_complex: '大型商场',
  shopping_street_cluster: '购物街区',
  street_market: '街市',
  teaching_hospital: '教学医院',
  television_station: '电视台',
  television_studio_complex: '电视制作城',
  theatre: '戏院',
  theme_park: '主题公园',
  tourist_market: '游客市集',
  tram_terminus: '电车总站',
  typhoon_shelter: '避风塘',
  university: '大学',
  wet_market_street: '街市街区',
  wholesale_market: '批发市场',
  working_class_market_cluster: '基层街市群',
  workshop_district: '工场街区'
};

const placeCategoryLabels: Record<string, string> = {
  civic_landmark: '市政地标',
  commercial_landmark: '商业地标',
  finance_commercial: '金融商业',
  government_legal: '政府司法',
  healthcare: '医疗',
  industrial_logistics: '工业物流',
  landmark_pressure_zone: '压力地标',
  media_entertainment: '媒体娱乐',
  oversight: '监督机构',
  police: '警务',
  street_life: '街头生活',
  transport_landmark: '交通地标'
};

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value.toFixed(2))));
}

function focusedView(point: MapPoint | undefined, zoom = 1.25): MapViewState {
  if (!point) return { zoom: 1, panX: 0, panY: 0 };

  return {
    zoom,
    panX: Math.round((0.5 - point.x) * 260),
    panY: Math.round((0.5 - point.y) * 190)
  };
}

function placeSearchText(place: Place): string {
  return [
    place.placeId,
    place.name,
    place.nameZh,
    place.nameEn,
    ...(place.aliases ?? []),
    place.regionId,
    place.districtId,
    place.type,
    place.category,
    place.streetAddressText,
    ...(place.roadAnchors ?? []),
    place.summary,
    place.publicKnowledge,
    place.currentState
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ')
    .toLowerCase();
}

function sortPlaces(currentPlaceId: string) {
  return (left: Place, right: Place) => {
    const currentScore = (place: Place) => (place.placeId === currentPlaceId ? 1 : 0);
    const canonicalScore = (place: Place) => (place.canonical ? 1 : 0);
    return (
      currentScore(right) - currentScore(left) ||
      canonicalScore(right) - canonicalScore(left) ||
      left.regionId.localeCompare(right.regionId) ||
      left.name.localeCompare(right.name)
    );
  };
}

function createMoveDraft(place: Place): string {
  return `前往${place.nameZh ?? place.name}。`;
}

function placeRegionLabel(place: Place): string {
  return regionLabels[place.regionId] ?? '区域未明';
}

function placeDistrictLabel(place: Place): string {
  if (!place.districtId) return '街区未明';
  return districtLabels[place.districtId] ?? '街区未明';
}

function placeTypeSummary(place: Place): string {
  const labels = [placeTypeLabels[place.type], place.category ? placeCategoryLabels[place.category] : undefined].filter(
    (label): label is string => Boolean(label)
  );
  return labels.length > 0 ? [...new Set(labels)].join(' / ') : '地点';
}

function placeSubtitle(place: Place): string {
  return place.nameEn ?? placeTypeSummary(place);
}

function pointByPlaceId(points: MapPoint[], placeId: string | undefined): MapPoint | undefined {
  if (!placeId) return undefined;
  return points.find((point) => point.placeId === placeId);
}

export function MapArchiveModal({ state, onClose, onDraftPlayerAction }: MapArchiveModalProps) {
  const [search, setSearch] = useState('');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const mapModel = useMemo(() => createMapViewModel(state, { selectedPlaceId }), [state, selectedPlaceId]);
  const [view, setView] = useState<MapViewState>(() => focusedView(mapModel.currentPoint));
  const [dragState, setDragState] = useState<DragState | null>(null);

  const places = useMemo(
    () =>
      [...mapModel.points.map((point) => point.place), ...mapModel.unanchoredPlaces].sort(
        sortPlaces(state.location.currentPlaceId)
      ),
    [mapModel, state.location.currentPlaceId]
  );

  const filteredPlaces = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return places;
    return places.filter((place) => placeSearchText(place).includes(query));
  }, [places, search]);

  const selectedPlace =
    filteredPlaces.find((place) => place.placeId === selectedPlaceId) ??
    filteredPlaces.find((place) => place.placeId === state.location.currentPlaceId) ??
    filteredPlaces[0] ??
    mapModel.selectedPlace ??
    places[0];
  const selectedIsCurrent = selectedPlace?.placeId === state.location.currentPlaceId;

  function selectPlace(placeId: string) {
    setSelectedPlaceId(placeId);
  }

  function focusPoint(point: MapPoint | undefined) {
    if (!point) return;
    setView(focusedView(point));
  }

  function zoomBy(delta: number) {
    setView((current) => ({ ...current, zoom: clampZoom(current.zoom + delta) }));
  }

  function resetToHongKongView() {
    setView({ zoom: 1, panX: 0, panY: 0 });
  }

  function locateCurrentPlace() {
    selectPlace(state.location.currentPlaceId);
    focusPoint(mapModel.currentPoint);
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 0.16 : -0.16);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.panX,
      originY: view.panY
    });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    setView((current) => ({
      ...current,
      panX: dragState.originX + event.clientX - dragState.startX,
      panY: dragState.originY + event.clientY - dragState.startY
    }));
  }

  function stopDragging(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragState(null);
  }

  function draftMoveToSelectedPlace() {
    if (!selectedPlace || selectedIsCurrent) return;
    onDraftPlayerAction?.(createMoveDraft(selectedPlace));
  }

  return (
    <div className="character-archive-backdrop" role="presentation">
      <section
        className="map-archive-modal archive-info-modal archive-info-modal--map feature-modal-frame"
        role="dialog"
        aria-modal="true"
        aria-label="地图"
      >
        <header className="character-archive-header">
          <div>
            <h2>地图</h2>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="character-archive-stats" aria-label="地图统计">
          <span>
            当前位置 <strong>{mapModel.currentPoint?.name ?? '未知'}</strong>
          </span>
          <span>
            已收录 <strong>{mapModel.stats.total}</strong>
          </span>
          <span>
            当前显示 <strong>{filteredPlaces.length}</strong>
          </span>
        </div>

        <div className="map-archive-body">
          <aside className="map-place-list" aria-label="地点列表">
            <label className="character-search">
              <span>搜索</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索地点 / 英文名 / 区域 / 类型"
              />
            </label>

            <div className="map-place-scroll">
              {filteredPlaces.length > 0 ? (
                filteredPlaces.map((place) => {
                  const point = pointByPlaceId(mapModel.points, place.placeId);
                  return (
                    <button
                      key={place.placeId}
                      type="button"
                      className={selectedPlace?.placeId === place.placeId ? 'active' : ''}
                      onClick={() => {
                        selectPlace(place.placeId);
                        focusPoint(point);
                      }}
                    >
                      <strong>{place.name}</strong>
                      <span>{placeSubtitle(place)}</span>
                      <small>{place.summary}</small>
                      <i>
                        {place.placeId === state.location.currentPlaceId ? <em>当前地点</em> : null}
                        {place.source === 'runtime_generated' ? <em>新发现</em> : null}
                        <em>{placeDistrictLabel(place)}</em>
                      </i>
                    </button>
                  );
                })
              ) : (
                <p className="character-empty">没有符合筛选的地点。</p>
              )}
            </div>
          </aside>

          <section className="map-visual-panel" aria-label="香港地图">
            <div className="map-control-row">
              <button type="button" aria-label="放大地图" title="放大地图" onClick={() => zoomBy(0.2)}>
                +
              </button>
              <button type="button" aria-label="缩小地图" title="缩小地图" onClick={() => zoomBy(-0.2)}>
                -
              </button>
              <button type="button" aria-label="全港视角" title="全港视角" onClick={resetToHongKongView}>
                全
              </button>
              <button type="button" aria-label="定位我" title="定位我" onClick={locateCurrentPlace}>
                ◎
              </button>
            </div>

            <div
              className={`hk-map-viewport${dragState ? ' dragging' : ''}`}
              onWheel={handleWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
            >
              <div
                className="hk-map-transform"
                style={{
                  transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`
                }}
              >
                <svg className="hk-map-base" role="img" aria-label="香港示意地图" viewBox="0 0 100 100">
                  <defs>
                    <linearGradient id="hkLandGradient" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stopColor="#354746" />
                      <stop offset="55%" stopColor="#1f3338" />
                      <stop offset="100%" stopColor="#263039" />
                    </linearGradient>
                    <marker id="mapRouteArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="4" markerHeight="4" orient="auto">
                      <path d="M0 0 L8 4 L0 8 Z" fill="#f4d895" />
                    </marker>
                  </defs>

                  <rect x="0" y="0" width="100" height="100" className="map-sea" />
                  <path className="map-land" d="M10 13 C18 7 31 7 43 12 C55 16 67 12 79 17 C88 21 92 31 87 40 C80 52 61 48 50 44 C36 39 22 42 12 34 C5 28 4 19 10 13 Z" />
                  <path className="map-land map-land-kowloon" d="M37 34 C45 31 57 31 66 35 C70 39 69 47 63 51 C54 55 42 53 34 48 C29 44 31 37 37 34 Z" />
                  <path className="map-harbour" d="M31 51 C43 54 57 56 70 51 C67 57 55 60 43 58 C35 57 30 55 31 51 Z" />
                  <path className="map-land map-land-island" d="M32 59 C43 56 57 58 72 63 C78 66 75 75 66 78 C54 82 39 78 29 70 C23 65 25 61 32 59 Z" />
                  <path className="map-land map-land-lantau" d="M8 63 C17 56 30 57 38 65 C45 72 40 83 29 87 C17 91 6 84 4 75 C3 70 4 66 8 63 Z" />
                  <path className="map-land map-small-island" d="M25 88 C29 85 35 86 37 90 C33 94 27 94 25 88 Z" />
                  <path className="map-land map-small-island" d="M70 82 C75 80 80 82 82 87 C78 90 72 89 70 82 Z" />

                  <path className="map-road map-rail" d="M16 30 C29 33 42 35 55 38 C66 41 77 41 86 36" />
                  <path className="map-road" d="M39 41 C47 42 55 43 65 45" />
                  <path className="map-road" d="M36 68 C45 65 56 66 68 70" />
                  <path className="map-road map-ferry" d="M54 49 C54 54 54 58 53 63" />
                  <path className="map-road map-ferry" d="M27 71 C34 68 41 66 49 65" />

                  <text className="map-region-label" x="17" y="22">
                    新界
                  </text>
                  <text className="map-region-label" x="45" y="45">
                    九龙
                  </text>
                  <text className="map-region-label" x="42" y="72">
                    港岛
                  </text>
                  <text className="map-region-label" x="13" y="77">
                    大屿山
                  </text>

                  {mapModel.movementHint ? (
                    <g className="map-route-layer">
                      <line
                        x1={mapModel.movementHint.fromPoint.x * 100}
                        y1={mapModel.movementHint.fromPoint.y * 100}
                        x2={mapModel.movementHint.toPoint.x * 100}
                        y2={mapModel.movementHint.toPoint.y * 100}
                      />
                    </g>
                  ) : null}
                </svg>

                <div className="map-marker-layer">
                  {mapModel.points.map((point) => (
                    <button
                      key={point.placeId}
                      type="button"
                      aria-label={`地图点 ${point.name}`}
                      className={`map-marker map-marker--${point.visualKind}${selectedPlace?.placeId === point.placeId ? ' selected' : ''}`}
                      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectPlace(point.placeId);
                        focusPoint(point);
                      }}
                    >
                      <span>{point.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="map-visual-status">
              <span>缩放 {Math.round(view.zoom * 100)}%</span>
              <span>{mapModel.movementHint?.label ?? `当前位置：${mapModel.currentPoint?.name ?? '未知'}`}</span>
            </div>
          </section>

          <section className="map-place-detail" aria-label="地点详情">
            {selectedPlace ? (
              <>
                <div className="map-place-title">
                  <div>
                    <h3>{selectedPlace.name}</h3>
                    <p>{placeSubtitle(selectedPlace)}</p>
                    <p className="map-place-summary">{selectedPlace.summary}</p>
                  </div>
                  <div className="character-detail-tags">
                    {selectedIsCurrent ? <span>当前地点</span> : null}
                    <span>{placeRegionLabel(selectedPlace)}</span>
                    <span>{placeDistrictLabel(selectedPlace)}</span>
                    <span>{placeTypeSummary(selectedPlace)}</span>
                  </div>
                  {onDraftPlayerAction && !selectedIsCurrent ? (
                    <button type="button" className="map-draft-action-button" onClick={draftMoveToSelectedPlace}>
                      前往此处
                    </button>
                  ) : null}
                </div>

                <div className="map-place-grid">
                  <section>
                    <h4>位置</h4>
                    <dl>
                      <dt>大区域</dt>
                      <dd>{placeRegionLabel(selectedPlace)}</dd>
                      <dt>街区</dt>
                      <dd>{placeDistrictLabel(selectedPlace)}</dd>
                      <dt>类型</dt>
                      <dd>{placeTypeSummary(selectedPlace)}</dd>
                      <dt>附近街道</dt>
                      <dd>{selectedPlace.roadAnchors?.join(' / ') || selectedPlace.streetAddressText || '暂无'}</dd>
                    </dl>
                  </section>

                  <section>
                    <h4>地点资料</h4>
                    <dl>
                      <dt>别名</dt>
                      <dd>{selectedPlace.aliases?.join(' / ') || '无'}</dd>
                      <dt>公开认知</dt>
                      <dd>{selectedPlace.publicKnowledge}</dd>
                      <dt>当前状态</dt>
                      <dd>{selectedPlace.currentState}</dd>
                      {selectedPlace.playerKnownSummary ? (
                        <>
                          <dt>你所知道</dt>
                          <dd>{selectedPlace.playerKnownSummary}</dd>
                        </>
                      ) : null}
                    </dl>
                  </section>
                </div>
              </>
            ) : (
              <p className="character-empty">还没有可显示地点。</p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
