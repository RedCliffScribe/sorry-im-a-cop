import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { extractCustomEpub } from './epubSourceParser';
import { parseCustomSourceBlob } from './sourceTextPipeline';

const timestamp = '2026-07-26T10:00:00.000Z';

function createEpub(
  additionalFiles: Record<string, Uint8Array | string> = {},
  options: {
    packageDocument?: string;
    containerDocument?: string;
    zipLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  } = {}
): Blob {
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(
      options.containerDocument ??
        '<?xml version="1.0"?>' +
          '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
          '<rootfiles><rootfile full-path="OEBPS/package.opf" ' +
          'media-type="application/oebps-package+xml"/></rootfiles></container>'
    ),
    'OEBPS/package.opf': strToU8(
      options.packageDocument ??
        '<?xml version="1.0"?>' +
          '<package xmlns="http://www.idpf.org/2007/opf" version="3.0">' +
          '<manifest>' +
          '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
          '<item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>' +
          '<item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>' +
          '</manifest><spine><itemref idref="ch1"/><itemref idref="ch2"/></spine>' +
          '</package>'
    ),
    'OEBPS/nav.xhtml': strToU8(
      '<?xml version="1.0"?>' +
        '<html xmlns="http://www.w3.org/1999/xhtml" ' +
        'xmlns:epub="http://www.idpf.org/2007/ops"><body>' +
        '<nav epub:type="toc"><ol>' +
        '<li><a href="text/ch1.xhtml#opening">导航第一章</a></li>' +
        '<li><a href="text/ch2.xhtml">导航第二章</a></li>' +
        '</ol></nav></body></html>'
    ),
    'OEBPS/text/ch1.xhtml': strToU8(
      '<?xml version="1.0"?>' +
        '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>文档一</title></head>' +
        '<body><h1 id="opening">正文第一章</h1><p>甲 <em>乙</em>。</p>' +
        '<script>不应出现</script><p>第二段。</p></body></html>'
    ),
    'OEBPS/text/ch2.xhtml': strToU8(
      '<?xml version="1.0"?>' +
        '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>文档二</title></head>' +
        '<body><h1>正文第二章</h1><p>丙丁。</p></body></html>'
    )
  };
  for (const [path, value] of Object.entries(additionalFiles)) {
    files[path] = typeof value === 'string' ? strToU8(value) : value;
  }
  const bytes = zipSync(
    files,
    options.zipLevel === undefined ? undefined : { level: options.zipLevel }
  );
  return new Blob([Uint8Array.from(bytes)], {
    type: 'application/epub+zip'
  });
}

function encodeUtf16Le(text: string): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < text.length; index += 1) {
    view.setUint16(2 + index * 2, text.charCodeAt(index), true);
  }
  return bytes;
}

async function parseEpub(blob: Blob, sourceDocumentId = 'source-epub-1') {
  return parseCustomSourceBlob({
    sourceDocumentId,
    sourceFormat: 'epub',
    blob,
    timestamp
  });
}

describe('custom EPUB source parser', () => {
  it('extracts XHTML in spine order and uses EPUB 3 navigation titles', async () => {
    const parsed = await parseEpub(
      createEpub({
        'OEBPS/': new Uint8Array(),
        'OEBPS/text/': new Uint8Array()
      })
    );

    expect(parsed.canonicalText).toBe(
      '正文第一章\n甲 乙。\n第二段。\n\n正文第二章\n丙丁。'
    );
    expect(parsed.canonicalText).not.toContain('不应出现');
    expect(
      parsed.structure.chapters.map((chapter) => ({
        title: chapter.title,
        detectionMethod: chapter.detectionMethod
      }))
    ).toEqual([
      { title: '导航第一章', detectionMethod: 'epub_navigation' },
      { title: '导航第二章', detectionMethod: 'epub_navigation' }
    ]);
    expect(parsed.structure.chapters[0].sourceSpan.startOffset).toBe(0);
    expect(parsed.structure.chapters[0].sourceSpan.endOffset).toBe(
      parsed.canonicalText.indexOf('正文第二章')
    );
    expect(parsed.structure.chapters[1].sourceSpan.endOffset).toBe(
      parsed.canonicalText.length
    );
  });

  it('falls back to EPUB 2 NCX titles and then to spine XHTML titles', async () => {
    const packageDocument =
      '<?xml version="1.0"?>' +
      '<package xmlns="http://www.idpf.org/2007/opf" version="2.0">' +
      '<manifest>' +
      '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' +
      '<item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>' +
      '<item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>' +
      '</manifest><spine toc="ncx"><itemref idref="ch2"/><itemref idref="ch1"/></spine>' +
      '</package>';
    const ncx =
      '<?xml version="1.0"?>' +
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>' +
      '<navPoint><navLabel><text>NCX 第一项</text></navLabel>' +
      '<content src="text/ch2.xhtml#start"/></navPoint>' +
      '<navPoint><navLabel><text>NCX 第二项</text></navLabel>' +
      '<content src="text/ch1.xhtml"/></navPoint>' +
      '</navMap></ncx>';
    const parsed = await parseEpub(
      createEpub(
        { 'OEBPS/toc.ncx': ncx },
        { packageDocument }
      ),
      'source-epub-ncx'
    );
    expect(parsed.canonicalText.indexOf('正文第二章')).toBeLessThan(
      parsed.canonicalText.indexOf('正文第一章')
    );
    expect(parsed.structure.chapters.map((chapter) => chapter.title)).toEqual([
      'NCX 第一项',
      'NCX 第二项'
    ]);

    const spineOnlyPackage = packageDocument
      .replace(
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
        ''
      )
      .replace(' toc="ncx"', '');
    const spineOnly = await parseEpub(
      createEpub({}, { packageDocument: spineOnlyPackage }),
      'source-epub-spine'
    );
    expect(
      spineOnly.structure.chapters.every(
        (chapter) => chapter.detectionMethod === 'epub_spine'
      )
    ).toBe(true);
    expect(spineOnly.structure.chapters.map((chapter) => chapter.title)).toEqual([
      '正文第二章',
      '正文第一章'
    ]);
  });

  it('rejects unsafe archive paths, external navigation and XML entities', async () => {
    await expect(
      parseEpub(createEpub({ '../outside.xhtml': '<html/>' }))
    ).rejects.toThrow('不安全路径');

    const externalNavigation =
      '<?xml version="1.0"?>' +
      '<html xmlns="http://www.w3.org/1999/xhtml" ' +
      'xmlns:epub="http://www.idpf.org/2007/ops"><body>' +
      '<nav epub:type="toc"><a href="https://example.com/book">外链</a></nav>' +
      '</body></html>';
    await expect(
      parseEpub(createEpub({ 'OEBPS/nav.xhtml': externalNavigation }))
    ).rejects.toThrow('安全的本地相对路径');

    const entityXhtml =
      '<?xml version="1.0"?><!DOCTYPE html [<!ENTITY xxe "bad">]>' +
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>&xxe;</p></body></html>';
    await expect(
      parseEpub(createEpub({ 'OEBPS/text/ch1.xhtml': entityXhtml }))
    ).rejects.toThrow('DOCTYPE 或 ENTITY');
  });

  it('rejects nested archives and abnormal compression ratios before parsing', async () => {
    await expect(
      parseEpub(
        createEpub({
          'OEBPS/unused.zip': new Uint8Array([0x50, 0x4b, 0x03, 0x04])
        })
      )
    ).rejects.toThrow('禁止嵌套压缩文件');

    await expect(
      parseEpub(
        createEpub({
          'OEBPS/highly-compressible.txt': 'a'.repeat(1024 * 1024)
        })
      )
    ).rejects.toThrow('压缩率异常');
  });

  it('rejects invalid mimetype and non-auto encoding overrides', async () => {
    await expect(
      parseEpub(createEpub({ mimetype: 'application/zip' }))
    ).rejects.toThrow('mimetype');
    await expect(
      parseCustomSourceBlob({
        sourceDocumentId: 'source-epub-encoding',
        sourceFormat: 'epub',
        blob: createEpub(),
        encoding: 'utf-8',
        timestamp
      })
    ).rejects.toThrow('不接受文本编码覆盖');
  });

  it('accepts UTF-16 XML and extracts million-character spine text without a text-size rejection', async () => {
    const container =
      '<?xml version="1.0" encoding="UTF-16"?>' +
      '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
      '<rootfiles><rootfile full-path="OEBPS/package.opf"/></rootfiles></container>';
    const longText = '甲'.repeat(1_200_000);
    const extracted = await extractCustomEpub(
      createEpub(
        {
          'META-INF/container.xml': encodeUtf16Le(container),
          'OEBPS/text/ch1.xhtml':
            '<?xml version="1.0"?>' +
            '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>' +
            longText +
            '</p></body></html>',
          'OEBPS/text/ch2.xhtml':
            '<?xml version="1.0"?>' +
            '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>乙</p></body></html>'
        },
        { zipLevel: 0 }
      )
    );

    expect(extracted.canonicalText.length).toBe(1_200_003);
    expect(extracted.chapterRanges).toHaveLength(2);
  }, 20_000);
});
