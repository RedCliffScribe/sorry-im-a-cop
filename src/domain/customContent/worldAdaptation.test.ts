import { describe, expect, it } from 'vitest';
import {
  assessCustomCharacterAdaptationPolicy,
  createDefaultCustomCharacterAdaptationPolicy,
  DEFAULT_CUSTOM_CHARACTER_ADAPTABLE_FIELDS,
  DEFAULT_CUSTOM_CHARACTER_LOCKED_FIELDS,
  DEFAULT_CUSTOM_CHARACTER_TEMPORAL_POLICY,
  hasPublishableWorldDeployment,
  reconcileCustomContentWorldDeployments,
  resolveCustomContentWorldDeployment
} from './worldAdaptation';

describe('custom content world deployment', () => {
  it('makes the source world native and keeps other installed worlds disabled', () => {
    expect(reconcileCustomContentWorldDeployments({
      installedWorldpackIds: ['hk_1988', 'future_worldpack'],
      nativeWorldpackId: 'hk_1988'
    })).toEqual([
      {
        worldpackId: 'hk_1988',
        mode: 'native',
        defaultEnabledForNewGame: true
      },
      {
        worldpackId: 'future_worldpack',
        mode: 'disabled',
        defaultEnabledForNewGame: false
      }
    ]);
  });

  it('defaults newly installed worldpacks to disabled for an existing revision', () => {
    const deployments = reconcileCustomContentWorldDeployments({
      installedWorldpackIds: ['hk_1988', 'newly_installed'],
      deployments: [
        {
          worldpackId: 'hk_1988',
          mode: 'ai_adapted',
          defaultEnabledForNewGame: false
        }
      ]
    });

    expect(deployments).toEqual([
      {
        worldpackId: 'hk_1988',
        mode: 'ai_adapted',
        defaultEnabledForNewGame: false
      },
      {
        worldpackId: 'newly_installed',
        mode: 'disabled',
        defaultEnabledForNewGame: false
      }
    ]);
  });

  it('treats missing deployment rows as disabled', () => {
    expect(resolveCustomContentWorldDeployment([], 'unknown_worldpack')).toEqual({
      worldpackId: 'unknown_worldpack',
      mode: 'disabled',
      defaultEnabledForNewGame: false
    });
  });

  it('never lets a disabled row become a new-game default', () => {
    expect(resolveCustomContentWorldDeployment([
      {
        worldpackId: 'hk_1988',
        mode: 'disabled',
        defaultEnabledForNewGame: true
      }
    ], 'hk_1988')).toEqual({
      worldpackId: 'hk_1988',
      mode: 'disabled',
      defaultEnabledForNewGame: false
    });
  });

  it('requires at least one enabled world before publishing', () => {
    expect(hasPublishableWorldDeployment([])).toBe(false);
    expect(hasPublishableWorldDeployment([
      {
        worldpackId: 'hk_1988',
        mode: 'disabled',
        defaultEnabledForNewGame: false
      }
    ])).toBe(false);
    expect(hasPublishableWorldDeployment([
      {
        worldpackId: 'hk_1988',
        mode: 'native',
        defaultEnabledForNewGame: false
      }
    ])).toBe(true);
  });
});

describe('custom character adaptation policy', () => {
  it('uses life-stage preservation and independent default field arrays', () => {
    const first = createDefaultCustomCharacterAdaptationPolicy();
    const second = createDefaultCustomCharacterAdaptationPolicy();

    expect(first.temporalPolicy).toBe(DEFAULT_CUSTOM_CHARACTER_TEMPORAL_POLICY);
    expect(first.lockedFields).toEqual(DEFAULT_CUSTOM_CHARACTER_LOCKED_FIELDS);
    expect(first.adaptableFields).toEqual(
      DEFAULT_CUSTOM_CHARACTER_ADAPTABLE_FIELDS
    );
    expect(first.lockedFields).not.toBe(second.lockedFields);
    expect(first.adaptableFields).not.toBe(second.adaptableFields);
  });

  it('marks conflicting locked and adaptable fields for review', () => {
    const policy = createDefaultCustomCharacterAdaptationPolicy({
      lockedFields: ['displayName', ' occupation ', 'occupation', '']
    });

    expect(assessCustomCharacterAdaptationPolicy(policy)).toEqual({
      status: 'needs_review',
      conflictingFields: ['occupation']
    });
  });

  it('reports a structurally consistent policy as ready', () => {
    expect(assessCustomCharacterAdaptationPolicy(
      createDefaultCustomCharacterAdaptationPolicy()
    )).toEqual({
      status: 'ready',
      conflictingFields: []
    });
  });
});
