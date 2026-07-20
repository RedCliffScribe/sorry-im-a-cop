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
});
