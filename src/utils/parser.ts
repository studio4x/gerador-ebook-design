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
    return content;
  });

  let mergedMarkdown = cleanedContents.join('\n\n<!-- block-separator -->\n\n');

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
      text.includes('sobre o agendamento') || 
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

  return doc.body.innerHTML;
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

/**
 * Extracts and updates the metadata properties strictly from content files.
 * This ensures content (titles, author, warn, cta) is separate from layout files.
 */
export function extractMetadataFromContent(blocks: ContentBlock[]): Partial<ProjectSettings> {
  const result: Partial<ProjectSettings> = {};
  if (blocks.length === 0) return result;

  const mergedMarkdown = blocks.map(b => b.content).join('\n\n');

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
            result.educationalWarning = value;
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

  const extractContactVal = (val: string) => {
      const match = val.match(/\[.*?\]\((.*?)\)/);
      if (match) return match[1];
      return val.replace(/[<>\*]/g, '').trim();
  };

  // Contacts
  if (!result.website) {
    const siteVal = findValueInLines(/(?:Site|Website):\s*(.*)/i);
    if (siteVal) result.website = extractContactVal(siteVal);
  }

  if (!result.whatsapp) {
    const whatsappVal = findValueInLines(/(?:WhatsApp|Whats):\s*(.*)/i);
    if (whatsappVal) result.whatsapp = extractContactVal(whatsappVal);
  }

  if (!result.email) {
    const emailVal = findValueInLines(/(?:E-mail|Email):\s*(.*)/i);
    if (emailVal) result.email = extractContactVal(emailVal);
  }

  if (!result.instagram) {
    const instaVal = findValueInLines(/(?:Instagram|Insta):\s*(.*)/i);
    if (instaVal) result.instagram = extractContactVal(instaVal);
  }

  if (!result.contactAddress) {
    const addressVal = findValueInLines(/(?:Endereço|Localização):\s*(.*)/i);
    if (addressVal) result.contactAddress = addressVal;
  }

  if (!result.schedulingUrl) {
    const scheduleVal = findValueInLines(/(?:Agendamento):\s*(https?:\/\/[^\s]+)/i);
    if (scheduleVal) result.schedulingUrl = scheduleVal;
  }

  // Disclaimer warning body
  const warningHeaderMatch = mergedMarkdown.match(/(?:#|##|###)\s*(?:aviso importante|aviso educativo|aviso legal|disclaimer)[\s\S]*?\r?\n([\s\S]*?)(?=\r?\n(?:#|##|###|\n|$))/i);
  if (warningHeaderMatch && warningHeaderMatch[1] && !result.educationalWarning) {
    result.educationalWarning = warningHeaderMatch[1].trim();
  }

  // CTA text body
  const ctaHeaderMatch = mergedMarkdown.match(/(?:#|##|###)\s*(?:um convite|chamada para ação|fale conosco|fale com a gente|sobre o agendamento|cta)[\s\S]*?\r?\n([\s\S]*?)(?=\r?\n(?:#|##|###|\n|$))/i);
  if (ctaHeaderMatch && ctaHeaderMatch[1] && !result.ctaText) {
    let rawText = ctaHeaderMatch[1].trim();
    
    // Look for a Markdown link to extract for the CTA button
    const linkMatch = rawText.match(/\[(.*?)\]\((https?:\/\/[^\s]+)\)/);
    if (linkMatch) {
      if (!result.ctaButtonText) result.ctaButtonText = linkMatch[1].replace(/[*_]/g, '');
      if (!result.schedulingUrl && !result.whatsapp) {
         result.schedulingUrl = linkMatch[2]; // Use as primary url for button
      }
      // Remove the markdown link from the text body so we don't render "[label](url)" literally
      rawText = rawText.replace(linkMatch[0], '').trim();
    }
    
    result.ctaText = rawText;
  }

  return result;
}
