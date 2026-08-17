import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, options: {
        sitekey: string;
        action: string;
        theme: 'dark';
        callback(token: string): void;
        'expired-callback'(): void;
        'error-callback'(): void;
      }): string;
      reset(widgetId: string): void;
      remove(widgetId: string): void;
    };
  }
}

let turnstileScriptPromise: Promise<void> | undefined;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;
  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-sicv2-turnstile]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('turnstile_script_failed')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.sicv2Turnstile = 'true';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('turnstile_script_failed')), { once: true });
    document.head.append(script);
  });
  return turnstileScriptPromise;
}

interface WorkshopTurnstileProps {
  siteKey?: string;
  action: 'workshop_login' | 'workshop_upload';
  resetKey: number;
  onTokenChange(token: string): void;
}

export function WorkshopTurnstile({ siteKey, action, resetKey, onTokenChange }: WorkshopTurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return undefined;
    let cancelled = false;
    void loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        theme: 'dark',
        callback: onTokenChange,
        'expired-callback': () => onTokenChange(''),
        'error-callback': () => onTokenChange('')
      });
    }).catch(() => onTokenChange(''));
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = undefined;
    };
  }, [action, onTokenChange, siteKey]);

  useEffect(() => {
    if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
    onTokenChange('');
  }, [onTokenChange, resetKey]);

  if (!siteKey) {
    return <p className="workshop-turnstile-missing">此部署尚未配置登录与上传验证。</p>;
  }
  return <div ref={containerRef} className="workshop-turnstile" aria-label="人机验证" />;
}
