import type { AssetItem } from '../runtime/types';

const FINANCIAL_INSTRUMENT_PATTERN =
  /(支票|本票|汇票|银行票据|存单|存折|债券|欠条|借据|收据|发票|礼券|现金券|兑换券|购物券|礼品卡|cheque|check|cashier(?:'s)?\s+(?:check|cheque)|money\s+order|bond|voucher|passbook|certificate\s+of\s+deposit|iou)/i;

const CASH_ONLY_NAME_PATTERN =
  /^(?:(?:一|两|几|数|若干|多)?(?:叠|沓|把|袋|封|笔|份|捆|卷))?(?:港币|港元|现金|现钞|钞票|纸币|零钱|硬币|钱)(?:若干|一批|一笔|一叠|一沓|一袋|一封|一捆|数目不详)?$/;

const CASH_AMOUNT_NAME_PATTERN =
  /^(?:约|大约|合共|总共)?(?:HK\$|HKD|\$|港币|港元|港纸|人民币|美元|美金|英镑|日元|圆|元)?[\d一二三四五六七八九十百千万亿,.]+(?:港币|港元|港纸|人民币|美元|美金|英镑|日元|现金|现钞|钞票|纸币|零钱|硬币|元|圆)(?:现金|现钞|钞票|纸币|零钱|硬币)?$/i;

/**
 * Spendable currency belongs to finance state, never to the item archive.
 * This checks only the model's structured asset name; it does not mine prose.
 */
export function isSpendableCashAsset(item: Pick<AssetItem, 'name'>): boolean {
  const name = item.name.replace(/\s+/g, '').trim();
  if (!name || FINANCIAL_INSTRUMENT_PATTERN.test(name)) return false;
  return CASH_ONLY_NAME_PATTERN.test(name) || CASH_AMOUNT_NAME_PATTERN.test(name);
}

export function isRecognizedFinancialInstrument(item: Pick<AssetItem, 'name'>): boolean {
  return FINANCIAL_INSTRUMENT_PATTERN.test(item.name);
}
