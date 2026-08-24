import type { CSSProperties } from 'react';
import { normalizeAvgPortraitLayout } from '../../../domain/settings/avgPortraitLayout';
import type { AvgPortraitLayoutSettings } from '../../../domain/settings/types';

export function avgPortraitLayoutStyle(
  value: AvgPortraitLayoutSettings | undefined
): CSSProperties {
  const layout = normalizeAvgPortraitLayout(value);
  return {
    '--avg-portrait-user-scale': String(layout.scalePercent / 100),
    '--avg-portrait-user-offset-x': `${layout.horizontalOffsetPercent}%`,
    '--avg-portrait-user-offset-y': `${layout.verticalOffsetPercent}%`
  } as CSSProperties;
}
