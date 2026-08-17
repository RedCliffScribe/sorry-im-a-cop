import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasAcceptedOpeningLegalDisclaimer,
  OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY,
  OPENING_LEGAL_DISCLAIMER_TEXT,
  OPENING_LEGAL_DISCLAIMER_VERSION,
  OPENING_LEGAL_IMPORTANT_NOTICE_PARAGRAPHS,
  recordOpeningLegalDisclaimerAcceptance
} from './openingLegalDisclaimer';

describe('opening legal disclaimer acceptance', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('accepts only a record for the current legal version', () => {
    localStorage.setItem(
      OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY,
      JSON.stringify({ version: '2026-06-01', acceptedAt: '2026-06-01T00:00:00.000Z' })
    );
    expect(hasAcceptedOpeningLegalDisclaimer()).toBe(false);

    localStorage.setItem(
      OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY,
      JSON.stringify({ version: OPENING_LEGAL_DISCLAIMER_VERSION, acceptedAt: '2026-07-19T00:00:00.000Z' })
    );
    expect(hasAcceptedOpeningLegalDisclaimer()).toBe(true);
  });

  it('fails closed for malformed records and persists a timestamp after acceptance', () => {
    localStorage.setItem(OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY, '{malformed');
    expect(hasAcceptedOpeningLegalDisclaimer()).toBe(false);

    localStorage.setItem(
      OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY,
      JSON.stringify({ version: OPENING_LEGAL_DISCLAIMER_VERSION, acceptedAt: 'not-a-date' })
    );
    expect(hasAcceptedOpeningLegalDisclaimer()).toBe(false);

    recordOpeningLegalDisclaimerAcceptance();

    const record = JSON.parse(localStorage.getItem(OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY) ?? '{}');
    expect(record).toMatchObject({
      version: OPENING_LEGAL_DISCLAIMER_VERSION,
      acceptedAt: expect.any(String)
    });
    expect(Number.isNaN(Date.parse(record.acceptedAt))).toBe(false);
  });

  it('discloses anonymous operational analytics and its explicit content boundary', () => {
    const importantNotice = OPENING_LEGAL_IMPORTANT_NOTICE_PARAGRAPHS.join('\n');
    expect(importantNotice).toContain('不保存原始 IP');
    expect(importantNotice).toContain('不收集玩家输入、剧情、存档、API 配置、密钥、提示词或模型响应');
    expect(OPENING_LEGAL_DISCLAIMER_TEXT).toContain('随机访客与会话标识在服务端经过带密钥的加盐散列');
    expect(OPENING_LEGAL_DISCLAIMER_TEXT).toContain('统计接口不保存用户的原始 IP 地址');
  });

  it('discloses the limited third-party screen-character use and preserves a case-specific fair-use boundary', () => {
    const importantNotice = OPENING_LEGAL_IMPORTANT_NOTICE_PARAGRAPHS.join('\n');
    expect(importantNotice).toContain('第三方影视作品名称、虚构角色姓名');
    expect(importantNotice).toContain('不是官方授权、重制、续作或剧情复演');
    expect(OPENING_LEGAL_DISCLAIMER_TEXT).toContain('三、第三方影视作品与虚构角色');
    expect(OPENING_LEGAL_DISCLAIMER_TEXT).toContain('不直接复制影视剧本、字幕、大段剧情简介');
    expect(OPENING_LEGAL_DISCLAIMER_TEXT).toContain('不会把当前游戏日期之后的原作剧情自动视为本地存档事实');
    expect(OPENING_LEGAL_DISCLAIMER_TEXT).toContain('合理使用须结合具体使用方式及法定因素逐案判断');
    expect(OPENING_LEGAL_DISCLAIMER_TEXT).toContain('不构成对侵权、故意侵权或责任范围的承认');
    expect(OPENING_LEGAL_DISCLAIMER_TEXT).not.toContain('适用州法：');
    expect(OPENING_LEGAL_DISCLAIMER_TEXT).not.toContain('待配置');
  });
});
