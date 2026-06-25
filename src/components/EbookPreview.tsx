import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ProjectSettings, DEFAULT_SETTINGS } from '../types';
import TurndownService from 'turndown';
import { chunkIntoPages } from '../utils/paginator';
import { 
  BookOpen, 
  Eye, 
  Columns, 
  Grid, 
  Search, 
  ZoomIn, 
  ZoomOut, 
  PanelLeftClose, 
  PanelLeftOpen, 
  X, 
  Sparkles, 
  Info, 
  Heart, 
  HelpCircle,
  FileText,
  Edit3,
  Save,
  Bold,
  Italic,
  Underline,
  Heading1,
  Heading2,
  Heading3,
  Scissors,
  Maximize,
  Minimize,
  Undo,
  Redo
} from 'lucide-react';

interface EbookPreviewProps {
  settings: ProjectSettings;
  contentPages: string[];
  buildVersion?: string;
  isPrintMode?: boolean;
  onContentUpdate?: (newMarkdown: string) => void;
}

interface TocEntry {
  title: string;
  pageNumber: number;
  isChapter: boolean;
  domId: string;
  level?: number;
}

export function EbookPreview({ settings, contentPages, buildVersion, isPrintMode = false, onContentUpdate }: EbookPreviewProps) {
  const [viewMode, setViewMode] = useState<'scroll' | 'book' | 'grid'>(isPrintMode ? 'scroll' : 'scroll');
  const [zoom, setZoom] = useState<number>(isPrintMode ? 100 : 55);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(isPrintMode ? false : true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isEditingVisual, setIsEditingVisual] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const editorRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  const [localContentPages, setLocalContentPages] = useState<string[] | null>(null);

  const activeContentPages = (isEditingVisual && localContentPages) ? localContentPages : contentPages;

  type VisualSnapshot = {
    htmlByPage: Record<number, string>;
    contentPages: string[];
  };

  const visualUndoStackRef = useRef<VisualSnapshot[]>([]);
  const visualRedoStackRef = useRef<VisualSnapshot[]>([]);

  function captureVisualSnapshot(): VisualSnapshot {
    const htmlByPage: Record<number, string> = {};
    Object.keys(editorRefs.current)
      .sort((a, b) => Number(a) - Number(b))
      .forEach((key) => {
        const ref = editorRefs.current[Number(key)];
        if (ref) {
          htmlByPage[Number(key)] = ref.innerHTML;
        }
      });
    return { htmlByPage, contentPages: [...activeContentPages] };
  }

  function serializeEditorDomToMarkdown(): string {
     let fullHtml = '';
     Object.keys(editorRefs.current).sort((a,b) => Number(a) - Number(b)).forEach(key => {
        const ref = editorRefs.current[Number(key)];
        if (ref) {
          const clone = ref.cloneNode(true) as HTMLElement;
          const breaks = clone.querySelectorAll('.manual-page-break, [data-page-break="true"]') as NodeListOf<HTMLElement>;
          breaks.forEach(el => {
             const marker = document.createElement("p");
             marker.textContent = "[=== QUEBRA DE PÁGINA MANUAL ===]";
             el.replaceWith(marker);
          });
          fullHtml += clone.innerHTML + '\n\n';
        }
     });

     const turndownService = new TurndownService({
         headingStyle: 'atx',
         bulletListMarker: '-',
         emDelimiter: '*'
     });
     
     // Custom Turndown rules to unwrap visual decorators safely
     turndownService.addRule('pagebreaks', {
         filter: function (node) {
             return (
                 node.nodeName === 'DIV' &&
                 (node.classList.contains('manual-page-break') || node.getAttribute('data-page-break') === 'true')
             );
         },
         replacement: function () {
             return '\n\n[=== QUEBRA DE PÁGINA MANUAL ===]\n\n';
         }
     });

     turndownService.addRule('chapterOpener', {
         filter: function (node) {
             return node.nodeName === 'DIV' && node.classList.contains('chapter-opener');
         },
         replacement: function (content, node) {
             const h1 = node.querySelector('h1');
             const numDiv = node.querySelector('.chapter-number');
             const title = h1 ? h1.textContent?.trim() : '';
             const num = numDiv ? numDiv.textContent?.trim() : '';
             
             let headerText = '';
             if (num && title) {
                 const cleanNum = num.replace(/^0+/, ''); // "01" -> "1"
                 headerText = `# Capítulo ${cleanNum}: ${title}`;
             } else if (title) {
                 headerText = `# ${title}`;
             } else {
                 headerText = `# ${content.trim()}`;
             }
             return '\n\n' + headerText + '\n\n';
         }
     });

     turndownService.addRule('chapterNumber', {
         filter: function (node) {
             return node.nodeName === 'DIV' && node.classList.contains('chapter-number');
         },
         replacement: function () {
             return '';
         }
     });

     turndownService.addRule('fraseCentral', {
         filter: function (node) {
             return node.nodeName === 'DIV' && node.classList.contains('frase-central');
         },
         replacement: function (content) {
             const trimmed = content.trim();
             if (!trimmed) return '';
             const lines = trimmed.split('\n').map(line => `> ${line}`).join('\n');
             return '\n\n' + lines + '\n\n';
         }
     });

     turndownService.addRule('unwrapBoxes', {
         filter: function (node) {
             return (
                 node.nodeName === 'DIV' &&
                 (node.classList.contains('box-reflexao') || 
                  node.classList.contains('box-informativo') || 
                  node.classList.contains('box-cuidado'))
             );
         },
         replacement: function (content) {
             return '\n\n' + content + '\n\n';
         }
     });
     
     turndownService.keep(['span', 'u']);
     
     let markdown = turndownService.turndown(fullHtml);
     markdown = markdown
       .replace(/\n{3,}/g, "\n\n")
       .replace(/\[===\s*QUEBRA DE PÁGINA MANUAL\s*===\]/gi, "\n\n[=== QUEBRA DE PÁGINA MANUAL ===]\n\n");
     return markdown;
  }

  function restoreVisualSnapshot(snapshot: VisualSnapshot) {
    if (snapshot.contentPages) {
      setLocalContentPages(snapshot.contentPages);
    }
    setTimeout(() => {
      Object.entries(snapshot.htmlByPage).forEach(([key, html]) => {
        const ref = editorRefs.current[Number(key)];
        if (ref) {
          ref.innerHTML = html;
        }
      });
    }, 50);

    // Não chamar onContentUpdate aqui.
  }

  const execVisualCommand = (command: string, value: string = '') => {
    // Save snapshot of current state before applying formatting
    visualUndoStackRef.current.push(captureVisualSnapshot());
    visualRedoStackRef.current = [];
    
    document.execCommand(command, false, value);
    
    // Não chamar onContentUpdate aqui.
    // O conteúdo será consolidado apenas em "Salvar & Voltar".
  };

  const isCursorAtEndOfEditable = (editable: HTMLElement): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;

    const range = sel.getRangeAt(0);
    if (!range.collapsed || !editable.contains(range.startContainer)) return false;

    const afterRange = range.cloneRange();
    afterRange.selectNodeContents(editable);
    afterRange.setStart(range.endContainer, range.endOffset);

    const afterText = afterRange.toString().replace(/\u00a0/g, " ").trim();

    const afterFragment = afterRange.cloneContents();
    const temp = document.createElement("div");
    temp.appendChild(afterFragment);

    const hasMeaningfulElementAfter = Array.from(temp.querySelectorAll("*")).some((el) => {
      const htmlEl = el as HTMLElement;
      const text = (htmlEl.textContent || "").replace(/\u00a0/g, " ").trim();
      const isBreak = htmlEl.classList.contains("manual-page-break") || htmlEl.dataset.pageBreak === "true";
      return text.length > 0 && !isBreak;
    });

    return afterText.length === 0 && !hasMeaningfulElementAfter;
  };

  const hasTrailingManualBreak = (html: string): boolean => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const body = doc.body;
    const candidates = Array.from(body.querySelectorAll(".manual-page-break, [data-page-break='true']"));

    if (candidates.length === 0) return false;

    const lastBreak = candidates[candidates.length - 1];
    let node: Node | null = lastBreak.nextSibling;

    while (node) {
      if (node.textContent?.replace(/\u00a0/g, " ").trim()) return false;
      node = node.nextSibling;
    }

    return true;
  };

  const repaginateLocalEditors = () => {
    const htmls: string[] = [];
    Object.keys(editorRefs.current)
      .sort((a, b) => Number(a) - Number(b))
      .forEach((key) => {
        const ref = editorRefs.current[Number(key)];
        if (ref) {
          htmls.push(ref.innerHTML);
        }
      });
    const joinedHtml = htmls.join("\n");
    const paginatedPages = chunkIntoPages(joinedHtml, settings.densityMode);
    setLocalContentPages(paginatedPages);
  };

  const normalizeManualBreaksForClipboard = (html: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const breaks = doc.querySelectorAll(".manual-page-break, [data-page-break='true']");
    breaks.forEach((br) => {
      const marker = doc.createElement("p");
      marker.textContent = "[=== QUEBRA DE PÁGINA MANUAL ===]";
      br.replaceWith(marker);
    });

    return doc.body.innerHTML;
  };

  const restoreManualBreaksFromPastedHtml = (html: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    Array.from(doc.body.querySelectorAll("p, div, span")).forEach((el) => {
      const text = el.textContent?.trim() || "";
      if (
        text === "[=== QUEBRA DE PÁGINA MANUAL ===]" ||
        text === "<!-- page-break -->"
      ) {
        const div = document.createElement("div");
        div.className = "manual-page-break";
        div.setAttribute("data-page-break", "true");
        div.innerHTML = "&nbsp;";
        div.style.borderTop = "2px dashed #C9826B";
        div.style.margin = "20px 0";
        div.style.position = "relative";
        div.style.display = "block";
        div.style.width = "100%";
        div.contentEditable = "false";
        el.replaceWith(div);
      }
    });

    return doc.body.innerHTML;
  };

  const HIGHLIGHT_BLOCK_SELECTOR =
    ".frase-central, blockquote, .box-reflexao, .box-informativo, .box-cuidado";

  const getClosestHighlightBlock = (node: Node | null): HTMLElement | null => {
    if (!node) return null;

    const el =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : node.parentElement;

    return el?.closest(HIGHLIGHT_BLOCK_SELECTOR) as HTMLElement | null;
  };

  const highlightBlockToMarkdown = (el: HTMLElement): string => {
    const text = (el.textContent || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");

    if (!text) return "";

    return text
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  };

  const normalizeHighlightBlocksForClipboard = (html: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const blockquotes = doc.querySelectorAll("blockquote");
    blockquotes.forEach((bq) => {
      const div = doc.createElement("div");
      div.className = "frase-central";
      div.innerHTML = bq.innerHTML;
      bq.replaceWith(div);
    });

    return doc.body.innerHTML;
  };

  const convertMarkdownBlockquoteTextToHtml = (text: string): string | null => {
    const lines = text.split(/\r?\n/);
    const quoteLines = lines
      .filter((line) => line.trim().startsWith(">"))
      .map((line) => line.replace(/^>\s?/, "").trim())
      .filter(Boolean);

    if (quoteLines.length === 0) return null;

    const content = quoteLines.map((line) => `<p>${line}</p>`).join("");

    return `<div class="frase-central">${content}</div>`;
  };

  const handleEditorCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const startBlock = getClosestHighlightBlock(range.startContainer);
    const endBlock = getClosestHighlightBlock(range.endContainer);

    if (startBlock && startBlock === endBlock) {
      const html = startBlock.outerHTML;
      const markdown = highlightBlockToMarkdown(startBlock);

      e.clipboardData.setData("text/html", html);
      e.clipboardData.setData("text/plain", markdown);
      e.preventDefault();
      return;
    }

    const container = document.createElement("div");
    container.appendChild(range.cloneContents());

    let normalizedHtml = normalizeHighlightBlocksForClipboard(container.innerHTML);
    normalizedHtml = normalizeManualBreaksForClipboard(normalizedHtml);

    const plainText = normalizedHtml
      .replace(/<p>\s*\[=== QUEBRA DE PÁGINA MANUAL ===\]\s*<\/p>/gi, "\n\n[=== QUEBRA DE PÁGINA MANUAL ===]\n\n")
      .replace(/<[^>]+>/g, "")
      .trim();

    e.clipboardData.setData("text/html", normalizedHtml);
    e.clipboardData.setData("text/plain", plainText);
    e.preventDefault();
  };

  const handleEditorCut = (e: React.ClipboardEvent<HTMLDivElement>, contentIdx: number) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const startBlock = getClosestHighlightBlock(range.startContainer);
    const endBlock = getClosestHighlightBlock(range.endContainer);

    visualUndoStackRef.current.push(captureVisualSnapshot());
    visualRedoStackRef.current = [];

    if (startBlock && startBlock === endBlock) {
      const html = startBlock.outerHTML;
      const markdown = highlightBlockToMarkdown(startBlock);

      e.clipboardData.setData("text/html", html);
      e.clipboardData.setData("text/plain", markdown);

      startBlock.remove();
      repaginateLocalEditors();

      e.preventDefault();
      return;
    }

    const container = document.createElement("div");
    container.appendChild(range.cloneContents());

    let normalizedHtml = normalizeHighlightBlocksForClipboard(container.innerHTML);
    normalizedHtml = normalizeManualBreaksForClipboard(normalizedHtml);

    const plainText = normalizedHtml
      .replace(/<p>\s*\[=== QUEBRA DE PÁGINA MANUAL ===\]\s*<\/p>/gi, "\n\n[=== QUEBRA DE PÁGINA MANUAL ===]\n\n")
      .replace(/<[^>]+>/g, "")
      .trim();

    e.clipboardData.setData("text/html", normalizedHtml);
    e.clipboardData.setData("text/plain", plainText);

    range.deleteContents();
    sel.removeAllRanges();

    repaginateLocalEditors();

    e.preventDefault();
  };

  const handleEditorPaste = (e: React.ClipboardEvent<HTMLDivElement>, contentIdx: number) => {
    e.preventDefault();

    visualUndoStackRef.current.push(captureVisualSnapshot());
    visualRedoStackRef.current = [];

    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");

    let contentToInsert = "";

    if (html) {
      contentToInsert = normalizeHighlightBlocksForClipboard(html);
    } else {
      const blockquoteHtml = convertMarkdownBlockquoteTextToHtml(text);

      if (blockquoteHtml) {
        contentToInsert = blockquoteHtml;
      } else {
        contentToInsert = text.replace(/\n/g, "<br>");
      }
    }

    contentToInsert = contentToInsert
      .replace(/\[===\s*QUEBRA DE PÁGINA MANUAL\s*===\]/gi, '<div class="manual-page-break" data-page-break="true" contenteditable="false">&nbsp;</div>')
      .replace(/<!--\s*page-break\s*-->/gi, '<div class="manual-page-break" data-page-break="true" contenteditable="false">&nbsp;</div>');

    contentToInsert = restoreManualBreaksFromPastedHtml(contentToInsert);

    document.execCommand("insertHTML", false, contentToInsert);

    repaginateLocalEditors();
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, contentIdx: number) => {
    if (!isEditingVisual) return;
    if (e.key !== "Delete") return;

    const htmls = activeContentPages.map((pageHtml, idx) => {
      const ref = editorRefs.current[idx];
      return ref ? ref.innerHTML : pageHtml;
    });

    const currentHtml = htmls[contentIdx] || "";
    const hasNextPage = contentIdx + 1 < htmls.length;

    if (!hasNextPage) return;

    const atEnd = isCursorAtEndOfEditable(e.currentTarget);
    const trailingBreak = hasTrailingManualBreak(currentHtml);

    if (!atEnd && !trailingBreak) return;

    e.preventDefault();

    visualUndoStackRef.current.push(captureVisualSnapshot());
    visualRedoStackRef.current = [];

    const parser = new DOMParser();

    const currentDoc = parser.parseFromString(currentHtml, "text/html");
    const nextDoc = parser.parseFromString(htmls[contentIdx + 1] || "", "text/html");

    // Remover apenas quebras manuais no final da página atual
    const currentBreaks = Array.from(currentDoc.body.querySelectorAll(".manual-page-break, [data-page-break='true']"));
    const lastCurrentBreak = currentBreaks[currentBreaks.length - 1];
    if (lastCurrentBreak) {
      lastCurrentBreak.remove();
    }

    // Remover quebras manuais no início da próxima página, se existirem
    const nextBreaks = Array.from(nextDoc.body.querySelectorAll(".manual-page-break, [data-page-break='true']"));
    const firstNextBreak = nextBreaks[0];
    if (firstNextBreak) {
      firstNextBreak.remove();
    }

    htmls[contentIdx] = currentDoc.body.innerHTML;
    htmls[contentIdx + 1] = nextDoc.body.innerHTML;

    const joinedHtml = htmls.join("\n");
    const paginatedPages = chunkIntoPages(joinedHtml, settings.densityMode);

    setLocalContentPages(paginatedPages);
    
    // We already repaginated, but we could have also just called repaginateLocalEditors()
    // It's ok since this handles current page logic.
  };

  // Lock body scroll when fullscreen is active to avoid double scrolling
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  // Automatically adjust default layout representation on smaller screen devices
  useEffect(() => {
    if (isPrintMode) return;
    if (typeof window !== 'undefined') {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
        setZoom(45);
      } else {
        setZoom(55);
      }
    }
  }, [isPrintMode]);

  useEffect(() => {
    const fontsToLoad = [];
    if (settings.fontFamily) {
      fontsToLoad.push(settings.fontFamily);
    }
    if (settings.fontDisplay && settings.fontDisplay !== settings.fontFamily) {
      fontsToLoad.push(settings.fontDisplay);
    }
    
    if (fontsToLoad.length > 0) {
      const fontQuery = fontsToLoad
        .map(font => `family=${font.trim().replace(/\s+/g, '+')}:wght@400;500;600;700`)
        .join('&');
      
      const linkId = 'dynamic-google-fonts';
      let linkElement = document.getElementById(linkId) as HTMLLinkElement;
      
      if (!linkElement) {
        linkElement = document.createElement('link');
        linkElement.id = linkId;
        linkElement.rel = 'stylesheet';
        document.head.appendChild(linkElement);
      }
      
      linkElement.href = `https://fonts.googleapis.com/css2?${fontQuery}&display=swap`;
    }
  }, [settings.fontFamily, settings.fontDisplay]);

  const safeSettings = useMemo(() => ({
    ...DEFAULT_SETTINGS,
    ...settings,
    generateToc: settings.generateToc !== false
  }), [settings]);

  const hasNoData = !safeSettings.title && !safeSettings.brand && activeContentPages.length === 0;

  // Determine page presence dynamically to calculate exact page offsets
  const hasCapa = !!(safeSettings.title || safeSettings.professionalName);
  const hasRosto = !!(safeSettings.title || safeSettings.subtitle || safeSettings.supportPhrase);
  const hasAviso = !!safeSettings.educationalWarning;
  const hasSumario = safeSettings.generateToc;

  // Extract raw chapters / principal headings from parsed HTML of the content pages, memoized for performance
  const rawTocEntries = useMemo(() => {
    const parser = new DOMParser();
    const entries: { title: string; relativePageOffset: number; isChapter: boolean; level: number }[] = [];

    activeContentPages.forEach((pageHtml, index) => {
      const pageDoc = parser.parseFromString(pageHtml, 'text/html');

      // Check if it's a chapter opener
      const chapterOpener = pageDoc.querySelector('.chapter-opener');
      if (chapterOpener) {
        const numText = chapterOpener.querySelector('.chapter-number')?.textContent?.trim() || '';
        let titleText = chapterOpener.querySelector('h1')?.textContent?.trim() || '';
        
        // Find real title if empty
        if (!titleText || /^capítulo\s*\d+$/i.test(titleText)) {
          let foundRealTitle = '';
          for (let scanIdx = index; scanIdx < activeContentPages.length; scanIdx++) {
            if (scanIdx > index) {
              const scanDoc = parser.parseFromString(activeContentPages[scanIdx], 'text/html');
              if (scanDoc.querySelector('.chapter-opener')) {
                break;
              }
            }
            const scanDoc = parser.parseFromString(activeContentPages[scanIdx], 'text/html');
            const otherHeadings = scanDoc.querySelectorAll('h1, h2, h3');
            for (let hIdx = 0; hIdx < otherHeadings.length; hIdx++) {
              const h = otherHeadings[hIdx];
              if (h.closest('.chapter-opener')) continue;
              const isExcluded = h.closest('.box-reflexao') || 
                                 h.closest('.box-cuidado') || 
                                 h.closest('.box-informativo');
              if (isExcluded) continue;
              const hText = h.textContent?.trim() || '';
              if (hText && hText.length > 2 && !/^capítulo/i.test(hText)) {
                foundRealTitle = hText;
                break;
              }
            }
            if (foundRealTitle) break;
          }
          if (foundRealTitle) {
            titleText = foundRealTitle;
          }
        }
        
        const cleanTitle = titleText.replace(/^capítulo\s*\d+\s*[-|:]?\s*/i, '').trim();

        entries.push({
          title: `Capítulo ${numText.padStart(2, '0')}: ${cleanTitle || 'Introdução'}`,
          relativePageOffset: index,
          isChapter: true,
          level: 1
        });
      }

      // Also scan this page for other sub-headings (H1, H2, H3, H4, H5, H6), regardless of whether it's a chapter-opener page (excluding the chapter opener title itself)
      const headings = pageDoc.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach((heading) => {
        if (heading.closest('.chapter-opener')) return;

        const text = heading.textContent?.trim() || '';
        // Skip headings that are too long (likely metadata or parser errors like YAML frontmatter being matched)
        if (text && text.length >= 1 && text.length < 150) {
          const tagName = heading.tagName.toLowerCase();
          
          let level = 2;
          let isChapter = false;
          if (tagName === 'h1') {
            level = 1;
            isChapter = true;
          } else if (tagName === 'h2') {
            level = 2;
          } else if (tagName === 'h3') {
            level = 3;
          } else if (tagName === 'h4') {
            level = 4;
          } else if (tagName === 'h5') {
            level = 5;
          } else if (tagName === 'h6') {
            level = 6;
          }

          // Avoid duplicating identical headings on the exact same page
          const isDup = entries.some(e => e.title === text && e.relativePageOffset === index);
          if (!isDup) {
            entries.push({
              title: text,
              relativePageOffset: index,
              isChapter: isChapter,
              level: level
            });
          }
        }
      });
    });

    return entries;
  }, [activeContentPages]);

  // Adjust table of contents entries spacing by Density setting
  const entriesPerPage = useMemo(() => {
    if (settings.densityMode === 'compact') return 26;
    if (settings.densityMode === 'premium') return 14;
    return 20; // default (comfortable)
  }, [settings.densityMode]);

  const listSpacingClass = useMemo(() => {
    if (settings.densityMode === 'compact') return 'space-y-0.5';
    if (settings.densityMode === 'premium') return 'space-y-2';
    return 'space-y-1'; // comfortable default
  }, [settings.densityMode]);

  const linkPaddingClass = useMemo(() => {
    if (settings.densityMode === 'compact') return 'py-0.5';
    if (settings.densityMode === 'premium') return 'py-1.5';
    return 'py-1'; // comfortable default
  }, [settings.densityMode]);

  const linkLeadingClass = useMemo(() => {
    if (settings.densityMode === 'compact') return 'leading-tight';
    if (settings.densityMode === 'premium') return 'leading-relaxed';
    return 'leading-snug'; // comfortable default
  }, [settings.densityMode]);

  // Group and paginate TOC raw entries to prevent page-breaking inside a chapter's list of sub-headings
  const tocPagesRaw = useMemo(() => {
    if (!hasSumario) return [];
    if (rawTocEntries.length === 0) return [];
    
    // 1. Group raw entries by chapter (each group starts with a level === 1 entry)
    const groups: { entries: typeof rawTocEntries }[] = [];
    let currentGroup: { entries: typeof rawTocEntries } | null = null;
    
    rawTocEntries.forEach(entry => {
      if (entry.level === 1 || !currentGroup) {
        currentGroup = { entries: [entry] };
        groups.push(currentGroup);
      } else {
        currentGroup.entries.push(entry);
      }
    });

    // 2. Distribute groups across pages trying to keep groups unbroken if possible
    const pages: (typeof rawTocEntries)[] = [];
    let currentPage: typeof rawTocEntries = [];
    
    groups.forEach((group) => {
      const isFirstPage = pages.length === 0;
      // On page 0, the header block is present, so we slightly reduce the capacity to give more breathing room
      const currentPageCapacity = isFirstPage ? Math.max(6, entriesPerPage - 6) : entriesPerPage;

      if (currentPage.length + group.entries.length <= currentPageCapacity) {
        currentPage.push(...group.entries);
      } else {
        if (currentPage.length > 0) {
          pages.push(currentPage);
          currentPage = [];
        }
        
        const nextIsFirstPage = pages.length === 0;
        const nextPageCapacity = nextIsFirstPage ? Math.max(6, entriesPerPage - 6) : entriesPerPage;
        
        if (group.entries.length > nextPageCapacity) {
          // If a single group is larger than a blank page can hold, we must slice it
          let tempEntries = [...group.entries];
          while (tempEntries.length > 0) {
            const currentCapacity = (pages.length === 0) ? Math.max(6, entriesPerPage - 6) : entriesPerPage;
            const chunk = tempEntries.splice(0, currentCapacity);
            pages.push(chunk);
          }
        } else {
          currentPage.push(...group.entries);
        }
      }
    });
    
    if (currentPage.length > 0) {
      pages.push(currentPage);
    }
    
    return pages;
  }, [hasSumario, rawTocEntries, entriesPerPage]);

  const numSumarioPages = useMemo(() => {
    if (!hasSumario) return 0;
    if (tocPagesRaw.length === 0) return 1;
    return tocPagesRaw.length;
  }, [hasSumario, tocPagesRaw]);

  // Calculate dynamic starting and content page boundaries
  let tempSumstart = 1;
  const capaPageNum = hasCapa ? tempSumstart++ : 0;
  const rostoPageNum = hasRosto ? tempSumstart++ : 0;
  const avisoPageNum = hasAviso ? tempSumstart++ : 0;
  
  const sumarioPageStartNum = hasSumario ? tempSumstart : 0;
  if (hasSumario) {
    tempSumstart += numSumarioPages;
  }
  const contentStartPageNum = tempSumstart;

  // Fully compiled 2D array of Table of Contents entries matching their exact page number mapping
  const tocPagesMapped = useMemo<TocEntry[][]>(() => {
    return tocPagesRaw.map((pageEntries) => {
      return pageEntries.map(entry => ({
        title: entry.title,
        pageNumber: contentStartPageNum + entry.relativePageOffset,
        isChapter: entry.isChapter,
        level: entry.level,
        domId: `content-page-${entry.relativePageOffset}`
      }));
    });
  }, [tocPagesRaw, contentStartPageNum]);

  // Flattened version of page-mapped TOC entries for search or other reference points
  const tocEntries = useMemo<TocEntry[]>(() => {
    return tocPagesMapped.flat();
  }, [tocPagesMapped]);

  // Pre-calculate the current active chapter title for every content page
  const pageChapterTitles = useMemo<string[]>(() => {
    const titles: string[] = [];
    let currentChapterTitle = '';
    const parser = new DOMParser();

    activeContentPages.forEach((pageHtml, index) => {
      const pageDoc = parser.parseFromString(pageHtml, 'text/html');
      const chapterOpener = pageDoc.querySelector('.chapter-opener');

      if (chapterOpener) {
        const numText = chapterOpener.querySelector('.chapter-number')?.textContent?.trim() || '';
        let titleText = chapterOpener.querySelector('h1')?.textContent?.trim() || '';
        
        // Find first real title if titleText is empty or generic
        if (!titleText || /^capítulo\s*\d+$/i.test(titleText)) {
          let foundRealTitle = '';
          for (let scanIdx = index; scanIdx < activeContentPages.length; scanIdx++) {
            if (scanIdx > index) {
              const scanDoc = parser.parseFromString(activeContentPages[scanIdx], 'text/html');
              if (scanDoc.querySelector('.chapter-opener')) {
                break;
              }
            }
            const scanDoc = parser.parseFromString(activeContentPages[scanIdx], 'text/html');
            const otherHeadings = scanDoc.querySelectorAll('h1, h2, h3');
            for (let hIdx = 0; hIdx < otherHeadings.length; hIdx++) {
              const h = otherHeadings[hIdx];
              if (h.closest('.chapter-opener')) continue;
              const isExcluded = h.closest('.box-reflexao') || 
                                 h.closest('.box-cuidado') || 
                                 h.closest('.box-informativo');
              if (isExcluded) continue;
              const hText = h.textContent?.trim() || '';
              if (hText && hText.length > 2 && !/^capítulo/i.test(hText)) {
                foundRealTitle = hText;
                break;
              }
            }
            if (foundRealTitle) break;
          }
          if (foundRealTitle) {
            titleText = foundRealTitle;
          }
        }
        
        const cleanTitle = titleText.replace(/^capítulo\s*\d+\s*[-|:]?\s*/i, '').trim();
        if (numText && cleanTitle) {
          currentChapterTitle = `Capítulo ${numText.replace(/^0+/, '')}: ${cleanTitle}`;
        } else if (numText) {
          currentChapterTitle = `Capítulo ${numText.replace(/^0+/, '')}`;
        } else {
          currentChapterTitle = cleanTitle || '';
        }
      }
      titles.push(currentChapterTitle);
    });

    return titles;
  }, [activeContentPages]);

  const ctaPageNum = contentStartPageNum + activeContentPages.length;
  const finalPageNum = ctaPageNum + (settings.ctaText ? 1 : 0);

  // Compute specific CSS layout variables depending on Density mode for precise reading sizes
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

  const customStyles = {
    '--color-brand-petroleo': settings.primaryColor || '#245C5A',
    '--color-brand-terracota': settings.secondaryColor || '#C9826B',
    '--color-brand-azul': settings.accentColor || '#6F8F9A',
    '--color-brand-areia': settings.backgroundColor || '#F4EFE7',
    '--color-brand-offwhite': settings.backgroundColor || '#FAF8F4',
    '--color-brand-cuidado': '#DDE8E5',
    '--color-brand-cuidado-text': '#245C5A',
    '--color-brand-informativo': '#EAF3F1',
    '--color-brand-linha': '#C9D8D5',
    '--font-sans': settings.fontFamily ? `${settings.fontFamily}, sans-serif` : 'Inter, sans-serif',
    '--font-display': settings.fontDisplay ? `${settings.fontDisplay}, sans-serif` : 'Poppins, sans-serif',
    '--ebook-body-size': bodyFontSize,
    '--ebook-line-height': bodyLineHeight,
    '--ebook-h1-size': h1FontSize,
    '--ebook-h2-size': h2FontSize,
    '--ebook-para-margin': paraMargin,
    border: settings.pageBorder ? '1px solid #C9D8D5' : undefined,
  } as React.CSSProperties;

  const renderHeader = (isCoverOrFirstPage: boolean, pageIdx?: number) => {
    if (isCoverOrFirstPage) return null;
    let headerTextVal = settings.headerText || `${settings.brand || 'Sua Marca'} | ${settings.shortTitle || settings.title || 'E-book'}`;
    
    // As per user request, header should be the chapter title context
    if (pageIdx !== undefined && pageChapterTitles[pageIdx]) {
      headerTextVal = `${headerTextVal} | ${pageChapterTitles[pageIdx]}`;
    }

    const alignment = settings.headerStyle || 'left';
    let alignmentClass = 'text-left';
    if (alignment === 'center') alignmentClass = 'text-center';
    else if (alignment === 'right') alignmentClass = 'text-right';

    return (
      <div className={`text-[9pt] font-medium text-[var(--color-brand-azul)] border-b border-[var(--color-brand-linha)] pb-2 mb-6 header-print shrink-0 ${alignmentClass}`}>
        <span>{headerTextVal}</span>
      </div>
    );
  };

  const renderFooter = (pageNum: number, isCoverOrFirstPage: boolean, isSensitive: boolean = false) => {
    if (isCoverOrFirstPage) return null;
    let footerTextVal = settings.footerText;
    if (!footerTextVal) {
        if (isSensitive) {
             footerTextVal = "Conteúdo educativo. Não substitui avaliação profissional individualizada.";
        } else {
             const siteHost = settings.website ? settings.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : 'seusite.com.br';
             footerTextVal = `${siteHost}`;
        }
    }
    const footerAlign = settings.footerStyle || 'left';
    const pageNumAlign = settings.pageNumberStyle || 'right';

    let justifyClass = 'justify-between';
    let textOrder = 'order-1';
    let numOrder = 'order-2';
    
    if (footerAlign === 'right' && pageNumAlign === 'left') {
      textOrder = 'order-2';
      numOrder = 'order-1';
    } else if (footerAlign === 'center' && pageNumAlign === 'center') {
      justifyClass = 'justify-center gap-1 flex-col items-center';
    }

    let footerTextAlignClass = footerAlign === 'center' ? 'text-center' : footerAlign === 'right' ? 'text-right' : 'text-left';
    let pageNumAlignClass = pageNumAlign === 'center' ? 'text-center' : pageNumAlign === 'right' ? 'text-right' : 'text-left';

    return (
      <div className={`text-[9pt] text-[var(--color-brand-azul)] flex ${justifyClass} items-end border-t border-[var(--color-brand-linha)] pt-4 mt-8 footer-print shrink-0`}>
         <span className={`${textOrder} ${footerTextAlignClass} flex-grow md:flex-grow-0`}>
           {footerTextVal} {footerTextVal === "Conteúdo educativo. Não substitui avaliação profissional individualizada." ? "" : " · "}
         </span>
         <span className={`font-medium text-sm ${numOrder} ${pageNumAlignClass}`}>Página {pageNum}</span>
      </div>
    );
  };

  // Compile exact listing of projected pages with label identifiers
  const pagesList = useMemo(() => {
    const list: { id: string; label: string; type: 'capa' | 'rosto' | 'aviso' | 'sumario' | 'conteudo' | 'cta' | 'final'; pageNum: number; sumarioPageIndex?: number }[] = [];
    let pNum = 1;
    
    if (hasCapa) {
      list.push({ id: 'capa-page', label: 'Capa do E-book', type: 'capa', pageNum: pNum++ });
    }
    if (hasRosto) {
      list.push({ id: 'rosto-page', label: 'Folha de Rosto', type: 'rosto', pageNum: pNum++ });
    }
    if (hasAviso) {
      list.push({ id: 'aviso-page', label: 'Aviso Importante', type: 'aviso', pageNum: pNum++ });
    }
    if (hasSumario) {
      for (let sIdx = 0; sIdx < numSumarioPages; sIdx++) {
        list.push({ 
          id: `sumario-page-${sIdx}`, 
          label: `Sumário${numSumarioPages > 1 ? ` - Parte ${sIdx + 1}` : ''}`, 
          type: 'sumario', 
          pageNum: sumarioPageStartNum + sIdx,
          sumarioPageIndex: sIdx
        });
      }
    }
    
    // Jump to content start page number to correct pagination flow after sumário
    pNum = contentStartPageNum;
    
    activeContentPages.forEach((_, idx) => {
      const rawCh = pageChapterTitles[idx];
      const fallbackCh = `Capítulo ${idx + 1}`;
      list.push({ id: `content-page-${idx}`, label: rawCh || fallbackCh, type: 'conteudo', pageNum: pNum++ });
    });
    if (safeSettings.ctaText) {
      list.push({ id: 'cta-page', label: 'Convite / CTA', type: 'cta', pageNum: pNum++ });
    }
    if (safeSettings.brand || safeSettings.professionalName || safeSettings.website || safeSettings.whatsapp || safeSettings.email) {
      list.push({ id: 'final-page', label: 'Contatos & Institucional', type: 'final', pageNum: pNum++ });
    }
    return list;
  }, [hasCapa, hasRosto, hasAviso, hasSumario, numSumarioPages, sumarioPageStartNum, contentStartPageNum, activeContentPages, pageChapterTitles, safeSettings]);

  // Perform full search text matching calculation
  const checkPageMatch = (pageId: string) => {
    if (!searchQuery.trim()) return false;
    const query = searchQuery.toLowerCase();
    
    if (pageId === 'capa-page') {
      return (safeSettings.title || '').toLowerCase().includes(query) ||
             (safeSettings.subtitle || '').toLowerCase().includes(query) ||
             (safeSettings.professionalName || '').toLowerCase().includes(query) ||
             (safeSettings.brand || '').toLowerCase().includes(query);
    }
    if (pageId === 'rosto-page') {
      return (safeSettings.title || '').toLowerCase().includes(query) ||
             (safeSettings.subtitle || '').toLowerCase().includes(query) ||
             (safeSettings.supportPhrase || '').toLowerCase().includes(query);
    }
    if (pageId === 'aviso-page') {
      return (safeSettings.educationalWarning || '').toLowerCase().includes(query);
    }
    if (pageId.startsWith('sumario-page-')) {
      return 'sumário sumario índice indice capítulos capitulos'.includes(query);
    }
    if (pageId.startsWith('content-page-')) {
      const idx = parseInt(pageId.replace('content-page-', ''), 10);
      const htmlContent = activeContentPages[idx] || '';
      const cleanText = htmlContent.replace(/<[^>]*>/g, ' ');
      return cleanText.toLowerCase().includes(query);
    }
    if (pageId === 'cta-page') {
      return (safeSettings.ctaText || '').toLowerCase().includes(query) ||
             (safeSettings.ctaButtonText || '').toLowerCase().includes(query);
    }
    if (pageId === 'final-page') {
      return (safeSettings.brand || '').toLowerCase().includes(query) ||
             (safeSettings.professionalName || '').toLowerCase().includes(query) ||
             (safeSettings.website || '').toLowerCase().includes(query) ||
             (safeSettings.contactAddress || '').toLowerCase().includes(query);
    }
    return false;
  };

  const totalMatches = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    return pagesList.filter(p => checkPageMatch(p.id)).length;
  }, [searchQuery, pagesList]);

  if (hasNoData) {
    return (
      <div id="ebook-empty-state" className="bg-white rounded-2xl p-8 md:p-12 border-2 border-dashed border-gray-200 text-center max-w-2xl mx-auto my-12 shadow-sm no-print">
        <div className="w-16 h-16 bg-[#E6F4EA] rounded-full flex items-center justify-center mx-auto mb-6">
          <BookOpen className="text-[#245C5A]" size={32} />
        </div>
        <h3 className="text-2xl font-display font-medium text-gray-900 mb-3">Sua Pré-visualização está Vazia</h3>
        <p className="text-gray-600 text-sm leading-relaxed mb-8 max-w-md mx-auto">
          Você limpou todos os dados com sucesso. Para gerar a visualização e exportar o PDF do seu novo e-book, siga as etapas abaixo:
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-lg mx-auto mb-8">
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex gap-3">
            <span className="w-6 h-6 rounded-full bg-[#245C5A] text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Aba Conteúdo</h4>
              <p className="text-xs text-gray-500">Adicione ou faça o upload de seus arquivos de texto em formato Markdown (.md) para o e-book.</p>
            </div>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex gap-3">
            <span className="w-6 h-6 rounded-full bg-[#245C5A] text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Definições de Design</h4>
              <p className="text-xs text-gray-500">Suba o seu arquivo de especificações visuais ou crie e reprocessa novas definições do layout.</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-[#245C5A] font-medium bg-[#E6F4EA]/50 py-2 px-4 rounded-full w-fit mx-auto animate-pulse">
          ✨ Pronto para começar novas criações profissionais!
        </p>
      </div>
    );
  }

  return (
    <div className={`ebook-preview-container ${isFullscreen ? 'fixed inset-0 z-50 bg-[#F4F4F5] overflow-y-auto px-4 py-4' : 'w-full max-w-full px-2 sm:px-4 mx-auto pb-16'}`} style={customStyles}>
      {/* Dynamic Style injection specifically holding Print rendering settings safe inside any target layout state */}
      <style>{`
        @media print {
          .no-print-layout {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .ebook-layout-canvas {
            display: block !important;
            zoom: 100% !important;
            transform: none !important;
            width: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            background: transparent !important;
          }
          .page-wrapper-card {
            box-shadow: none !important;
            transform: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
          }
          /* Eliminate any browser grid layout gaps when creating PDF */
          .ebook-layout-canvas {
            grid-template-columns: 1fr !important;
            gap: 0 !important;
          }
        }
      `}</style>

      {/* PREVIEW INTERACTIVE CONTROL BAR (Only displayed inside web app preview) */}
      {!isPrintMode && (
      <header className={`no-print bg-white border border-gray-200/90 rounded-2xl p-3 mb-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm sticky ${isFullscreen ? 'top-4' : 'top-[64px]'} z-40 bg-opacity-95 backdrop-blur-md`}>
         {/* Left Side: Collapse outline panel + ViewMode toggles */}
         <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <button 
              onClick={() => setSidebarOpen(prev => !prev)}
              className={`p-2 rounded-lg transition-all flex items-center justify-center border ${
                sidebarOpen 
                  ? 'bg-[#E6F4EA] border-[#C9D8D5] text-[#245C5A]' 
                  : 'bg-white border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
              title={sidebarOpen ? "Ocultar Sumário Lateral" : "Exibir Sumário Lateral"}
            >
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            
            <div className="h-5 w-[1px] bg-gray-200 hidden sm:block"></div>
            
            {/* View Mode controls */}
            <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200/60 text-xs">
              <button
                onClick={() => setViewMode('scroll')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all ${
                  viewMode === 'scroll' 
                    ? 'bg-white text-[#245C5A] shadow-xs' 
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Lista Contínua de Páginas"
              >
                <Eye size={13} />
                <span>Rolar</span>
              </button>
              <button
                onClick={() => setViewMode('book')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all ${
                  viewMode === 'book' 
                    ? 'bg-white text-[#245C5A] shadow-xs' 
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Páginas Duplas lado a lado"
              >
                <Columns size={13} />
                <span>Livro (Dupla)</span>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all ${
                  viewMode === 'grid' 
                    ? 'bg-white text-[#245C5A] shadow-xs' 
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Visão Geral em Grade"
              >
                <Grid size={13} />
                <span>Grade ({pagesList.length})</span>
              </button>
            </div>
            
            <div className="h-5 w-[1px] bg-gray-200 hidden sm:block"></div>
            
            <button
              onClick={() => {
                if (!isEditingVisual) {
                  setLocalContentPages([...contentPages]);
                  setIsEditingVisual(true);
                } else {
                  setIsEditingVisual(false);
                  setLocalContentPages(null);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all text-xs border ${
                isEditingVisual 
                  ? 'bg-blue-50 text-blue-700 border-blue-200' 
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
              title="Editar visualmente o conteúdo"
            >
              <Edit3 size={13} />
              <span className="hidden sm:inline">{isEditingVisual ? 'Modo Visual: ATIVO' : 'Edição Visual'}</span>
            </button>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="flex items-center justify-center w-8 h-8 rounded-md bg-white border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-all"
              title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
            >
              {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
         </div>
         
         {/* Middle Section: Manual Zoom controller (disabled inside Grid Mode) */}
         {viewMode !== 'grid' && (
         <div className="flex items-center gap-3 w-full md:w-auto justify-center">
            <button 
              onClick={() => setZoom(Math.max(40, zoom - 10))}
              disabled={zoom <= 40}
              className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 disabled:opacity-40 transition-colors"
              title="Afastar Zoom"
            >
              <ZoomOut size={13} />
            </button>
            
            <div className="flex items-center gap-2">
              <input 
                type="range"
                min="40"
                max="125"
                step="5"
                value={zoom}
                onChange={(e) => setZoom(parseInt(e.target.value, 10))}
                className="w-24 md:w-32 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#245C5A]"
              />
              <span className="font-mono text-xs text-gray-500 font-bold min-w-[34px] text-right">{zoom}%</span>
            </div>
            
            <button 
              onClick={() => setZoom(Math.min(125, zoom + 10))}
              disabled={zoom >= 125}
              className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 disabled:opacity-40 transition-colors"
              title="Aproximar Zoom"
            >
              <ZoomIn size={13} />
            </button>
            
            <button 
              onClick={() => setZoom(window.innerWidth < 1024 ? 45 : 55)}
              className="text-[10px] uppercase font-bold text-gray-500 hover:text-[#245C5A] bg-gray-100 hover:bg-gray-200/60 px-2 h-7 rounded-md border border-gray-200/50 flex items-center"
              title="Ajustar ao Padrão (Ver Página Completa)"
            >
              Reset
            </button>
         </div>
         )}

         {viewMode === 'grid' && (
           <div className="text-xs font-semibold text-gray-400 italic text-center py-1">
             💡 Clique em qualquer miniatura para abrir e focar na página!
           </div>
         )}
         
         {/* Right Side: Smart document content search filter */}
         <div className="relative w-full md:w-auto shrink-0">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={14} className="text-gray-400" />
            </div>
            <input 
              type="text"
              placeholder="Buscar termos no e-book..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full md:w-56 pl-9 pr-8 py-1.5 text-xs text-gray-800 bg-gray-50 hover:bg-gray-100/50 focus:bg-white focus:ring-1 focus:ring-[#245C5A] border border-gray-200 rounded-lg h-9 transition-all placeholder:text-gray-400 font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600"
              >
                <X size={12} />
              </button>
            )}
         </div>
      </header>
      )}

      {/* WORKSPACE FLEXBOX STRUCTURE */}
      <div className="no-print-layout flex flex-col lg:flex-row gap-6 relative items-start">
         
         {/* OUTLINE NAVIGATOR (SIDEBAR) */}
         {!isPrintMode && sidebarOpen && (
            <aside className="w-full lg:w-[240px] xl:w-[270px] bg-white border border-gray-200/80 rounded-2xl shadow-xs p-4 no-print lg:sticky lg:top-[138px] lg:h-[calc(100vh-180px)] overflow-y-auto shrink-0 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Sumário Interativo</span>
                <span className="text-[10px] font-mono font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md">
                  {pagesList.length} Págs
                </span>
              </div>
              
              {searchQuery.trim() && (
                <div className={`p-2.5 rounded-xl text-xs border ${
                  totalMatches > 0 
                    ? 'bg-amber-50 border-amber-200 text-amber-800' 
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}>
                  {totalMatches > 0 ? (
                    <span>Encontrada{totalMatches > 1 ? 's' : ''} <strong className="font-bold">{totalMatches}</strong> página{totalMatches > 1 ? 's' : ''} com correspondências.</span>
                  ) : (
                    <span>Nenhum trecho correspondente cadastrado.</span>
                  )}
                </div>
              )}
              
              {/* Scrolling links index */}
              <nav className="space-y-1">
                {pagesList.map((p) => {
                  const hasSearchActive = !!searchQuery.trim();
                  const isMatch = hasSearchActive && checkPageMatch(p.id);
                  
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (viewMode === 'grid') {
                          setViewMode('scroll');
                        }
                        // Give a small tick to settle state transitions smoothly
                        setTimeout(() => {
                          const el = document.getElementById(p.id);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }, 50);
                      }}
                      className={`w-full flex items-center justify-between text-left px-2.5 py-2 rounded-lg text-xs transition-all ${
                        hasSearchActive
                          ? isMatch
                            ? 'bg-[#FAF6F2] text-[#8A4D3B] font-bold border border-[#F1D6C8]/70 outline-none shadow-2xs'
                            : 'opacity-40 text-gray-400 hover:opacity-60'
                          : 'text-[#2F3437] hover:bg-[#F4EFE7]/40 hover:text-[#245C5A] hover:pl-3 w-full font-medium'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate pr-1">
                        <span className="font-mono bg-gray-100 text-gray-500 font-bold px-1.5 py-0.5 rounded text-[9px] shrink-0">
                          {p.pageNum}
                        </span>
                        <span className="truncate">{p.label}</span>
                      </span>
                      {isMatch && (
                        <span className="w-2 h-2 rounded-full bg-[#C9826B] shrink-0 shadow-2xs animate-pulse"></span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </aside>
         )}
         
         {/* PREVIEW CONTAINER CANVAS */}
         <div className="flex-grow min-w-0 flex flex-col items-center w-full relative">
            {isEditingVisual && (
              <div className={`sticky ${isFullscreen ? 'top-[72px]' : 'top-[132px]'} z-30 bg-white/95 backdrop-blur-sm border border-blue-200 shadow-xl rounded-xl p-2 mb-4 w-full max-w-4xl flex items-center justify-center gap-1.5 transition-all animate-in slide-in-from-top-4`}>
                <button 
                  onClick={() => {
                    if (visualUndoStackRef.current.length > 0) {
                      const currentSnapshot = captureVisualSnapshot();
                      visualRedoStackRef.current.push(currentSnapshot);

                      const previousSnapshot = visualUndoStackRef.current.pop();
                      if (previousSnapshot) {
                        restoreVisualSnapshot(previousSnapshot);
                      }
                    } else {
                      document.execCommand('undo');
                    }
                  }} 
                  className="p-2 hover:bg-gray-100 rounded-lg text-gray-700 hover:text-black hover:bg-gray-200 cursor-pointer" 
                  title="Desfazer"
                >
                  <Undo size={16} />
                </button>
                <button 
                  onClick={() => {
                    if (visualRedoStackRef.current.length > 0) {
                      const currentSnapshot = captureVisualSnapshot();
                      visualUndoStackRef.current.push(currentSnapshot);

                      const nextSnapshot = visualRedoStackRef.current.pop();
                      if (nextSnapshot) {
                        restoreVisualSnapshot(nextSnapshot);
                      }
                    } else {
                      document.execCommand('redo');
                    }
                  }} 
                  className="p-2 hover:bg-gray-100 rounded-lg text-gray-700 hover:text-black hover:bg-gray-200 cursor-pointer" 
                  title="Refazer"
                >
                  <Redo size={16} />
                </button>
                <div className="w-px h-6 bg-gray-200 mx-1"></div>
                <button onClick={() => execVisualCommand('bold')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-700 hover:text-black hover:bg-gray-200" title="Negrito"><Bold size={16} /></button>
                <button onClick={() => execVisualCommand('italic')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-700 hover:text-black hover:bg-gray-200" title="Itálico"><Italic size={16} /></button>
                <button onClick={() => execVisualCommand('underline')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-700 hover:text-black hover:bg-gray-200" title="Sublinhado"><Underline size={16} /></button>
                <div className="w-px h-6 bg-gray-200 mx-1"></div>
                <button onClick={() => execVisualCommand('formatBlock', 'H1')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-700 font-bold hover:bg-gray-200" title="Título Principal">H1</button>
                <button onClick={() => execVisualCommand('formatBlock', 'H2')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-700 font-bold hover:bg-gray-200" title="Subtítulo">H2</button>
                <div className="w-px h-6 bg-gray-200 mx-1"></div>
                <button 
                  onClick={() => {
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0) {
                      let node = sel.getRangeAt(0).startContainer;
                      
                      // 1. Detect if the selection target is nested within a highlight box block
                      const parentElement = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
                      const closestBox = parentElement ? parentElement.closest('.box-reflexao, .box-informativo, .box-cuidado') : null;
                      
                      let rootParent: Node | null = closestBox;
                      if (!rootParent) {
                        rootParent = node;
                        // Find the closest block element to insert the break AFTER it
                        while(rootParent && rootParent.parentElement && rootParent.parentElement.contentEditable !== 'true') {
                           rootParent = rootParent.parentElement;
                        }
                      }

                      // Capture snapshot before modifying
                      visualUndoStackRef.current.push(captureVisualSnapshot());
                      visualRedoStackRef.current = [];

                      const div = document.createElement('div');
                      div.className = 'manual-page-break';
                      div.setAttribute('data-page-break', 'true');
                      div.innerHTML = '&nbsp;'; 
                      
                      div.style.borderTop = '2px dashed #C9826B';
                      div.style.margin = '20px 0';
                      div.style.position = 'relative';
                      div.style.display = 'block';
                      div.style.width = '100%';
                      div.contentEditable = 'false';
                      
                      if (rootParent && rootParent.parentNode) {
                          rootParent.parentNode.insertBefore(div, rootParent.nextSibling);
                      } else {
                          const range = sel.getRangeAt(0);
                          range.insertNode(div);
                      }
                      
                      const p = document.createElement('p');
                      p.innerHTML = '<br/>';
                      div.after(p);
                      
                      // Move cursor to the new paragraph after the break
                      const newRange = document.createRange();
                      newRange.setStart(p, 0);
                      newRange.collapse(true);
                      sel.removeAllRanges();
                      sel.addRange(newRange);
                      
                      repaginateLocalEditors();
                      
                      // Não chamar onContentUpdate aqui.
                      // O conteúdo será consolidado apenas ao salvar.
                    }
                  }} 
                  className="px-3 py-1.5 hover:bg-orange-50 text-[#C9826B] border border-orange-200 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-colors" title="Inserir Quebra de Página Manual">
                  <Scissors size={14} /> Quebra
                </button>
                <div className="w-px h-6 bg-gray-200 mx-1"></div>
                <button
                  onClick={() => {
                    if (!onContentUpdate) return;
                    const markdown = serializeEditorDomToMarkdown();
                    console.log("MARKDOWN SALVO COM SUCESSO CONTÉM QUEBRA:", markdown.includes("[=== QUEBRA DE PÁGINA MANUAL ===]") || markdown.includes("<!-- page-break -->") ? "SIM! ✅" : "NÃO! ❌");
                    setIsEditingVisual(false);
                    setLocalContentPages(null);
                    onContentUpdate(markdown);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg font-bold text-sm flex items-center gap-1.5 ml-auto transition-colors"
                >
                  <Save size={14} /> Salvar & Voltar
                </button>
              </div>
            )}

            {/* The rendered pages stream */}
            <div 
              className={`ebook-layout-canvas w-full transition-all duration-300 origin-top flex-grow ${
                viewMode === 'grid' 
                  ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-6 p-6 bg-gray-100/70 rounded-2xl border border-gray-200 shadow-inner' 
                  : viewMode === 'book'
                    ? 'grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-10 p-2'
                    : 'flex flex-col items-center gap-y-8 p-2'
              }`}
              style={{
                zoom: (isPrintMode || viewMode === 'grid') ? undefined : `${zoom}%`,
                width: '100%'
              }}
            >
               {pagesList.map((p) => {
                 const isSearchMatch = searchQuery.trim() && checkPageMatch(p.id);
                 
                 // Highlight selected matches with a gorgeous terracotta border highlight
                 const pageHighlightClass = isSearchMatch 
                   ? 'ring-4 ring-[#C9826B]/90 shadow-2xl relative scale-[1.01] rounded-lg' 
                   : 'shadow-sm';

                 const handlePageClick = () => {
                   if (viewMode === 'grid') {
                     setViewMode('scroll');
                     setTimeout(() => {
                       const el = document.getElementById(p.id);
                       if (el) {
                         el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                       }
                     }, 120);
                   }
                 };

                 return (
                   <div 
                     key={p.id} 
                     onClick={handlePageClick}
                     className={`page-wrapper-card flex justify-center w-full max-w-fit transition-all duration-300 rounded-lg ${
                       viewMode === 'grid' ? 'hover:scale-[1.03] duration-200 cursor-pointer' : ''
                     } ${pageHighlightClass}`}
                   >
                     {/* Scale representation for Grid Overview visually */}
                     <div 
                       className="w-full h-full origin-top"
                       style={{
                         transform: viewMode === 'grid' ? 'scale(0.36)' : undefined,
                         width: viewMode === 'grid' ? '210mm' : undefined,
                         height: viewMode === 'grid' ? '297mm' : undefined,
                       }}
                     >
                       {p.type === 'capa' && (
                         <section id="capa-page" className="page flex flex-col justify-center relative select-none">
                           <div className="absolute top-0 right-0 w-64 h-64 bg-[#F4EFE7] rounded-bl-full opacity-50 -z-10"></div>
                           <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#FAF8F4] rounded-tr-full opacity-50 -z-10"></div>
                           
                           <div className="mb-12">
                             {safeSettings.materialType && (
                               <span className="inline-block bg-[#245C5A] text-white px-3 py-1 rounded-full text-[10px] uppercase tracking-wider font-semibold mb-4">
                                 {safeSettings.materialType.replace(/de baixo ticket/gi, "").replace(/baixo ticket/gi, "").replace(/barato/gi, "").replace(/\s+/g, " ").trim()}
                               </span>
                             )}
                             <h1 className="text-5xl md:text-6xl font-display text-[#245C5A] font-bold leading-tight mb-4">
                               {safeSettings.title}
                             </h1>
                             <h2 className="text-2xl text-[#6F8F9A] font-sans font-medium max-w-2xl">
                               {safeSettings.subtitle}
                             </h2>
                           </div>

                           <div className="mt-auto">
                             <div className="w-16 h-1 bg-[#C9826B] mb-6"></div>
                             <p className="font-bold text-[#2F3437] text-lg uppercase tracking-wide">{safeSettings.professionalName}</p>
                             <p className="text-[#6F8F9A]">{safeSettings.professionalTitle}</p>
                             <p className="text-[#6F8F9A] text-sm">{safeSettings.professionalReg}</p>
                           </div>
                           
                           {safeSettings.brand && (
                             <div className="absolute bottom-10 right-10 flex items-center gap-2">
                                 <span className="text-[#245C5A] font-display font-semibold text-xl tracking-tight">{safeSettings.brand}</span>
                             </div>
                           )}
                         </section>
                       )}

                       {p.type === 'rosto' && (
                         <section id="rosto-page" className="page flex flex-col items-center justify-center text-center select-none">
                            <h1 className="text-4xl font-display text-[#245C5A] font-bold mb-4">{safeSettings.title}</h1>
                            <h2 className="text-xl text-[#6F8F9A] mb-8">{safeSettings.subtitle}</h2>
                            <p className="max-w-md mx-auto italic text-[#2F3437] mb-12">{safeSettings.supportPhrase}</p>
                            
                            <div className="mt-12">
                               <p className="font-bold text-[#2F3437]">{safeSettings.professionalName}</p>
                               <p className="text-[#6F8F9A]">{safeSettings.professionalTitle}</p>
                               <p className="text-[#6F8F9A] text-sm">{safeSettings.professionalReg}</p>
                            </div>
                         </section>
                       )}

                       {p.type === 'aviso' && (
                         <section id="aviso-page" className="page flex flex-col justify-between scroll-mt-6">
                            {renderHeader(false)}
                            
                            <div className="box-cuidado w-full max-w-2xl mx-auto my-auto text-left">
                                <h3 className="text-2xl font-display font-semibold mb-4">⚠️ Aviso Importante</h3>
                                {(safeSettings.educationalWarning || '').split('\n\n').map((paragraph, i) => (
                                    <p key={i} className="mb-4 last:mb-0 text-[#2F3437]">{paragraph}</p>
                                ))}
                            </div>

                            {renderFooter(p.pageNum, false)}
                         </section>
                       )}

                       {p.type === 'sumario' && (() => {
                         const sIdx = p.sumarioPageIndex ?? 0;
                         const paginatedEntries = tocPagesMapped[sIdx] || [];
                         return (
                         <section id={p.id} className="page flex flex-col justify-between scroll-mt-6 relative">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-[#F4EFE7] rounded-bl-full opacity-30 -z-10"></div>
                            
                            {renderHeader(false)}
                            
                            <div className="flex-grow">
                               {sIdx === 0 && (
                                 <div className="mb-8 text-left border-b border-[#FAF8F4] pb-6">
                                   <span className="text-xs font-bold uppercase tracking-widest text-[#6F8F9A] block mb-1">Índice Geral</span>
                                   <h1 className="text-4xl font-display font-bold text-[#245C5A] tracking-tight">Sumário</h1>
                                   <div className="w-12 h-1 bg-[#C9826B] mt-3"></div>
                                 </div>
                               )}
                               
                               <div className={`max-w-3xl ${sIdx === 0 ? 'mt-6' : 'mt-2'}`}>
                                 <ul className={listSpacingClass}>
                                   {paginatedEntries.map((entry, idx) => (
                                     <li key={`${entry.domId}-${sIdx}-${idx}`}>
                                       <a 
                                         href={`#${entry.domId}`}
                                         onClick={(e) => {
                                           e.preventDefault();
                                           if (viewMode === 'grid') {
                                             setViewMode('scroll');
                                           }
                                           setTimeout(() => {
                                             const el = document.getElementById(entry.domId);
                                             if (el) {
                                               el.scrollIntoView({ behavior: 'smooth' });
                                             }
                                           }, 100);
                                         }}
                                         className={`group flex flex-row items-end justify-between hover:text-[#C9826B] transition-colors duration-150 ${linkPaddingClass}`}
                                       >
                                         <span className={`text-left pr-2 pb-0.5 transition-colors duration-150 ${linkLeadingClass} ${
                                           entry.level === 1 
                                            ? 'font-display font-bold text-[#245C5A] text-sm md:text-base group-hover:text-[#C9826B]' 
                                            : entry.level === 2
                                              ? 'font-sans text-sm font-semibold text-[#3D4447] pl-5 group-hover:text-[#C9826B]'
                                              : 'font-sans text-xs text-[#5C6466] pl-9 group-hover:text-[#C9826B]'
                                         }`}>
                                           {entry.title}
                                         </span>
                                         <span className="flex-grow border-b border-dotted border-[#C9D8D5] mx-2 relative top-[-4px] group-hover:border-[#C9826B] transition-colors"></span>
                                         <span className="font-mono text-[#6F8F9A] font-bold text-sm shrink-0 group-hover:text-[#C9826B] transition-colors">
                                           {entry.pageNumber}
                                         </span>
                                       </a>
                                     </li>
                                   ))}
                                   
                                   {tocEntries.length === 0 && (
                                     <div className="text-center py-10 bg-[#FAF8F4] border border-[#C9D8D5] rounded-xl p-6">
                                       <p className="text-sm font-semibold text-[#245C5A] mb-1">Dica do Editor:</p>
                                       <p className="text-xs text-gray-400">
                                         O sumário gerará os links interativos de capítulos a partir de marcadores do tipo <code># Capítulo 1: Título</code> nos arquivos carregados na aba Conteúdo!
                                       </p>
                                     </div>
                                   )}
                                 </ul>
                               </div>
                            </div>

                            {renderFooter(p.pageNum, false)}
                         </section>
                         );
                       })()}

                       {p.type === 'conteudo' && (() => {
                         const contentIdx = pagesList.filter((x, idx) => idx < pagesList.indexOf(p) && x.type === 'conteudo').length;
                         const pageHtml = activeContentPages[contentIdx] || '';
                         return (
                           <section id={p.id} className="page flex flex-col justify-between scroll-mt-6">
                              {renderHeader(false, contentIdx)}
                              <div 
                                ref={(el) => { editorRefs.current[contentIdx] = el; }}
                                className={`ebook-content flex-grow ${isEditingVisual ? 'outline-none ring-4 ring-blue-400 ring-inset bg-blue-50/10 rounded overflow-visible' : ''}`}
                                 onKeyDown={(e) => handleEditorKeyDown(e, contentIdx)}
                                 onCopy={handleEditorCopy}
                                 onCut={(e) => handleEditorCut(e, contentIdx)}
                                 onPaste={(e) => handleEditorPaste(e, contentIdx)}
                                contentEditable={isEditingVisual}
                                suppressContentEditableWarning={true}
                                dangerouslySetInnerHTML={{ __html: pageHtml }}
                              />
                              {renderFooter(p.pageNum, false)}
                           </section>
                         );
                       })()}

                       {p.type === 'cta' && (
                         <section id="cta-page" className="page flex flex-col justify-between bg-[#F4EFE7] scroll-mt-6">
                            {renderHeader(false)}
                            <div className="max-w-2xl mx-auto my-auto flex-grow flex flex-col justify-center">
                                <h2 className="text-3xl font-display font-bold text-[#245C5A] mb-6">Um convite</h2>
                                <div className="box-informativo bg-white">
                                    {(safeSettings.ctaText || '').split('\n\n').map((paragraph, i) => (
                                        <p key={i} className="mb-4 last:mb-0 text-[#2F3437]">{paragraph}</p>
                                    ))}
                                </div>
                                
                                {(safeSettings.whatsapp || safeSettings.schedulingUrl) && (
                                    <a href={safeSettings.schedulingUrl || safeSettings.whatsapp} target="_blank" rel="noreferrer" className="inline-block mt-8 bg-[#245C5A] text-white px-8 py-4 rounded-lg font-bold hover:bg-[#1b4342] transition-colors no-print w-fit">
                                        {safeSettings.ctaButtonText || 'Saiba Mais'}
                                    </a>
                                )}
                                {(safeSettings.schedulingUrl || safeSettings.whatsapp) && (
                                  <p className="mt-4 text-sm text-[#6F8F9A] hidden print:block">
                                      Para agendamentos e mais informações, acesse: <br/>
                                      <strong>{safeSettings.schedulingUrl || safeSettings.whatsapp}</strong>
                                  </p>
                                )}
                            </div>

                            {renderFooter(p.pageNum, false)}
                         </section>
                       )}

                       {p.type === 'final' && (
                         <section id="final-page" className="page flex flex-col justify-between scroll-mt-6">
                             {renderHeader(false)}
                             <div className="mt-10 mb-auto">
                                 <h1 className="text-2xl font-display font-bold text-[#245C5A] mb-2">{safeSettings.brand}</h1>
                                 {safeSettings.brand && <p className="text-[#6F8F9A] mb-12">Clínica de Terapia Ocupacional</p>}

                                 <div className="mb-8">
                                     <p className="font-bold text-[#2F3437]">{safeSettings.professionalName}</p>
                                     <p className="text-[#2F3437]">{safeSettings.professionalTitle}</p>
                                     <p className="text-[#6F8F9A] text-sm">{safeSettings.professionalReg}</p>
                                 </div>

                                 <div className="space-y-2 text-[#2F3437]">
                                     {safeSettings.website && <p><strong>Site:</strong> {safeSettings.website}</p>}
                                     {safeSettings.instagram && <p><strong>Instagram:</strong> {safeSettings.instagram}</p>}
                                     {safeSettings.email && <p><strong>E-mail:</strong> {safeSettings.email}</p>}
                                     {safeSettings.whatsapp && <p className="no-print"><strong>WhatsApp:</strong> <a href={safeSettings.whatsapp} target="_blank" rel="noreferrer" className="text-[#245C5A] underline">{getFormattedWhatsapp(safeSettings.whatsapp)}</a></p>}
                                     {safeSettings.whatsapp && <p className="hidden print:block"><strong>WhatsApp:</strong> {getFormattedWhatsapp(safeSettings.whatsapp)}</p>}
                                     {safeSettings.contactAddress && <p className="mt-4 max-w-md"><strong className="block">Endereço:</strong> {safeSettings.contactAddress}</p>}
                                 </div>
                             </div>
                             
                             {renderFooter(p.pageNum, false)}
                         </section>
                       )}
                     </div>
                   </div>
                 );
               })}
            </div>
         </div>
         
      </div>
    </div>
  );
}

function getFormattedWhatsapp(urlOrNum: string): string {
  if (!urlOrNum) return "";
  let digits = "";
  if (urlOrNum.includes("wa.me/")) {
    const match = urlOrNum.match(/wa\.me\/([0-9\+]+)/);
    if (match) digits = match[1].replace(/\+/g, "");
  } else if (urlOrNum.includes("phone=")) {
    const match = urlOrNum.match(/phone=([0-9\+]+)/);
    if (match) digits = match[1].replace(/\+/g, "");
  } else {
    digits = urlOrNum.replace(/\D/g, "");
  }

  if (!digits) {
    return urlOrNum;
  }

  // If starts with 55 (Brazil), format accordingly
  if (digits.startsWith("55") && digits.length >= 12) {
    const ddd = digits.substring(2, 4);
    const firstPart = digits.substring(4, digits.length - 4);
    const secondPart = digits.substring(digits.length - 4);
    return `(${ddd}) ${firstPart}-${secondPart}`;
  } else if (digits.length === 11) {
    const ddd = digits.substring(0, 2);
    const firstPart = digits.substring(2, 7);
    const secondPart = digits.substring(7);
    return `(${ddd}) ${firstPart}-${secondPart}`;
  } else if (digits.length === 10) {
    const ddd = digits.substring(0, 2);
    const firstPart = digits.substring(2, 6);
    const secondPart = digits.substring(6);
    return `(${ddd}) ${firstPart}-${secondPart}`;
  }

  return digits;
}
