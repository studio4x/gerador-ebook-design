import React, { useState, useEffect, useRef } from "react";
import {
  ProjectSettings,
  ContentBlock,
  DEFAULT_SETTINGS,
  EbookProject,
  ContentRevision,
  BlockRevision,
  LocalProject,
} from "./types";
import { parseEbookContent, extractMetadataFromContent } from "./utils/parser";
import { chunkIntoPages } from "./utils/paginator";
import { EbookPreview } from "./components/EbookPreview";
import { VisualSettingsPanel } from "./components/VisualSettingsPanel";
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
  Mail,
  LogIn,
  Edit3,
  ChevronUp,
  ChevronDown,
  Save,
  Clock
} from "lucide-react";

// Import ProjectManager, CloudSync & Firebase Auth
import { ProjectManager } from "./components/ProjectManager";
import { CloudSync } from "./components/CloudSync";
import { auth, signInWithGoogle } from "./lib/firebase";
import { User as SupabaseUser } from "@supabase/supabase-js";

function safeUUID(): string {
  if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "uuid-" + Math.random().toString(36).substring(2, 15) + "-" + Date.now().toString(36);
}

export default function App() {
  const initialSettings: ProjectSettings = {
    title: "Nome do Seu Livro",
    shortTitle: "Nome Curto",
    densityMode: "comfortable",
    subtitle:
      "Subtítulo do seu livro digital",
    supportPhrase: "Uma frase de apoio ou destaque.",
    professionalName: "Seu Nome",
    professionalTitle: "Sua Profissão",
    professionalReg: "Seu Registro",
    brand: "Sua Marca",
    website: "https://seusite.com.br",
    materialType: "E-book educativo",
    targetAudience: "Seu Público Alvo",
    ctaText:
      "Se este material fez sentido para você, talvez seja importante olhar para sua situação de forma mais individualizada.\n\nEntre em contato conosco para saber mais.",
    ctaButtonText: "Falar com a gente",
    contactAddress:
      "Seu Endereço Completo",
    instagram: "@seu.instagram",
    email: "contato@seusite.com.br",
    whatsapp: "https://wa.me/5511999999999",
    schedulingUrl: "https://seusite.com.br/agendar",
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
      "# Handoff Visual — E-book Padrão",
      "",
      "**Título:** Nome do Seu Livro",
      "**Subtítulo:** Subtítulo do seu livro digital",
      "**Modo de Distribuição:** confortável",
      "**Gerar Sumário:** sim",
      "**Borda da Página:** não",
      "**Cabeçalho Descritivo:** sim",
      "**Texto do Cabeçalho:** Sua Marca",
      "**Alinhamento do Cabeçalho:** esquerda",
      "**Texto do Rodapé:** Sua Marca | Livro Digital",
      "**Alinhamento do Rodapé:** esquerda",
      "**Numeração de Página:** direita",
    ].join("\n"),
  };

  const [activeTab, setActiveTab] = useState<"content" | "visual" | "preview">("content");
  
  // Local project list and active project tracking
  const [projectsList, setProjectsList] = useState<LocalProject[]>(() => {
    const savedList = localStorage.getItem("ebook_projects_list");
    if (savedList) {
      try {
        return JSON.parse(savedList);
      } catch (e) {}
    }
    return [];
  });

  const [currentProjectId, setCurrentProjectId] = useState<string>(() => {
    const savedId = localStorage.getItem("ebook_current_project_id");
    return savedId || "default_project";
  });

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
  
  const [expandedBlockRevisions, setExpandedBlockRevisions] = useState<string[]>([]);
  const [contentRevisions, setContentRevisions] = useState<ContentRevision[]>(() => {
    const saved = localStorage.getItem("ebook_content_revisions");
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

  // Authentication and automated emailing states
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [shouldEmailEpub, setShouldEmailEpub] = useState(true);
  const [isSendingEpubEmail, setIsSendingEpubEmail] = useState(false);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);

  // UI states
  const [isExportOptionsOpen, setIsExportOptionsOpen] = useState(false);

  // Sync auth state
  useEffect(() => {
    let active = true;

    auth.getSession().then(({ data: { session } }) => {
      if (active) setUser(session?.user ?? null);
    });

    const { data: { subscription } } = auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // SMTP testing helper
  const testSmtpConnection = async () => {
    setIsTestingSmtp(true);
    showToast("Testando conexão SMTP com o servidor...", "info");
    try {
      const response = await fetch("/api/test-smtp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      const data = await response.json();
      if (response.ok && data.success) {
        showToast("Sucesso! As credenciais SMTP estão corretas e o servidor de e-mail está pronto.", "success");
      } else {
        throw new Error(data.error || "Erro desconhecido ao testar SMTP.");
      }
    } catch (err: any) {
      console.error(err);
      showToast(`Erro na configuração SMTP: ${err.message || err}`, "error");
    } finally {
      setIsTestingSmtp(false);
    }
  };

  // Send email helper
  const sendEmailAttachment = async ({
    to,
    fileName,
    fileBlob,
    contentType,
    subject,
    body
  }: {
    to: string;
    fileName: string;
    fileBlob: Blob;
    contentType: string;
    subject?: string;
    body?: string;
  }) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const rawResult = reader.result as string;
          const base64data = rawResult.split(',')[1];
          const response = await fetch("/api/send-email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              to,
              subject,
              body,
              fileName,
              fileBase64: base64data,
              contentType
            })
          });

          const data = await response.json();
          if (response.ok && data.success) {
            resolve();
          } else {
            reject(new Error(data.error || "Erro ao responder do servidor"));
          }
        } catch (err: any) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Erro ao preparar arquivo base64"));
      reader.readAsDataURL(fileBlob);
    });
  };
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
      try {
        localStorage.setItem("ebook_layout_revisions", JSON.stringify(revisions));
      } catch (e) {
        console.error("Failed to save ebook_layout_revisions to localStorage:", e);
      }
    }
  }, [revisions]);

  useEffect(() => {
    if (activeRevisionId) {
      try {
        localStorage.setItem("ebook_layout_active_id", activeRevisionId);
      } catch (e) {
        console.error("Failed to save ebook_layout_active_id to localStorage:", e);
      }
    }
  }, [activeRevisionId]);

  // Seamless migration of existing data to a local project structure on mount
  useEffect(() => {
    let list = [...projectsList];
    let activeId = currentProjectId;
    let updated = false;

    if (list.length === 0) {
      const defaultProj: LocalProject = {
        id: "default_project",
        title: settings.title || "Ebook Padrão",
        settings: settings,
        blocks: blocks,
        contentRevisions: contentRevisions,
        updatedAt: new Date().toLocaleString("pt-BR")
      };

      list = [defaultProj];
      activeId = "default_project";
      updated = true;
    }

    if (updated) {
      setProjectsList(list);
      setCurrentProjectId(activeId);
      try {
        localStorage.setItem("ebook_projects_list", JSON.stringify(list));
        localStorage.setItem("ebook_current_project_id", activeId);
      } catch (e) {
        console.error("Failed to migrate initial project:", e);
      }
    }
  }, []);

  // Unify auto-saving of active project's state to local storage and projects list
  useEffect(() => {
    if (!currentProjectId) return;

    setProjectsList(prevList => {
      const exists = prevList.some(p => p.id === currentProjectId);
      let updatedList = [...prevList];

      if (exists) {
        updatedList = prevList.map(p => {
          if (p.id === currentProjectId) {
            const nextTitle = settings.title || p.title || "Sem título";
            // Check if actual differences exist to prevent redundant updates
            if (
              p.title !== nextTitle ||
              JSON.stringify(p.settings) !== JSON.stringify(settings) ||
              JSON.stringify(p.blocks) !== JSON.stringify(blocks) ||
              JSON.stringify(p.contentRevisions) !== JSON.stringify(contentRevisions)
            ) {
              return {
                ...p,
                title: nextTitle,
                settings,
                blocks,
                contentRevisions,
                updatedAt: new Date().toLocaleString("pt-BR")
              };
            }
          }
          return p;
        });
      } else {
        updatedList.push({
          id: currentProjectId,
          title: settings.title || "Ebook Padrão",
          settings,
          blocks,
          contentRevisions,
          updatedAt: new Date().toLocaleString("pt-BR")
        });
      }

      if (JSON.stringify(prevList) !== JSON.stringify(updatedList)) {
        try {
          localStorage.setItem("ebook_projects_list", JSON.stringify(updatedList));
        } catch (e) {
          console.error("Failed to save projects list to localStorage:", e);
        }
        return updatedList;
      }
      return prevList;
    });

    try {
      localStorage.setItem("ebook_layout_settings", JSON.stringify(settings));
      localStorage.setItem("ebook_layout_blocks", JSON.stringify(blocks));
      localStorage.setItem("ebook_content_revisions", JSON.stringify(contentRevisions));
      localStorage.setItem("ebook_current_project_id", currentProjectId);
    } catch (e) {
      console.error("Erro ao salvar dados do projeto ativo:", e);
    }
  }, [settings, blocks, contentRevisions, currentProjectId]);

  // Project operation helpers
  const createNewProject = (title: string = "") => {
    const newId = safeUUID();
    const finalTitle = title.trim() || `E-book ${projectsList.length + 1}`;
    
    const newProject: LocalProject = {
      id: newId,
      title: finalTitle,
      settings: {
        ...settings, // Herda as definições visuais, marca e dados do autor globais do projeto ativo
        title: finalTitle,
        shortTitle: finalTitle.substring(0, 20),
        subtitle: "", // Inicia com o subtítulo em branco para o novo livro
      },
      blocks: [
        {
          id: safeUUID(),
          filename: "Introdução",
          content: "# Introdução\n\nComece a escrever o conteúdo do seu novo e-book aqui...",
          originalContent: "",
          isEdited: false,
        }
      ],
      contentRevisions: [],
      updatedAt: new Date().toLocaleString("pt-BR")
    };

    const updatedList = [...projectsList, newProject];
    setProjectsList(updatedList);
    try {
      localStorage.setItem("ebook_projects_list", JSON.stringify(updatedList));
    } catch (e) {
      console.error("Failed to create new project:", e);
    }

    setCurrentProjectId(newId);
    setSettings(newProject.settings);
    setBlocks(newProject.blocks);
    setContentRevisions([]);
    setActiveTab("content");
    
    showToast(`Projeto "${finalTitle}" criado com sucesso!`, "success");
  };

  const switchProject = (projectId: string) => {
    const proj = projectsList.find(p => p.id === projectId);
    if (!proj) {
      showToast("Projeto não encontrado.", "error");
      return;
    }

    const savedList = projectsList.map(p => {
      if (p.id === currentProjectId) {
        return {
          ...p,
          title: settings.title || p.title,
          settings,
          blocks,
          contentRevisions,
          updatedAt: new Date().toLocaleString("pt-BR")
        };
      }
      return p;
    });
    setProjectsList(savedList);
    try {
      localStorage.setItem("ebook_projects_list", JSON.stringify(savedList));
    } catch (e) {
      console.error("Failed to save state during switch:", e);
    }

    setCurrentProjectId(projectId);
    setSettings(proj.settings);
    setBlocks(proj.blocks);
    setContentRevisions(proj.contentRevisions || []);
    
    showToast(`Carregado: "${proj.title}"`, "success");
  };

  const renameProject = (projectId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    
    const updatedList = projectsList.map(p => {
      if (p.id === projectId) {
        const nextSettings = p.id === currentProjectId ? { ...settings, title: newTitle } : { ...p.settings, title: newTitle };
        if (p.id === currentProjectId) {
          setSettings(nextSettings);
        }
        return {
          ...p,
          title: newTitle,
          settings: nextSettings,
          updatedAt: new Date().toLocaleString("pt-BR")
        };
      }
      return p;
    });

    setProjectsList(updatedList);
    try {
      localStorage.setItem("ebook_projects_list", JSON.stringify(updatedList));
    } catch (e) {
      console.error("Failed to rename project:", e);
    }
    showToast("Projeto renomeado!", "success");
  };

  const deleteProject = (projectId: string) => {
    if (projectsList.length <= 1) {
      showToast("Você precisa ter pelo menos um projeto ativo.", "error");
      return;
    }

    const projToDelete = projectsList.find(p => p.id === projectId);
    if (!confirm(`Deseja realmente excluir o projeto "${projToDelete?.title || "este e-book"}" localmente? Esta ação não pode ser desfeita.`)) return;

    const updatedList = projectsList.filter(p => p.id !== projectId);
    setProjectsList(updatedList);
    try {
      localStorage.setItem("ebook_projects_list", JSON.stringify(updatedList));
    } catch (e) {
      console.error("Failed to delete project:", e);
    }

    if (currentProjectId === projectId) {
      const remainingProj = updatedList[0];
      setCurrentProjectId(remainingProj.id);
      setSettings(remainingProj.settings);
      setBlocks(remainingProj.blocks);
      setContentRevisions(remainingProj.contentRevisions || []);
    }

    showToast("Projeto excluído localmente.", "success");
  };

  // Intercept Close/Reload attempts and handle tab visibility to keep PDF export active
  useEffect(() => {
    let wakeLock: any = null;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isExportingPdf) {
        const msg = "A geração do seu PDF de alta fidelidade está em andamento. Para garantir que o PDF seja finalizado e salvo com sucesso, por favor mantenha esta aba aberta.";
        e.preventDefault();
        e.returnValue = msg;
        return msg;
      }
    };

    const acquireWakeLock = async () => {
      if (isExportingPdf && 'wakeLock' in navigator) {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.log("Wake Lock acquired successfully.");
        } catch (err) {
          console.warn("Failed to acquire Screen Wake Lock:", err);
        }
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLock) {
        try {
          await wakeLock.release();
          console.log("Wake Lock released.");
        } catch (err) {
          console.error("Error releasing Wake Lock:", err);
        }
        wakeLock = null;
      }
    };

    if (isExportingPdf) {
      window.addEventListener("beforeunload", handleBeforeUnload);
      acquireWakeLock();
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      releaseWakeLock();
    };
  }, [isExportingPdf]);

  // Build version is statically defined corresponding to the workspace/app structure deployment
  const buildVersionStr = "v1.4.132";

  // 1. Extract content metadata when blocks change, guarding against infinite loops with a 500ms debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (blocks.length > 0) {
        const isVisualEditsOnly = blocks.length === 1 && blocks[0].filename === "Edições Visuais.md";
        const hasFrontmatter = isVisualEditsOnly && /^---\r?\n[\s\S]*?\r?\n---/.test(blocks[0].content);

        const contentMetadata = extractMetadataFromContent(blocks);

        if (isVisualEditsOnly && !hasFrontmatter) {
          return;
        }
        
        const cleanMetadata = Object.fromEntries(
          Object.entries(contentMetadata).filter(([_, value]) => {
            if (value === undefined || value === null) return false;
            if (typeof value === "string" && value.trim() === "") return false;
            return true;
          })
        );

        if (Object.keys(cleanMetadata).length > 0) {
          setSettings((prev) => {
            let hasChange = false;
            const merged = { ...prev };
            for (const key of Object.keys(cleanMetadata) as Array<
              keyof ProjectSettings
            >) {
              if (prev[key] !== cleanMetadata[key]) {
                (merged as any)[key] = cleanMetadata[key];
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
        id: safeUUID(),
        filename: file.name,
        content: text,
        originalContent: text,
        isEdited: false,
      });
    }

    setBlocks((prev) => [...prev, ...newBlocks]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addManualBlock = () => {
    setBlocks((prev) => [
      ...prev,
      {
        id: safeUUID(),
        filename: `Bloco Manual ${prev.length + 1}`,
        content: "",
        originalContent: "",
        isEdited: false,
      },
    ]);
  };

  const updateBlockContent = (id: string, content: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, content, isEdited: true, updatedAt: new Date().toLocaleString("pt-BR") } : b)));
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const saveBlockRevision = (id: string, content: string) => {
    setBlocks((prev) => prev.map((b) => {
      if (b.id === id) {
        const newRevision: BlockRevision = {
          id: safeUUID(),
          timestamp: new Date().toLocaleString("pt-BR"),
          content: content,
        };
        return {
          ...b,
          revisions: [newRevision, ...(b.revisions || [])]
        };
      }
      return b;
    }));
    showToast("Revisão do bloco salva com sucesso!", "success");
  };

  const restoreBlockRevision = (blockId: string, revision: BlockRevision) => {
    if (!confirm("Isso irá substituir o conteúdo atual do bloco pela revisão selecionada. Deseja continuar?")) return;
    
    setBlocks((prev) => prev.map((b) => {
      if (b.id === blockId) {
        return {
          ...b,
          content: revision.content,
          isEdited: true,
          updatedAt: new Date().toLocaleString("pt-BR"),
        };
      }
      return b;
    }));
    showToast("Revisão do bloco restaurada!", "success");
  };

  const toggleBlockRevisions = (blockId: string) => {
    setExpandedBlockRevisions(prev => 
      prev.includes(blockId) ? prev.filter(id => id !== blockId) : [...prev, blockId]
    );
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

      const newRevId = safeUUID();
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

  const reprocessPreview = async (overrideSettings?: ProjectSettings | React.MouseEvent | any) => {
    // If it's a DOM event (e.click), ignore it
    const isMouseEvent = overrideSettings && (overrideSettings.nativeEvent || overrideSettings.target);
    const newSettings = (overrideSettings && !isMouseEvent) ? overrideSettings as ProjectSettings : undefined;

    setIsGenerating(true);
    try {
      // 1. Extract metadata from content
      const isVisualEditsOnly = blocks.length === 1 && blocks[0].filename === "Edições Visuais.md";
      const hasFrontmatter = isVisualEditsOnly && /^---\r?\n[\s\S]*?\r?\n---/.test(blocks[0].content);

      const contentMetadata = extractMetadataFromContent(blocks);

      const cleanMetadata = Object.fromEntries(
        Object.entries(contentMetadata).filter(([key, value]) => {
          if (value === undefined || value === null) return false;
          if (typeof value === "string" && value.trim() === "") return false;
          // Protect from visual edits without frontmatter trying to overwrite settings
          if (isVisualEditsOnly && !hasFrontmatter) return false;
          return true;
        })
      );

      let merged: ProjectSettings;

      if (newSettings) {
        // User clicked "Salvar" in Visual Settings Panel!
        // The newSettings represent the absolute truth of what the settings should be right now.
        // We DO NOT want the old markdown content to overwrite these new edits immediately.
        merged = {
            ...settings, // Preserve base settings
            ...cleanMetadata,
            ...newSettings, // Explicit user UI overrides win!
        } as ProjectSettings;
      } else {
        // Normal reprocessing (e.g., text changed, or initial load)
        merged = {
            ...settings, // Current settings
            ...cleanMetadata, // New markdown metadata wins!
        } as ProjectSettings;
      }

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

  const handleRestoreDefaultVisuals = () => {
    if (confirm("Deseja realmente restaurar as definições visuais para os padrões? Não afetará seu conteúdo.")) {
      const contentMetadata = extractMetadataFromContent(blocks);
      setSettings({
        ...DEFAULT_SETTINGS,
        ...contentMetadata
      });
      showToast("Definições visuais restauradas.", "success");
    }
  };

  const createContentRevision = (source: ContentRevision["source"], label?: string) => {
    if (blocks.length === 0) return;

    const newRevision: ContentRevision = {
      id: safeUUID(),
      label: label || `Revisão de conteúdo`,
      createdAt: new Date().toLocaleString("pt-BR"),
      source,
      settings,
      blocks: JSON.parse(JSON.stringify(blocks)),
    };

    setContentRevisions((prev) => [newRevision, ...prev].slice(0, 20));
  };

  const restoreContentRevision = (revision: ContentRevision) => {
    if (!confirm(`Restaurar a revisão "${revision.label}" de ${revision.createdAt}? O estado atual será substituído.`)) {
      return;
    }

    setSettings(revision.settings);
    setBlocks(revision.blocks);
    setReprocessTrigger((prev) => prev + 1);
    showToast("Revisão de conteúdo restaurada com sucesso!", "success");
  };

  const deleteContentRevision = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setContentRevisions((prev) => prev.filter((rev) => rev.id !== id));
    showToast("Revisão de conteúdo excluída.", "success");
  };

  /**
   * handleContentUpdateFromPreview
   * 
   * Estratégia de Salvamento de Edições Visuais Integrada (WYSIWYG -> Markdown):
   * Para assegurar estabilidade máxima de renderização e consistência do compilador PDF/EPUB,
   * unificamos as alterações de conteúdo realizadas interativamente em um único bloco central ("Edições Visuais.md").
   * 
   * Garantias de Estabilidade e Filtros Aplicados:
   * 1. Sem Duplicidade de Conteúdo: Os nós de quebra manual de página (.manual-page-break) NÃO são inseridos
   *    pelo paginator no fluxo das páginas ativas, garantindo que o Turndown converta apenas os delimitadores normais, 
   *    evitando replicação parasitária no Markdown após múltiplos salvamentos.
   * 2. Detecção de Capítulos Nativa: A marcação de abertura de capítulos (.chapter-opener, .chapter-number) é 
   *    desembrulhada e convertida de volta para títulos Markdown padronizados h1 (ex: "# Capítulo 1: Título"), permitindo
   *    que o sumário/TOC dinâmico continue funcionando perfeitamente em futuros reprocessamentos.
   * 3. Boxes Sem Bordas Duplicadas: Decoradores visuais como .box-reflexao, .box-informativo e .box-cuidado são
   *    desembrulhados e filtrados de forma a preservar apenas seus textos puros durante a conversão reversa, prevenindo
   *    a anidação de divs internas após salvar sucessivas vezes.
   * 4. Integridade das Quebras Manuais: Quebras manuais de página permanecem salvas de forma integra no formato nativo
   *    como "<!-- page-break -->" ou "[=== QUEBRA DE PÁGINA MANUAL ===]".
   * 5. Sem Degradação de Markdown: A conversão entre HTML renderizado e Markdown obedece a regras restritas do Turndown,
   *    permitindo salvar infinitas vezes o fluxo sem perda de conteúdo ou replicação de estilos.
   */
  const handleContentUpdateFromPreview = (newMarkdown: string) => {
    createContentRevision("visual-editor", "Antes de salvar edição visual");

    const escapeYamlValue = (value?: string) =>
      String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');

    const buildFrontmatterFromSettings = (settingsObj: ProjectSettings): string => {
      const lines = [
        "---",
        `title: "${escapeYamlValue(settingsObj.title)}"`,
        `subtitle: "${escapeYamlValue(settingsObj.subtitle)}"`,
        `autora: "${escapeYamlValue(settingsObj.professionalName)}"`,
        `credencial: "${escapeYamlValue(
          [settingsObj.professionalTitle, settingsObj.professionalReg].filter(Boolean).join(" — ")
        )}"`,
        `instituicao: "${escapeYamlValue(settingsObj.brand)}"`,
        `website: "${escapeYamlValue(settingsObj.website)}"`,
        `ctatext: "${escapeYamlValue(settingsObj.ctaText)}"`,
        `warning: "${escapeYamlValue(settingsObj.educationalWarning)}"`,
        "---",
        ""
      ];
      return lines.join("\n");
    };

    const frontmatter = buildFrontmatterFromSettings(settings);
    const markdownBody = newMarkdown.replace(/^---\r?\n[\s\S]*?\r?\n---\s*/m, "");
    const markdownWithFrontmatter = `${frontmatter}${markdownBody.trimStart()}`;

    setBlocks((prev) => {
      let mergedBlock = prev.length === 1 && prev[0].filename === "Edições Visuais.md" ? prev[0] : null;
      let newRevisions = [];
      if (mergedBlock) {
         newRevisions = mergedBlock.revisions || [];
         const isDuplicate = newRevisions.length > 0 && newRevisions[newRevisions.length - 1].content === mergedBlock.content;
         if (!isDuplicate) {
             newRevisions = [...newRevisions, { id: safeUUID(), timestamp: new Date().toLocaleString("pt-BR"), content: mergedBlock.content }];
         }
      }
      return [{
        id: mergedBlock ? mergedBlock.id : safeUUID(),
        filename: "Edições Visuais.md",
        content: markdownWithFrontmatter,
        isEdited: true,
        updatedAt: new Date().toLocaleString("pt-BR"),
        revisions: newRevisions
      }];
    });
    setReprocessTrigger((prev) => prev + 1);
    showToast("Edições visuais salvas no conteúdo com sucesso!", "success");
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
        if (el.tagName.toLowerCase() === 'div' && (el.classList.contains('manual-page-break') || el.getAttribute('data-page-break') === 'true')) {
          continue; // Ignore manual page breaks in EPUB
        }

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
      
      showToast("EPUB gerado com sucesso para download!", "success");

      // Auto-email copy to logged-in user if selected
      if (user && user.email && shouldEmailEpub) {
        setIsSendingEpubEmail(true);
        showToast("Enviando ePUB para seu e-mail...", "info");
        try {
          await sendEmailAttachment({
            to: user.email,
            fileName: `${settings.title ? settings.title.replace(/[^a-zA-Z0-9]/gi, '_').toLowerCase() : 'ebook'}.epub`,
            fileBlob: epubBlob,
            contentType: "application/epub+zip",
            subject: `Seu E-book em EPUB: ${settings.title || 'Ebook'}`,
            body: `Olá!\n\nSeu E-book "${settings.title || 'E-book'}" foi gerado com sucesso pelo aplicativo Gerador de E-books e segue em anexo como arquivo EPUB.\n\nAtenciosamente,\nEquipe de Suporte`
          });
          showToast("EPUB enviado com sucesso para seu e-mail!", "success");
        } catch (mailErr: any) {
          console.error("Erro ao enviar e-mail com EPUB:", mailErr);
          showToast(`EPUB baixado com sucesso, mas o envio por e-mail falhou: ${mailErr.message || mailErr}`, "error");
        } finally {
          setIsSendingEpubEmail(false);
        }
      }
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
    showToast("Gerando PDF real de alta fidelidade via servidor... Aguarde um momento.", "info");

    try {
      // Calculate active layout values based on densityMode to feed static styles
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

      const cleanCss = getOklchFreeStyleString();

      let container = document.getElementById("pdf-render-offscreen");
      if (!container) {
        container = document.querySelector(".ebook-preview-container") as HTMLElement;
      }

      if (!container) {
        throw new Error("Contêiner de visualização não encontrado.");
      }

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
        .ebook-content:has(.chapter-opener) {
          display: flex !important;
          flex-direction: column !important;
          justify-content: center !important;
          height: 228mm !important;
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

      let documentStyles = "";
      const styleElements = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"));
      for (const el of styleElements) {
        if (el.tagName.toLowerCase() === "style") {
          documentStyles += el.innerHTML + "\n";
        } else if (el.tagName.toLowerCase() === "link") {
          const href = (el as HTMLLinkElement).href;
          try {
            if (href.startsWith(window.location.origin) || href.startsWith("/")) {
              const res = await fetch(href);
              const cssText = await res.text();
              documentStyles += cssText + "\n";
            } else {
              // For external stylesheets like Google Fonts, we can leave them as imports
              // but we already inject Google Fonts in the backend template.
            }
          } catch (e) {
            console.warn("Failed to fetch stylesheet", href);
          }
        }
      }

      const finalCss = documentStyles + "\n" + cleanCss + "\n" + layoutOverrides;
      
      const clone = container.cloneNode(true) as HTMLElement;
      clone.removeAttribute("id");
      clone.removeAttribute("style");
      clone.removeAttribute("aria-hidden");
      clone.classList.remove("no-print");
      const htmlContent = clone.outerHTML;

      const response = await fetch("/api/export-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
          html: htmlContent, 
          css: finalCss,
          fontFamily: settings.fontFamily,
          fontDisplay: settings.fontDisplay
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Erro no servidor ao gerar PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const rawTitle = settings.title || "Ebook";
      
      const removeAccents = (str: string): string => {
        return str
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[çÇ]/g, (match) => match === 'ç' ? 'c' : 'C');
      };

      const sanitizeFilename = (title: string): string => {
        const base = removeAccents(title);
        return base
          .replace(/[\\\/:\*\?"<>|]/g, "")
          .trim();
      };

      const baseFilename = sanitizeFilename(rawTitle) || "Ebook";

      const storageKey = `ebook_export_version_${baseFilename.toLowerCase()}`;
      const currentVersionStr = localStorage.getItem(storageKey);
      const version = currentVersionStr ? parseInt(currentVersionStr, 10) : 1;

      localStorage.setItem(storageKey, String(version + 1));

      const pdfFileName = `${baseFilename}_v${version}.pdf`;
      
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfFileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      showToast("PDF gerado com sucesso para download!", "success");

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

          {/* Project Manager Selector */}
          <ProjectManager
            projectsList={projectsList}
            currentProjectId={currentProjectId}
            onSwitchProject={switchProject}
            onCreateProject={createNewProject}
            onRenameProject={renameProject}
            onDeleteProject={deleteProject}
          />

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
                      <div className="p-0 border-b border-gray-100">
                        <textarea
                          value={block.content}
                          onChange={(e) =>
                            updateBlockContent(block.id, e.target.value)
                          }
                          className="w-full h-40 focus:ring-0 border-0 p-4 font-mono text-xs resize-y text-gray-700 bg-white"
                          placeholder="Insira ou comente o markdown do capítulo aqui..."
                        />
                      </div>
                      <div className="bg-gray-50/50 px-4 py-2.5 flex items-center justify-between">
                        <button
                          onClick={() => saveBlockRevision(block.id, block.content)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-[#245C5A] hover:text-[#1b4342] bg-[#E8F1F0] px-3 py-1.5 rounded-md transition-colors"
                        >
                          <Save size={14} />
                          Salvar Alterações
                        </button>
                        
                        {(block.revisions && block.revisions.length > 0) && (
                          <button
                            onClick={() => toggleBlockRevisions(block.id)}
                            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                          >
                            <Clock size={14} />
                            {block.revisions.length} {block.revisions.length === 1 ? 'revisão' : 'revisões'}
                            {expandedBlockRevisions.includes(block.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                      </div>
                      
                      {expandedBlockRevisions.includes(block.id) && block.revisions && (
                        <div className="bg-gray-50 border-t border-gray-200 p-4 max-h-48 overflow-y-auto space-y-2">
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Histórico de Versões do Bloco</h4>
                          {block.revisions.map((rev) => (
                            <div key={rev.id} className="flex items-center justify-between bg-white border border-gray-200 p-2.5 rounded-lg">
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-gray-700">{rev.timestamp}</span>
                                <span className="text-[10px] text-gray-400 font-mono truncate max-w-[200px]">{rev.id.split('-')[0]}</span>
                              </div>
                              <button
                                onClick={() => restoreBlockRevision(block.id, rev)}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                              >
                                <History size={12} />
                                Restaurar
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* SECTION: CONTENT REVISIONS HISTORY */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 pb-4 mb-4">
                  <div className="flex items-center gap-2">
                    <History className="text-[#245C5A]" size={20} />
                    <div>
                      <h3 className="text-lg font-display font-semibold text-[#2F3437]">
                        Histórico de Revisões do Conteúdo
                      </h3>
                      <p className="text-xs text-gray-500">
                        {contentRevisions.length} {contentRevisions.length === 1 ? "revisão salva" : "revisões salvas"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => createContentRevision("manual", "Revisão manual")}
                    disabled={blocks.length === 0}
                    className="bg-[#245C5A] hover:bg-[#1b4342] disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm inline-flex items-center gap-1.5 self-start sm:self-center"
                  >
                    <Plus size={14} />
                    Criar revisão agora
                  </button>
                </div>

                {contentRevisions.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    <History className="mx-auto mb-2 opacity-40" size={32} />
                    Nenhuma revisão do conteúdo foi criada ainda. 
                    <p className="text-xs text-gray-400 mt-1">
                      Crie uma revisão manual ou faça edições visuais no preview para salvamentos automáticos.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {contentRevisions.map((rev) => (
                      <div 
                        key={rev.id} 
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 hover:bg-gray-100/70 rounded-lg border border-gray-200 transition-colors gap-3"
                      >
                        <div className="space-y-1 block text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm text-[#2F3437]">
                              {rev.label}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                              rev.source === 'visual-editor' 
                                ? 'bg-blue-100 text-blue-700' 
                                : rev.source === 'manual' 
                                ? 'bg-green-100 text-green-700' 
                                : rev.source === 'upload' 
                                ? 'bg-purple-100 text-[#5B21B6]' 
                                : 'bg-amber-100 text-[#92400E]'
                            }`}>
                              {rev.source === 'visual-editor' ? 'Editor Visual' :
                               rev.source === 'manual' ? 'Revisão Manual' :
                               rev.source === 'upload' ? 'Upload' : 'Restauração'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            Criada em: <span className="font-medium text-gray-700">{rev.createdAt}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button
                            onClick={() => restoreContentRevision(rev)}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw size={12} />
                            Restaurar
                          </button>
                          <button
                            onClick={(e) => deleteContentRevision(rev.id, e)}
                            className="p-1.5 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            title="Excluir"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: VISUAL LAYOUT & DESIGN */}
          {activeTab === "visual" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-7xl mx-auto">
              {/* LEFT COLUMN: VISUAL PARAMETERS LISTING & SPECIFICATION LOADER (7 columns) */}
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
                  <div className="flex items-center gap-2 text-[#245C5A] mb-3">
                    <Palette size={20} />
                    <h3 className="text-lg font-display font-semibold">
                      Definições Visuais
                    </h3>
                  </div>

                  <p className="text-xs text-gray-500 mb-5 leading-relaxed font-sans">
                    Edite as configurações de design manualmente ou importe um arquivo de handoff (como{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">EBOOK_VISUAL_HANDOFF.md</code>) para preencher rapidamente.
                  </p>

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
                
                <VisualSettingsPanel 
                  settings={settings} 
                  setSettings={setSettings} 
                  onApply={reprocessPreview} 
                  onRestoreDefault={handleRestoreDefaultVisuals} 
                />
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
                <div 
                  className="flex flex-col sm:flex-row justify-between items-start sm:items-center cursor-pointer select-none"
                  onClick={() => setIsExportOptionsOpen(!isExportOptionsOpen)}
                >
                  <h3 className="text-lg font-display font-bold text-[#245C5A] flex items-center">
                    <CheckCircle className="mr-2" /> Opções de Exportação
                    {isExportOptionsOpen ? <ChevronUp size={20} className="ml-2 text-[#245C5A]"/> : <ChevronDown size={20} className="ml-2 text-[#245C5A]"/>}
                  </h3>
                </div>

                {isExportOptionsOpen && (
                  <div className="mt-6 animate-in slide-in-from-top-2 duration-200">
                    <div
                      className="flex flex-wrap items-end justify-start sm:justify-end gap-3 mb-6"
                      id="export-controls-container"
                    >
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

                {/* Email Delivery Options */}
                <div className="mt-6 bg-[#FAF8F4]/80 border border-gray-200 rounded-xl p-5 shadow-xs">
                  <div className="flex items-center justify-between gap-4 mb-3 border-b border-gray-100 pb-2 flex-wrap">
                    <h4 className="text-sm font-display font-semibold text-[#245C5A] flex items-center gap-2">
                      <Mail size={16} /> Opções de Envio Automático por E-mail
                    </h4>
                    <button
                      onClick={testSmtpConnection}
                      disabled={isTestingSmtp}
                      className="text-[11px] font-mono font-bold text-[#245C5A] hover:bg-[#245C5A]/5 border border-[#245C5A]/30 px-2.5 py-1 rounded bg-white transition-all disabled:opacity-50 cursor-pointer select-none"
                      title="Testa a conexão e credenciais do seu servidor SMTP configurado nas variáveis de ambiente"
                    >
                      {isTestingSmtp ? "Testando conexão..." : "Testar Conexão SMTP"}
                    </button>
                  </div>
                  {user ? (
                    <div className="space-y-3 animate-in fade-in duration-200">
                      <p className="text-xs text-gray-700 leading-relaxed">
                        Detectamos que você está logado como <strong className="text-[#245C5A]">{user.email}</strong>. 
                        Durante a geração de EPUB, enviaremos o anexo diretamente para sua caixa de entrada. A exportação em PDF é gerada diretamente pelo nosso motor vetorial no servidor, garantindo texto selecionável e de alta qualidade.
                      </p>
                      <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
                        <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-gray-800 hover:text-blue-700 select-none">
                          <input
                            type="checkbox"
                            checked={shouldEmailEpub}
                            onChange={(e) => setShouldEmailEpub(e.target.checked)}
                            className="rounded border-gray-400 text-blue-600 focus:ring-blue-500 h-4 w-4 bg-white"
                          />
                          <span>Enviar cópia em EPUB</span>
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-gray-600 leading-relaxed">
                      <div className="flex-1">
                        Deseja receber os arquivos de alta resolução (PDF e EPUB) diretamente no seu e-mail? <strong>Faça login</strong> usando sua conta Google para ativar o envio automático.
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const { error } = await signInWithGoogle();
                            if (error) throw error;
                          } catch (err: any) {
                            showToast("Erro ao fazer login: " + err.message, "error");
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 hover:border-[#245C5A] rounded-lg transition-all cursor-pointer shadow-2xs shrink-0 select-none"
                      >
                        <LogIn size={13} className="text-[#245C5A]" /> Entrar com Google
                      </button>
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
                        {isSendingEpubEmail ? "Enviando ePUB..." : "Gerando EPUB..."}
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
                          : "Exportar para PDF"
                    }
                  >
                    {isExportingPdf ? (
                      <>
                        <RefreshCw size={20} className="mr-2 animate-spin" />
                        {isExportingPdf ? "Gerando PDF..." : "Exportar para PDF"}
                      </>
                    ) : (
                      <>
                        <Download size={20} className="mr-2" /> Exportar para PDF
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
              </div>
              )}
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
        <span className="font-sans">© {new Date().getFullYear()} Gerador de E-books Design — Editor Profissional</span>
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
        <EbookPreview settings={settings} contentPages={contentPages} buildVersion={buildVersionStr} onContentUpdate={handleContentUpdateFromPreview} />
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
