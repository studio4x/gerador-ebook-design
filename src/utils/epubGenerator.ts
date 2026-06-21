import JSZip from 'jszip';

interface EpubChapter {
  title: string;
  htmlBody: string;
}

interface EpubOptions {
  title: string;
  author: string;
  chapters: EpubChapter[];
  coverHtml?: string;
}

export async function generateEpub(options: EpubOptions): Promise<Blob> {
  const zip = new JSZip();

  // 1. mimetype (must be uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.file('META-INF/container.xml', containerXml);

  // 3. OEBPS content
  const oebps = zip.folder('OEBPS');
  if (!oebps) throw new Error("Failed to create OEBPS folder");

  // Create chapters
  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  const navPointItems: string[] = [];

  let chapterIndex = 1;
  
  if (options.coverHtml) {
    oebps.file('cover.html', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Cover</title><style>body { text-align: center; margin: 0; padding: 0; }</style></head>
<body>${options.coverHtml}</body>
</html>`);
    manifestItems.push(`<item id="cover" href="cover.html" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="cover"/>`);
  }

  for (const chapter of options.chapters) {
    const id = `chapter${chapterIndex}`;
    const fileName = `${id}.html`;
    const chapterHtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(chapter.title)}</title>
</head>
<body>
  <h1>${escapeXml(chapter.title)}</h1>
  ${chapter.htmlBody}
</body>
</html>`;
    
    oebps.file(fileName, chapterHtml);
    manifestItems.push(`<item id="${id}" href="${fileName}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${id}"/>`);
    navPointItems.push(`
    <navPoint id="navPoint-${chapterIndex}" playOrder="${chapterIndex}">
      <navLabel><text>${escapeXml(chapter.title)}</text></navLabel>
      <content src="${fileName}"/>
    </navPoint>`);
    
    chapterIndex++;
  }

  // Generate toc.ncx
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <head>
    <meta name="dtb:uid" content="urn:uuid:12345"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(options.title)}</text></docTitle>
  <navMap>
    ${navPointItems.join('\n')}
  </navMap>
</ncx>`;
  oebps.file('toc.ncx', tocNcx);
  manifestItems.push(`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`);

  // Generate content.opf
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${escapeXml(options.title)}</dc:title>
    <dc:creator opf:role="aut">${escapeXml(options.author)}</dc:creator>
    <dc:language>pt-BR</dc:language>
    <dc:identifier id="BookId">urn:uuid:12345</dc:identifier>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
  oebps.file('content.opf', contentOpf);

  // Generate Blob
  return await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, function (c) {
      switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case "'": return '&apos;';
          case '"': return '&quot;';
          default: return c;
      }
  });
}
