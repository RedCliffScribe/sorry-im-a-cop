import { z } from 'zod';
import { pngStyleLibrarySettingsSchema } from './schemas';
import type { PngStyleLibrarySettings } from './types';

const portablePngStyleArchiveSchema = z.object({
  format: z.literal('sorry-im-a-cop-v2-png-style-library'),
  version: z.literal(1),
  exportedAt: z.string().datetime({ offset: true }),
  library: pngStyleLibrarySettingsSchema
}).strict();

export type PortablePngStyleArchive = z.infer<typeof portablePngStyleArchiveSchema>;

export function serializePngStyleLibrary(
  settings: PngStyleLibrarySettings,
  exportedAt = new Date().toISOString()
): string {
  return JSON.stringify(portablePngStyleArchiveSchema.parse({
    format: 'sorry-im-a-cop-v2-png-style-library',
    version: 1,
    exportedAt,
    library: settings
  }), null, 2);
}

export function parsePngStyleLibraryArchive(value: string): PngStyleLibrarySettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('PNG 画风库文件不是有效 JSON。');
  }
  return structuredClone(portablePngStyleArchiveSchema.parse(parsed).library);
}
