import dotenv from "dotenv";
import express from "express";
import path from "path";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { createServer as createViteServer } from "vite";
import puppeteer from "puppeteer";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

type SupabaseEbookRow = {
  id: string;
  user_id: string;
  title: string;
  normalized_title: string;
  blocks: unknown;
  settings: unknown;
  version: number;
  created_at: string;
  updated_at: string;
};

let supabaseAdminClient: any = null;

function getSupabaseAdminClient() {
  if (supabaseAdminClient) return supabaseAdminClient;

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configurados.");
  }

  supabaseAdminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdminClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Pre-install/check chrome binary for puppeteer on startup
  try {
    const fs = await import("fs");
    const { exec } = await import("child_process");
    
    const possibleRoots = [
      path.join(process.cwd(), ".cache"),
      path.join(process.cwd(), ".cache/puppeteer"),
      "/.cache/puppeteer",
      "/root/.cache/puppeteer",
      "/www-data-home/.cache/puppeteer"
    ];
    
    let chromeFound = false;
    const searchChrome = (dir: string): boolean => {
      try {
        if (!fs.existsSync(dir)) return false;
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            if (searchChrome(fullPath)) return true;
          } else if (file === "chrome" || file === "chromium") {
            return true;
          }
        }
      } catch (e) {}
      return false;
    };
    
    for (const root of possibleRoots) {
      if (searchChrome(root)) {
        chromeFound = true;
        break;
      }
    }
    
    if (!chromeFound) {
      console.log("Puppeteer: Chrome not found on startup. Starting background install...");
      exec("npx puppeteer browsers install chrome", (err, stdout, stderr) => {
        if (err) {
          console.error("Puppeteer startup background installation failed:", err);
        } else {
          console.log("Puppeteer startup background installation completed:", stdout);
        }
      });
    } else {
      console.log("Puppeteer: Chrome found on startup.");
    }
  } catch (startupCheckErr) {
    console.error("Puppeteer startup check failed:", startupCheckErr);
  }

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
        path.join(process.cwd(), ".cache"),
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

      if (!executablePath) {
        console.log("Puppeteer: Chrome executable not found in standard paths. Attempting synchronous installation via npx...");
        try {
          const { execSync } = await import("child_process");
          execSync("npx puppeteer browsers install chrome", { stdio: "inherit" });
          
          // Search again after installation
          for (const root of possibleRoots) {
            const found = searchChrome(root);
            if (found) {
              executablePath = found;
              console.log("Puppeteer: Found Chrome executable after synchronous installation at:", executablePath);
              break;
            }
          }
        } catch (installError) {
          console.error("Puppeteer: Synchronous chrome installation failed:", installError);
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

  app.get("/api/cloud/projects", async (req, res) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
      if (!userId) {
        return res.status(400).json({ error: "O parâmetro userId é obrigatório." });
      }

      const supabase = getSupabaseAdminClient();
      const ebooks = supabase.from("ebooks") as any;
      const { data, error } = await ebooks
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      return res.json({ projects: (data || []) as SupabaseEbookRow[] });
    } catch (error: any) {
      console.error("Erro ao listar projetos do Supabase:", error);
      return res.status(500).json({ error: error.message || "Falha ao listar projetos." });
    }
  });

  app.get("/api/cloud/projects/:projectId", async (req, res) => {
    try {
      const projectId = req.params.projectId?.trim();
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";

      if (!projectId || !userId) {
        return res.status(400).json({ error: "projectId e userId são obrigatórios." });
      }

      const supabase = getSupabaseAdminClient();
      const ebooks = supabase.from("ebooks") as any;
      const { data, error } = await ebooks
        .select("*")
        .eq("id", projectId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      return res.json({ project: (data as SupabaseEbookRow | null) || null });
    } catch (error: any) {
      console.error("Erro ao carregar projeto do Supabase:", error);
      return res.status(500).json({ error: error.message || "Falha ao carregar projeto." });
    }
  });

  app.post("/api/cloud/projects", async (req, res) => {
    try {
      const {
        userId,
        projectId,
        title,
        normalizedTitle,
        blocks,
        settings,
        version,
      } = req.body || {};

      if (!userId || !title || !normalizedTitle) {
        return res.status(400).json({
          error: "userId, title e normalizedTitle são obrigatórios."
        });
      }

      const supabase = getSupabaseAdminClient();
      const ebooks = supabase.from("ebooks") as any;
      const generatedProjectId = `${userId}_${normalizedTitle}`;
      const resolvedProjectId = typeof projectId === "string" && projectId.trim()
        ? projectId.trim()
        : generatedProjectId;

      const { data: duplicate, error: duplicateError } = await ebooks
        .select("id")
        .eq("user_id", userId)
        .eq("normalized_title", normalizedTitle)
        .maybeSingle();

      if (duplicateError) throw duplicateError;

      if (duplicate?.id && duplicate.id !== resolvedProjectId) {
        return res.status(409).json({
          error: "Já existe outro projeto salvo com esse nome.",
        });
      }

      const { data: existing, error: existingError } = await ebooks
        .select("id, version, created_at")
        .eq("id", resolvedProjectId)
        .maybeSingle();

      if (existingError) throw existingError;

      const nextVersion = Math.max(Number(existing?.version || 0), Number(version || 0)) || 1;
      const nowIso = new Date().toISOString();

      const payload = {
        id: resolvedProjectId,
        user_id: userId,
        title,
        normalized_title: normalizedTitle,
        blocks: blocks ?? [],
        settings: settings ?? {},
        version: nextVersion,
        created_at: existing?.created_at || nowIso,
        updated_at: nowIso,
      };

      const { data, error } = await ebooks
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .single();

      if (error) throw error;

      return res.json({ project: data as SupabaseEbookRow });
    } catch (error: any) {
      console.error("Erro ao salvar projeto no Supabase:", error);
      return res.status(500).json({ error: error.message || "Falha ao salvar projeto." });
    }
  });

  app.patch("/api/cloud/projects/:projectId", async (req, res) => {
    try {
      const projectId = req.params.projectId?.trim();
      const { userId, title, normalizedTitle } = req.body || {};

      if (!projectId || !userId || !title || !normalizedTitle) {
        return res.status(400).json({
          error: "projectId, userId, title e normalizedTitle são obrigatórios."
        });
      }

      const supabase = getSupabaseAdminClient();
      const ebooks = supabase.from("ebooks") as any;

      const { data: duplicate, error: duplicateError } = await ebooks
        .select("id")
        .eq("user_id", userId)
        .eq("normalized_title", normalizedTitle)
        .neq("id", projectId)
        .maybeSingle();

      if (duplicateError) throw duplicateError;

      if (duplicate?.id) {
        return res.status(409).json({
          error: "Já existe outro projeto salvo com esse nome.",
        });
      }

      const { data: existing, error: existingError } = await ebooks
        .select("version")
        .eq("id", projectId)
        .eq("user_id", userId)
        .maybeSingle();

      if (existingError) throw existingError;

      const nextVersion = Math.max(Number(existing?.version || 0), 0) + 1;

      const { data, error } = await ebooks
        .update({
          title,
          normalized_title: normalizedTitle,
          version: nextVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId)
        .eq("user_id", userId)
        .select("*")
        .single();

      if (error) throw error;

      return res.json({ project: data as SupabaseEbookRow });
    } catch (error: any) {
      console.error("Erro ao renomear projeto no Supabase:", error);
      return res.status(500).json({ error: error.message || "Falha ao renomear projeto." });
    }
  });

  app.delete("/api/cloud/projects/:projectId", async (req, res) => {
    try {
      const projectId = req.params.projectId?.trim();
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";

      if (!projectId || !userId) {
        return res.status(400).json({ error: "projectId e userId são obrigatórios." });
      }

      const supabase = getSupabaseAdminClient();
      const ebooks = supabase.from("ebooks") as any;
      const { error } = await ebooks
        .delete()
        .eq("id", projectId)
        .eq("user_id", userId);

      if (error) throw error;

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Erro ao excluir projeto do Supabase:", error);
      return res.status(500).json({ error: error.message || "Falha ao excluir projeto." });
    }
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
