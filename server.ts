import express from "express";
import path from "path";
import nodemailer from "nodemailer";
import { createServer as createViteServer } from "vite";
import puppeteer from "puppeteer";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set limits for handling base64-encoded PDF & EPUB file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Route: Export PDF with Puppeteer
  app.post("/api/export-pdf", async (req, res) => {
    const { html, css, fontFamily, fontDisplay } = req.body;
    
    if (!html) {
      return res.status(400).json({ error: "O conteúdo HTML é obrigatório." });
    }

    try {
      // Locate chrome binary dynamically inside .cache or typical directories
      let executablePath: string | undefined = undefined;
      const fs = await import("fs");
      
      const searchChrome = (dir: string): string | null => {
        try {
          if (!fs.existsSync(dir)) return null;
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              const found = searchChrome(fullPath);
              if (found) return found;
            } else if (file === "chrome" || file === "chromium") {
              return fullPath;
            }
          }
        } catch (e) {
          // ignore directory read errors
        }
        return null;
      };

      const possibleRoots = [
        path.join(process.cwd(), ".cache/puppeteer"),
        "/.cache/puppeteer",
        "/root/.cache/puppeteer",
        "/www-data-home/.cache/puppeteer"
      ];

      for (const root of possibleRoots) {
        const found = searchChrome(root);
        if (found) {
          executablePath = found;
          console.log("Puppeteer: Found Chrome executable at:", executablePath);
          break;
        }
      }

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
          "--force-device-scale-factor=3"
        ]
      });

      const page = await browser.newPage();

      // Configurar viewport com alto Device Scale Factor para renderização Retina ultra nítida de bordas, imagens e subpixels
      await page.setViewport({
        width: 1200,
        height: 1600,
        deviceScaleFactor: 3,
        isMobile: false,
        hasTouch: false
      });

      // Mapeamento e carregamento dinâmico de fontes selecionadas pelo usuário no e-book
      const fontsToLoad = new Set<string>();
      if (fontFamily) fontsToLoad.add(fontFamily);
      if (fontDisplay) fontsToLoad.add(fontDisplay);
      
      // Fontes padrão de fallback/gerais
      fontsToLoad.add("Inter");
      fontsToLoad.add("Playfair Display");
      fontsToLoad.add("Poppins");

      const fontQuery = Array.from(fontsToLoad)
        .map(font => `family=${font.trim().replace(/\s+/g, '+')}:wght@400;500;600;700`)
        .join('&');

      const dynamicFontsLink = `<link href="https://fonts.googleapis.com/css2?${fontQuery}&display=swap" rel="stylesheet">`;

      const fullHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              ${css || ""}
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
              /* Suavização de renderização de fontes e subpixels para máxima resolução */
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
              /* Forçar páginas A4 e quebras corretas no PDF */
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
              /* Ocultar elementos desnecessários na exportação */
              .no-print {
                display: none !important;
              }
              a {
                color: inherit;
                text-decoration: none;
              }
            </style>
            <!-- Carregar fontes Google dinâmicas de forma idêntica à visualização -->
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            ${dynamicFontsLink}
          </head>
          <body>
            ${html}
          </body>
        </html>
      `;

      await page.setContent(fullHtml, { waitUntil: "load" });
      
      // Esperar até que todas as fontes carregadas pelo Google Fonts estejam totalmente desenhadas no DOM antes do PDF
      try {
        await page.evaluateHandle('document.fonts.ready');
      } catch (e) {
        console.warn("Could not wait for document.fonts.ready:", e);
      }

      // Simula a mídia print para que o Chrome aplique `@media print`
      await page.emulateMediaType("print");

      // Adicionar logs obrigatórios
      const pageCount = await page.$$eval(".pdf-page, .page", pages => pages.length);
      const pageTitle = await page.title();
      const bodyTextLength = await page.$eval("body", el => (el as HTMLElement).innerText.length);

      console.log("=== Debug Puppeteer Export ===");
      console.log("HTML recebido tamanho:", html.length);
      console.log("Quantidade de páginas (.pdf-page/.page):", pageCount);
      console.log("Título da página:", pageTitle);
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
          left: "0mm"
        }
      });

      await browser.close();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=ebook.pdf");
      res.send(Buffer.from(pdfBuffer));
    } catch (error: any) {
      console.error("Erro ao gerar PDF:", error);
      res.status(500).json({ error: error.message || "Falha interna na geração do PDF" });
    }
  });

  // API Route: Send Email with attachment
  app.post("/api/send-email", async (req, res) => {
    const { to, subject, body, fileName, fileBase64, contentType } = req.body;

    if (!to) {
      return res.status(400).json({ error: "O destinatário ('to') é obrigatório." });
    }
    if (!fileBase64) {
      return res.status(400).json({ error: "O conteúdo do arquivo ('fileBase64') é obrigatório." });
    }

    try {
      const host = process.env.SMTP_HOST;
      const port = process.env.SMTP_PORT;
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      const from = process.env.SMTP_FROM || `"Gerador de E-books" <${user || "noreply@geradorebooks.com"}>`;

      if (!host || !port || !user || !pass) {
        return res.status(501).json({
          error: "Configurações de e-mail (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) não estão configuradas no painel de Settings do aplicativo. Configure os dados SMTP nas variáveis de ambiente antes de tentar enviar.",
          configured: false
        });
      }

      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(port, 10),
        secure: port === "465", // true for port 465, false for 587 or other ports
        auth: {
          user,
          pass,
        },
      });

      // Decode the base64 attachment
      const fileBuffer = Buffer.from(fileBase64, "base64");

      const mailOptions = {
        from,
        to,
        subject: subject || "Seu E-book gerado!",
        text: body || "Olá!\n\nSegue em anexo o arquivo do seu e-book solicitado no aplicativo Gerador de E-books.\n\nAtenciosamente,\nEquipe de Suporte",
        attachments: [
          {
            filename: fileName || "ebook.pdf",
            content: fileBuffer,
            contentType: contentType || "application/pdf",
          },
        ],
      };

      await transporter.sendMail(mailOptions);
      return res.json({ success: true, message: "E-mail enviado com sucesso!" });
    } catch (err: any) {
      console.error("Erro no envio do e-mail:", err);
      return res.status(500).json({ error: "Erro ao enviar e-mail pelo servidor: " + err.message });
    }
  });

  // API Route: Verify SMTP connection
  app.post("/api/test-smtp", async (req, res) => {
    try {
      const host = process.env.SMTP_HOST;
      const port = process.env.SMTP_PORT;
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;

      if (!host || !port || !user || !pass) {
        return res.status(400).json({
          success: false,
          error: "Configurações de e-mail (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) incompletas ou ausentes em suas configurações de ambiente do painel AI Studio."
        });
      }

      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(port, 10),
        secure: port === "465",
        auth: {
          user,
          pass,
        },
        connectionTimeout: 8000,
        greetingTimeout: 5000
      });

      await transporter.verify();
      return res.json({ success: true, message: "Conexão SMTP estabelecida e autenticada com sucesso!" });
    } catch (err: any) {
      console.error("Erro ao testar conexão SMTP:", err);
      return res.status(500).json({ success: false, error: "Falha de conexão SMTP: " + err.message });
    }
  });

  // API HEALTH CHECK
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Serve static files / Vite Middleware based on environment
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
