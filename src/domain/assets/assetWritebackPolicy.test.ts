import { describe, expect, it } from 'vitest';
import { isRecognizedFinancialInstrument, isSpendableCashAsset } from './assetWritebackPolicy';

describe('asset writeback cash policy', () => {
  it.each([
    '现金',
    '一叠港币',
    '现金一袋',
    '5000港元现金',
    '港币5000元',
    'HK$5,000 现金',
    '三百元零钱'
  ])('keeps spendable currency out of the item archive: %s', (name) => {
    expect(isSpendableCashAsset({ name })).toBe(true);
  });

  it.each([
    '五千港元支票',
    '银行本票',
    '一张汇票',
    '银行存折',
    '现金券',
    '购物礼券',
    '借据',
    '收据'
  ])('allows independent financial instruments to remain assets: %s', (name) => {
    expect(isSpendableCashAsset({ name })).toBe(false);
    expect(isRecognizedFinancialInstrument({ name })).toBe(true);
  });

  it.each(['钱包', '钥匙串', '《九龙重案》小说手稿', '装文件的牛皮纸袋'])(
    'does not mistake ordinary property for spendable cash: %s',
    (name) => {
      expect(isSpendableCashAsset({ name })).toBe(false);
    }
  );
});
