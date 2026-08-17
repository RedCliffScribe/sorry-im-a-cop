import { Gunzip, Unzlib, strFromU8 } from 'fflate';

export const PNG_STYLE_MAX_FILE_BYTES = 32 * 1024 * 1024;
export const PNG_STYLE_MAX_DIMENSION = 8192;
export const PNG_STYLE_MAX_PIXELS = 40_000_000;
export const PNG_STYLE_MAX_COMPRESSED_METADATA_BYTES = 2 * 1024 * 1024;
export const PNG_STYLE_MAX_DECOMPRESSED_METADATA_BYTES = 4 * 1024 * 1024;

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const STEALTH_SIGNATURES = ['stealth_pngcomp', 'stealth_pnginfo'] as const;

export interface ReadPngMetadata {
  bytes: Uint8Array;
  width: number;
  height: number;
  imageHash: string;
  textChunks: Record<string, string[]>;
}

function equalsAt(bytes: Uint8Array, expected: Uint8Array, offset = 0): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function decodeLatin1(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
}

function inflateWithLimit(
  bytes: Uint8Array,
  mode: 'gzip' | 'zlib',
  maximum = PNG_STYLE_MAX_DECOMPRESSED_METADATA_BYTES
): Uint8Array {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const onData = (chunk: Uint8Array) => {
    length += chunk.length;
    if (length > maximum) throw new Error('PNG 元数据解压后超过安全上限。');
    chunks.push(chunk);
  };
  const decoder = mode === 'gzip' ? new Gunzip(onData) : new Unzlib(onData);
  decoder.push(bytes, true);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function splitNullTerminated(bytes: Uint8Array, start: number): {
  value: Uint8Array;
  next: number;
} {
  const end = bytes.indexOf(0, start);
  if (end < 0) throw new Error('PNG 文本块缺少终止符。');
  return { value: bytes.slice(start, end), next: end + 1 };
}

function parseTextChunk(type: string, data: Uint8Array): { key: string; value: string } | undefined {
  if (type === 'tEXt') {
    const keyword = splitNullTerminated(data, 0);
    return {
      key: decodeLatin1(keyword.value),
      value: decodeLatin1(data.slice(keyword.next))
    };
  }
  if (type === 'zTXt') {
    const keyword = splitNullTerminated(data, 0);
    if (data[keyword.next] !== 0) throw new Error('PNG zTXt 使用了不支持的压缩方法。');
    const compressed = data.slice(keyword.next + 1);
    if (compressed.length > PNG_STYLE_MAX_COMPRESSED_METADATA_BYTES) {
      throw new Error('PNG 压缩元数据超过安全上限。');
    }
    return {
      key: decodeLatin1(keyword.value),
      value: decodeLatin1(inflateWithLimit(compressed, 'zlib'))
    };
  }
  if (type !== 'iTXt') return undefined;
  const keyword = splitNullTerminated(data, 0);
  const compressionFlag = data[keyword.next];
  const compressionMethod = data[keyword.next + 1];
  if (compressionFlag !== 0 && compressionFlag !== 1) throw new Error('PNG iTXt 压缩标记非法。');
  if (compressionFlag === 1 && compressionMethod !== 0) throw new Error('PNG iTXt 使用了不支持的压缩方法。');
  const language = splitNullTerminated(data, keyword.next + 2);
  const translatedKeyword = splitNullTerminated(data, language.next);
  void translatedKeyword;
  const payload = data.slice(translatedKeyword.next);
  if (payload.length > PNG_STYLE_MAX_COMPRESSED_METADATA_BYTES) {
    throw new Error('PNG 国际文本元数据超过安全上限。');
  }
  const decoded = compressionFlag === 1 ? inflateWithLimit(payload, 'zlib') : payload;
  return {
    key: decodeLatin1(keyword.value),
    value: strFromU8(decoded)
  };
}

export async function hashPngBytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function readPngMetadata(file: File | Blob): Promise<ReadPngMetadata> {
  if (file.size <= 0 || file.size > PNG_STYLE_MAX_FILE_BYTES) {
    throw new Error(`PNG 文件必须大于 0 且不超过 ${PNG_STYLE_MAX_FILE_BYTES / 1024 / 1024} MiB。`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!equalsAt(bytes, PNG_SIGNATURE)) throw new Error('所选文件不是有效 PNG。');
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let sawEnd = false;
  let sawImageData = false;
  let textBytes = 0;
  const textChunks: Record<string, string[]> = {};
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    if (length > PNG_STYLE_MAX_FILE_BYTES || offset + 12 + length > bytes.length) {
      throw new Error('PNG 数据块长度非法或文件已损坏。');
    }
    const type = decodeLatin1(bytes.slice(offset + 4, offset + 8));
    const data = bytes.slice(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      if (data.length !== 13 || width || height) throw new Error('PNG IHDR 结构非法。');
      width = readUint32(data, 0);
      height = readUint32(data, 4);
      if (
        width <= 0 ||
        height <= 0 ||
        width > PNG_STYLE_MAX_DIMENSION ||
        height > PNG_STYLE_MAX_DIMENSION ||
        width * height > PNG_STYLE_MAX_PIXELS
      ) {
        throw new Error('PNG 尺寸超过画风导入安全上限。');
      }
    }
    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      textBytes += data.length;
      if (textBytes > PNG_STYLE_MAX_COMPRESSED_METADATA_BYTES) {
        throw new Error('PNG 文本元数据总量超过安全上限。');
      }
      const entry = parseTextChunk(type, data);
      if (entry) {
        if (!entry.key.trim() || entry.key.length > 200) throw new Error('PNG 文本键非法。');
        const values = textChunks[entry.key] ?? [];
        if (values.length >= 20 || Object.keys(textChunks).length > 200) {
          throw new Error('PNG 文本元数据条目过多。');
        }
        values.push(entry.value);
        textChunks[entry.key] = values;
      }
    }
    if (type === 'IDAT') sawImageData = true;
    offset += 12 + length;
    if (type === 'IEND') {
      sawEnd = true;
      break;
    }
  }
  if (!width || !height || !sawImageData || !sawEnd) {
    throw new Error('PNG 缺少必要的 IHDR、IDAT 或 IEND 数据块。');
  }
  return {
    bytes,
    width,
    height,
    imageHash: await hashPngBytes(bytes),
    textChunks
  };
}

function stealthAlphaByte(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  byteIndex: number
): number {
  let value = 0;
  for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
    const sequenceIndex = byteIndex * 8 + bitIndex;
    const x = Math.floor(sequenceIndex / height);
    const y = sequenceIndex % height;
    if (x >= width) throw new Error('NovelAI 隐写元数据长度超过图片容量。');
    const alpha = rgba[(y * width + x) * 4 + 3];
    value = (value << 1) | ((alpha ?? 0) & 1);
  }
  return value;
}

export function decodeNovelAiStealthFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): string | undefined {
  if (width <= 0 || height <= 0 || width * height > PNG_STYLE_MAX_PIXELS) {
    throw new Error('NovelAI 隐写图片尺寸非法。');
  }
  if (rgba.length !== width * height * 4) throw new Error('NovelAI 隐写 RGBA 缓冲区尺寸不匹配。');
  const signatureLength = STEALTH_SIGNATURES[0].length;
  if (width * height < (signatureLength + 4) * 8) return undefined;
  const signatureBytes = new Uint8Array(signatureLength);
  for (let index = 0; index < signatureBytes.length; index += 1) {
    signatureBytes[index] = stealthAlphaByte(rgba, width, height, index);
  }
  const signature = strFromU8(signatureBytes);
  if (!STEALTH_SIGNATURES.includes(signature as (typeof STEALTH_SIGNATURES)[number])) return undefined;
  const lengthBytes = new Uint8Array(4);
  for (let index = 0; index < 4; index += 1) {
    lengthBytes[index] = stealthAlphaByte(rgba, width, height, signatureLength + index);
  }
  const bitLength = new DataView(lengthBytes.buffer).getUint32(0, false);
  if (bitLength % 8 !== 0) throw new Error('NovelAI 隐写元数据 bit 长度非法。');
  const payloadLength = bitLength / 8;
  if (payloadLength <= 0 || payloadLength > PNG_STYLE_MAX_COMPRESSED_METADATA_BYTES) {
    throw new Error('NovelAI 隐写元数据长度超过安全上限。');
  }
  if ((signatureLength + 4 + payloadLength) * 8 > width * height) {
    throw new Error('NovelAI 隐写元数据声明长度超过图片容量。');
  }
  const payload = new Uint8Array(payloadLength);
  for (let index = 0; index < payload.length; index += 1) {
    payload[index] = stealthAlphaByte(rgba, width, height, signatureLength + 4 + index);
  }
  const decoded = signature === 'stealth_pngcomp'
    ? inflateWithLimit(payload, 'gzip')
    : payload;
  return strFromU8(decoded);
}

async function decodeBlobToRgba(blob: Blob, width: number, height: number): Promise<Uint8ClampedArray> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('当前浏览器不支持读取 PNG Alpha 隐写元数据。');
  }
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width !== width || bitmap.height !== height) {
      throw new Error('浏览器解码后的 PNG 尺寸与 IHDR 不一致。');
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('当前浏览器无法建立安全的 PNG 像素读取上下文。');
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, width, height).data;
  } finally {
    bitmap.close();
  }
}

export async function readNovelAiStealthMetadata(
  blob: Blob,
  metadata: Pick<ReadPngMetadata, 'width' | 'height'>
): Promise<string | undefined> {
  const rgba = await decodeBlobToRgba(blob, metadata.width, metadata.height);
  return decodeNovelAiStealthFromRgba(rgba, metadata.width, metadata.height);
}
