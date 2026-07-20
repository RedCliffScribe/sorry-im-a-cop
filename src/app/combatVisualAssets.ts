import type { CombatEvent, RuntimeState } from '../domain/runtime/types';

const bgBustlingStreet = new URL('../assets/combat/backgrounds/combat-bg-001-01-bustling-commercial-street.webp', import.meta.url).href;
const bgQuietStreet = new URL('../assets/combat/backgrounds/combat-bg-001-02-quiet-old-street.webp', import.meta.url).href;
const bgBackAlley = new URL('../assets/combat/backgrounds/combat-bg-001-03-back-alley.webp', import.meta.url).href;
const bgWetMarket = new URL('../assets/combat/backgrounds/combat-bg-001-04-wet-market-street.webp', import.meta.url).href;
const bgNarrowLane = new URL('../assets/combat/backgrounds/combat-bg-002-01-narrow-lane.webp', import.meta.url).href;
const bgResidentialCorner = new URL('../assets/combat/backgrounds/combat-bg-002-02-residential-corner.webp', import.meta.url).href;
const bgDenseSignage = new URL('../assets/combat/backgrounds/combat-bg-002-03-dense-signage-street.webp', import.meta.url).href;
const bgHillsideStreet = new URL('../assets/combat/backgrounds/combat-bg-002-04-hillside-street.webp', import.meta.url).href;
const bgNightlifeStreet = new URL('../assets/combat/backgrounds/combat-bg-003-01-nightlife-street.webp', import.meta.url).href;
const bgIndustrialStreet = new URL('../assets/combat/backgrounds/combat-bg-003-02-industrial-street.webp', import.meta.url).href;
const bgPierStreet = new URL('../assets/combat/backgrounds/combat-bg-003-03-pier-street.webp', import.meta.url).href;
const bgEstateStreet = new URL('../assets/combat/backgrounds/combat-bg-003-04-estate-street.webp', import.meta.url).href;
const bgParkingLot = new URL('../assets/combat/backgrounds/combat-bg-004-01-parking-lot.webp', import.meta.url).href;
const bgFlyover = new URL('../assets/combat/backgrounds/combat-bg-004-02-flyover-underpass.webp', import.meta.url).href;
const bgMinibusStop = new URL('../assets/combat/backgrounds/combat-bg-004-03-minibus-stop-street.webp', import.meta.url).href;
const bgRoadCheckpoint = new URL('../assets/combat/backgrounds/combat-bg-004-04-road-checkpoint.webp', import.meta.url).href;
const bgKaraokeRoom = new URL('../assets/combat/backgrounds/combat-bg-005-01-karaoke-room.webp', import.meta.url).href;
const bgNightclubCorridor = new URL('../assets/combat/backgrounds/combat-bg-005-02-nightclub-service-corridor.webp', import.meta.url).href;
const bgCinemaLobby = new URL('../assets/combat/backgrounds/combat-bg-005-03-cinema-lobby-exit.webp', import.meta.url).href;
const bgBarDancehall = new URL('../assets/combat/backgrounds/combat-bg-005-04-bar-dancehall.webp', import.meta.url).href;
const bgFactory = new URL('../assets/combat/backgrounds/combat-bg-006-01-old-factory-workshop.webp', import.meta.url).href;
const bgWarehouse = new URL('../assets/combat/backgrounds/combat-bg-006-02-warehouse-interior.webp', import.meta.url).href;
const bgContainerPort = new URL('../assets/combat/backgrounds/combat-bg-006-03-container-port-edge.webp', import.meta.url).href;
const bgFishPier = new URL('../assets/combat/backgrounds/combat-bg-006-04-loading-pier-fish-market.webp', import.meta.url).href;
const bgPoliceCorridor = new URL('../assets/combat/backgrounds/combat-bg-007-01-police-station-corridor.webp', import.meta.url).href;
const bgHospital = new URL('../assets/combat/backgrounds/combat-bg-007-02-hospital-ae-corridor.webp', import.meta.url).href;
const bgTongLauStairwell = new URL('../assets/combat/backgrounds/combat-bg-007-03-tong-lau-stairwell.webp', import.meta.url).href;
const bgRooftop = new URL('../assets/combat/backgrounds/combat-bg-007-04-rooftop.webp', import.meta.url).href;

const playerUniformGun = new URL('../assets/combat/players/combat-player-008-01-uniform-constable-gun.webp', import.meta.url).href;
const playerUniformBaton = new URL('../assets/combat/players/combat-player-008-02-uniform-constable-baton.webp', import.meta.url).href;
const playerUniformEmpty = new URL('../assets/combat/players/combat-player-008-03-uniform-constable-empty.webp', import.meta.url).href;
const playerCommandGun = new URL('../assets/combat/players/combat-player-009-01-command-uniform-gun.webp', import.meta.url).href;
const playerCommandBaton = new URL('../assets/combat/players/combat-player-009-02-command-uniform-baton.webp', import.meta.url).href;
const playerCommandEmpty = new URL('../assets/combat/players/combat-player-009-03-command-uniform-empty.webp', import.meta.url).href;
const playerPlainAGun = new URL('../assets/combat/players/combat-player-010-01-plainclothes-a-gun.webp', import.meta.url).href;
const playerPlainATool = new URL('../assets/combat/players/combat-player-010-02-plainclothes-a-tool.webp', import.meta.url).href;
const playerPlainAEmpty = new URL('../assets/combat/players/combat-player-010-03-plainclothes-a-empty.webp', import.meta.url).href;
const playerPlainBGun = new URL('../assets/combat/players/combat-player-011-01-plainclothes-b-gun.webp', import.meta.url).href;
const playerPlainBTool = new URL('../assets/combat/players/combat-player-011-02-plainclothes-b-tool.webp', import.meta.url).href;
const playerPlainBEmpty = new URL('../assets/combat/players/combat-player-011-03-plainclothes-b-empty.webp', import.meta.url).href;

const enemyStreetTriadKnife = new URL('../assets/combat/enemies/combat-enemy-012-01-street-triad-knife.webp', import.meta.url).href;
const enemyDrunkTroublemaker = new URL('../assets/combat/enemies/combat-enemy-012-02-drunk-troublemaker.webp', import.meta.url).href;
const enemyPickpocketRunner = new URL('../assets/combat/enemies/combat-enemy-012-03-pickpocket-runner.webp', import.meta.url).href;
const enemyMarketRuffian = new URL('../assets/combat/enemies/combat-enemy-012-04-market-ruffian.webp', import.meta.url).href;
const enemyNightclubBouncer = new URL('../assets/combat/enemies/combat-enemy-013-01-nightclub-bouncer.webp', import.meta.url).href;
const enemyKaraokeEnforcer = new URL('../assets/combat/enemies/combat-enemy-013-02-karaoke-enforcer.webp', import.meta.url).href;
const enemyLowlevelTriadGunman = new URL('../assets/combat/enemies/combat-enemy-013-03-lowlevel-triad-gunman.webp', import.meta.url).href;
const enemyDockWarehouseThug = new URL('../assets/combat/enemies/combat-enemy-013-04-dock-warehouse-thug.webp', import.meta.url).href;
const enemyCorruptBusinessman = new URL('../assets/combat/enemies/combat-enemy-014-01-corrupt-businessman.webp', import.meta.url).href;
const enemyPoliticianCouncilman = new URL('../assets/combat/enemies/combat-enemy-014-02-politician-councilman.webp', import.meta.url).href;
const enemyCorruptPolice = new URL('../assets/combat/enemies/combat-enemy-014-03-corrupt-police.webp', import.meta.url).href;
const enemyForeignSecurity = new URL('../assets/combat/enemies/combat-enemy-014-04-foreign-agent-security.webp', import.meta.url).href;
const enemyTriadBoss = new URL('../assets/combat/enemies/combat-enemy-015-01-triad-boss.webp', import.meta.url).href;
const enemyTriadLieutenant = new URL('../assets/combat/enemies/combat-enemy-015-02-triad-lieutenant.webp', import.meta.url).href;
const enemyArmedRobber = new URL('../assets/combat/enemies/combat-enemy-015-03-armed-robber.webp', import.meta.url).href;
const enemyFugitive = new URL('../assets/combat/enemies/combat-enemy-015-04-desperate-fugitive.webp', import.meta.url).href;
const enemyFemaleStreetSuspect = new URL('../assets/combat/enemies/combat-enemy-016-01-female-street-suspect.webp', import.meta.url).href;
const enemyFemaleNightlifeHelper = new URL('../assets/combat/enemies/combat-enemy-016-02-female-nightlife-helper.webp', import.meta.url).href;
const enemyFemaleGunmanInformant = new URL('../assets/combat/enemies/combat-enemy-016-03-female-gunman-informant.webp', import.meta.url).href;
const enemyFemaleFleeingSuspect = new URL('../assets/combat/enemies/combat-enemy-016-04-female-fleeing-suspect.webp', import.meta.url).href;

export type CombatVisualResultTone = 'success' | 'failure' | 'neutral';
export type CombatVisualEffect = 'gunfire' | 'impact' | 'chase' | 'crowd';
export type CombatVisualWeather = 'night' | 'rain' | 'fog';

export interface CombatVisualLayerAsset {
  id: string;
  label: string;
  url: string;
}

export interface CombatVisualAssets {
  background: CombatVisualLayerAsset;
  player: CombatVisualLayerAsset;
  enemy: CombatVisualLayerAsset;
  resultTone: CombatVisualResultTone;
  resultLabel?: '成功' | '失敗';
  effectClassNames: string[];
  weatherClassNames: string[];
  caption: string;
}

const backgrounds = {
  bustling_street: { id: 'bustling_street', label: '繁华街道', url: bgBustlingStreet },
  quiet_street: { id: 'quiet_street', label: '冷清旧街', url: bgQuietStreet },
  back_alley: { id: 'back_alley', label: '后巷', url: bgBackAlley },
  wet_market: { id: 'wet_market', label: '街市', url: bgWetMarket },
  narrow_lane: { id: 'narrow_lane', label: '窄巷', url: bgNarrowLane },
  residential_corner: { id: 'residential_corner', label: '住宅街角', url: bgResidentialCorner },
  dense_signage: { id: 'dense_signage', label: '霓虹招牌街', url: bgDenseSignage },
  hillside_street: { id: 'hillside_street', label: '半山斜路', url: bgHillsideStreet },
  nightlife_street: { id: 'nightlife_street', label: '夜场街口', url: bgNightlifeStreet },
  industrial_street: { id: 'industrial_street', label: '工业街', url: bgIndustrialStreet },
  pier_street: { id: 'pier_street', label: '码头街', url: bgPierStreet },
  estate_street: { id: 'estate_street', label: '屋邨街口', url: bgEstateStreet },
  parking_lot: { id: 'parking_lot', label: '停车场', url: bgParkingLot },
  flyover: { id: 'flyover', label: '天桥底', url: bgFlyover },
  minibus_stop: { id: 'minibus_stop', label: '小巴站', url: bgMinibusStop },
  road_checkpoint: { id: 'road_checkpoint', label: '路障', url: bgRoadCheckpoint },
  karaoke_room: { id: 'karaoke_room', label: '卡拉OK包厢', url: bgKaraokeRoom },
  nightclub_service_corridor: { id: 'nightclub_service_corridor', label: '夜总会后门', url: bgNightclubCorridor },
  cinema_lobby: { id: 'cinema_lobby', label: '戏院出口', url: bgCinemaLobby },
  bar_dancehall: { id: 'bar_dancehall', label: '酒吧舞厅', url: bgBarDancehall },
  factory: { id: 'factory', label: '旧工厂', url: bgFactory },
  warehouse: { id: 'warehouse', label: '仓库', url: bgWarehouse },
  container_port: { id: 'container_port', label: '货柜码头', url: bgContainerPort },
  fish_pier: { id: 'fish_pier', label: '鱼市场码头', url: bgFishPier },
  police_corridor: { id: 'police_corridor', label: '警署走廊', url: bgPoliceCorridor },
  hospital: { id: 'hospital', label: '医院急症室', url: bgHospital },
  tong_lau_stairwell: { id: 'tong_lau_stairwell', label: '唐楼楼梯', url: bgTongLauStairwell },
  rooftop: { id: 'rooftop', label: '天台', url: bgRooftop }
} satisfies Record<string, CombatVisualLayerAsset>;

const playerAssets = {
  uniform_constable_gun: { id: 'uniform_constable_gun', label: '军装持枪', url: playerUniformGun },
  uniform_constable_baton: { id: 'uniform_constable_baton', label: '军装警棍', url: playerUniformBaton },
  uniform_constable_empty: { id: 'uniform_constable_empty', label: '军装空手', url: playerUniformEmpty },
  command_uniform_gun: { id: 'command_uniform_gun', label: '警长制服持枪', url: playerCommandGun },
  command_uniform_baton: { id: 'command_uniform_baton', label: '警长制服警棍', url: playerCommandBaton },
  command_uniform_empty: { id: 'command_uniform_empty', label: '警长制服空手', url: playerCommandEmpty },
  plainclothes_a_gun: { id: 'plainclothes_a_gun', label: '便装持枪', url: playerPlainAGun },
  plainclothes_a_tool: { id: 'plainclothes_a_tool', label: '便装器械', url: playerPlainATool },
  plainclothes_a_empty: { id: 'plainclothes_a_empty', label: '便装空手', url: playerPlainAEmpty },
  plainclothes_b_gun: { id: 'plainclothes_b_gun', label: '便装持枪', url: playerPlainBGun },
  plainclothes_b_tool: { id: 'plainclothes_b_tool', label: '便装器械', url: playerPlainBTool },
  plainclothes_b_empty: { id: 'plainclothes_b_empty', label: '便装空手', url: playerPlainBEmpty }
} satisfies Record<string, CombatVisualLayerAsset>;

const enemyAssets = {
  street_triad_knife: { id: 'street_triad_knife', label: '街头持刀分子', url: enemyStreetTriadKnife },
  drunk_troublemaker: { id: 'drunk_troublemaker', label: '醉酒滋事者', url: enemyDrunkTroublemaker },
  pickpocket_runner: { id: 'pickpocket_runner', label: '扒手逃跑者', url: enemyPickpocketRunner },
  market_ruffian: { id: 'market_ruffian', label: '街市烂仔', url: enemyMarketRuffian },
  nightclub_bouncer: { id: 'nightclub_bouncer', label: '夜场打手', url: enemyNightclubBouncer },
  karaoke_enforcer: { id: 'karaoke_enforcer', label: '卡拉OK看场', url: enemyKaraokeEnforcer },
  lowlevel_triad_gunman: { id: 'lowlevel_triad_gunman', label: '社团枪手', url: enemyLowlevelTriadGunman },
  dock_warehouse_thug: { id: 'dock_warehouse_thug', label: '码头仓库打手', url: enemyDockWarehouseThug },
  corrupt_businessman: { id: 'corrupt_businessman', label: '商界人物', url: enemyCorruptBusinessman },
  politician_councilman: { id: 'politician_councilman', label: '政界人物', url: enemyPoliticianCouncilman },
  corrupt_police: { id: 'corrupt_police', label: '警队人员', url: enemyCorruptPolice },
  foreign_security: { id: 'foreign_security', label: '外籍保安', url: enemyForeignSecurity },
  triad_boss: { id: 'triad_boss', label: '社团大佬', url: enemyTriadBoss },
  triad_lieutenant: { id: 'triad_lieutenant', label: '社团头马', url: enemyTriadLieutenant },
  armed_robber: { id: 'armed_robber', label: '持械劫匪', url: enemyArmedRobber },
  fugitive: { id: 'fugitive', label: '亡命逃犯', url: enemyFugitive },
  female_street_suspect: { id: 'female_street_suspect', label: '女性嫌疑人', url: enemyFemaleStreetSuspect },
  female_nightlife_helper: { id: 'female_nightlife_helper', label: '夜场女性', url: enemyFemaleNightlifeHelper },
  female_gunman_informant: { id: 'female_gunman_informant', label: '女性枪手', url: enemyFemaleGunmanInformant },
  female_fleeing_suspect: { id: 'female_fleeing_suspect', label: '女性逃跑者', url: enemyFemaleFleeingSuspect }
} satisfies Record<string, CombatVisualLayerAsset>;

export function resolveCombatVisualAssets(combat: CombatEvent, state: RuntimeState): CombatVisualAssets {
  const clue = buildCombatClue(combat, state);
  const opponentClue = buildOpponentClue(combat);
  const effects = selectEffects(combat, clue);
  const weather = selectWeather(combat, state, clue);
  const resultTone = selectResultTone(combat);

  return {
    background: selectBackground(combat, clue),
    player: selectPlayer(combat, state, clue),
    enemy: selectEnemy(combat, clue, opponentClue),
    resultTone,
    resultLabel: resultTone === 'success' ? '成功' : resultTone === 'failure' ? '失敗' : undefined,
    effectClassNames: effects.map((effect) => `combat-effect-${effect}`),
    weatherClassNames: weather.map((effect) => `combat-weather-${effect}`),
    caption: [combat.title, combat.locationSummary].filter(Boolean).join(' / ')
  };
}

function buildCombatClue(combat: CombatEvent, state: RuntimeState): string {
  return [
    combat.animationKey,
    combat.title,
    combat.type,
    combat.locationId,
    combat.locationSummary,
    combat.outcome,
    combat.combatText,
    combat.resultSummary,
    combat.consequenceSummary,
    state.player.clothing,
    state.player.clothingState?.currentSummary,
    state.player.clothingState?.mode,
    state.lawIdentity.rank,
    state.policePanel.careerPath.currentRank,
    state.environment.weather.condition,
    ...combat.participants.flatMap((participant) => [
      participant.name,
      participant.side,
      participant.roleSummary,
      participant.conditionAfter
    ])
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

function buildOpponentClue(combat: CombatEvent): string {
  const opponents = combat.participants.filter((participant) => participant.side === 'opponent' || participant.side === 'unknown');
  return opponents
    .flatMap((participant) => [participant.name, participant.roleSummary, participant.conditionAfter])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

function selectBackground(combat: CombatEvent, clue: string): CombatVisualLayerAsset {
  if (hasAny(clue, ['天台', 'rooftop'])) return backgrounds.rooftop;
  if (hasAny(clue, ['医院', '急症室', 'hospital', 'a&e'])) return backgrounds.hospital;
  if (hasAny(clue, ['警署', '报案室', '走廊', 'police station'])) return backgrounds.police_corridor;
  if (hasAny(clue, ['唐楼', '楼梯', 'stairwell'])) return backgrounds.tong_lau_stairwell;
  if (hasAny(clue, ['货柜', '码头', 'container'])) return backgrounds.container_port;
  if (hasAny(clue, ['鱼市场', '鱼栏', 'fish market'])) return backgrounds.fish_pier;
  if (hasAny(clue, ['仓库', 'warehouse'])) return backgrounds.warehouse;
  if (hasAny(clue, ['工厂', '工业', 'factory'])) return backgrounds.factory;
  if (hasAny(clue, ['卡拉ok', 'karaoke', '包厢'])) return backgrounds.karaoke_room;
  if (hasAny(clue, ['夜总会', '夜场', '后门', 'service corridor', 'nightclub'])) return backgrounds.nightclub_service_corridor;
  if (hasAny(clue, ['戏院', '影院', 'cinema'])) return backgrounds.cinema_lobby;
  if (hasAny(clue, ['酒吧', '舞厅', 'bar', 'dancehall'])) return backgrounds.bar_dancehall;
  if (hasAny(clue, ['停车场', '车场', 'parking'])) return backgrounds.parking_lot;
  if (hasAny(clue, ['天桥', '桥底', 'underpass', 'flyover'])) return backgrounds.flyover;
  if (hasAny(clue, ['小巴', '巴士站', 'minibus'])) return backgrounds.minibus_stop;
  if (hasAny(clue, ['路障', '截查', 'checkpoint'])) return backgrounds.road_checkpoint;
  if (hasAny(clue, ['屋邨', '公屋', 'estate'])) return backgrounds.estate_street;
  if (hasAny(clue, ['码头街', '渡轮', 'pier'])) return backgrounds.pier_street;
  if (hasAny(clue, ['街市', '市场', 'wet market'])) return backgrounds.wet_market;
  if (hasAny(clue, ['后巷', '暗巷', 'back alley'])) return backgrounds.back_alley;
  if (hasAny(clue, ['窄巷', '巷弄', 'narrow lane'])) return backgrounds.narrow_lane;
  if (hasAny(clue, ['住宅', '街角'])) return backgrounds.residential_corner;
  if (hasAny(clue, ['霓虹', '招牌'])) return backgrounds.dense_signage;
  if (hasAny(clue, ['半山', '斜路'])) return backgrounds.hillside_street;
  if (combat.type === 'chase' || combat.type === 'escape') return backgrounds.quiet_street;
  return backgrounds.bustling_street;
}

function selectPlayer(combat: CombatEvent, state: RuntimeState, clue: string): CombatVisualLayerAsset {
  const weapon = selectPlayerWeapon(combat, clue);
  const clothing = `${state.player.clothingState?.mode ?? ''} ${state.player.clothingState?.currentSummary ?? ''} ${state.player.clothing}`.toLowerCase();
  const rank = `${state.lawIdentity.rank ?? ''} ${state.policePanel.careerPath.currentRank}`.toLowerCase();
  const isPlainclothes = hasAny(clothing, ['off_duty_plain', 'formal', 'disguise', '便装', '西装', '夹克', '私服']);
  const isCommand = hasAny(rank, ['sergeant', '警长', '督察', 'inspector']);

  if (isPlainclothes) {
    if (weapon === 'gun') return selectStableCandidate([playerAssets.plainclothes_a_gun, playerAssets.plainclothes_b_gun], combat.combatId);
    if (weapon === 'tool') return selectStableCandidate([playerAssets.plainclothes_a_tool, playerAssets.plainclothes_b_tool], combat.combatId);
    return selectStableCandidate([playerAssets.plainclothes_a_empty, playerAssets.plainclothes_b_empty], combat.combatId);
  }

  if (isCommand) {
    if (weapon === 'gun') return playerAssets.command_uniform_gun;
    if (weapon === 'tool') return playerAssets.command_uniform_baton;
    return playerAssets.command_uniform_empty;
  }

  if (weapon === 'gun') return playerAssets.uniform_constable_gun;
  if (weapon === 'tool') return playerAssets.uniform_constable_baton;
  return playerAssets.uniform_constable_empty;
}

function selectPlayerWeapon(combat: CombatEvent, clue: string): 'gun' | 'tool' | 'empty' {
  if (combat.type === 'firearm' || hasAny(clue, ['枪', '左轮', '手枪', 'firearm', 'gun', 'revolver'])) return 'gun';
  if (combat.type === 'armed' || combat.type === 'arrest' || hasAny(clue, ['警棍', '棍', '器械', 'baton', 'tool'])) return 'tool';
  return 'empty';
}

function selectEnemy(combat: CombatEvent, clue: string, opponentClue: string): CombatVisualLayerAsset {
  const source = opponentClue || clue;
  const female = hasAny(source, ['女', 'woman', 'female']);
  const gun = combat.type === 'firearm' || hasAny(source, ['枪', '左轮', '手枪', 'gun', 'revolver']);

  if (female) {
    if (gun) return enemyAssets.female_gunman_informant;
    if (hasAny(source, ['逃', '跑', 'flee'])) return enemyAssets.female_fleeing_suspect;
    if (hasAny(source, ['夜场', '夜总会', '卡拉ok', 'karaoke', 'nightclub'])) return enemyAssets.female_nightlife_helper;
    return enemyAssets.female_street_suspect;
  }
  if (hasAny(source, ['黑警', '警察', '警队', 'police'])) return enemyAssets.corrupt_police;
  if (hasAny(source, ['政客', '议员', '官员', 'politician'])) return enemyAssets.politician_councilman;
  if (hasAny(source, ['洋人', '外籍', 'foreigner', 'foreign'])) return enemyAssets.foreign_security;
  if (hasAny(source, ['老板', '商人', '经理', 'businessman'])) return enemyAssets.corrupt_businessman;
  if (hasAny(source, ['坐馆', '龙头', '大佬', 'boss'])) return enemyAssets.triad_boss;
  if (hasAny(source, ['头马', '揸fit', 'fit人', 'lieutenant'])) return enemyAssets.triad_lieutenant;
  if (gun) return enemyAssets.lowlevel_triad_gunman;
  if (hasAny(source, ['逃犯', '亡命', '通缉', 'fugitive'])) return enemyAssets.fugitive;
  if (hasAny(source, ['劫匪', '抢劫', 'robber'])) return enemyAssets.armed_robber;
  if (hasAny(source, ['码头', '仓库', 'dock', 'warehouse'])) return enemyAssets.dock_warehouse_thug;
  if (hasAny(source, ['卡拉ok', 'karaoke'])) return enemyAssets.karaoke_enforcer;
  if (hasAny(source, ['夜场', '夜总会', '看场', 'nightclub'])) return enemyAssets.nightclub_bouncer;
  if (hasAny(source, ['扒手', '小偷', '逃跑', 'pickpocket'])) return enemyAssets.pickpocket_runner;
  if (hasAny(source, ['醉', '酒', 'drunk'])) return enemyAssets.drunk_troublemaker;
  if (hasAny(source, ['街市', 'market'])) return enemyAssets.market_ruffian;
  return enemyAssets.street_triad_knife;
}

function selectEffects(combat: CombatEvent, clue: string): CombatVisualEffect[] {
  if (combat.type === 'firearm' || hasAny(clue, ['枪', '左轮', '手枪', '开枪', 'gun', 'firearm'])) return ['gunfire'];
  if (combat.type === 'chase' || combat.type === 'escape') return ['chase'];
  if (combat.type === 'crowd') return ['crowd'];
  return ['impact'];
}

function selectWeather(combat: CombatEvent, state: RuntimeState, clue: string): CombatVisualWeather[] {
  const weather: CombatVisualWeather[] = [];
  const add = (item: CombatVisualWeather) => {
    if (!weather.includes(item)) weather.push(item);
  };

  if (state.time.hour < 6 || state.time.hour >= 19 || hasAny(clue, ['夜', '凌晨', 'night'])) add('night');
  if (hasAny(`${state.environment.weather.condition} ${clue}`.toLowerCase(), ['雨', 'rain', 'storm'])) add('rain');
  if (hasAny(clue, ['雾', 'fog', 'mist'])) add('fog');

  if (combat.locationSummary.includes('夜总会') || combat.locationSummary.includes('夜场')) add('night');
  return weather;
}

function selectResultTone(combat: CombatEvent): CombatVisualResultTone {
  if (combat.outcome === 'player_advantage' || combat.outcome === 'opponent_subdued') return 'success';
  if (combat.outcome === 'player_wounded' || combat.outcome === 'opponent_escaped') return 'failure';
  return 'neutral';
}

function selectStableCandidate<T>(candidates: T[], seed: string): T {
  return candidates[stableIndex(seed, candidates.length)];
}

function stableIndex(seed: string, modulo: number): number {
  let total = 0;
  for (let index = 0; index < seed.length; index += 1) {
    total = (total + seed.charCodeAt(index)) >>> 0;
  }
  return total % modulo;
}

function hasAny(value: string, keywords: string[]): boolean {
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}
