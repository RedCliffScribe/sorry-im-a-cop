import { describe, expect, it } from 'vitest';
import type {
  CustomContentDependency,
  CustomContentRevisionRef
} from './assetTypes';
import {
  assessCustomContentDependencyGraph,
  createCustomContentDependencyId
} from './dependencyGraph';

function ref(
  assetKind: CustomContentRevisionRef['assetKind'],
  assetId: string,
  checksum = `${assetId}_checksum`
): CustomContentRevisionRef {
  return { assetKind, assetId, revision: 1, checksum };
}

function dependency(
  owner: CustomContentRevisionRef,
  target: CustomContentRevisionRef
): CustomContentDependency {
  return {
    dependencyId: createCustomContentDependencyId(owner, target, 'required'),
    owner,
    target,
    kind: 'required'
  };
}

describe('custom content dependency graph', () => {
  it('accepts a complete acyclic graph', () => {
    const project = ref('content_project', 'project_1');
    const event = ref('event_group', 'event_1');
    const character = ref('character', 'character_1');

    expect(assessCustomContentDependencyGraph({
      availableRevisions: [project, event, character],
      dependencies: [
        dependency(project, event),
        dependency(event, character)
      ]
    })).toEqual({
      valid: true,
      diagnostics: []
    });
  });

  it('reports missing revisions and checksum mismatches', () => {
    const project = ref('content_project', 'project_1');
    const missing = ref('character', 'missing');
    const wrongChecksum = {
      ...project,
      checksum: 'wrong'
    };

    const result = assessCustomContentDependencyGraph({
      availableRevisions: [project],
      dependencies: [dependency(wrongChecksum, missing)]
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(['checksum_mismatch', 'dependency_missing'])
    );
  });

  it('rejects duplicate, self, and cyclic dependencies', () => {
    const project = ref('content_project', 'project_1');
    const event = ref('event_group', 'event_1');
    const first = dependency(project, event);
    const second = dependency(event, project);
    const self = dependency(event, event);

    const result = assessCustomContentDependencyGraph({
      availableRevisions: [project, event],
      dependencies: [first, first, second, self]
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'duplicate_dependency',
        'self_dependency',
        'dependency_cycle'
      ])
    );
  });
});
