import { describe, expect, it } from 'vitest';
import { formatPoliceRank, formatPoliceTerm } from './policeTerminology';

describe('police terminology', () => {
  it('formats EU departments, regional postings, and rank-bounded roles', () => {
    expect(formatPoliceTerm('Emergency Unit（冲锋队 EU）')).toBe('冲锋队（EU）');
    expect(formatPoliceTerm('Emergency Unit Hong Kong Island（港岛总区冲锋队）')).toBe('港岛总区冲锋队');
    expect(formatPoliceTerm('Emergency Unit Kowloon East（东九龙总区冲锋队）')).toBe('东九龙总区冲锋队');
    expect(formatPoliceTerm('Emergency Unit Kowloon West（西九龙总区冲锋队）')).toBe('西九龙总区冲锋队');
    expect(formatPoliceTerm('Emergency Unit New Territories North（新界北总区冲锋队）')).toBe('新界北总区冲锋队');
    expect(formatPoliceTerm('Emergency Unit New Territories South（新界南总区冲锋队）')).toBe('新界南总区冲锋队');
    expect(formatPoliceTerm('Emergency Vehicle Crew Officer（冲锋车车组警员）')).toBe('冲锋车车组警员');
    expect(formatPoliceTerm('Emergency Vehicle Commander（冲锋车车长）')).toBe('冲锋车车长');
    expect(formatPoliceTerm('EU Platoon Second-in-Command（冲锋队小队副指挥）')).toBe('冲锋队小队副指挥');
    expect(formatPoliceTerm('Probationary EU Platoon Commander（冲锋队见习小队指挥官）')).toBe(
      '冲锋队见习小队指挥官'
    );
    expect(formatPoliceTerm('EU Headquarters Operations Officer（冲锋队总部行动官）')).toBe('冲锋队总部行动官');
  });

  it('keeps legacy role text readable while distinguishing divisional patrol and PTU support from EU', () => {
    expect(formatPoliceTerm('Response Officer')).toBe('分区应变巡逻警员');
    expect(formatPoliceTerm('Divisional Response Patrol Officer（分区应变巡逻警员）')).toBe('分区应变巡逻警员');
    expect(formatPoliceTerm('Emergency Response Officer')).toBe('公共秩序支援警员');
    expect(formatPoliceTerm('Public Order Support Officer（公共秩序支援警员）')).toBe('公共秩序支援警员');
  });

  it.each([
    ['Chief Inspector（总督察 CIP）', '总督察'],
    ['Superintendent（警司 SP）', '警司'],
    ['Senior Superintendent（高级警司 SSP）', '高级警司'],
    ['Chief Superintendent（总警司 CSP）', '总警司'],
    ['Assistant Commissioner of Police（助理处长 ACP）', '助理处长'],
    ['Senior Assistant Commissioner of Police（高级助理处长 SACP）', '高级助理处长'],
    ['Deputy Commissioner of Police（副处长 DCP）', '副处长'],
    ['Commissioner of Police（警务处长 CP）', '警务处长']
  ] as const)('formats the complete senior-rank ladder: %s', (rank, expected) => {
    expect(formatPoliceRank(rank)).toBe(expected);
  });
});
