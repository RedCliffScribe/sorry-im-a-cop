export type AppLocale = 'zh-CN' | 'zh-Hant-HK';

export const DEFAULT_APP_LOCALE: AppLocale = 'zh-CN';

export function resolveAppLocale(value: unknown): AppLocale {
  return value === 'zh-Hant-HK' ? 'zh-Hant-HK' : DEFAULT_APP_LOCALE;
}

export function isHongKongTraditional(locale: AppLocale): boolean {
  return locale === 'zh-Hant-HK';
}

export function createNarrativeLanguageGuide(locale: AppLocale | undefined): string {
  if (resolveAppLocale(locale) === 'zh-Hant-HK') {
    return [
      '所有直接显示给玩家的自然语言内容必须使用香港繁體中文，包括 narrativeText、suggestedActions、turnSummary、新闻、人物记忆摘要、机构/案件/动态描述及其他玩家可见文本。',
      '使用香港常用繁体字形与香港书面语习惯；粤语对白可按既定粤语风味自然使用港式用字。',
      'JSON 字段名、稳定 ID、枚举值、协议常量、英文专名与已有英文名必须保持原样，不得翻译或改写。',
      '输入资料即使是简体中文，也只把玩家可见输出转换为香港繁体；不得因此改写事实、姓名身份或结构化状态。'
    ].join('\n');
  }

  return [
    '所有直接显示给玩家的自然语言内容使用简体中文；粤语对白可按既定粤语风味保留必要港式用字。',
    'JSON 字段名、稳定 ID、枚举值、协议常量、英文专名与已有英文名必须保持原样。'
  ].join('\n');
}
