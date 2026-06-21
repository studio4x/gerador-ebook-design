import React, { useState, useEffect, useRef } from "react";
import {
  ProjectSettings,
  ContentBlock,
  DEFAULT_SETTINGS,
  EbookProject,
} from "./types";
import { parseEbookContent, extractMetadataFromContent } from "./utils/parser";
import { chunkIntoPages } from "./utils/paginator";
import { EbookPreview } from "./components/EbookPreview";
import { parseHandoffMarkdown, LayoutRevision } from "./utils/handoffParser";
import {
  FileText,
  LayoutTemplate,
  Download,
  Upload,
  CheckCircle,
  AlertTriangle,
  Plus,
  Trash2,
  History,
  Palette,
  RefreshCw,
  Globe,
  User,
  BookOpen,
  AlertCircle,
} from "lucide-react";

// Import CloudSync
import { CloudSync } from "./components/CloudSync";

export default function App() {
  const initialSettings: ProjectSettings = {
    title: "Não é Falta de Disciplina",
    shortTitle: "Não é Falta de Disciplina",
    densityMode: "comfortable",
    subtitle:
      "Rotina, energia e sobrecarga sensorial na vida adulta neurodivergente",
    supportPhrase: "Rotina possível, não rotina perfeita.",
    professionalName: "Dra. Deyse Simon",
    professionalTitle: "Terapeuta Ocupacional e Psicanalista",
    professionalReg: "CREFITO-3/21465-TO",
    brand: "Conexão Seres",
    website: "https://conexaoseres.com.br",
    materialType: "E-book educativo",
    targetAudience: "Adultos neurodivergentes e rede de apoio",
    ctaText:
      "Se este material fez sentido para você, talvez seja importante olhar para sua rotina de forma mais individualizada.\n\nA Terapia Ocupacional pode ajudar a compreender como rotina, sensorialidade, energia, ambiente, autonomia e participação se relacionam no seu cotidiano.",
    ctaButtonText: "Falar com a Conexão Seres",
    contactAddress:
      "Rua Petrobrás, 683 — Vila Antonieta — São Paulo/SP — CEP 03474-060",
    instagram: "@conexao.seres",
    email: "contato@conexaoseres.com.br",
    whatsapp: "https://wa.me/5511964818096",
    schedulingUrl: "https://conexaoseres.com.br/agendar-avaliacao-e-contato/",
    educationalWarning:
      "Este material tem caráter educativo e não substitui avaliação, diagnóstico ou acompanhamento profissional individualizado.",
    generateToc: true,
  };

  const defaultRev: LayoutRevision = {
    id: "initial-default",
    filename: "EBOOK_VISUAL_HANDOFF.md (Padrão)",
    uploadedAt: new Date().toLocaleString("pt-BR"),
    settings: initialSettings,
    rawContent: [
      "# Handoff Visual — E-book Conexão Seres",
      "",
      "**Título:** Não é Falta de Disciplina",
      "**Subtítulo:** Rotina, energia e sobrecarga sensorial na vida adulta neurodivergente",
      "**Modo de Distribuição:** confortável",
      "**Gerar Sumário:** sim",
      "**Borda da Página:** não",
      "**Cabeçalho Descritivo:** sim",
      "**Texto do Cabeçalho:** Conexão Seres",
      "**Alinhamento do Cabeçalho:** esquerda",
      "**Texto do Rodapé:** Conexão Seres | Livro Digital",
      "**Alinhamento do Rodapé:** esquerda",
      "**Numeração de Página:** direita",
    ].join("\n"),
  };

  const [activeTab, setActiveTab] = useState<"content" | "visual" | "preview">("content");
  const [settings, setSettings] = useState<ProjectSettings>(() => {
    const saved = localStorage.getItem("ebook_layout_settings");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return initialSettings;
  });
  const [blocks, setBlocks] = useState<ContentBlock[]>(() => {
    const saved = localStorage.getItem("ebook_layout_blocks");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });
  const [parsedHtml, setParsedHtml] = useState<string>("");
  const [contentPages, setContentPages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingEpub, setIsExportingEpub] = useState(false);
  const [reprocessTrigger, setReprocessTrigger] = useState(0);
  const [revisions, setRevisions] = useState<LayoutRevision[]>(() => {
    const saved = localStorage.getItem("ebook_layout_revisions");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [defaultRev];
  });
  const [activeRevisionId, setActiveRevisionId] = useState<string>(() => {
    const saved = localStorage.getItem("ebook_layout_active_id");
    return saved || "initial-default";
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handoffFileInputRef = useRef<HTMLInputElement>(null);

  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "info",
  ) => {
    setNotification({ message, type });
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Save to localStorage whenever things change
  useEffect(() => {
    if (revisions.length > 0) {
      localStorage.setItem("ebook_layout_revisions", JSON.stringify(revisions));
    }
  }, [revisions]);

  useEffect(() => {
    if (activeRevisionId) {
      localStorage.setItem("ebook_layout_active_id", activeRevisionId);
    }
  }, [activeRevisionId]);

  useEffect(() => {
    localStorage.setItem("ebook_layout_settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem("ebook_layout_blocks", JSON.stringify(blocks));
  }, [blocks]);

  // Build version is statically defined corresponding to the workspace/app structure deployment
  const buildVersionStr = "v1.4.38";

  // 1. Extract content metadata when blocks change, guarding against infinite loops with a 500ms debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (blocks.length > 0) {
        const contentMetadata = extractMetadataFromContent(blocks);
        if (Object.keys(contentMetadata).length > 0) {
          setSettings((prev) => {
            let hasChange = false;
            const merged = { ...prev };
            for (const key of Object.keys(contentMetadata) as Array<
              keyof ProjectSettings
            >) {
              if (prev[key] !== contentMetadata[key]) {
                (merged as any)[key] = contentMetadata[key];
                hasChange = true;
              }
            }
            return hasChange ? merged : prev;
          });
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [blocks]);

  // 2. Parse and chunk pages whenever blocks, settings.densityMode OR reprocessTrigger change, with a 400ms debounce
  // This avoids running heavy DOMParser based pagination while actively typing or adjusting style sliders
  useEffect(() => {
    const timer = setTimeout(() => {
      async function updateHtmlAndPages() {
        if (blocks.length > 0) {
          const html = await parseEbookContent(blocks);
          setParsedHtml(html);
          const pages = chunkIntoPages(html, settings.densityMode);
          setContentPages(pages);
        } else {
          setParsedHtml("");
          setContentPages([]);
        }
      }
      updateHtmlAndPages();
    }, 400);

    return () => clearTimeout(timer);
  }, [blocks, settings.densityMode, reprocessTrigger]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);

    // Sort files by name automatically to handle parte-1.md, parte-2.md
    files.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );

    const newBlocks: ContentBlock[] = [];
    for (const file of files) {
      const text = await file.text();
      newBlocks.push({
        id: crypto.randomUUID(),
        filename: file.name,
        content: text,
      });
    }

    setBlocks((prev) => [...prev, ...newBlocks]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addManualBlock = () => {
    setBlocks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        filename: `Bloco Manual ${prev.length + 1}`,
        content: "",
      },
    ]);
  };

  const updateBlockContent = (id: string, content: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, content } : b)));
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const saveProject = () => {
    const project: EbookProject = { settings, blocks };
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `projeto-${settings.title.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const project = JSON.parse(
          event.target?.result as string,
        ) as EbookProject;
        if (project.settings && project.blocks) {
          setSettings(project.settings);
          setBlocks(project.blocks);
          showToast("Projeto JSON carregado com sucesso!", "success");
        }
      } catch (err) {
        showToast("Erro ao carregar o projeto. Arquivo inválido.", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleHandoffUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsedSettings = parseHandoffMarkdown(text);

      const mergedSettings = {
        ...settings,
        ...parsedSettings,
      } as ProjectSettings;
      setSettings(mergedSettings);

      const newRevId = crypto.randomUUID();
      const newRevision: LayoutRevision = {
        id: newRevId,
        filename: file.name,
        uploadedAt: new Date().toLocaleString("pt-BR"),
        settings: mergedSettings,
        rawContent: text,
      };

      setRevisions((prev) => [newRevision, ...prev]);
      setActiveRevisionId(newRevId);

      if (handoffFileInputRef.current) {
        handoffFileInputRef.current.value = "";
      }
      showToast("Definições visuais carregadas com sucesso!", "success");
    } catch (err) {
      showToast(
        "Erro ao processar as especificações do arquivo: " + err,
        "error",
      );
    }
  };

  const applyRevision = (rev: LayoutRevision) => {
    setSettings(rev.settings);
    setActiveRevisionId(rev.id);
    showToast(`Revisão "${rev.filename}" aplicada com sucesso!`, "success");
  };

  const deleteRevision = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (id === activeRevisionId) {
      showToast(
        "Não é possível excluir a revisão atualmente ativa! Ative outra revisão primeiro.",
        "error",
      );
      return;
    }
    setRevisions((prev) => prev.filter((r) => r.id !== id));
    showToast("Revisão excluída com sucesso!", "success");
  };

  const reprocessPreview = async () => {
    setIsGenerating(true);
    try {
      // 1. Extract metadata from content
      const contentMetadata = extractMetadataFromContent(blocks);

      // 2. Keep visual settings (from current settings) but ensure content variables are matched
      const merged = {
        ...settings,
        ...contentMetadata,
      };

      setSettings(merged);

      // If there are layouts or revisions, sync them too if active
      if (activeRevisionId) {
        setRevisions((prev) =>
          prev.map((r) =>
            r.id === activeRevisionId ? { ...r, settings: merged } : r,
          ),
        );
      }

      // 3. Increment trigger to force a clean, single-pass async execution in useEffect
      setReprocessTrigger((prev) => prev + 1);

      showToast(
        "Pré-visualização do PDF reprocessada e atualizada com sucesso!",
        "success",
      );
    } catch (err) {
      showToast("Erro ao reprocessar a visualização: " + err, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const clearAllData = () => {
    setSettings(DEFAULT_SETTINGS);
    setBlocks([]);
    setParsedHtml("");
    setContentPages([]);
    setRevisions([]);
    setActiveRevisionId("");

    // Clear localStorage
    localStorage.removeItem("ebook_layout_settings");
    localStorage.removeItem("ebook_layout_blocks");
    localStorage.removeItem("ebook_layout_revisions");
    localStorage.removeItem("ebook_layout_active_id");

    if (fileInputRef.current) fileInputRef.current.value = "";
    if (handoffFileInputRef.current) handoffFileInputRef.current.value = "";

    showToast(
      "Tudo limpo com sucesso! Pronto para processar o seu novo e-book.",
      "success",
    );
    setShowClearConfirm(false);
  };

  const resolveOklchToHsla = (cssText: string): string => {
    let result = "";
    let i = 0;
    const len = cssText.length;
    
    while (i < len) {
      if (cssText.substring(i, i + 6) === "oklch(") {
        let parenthesisCount = 1;
        let j = i + 6;
        while (j < len && parenthesisCount > 0) {
          if (cssText[j] === "(") {
            parenthesisCount++;
         } else if (cssText[j] === ")") {
            parenthesisCount--;
          }
          j++;
        }
        
        const inner = cssText.substring(i + 6, j - 1).trim();
        
        if (inner.includes("from ") || inner.includes("var(")) {
          result += "rgba(128, 128, 128, 0.5)";
        } else {
          const normalized = inner.replace(/\s*\/\s*/, " ");
          const parts = normalized.split(/\s+/).filter(Boolean);
          if (parts.length >= 3) {
            let lVal = parseFloat(parts[0]);
            if (parts[0].includes("%")) {
              lVal = lVal / 100;
            }
            
            let cVal = parseFloat(parts[1]);
            if (parts[1].includes("%")) {
              cVal = cVal / 100;
            }
            
            let hVal = parseFloat(parts[2]);
            if (isNaN(hVal)) hVal = 0;
            
            let alpha = "1";
            if (parts.length >= 4) {
              alpha = parts[3].trim();
            }
            
            const lightness = Math.round(lVal * 100);
            const saturation = Math.min(100, Math.round((cVal / 0.4) * 100));
            const hue = Math.round(hVal);
            
            result += `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
          } else {
            result += "rgba(128, 128, 128, 0.5)";
          }
        }
        i = j;
      } else {
        result += cssText[i];
        i++;
      }
    }
    return result;
  };

  const getOklchFreeStyleString = (): string => {
    let combinedCss = "";
    
    try {
      for (let i = 0; i < document.styleSheets.length; i++) {
        const sheet = document.styleSheets[i];
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (rules) {
            for (let j = 0; j < rules.length; j++) {
              combinedCss += rules[j].cssText + "\n";
            }
          }
        } catch (e) {
          // Safe cross-origin block ignore
        }
      }
    } catch (e) {
      console.warn("Failed reading sheets:", e);
    }

    try {
      const styles = document.querySelectorAll("style");
      styles.forEach((style) => {
        combinedCss += (style.textContent || "") + "\n";
      });
    } catch (e) {
      console.warn("Failed reading style tags:", e);
    }

    return resolveOklchToHsla(combinedCss);
  };

  const exportEpub = async () => {
    if (blocks.length === 0) {
      showToast("Nenhum conteúdo para exportar. Por favor, adicione capítulos primeiro.", "error");
      return;
    }
    
    setIsExportingEpub(true);
    try {
      const { generateEpub } = await import('./utils/epubGenerator');
      
      const doc = new DOMParser().parseFromString(parsedHtml, "text/html");
      const chapters: { title: string, htmlBody: string }[] = [];
      
      let currentTitle = "Capítulo 1";
      let currentBody = "";
      
      const elements = Array.from(doc.body.children);
      for (const el of elements) {
        const isChapterOpener = el.tagName.toLowerCase() === 'div' && el.classList.contains('chapter-opener');
        const isH1 = el.tagName.toLowerCase() === 'h1';
        
        if (isChapterOpener || isH1) {
          if (currentBody.trim().length > 0) {
              chapters.push({ title: currentTitle, htmlBody: currentBody });
          }
          currentTitle = el.textContent || `Capítulo ${chapters.length + 1}`;
          currentBody = el.outerHTML;
        } else {
          currentBody += el.outerHTML;
        }
      }
      
      if (currentBody.trim().length > 0) {
        chapters.push({ title: currentTitle, htmlBody: currentBody });
      }

      let coverHtml = "";
      if (settings.title) {
        coverHtml = `<div style="text-align: center; margin-top: 20%;">
           <h1 style="font-size: 3em;">${settings.title}</h1>
           <h2>${settings.subtitle || ''}</h2>
           <h3>${settings.brand || settings.professionalName || ''}</h3>
        </div>`;
      }

      const epubBlob = await generateEpub({
        title: settings.title || "E-book",
        author: settings.professionalName || settings.brand || "Autor",
        chapters: chapters,
        coverHtml: coverHtml
      });
      
      const url = URL.createObjectURL(epubBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${settings.title ? settings.title.replace(/[^a-zA-Z0-9]/gi, '_').toLowerCase() : 'ebook'}.epub`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast("EPUB gerado com sucesso!", "success");
    } catch (err: any) {
      console.error(err);
      showToast("Erro ao gerar EPUB.", "error");
    } finally {
      setIsExportingEpub(false);
    }
  };

  const printPdf = async () => {
    if (blocks.length === 0) {
      showToast(
        "Nenhum conteúdo para exportar. Por favor, adicione capítulos primeiro.",
        "error",
      );
      return;
    }

    setIsExportingPdf(true);
    showToast("Gerando PDF direto de alta fidelidade... Aguarde um momento.", "info");

    try {
      const { jsPDF } = await import("jspdf");
      const html2canvas = (await import("html2canvas")).default;

      // Calculate active layout values based on densityMode to feed static styles to html2canvas,
      // bypassing css custom properties engine which fails in html2canvas
      let bodyFontSize = '11.5pt';
      let bodyLineHeight = '1.5';
      let h1FontSize = '2.3rem';
      let h2FontSize = '1.6rem';
      let paraMargin = '1.1rem';
      
      if (settings.densityMode === 'compact') {
        bodyFontSize = '10pt';
        bodyLineHeight = '1.35';
        h1FontSize = '1.8rem';
        h2FontSize = '1.3rem';
        paraMargin = '0.7rem';
      } else if (settings.densityMode === 'premium') {
        bodyFontSize = '12.5pt';
        bodyLineHeight = '1.6';
        h1FontSize = '2.6rem';
        h2FontSize = '1.8rem';
        paraMargin = '1.4rem';
      }

      const primaryColor = settings.primaryColor || '#245C5A';
      const secondaryColor = settings.secondaryColor || '#C9826B';
      const accentColor = settings.accentColor || '#6F8F9A';
      const bgColor = settings.backgroundColor || '#FAF8F4';
      const fontFamily = settings.fontFamily ? `${settings.fontFamily}, sans-serif` : 'Inter, sans-serif';
      const fontDisplay = settings.fontDisplay ? `${settings.fontDisplay}, sans-serif` : 'Poppins, sans-serif';

      // Pre-extract stylesheet rules as oklch-free standard CSS to prevent CORS and OKLCH rendering crashes
      const cleanCss = getOklchFreeStyleString();

      // Find all `.page` elements in the exclusive offscreen render container
      let container = document.getElementById("pdf-render-offscreen");
      if (!container) {
        // Fallback to searching the main preview if offscreen container isn't in DOM yet
        container = document.querySelector(".ebook-preview-container") as HTMLElement;
      }

      if (!container) {
        throw new Error("Contêiner de visualização não encontrado.");
      }

      const pages = container.querySelectorAll(".page");
      if (pages.length === 0) {
        throw new Error("Nenhuma página pré-visualizada encontrada para exportação.");
      }

      // Initialize A4 Portrait PDF: 210mm x 297mm
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const pdfWidth = 210;
      const pdfHeight = 297;

      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i] as HTMLElement;
        
        // Show progress toast
        if (pages.length > 2) {
          showToast(`Exportando página ${i + 1} de ${pages.length}...`, "info");
        }

        const canvas = await html2canvas(pageEl, {
          scale: 2, // high quality
          useCORS: true,
          logging: false,
          allowTaint: true,
          backgroundColor: settings.backgroundColor || "#FAF8F4",
          windowWidth: 794,  // 210mm in pixels at 96 DPI
          scrollX: 0,
          scrollY: 0,
          onclone: (clonedDoc) => {
            // 1. Reset offscreen container to static relative layout to allow html2canvas to compute coordinates beautifully
            const clonedOffscreen = clonedDoc.getElementById("pdf-render-offscreen");
            if (clonedOffscreen) {
              clonedOffscreen.style.position = "static";
              clonedOffscreen.style.left = "0";
              clonedOffscreen.style.top = "0";
              clonedOffscreen.style.margin = "0";
              clonedOffscreen.style.width = "210mm";
              clonedOffscreen.style.height = "auto";
              clonedOffscreen.style.overflow = "visible";
              clonedOffscreen.style.opacity = "1";
            }

            // 2. Remove conflicting CSS links and style tag blocks to prevent color parsing errors in html2canvas
            const styledLinks = clonedDoc.querySelectorAll("link[rel='stylesheet'], style");
            styledLinks.forEach((el) => {
              if (el.tagName.toLowerCase() === "link") {
                const href = el.getAttribute("href") || "";
                if (!href.includes("fonts.googleapis.com") && !href.includes("fonts.gstatic.com")) {
                  el.remove();
                }
              } else {
                el.remove();
              }
            });

            // 3. Inject our oklch-free inline css string alongside critical block layout overrides for html2canvas compatibility
            const layoutOverrides = `
              :root, .page, .ebook-preview-container {
                --color-brand-petroleo: ${primaryColor} !important;
                --color-brand-terracota: ${secondaryColor} !important;
                --color-brand-azul: ${accentColor} !important;
                --color-brand-areia: ${bgColor} !important;
                --color-brand-offwhite: ${bgColor} !important;
                --font-sans: ${fontFamily} !important;
                --font-display: ${fontDisplay} !important;
                --ebook-body-size: ${bodyFontSize} !important;
                --ebook-line-height: ${bodyLineHeight} !important;
                --ebook-h1-size: ${h1FontSize} !important;
                --ebook-h2-size: ${h2FontSize} !important;
                --ebook-para-margin: ${paraMargin} !important;
              }
              .page {
                display: block !important;
                position: relative !important;
                width: 210mm !important;
                height: 297mm !important;
                max-height: 297mm !important;
                box-sizing: border-box !important;
                padding: 25mm 20mm !important;
                overflow: hidden !important;
                background-color: ${bgColor} !important;
                font-family: ${fontFamily} !important;
                line-height: ${bodyLineHeight} !important;
              }
              .ebook-content {
                display: block !important;
                width: 100% !important;
                height: auto !important;
                max-height: 228mm !important;
                overflow: hidden !important;
                font-size: ${bodyFontSize} !important;
                line-height: ${bodyLineHeight} !important;
              }
              .footer-print {
                position: absolute !important;
                bottom: 25mm !important;
                left: 20mm !important;
                width: 170mm !important;
                margin-top: 0 !important;
                box-sizing: border-box !important;
              }
              .header-print {
                display: block !important;
                width: 100% !important;
                box-sizing: border-box !important;
              }
              /* Avoid any text lines or character metrics cuts inside content items */
              .ebook-content h1 {
                font-size: ${h1FontSize} !important;
                line-height: 1.25 !important;
                margin-bottom: ${paraMargin} !important;
                font-family: ${fontDisplay} !important;
                color: ${primaryColor} !important;
              }
              .ebook-content h2 {
                font-size: ${h2FontSize} !important;
                line-height: 1.3 !important;
                margin-bottom: calc(${paraMargin} * 0.8) !important;
                font-family: ${fontDisplay} !important;
                color: ${primaryColor} !important;
              }
              .ebook-content h3 {
                font-size: calc(${h2FontSize} * 0.8) !important;
                line-height: 1.3 !important;
                margin-bottom: calc(${paraMargin} * 0.6) !important;
                font-family: ${fontDisplay} !important;
                color: ${accentColor} !important;
              }
              .ebook-content p, .ebook-content li {
                font-size: ${bodyFontSize} !important;
                line-height: ${bodyLineHeight} !important;
                margin-bottom: ${paraMargin} !important;
                vertical-align: top !important;
              }
              /* Ensure boxes style properly inside pdf rendering flow */
              .box-reflexao {
                background-color: ${bgColor} !important;
                border: 1px solid var(--color-brand-linha) !important;
                padding: 1.5rem !important;
                border-radius: 8px !important;
                margin: 1.5rem 0 !important;
              }
              .box-informativo {
                background-color: var(--color-brand-informativo) !important;
                padding: 1.5rem !important;
                border-radius: 8px !important;
                margin: 1.5rem 0 !important;
              }
              .box-cuidado {
                background-color: var(--color-brand-cuidado) !important;
                padding: 1.5rem !important;
                border-radius: 8px !important;
                margin: 1.5rem 0 !important;
              }
            `;
            const styleEl = clonedDoc.createElement("style");
            styleEl.textContent = cleanCss + "\n" + layoutOverrides;
            clonedDoc.head.appendChild(styleEl);

            // 4. Clean any remaining inline oklch attributes inside elements for ultimate fallback
            clonedDoc.querySelectorAll("[style]").forEach((el) => {
              const elHtml = el as HTMLElement;
              let inlineStyle = elHtml.getAttribute("style") || "";
              if (inlineStyle.includes("oklch")) {
                elHtml.setAttribute("style", resolveOklchToHsla(inlineStyle));
              }
            });
          }
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.95);

        if (i > 0) {
          doc.addPage();
        }

        // Add to page
        doc.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
      }

      // Format filename using settings.title preserving case and letters, removing accents
      const rawTitle = settings.title || "Ebook";
      
      const removeAccents = (str: string): string => {
        return str
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[çÇ]/g, (match) => match === 'ç' ? 'c' : 'C');
      };

      const sanitizeFilename = (title: string): string => {
        const base = removeAccents(title);
        // Remove illegal filesystem characters
        return base
          .replace(/[\\\/:\*\?"<>|]/g, "")
          .trim();
      };

      const baseFilename = sanitizeFilename(rawTitle) || "Ebook";

      // Track export version in localStorage based on core base name (case-insensitive key)
      const storageKey = `ebook_export_version_${baseFilename.toLowerCase()}`;
      const currentVersionStr = localStorage.getItem(storageKey);
      const version = currentVersionStr ? parseInt(currentVersionStr, 10) : 1;

      // Update version count for next time
      localStorage.setItem(storageKey, String(version + 1));

      doc.save(`${baseFilename}_v${version}.pdf`);
      showToast("E-book exportado para PDF com de absoluto sucesso!", "success");
    } catch (err: any) {
      console.error(err);
      showToast(`Ocorreu um erro ao exportar: ${err.message || err}`, "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col print:bg-white print:m-0">
      {/* HEADER (No Print) */}
      <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 no-print sticky top-0 z-50 shadow-xs">
        <div className="flex flex-wrap items-center justify-between md:justify-start gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#245C5A] flex items-center justify-center shrink-0 shadow-xs">
              <BookOpen size={16} className="text-[#F4EFE7]" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm font-display font-semibold text-[#2F3437] tracking-tight leading-tight">
                Gerador de E-books
              </h1>
              <span className="text-[9px] font-mono text-gray-400" id="header-build-version">
                Build {buildVersionStr}
              </span>
            </div>
          </div>

          {/* TAB SYSTEM (Compact and organized) */}
          <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200/50">
            <button
              onClick={() => setActiveTab("content")}
              className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-all flex items-center gap-1.5 ${activeTab === "content" ? "bg-white shadow-xs text-[#245C5A]" : "text-gray-500 hover:text-gray-800"}`}
            >
              <FileText size={13} />
              <span>Conteúdo</span>
            </button>
            <button
              onClick={() => setActiveTab("visual")}
              className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-all flex items-center gap-1.5 ${activeTab === "visual" ? "bg-white shadow-xs text-[#245C5A]" : "text-gray-500 hover:text-gray-800"}`}
            >
              <Palette size={13} />
              <span>Visual & Design</span>
            </button>
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-all flex items-center gap-1.5 ${activeTab === "preview" ? "bg-white shadow-xs text-[#245C5A]" : "text-gray-500 hover:text-gray-800"}`}
            >
              <CheckCircle size={13} />
              <span>Visualizar & PDF</span>
            </button>
          </div>
        </div>

        {/* OPERATIONS (Compact, size-reduced and grouped) */}
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <CloudSync 
            settings={settings} 
            blocks={blocks} 
            setSettings={setSettings} 
            setBlocks={setBlocks} 
            showToast={showToast} 
          />
          
          <div className="h-4 w-[1px] bg-gray-200 mx-1 hidden md:block"></div>
          
          <button
            onClick={() => setShowClearConfirm(true)}
            className="h-8 px-2 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 bg-white border border-red-200 rounded-md transition-colors flex items-center gap-1"
            title="Limpar todos os dados e começar um novo e-book"
          >
            <Trash2 size={13} />
            <span className="hidden sm:inline">Limpar</span>
          </button>
          
          <div className="h-4 w-[1px] bg-gray-200 mx-1 hidden md:block"></div>

          <button
            onClick={exportEpub}
            disabled={blocks.length === 0 || isExportingEpub}
            className="h-8 px-3 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            title={
              blocks.length === 0
                ? "Adicione conteúdo antes de exportar"
                : isExportingEpub
                  ? "Exportando EPUB..."
                  : "Exportar para EPUB"
            }
          >
            {isExportingEpub ? (
              <>
                <RefreshCw size={12} className="animate-spin" />
                <span>Gerando...</span>
              </>
            ) : (
              <>
                <BookOpen size={13} className="shrink-0" />
                <span>Exportar EPUB</span>
              </>
            )}
          </button>
          <button
            onClick={printPdf}
            disabled={blocks.length === 0 || isExportingPdf}
            className="h-8 px-3 text-xs font-bold text-white bg-[#245C5A] hover:bg-[#1b4342] rounded-md transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            title={
              blocks.length === 0
                ? "Adicione conteúdo antes de exportar"
                : isExportingPdf
                  ? "Exportando PDF..."
                  : "Exportar para PDF"
            }
          >
            {isExportingPdf ? (
              <>
                <RefreshCw size={12} className="animate-spin" />
                <span>Gerando...</span>
              </>
            ) : (
              <>
                <Download size={13} className="shrink-0" />
                <span>Exportar PDF</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-auto p-6 no-print">
        <div className="max-w-7xl mx-auto">
          {/* TAB: CONTENT UPLOAD */}
          {activeTab === "content" && (
            <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center">
                <div className="w-16 h-16 bg-[#F4EFE7] text-[#245C5A] rounded-full flex items-center justify-center mx-auto mb-4 shadow-xs">
                  <FileText size={32} />
                </div>
                <h2 className="text-xl font-display font-semibold text-[#2F3437] mb-2">
                  Importar Arquivos de Conteúdo
                </h2>
                <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                  Selecione arquivos .md ou .txt contendo o texto do e-book.
                  Eles são limpos automaticamente de marcadores técnicos
                  obsoletos ou de distribuição.
                </p>

                <div className="flex justify-center gap-3">
                  <label
                    id="upload-content-btn"
                    className="cursor-pointer bg-[#245C5A] hover:bg-[#1b4342] text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm inline-flex items-center"
                  >
                    <Upload size={16} className="mr-2" /> Upload de Capítulos
                    <input
                      type="file"
                      multiple
                      accept=".md,.txt"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                    />
                  </label>
                  <button
                    id="add-manual-btn"
                    onClick={addManualBlock}
                    className="bg-white border-2 border-[#245C5A] text-[#245C5A] hover:bg-gray-50 px-5 py-2.5 rounded-lg text-sm font-bold transition-colors inline-flex items-center"
                  >
                    <Plus size={16} className="mr-2" /> Bloco Manual
                  </button>
                </div>
              </div>

              {blocks.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-display font-semibold text-[#2F3437] flex items-center justify-between border-b border-gray-100 pb-2">
                    <span>
                      Ordem e Sequenciamento ({blocks.length} blocos)
                    </span>
                  </h3>

                  {blocks.map((block, index) => (
                    <div
                      key={block.id}
                      className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
                    >
                      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-1 rounded">
                            #{index + 1}
                          </div>
                          <span className="font-medium text-[#2F3437] text-sm">
                            {block.filename}
                          </span>
                        </div>
                        <button
                          onClick={() => removeBlock(block.id)}
                          className="text-red-500 hover:text-red-700 p-1 rounded transition-colors"
                          title="Remover bloco"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="p-0">
                        <textarea
                          value={block.content}
                          onChange={(e) =>
                            updateBlockContent(block.id, e.target.value)
                          }
                          className="w-full h-40 focus:ring-0 border-0 p-4 font-mono text-xs resize-y text-gray-700 bg-white"
                          placeholder="Insira ou comente o markdown do capítulo aqui..."
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: VISUAL LAYOUT & DESIGN */}
          {activeTab === "visual" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-7xl mx-auto">
              {/* LEFT COLUMN: VISUAL PARAMETERS LISTING & SPECIFICATION LOADER (7 columns) */}
              <div className="lg:col-span-7 space-y-6">
                {/* SPECIFICATION SYNC CARD */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex items-center gap-2 text-[#245C5A] mb-3">
                    <Palette size={20} />
                    <h3 className="text-lg font-display font-semibold">
                      Configuração Visual (.md)
                    </h3>
                  </div>

                  <p className="text-xs text-gray-500 mb-5 leading-relaxed font-sans">
                    Importe um arquivo de especificações/handoff (como{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">EBOOK_VISUAL_HANDOFF.md</code>) para preencher os
                    metadados, marca, autoria e avisos automáticos do e-book de forma global e instantânea.
                  </p>

                  <div className="mb-6">
                    <label
                      id="upload-visual-btn-tab"
                      className="cursor-pointer bg-[#F4EFE7] hover:bg-[#ebdcc3] text-[#245C5A] border border-[#C9D8D5] px-4 py-3 rounded-lg font-semibold transition-all shadow-xs inline-flex items-center justify-center w-full text-xs h-10"
                    >
                      <Upload size={14} className="mr-1.5" /> Carregar Especificações Visual .md
                      <input
                        type="file"
                        accept=".md,.txt"
                        className="hidden"
                        ref={handoffFileInputRef}
                        onChange={handleHandoffUpload}
                      />
                    </label>
                  </div>

                  <div className="border-t border-gray-100 pt-5 space-y-4">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Parâmetros Visuais de Estilo Carregados:
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-[#FAF8F4] p-3 rounded-lg border border-gray-100/70 text-xs">
                        <span className="text-gray-400 block mb-1">Título Principal</span>
                        <span className="font-semibold text-gray-800 break-words" title={settings.title}>
                          {settings.title || "Não importado"}
                        </span>
                      </div>
                      <div className="bg-[#FAF8F4] p-3 rounded-lg border border-gray-100/70 text-xs">
                        <span className="text-gray-400 block mb-1">Subtítulo</span>
                        <span className="font-semibold text-gray-800 break-words" title={settings.subtitle}>
                          {settings.subtitle || "Não importado"}
                        </span>
                      </div>
                      <div className="bg-[#FAF8F4] p-3 rounded-lg border border-gray-100/70 text-xs">
                        <span className="text-gray-400 block mb-1">Marca / Identidade</span>
                        <span className="font-semibold text-gray-800 break-words">
                          {settings.brand || "Não importada"}
                        </span>
                      </div>
                      <div className="bg-[#FAF8F4] p-3 rounded-lg border border-gray-100/70 text-xs">
                        <span className="text-gray-400 block mb-1">Autor(a)</span>
                        <span className="font-semibold text-gray-800 break-words">
                          {settings.professionalName || "Não importado"}
                        </span>
                      </div>
                      <div className="bg-[#FAF8F4] p-3 rounded-lg border border-gray-100/70 text-xs">
                        <span className="text-gray-400 block mb-1">Título Profissional</span>
                        <span className="font-semibold text-gray-500 break-words">
                          {settings.professionalTitle || "Não importado"}
                        </span>
                      </div>
                      <div className="bg-[#FAF8F4] p-3 rounded-lg border border-gray-100/70 text-xs">
                        <span className="text-gray-400 block mb-1">Conselho / Registro</span>
                        <span className="font-semibold text-[#8A4D3B] break-words">
                          {settings.professionalReg || "Não importado"}
                        </span>
                      </div>
                      <div className="bg-[#FAF8F4] p-3 rounded-lg border border-gray-100/70 text-xs">
                        <span className="text-gray-400 block mb-1">Site Oficial</span>
                        <span className="font-semibold text-[#245C5A] break-words">
                          {settings.website || "Não importado"}
                        </span>
                      </div>
                      <div className="bg-[#FAF8F4] p-3 rounded-lg border border-gray-100/70 text-xs">
                        <span className="text-gray-400 block mb-1">Tipo de Material</span>
                        <span className="font-semibold text-gray-800 break-words">
                          {settings.materialType || "Não importado"}
                        </span>
                      </div>
                      <div className="bg-[#FAF8F4] p-3 rounded-lg border border-gray-100/70 text-xs">
                        <span className="text-gray-400 block mb-1">Público-Alvo</span>
                        <span className="font-semibold text-gray-800 break-words">
                          {settings.targetAudience || "Não importado"}
                        </span>
                      </div>
                      <div className="bg-[#FAF8F4] p-3 rounded-lg border border-gray-100/70 text-xs md:col-span-2">
                        <span className="text-gray-400 block mb-1">Texto do Cabeçalho</span>
                        <span className="font-semibold text-gray-800 break-words">
                          {settings.headerText || "Texto padrão"} {settings.descriptiveHeader ? "(Com nome do capítulo)" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: REVISION HISTORY (5 columns) */}
              <div className="lg:col-span-5 space-y-6">
                {/* REVISIONS HISTORY CARD */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-[#245C5A]">
                      <History size={20} />
                      <h3 className="text-lg font-display font-semibold">
                        Histórico de Versões
                      </h3>
                    </div>
                    <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {revisions.length} arquivos
                    </span>
                  </div>

                  <p className="text-xs text-gray-400 mb-4 leading-relaxed font-sans">
                    Selecione ou alterne livremente entre as versões dos arquivos de design carregados na sessão. As configurações do PDF serão recarregadas instantaneamente.
                  </p>

                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {revisions.map((rev) => {
                      const isActive = rev.id === activeRevisionId;
                      return (
                        <div
                          key={rev.id}
                          onClick={() => applyRevision(rev)}
                          className={`group relative p-3 rounded-lg border text-left transition-all cursor-pointer ${
                            isActive
                              ? "bg-[#DDE8E5] border-[#245C5A] shadow-xs"
                              : "bg-white border-gray-100 hover:border-gray-200"
                          }`}
                        >
                          <div className="flex items-start justify-between pr-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <FileText
                                  size={14}
                                  className={
                                    isActive
                                      ? "text-[#245C5A]"
                                      : "text-gray-400"
                                  }
                                />
                                <span
                                  className={`text-sm font-semibold break-words whitespace-normal leading-tight ${isActive ? "text-[#245C5A] font-bold" : "text-gray-700"}`}
                                >
                                  {rev.filename}
                                </span>
                              </div>
                              <p className="text-[10px] text-gray-400 font-mono">
                                Importado em: {rev.uploadedAt}
                              </p>
                            </div>

                            {isActive ? (
                              <span className="text-[10px] bg-[#245C5A] text-white px-2 py-0.5 rounded font-mono uppercase font-bold tracking-wider shrink-0 ml-1">
                                Ativo
                              </span>
                            ) : (
                              <button
                                onClick={(e) => deleteRevision(rev.id, e)}
                                className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-2 p-1 rounded-md"
                                title="Excluir do histórico"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {revisions.length === 0 && (
                      <div className="text-center py-6 text-gray-400 text-sm">
                        Nenhuma versão anterior cadastrada.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: PREVIEW & EXPORT */}
          {activeTab === "preview" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* CHECKLIST */}
              <div className="bg-[#FAF8F4] border border-[#C9D8D5] p-6 rounded-xl shadow-sm mb-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                  <h3 className="text-lg font-display font-bold text-[#245C5A] flex items-center">
                    <CheckCircle className="mr-2" /> Opções de Exportação
                  </h3>

                  <div
                    className="mt-4 sm:mt-0 flex flex-wrap items-end justify-end gap-3"
                    id="export-controls-container"
                  >
                    <span className="hidden"></span>
                    <div className="flex items-center gap-2 bg-white border border-gray-300 px-3 py-1.5 rounded-md h-[40px] shadow-xs hover:border-[#245C5A] transition-colors">
                      <input
                        type="checkbox"
                        id="generate-toc-checkbox"
                        checked={settings.generateToc !== false}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            generateToc: e.target.checked,
                          })
                        }
                        className="w-4 h-4 text-[#245C5A] focus:ring-[#245C5A] border-gray-300 rounded cursor-pointer animate-pulse"
                      />
                      <label
                        htmlFor="generate-toc-checkbox"
                        className="text-xs font-bold text-[#245C5A] cursor-pointer select-none"
                      >
                        Página de Sumário
                      </label>
                    </div>
                    <div
                      className="flex flex-col items-start text-left"
                      id="select-wrap-inner-group"
                    >
                      <label className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">
                        Modo de Distribuição (Páginas)
                      </label>
                      <select
                        value={settings.densityMode}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            densityMode: e.target.value as any,
                          })
                        }
                        className="border border-gray-300 rounded-md p-2 focus:ring-[#245C5A] focus:border-[#245C5A] text-sm bg-white"
                        id="density-select-el"
                      >
                        <option value="compact">
                          Compacto (menos páginas)
                        </option>
                        <option value="comfortable">
                          Confortável (padrão)
                        </option>
                        <option value="premium">Premium (mais respiro)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-[#2F3437]">
                  <div className="flex items-center gap-2">
                    <CheckCircle
                      size={16}
                      className={
                        blocks.length > 0 ? "text-green-600" : "text-gray-300"
                      }
                    />{" "}
                    Conteúdo importado
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle
                      size={16}
                      className={
                        parsedHtml.toLowerCase().includes("aviso importante") ||
                        parsedHtml.toLowerCase().includes("aviso educativo")
                          ? "text-green-600"
                          : "text-yellow-500"
                      }
                    />{" "}
                    Aviso Educativo detectado no texto
                  </div>

                  {/* Check for remaining 'Parte 1' artifacts */}
                  {parsedHtml.match(/Parte\s+\d+/i) ? (
                    <div className="flex items-center gap-2 text-red-600 font-medium col-span-1 sm:col-span-2 mt-2">
                      <AlertTriangle size={16} /> Atenção: O texto ainda pode
                      conter menções residuais como "Parte 1". Verifique.
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 col-span-1 sm:col-span-2 mt-2">
                      <CheckCircle size={16} className="text-green-600" />{" "}
                      Nenhuma marcação técnica (Parte 1/Bloco 1) aparente
                      encontrada.
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={exportEpub}
                    disabled={blocks.length === 0 || isExportingEpub}
                    className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-sm flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      blocks.length === 0
                        ? "Adicione conteúdo antes de exportar"
                        : isExportingEpub
                          ? "Exportando EPUB..."
                          : "Exportar para EPUB"
                    }
                  >
                    {isExportingEpub ? (
                      <>
                        <RefreshCw size={20} className="mr-2 animate-spin" />
                        Gerando EPUB...
                      </>
                    ) : (
                      <>
                        <BookOpen size={20} className="mr-2" /> Exportar para EPUB
                      </>
                    )}
                  </button>
                  <button
                    onClick={printPdf}
                    disabled={blocks.length === 0 || isExportingPdf}
                    className="flex-1 bg-[#245C5A] text-white py-3 rounded-lg font-bold hover:bg-[#1b4342] transition-colors shadow-sm flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      blocks.length === 0
                        ? "Adicione conteúdo antes de exportar"
                        : isExportingPdf
                          ? "Exportando PDF..."
                          : "Exportar para PDF (A4)"
                    }
                  >
                    {isExportingPdf ? (
                      <>
                        <RefreshCw size={20} className="mr-2 animate-spin" />
                        Gerando PDF direto (A4)...
                      </>
                    ) : (
                      <>
                        <Download size={20} className="mr-2" /> Exportar para
                        PDF (A4)
                      </>
                    )}
                  </button>
                  <button
                    onClick={reprocessPreview}
                    disabled={blocks.length === 0 || isGenerating}
                    className="flex-1 bg-white border-2 border-[#245C5A] text-[#245C5A] hover:bg-gray-50 py-3 rounded-lg font-bold transition-colors shadow-sm flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      blocks.length === 0
                        ? "Adicione conteúdo antes de reprocessar"
                        : "Reprocessar Pré-visualização do PDF"
                    }
                  >
                    <RefreshCw
                      size={20}
                      className={`mr-2 ${isGenerating ? "animate-spin" : ""}`}
                    />{" "}
                    Reprocessar Pré-visualização do PDF
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-3 text-center">
                  Para gerar o PDF: Selecione 'Salvar como PDF', Tamanho A4,
                  Margens Nenhuma e Ative Gráficos de Fundo.
                </p>
              </div>

              <div className="bg-white border border-gray-200 p-4 rounded-xl text-center">
                <p className="text-sm text-gray-500">
                  Preview visual simulando A4.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* APP OVERALL FOOTER */}
      <footer className="bg-white border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-500 no-print flex flex-col sm:flex-row justify-between items-center gap-2 mt-auto" id="app-overall-footer-el">
        <span className="font-sans">© 2026 Conexão Seres — Editor de E-books Profissional</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-sans">Versão do App:</span>
          <span className="font-mono bg-blue-50 text-blue-700 border border-blue-100 rounded px-2.5 py-0.5 font-bold tracking-wider text-[11px]" id="app-footer-build-version">
            {buildVersionStr}
          </span>
        </div>
      </footer>

      {/* RENDER PREVIEW EXACTLY FOR PRINT OR WHEN IN PREVIEW TAB */}
      <div
        className={`${activeTab === "preview" ? "block" : "hidden print:block"}`}
      >
        <EbookPreview settings={settings} contentPages={contentPages} buildVersion={buildVersionStr} />
      </div>

      {/* Container invisível exclusivo para renderização e exportação direta de PDF */}
      <div
        id="pdf-render-offscreen"
        className="no-print"
        style={{
          position: "fixed",
          top: "0px",
          left: "0px",
          width: "210mm",
          height: "auto",
          overflow: "visible",
          opacity: 0.001,
          zIndex: -9999,
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        <EbookPreview settings={settings} contentPages={contentPages} buildVersion={buildVersionStr} isPrintMode={true} />
      </div>

      {/* GLOBAL NOTIFICATION TOAST */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm max-w-md animate-in slide-in-from-bottom-5 fade-in duration-300 no-print ${
            notification.type === "success"
              ? "bg-[#E6F4EA] border-[#A3E5B7] text-[#137333]"
              : notification.type === "error"
                ? "bg-[#FCE8E6] border-[#FAD2CF] text-[#C5221F]"
                : "bg-[#E8F0FE] border-[#C2E7FF] text-[#1A73E8]"
          }`}
        >
          {notification.type === "success" && <CheckCircle size={18} />}
          {notification.type === "error" && <AlertCircle size={18} />}
          {notification.type === "info" && <BookOpen size={18} />}
          <span className="font-medium font-sans">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-2 hover:opacity-75 transition-opacity"
          >
            <span className="text-xs font-bold font-sans">✕</span>
          </button>
        </div>
      )}

      {/* CLEAR ALL CONFIRMATION MODAL */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[9999] p-4 no-print animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle size={32} className="shrink-0" />
              <h3 className="text-lg font-display font-bold text-gray-900">
                Limpar tudo e começar de novo?
              </h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-6">
              Esta ação irá **remover permanentemente** todo o e-book atualmente
              carregado, suas revisões de layout e todas as definições visuais
              customizadas, resetando tudo para os valores iniciais.
              <br />
              <br />
              Deseja realmente continuar?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={clearAllData}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={16} /> Sim, Limpar Tudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
