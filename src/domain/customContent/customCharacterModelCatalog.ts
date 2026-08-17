const obviousNonTextModelPatterns = [
  /(^|[-_.:/])asr($|[-_.:/])/i,
  /(^|[-_.:/])tts($|[-_.:/])/i,
  /voice[-_.]?clone/i,
  /voice[-_.]?design/i,
  /(^|[-_.:/])embedding(s)?($|[-_.:/])/i,
  /(^|[-_.:/])rerank(er)?($|[-_.:/])/i,
  /(^|[-_.:/])(image|audio)($|[-_.:/])/i
];

export function isObviouslyNonTextCharacterModel(model: string): boolean {
  const normalized = model.trim();
  return (
    !normalized ||
    obviousNonTextModelPatterns.some((pattern) => pattern.test(normalized))
  );
}

export function filterCustomCharacterGenerationModels(
  models: readonly string[],
  showAll: boolean
): string[] {
  const unique = Array.from(
    new Set(models.map((model) => model.trim()).filter(Boolean))
  );
  return showAll
    ? unique
    : unique.filter((model) => !isObviouslyNonTextCharacterModel(model));
}

export function isModelNotFoundGenerationError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /model[_ -]?not[_ -]?found|model does not exist|unknown model|模型不存在/i.test(
    message
  );
}
