import { marked } from 'marked';
import { ContentBlock, ProjectSettings } from '../types';

/**
 * Parses and extracts text content into structured HTML layout
 * Blocks representing Aviso/Disclaimer and CTA are styled in separate sections,
 * and filtered out of standard text pages so they don't repeat.
 */
export async function parseEbookContent(blocks: ContentBlock[]): Promise<string> {
  // 1. Merge and Clean
  let mergedMarkdown = blocks
    .map((b) => b.content)
    .join('\n\n---\n\n');

  // Remove generic identifiers like "# Parte 1", "Parte 1", "# Bloco 1", etc alone on a line
  mergedMarkdown = mergedMarkdown.replace(/^[#\s]*(Parte|Bloco|Arquivo|Conteúdo|Cap[íi]tulo\s+Extra)\s*\d+.*$/gim, '');

  // 2. Parse Markdown to HTML
  let html = await marked.parse(mergedMarkdown, { async: true });

  // 3. Post-Process HTML for specific boxes and filters
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Handle chapters and boxes
  const headings = doc.querySelectorAll('h1, h2, h3, h4');
  
  headings.forEach((heading) => {
    const text = heading.textContent?.toLowerCase() || '';

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
    // CAPÍTULOS -> force the "Chapter Opener" visual
    else if (text.startsWith('capítulo')) {
        const match = text.match(/capítulo\s*(\d+)\s*[-|:]?\s*(.*)/i);
        if (match) {
            const num = match[1];
            const title = match[2];
            
            const opener = doc.createElement('div');
            opener.className = 'chapter-opener';
            opener.innerHTML = `
                <div class="chapter-number">${num.padStart(2, '0')}</div>
                <h1 style="border:none; margin:0; padding:0">${title || text}</h1>
            `;
            heading.parentNode?.replaceChild(opener, heading);
        }
    }
  });

  // Filter out sections that are treated as standalone high-fidelity dedicated pages (Aviso / CTA / Contatos / Sumário)
  // so they are not duplicated in the main flow
  const allHeadings = doc.querySelectorAll('h1, h2, h3, h4');
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
      text.includes('fale com a conexão seres') || 
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
        (text.includes('titulo:') && text.includes('subtitulo:')) ||
        (text.includes('autora:') && text.includes('credencial:')) ||
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
        
        if (current !== startElement && ['h1', 'h2', 'h3', 'h4', 'h5'].includes(tagName)) {
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
        
        if (current !== startElement && ['h1', 'h2', 'h3', 'h4', 'h5'].includes(tagName)) {
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
  const frontmatterMatch = mergedMarkdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
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
    const titleMatch = findValueInLines(/^#\s+(?!aviso|cta|conexão|chamada|um convite|conteúdo|parte|bloco|sumário|sumario|índice|indice|index|table of contents)(.*)$/i);
    if (titleMatch) {
      result.title = titleMatch;
      result.shortTitle = titleMatch;
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

  // Contacts
  if (!result.website) {
    const siteVal = findValueInLines(/(?:Site|Website):\s*(https?:\/\/[^\s]+)/i);
    if (siteVal) result.website = siteVal;
  }

  if (!result.whatsapp) {
    const whatsappVal = findValueInLines(/(?:WhatsApp|Whats):\s*(https?:\/\/[^\s]+|wa\.me\/\S+)/i);
    if (whatsappVal) result.whatsapp = whatsappVal;
  }

  if (!result.email) {
    const emailVal = findValueInLines(/(?:E-mail|Email):\s*(\S+@\S+\.\S+)/i);
    if (emailVal) result.email = emailVal;
  }

  if (!result.instagram) {
    const instaVal = findValueInLines(/(?:Instagram):\s*(@?\S+)/i);
    if (instaVal) result.instagram = instaVal;
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
  const ctaHeaderMatch = mergedMarkdown.match(/(?:#|##|###)\s*(?:um convite|chamada para ação|fale conosco|fale com a conexão seres|sobre o agendamento|cta)[\s\S]*?\r?\n([\s\S]*?)(?=\r?\n(?:#|##|###|\n|$))/i);
  if (ctaHeaderMatch && ctaHeaderMatch[1] && !result.ctaText) {
    result.ctaText = ctaHeaderMatch[1].trim();
  }

  return result;
}
