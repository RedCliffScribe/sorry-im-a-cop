import { gzipSync, strToU8, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  decodeNovelAiStealthFromRgba,
  PNG_STYLE_MAX_DECOMPRESSED_METADATA_BYTES,
  readPngMetadata
} from './pngReader';

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  return concat(uint32(data.length), strToU8(type), data, new Uint8Array(4));
}

function pngWithText(type: 'tEXt' | 'zTXt' | 'iTXt', keyword: string, value: string): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = concat(uint32(2), uint32(2), new Uint8Array([8, 6, 0, 0, 0]));
  const key = strToU8(keyword);
  const textData = type === 'tEXt'
    ? concat(key, new Uint8Array([0]), strToU8(value))
    : type === 'zTXt'
      ? concat(key, new Uint8Array([0, 0]), zlibSync(strToU8(value)))
      : concat(key, new Uint8Array([0, 1, 0, 0, 0]), zlibSync(strToU8(value)));
  return concat(
    signature,
    chunk('IHDR', ihdr),
    chunk(type, textData),
    chunk('IDAT', new Uint8Array([0])),
    chunk('IEND', new Uint8Array())
  );
}

function stealthRgba(value: string, compressed = true): {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const payload = compressed ? gzipSync(strToU8(value)) : strToU8(value);
  return stealthRgbaPayload(
    payload,
    compressed ? 'stealth_pngcomp' : 'stealth_pnginfo'
  );
}

function stealthRgbaPayload(
  payload: Uint8Array,
  signatureText: 'stealth_pngcomp' | 'stealth_pnginfo'
): {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const signature = strToU8(signatureText);
  const data = concat(signature, uint32(payload.length * 8), payload);
  const width = 64;
  const height = 64;
  if (data.length * 8 > width * height) throw new Error('fixture overflow');
  const rgba = new Uint8ClampedArray(width * height * 4);
  rgba.fill(254);
  for (let bitIndex = 0; bitIndex < data.length * 8; bitIndex += 1) {
    const byte = data[Math.floor(bitIndex / 8)]!;
    const bit = (byte >> (7 - (bitIndex % 8))) & 1;
    const x = Math.floor(bitIndex / height);
    const y = bitIndex % height;
    rgba[(y * width + x) * 4 + 3] = 254 | bit;
  }
  return { rgba, width, height };
}

describe('PNG metadata reader', () => {
  it.each(['tEXt', 'zTXt', 'iTXt'] as const)('reads bounded %s metadata', async (type) => {
    const bytes = pngWithText(type, 'parameters', 'masterpiece\nSteps: 28');
    const file = new File([asArrayBuffer(bytes)], `${type}.png`, { type: 'image/png' });
    const result = await readPngMetadata(file);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.textChunks.parameters).toEqual(['masterpiece\nSteps: 28']);
    expect(result.imageHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a truncated PNG before attempting domain parsing', async () => {
    const file = new File(
      [asArrayBuffer(new Uint8Array([137, 80, 78, 71]))],
      'broken.png',
      { type: 'image/png' }
    );
    await expect(readPngMetadata(file)).rejects.toThrow('不是有效 PNG');
  });

  it('decodes the official NovelAI alpha-transposed stealth_pngcomp layout', () => {
    const metadata = JSON.stringify({
      Software: 'NovelAI',
      Description: 'by wlop, cinematic lighting',
      Comment: JSON.stringify({ uc: 'lowres', steps: 28 })
    });
    const fixture = stealthRgba(metadata);
    expect(decodeNovelAiStealthFromRgba(fixture.rgba, fixture.width, fixture.height)).toBe(metadata);
  });

  it('also reads uncompressed stealth_pnginfo without changing its text', () => {
    const metadata = '{"Description":"soft shading"}';
    const fixture = stealthRgba(metadata, false);
    expect(decodeNovelAiStealthFromRgba(fixture.rgba, fixture.width, fixture.height)).toBe(metadata);
  });

  it('rejects a stealth payload that declares more bytes than the image can contain', () => {
    const fixture = stealthRgba('small');
    const lengthOffset = 'stealth_pngcomp'.length * 8;
    const invalidLength = (PNG_STYLE_MAX_DECOMPRESSED_METADATA_BYTES + 1) * 8;
    for (let bitIndex = 0; bitIndex < 32; bitIndex += 1) {
      const bit = (invalidLength >> (31 - bitIndex)) & 1;
      const sequenceIndex = lengthOffset + bitIndex;
      const x = Math.floor(sequenceIndex / fixture.height);
      const y = sequenceIndex % fixture.height;
      fixture.rgba[(y * fixture.width + x) * 4 + 3] = 254 | bit;
    }
    expect(() => decodeNovelAiStealthFromRgba(
      fixture.rgba,
      fixture.width,
      fixture.height
    )).toThrow('超过安全上限');
  });

  it('rejects malformed stealth_pngcomp gzip data', () => {
    const fixture = stealthRgbaPayload(
      new Uint8Array([1, 2, 3, 4, 5]),
      'stealth_pngcomp'
    );
    expect(() => decodeNovelAiStealthFromRgba(
      fixture.rgba,
      fixture.width,
      fixture.height
    )).toThrow();
  });
});
