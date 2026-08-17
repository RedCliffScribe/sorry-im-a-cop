import { describe, expect, it } from 'vitest';
import {
  getWorldpackAdaptationDescriptor,
  HK_1988_ADAPTATION_DESCRIPTOR,
  listWorldpackAdaptationDescriptors
} from './adaptationRegistry';

describe('worldpack adaptation registry', () => {
  it('registers the current runtime worldpack with its real coverage', () => {
    expect(listWorldpackAdaptationDescriptors()).toEqual([
      HK_1988_ADAPTATION_DESCRIPTOR
    ]);
    expect(HK_1988_ADAPTATION_DESCRIPTOR).toMatchObject({
      worldpackId: 'hk_1988',
      descriptorVersion: 1,
      title: '香港 1988',
      timeRange: {
        from: 1980,
        to: 1996
      }
    });
    expect(HK_1988_ADAPTATION_DESCRIPTOR.hardConstraints.length).toBeGreaterThan(0);
  });

  it('does not invent descriptors for future worldpacks', () => {
    expect(getWorldpackAdaptationDescriptor('hk_1988')).toBe(
      HK_1988_ADAPTATION_DESCRIPTOR
    );
    expect(getWorldpackAdaptationDescriptor('future_worldpack')).toBeUndefined();
    expect(getWorldpackAdaptationDescriptor(undefined)).toBeUndefined();
  });

  it('exposes immutable registry data', () => {
    expect(Object.isFrozen(listWorldpackAdaptationDescriptors())).toBe(true);
    expect(Object.isFrozen(HK_1988_ADAPTATION_DESCRIPTOR)).toBe(true);
    expect(Object.isFrozen(HK_1988_ADAPTATION_DESCRIPTOR.timeRange)).toBe(true);
    expect(Object.isFrozen(HK_1988_ADAPTATION_DESCRIPTOR.hardConstraints)).toBe(true);
  });
});
