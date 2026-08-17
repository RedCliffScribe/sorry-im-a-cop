import {
  customContentRevisionIdentityKey,
  customContentRevisionRefKey
} from './assetFoundation';
import type {
  CustomContentDependency,
  CustomContentRevisionRef
} from './assetTypes';

export type CustomContentDependencyDiagnosticCode =
  | 'duplicate_dependency'
  | 'owner_missing'
  | 'dependency_missing'
  | 'checksum_mismatch'
  | 'self_dependency'
  | 'dependency_cycle';

export interface CustomContentDependencyDiagnostic {
  code: CustomContentDependencyDiagnosticCode;
  dependencyId?: string;
  refKey?: string;
  message: string;
}

export interface CustomContentDependencyGraphAssessment {
  valid: boolean;
  diagnostics: CustomContentDependencyDiagnostic[];
}

export function createCustomContentDependencyId(
  owner: CustomContentRevisionRef,
  target: CustomContentRevisionRef,
  kind: CustomContentDependency['kind']
): string {
  return `${customContentRevisionRefKey(owner)}=>${customContentRevisionRefKey(target)}:${kind}`;
}

export function assessCustomContentDependencyGraph({
  availableRevisions,
  dependencies
}: {
  availableRevisions: readonly CustomContentRevisionRef[];
  dependencies: readonly CustomContentDependency[];
}): CustomContentDependencyGraphAssessment {
  const diagnostics: CustomContentDependencyDiagnostic[] = [];
  const availableByIdentity = new Map(
    availableRevisions.map((ref) => [customContentRevisionIdentityKey(ref), ref])
  );
  const dependencyIds = new Set<string>();
  const adjacency = new Map<string, string[]>();

  for (const dependency of dependencies) {
    const ownerIdentity = customContentRevisionIdentityKey(dependency.owner);
    const targetIdentity = customContentRevisionIdentityKey(dependency.target);
    if (dependencyIds.has(dependency.dependencyId)) {
      diagnostics.push({
        code: 'duplicate_dependency',
        dependencyId: dependency.dependencyId,
        message: `依赖 ID 重复：${dependency.dependencyId}`
      });
      continue;
    }
    dependencyIds.add(dependency.dependencyId);

    const owner = availableByIdentity.get(ownerIdentity);
    const target = availableByIdentity.get(targetIdentity);
    if (!owner) {
      diagnostics.push({
        code: 'owner_missing',
        dependencyId: dependency.dependencyId,
        refKey: ownerIdentity,
        message: `依赖所有者不存在：${ownerIdentity}`
      });
    } else if (owner.checksum !== dependency.owner.checksum) {
      diagnostics.push({
        code: 'checksum_mismatch',
        dependencyId: dependency.dependencyId,
        refKey: ownerIdentity,
        message: `依赖所有者 checksum 不一致：${ownerIdentity}`
      });
    }
    if (!target) {
      diagnostics.push({
        code: 'dependency_missing',
        dependencyId: dependency.dependencyId,
        refKey: targetIdentity,
        message: `固定依赖不存在：${targetIdentity}`
      });
    } else if (target.checksum !== dependency.target.checksum) {
      diagnostics.push({
        code: 'checksum_mismatch',
        dependencyId: dependency.dependencyId,
        refKey: targetIdentity,
        message: `依赖目标 checksum 不一致：${targetIdentity}`
      });
    }
    if (ownerIdentity === targetIdentity) {
      diagnostics.push({
        code: 'self_dependency',
        dependencyId: dependency.dependencyId,
        refKey: ownerIdentity,
        message: `资产不能依赖自身：${ownerIdentity}`
      });
    }
    if (owner && target && ownerIdentity !== targetIdentity) {
      const next = adjacency.get(ownerIdentity) ?? [];
      next.push(targetIdentity);
      adjacency.set(ownerIdentity, next);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleKeys = new Set<string>();

  function visit(key: string, path: string[]): void {
    if (visiting.has(key)) {
      const cycleStart = path.indexOf(key);
      const cycle = [...path.slice(Math.max(0, cycleStart)), key];
      cycleKeys.add(cycle.join(' -> '));
      return;
    }
    if (visited.has(key)) return;
    visiting.add(key);
    for (const next of adjacency.get(key) ?? []) {
      visit(next, [...path, key]);
    }
    visiting.delete(key);
    visited.add(key);
  }

  for (const key of adjacency.keys()) visit(key, []);
  for (const cycle of cycleKeys) {
    diagnostics.push({
      code: 'dependency_cycle',
      message: `依赖图存在循环：${cycle}`
    });
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics
  };
}
