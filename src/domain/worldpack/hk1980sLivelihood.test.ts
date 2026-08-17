import { describe, expect, it } from 'vitest';
import {
  formatEverydayEmployerTemplateCandidates,
  selectEverydayEmployerTemplates
} from './hk1980sLivelihood';

describe('hk1980s livelihood employer templates', () => {
  it('selects small-employer candidates only from structured sector and role tags', () => {
    const selected = selectEverydayEmployerTemplates({
      year: 1988,
      sectorIds: ['catering', 'retail'],
      roleTags: ['floor_staff']
    });

    expect(selected[0]?.templateId).toBe('tea_restaurant');
    expect(selected.map((template) => template.templateId)).toContain('small_retail');
  });

  it('does not infer an employer template when structured tags are absent', () => {
    expect(
      selectEverydayEmployerTemplates({
        year: 1988,
        sectorIds: [],
        roleTags: []
      })
    ).toEqual([]);
  });

  it('honors the era gate and marks formatted templates as candidates only', () => {
    expect(
      selectEverydayEmployerTemplates({
        year: 2005,
        sectorIds: ['medical']
      })
    ).toEqual([]);

    const formatted = formatEverydayEmployerTemplateCandidates({
      year: 1988,
      sectorIds: ['medical']
    });
    expect(formatted).toContain('templateId=private_clinic');
    expect(formatted).toContain('pressureThemes=');
  });
});
