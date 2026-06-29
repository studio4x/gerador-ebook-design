import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { renderPdfPage, type PdfExportRequestPayload } from "./pdf-export-shared";

const LOCAL_CHROME_ROOTS = [
  path.join(process.cwd(), ".cache"),
  path.join(process.cwd(), ".cache/puppeteer"),
  "/.cache/puppeteer",
  "/root/.cache/puppeteer",
  "/www-data-home/.cache/puppeteer",
];

function searchChromeExecutable(dir: string): string | null {
  try {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const found = searchChromeExecutable(fullPath);
        if (found) return found;
      } else if (file === "chrome" || file === "chromium" || file === "chrome.exe") {
        return fullPath;
      }
    }
  } catch {
    // Ignore filesystem traversal errors while probing for the local browser binary.
  }
  return null;
}

async function getLocalExecutablePath() {
  for (const root of LOCAL_CHROME_ROOTS) {
    const found = searchChromeExecutable(root);
    if (found) {
      console.log("Puppeteer: Found local Chrome executable at:", found);
      return found;
    }
  }

  return undefined;
}

export async function generatePdfBuffer(payload: PdfExportRequestPayload): Promise<Buffer> {
  const executablePath = await getLocalExecutablePath();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--font-render-hinting=none",
      "--enable-font-antialiasing",
      "--force-device-scale-factor=3",
    ],
  });

  try {
    const page = await browser.newPage();
    return await renderPdfPage(page as any, payload);
  } finally {
    await browser.close();
  }
}

export type { PdfExportRequestPayload };
