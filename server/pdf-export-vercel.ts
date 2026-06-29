import chromium from "@sparticuz/chromium";
import puppeteerCore from "puppeteer-core";
import { renderPdfPage, type PdfExportRequestPayload } from "./pdf-export-shared.js";

export async function generatePdfBuffer(payload: PdfExportRequestPayload): Promise<Buffer> {
  const executablePath = await chromium.executablePath();
  const browser = await puppeteerCore.launch({
    executablePath,
    headless: true,
    args: [
      ...chromium.args,
      "--font-render-hinting=none",
      "--enable-font-antialiasing",
      "--force-device-scale-factor=3",
    ],
  });

  try {
    const page = await browser.newPage();
    return await renderPdfPage(page, payload);
  } finally {
    await browser.close();
  }
}

export type { PdfExportRequestPayload };
