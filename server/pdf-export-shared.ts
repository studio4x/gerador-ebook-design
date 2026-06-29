import type { Page } from "puppeteer-core";

export type PdfExportRequestPayload = {
  html: string;
  css?: string;
  fontFamily?: string;
  fontDisplay?: string;
};

function buildFontLink(payload: PdfExportRequestPayload) {
  const fontsToLoad = new Set<string>();
  if (payload.fontFamily) fontsToLoad.add(payload.fontFamily);
  if (payload.fontDisplay) fontsToLoad.add(payload.fontDisplay);

  fontsToLoad.add("Inter");
  fontsToLoad.add("Playfair Display");
  fontsToLoad.add("Poppins");

  const fontQuery = Array.from(fontsToLoad)
    .map((font) => `family=${font.trim().replace(/\s+/g, "+")}:wght@400;500;600;700`)
    .join("&");

  return `<link href="https://fonts.googleapis.com/css2?${fontQuery}&display=swap" rel="stylesheet">`;
}

function buildPdfHtml(payload: PdfExportRequestPayload) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          ${payload.css || ""}
          @page {
            size: A4 portrait;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            background-color: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body, html, * {
            -webkit-font-smoothing: antialiased !important;
            -moz-osx-font-smoothing: grayscale !important;
            text-rendering: optimizeLegibility !important;
          }
          .ebook-preview-container {
            padding: 0 !important;
            margin: 0 !important;
            width: 210mm !important;
            max-width: 210mm !important;
            height: auto !important;
            min-height: 0 !important;
          }
          .no-print-layout {
            padding: 0 !important;
            margin: 0 !important;
            height: auto !important;
            min-height: 0 !important;
          }
          .ebook-layout-canvas {
            padding: 0 !important;
            margin: 0 !important;
            height: auto !important;
            min-height: 0 !important;
          }
          .page-wrapper-card {
            page-break-after: always !important;
            break-after: page !important;
          }
          .page-wrapper-card:last-child,
          .page-wrapper-card:last-of-type {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          .pdf-page, .page {
            width: 210mm !important;
            height: 297mm !important;
            max-height: 297mm !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
            position: relative !important;
          }
          .page-wrapper-card:last-child .page,
          .page-wrapper-card:last-of-type .page,
          .page:last-of-type,
          .pdf-page:last-of-type {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          .no-print {
            display: none !important;
          }
          a {
            color: inherit;
            text-decoration: none;
          }
        </style>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        ${buildFontLink(payload)}
      </head>
      <body>
        ${payload.html}
      </body>
    </html>
  `;
}

export async function renderPdfPage(page: Page, payload: PdfExportRequestPayload): Promise<Buffer> {
  if (!payload.html) {
    throw new Error("O conteúdo HTML é obrigatório.");
  }

  await page.setViewport({
    width: 1200,
    height: 1600,
    deviceScaleFactor: 3,
    isMobile: false,
    hasTouch: false,
  });

  await page.setContent(buildPdfHtml(payload), { waitUntil: "load" });

  try {
    await page.evaluateHandle("document.fonts.ready");
  } catch (error) {
    console.warn("Could not await document.fonts.ready:", error);
  }

  await page.emulateMediaType("print");
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 10_000 }).catch(() => undefined);

  const pageCount = await page.$$eval(".pdf-page, .page", (pages) => pages.length);
  const bodyTextLength = await page.$eval("body", (el) => (el as HTMLElement).innerText.length);

  console.log("=== Debug Puppeteer Export ===");
  console.log("HTML recebido tamanho:", payload.html.length);
  console.log("Quantidade de páginas (.pdf-page/.page):", pageCount);
  console.log("Body text length:", bodyTextLength);

  if (bodyTextLength < 50 || pageCount === 0) {
    throw new Error(`Exportação abortada: conteúdo insuficiente detectado. (Páginas: ${pageCount}, Texto: ${bodyTextLength} chars)`);
  }

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: {
      top: "0mm",
      right: "0mm",
      bottom: "0mm",
      left: "0mm",
    },
  });

  return Buffer.from(pdfBuffer);
}
