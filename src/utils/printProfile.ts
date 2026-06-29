import QRCode from "qrcode";
import type { ProjectSettings } from "../types";

export type PageFormatId = "a4" | "16x23" | "11_5x18" | "20x20";

export type ChecklistStatus = "approved" | "attention" | "error";

export type ChecklistItem = {
  label: string;
  status: ChecklistStatus;
  detail: string;
};

export type PageFormatSpec = {
  id: PageFormatId;
  label: string;
  widthMm: number;
  heightMm: number;
  widthCmLabel: string;
  recommendedUse: string;
};

export const PAGE_FORMATS: PageFormatSpec[] = [
  {
    id: "a4",
    label: "A4 vertical",
    widthMm: 210,
    heightMm: 297,
    widthCmLabel: "21 x 29,7 cm",
    recommendedUse: "Padrão mais versátil para tela e impressão.",
  },
  {
    id: "16x23",
    label: "16 x 23 cm",
    widthMm: 160,
    heightMm: 230,
    widthCmLabel: "16 x 23 cm",
    recommendedUse: "Visual mais editorial para livro físico.",
  },
  {
    id: "11_5x18",
    label: "11,5 x 18 cm",
    widthMm: 115,
    heightMm: 180,
    widthCmLabel: "11,5 x 18 cm",
    recommendedUse: "Compacto, indicado para textos predominantes.",
  },
  {
    id: "20x20",
    label: "20 x 20 cm",
    widthMm: 200,
    heightMm: 200,
    widthCmLabel: "20 x 20 cm",
    recommendedUse: "Quadrado, indicado para projetos visuais específicos.",
  },
];

export function getPageFormatSpec(formatId?: PageFormatId): PageFormatSpec {
  return PAGE_FORMATS.find((format) => format.id === formatId) || PAGE_FORMATS[0];
}

export function getHybridPrintMetrics(pageCount: number, formatId?: PageFormatId) {
  const format = getPageFormatSpec(formatId);
  const innerMarginMm = pageCount > 100 ? 22 : 20;
  const outerMarginMm = 20;
  const topMarginMm = 20;
  const bottomMarginMm = 20;
  const safeContentWidthMm = Math.max(format.widthMm - innerMarginMm - outerMarginMm, 70);
  const safeContentHeightMm = Math.max(format.heightMm - topMarginMm - bottomMarginMm, 100);

  return {
    format,
    margins: {
      topMm: topMarginMm,
      bottomMm: bottomMarginMm,
      innerMm: innerMarginMm,
      outerMm: outerMarginMm,
    },
    safeArea: {
      widthMm: safeContentWidthMm,
      heightMm: safeContentHeightMm,
    },
    qrSizeMm: 30,
    recommendedBinding:
      pageCount >= 60
        ? "Livro com lombada potencial. Validar a lombada com o template final da gráfica."
        : "Livreto, apostila ou caderno grampeado.",
  };
}

export function sanitizeTitleForFileName(title: string): string {
  const normalized = (title || "ebook")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[çÇ]/g, (match) => (match === "ç" ? "c" : "C"));

  return normalized
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function buildHybridPdfFileName(title: string): string {
  return `${sanitizeTitleForFileName(title)}_EBOOK_HIBRIDO_PRINT_READY.pdf`;
}

export async function generateQrCodeDataUrl(url: string): Promise<string> {
  if (!url) return "";

  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 360,
    color: {
      dark: "#245C5A",
      light: "#FAF8F4",
    },
  });
}

function containsPattern(input: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(input));
}

export function buildHybridChecklists(args: {
  settings: ProjectSettings;
  parsedHtml: string;
  totalPages: number;
  hasCoverImage: boolean;
  hasQrCode: boolean;
}) {
  const { settings, parsedHtml, totalPages, hasCoverImage, hasQrCode } = args;
  const metrics = getHybridPrintMetrics(totalPages, settings.pageFormat);
  const format = metrics.format;
  const ctaUrl = settings.schedulingUrl || settings.whatsapp || settings.website || "";
  const hasReferences = /secao-referencias|refer[eê]ncias|fontes consultadas/i.test(parsedHtml);
  const hasInlineRasterImages = /<img\b/i.test(parsedHtml) || hasCoverImage;
  const containsClickHere = /clique aqui/i.test(parsedHtml);
  const dependsOnMedia = containsPattern(parsedHtml, [/youtube/i, /vimeo/i, /\.mp3/i, /\.mp4/i, /spotify/i]);
  const promisesOutcome = containsPattern(parsedHtml, [/cura garantida/i, /resultado garantido/i, /solu[cç][aã]o definitiva/i]);
  const diagnosticLanguage = containsPattern(parsedHtml, [/voc[eê]\s+tem\s+autismo/i, /voc[eê]\s+[ée]\s+autista/i, /voc[eê]\s+tem\s+tdah/i]);
  const mentionsOccupationalTherapy = /terapia ocupacional/i.test(parsedHtml) || /terapeuta ocupacional/i.test(`${settings.professionalTitle} ${settings.materialType}`);
  const hasExercises = /checklist-item|fill-line|exerc[ií]cio|atividade/i.test(parsedHtml);

  const technical: ChecklistItem[] = [
    {
      label: "Formato final definido em centímetros",
      status: "approved",
      detail: `${format.label} configurado em ${format.widthCmLabel}.`,
    },
    {
      label: "Margens seguras configuradas",
      status: "approved",
      detail: `Superior ${metrics.margins.topMm / 10} cm, inferior ${metrics.margins.bottomMm / 10} cm, externa ${metrics.margins.outerMm / 10} cm.`,
    },
    {
      label: "Margem interna adequada ao número de páginas",
      status: "approved",
      detail: `Margem interna de ${(metrics.margins.innerMm / 10).toFixed(1).replace(".", ",")} cm para ${totalPages} páginas projetadas.`,
    },
    {
      label: "Sangria de 5 mm quando necessária",
      status: hasCoverImage ? "attention" : "approved",
      detail: hasCoverImage
        ? "Há elementos de capa/imagem. A exportação mantém área segura, mas a sangria final ainda deve ser conferida no fechamento gráfico."
        : "Sem elementos full bleed detectados no fluxo atual.",
    },
    {
      label: "Nenhum conteúdo importante na área de corte",
      status: "approved",
      detail: "O layout usa área segura interna e evita texto essencial nas bordas.",
    },
    {
      label: "Imagens com no mínimo 300 DPI",
      status: hasInlineRasterImages ? "attention" : "approved",
      detail: hasInlineRasterImages
        ? "Existem imagens raster. Validar o arquivo original antes de enviar à gráfica."
        : "Nenhuma imagem raster detectada no miolo.",
    },
    {
      label: "Capa em 300 DPI ou 600 DPI",
      status: hasCoverImage ? "attention" : "attention",
      detail: hasCoverImage
        ? "A capa usa imagem externa. Confirmar 300 DPI mínimo, ideal 600 DPI."
        : "A capa atual é tipográfica. Se trocar por imagem, validar DPI antes da gráfica.",
    },
    {
      label: "Padrão de cor adequado",
      status: "attention",
      detail: "O PDF híbrido é gerado em RGB. Converter para CMYK no fechamento final da gráfica, se exigido.",
    },
    {
      label: "Fontes incorporadas",
      status: "attention",
      detail: "O exportador carrega fontes web na renderização. Validar a incorporação final no PDF exportado.",
    },
    {
      label: "Links adaptados para URL visível e QR Code",
      status: ctaUrl && hasQrCode ? "approved" : "error",
      detail: ctaUrl && hasQrCode
        ? "CTA principal tem botão clicável, URL visível e QR Code."
        : "Defina ao menos uma URL principal para gerar QR Code e redundância impressa.",
    },
    {
      label: "CTA funcional no digital e no impresso",
      status: settings.ctaText && ctaUrl ? "approved" : "attention",
      detail: settings.ctaText && ctaUrl
        ? "O CTA possui texto explicativo, link e alternativa impressa."
        : "Complete o CTA com texto e URL principal.",
    },
    {
      label: "QR Code gerado",
      status: hasQrCode ? "approved" : "attention",
      detail: hasQrCode ? "QR Code principal pronto para teste." : "QR Code ainda não gerado porque falta URL principal.",
    },
    {
      label: "QR Code com tamanho mínimo adequado",
      status: hasQrCode ? "approved" : "attention",
      detail: hasQrCode ? "O layout reserva 3 x 3 cm para o QR Code." : "Defina a URL principal para reservar a área de QR Code.",
    },
    {
      label: "Sumário correto",
      status: settings.generateToc !== false ? "approved" : "attention",
      detail: settings.generateToc !== false ? "Sumário automático habilitado." : "O PDF funcionará sem sumário, mas perde navegação editorial.",
    },
    {
      label: "Numeração de páginas correta",
      status: totalPages > 0 ? "approved" : "error",
      detail: totalPages > 0 ? `${totalPages} páginas mapeadas para exportação.` : "Nenhuma página foi projetada para exportação.",
    },
    {
      label: "Aviso educativo incluído",
      status: settings.educationalWarning ? "approved" : "error",
      detail: settings.educationalWarning ? "O aviso educativo está presente." : "Inclua o aviso educativo obrigatório.",
    },
    {
      label: "Página sobre autora/clínica incluída",
      status: settings.brand || settings.professionalName ? "approved" : "attention",
      detail: settings.brand || settings.professionalName
        ? "Há página institucional com autoria/contatos."
        : "Complete os dados institucionais para a página final.",
    },
    {
      label: "Referências incluídas quando houver conteúdo técnico",
      status: hasReferences ? "approved" : "attention",
      detail: hasReferences ? "Seção de referências detectada." : "Se o conteúdo for técnico, inclua referências explicitamente.",
    },
    {
      label: "Contracapa com sinopse e área editorial",
      status: "attention",
      detail: "O fluxo atual fecha o PDF com página institucional. Contracapa completa ainda depende de arte final dedicada.",
    },
    {
      label: "Área reservada para ISBN/código de barras, se aplicável",
      status: totalPages >= 60 && !settings.isbn ? "attention" : "approved",
      detail:
        totalPages >= 60 && !settings.isbn
          ? "O volume já comporta livro com lombada. Reserve ISBN/código de barras na arte final."
          : settings.isbn
            ? `ISBN informado: ${settings.isbn}.`
            : "Sem exigência imediata de ISBN para o volume atual.",
    },
    {
      label: "Ausência de frases como “clique aqui”",
      status: containsClickHere ? "error" : "approved",
      detail: containsClickHere ? "Há texto dependente de clique. Reescreva para leitura em papel." : "Nenhuma chamada dependente de clique foi detectada.",
    },
    {
      label: "Prova de impressão recomendada antes da venda física",
      status: "attention",
      detail: "Recomendação fixa: imprimir prova e revisar corte, cor e legibilidade.",
    },
  ];

  const editorial: ChecklistItem[] = [
    {
      label: "O conteúdo continua claro fora do ambiente digital",
      status: !containsClickHere && !dependsOnMedia ? "approved" : "attention",
      detail: !containsClickHere && !dependsOnMedia
        ? "O conteúdo principal não depende de clique ou mídia externa."
        : "Revisar trechos que dependam de clique, vídeo ou áudio.",
    },
    {
      label: "O texto não depende de vídeo, áudio, botão ou link oculto",
      status: dependsOnMedia ? "error" : "approved",
      detail: dependsOnMedia ? "Há referências a mídia externa que exigem adaptação para papel." : "Não foram detectadas dependências de mídia.",
    },
    {
      label: "Exercícios possuem espaço real para preenchimento",
      status: hasExercises ? "approved" : "attention",
      detail: hasExercises ? "Checklist e linhas de preenchimento estão presentes quando detectados." : "Se houver exercícios, adicione checklists ou linhas de preenchimento.",
    },
    {
      label: "A versão mantém legibilidade e conforto visual",
      status: settings.densityMode === "compact" ? "attention" : "approved",
      detail:
        settings.densityMode === "compact"
          ? "O modo compacto cabe mais conteúdo, mas fica menos confortável para impressão."
          : "A densidade atual favorece leitura híbrida.",
    },
    {
      label: "A Terapia Ocupacional permanece como eixo central",
      status: mentionsOccupationalTherapy ? "approved" : "attention",
      detail: mentionsOccupationalTherapy
        ? "Há menção explícita à Terapia Ocupacional no material."
        : "Se o posicionamento clínico for central, explicite Terapia Ocupacional no conteúdo.",
    },
    {
      label: "Não há promessa de cura ou resultado garantido",
      status: promisesOutcome ? "error" : "approved",
      detail: promisesOutcome ? "Foram detectadas promessas incompatíveis com o posicionamento ético." : "Nenhuma promessa indevida detectada.",
    },
    {
      label: "Não há linguagem que diagnostique o leitor",
      status: diagnosticLanguage ? "attention" : "approved",
      detail: diagnosticLanguage ? "Revisar linguagem que atribui diagnóstico diretamente ao leitor." : "Nenhuma linguagem diagnóstica direta foi detectada.",
    },
    {
      label: "O CTA final é claro, ético e proporcional",
      status: settings.ctaText && ctaUrl ? "approved" : "attention",
      detail: settings.ctaText && ctaUrl
        ? "O CTA final tem contexto e canal oficial."
        : "Complete o CTA para manter fechamento editorial consistente.",
    },
  ];

  return {
    technical,
    editorial,
    bindingRecommendation: metrics.recommendedBinding,
    formatLabel: `${format.label} (${format.widthCmLabel})`,
  };
}
