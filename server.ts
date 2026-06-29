import dotenv from "dotenv";
import express from "express";
import path from "path";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { createServer as createViteServer } from "vite";
import { generatePdfBuffer, type PdfExportRequestPayload } from "./server/pdf-export-local";

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
    try {
      const pdfBuffer = await generatePdfBuffer(req.body as PdfExportRequestPayload);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=ebook.pdf");
      res.send(pdfBuffer);
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
