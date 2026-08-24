import { describe, expect, it } from 'vitest';
import { validateNarratorResponse } from './validateWriteback';

function responseWith(writeback: Record<string, unknown>) {
  return validateNarratorResponse({
    narrativeText: '本回合完成了一段普通交谈，没有发生职业或岗位变化。',
    turnSummary: '玩家完成普通交谈，身份与岗位没有变化。',
    suggestedActions: ['继续处理当前事务。'],
    writeback
  });
}

describe('optional player role patch normalization', () => {
  it('silently omits the all-null police and civilian placeholder shells seen in diagnostics', () => {
    const response = responseWith({
      policeRoleProfilePatch: {
        reason: null,
        stationOrPost: null,
        department: null,
        assignmentSummary: null
      },
      civilianRoleProfilePatch: {
        reason: null
      }
    });

    expect(response.writeback.policeRoleProfilePatch).toBeUndefined();
    expect(response.writeback.civilianRoleProfilePatch).toBeUndefined();
    expect(response.validationWarnings).toBeUndefined();
  });

  it.each([
    ['policeRoleProfilePatch', null],
    ['civilianRoleProfilePatch', null],
    ['policeRoleProfilePatch', {}],
    [
      'civilianRoleProfilePatch',
      { reason: ' ', sectorIds: [], roleTags: [], livelihoodActorIds: [] }
    ]
  ])('silently omits an empty %s module', (key, value) => {
    const response = responseWith({ [key]: value });

    expect(response.writeback[key as keyof typeof response.writeback]).toBeUndefined();
    expect(response.validationWarnings).toBeUndefined();
  });

  it('keeps strict warnings for a meaningful but incomplete police posting change', () => {
    const response = responseWith({
      policeRoleProfilePatch: {
        reason: '调令已经正式生效。',
        department: 'Criminal Investigation Department（刑事侦缉处 CID）'
      }
    });

    expect(response.writeback.policeRoleProfilePatch).toBeUndefined();
    expect(response.validationWarnings?.map((warning) => warning.path.join('.'))).toEqual(
      expect.arrayContaining([
        'writeback.policeRoleProfilePatch.stationOrPost',
        'writeback.policeRoleProfilePatch.assignmentSummary'
      ])
    );
  });

  it('keeps strict warnings for malformed non-placeholder modules and unknown fields', () => {
    const primitive = responseWith({ policeRoleProfilePatch: 'not-an-object' });
    const unknownField = responseWith({ civilianRoleProfilePatch: { inventedField: null } });

    expect(primitive.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'policeRoleProfilePatch'],
        code: 'invalid_type'
      })
    );
    expect(unknownField.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'civilianRoleProfilePatch'],
        code: 'unrecognized_keys'
      })
    );
  });

  it('preserves a complete formal police posting change', () => {
    const response = responseWith({
      policeRoleProfilePatch: {
        reason: '正式调令已经生效并完成报到。',
        stationOrPost: 'Kowloon Regional Headquarters（九龙总区总部）',
        department: 'Criminal Investigation Department（刑事侦缉处 CID）',
        assignmentSummary: '刑事侦缉队调查员，负责案件调查与侦缉工作。'
      }
    });

    expect(response.writeback.policeRoleProfilePatch).toMatchObject({
      department: 'Criminal Investigation Department（刑事侦缉处 CID）'
    });
    expect(response.validationWarnings).toBeUndefined();
  });

  it('preserves an intentional civilian field clear when a real reason is present', () => {
    const response = responseWith({
      civilianRoleProfilePatch: {
        reason: '玩家已经正式离职并结束原雇佣关系。',
        employmentStatusId: 'unemployed',
        employerOrganizationId: null,
        workplacePlaceId: null,
        workUnitSummary: null,
        positionSummary: null,
        dutySummary: null
      }
    });

    expect(response.writeback.civilianRoleProfilePatch).toMatchObject({
      employmentStatusId: 'unemployed',
      employerOrganizationId: null,
      workplacePlaceId: null
    });
    expect(response.validationWarnings).toBeUndefined();
  });
});
