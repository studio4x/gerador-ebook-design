import { marked } from 'marked';
import { ContentBlock, ProjectSettings } from '../types';

/**
 * Parses and extracts text content into structured HTML layout
 * Blocks representing Aviso/Disclaimer and CTA are styled in separate sections,
 * and filtered out of standard text pages so they don't repeat.
 */
export async function parseEbookContent(blocks: ContentBlock[]): Promise<string> {
  // 1. Clean individual blocks of frontmatter before joining to prevent content loss with '---'
  const cleanedContents = blocks.map((b) => {
    let content = b.content;
    // Strip yaml frontmatter strictly at the beginning of the block
    content = content.replace(/^---\r?\n[\s\S]*?\r?\n---/g, '');
    content = content.replace(/<!--\s*visual-pagination-lock\s*-->/gi, '');
    return content;
  });

  let mergedMarkdown = cleanedContents.join('\n\n<!-- block-separator -->\n\n');

  // Convert checklists: match optional list bullet followed by [ ]
  mergedMarkdown = mergedMarkdown.split('\n').map(line => {
    const match = line.match(/^\s*(?:[-*]\s+)?\[\s*\]\s*(.*)$/i);
    if (match) {
      return `<div class="checklist-item"><div class="checklist-box"></div><div class="checklist-text">${match[1]}</div></div>`;
    }
    return line;
  }).join('\n');

  // Convert underscores (4 or more) representing fillable lines
  mergedMarkdown = mergedMarkdown.split('\n').map(line => {
    if (/^\s*_{4,}\s*$/.test(line)) {
      return '<div class="fill-line"></div>';
    }
    return line.replace(/_{4,}/g, '<span class="fill-line"></span>');
  }).join('\n');

  // Hardcoded fixes for specific typos in the original content
  mergedMarkdown = mergedMarkdown.replace(
    /corrigir a pessoa ou encaix[aá]-?la em um padrão/gi,
    "corrigir a pessoa ou encaixar a pessoa em um padrão"
  );
  mergedMarkdown = mergedMarkdown.replace(
    /corrigir a pessoa ou encaixála em um padrão/gi,
    "corrigir a pessoa ou encaixar a pessoa em um padrão"
  );

  // Handle manual page breaks
  mergedMarkdown = mergedMarkdown.replace(/(\[===\s*QUEBRA DE PÁGINA MANUAL\s*===\]|<!--\s*page-break\s*-->)/gi, '<div class="manual-page-break" data-page-break="true"></div>');

  // Remove generic identifiers like "# Parte 1", "Parte 1", "# Bloco 1", etc alone on a line
  mergedMarkdown = mergedMarkdown.replace(/^[#\s]*(Parte|Bloco|Arquivo|Conteúdo|Cap[íi]tulo\s+Extra)\s*\d+.*$/gim, '');

  // Remove raw frontmatter text sometimes provided by AI without --- markers
  mergedMarkdown = mergedMarkdown.replace(/^(title|titulo):\s*["'].*?["']\s*\r?\n?(subtitle|subtitulo|author|autora):.*/gim, '');

  // 2. Parse Markdown to HTML
  let html = await marked.parse(mergedMarkdown, { async: true });

  // Ensure any manual page-break comments or markers that survived the parse stage are converted
  html = html.replace(/(?:<!--\s*page-break\s*-->|\[===\s*QUEBRA DE PÁGINA MANUAL\s*===\])/gi, '<div class="manual-page-break" data-page-break="true"></div>');

  // 3. Post-Process HTML for specific boxes and filters
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Handle chapters and boxes
  const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
  
  headings.forEach((heading) => {
    // Guard against wrapping elements that are already within a chapter-opener or highlighted box
    if (heading.closest('.chapter-opener, .box-cuidado, .box-informativo, .box-reflexao')) {
        return;
    }

    const text = heading.textContent?.toLowerCase() || '';
    const originalText = heading.textContent || '';

    // PAUSA PARA REFLEXÃO -> box-reflexao
    if (text.includes('pausa para reflexão') || text.includes('para refletir') || text.includes('perguntas para reflexão')) {
        wrapNextUntilHeading(heading, 'box-reflexao');
    }
    // RESUMO / CONCEITOS / CHECKLIST -> box-informativo
    else if (text.includes('resumo do capítulo') || text.includes('conceito central')) {
        wrapNextUntilHeading(heading, 'box-informativo');
    }
    // CUIDADO / ATENÇÃO / AVISO -> box-cuidado
    else if (text.startsWith('aviso') || text.includes('atenção') || text.includes('cuidado') || text.includes('nota importante') || text.includes('warning') || text.includes('alert')) {
        wrapNextUntilHeading(heading, 'box-cuidado');
    }
    // REFERÊNCIAS / FONTES CONSULTADAS -> secao-referencias
    else if (text.includes('referências') || text.includes('referencias') || text.includes('fontes consultadas') || text.includes('referência bibliográfica') || text.includes('referências bibliográficas')) {
        wrapNextUntilHeading(heading, 'secao-referencias');
    }
    // CAPÍTULOS -> force the "Chapter Opener" visual
    else if (text.startsWith('capítulo')) {
        const match = originalText.match(/Capítulo\s*(\d+)\s*[-|:—–]*\s*(.*)/i);
        if (match) {
            const num = match[1];
            let title = match[2] || '';
            // Remove any leading punctuation that might have slipped through
            title = title.replace(/^[-|:—–]+\s*/, '').trim();
            
            // If the title is empty on the heading, the AI might have provided it on the next line
            if (!title && heading.nextElementSibling) {
                const nextTag = heading.nextElementSibling.tagName.toLowerCase();
                if (nextTag === 'p' || nextTag === 'h1' || nextTag === 'h2' || nextTag === 'h3' || nextTag === 'h4') {
                    // It's very likely the title
                    title = heading.nextElementSibling.textContent?.trim() || '';
                    heading.parentNode?.removeChild(heading.nextElementSibling);
                }
            }
            
            const opener = doc.createElement('div');
            opener.className = 'chapter-opener';
            opener.innerHTML = `
                <div class="chapter-number">${num.padStart(2, '0')}</div>
                <h1 style="border:none; margin:0; padding:0">${title || originalText}</h1>
            `;
            heading.parentNode?.replaceChild(opener, heading);

            const chapterBreak = doc.createElement('div');
            chapterBreak.className = 'manual-page-break';
            chapterBreak.setAttribute('data-page-break', 'true');
            opener.parentNode?.insertBefore(chapterBreak, opener.nextSibling);
        }
    }
  });

  // Filter out sections that are treated as standalone high-fidelity dedicated pages (Aviso / CTA / Contatos / Sumário)
  // so they are not duplicated in the main flow
  const allHeadings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
  allHeadings.forEach((heading) => {
    const text = heading.textContent?.toLowerCase() || '';
    if (
      text.includes('aviso importante') || 
      text.includes('aviso educativo') || 
      text.includes('aviso legal') || 
      text.includes('disclaimer') ||
      text.includes('um convite') || 
      text.includes('chamada para ação') || 
      text.includes('fale conosco') || 
      text.includes('fale com a gente') || 
      text.includes('fale com a conexão seres') ||
      text.includes('fale com a conexao seres') ||
      text.includes('sobre o agendamento') || 
      text.includes('agendamento e contato') || 
      text.includes('cta') ||
      text.includes('sumário') ||
      text.includes('sumario') ||
      text.includes('índice') ||
      text.includes('indice') ||
      text.includes('table of contents') ||
      text.includes('table of content')
    ) {
      removeNextUntilHeading(heading);
    }
  });

  // Remove instructions that GPT includes incorrectly
  const instructionsRegex = /inter regular|inter medium|inter bold|fonte recomendada|instalação de design|nota de design|instruções para o design|^\\*\\*\\s*instruções/i;
  
  const paragraphs = doc.querySelectorAll('p, blockquote, em, strong, div');
  paragraphs.forEach((p) => {
    const text = p.textContent?.trim().toLowerCase() || '';
    if (
        instructionsRegex.test(text) || 
        text.startsWith('** inter') ||
        text.startsWith('**fonte') ||
        text.startsWith('**nota') ||
        (text.includes('title:') && text.includes('subtitle:')) ||
        (text.includes('titulo:') && text.includes('subtitulo:')) ||
        (text.includes('author:') && text.includes('credencial:')) ||
        (text.includes('autora:') && text.includes('credencial:')) ||
        (text.includes('instituicao:') || text.includes('instituição:')) ||
        ((text.startsWith('**') || text.startsWith('nota:')) && text.includes('design'))
    ) {
        // Remove metadata/instructions completely regardless of length if it matches these specific aggressive patterns
        if (text.length < 200 || (text.includes('titulo:') && text.includes('subtitulo:'))) {
            p.remove();
        }
    }
  });

  // Blockquotes -> frase-central
  const blockquotes = doc.querySelectorAll('blockquote');
  blockquotes.forEach((bq) => {
      const div = doc.createElement('div');
      div.className = 'frase-central';
      
      // Clean up empty paragraphs or brs inside blockquote that cause spacing issues
      const contentNodes = Array.from(bq.childNodes);
      contentNodes.forEach(node => {
          if (node.nodeName.toLowerCase() === 'p') {
              const p = node as HTMLElement;
              if (!p.textContent?.trim() && !p.querySelector('img')) {
                  p.remove();
              }
          }
      });

      div.innerHTML = bq.innerHTML;
      bq.parentNode?.replaceChild(div, bq);
  });

  convertChecklistSections(doc);

  // Ensure manual page breaks are top-level children of doc.body so the paginator detects them and layout is safe
  const manualBreaks = Array.from(doc.querySelectorAll('.manual-page-break'));
  manualBreaks.forEach((br) => {
    let parent = br.parentNode;
    if (parent && parent !== doc.body) {
      // Find the direct sibling parent of doc.body
      let ancestor: Node = br;
      while (ancestor.parentNode && ancestor.parentNode !== doc.body) {
        ancestor = ancestor.parentNode;
      }
      if (ancestor && ancestor.parentNode === doc.body) {
        // Insert it right after the block element ancestor in doc.body
        doc.body.insertBefore(br, ancestor.nextSibling);
      }
    }
  });

  // Transform specific links into buttons
  const allLinks = Array.from(doc.querySelectorAll('a'));
  allLinks.forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (
      href.includes('wa.me/5511964818096') || 
      href.includes('conexaoseres.com.br/agendar-avaliacao-e-contato') || 
      href.includes('maps.app.goo.gl/MKFq5ErMY2tHTFED6')
    ) {
      a.style.textDecoration = 'underline';
      a.style.fontWeight = '500';
    } else if (href.includes('instagram.com/conexao.seres')) {
      a.setAttribute('href', 'https://www.instagram.com/conexao.seres');
    } else if (href.includes('contato@conexaoseres.com.br') || a.textContent?.includes('contato@conexaoseres.com.br')) {
      a.setAttribute('href', 'mailto:contato@conexaoseres.com.br');
    }
  });

  // Style tables and handle wide tables (5+ columns)
  const tables = doc.querySelectorAll('table');
  tables.forEach((table) => {
    table.classList.add('markdown-table');
    const headers = table.querySelectorAll('th');
    if (headers.length >= 5) {
      table.classList.add('wide-table');
    }
  });

  // Extract metadata to identify fields to remove at the start of the book
  const metadata = extractMetadataFromContent(blocks);

  // Remove leading metadata elements that repeat cover/title page details
  let currentChild = doc.body.firstElementChild;
  while (currentChild) {
    const nextChild = currentChild.nextElementSibling;
    const tagName = currentChild.tagName.toLowerCase();
    const textContent = currentChild.textContent || '';
    const textLower = textContent.toLowerCase().trim();

    // Stop conditions
    if (currentChild.classList.contains('chapter-opener') || textLower.startsWith('capítulo') || textLower.startsWith('capitulo') || textLower.startsWith('chapter')) {
      break;
    }
    if (['table', 'ul', 'ol', 'blockquote'].includes(tagName) || currentChild.classList.contains('frase-central')) {
      break;
    }
    if (currentChild.classList.contains('checklist-item') || currentChild.classList.contains('fill-line')) {
      break;
    }
    if (textContent.length > 200) {
      break;
    }

    if (isMetadataElement(textContent, metadata)) {
      currentChild.remove();
    } else {
      break;
    }

    currentChild = nextChild;
  }

  return doc.body.innerHTML;
}

function isMetadataElement(text: string, metadata: Partial<ProjectSettings>): boolean {
  const normText = text.toLowerCase().trim();
  if (!normText) return true; // empty elements can be skipped/removed

  const clean = (s?: string) => {
    if (!s) return '';
    return s.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/[^a-z0-9]/g, ''); // alphanumeric only
  };

  const cleanText = clean(normText);
  if (!cleanText) return true;

  const fieldsToCheck = [
    metadata.title,
    metadata.subtitle,
    metadata.professionalName,
    metadata.professionalTitle,
    metadata.professionalReg,
    metadata.brand,
    metadata.website,
    metadata.materialType,
  ];

  for (const val of fieldsToCheck) {
    if (!val) continue;
    const cleanVal = clean(val);
    if (cleanVal && (cleanText === cleanVal || cleanText.includes(cleanVal) || cleanVal.includes(cleanText))) {
      return true;
    }
  }

  const prefixes = [
    'autora:', 'autor:', 'profissional:', 'credencial:', 'instituicao:', 'instituição:',
    'website:', 'site:', 'tipo:', 'observacao:', 'observação:', 'warning:', 'aviso:',
    'marca:', 'subtítulo:', 'subtitulo:', 'título:', 'titulo:'
  ];
  for (const pref of prefixes) {
    if (normText.startsWith(pref)) {
      const rest = normText.slice(pref.length).trim();
      if (!rest) return true;
      const cleanRest = clean(rest);
      for (const val of fieldsToCheck) {
        if (!val) continue;
        const cleanVal = clean(val);
        if (cleanVal && (cleanRest === cleanVal || cleanRest.includes(cleanVal) || cleanVal.includes(cleanRest))) {
          return true;
        }
      }
    }
  }

  return false;
}

function wrapNextUntilHeading(startElement: Element, className: string) {
    const wrapper = document.createElement('div');
    wrapper.className = className;
    
    const parent = startElement.parentNode;
    if (!parent) return;

    parent.insertBefore(wrapper, startElement);
    
    let current: Element | null = startElement;
    while (current) {
        const next: Element | null = current.nextElementSibling;
        const tagName = current.tagName.toLowerCase();
        
        if (current !== startElement && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
            break;
        }

        wrapper.appendChild(current);
        current = next;
    }
}

function removeNextUntilHeading(startElement: Element) {
    const parent = startElement.parentNode;
    if (!parent) return;

    let current: Element | null = startElement;
    while (current) {
        const next: Element | null = current.nextElementSibling;
        const tagName = current.tagName.toLowerCase();
        
        if (current !== startElement && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
            break;
        }

        parent.removeChild(current);
        current = next;
    }
}

function convertChecklistSections(doc: Document) {
  const bodyChildren = Array.from(doc.body.children);
  const checklistHeadingPattern = /(checklist|exerc[ií]cio|atividade|marque|assinale|sinalize|preencha|o que mais pesa|itens para marcar)/i;
  const checklistIntroPattern = /(marque|assinale|sinalize|preencha|selecione).*(pontos|itens|opções|opcoes|campos|alternativas)/i;

  const isHeading = (node: Element) => /^h[1-6]$/i.test(node.tagName);
  const isPromptLabel = (node: Element) => {
    const tagName = node.tagName.toLowerCase();
    if (!["p", "div"].includes(tagName)) return false;
    if (node.querySelector("a, img, table")) return false;
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return false;
    if (text.length > 140) return false;
    return /[:?]$/.test(text);
  };
  const isShortChecklistCandidate = (node: Element, allowExpandedHeuristics = false) => {
    if (node.tagName.toLowerCase() !== "p") return false;
    if (node.querySelector("a, img, strong, em, table")) return false;
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return false;
    if (!allowExpandedHeuristics) {
      if (text.length > 90) return false;
      if (/[.:;!?]$/.test(text)) return false;
    } else {
      if (text.length > 220) return false;
    }

    const wordCount = text.split(" ").filter(Boolean).length;
    return allowExpandedHeuristics ? wordCount <= 28 : wordCount <= 8;
  };

  const createChecklistNode = (text: string) => {
    const wrapper = doc.createElement("div");
    wrapper.className = "checklist-item";

    const box = doc.createElement("div");
    box.className = "checklist-box";

    const label = doc.createElement("div");
    label.className = "checklist-text";
    label.textContent = text;

    wrapper.appendChild(box);
    wrapper.appendChild(label);
    return wrapper;
  };

  bodyChildren.forEach((node) => {
    if (!isHeading(node)) return;

    const headingText = (node.textContent || "").trim();
    let cursor = node.nextElementSibling;
    let introNode: Element | null = null;
    let shouldTreatAsChecklist = checklistHeadingPattern.test(headingText);
    let allowExpandedHeuristics = false;
    let seenNarrativeContent = false;

    if (cursor && cursor.tagName.toLowerCase() === "p") {
      const introText = (cursor.textContent || "").replace(/\s+/g, " ").trim();
      if (checklistIntroPattern.test(introText)) {
        introNode = cursor;
        shouldTreatAsChecklist = true;
        allowExpandedHeuristics = true;
        cursor = cursor.nextElementSibling;
      }
    }

    const candidateNodes: Element[] = [];
    while (cursor && !isHeading(cursor)) {
      if (cursor.classList.contains("manual-page-break")) break;

      if (cursor.tagName.toLowerCase() === "ul" || cursor.tagName.toLowerCase() === "ol") {
        if (!shouldTreatAsChecklist) {
          break;
        }
        const listItems = Array.from(cursor.querySelectorAll(":scope > li"));
        if (listItems.length >= 2) {
          listItems.forEach((item) => {
            const text = (item.textContent || "").replace(/\s+/g, " ").trim();
            if (text) {
              const checklistNode = createChecklistNode(text);
              cursor?.parentNode?.insertBefore(checklistNode, cursor);
            }
          });
          const listToRemove = cursor;
          cursor = cursor.nextElementSibling;
          listToRemove.remove();
          continue;
        }
      }

      if (isPromptLabel(cursor)) {
        const next = cursor.nextElementSibling;
        if (next && isShortChecklistCandidate(next, true)) {
          shouldTreatAsChecklist = true;
          allowExpandedHeuristics = true;
          cursor = next;
          continue;
        }
      }

      if (!isShortChecklistCandidate(cursor, allowExpandedHeuristics)) {
        if ((cursor.textContent || "").replace(/\s+/g, " ").trim()) {
          seenNarrativeContent = true;
        }
        break;
      }

      candidateNodes.push(cursor);
      cursor = cursor.nextElementSibling;
    }

    if (!shouldTreatAsChecklist && candidateNodes.length >= 3 && !seenNarrativeContent) {
      shouldTreatAsChecklist = true;
    }

    if (!shouldTreatAsChecklist || candidateNodes.length < 2) return;

    candidateNodes.forEach((paragraphNode) => {
      const text = (paragraphNode.textContent || "").replace(/\s+/g, " ").trim();
      const checklistNode = createChecklistNode(text);
      paragraphNode.parentNode?.replaceChild(checklistNode, paragraphNode);
    });

    if (introNode) {
      introNode.classList.add("checklist-intro");
    }
  });
}

/**
 * Extracts and updates the metadata properties strictly from content files.
 * This ensures content (titles, author, warn, cta) is separate from layout files.
 */
export function extractMetadataFromContent(blocks: ContentBlock[]): Partial<ProjectSettings> {
  const result: Partial<ProjectSettings> = {};
  if (blocks.length === 0) return result;

  const mergedMarkdown = blocks.map(b => b.content).join('\n\n');
  const stripMarkdownDecoration = (value: string) =>
    value
      .replace(/^\s*[-*]\s*/, '')
      .replace(/\*/g, '')
      .replace(/__/g, '')
      .replace(/^\s*:\s*/, '')
      .replace(/[<>]/g, '')
      .trim();
  const isMeaningfulMetadataValue = (value?: string) => {
    if (!value) return false;
    const normalized = value.trim();
    if (!normalized) return false;
    if (/^[*:]+$/.test(normalized)) return false;
    return /[A-Za-z0-9À-ÿ@]/.test(normalized);
  };

  // 1. Yaml-based frontmatter parser
  for (const block of blocks) {
    const frontmatterMatch = block.content.match(/(?:^|\n)---\r?\n([\s\S]*?)\r?\n---/);
    if (frontmatterMatch) {
      const yamlContent = frontmatterMatch[1];
      const lines = yamlContent.split('\n');
      lines.forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
          const key = parts[0].trim().toLowerCase();
          const value = parts.slice(1).join(':').trim().replace(/^["']|["']$/g, '');
          
          switch(key) {
            case 'title':
            case 'titulo':
              result.title = value;
              result.shortTitle = value;
              break;
          case 'subtitle':
          case 'subtitulo':
            result.subtitle = value;
            break;
          case 'author':
          case 'profissional':
          case 'autora':
          case 'autor':
            result.professionalName = value;
            break;
          case 'title_professional':
          case 'cargo':
          case 'credencial':
            result.professionalTitle = value; // Could be just the title or title + reg
            break;
          case 'reg':
          case 'registro':
          case 'crefito':
          case 'crm':
          case 'crp':
            result.professionalReg = value;
            break;
          case 'brand':
          case 'marca':
          case 'instituicao':
          case 'instituição':
            result.brand = value;
            break;
          case 'website':
          case 'site':
            result.website = value;
            break;
          case 'whatsapp':
            result.whatsapp = value;
            break;
          case 'email':
          case 'e-mail':
            result.email = value;
            break;
          case 'instagram':
            result.instagram = value;
            break;
          case 'address':
          case 'endereco':
          case 'endereço':
            result.contactAddress = value;
            break;
          case 'schedulingurl':
          case 'agendamento':
            result.schedulingUrl = value;
            break;
          case 'warning':
          case 'aviso':
          case 'observacao':
          case 'observação':
            result.educationalWarning = value;
            break;
          case 'editionyear':
          case 'ano':
            result.editionYear = value;
            break;
          case 'isbn':
            result.isbn = value;
            break;
          case 'ctatext':
          case 'cta':
            result.ctaText = value;
            break;
          case 'ctabuttontext':
            result.ctaButtonText = value;
            break;
          case 'materialtype':
          case 'tipo':
            result.materialType = value;
            break;
          case 'pageformat':
          case 'formato':
            if (/16\s*x\s*23/i.test(value)) result.pageFormat = '16x23';
            else if (/11[,.]?5\s*x\s*18/i.test(value)) result.pageFormat = '11_5x18';
            else if (/20\s*x\s*20/i.test(value)) result.pageFormat = '20x20';
            else result.pageFormat = 'a4';
            break;
          case 'targetaudience':
          case 'publico':
          case 'tema':
            result.targetAudience = value; // We can put 'tema' into targetAudience or just ignore since we don't have a specific field.
            break;
        }
      }
    });
  }
}

  // 2. Line scanner for non-frontmatter files
  const lines = mergedMarkdown.split('\n');
  const findValueInLines = (regex: RegExp): string | null => {
    for (const line of lines) {
      const match = line.match(regex);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  };

  // Title
  if (!result.title) {
    const titleMatch = findValueInLines(/^#\s+(?!aviso|cta|conexão|conexao|chamada|um convite|conteúdo|conteudo|capítulo|capitulo|chapter|seção|secao|parte|bloco|sumário|sumario|índice|indice|index|table of contents)(.*)$/i);
    if (titleMatch) {
      const looksLikeChapterTitle = /^(capítulo|capitulo|chapter)\s+\d+/i.test(titleMatch.trim());
      if (!looksLikeChapterTitle) {
        result.title = titleMatch;
        result.shortTitle = titleMatch;
      }
    }
  }

  // Subtitle
  if (!result.subtitle) {
    const subtitleHeading = findValueInLines(/^##\s+(?!aviso|cta|conexão|chamada|um convite|capítulo|parte|bloco|sumário|sumario|índice|indice|index|table of contents)(.*)$/i);
    if (subtitleHeading) {
      result.subtitle = subtitleHeading;
    } else {
      const subVal = findValueInLines(/(?:Subtítulo|Subtitle):\s*(.*)/i);
      if (subVal) result.subtitle = subVal;
    }
  }

  // Brand
  if (!result.brand) {
    const brandVal = findValueInLines(/(?:Marca|Brand):\s*(.*)/i);
    if (brandVal) result.brand = brandVal;
  }

  // Author / Professional
  if (!result.professionalName) {
    const nameVal = findValueInLines(/(?:Profissional|Autor):\s*(.*)/i);
    if (nameVal) {
      const parts = nameVal.split(/\s*—\s*|\s*-\s*/);
      result.professionalName = parts[0].trim();
      if (parts.length >= 2 && !result.professionalTitle) result.professionalTitle = parts[1].trim();
      if (parts.length >= 3 && !result.professionalReg) result.professionalReg = parts[2].trim();
    }
  }

  if (!result.professionalTitle) {
    const titleVal = findValueInLines(/(?:Cargo|Especialidade):\s*(.*)/i);
    if (titleVal) result.professionalTitle = titleVal;
  }

  if (!result.professionalReg) {
    const regVal = findValueInLines(/(?:Registro|CREFITO|Inscrição):\s*(.*)/i);
    if (regVal) result.professionalReg = regVal;
  }

  if (!result.professionalReg && result.professionalTitle) {
    const regMatch = result.professionalTitle.match(/(CREFITO[^—–\n]*)/i);
    if (regMatch) {
      result.professionalReg = regMatch[1].trim();
      result.professionalTitle = result.professionalTitle
        .replace(regMatch[1], '')
        .replace(/\s*[—–-]\s*$/, '')
        .trim();
    }
  }

  const extractContactVal = (val: string) => {
      const markdownLinkMatch = val.match(/\[.*?\]\((.*?)\)/);
      if (markdownLinkMatch) return stripMarkdownDecoration(markdownLinkMatch[1]);
      const htmlHrefMatch = val.match(/href="([^"]+)"/i);
      if (htmlHrefMatch) return stripMarkdownDecoration(htmlHrefMatch[1]);
      return stripMarkdownDecoration(val);
  };

  // Contacts
  if (!result.website) {
    const siteVal = findValueInLines(/(?:Site|Website):\s*(.*)/i);
    if (siteVal) {
      const normalized = extractContactVal(siteVal);
      if (isMeaningfulMetadataValue(normalized)) result.website = normalized;
    }
  }

  if (!result.whatsapp) {
    const whatsappVal = findValueInLines(/(?:WhatsApp|Whats):\s*(.*)/i);
    if (whatsappVal) {
      const normalized = extractContactVal(whatsappVal);
      if (isMeaningfulMetadataValue(normalized)) result.whatsapp = normalized;
    }
  }

  if (!result.email) {
    const emailVal = findValueInLines(/(?:E-mail|Email):\s*(.*)/i);
    if (emailVal) {
      const normalized = extractContactVal(emailVal);
      if (isMeaningfulMetadataValue(normalized)) result.email = normalized;
    }
  }

  if (!result.instagram) {
    const instaVal = findValueInLines(/(?:Instagram|Insta):\s*(.*)/i);
    if (instaVal) {
      const normalized = extractContactVal(instaVal);
      if (isMeaningfulMetadataValue(normalized)) result.instagram = normalized;
    }
  }

  if (!result.contactAddress) {
    const addressVal = findValueInLines(/(?:Endereço|Localização):\s*(.*)/i);
    if (addressVal) {
      const normalized = stripMarkdownDecoration(addressVal);
      if (isMeaningfulMetadataValue(normalized) && normalized !== ':') result.contactAddress = normalized;
    }
  }

  if (!result.schedulingUrl) {
    const scheduleVal = findValueInLines(/(?:Agendamento):\s*(https?:\/\/[^\s]+)/i);
    if (scheduleVal) result.schedulingUrl = scheduleVal;
  }

  if (!result.editionYear) {
    const editionYearVal = findValueInLines(/(?:Ano da Edição|Ano):\s*(\d{4})/i);
    if (editionYearVal) result.editionYear = editionYearVal;
  }

  if (!result.isbn) {
    const isbnVal = findValueInLines(/(?:ISBN):\s*([0-9Xx\- ]{10,20})/i);
    if (isbnVal) result.isbn = isbnVal;
  }

  if (!result.whatsapp) {
    const whatsappMatch = mergedMarkdown.match(/https:\/\/wa\.me\/[^\s)"'>]+/i);
    if (whatsappMatch) result.whatsapp = whatsappMatch[0];
  }

  if (!result.schedulingUrl) {
    const schedulingMatch = mergedMarkdown.match(/https:\/\/conexaoseres\.com\.br\/agendar-avaliacao-e-contato\/?/i);
    if (schedulingMatch) result.schedulingUrl = schedulingMatch[0];
  }

  if (!result.website) {
    const websiteMatch = mergedMarkdown.match(/https:\/\/conexaoseres\.com\.br\/?(?!agendar-avaliacao-e-contato)/i);
    if (websiteMatch) result.website = websiteMatch[0];
  }

  if (!result.email) {
    const emailMatch = mergedMarkdown.match(/\b[A-Z0-9._%+-]+@conexaoseres\.com\.br\b/i);
    if (emailMatch) result.email = emailMatch[0];
  }

  if (!result.instagram) {
    const instagramMatch = mergedMarkdown.match(/@conexao\.seres\b/i);
    if (instagramMatch) result.instagram = instagramMatch[0];
  }

  if (!isMeaningfulMetadataValue(result.contactAddress) || result.contactAddress === "**") {
    const addressMatch = mergedMarkdown.match(/Rua Petrobr[aá]s,\s*683[\s\S]*?CEP\s*03474-060/i);
    if (addressMatch) {
      result.contactAddress = addressMatch[0].replace(/\s*\n\s*/g, " ").trim();
    }
  }

  // Disclaimer warning body
  const warningHeaderMatch = mergedMarkdown.match(/(?:###|##|#)\s*(?:aviso importante|aviso educativo|aviso legal|disclaimer)[\s\S]*?\r?\n([\s\S]*?)(?=\r?\n(?:###|##|#)\s|$)/i);
  if (warningHeaderMatch && warningHeaderMatch[1]) {
    const warningText = warningHeaderMatch[1].replace(/\n---\s*$/m, '').trim();
    if (!result.educationalWarning || warningText.length > result.educationalWarning.length) {
      result.educationalWarning = warningText;
    }
  }

  // CTA text body
  const ctaHeaderMatch = mergedMarkdown.match(/(?:###|##|#)\s*(?:\d+(?:\.\d+)*)?\s*(?:um convite|chamada para ação|fale conosco|fale com a gente|fale com a conex[aã]o seres|sobre o agendamento|agendamento e contato|cta)[\s\S]*?\r?\n([\s\S]*?)(?=\r?\n(?:###|##|#)\s|$)/i);
  if (ctaHeaderMatch && ctaHeaderMatch[1]) {
    const rawSection = ctaHeaderMatch[1].replace(/\n---\s*$/m, '').trim();
    const sectionLines = rawSection.split(/\r?\n/);
    const ctaParagraphLines: string[] = [];

    for (const line of sectionLines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (ctaParagraphLines.length > 0) ctaParagraphLines.push("");
        continue;
      }
      if (trimmed.startsWith("**") || trimmed.startsWith("<a ") || /^@[\w.]+/.test(trimmed)) {
        break;
      }
      ctaParagraphLines.push(trimmed);
    }

    const normalizedCtaText = ctaParagraphLines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (normalizedCtaText && !result.ctaText) {
      result.ctaText = normalizedCtaText;
    }

    if (!result.ctaButtonText) {
      if (/Enviar mensagem pelo WhatsApp/i.test(rawSection)) {
        result.ctaButtonText = "Enviar mensagem pelo WhatsApp";
      } else if (/Agendar avaliação e contato/i.test(rawSection)) {
        result.ctaButtonText = "Agendar avaliação e contato";
      }
    }
  }

  return result;
}
