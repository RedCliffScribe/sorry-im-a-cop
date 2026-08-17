function normalizeChecksumValue(
  value: unknown,
  seen: Set<object>
): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Checksum input cannot contain non-finite numbers.');
    }
    return value;
  }
  if (typeof value === 'undefined') return undefined;
  if (typeof value !== 'object') {
    throw new TypeError(`Checksum input cannot contain ${typeof value} values.`);
  }
  if (seen.has(value)) {
    throw new TypeError('Checksum input cannot contain circular references.');
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeChecksumValue(item, seen) ?? null);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Checksum input must contain only plain JSON objects.');
    }
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .flatMap((key) => {
          const normalized = normalizeChecksumValue(record[key], seen);
          return normalized === undefined ? [] : [[key, normalized]];
        })
    );
  } finally {
    seen.delete(value);
  }
}

export function canonicalizeCustomContentForChecksum(value: unknown): string {
  return JSON.stringify(normalizeChecksumValue(value, new Set()));
}

async function createSha256Checksum(
  bytes: Uint8Array<ArrayBuffer>
): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

export async function createCustomContentChecksum(
  value: unknown
): Promise<string> {
  return createSha256Checksum(
    new TextEncoder().encode(canonicalizeCustomContentForChecksum(value))
  );
}

export async function createCustomContentTextChecksum(
  text: string
): Promise<string> {
  return createSha256Checksum(new TextEncoder().encode(text));
}

export async function createCustomContentBlobChecksum(
  blob: Blob
): Promise<string> {
  return createSha256Checksum(
    new Uint8Array(await blob.arrayBuffer())
  );
}
