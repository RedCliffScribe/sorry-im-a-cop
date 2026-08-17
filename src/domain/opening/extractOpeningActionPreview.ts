export function extractCompleteOpeningActionPreview(rawText: string): string[] {
  const keyMatch = /"suggestedActions"\s*:\s*\[/.exec(rawText);
  if (!keyMatch) return [];
  const start = rawText.indexOf('[', keyMatch.index);
  if (start < 0) return [];

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < rawText.length; index += 1) {
    const char = rawText[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth !== 0) continue;
      try {
        const value = JSON.parse(rawText.slice(start, index + 1));
        if (!Array.isArray(value)) return [];
        const actions = value
          .map((entry) =>
            entry &&
            typeof entry === 'object' &&
            typeof (entry as { text?: unknown }).text === 'string'
              ? (entry as { text: string }).text.trim()
              : ''
          )
          .filter(Boolean);
        return actions.length === value.length ? actions : [];
      } catch {
        return [];
      }
    }
  }
  return [];
}
