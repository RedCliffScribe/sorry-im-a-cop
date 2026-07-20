export interface WorldCurrencyConfig {
  code: string;
  name: string;
  symbol: string;
  displayPrecision: number;
}

export const HKD_CONFIG: WorldCurrencyConfig = {
  code: 'HKD',
  name: '港元',
  symbol: 'HK$',
  displayPrecision: 0
};

export const USD_CONFIG: WorldCurrencyConfig = {
  code: 'USD',
  name: '美元',
  symbol: '$',
  displayPrecision: 0
};

const WORLD_CURRENCY_BY_ID: Readonly<Record<string, WorldCurrencyConfig>> = {
  hk_1984: HKD_CONFIG,
  hk_1988: HKD_CONFIG
};

export function getWorldCurrencyConfig(worldpackId: string | undefined): WorldCurrencyConfig {
  if (!worldpackId) return HKD_CONFIG;
  return WORLD_CURRENCY_BY_ID[worldpackId] ?? HKD_CONFIG;
}

export function formatCurrencyAmount(amount: number, worldpackId: string | undefined): string {
  const currency = getWorldCurrencyConfig(worldpackId);
  return formatCurrencyAmountByConfig(amount, currency);
}

export function formatCurrencyAmountByConfig(amount: number, currency: WorldCurrencyConfig): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('zh-HK', {
    minimumFractionDigits: currency.displayPrecision,
    maximumFractionDigits: currency.displayPrecision
  }).format(value);
  return `${currency.symbol}${formatted}`;
}

export function formatCurrencyWithName(amount: number, worldpackId: string | undefined): string {
  const currency = getWorldCurrencyConfig(worldpackId);
  return `${formatCurrencyAmountByConfig(amount, currency)} ${currency.name}`;
}
