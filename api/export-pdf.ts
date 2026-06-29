import type { IncomingMessage, ServerResponse } from "http";
import { generatePdfBuffer, type PdfExportRequestPayload } from "../server/pdf-export-vercel";

type VercelLikeRequest = IncomingMessage & {
  method?: string;
  body?: PdfExportRequestPayload;
};

type VercelLikeResponse = ServerResponse & {
  status: (code: number) => VercelLikeResponse;
  json: (payload: unknown) => void;
  send: (payload: Buffer | string) => void;
  setHeader: (name: string, value: string) => VercelLikeResponse;
};

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido." });
  }

  const payload = req.body;

  if (!payload?.html) {
    return res.status(400).json({ error: "O conteúdo HTML é obrigatório." });
  }

  try {
    const pdfBuffer = await generatePdfBuffer(payload);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=ebook.pdf");
    return res.status(200).send(pdfBuffer);
  } catch (error: any) {
    console.error("Erro ao gerar PDF (Vercel Function):", error);
    return res.status(500).json({ error: error?.message || "Falha interna na geração do PDF." });
  }
}
