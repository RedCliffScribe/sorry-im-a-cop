import type { CustomSourceChapterDetectionMethod } from './assetTypes';
import { assertSafeZipEntryPath, readZipSafely } from './safeZip';

export const customEpubExtractionLimits = Object.freeze({
  maxArchiveBytes: 20 * 1024 * 1024,
  maxEntryCount: 1_024,
  maxEntryBytes: 16 * 1024 * 1024,
  maxExpandedBytes: 80 * 1024 * 1024,
  maxCompressionRatio: 100
});

export interface ExtractedCustomEpubChapterRange {
  startOffset: number;
  endOffset: number;
  title?: string;
  detectionMethod: Extract<
    CustomSourceChapterDetectionMethod,
    'epub_navigation' | 'epub_spine'
  >;
}

export interface ExtractedCustomEpub {
  canonicalText: string;
  chapterRanges: ExtractedCustomEpubChapterRange[];
}

interface EpubManifestItem {
  id: string;
  path: string;
  mediaType: string;
  properties: ReadonlySet<string>;
}

interface EpubSpineItem {
  manifestItem: EpubManifestItem;
  linear: boolean;
}

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const XML_SECURITY_PATTERN = /<!\s*(?:DOCTYPE|ENTITY)\b/iu;
const EXCLUDED_TEXT_ELEMENTS = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'svg',
  'math',
  'iframe',
  'object',
  'embed'
]);
const BLOCK_TEXT_ELEMENTS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul'
]);

function decodeXmlBytes(bytes: Uint8Array, path: string): string {
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
    }
    return utf8Decoder.decode(bytes);
  } catch (error) {
    throw new Error(`EPUB 条目不是有效的 UTF-8/UTF-16 文本：${path}`, {
      cause: error
    });
  }
}

function parseXmlDocument(
  bytes: Uint8Array,
  path: string,
  mediaType: DOMParserSupportedType = 'application/xml'
): Document {
  const source = decodeXmlBytes(bytes, path);
  if (XML_SECURITY_PATTERN.test(source)) {
    throw new Error(`EPUB XML 禁止 DOCTYPE 或 ENTITY 声明：${path}`);
  }
  if (typeof DOMParser === 'undefined') {
    throw new Error('当前运行环境不支持 EPUB XML 解析。');
  }
  const document = new DOMParser().parseFromString(source, mediaType);
  if (
    document.documentElement.localName.toLowerCase() === 'parsererror' ||
    document.getElementsByTagName('parsererror').length > 0
  ) {
    throw new Error(`EPUB XML 结构无效：${path}`);
  }
  return document;
}

function elementsByLocalName(
  root: Document | Element,
  localName: string
): Element[] {
  const expected = localName.toLowerCase();
  return Array.from(root.getElementsByTagName('*')).filter(
    (element) => element.localName.toLowerCase() === expected
  );
}

function firstElementByLocalName(
  root: Document | Element,
  localName: string
): Element | undefined {
  return elementsByLocalName(root, localName)[0];
}

function normalizeTitle(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/gu, ' ').trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 200);
}

function decodeReference(reference: string, label: string): string {
  try {
    return decodeURIComponent(reference);
  } catch (error) {
    throw new Error(`EPUB ${label} 包含无效的百分号编码。`, { cause: error });
  }
}

function resolveLocalArchiveReference(
  basePath: string,
  rawReference: string,
  label: string
): string {
  const trimmed = rawReference.trim();
  if (!trimmed) throw new Error(`EPUB ${label} 不能为空。`);
  const withoutFragment = trimmed.split('#', 1)[0].split('?', 1)[0];
  const decoded = decodeReference(withoutFragment, label);
  if (
    !decoded ||
    decoded.includes('\0') ||
    decoded.includes('\\') ||
    decoded.startsWith('/') ||
    decoded.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/iu.test(decoded) ||
    /^[a-zA-Z]:/u.test(decoded)
  ) {
    throw new Error(`EPUB ${label} 不是安全的本地相对路径：${trimmed}`);
  }
  const baseSegments = basePath.split('/');
  baseSegments.pop();
  for (const segment of decoded.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (baseSegments.length === 0) {
        throw new Error(`EPUB ${label} 越过压缩包根目录：${trimmed}`);
      }
      baseSegments.pop();
      continue;
    }
    baseSegments.push(segment);
  }
  const resolved = baseSegments.join('/');
  assertSafeZipEntryPath(resolved, 'EPUB');
  return resolved;
}

function requiredEntry(
  files: ReadonlyMap<string, Uint8Array>,
  path: string,
  label: string
): Uint8Array {
  const bytes = files.get(path);
  if (!bytes) throw new Error(`EPUB 缺少${label}：${path}`);
  return bytes;
}

function parseContainerPath(files: ReadonlyMap<string, Uint8Array>): string {
  const path = 'META-INF/container.xml';
  const document = parseXmlDocument(
    requiredEntry(files, path, ' container.xml'),
    path
  );
  const rootfile = firstElementByLocalName(document, 'rootfile');
  const fullPath = rootfile?.getAttribute('full-path');
  if (!fullPath) throw new Error('EPUB container.xml 缺少 rootfile full-path。');
  return resolveLocalArchiveReference('', fullPath, 'rootfile full-path');
}

function parsePackageDocument(
  files: ReadonlyMap<string, Uint8Array>,
  packagePath: string
): {
  manifest: ReadonlyMap<string, EpubManifestItem>;
  spine: EpubSpineItem[];
  navigationItem?: EpubManifestItem;
  ncxItem?: EpubManifestItem;
} {
  const document = parseXmlDocument(
    requiredEntry(files, packagePath, ' OPF package document'),
    packagePath
  );
  const manifestElement = firstElementByLocalName(document, 'manifest');
  const spineElement = firstElementByLocalName(document, 'spine');
  if (!manifestElement || !spineElement) {
    throw new Error('EPUB OPF 必须同时包含 manifest 与 spine。');
  }
  const manifest = new Map<string, EpubManifestItem>();
  for (const itemElement of elementsByLocalName(manifestElement, 'item')) {
    const id = itemElement.getAttribute('id')?.trim();
    const href = itemElement.getAttribute('href');
    const mediaType = itemElement.getAttribute('media-type')?.trim();
    if (!id || !href || !mediaType) {
      throw new Error('EPUB OPF manifest item 缺少 id、href 或 media-type。');
    }
    if (manifest.has(id)) {
      throw new Error(`EPUB OPF manifest id 重复：${id}`);
    }
    manifest.set(id, {
      id,
      path: resolveLocalArchiveReference(
        packagePath,
        href,
        `manifest href (${id})`
      ),
      mediaType,
      properties: new Set(
        (itemElement.getAttribute('properties') ?? '')
          .split(/\s+/u)
          .filter(Boolean)
      )
    });
  }

  const allSpineItems: EpubSpineItem[] = [];
  for (const itemref of elementsByLocalName(spineElement, 'itemref')) {
    const idref = itemref.getAttribute('idref')?.trim();
    const manifestItem = idref ? manifest.get(idref) : undefined;
    if (!idref || !manifestItem) {
      throw new Error(`EPUB spine 引用了不存在的 manifest id：${idref ?? ''}`);
    }
    allSpineItems.push({
      manifestItem,
      linear: itemref.getAttribute('linear')?.toLowerCase() !== 'no'
    });
  }
  if (allSpineItems.length === 0) throw new Error('EPUB spine 不能为空。');
  const linearSpineItems = allSpineItems.filter((item) => item.linear);
  const spine =
    linearSpineItems.length > 0 ? linearSpineItems : allSpineItems;
  const navigationItem = [...manifest.values()].find((item) =>
    item.properties.has('nav')
  );
  const spineTocId = spineElement.getAttribute('toc')?.trim();
  const ncxItem =
    (spineTocId ? manifest.get(spineTocId) : undefined) ??
    [...manifest.values()].find(
      (item) => item.mediaType === 'application/x-dtbncx+xml'
    );
  return { manifest, spine, navigationItem, ncxItem };
}

function navigationTitlesFromNavDocument(
  files: ReadonlyMap<string, Uint8Array>,
  navigationItem: EpubManifestItem
): Map<string, string> {
  const document = parseXmlDocument(
    requiredEntry(files, navigationItem.path, ' navigation document'),
    navigationItem.path,
    'application/xhtml+xml'
  );
  const navigationElements = elementsByLocalName(document, 'nav');
  const toc =
    navigationElements.find((element) => {
      const type =
        element.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ??
        element.getAttribute('epub:type') ??
        element.getAttribute('type');
      return type?.split(/\s+/u).includes('toc');
    }) ?? navigationElements[0];
  if (!toc) throw new Error('EPUB navigation document 缺少 nav。');

  const titles = new Map<string, string>();
  for (const anchor of elementsByLocalName(toc, 'a')) {
    const href = anchor.getAttribute('href');
    const title = normalizeTitle(anchor.textContent);
    if (!href || !title) continue;
    const path = resolveLocalArchiveReference(
      navigationItem.path,
      href,
      'navigation href'
    );
    if (!titles.has(path)) titles.set(path, title);
  }
  return titles;
}

function navigationTitlesFromNcx(
  files: ReadonlyMap<string, Uint8Array>,
  ncxItem: EpubManifestItem
): Map<string, string> {
  const document = parseXmlDocument(
    requiredEntry(files, ncxItem.path, ' NCX document'),
    ncxItem.path
  );
  const titles = new Map<string, string>();
  for (const navPoint of elementsByLocalName(document, 'navPoint')) {
    const content = firstElementByLocalName(navPoint, 'content');
    const label = firstElementByLocalName(navPoint, 'navLabel');
    const source = content?.getAttribute('src');
    const title = normalizeTitle(label?.textContent);
    if (!source || !title) continue;
    const path = resolveLocalArchiveReference(
      ncxItem.path,
      source,
      'NCX content src'
    );
    if (!titles.has(path)) titles.set(path, title);
  }
  return titles;
}

function appendElementText(node: Node, output: string[]): void {
  if (node.nodeType === 3) {
    output.push(node.nodeValue ?? '');
    return;
  }
  if (node.nodeType !== 1) return;
  const element = node as Element;
  const localName = element.localName.toLowerCase();
  if (EXCLUDED_TEXT_ELEMENTS.has(localName)) return;
  if (localName === 'br') {
    output.push('\n');
    return;
  }
  const isBlock = BLOCK_TEXT_ELEMENTS.has(localName);
  for (const child of Array.from(element.childNodes)) {
    appendElementText(child, output);
  }
  if (isBlock) output.push('\n');
}

function extractXhtmlText(document: Document): string {
  const body = firstElementByLocalName(document, 'body');
  if (!body) throw new Error('EPUB XHTML 缺少 body。');
  const output: string[] = [];
  appendElementText(body, output);
  return output
    .join('')
    .replace(/\u00a0/gu, ' ')
    .replace(/[ \t\f\v]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function fallbackXhtmlTitle(document: Document, path: string): string | undefined {
  const titleElement = firstElementByLocalName(document, 'title');
  const heading =
    firstElementByLocalName(document, 'h1') ??
    firstElementByLocalName(document, 'h2');
  return (
    normalizeTitle(heading?.textContent) ??
    normalizeTitle(titleElement?.textContent) ??
    normalizeTitle(
      path
        .split('/')
        .at(-1)
        ?.replace(/\.[^.]+$/u, '')
        .replace(/[_-]+/gu, ' ')
    )
  );
}

export async function extractCustomEpub(
  blob: Blob
): Promise<ExtractedCustomEpub> {
  const files = await readZipSafely(
    new Uint8Array(await blob.arrayBuffer()),
    {
      archiveLabel: 'EPUB',
      limits: customEpubExtractionLimits,
      allowDirectoryEntries: true
    }
  );
  const mimetype = requiredEntry(files, 'mimetype', ' mimetype');
  if (utf8Decoder.decode(mimetype).trim() !== 'application/epub+zip') {
    throw new Error('EPUB mimetype 必须是 application/epub+zip。');
  }
  const packagePath = parseContainerPath(files);
  const { spine, navigationItem, ncxItem } = parsePackageDocument(
    files,
    packagePath
  );
  const navigationTitles = navigationItem
    ? navigationTitlesFromNavDocument(files, navigationItem)
    : ncxItem
      ? navigationTitlesFromNcx(files, ncxItem)
      : new Map<string, string>();

  const extractedChapters: Array<{
    text: string;
    title?: string;
    detectionMethod: ExtractedCustomEpubChapterRange['detectionMethod'];
  }> = [];
  for (const { manifestItem } of spine) {
    if (
      manifestItem.mediaType !== 'application/xhtml+xml' &&
      manifestItem.mediaType !== 'text/html'
    ) {
      throw new Error(
        `EPUB spine 条目不是 XHTML：${manifestItem.path} (${manifestItem.mediaType})`
      );
    }
    const document = parseXmlDocument(
      requiredEntry(files, manifestItem.path, ' spine XHTML'),
      manifestItem.path,
      'application/xhtml+xml'
    );
    const text = extractXhtmlText(document);
    if (!text) continue;
    const navigationTitle = navigationTitles.get(manifestItem.path);
    extractedChapters.push({
      text,
      title:
        navigationTitle ??
        fallbackXhtmlTitle(document, manifestItem.path),
      detectionMethod: navigationTitle ? 'epub_navigation' : 'epub_spine'
    });
  }
  if (extractedChapters.length === 0) {
    throw new Error('EPUB spine 中没有可提取的正文。');
  }

  const canonicalText = extractedChapters
    .map((chapter) => chapter.text)
    .join('\n\n');
  const chapterRanges: ExtractedCustomEpubChapterRange[] = [];
  let startOffset = 0;
  for (const [index, chapter] of extractedChapters.entries()) {
    const separatorLength = index < extractedChapters.length - 1 ? 2 : 0;
    const endOffset =
      startOffset + chapter.text.length + separatorLength;
    chapterRanges.push({
      startOffset,
      endOffset,
      title: chapter.title,
      detectionMethod: chapter.detectionMethod
    });
    startOffset = endOffset;
  }
  return { canonicalText, chapterRanges };
}
