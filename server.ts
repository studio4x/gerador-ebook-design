import express from "express";
import path from "path";
import nodemailer from "nodemailer";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set limits for handling base64-encoded PDF & EPUB file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

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
