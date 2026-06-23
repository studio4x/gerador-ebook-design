import TurndownService from 'turndown';

const PAGE_BREAK_UNDO_KEY = 'ebook_visual_editor_before_page_break_markdown';
const RETURN_TO_PREVIEW_KEY = 'ebook_visual_editor_return_to_preview';

function getButtonFromEvent(event: Event): HTMLButtonElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest('button');
}

function createTurndownService(): TurndownService {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    emDelimiter: '*',
  });

  turndownService.addRule('pagebreaks', {
    filter(node) {
      return (
        node.nodeName === 'DIV' &&
        ((node as HTMLElement).classList.contains('manual-page-break') ||
          (node as HTMLElement).getAttribute('data-page-break') === 'true')
      );
    },
    replacement() {
      return '\n\n<!-- page-break -->\n\n';
    },
  });

  turndownService.addRule('chapterOpener', {
    filter(node) {
      return node.nodeName === 'DIV' && (node as HTMLElement).classList.contains('chapter-opener');
    },
    replacement(content, node) {
      const element = node as HTMLElement;
      const h1 = element.querySelector('h1');
      const numDiv = element.querySelector('.chapter-number');
      const title = h1?.textContent?.trim() || '';
      const num = numDiv?.textContent?.trim() || '';

      if (num && title) {
        return `\n\n# Capítulo ${num.replace(/^0+/, '')}: ${title}\n\n`;
      }
      if (title) {
        return `\n\n# ${title}\n\n`;
      }
      return `\n\n# ${content.trim()}\n\n`;
    },
  });

  turndownService.addRule('chapterNumber', {
    filter(node) {
      return node.nodeName === 'DIV' && (node as HTMLElement).classList.contains('chapter-number');
    },
    replacement() {
      return '';
    },
  });

  turndownService.addRule('fraseCentral', {
    filter(node) {
      return node.nodeName === 'DIV' && (node as HTMLElement).classList.contains('frase-central');
    },
    replacement(content) {
      const trimmed = content.trim();
      if (!trimmed) return '';
      const lines = trimmed.split('\n').map((line) => `> ${line}`).join('\n');
      return `\n\n${lines}\n\n`;
    },
  });

  turndownService.addRule('unwrapBoxes', {
    filter(node) {
      const element = node as HTMLElement;
      return (
        node.nodeName === 'DIV' &&
        (element.classList.contains('box-reflexao') ||
          element.classList.contains('box-informativo') ||
          element.classList.contains('box-cuidado'))
      );
    },
    replacement(content) {
      return `\n\n${content}\n\n`;
    },
  });

  turndownService.keep(['span', 'u']);
  return turndownService;
}

function serializeCurrentVisualEditor(): string | null {
  const editablePages = Array.from(
    document.querySelectorAll<HTMLElement>('.ebook-content[contenteditable="true"]'),
  );

  if (editablePages.length === 0) return null;

  let fullHtml = '';
  editablePages.forEach((page) => {
    const clone = page.cloneNode(true) as HTMLElement;
    const pageBreaks = clone.querySelectorAll<HTMLElement>('.manual-page-break');

    pageBreaks.forEach((el) => {
      el.removeAttribute('style');
      el.innerHTML = 'page-break-placeholder';
    });

    fullHtml += `${clone.innerHTML}\n\n`;
  });

  const markdown = createTurndownService().turndown(fullHtml).trim();
  return markdown || null;
}

function restoreMarkdownAsVisualEdition(markdown: string): void {
  const existingRaw = localStorage.getItem('ebook_layout_blocks');
  let existingBlock: any = null;

  try {
    const parsed = existingRaw ? JSON.parse(existingRaw) : [];
    if (Array.isArray(parsed) && parsed.length === 1 && parsed[0]?.filename === 'Edições Visuais.md') {
      existingBlock = parsed[0];
    }
  } catch {
    existingBlock = null;
  }

  const restoredBlock = {
    id: existingBlock?.id || crypto.randomUUID(),
    filename: 'Edições Visuais.md',
    content: markdown,
    originalContent: existingBlock?.originalContent || '',
    isEdited: true,
    updatedAt: new Date().toLocaleString('pt-BR'),
    revisions: existingBlock?.revisions || [],
  };

  localStorage.setItem('ebook_layout_blocks', JSON.stringify([restoredBlock]));
  sessionStorage.setItem(RETURN_TO_PREVIEW_KEY, '1');
  window.location.reload();
}

function returnToPreviewAfterReload(): void {
  if (sessionStorage.getItem(RETURN_TO_PREVIEW_KEY) !== '1') return;
  sessionStorage.removeItem(RETURN_TO_PREVIEW_KEY);

  let attempts = 0;
  const maxAttempts = 40;

  const timer = window.setInterval(() => {
    attempts += 1;
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
    const previewButton = buttons.find((button) => button.textContent?.includes('Visualizar & PDF'));

    if (previewButton) {
      previewButton.click();
      window.clearInterval(timer);

      window.setTimeout(() => {
        const visualEditorButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
          (button) =>
            button.title?.toLowerCase().includes('editar visualmente') ||
            button.textContent?.toLowerCase().includes('edição visual'),
        );
        visualEditorButton?.click();
      }, 700);
    }

    if (attempts >= maxAttempts) {
      window.clearInterval(timer);
    }
  }, 150);
}

function installVisualEditorUndoPatch(): void {
  if (typeof window === 'undefined') return;

  document.addEventListener(
    'click',
    (event) => {
      const button = getButtonFromEvent(event);
      if (!button) return;

      const title = button.title || '';
      const text = button.textContent || '';

      const isPageBreakButton =
        title.toLowerCase().includes('quebra de página') || text.trim().toLowerCase() === 'quebra';

      if (isPageBreakButton) {
        const markdownBeforeBreak = serializeCurrentVisualEditor();
        if (markdownBeforeBreak) {
          sessionStorage.setItem(PAGE_BREAK_UNDO_KEY, markdownBeforeBreak);
        }
        return;
      }

      const isUndoButton = title.toLowerCase() === 'desfazer';
      if (!isUndoButton) return;

      const markdownBeforeBreak = sessionStorage.getItem(PAGE_BREAK_UNDO_KEY);
      if (!markdownBeforeBreak) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      sessionStorage.removeItem(PAGE_BREAK_UNDO_KEY);
      restoreMarkdownAsVisualEdition(markdownBeforeBreak);
    },
    true,
  );

  returnToPreviewAfterReload();
}

installVisualEditorUndoPatch();
