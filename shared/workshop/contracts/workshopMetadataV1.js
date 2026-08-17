import { z } from 'zod';

export const WORKSHOP_CONTENT_RATINGS = ['general', 'mature'];
export const WORKSHOP_PACKAGE_FORMAT = 'sorry-im-a-cop-v2-workshop-package';
export const WORKSHOP_PACKAGE_KIND_IMAGE_GENERATION_PRESET = 'image-generation-preset';
export const WORKSHOP_PACKAGE_SCHEMA_VERSION = 1;
export const WORKSHOP_PACKAGE_MAX_BYTES = 256 * 1024;

const uniqueStrings = (values, context, pathLabel) => {
  const seen = new Set();
  values.forEach((value, index) => {
    const normalized = value.toLocaleLowerCase('en-US');
    if (seen.has(normalized)) {
      context.addIssue({
        code: 'custom',
        path: [index],
        message: `${pathLabel}不能重复`
      });
    }
    seen.add(normalized);
  });
};

export const workshopManifestV1Schema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(2000),
  contentRating: z.enum(WORKSHOP_CONTENT_RATINGS),
  language: z.string()
    .trim()
    .min(2)
    .max(35)
    .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, 'language 必须是 BCP 47 风格语言标签'),
  tags: z.array(z.string().trim().min(1).max(32))
    .max(16)
    .superRefine((values, context) => uniqueStrings(values, context, '标签')),
  minAppVersion: z.string()
    .trim()
    .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'minAppVersion 必须是语义化版本号')
}).strict();

export const workshopRevisionMetadataV1Schema = z.object({
  changelog: z.string().trim().min(1).max(2000)
}).strict();
