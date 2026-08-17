const AVG_WORLDPACK_ID_ALIASES: Readonly<Record<string, string>> = {
  hk_1988: 'hk1988'
};

export function normalizeAvgWorldpackId(worldpackId: string): string {
  return AVG_WORLDPACK_ID_ALIASES[worldpackId] ?? worldpackId;
}

export function areAvgWorldpackIdsCompatible(
  left: string,
  right: string
): boolean {
  return normalizeAvgWorldpackId(left) === normalizeAvgWorldpackId(right);
}
