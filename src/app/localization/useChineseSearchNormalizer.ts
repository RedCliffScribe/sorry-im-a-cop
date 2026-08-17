import { useCallback, useEffect, useState } from 'react';

type TextConverter = (value: string) => string;

let traditionalToSimplifiedPromise: Promise<TextConverter> | null = null;

function loadTraditionalToSimplifiedConverter(): Promise<TextConverter> {
  traditionalToSimplifiedPromise ??= import('opencc-js/t2cn').then((module) =>
    module.Converter({ from: 'hk', to: 'cn' })
  );
  return traditionalToSimplifiedPromise;
}

function normalize(value: string, converter?: TextConverter): string {
  return (converter ? converter(value) : value).trim().toLowerCase();
}

export function useChineseSearchNormalizer(enabled: boolean): (value: string) => string {
  const [converter, setConverter] = useState<TextConverter | undefined>();

  useEffect(() => {
    if (!enabled || converter) return;
    let cancelled = false;
    void loadTraditionalToSimplifiedConverter().then((loadedConverter) => {
      if (!cancelled) setConverter(() => loadedConverter);
    });
    return () => {
      cancelled = true;
    };
  }, [converter, enabled]);

  return useCallback((value: string) => normalize(value, converter), [converter]);
}
