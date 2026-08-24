import type { AppLocale } from '../domain/localization/appLocale';

export const APP_VERSION = '2.0.20';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
export const APP_COPYRIGHT_YEAR = '2026';
export const APP_COPYRIGHT_OWNER = 'RedCliffScribe';
export const APP_SOURCE_REPOSITORY_URL = 'https://github.com/RedCliffScribe/sorry-im-a-cop';

export function getAppEditionLabel(locale: AppLocale): string {
  return locale === 'zh-Hant-HK' ? '香港繁體中文' : '简体中文';
}
