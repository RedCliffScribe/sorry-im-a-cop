import { describe, expect, it } from 'vitest';
import {
  canonicalizeCustomContentForChecksum,
  createCustomContentBlobChecksum,
  createCustomContentChecksum,
  createCustomContentTextChecksum
} from './checksum';

describe('custom content checksums', () => {
  it('canonicalizes object keys while preserving array order', async () => {
    const left = {
      z: 1,
      nested: {
        b: true,
        a: ['first', 'second']
      }
    };
    const right = {
      nested: {
        a: ['first', 'second'],
        b: true
      },
      z: 1
    };

    expect(canonicalizeCustomContentForChecksum(left)).toBe(
      canonicalizeCustomContentForChecksum(right)
    );
    expect(await createCustomContentChecksum(left)).toBe(
      await createCustomContentChecksum(right)
    );
    expect(await createCustomContentChecksum({
      ...right,
      nested: {
        ...right.nested,
        a: ['second', 'first']
      }
    })).not.toBe(await createCustomContentChecksum(left));
  });

  it('returns a lowercase SHA-256 checksum', async () => {
    expect(await createCustomContentChecksum({ title: '测试' })).toMatch(
      /^[a-f0-9]{64}$/
    );
    expect(await createCustomContentTextChecksum('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    expect(await createCustomContentBlobChecksum(new Blob(['abc']))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('rejects values that cannot be a portable asset payload', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => canonicalizeCustomContentForChecksum(circular)).toThrow(
      'circular'
    );
    expect(() =>
      canonicalizeCustomContentForChecksum({ value: Number.POSITIVE_INFINITY })
    ).toThrow('non-finite');
    expect(() =>
      canonicalizeCustomContentForChecksum({ callback: () => undefined })
    ).toThrow('function');
    expect(() =>
      canonicalizeCustomContentForChecksum({ date: new Date() })
    ).toThrow('plain JSON');
  });
});
