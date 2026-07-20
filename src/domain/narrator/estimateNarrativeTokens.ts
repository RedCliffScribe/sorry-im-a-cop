export function estimateNarrativeTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;

  const cjkCount = normalized.match(/[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/g)?.length ?? 0;
  const asciiWordCount =
    normalized.replace(/[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/g, ' ').match(/[A-Za-z0-9_]+/g)?.length ?? 0;
  const otherSymbolCount = normalized.replace(/[\s\u3400-\u9fff\u3000-\u303f\uff00-\uffefA-Za-z0-9_]/g, '').length;

  return Math.max(1, Math.ceil(cjkCount * 0.7 + asciiWordCount * 1.3 + otherSymbolCount * 0.5));
}
