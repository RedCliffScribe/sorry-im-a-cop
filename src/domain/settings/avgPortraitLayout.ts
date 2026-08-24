import type { AvgPortraitLayoutSettings } from './types';

export const AVG_PORTRAIT_SCALE_MIN = 50;
export const AVG_PORTRAIT_SCALE_MAX = 180;
export const AVG_PORTRAIT_HORIZONTAL_OFFSET_MIN = -40;
export const AVG_PORTRAIT_HORIZONTAL_OFFSET_MAX = 40;
export const AVG_PORTRAIT_VERTICAL_OFFSET_MIN = -30;
export const AVG_PORTRAIT_VERTICAL_OFFSET_MAX = 30;

export const DEFAULT_AVG_PORTRAIT_LAYOUT: Readonly<AvgPortraitLayoutSettings> = {
  scalePercent: 100,
  horizontalOffsetPercent: 0,
  verticalOffsetPercent: 0
};

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

export function normalizeAvgPortraitLayout(
  value: unknown
): AvgPortraitLayoutSettings {
  const candidate = value && typeof value === 'object'
    ? value as Partial<AvgPortraitLayoutSettings>
    : {};

  return {
    scalePercent: boundedInteger(
      candidate.scalePercent,
      DEFAULT_AVG_PORTRAIT_LAYOUT.scalePercent,
      AVG_PORTRAIT_SCALE_MIN,
      AVG_PORTRAIT_SCALE_MAX
    ),
    horizontalOffsetPercent: boundedInteger(
      candidate.horizontalOffsetPercent,
      DEFAULT_AVG_PORTRAIT_LAYOUT.horizontalOffsetPercent,
      AVG_PORTRAIT_HORIZONTAL_OFFSET_MIN,
      AVG_PORTRAIT_HORIZONTAL_OFFSET_MAX
    ),
    verticalOffsetPercent: boundedInteger(
      candidate.verticalOffsetPercent,
      DEFAULT_AVG_PORTRAIT_LAYOUT.verticalOffsetPercent,
      AVG_PORTRAIT_VERTICAL_OFFSET_MIN,
      AVG_PORTRAIT_VERTICAL_OFFSET_MAX
    )
  };
}

export function areAvgPortraitLayoutsEqual(
  left: AvgPortraitLayoutSettings,
  right: AvgPortraitLayoutSettings
): boolean {
  return left.scalePercent === right.scalePercent &&
    left.horizontalOffsetPercent === right.horizontalOffsetPercent &&
    left.verticalOffsetPercent === right.verticalOffsetPercent;
}
