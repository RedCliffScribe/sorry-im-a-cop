interface NamedPresetOption {
  id: string;
  name: string;
  origin: 'built-in' | 'custom';
}

function normalizedPresetName(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN');
}

function sourceLabel(preset: NamedPresetOption): string {
  if (preset.origin === 'built-in') return '内置';
  return preset.id.startsWith('workshop-') ? '工坊导入' : '自定义';
}

export function formatPresetOptionLabel(
  preset: NamedPresetOption,
  presets: readonly NamedPresetOption[]
): string {
  const matchingName = presets.filter(
    (candidate) => normalizedPresetName(candidate.name) === normalizedPresetName(preset.name)
  );
  if (matchingName.length <= 1) return preset.name;

  const label = sourceLabel(preset);
  const matchingSource = matchingName.filter((candidate) => sourceLabel(candidate) === label);
  if (matchingSource.length <= 1) return `${preset.name}（${label}）`;

  const sourceIndex = matchingSource.findIndex((candidate) => candidate.id === preset.id);
  return `${preset.name}（${label} ${sourceIndex >= 0 ? sourceIndex + 1 : 1}）`;
}
