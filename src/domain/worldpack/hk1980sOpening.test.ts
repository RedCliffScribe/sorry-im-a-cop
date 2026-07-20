import { describe, expect, it } from 'vitest';
import {
  civilianOpeningProfileOptions,
  getAllowedPolicePostings,
  getAllowedPoliceRoles,
  getAllowedTriadTerritories,
  getAllowedTriadRoles,
  getCivilianOpeningProfile,
  hk1980sOpeningScenarios,
  hk1980sOriginBackgroundOptions,
  hk1980sPoliceRankKnowledge,
  resolveTriadOpeningProfile,
  triadRankOptions,
  triadSocietyOptions
} from './hk1980sOpening';

describe('Hong Kong 1980s police opening data', () => {
  it('keeps branch, posting, and role as separate layers', () => {
    const uniformPostings = getAllowedPolicePostings('uniform');
    const cidPostings = getAllowedPolicePostings('cid');
    const ptuPostings = getAllowedPolicePostings('ptu');

    expect(uniformPostings.map((posting) => posting.id)).toContain('mong_kok_police_station');
    expect(cidPostings.map((posting) => posting.id)).toContain('mong_kok_police_station');
    expect(cidPostings.map((posting) => posting.id)).toContain('cid_headquarters');
    expect(ptuPostings.map((posting) => posting.id)).toContain('ptu_barracks');
    expect(ptuPostings.map((posting) => posting.id)).not.toContain('mong_kok_police_station');
  });

  it('keeps a broad police station posting pool for station-based branches', () => {
    const uniformPostingIds = getAllowedPolicePostings('uniform').map((posting) => posting.id);

    expect(uniformPostingIds).toEqual(
      expect.arrayContaining([
        'central_police_station',
        'peak_police_station',
        'western_police_station',
        'aberdeen_police_station',
        'stanley_police_station',
        'wan_chai_police_station',
        'happy_valley_police_station',
        'north_point_police_station',
        'chai_wan_police_station',
        'tsim_sha_tsui_police_station',
        'yau_ma_tei_police_station',
        'mong_kok_police_station',
        'sham_shui_po_police_station',
        'cheung_sha_wan_police_station',
        'kowloon_city_police_station',
        'hung_hom_police_station',
        'wong_tai_sin_police_station',
        'kwun_tong_police_station',
        'sau_mau_ping_police_station',
        'ngau_tau_kok_police_station',
        'tsuen_wan_police_station',
        'sha_tin_police_station',
        'tai_po_police_station',
        'sheung_shui_police_station',
        'tuen_mun_police_station',
        'castle_peak_police_station',
        'yuen_long_police_station',
        'cheung_chau_police_station'
      ])
    );
    expect(uniformPostingIds.length).toBeGreaterThanOrEqual(28);
  });

  it('keeps station duty roles out of uniform branch role options', () => {
    const uniformRoles = getAllowedPoliceRoles('uniform', 'pc').map((role) => role.id);

    expect(uniformRoles).toContain('beat_constable');
    expect(uniformRoles).not.toContain('report_room');
    expect(uniformRoles).not.toContain('case_intake');
  });

  it('offers twelve Hong Kong origin and background anchors including mainland newcomers', () => {
    expect(hk1980sOriginBackgroundOptions).toHaveLength(12);
    expect(hk1980sOriginBackgroundOptions.map((origin) => origin.name)).toContain('大陆新移民家庭');
    expect(hk1980sOriginBackgroundOptions.find((origin) => origin.originBackgroundId === 'mainland_newcomer_family')).toMatchObject({
      definition: expect.stringContaining('内地'),
      backgroundSummary: expect.stringContaining('亲属')
    });
  });

  it('keeps police rank knowledge in the worldpack so SPC cannot drift into SP', () => {
    expect(hk1980sPoliceRankKnowledge).toContain('SPC = Senior Constable');
    expect(hk1980sPoliceRankKnowledge).toContain('SP = Superintendent');
    expect(hk1980sPoliceRankKnowledge).toContain('SPC 绝不是 SP');
    expect(hk1980sPoliceRankKnowledge).toContain('PC/SPC 是一线基层人员');
  });

  it('uses a direct player-facing title for the recommended 1988 opening', () => {
    expect(hk1980sOpeningScenarios.find((scenario) => scenario.id === 'hk_1988_crosscurrents')?.title).toBe(
      '1988 纪律与人情'
    );
  });
});

describe('HK 1980s civilian and triad opening options', () => {
  it('provides unemployed and custom civilian routes', () => {
    expect(civilianOpeningProfileOptions.map((profile) => profile.id)).toEqual(
      expect.arrayContaining(['unemployed', 'custom_occupation'])
    );

    const custom = getCivilianOpeningProfile('custom_occupation', {
      publicOccupation: '自由摄影师',
      workplacePlaceId: 'place_broadcast_drive',
      workplaceLabel: '广播道',
      communitySummary: '常接触记者、冲印店和夜场宣传人员。'
    });

    expect(custom).toMatchObject({
      employmentStatus: 'custom',
      publicOccupation: '自由摄影师',
      workplacePlaceId: 'place_broadcast_drive',
      workplaceLabel: '广播道',
      communitySummary: '常接触记者、冲印店和夜场宣传人员。'
    });
  });

  it('gives every playable triad rank at least one compatible role', () => {
    for (const rank of triadRankOptions) {
      expect(getAllowedTriadRoles(rank.id).length).toBeGreaterThan(0);
    }
  });

  it('keeps society and territory as separate data, with multiple registered areas for every society', () => {
    for (const society of triadSocietyOptions) {
      const territories = getAllowedTriadTerritories(society.id);

      expect(territories.length).toBeGreaterThanOrEqual(2);
      expect(territories.map((territory) => territory.placeId)).toEqual(society.territoryPlaceIds);
      expect(new Set(territories.map((territory) => territory.placeId)).size).toBe(territories.length);
      expect(territories.some((territory) => territory.placeId === society.defaultTerritoryPlaceId)).toBe(true);
    }
  });

  it('resolves a playable middle-rank profile without exposing elder or top-leader offices', () => {
    const profile = resolveTriadOpeningProfile({
      societyId: 'org_14k',
      territoryPlaceId: 'place_macau_ferry_terminal',
      rankId: 'district_cadre',
      roleId: 'district_affairs_coordinator'
    });
    const selectableLabels = [
      ...triadRankOptions.map((rank) => rank.label),
      ...triadRankOptions.flatMap((rank) => getAllowedTriadRoles(rank.id).map((role) => role.label))
    ].join('、');

    expect(profile).toMatchObject({
      organizationId: 'org_14k',
      societyName: '十四K',
      rankSummary: '地区中层骨干',
      roleTitle: '地区事务协调',
      territoryPlaceId: 'place_macau_ferry_terminal',
      startPlaceId: 'place_macau_ferry_terminal',
      startPlaceLabel: '港澳码头'
    });
    expect(profile.territorySummary).toContain('港澳码头及其周边活动线');
    expect(profile.authoritySummary).toContain('受上层授权');
    expect(selectableLabels).not.toMatch(/叔伯|坐馆|话事人/);
  });
});
