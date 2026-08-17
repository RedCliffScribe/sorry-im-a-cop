import { useEffect, type RefObject } from 'react';
import type { AppLocale } from '../../domain/localization/appLocale';

type TextConverter = (value: string) => string;

interface TextState {
  source: string;
  converted: string;
}

interface AttributeState extends TextState {
  name: string;
}

const localizedAttributes = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const preservedSelector = [
  '[data-locale-preserve="true"]',
  '.ignore-opencc',
  'pre',
  'code',
  'script',
  'style',
  '[contenteditable="true"]'
].join(',');

let hongKongConverterPromise: Promise<TextConverter> | null = null;

function loadHongKongConverter(): Promise<TextConverter> {
  hongKongConverterPromise ??= import('opencc-js/cn2t').then((module) =>
    module.Converter({ from: 'cn', to: 'hk' })
  );
  return hongKongConverterPromise;
}

function shouldPreserve(element: Element | null): boolean {
  return Boolean(element?.closest(preservedSelector));
}

function parentElement(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

export function useLocalizedUi(rootRef: RefObject<HTMLElement | null>, locale: AppLocale): void {
  useEffect(() => {
    const previousDocumentLanguage = document.documentElement.lang;
    document.documentElement.lang = locale;

    if (locale !== 'zh-Hant-HK') {
      return () => {
        document.documentElement.lang = previousDocumentLanguage;
      };
    }

    let cancelled = false;
    let observer: MutationObserver | null = null;
    const textStates = new WeakMap<Text, TextState>();
    const attributeStates = new WeakMap<Element, Map<string, AttributeState>>();
    const sourceDocumentTitle = document.title;
    let convertedDocumentTitle = sourceDocumentTitle;

    function restoreText(node: Text) {
      const state = textStates.get(node);
      if (state && node.data === state.converted) node.data = state.source;
    }

    function restoreAttributes(element: Element) {
      const states = attributeStates.get(element);
      if (!states) return;
      for (const state of states.values()) {
        if (element.getAttribute(state.name) === state.converted) {
          element.setAttribute(state.name, state.source);
        }
      }
    }

    function restoreCurrentTree() {
      const root = rootRef.current;
      if (!root) return;
      restoreAttributes(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        if (current.nodeType === Node.TEXT_NODE) restoreText(current as Text);
        else restoreAttributes(current as Element);
        current = walker.nextNode();
      }
    }

    function restore() {
      observer?.disconnect();
      restoreCurrentTree();
      if (document.title === convertedDocumentTitle) document.title = sourceDocumentTitle;
      document.documentElement.lang = previousDocumentLanguage;
    }

    void loadHongKongConverter().then((convert) => {
      if (cancelled) return;
      const currentRoot = rootRef.current;
      if (!currentRoot) return;
      const root: HTMLElement = currentRoot;

      function convertText(node: Text) {
        if (shouldPreserve(parentElement(node))) return;
        const current = node.data;
        if (!current.trim()) return;
        const previous = textStates.get(node);
        if (previous && current === previous.converted) return;
        const source = previous && current !== previous.converted ? current : previous?.source ?? current;
        const converted = convert(source);
        textStates.set(node, { source, converted });
        if (current !== converted) node.data = converted;
      }

      function convertAttributes(element: Element) {
        if (shouldPreserve(element)) return;
        let states = attributeStates.get(element);
        for (const name of localizedAttributes) {
          const current = element.getAttribute(name);
          if (!current?.trim()) continue;
          const previous = states?.get(name);
          if (previous && current === previous.converted) continue;
          const source = previous && current !== previous.converted ? current : previous?.source ?? current;
          const converted = convert(source);
          states ??= new Map<string, AttributeState>();
          states.set(name, { name, source, converted });
          attributeStates.set(element, states);
          if (current !== converted) element.setAttribute(name, converted);
        }
      }

      function convertSubtree(node: Node) {
        if (node.nodeType === Node.TEXT_NODE) {
          convertText(node as Text);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const element = node as Element;
        if (shouldPreserve(element)) return;
        convertAttributes(element);
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        let current = walker.nextNode();
        while (current) {
          if (current.nodeType === Node.TEXT_NODE) convertText(current as Text);
          else convertAttributes(current as Element);
          current = walker.nextNode();
        }
      }

      function observe() {
        observer?.observe(root, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: [...localizedAttributes]
        });
      }

      convertedDocumentTitle = convert(sourceDocumentTitle);
      document.title = convertedDocumentTitle;
      convertSubtree(root);

      observer = new MutationObserver((records) => {
        observer?.disconnect();
        for (const record of records) {
          if (record.type === 'characterData') convertText(record.target as Text);
          if (record.type === 'attributes') convertAttributes(record.target as Element);
          for (const addedNode of record.addedNodes) convertSubtree(addedNode);
        }
        observe();
      });
      observe();
    });

    return () => {
      cancelled = true;
      restore();
    };
  }, [locale, rootRef]);
}
