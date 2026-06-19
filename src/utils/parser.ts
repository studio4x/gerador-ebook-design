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

  // Filter out sections that are treated as standalone high-fidelity dedicated pages (Aviso / CTA / Contatos)
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
      text.includes('cta')
    ) {
      removeNextUntilHeading(heading);
    }
  });

  // Blockquotes -> frase-central
  const blockquotes = doc.querySelectorAll('blockquote');
  blockquotes.forEach((bq) => {
      const p = doc.createElement('p');
      p.className = 'frase-central';
      p.innerHTML = bq.innerHTML;
      bq.parentNode?.replaceChild(p, bq);
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
            result.professionalName = value;
            break;
          case 'title_professional':
          case 'cargo':
            result.professionalTitle = value;
            break;
          case 'reg':
          case 'registro':
          case 'crefito':
            result.professionalReg = value;
            break;
          case 'brand':
          case 'marca':
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
            result.materialType = value;
            break;
          case 'targetaudience':
          case 'publico':
            result.targetAudience = value;
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
    const titleMatch = findValueInLines(/^#\s+(?!aviso|cta|conexão|chamada|um convite|conteúdo|parte|bloco)(.*)$/i);
    if (titleMatch) {
      result.title = titleMatch;
      result.shortTitle = titleMatch;
    }
  }

  // Subtitle
  if (!result.subtitle) {
    const subtitleHeading = findValueInLines(/^##\s+(?!aviso|cta|conexão|chamada|um convite|capítulo|parte|bloco)(.*)$/i);
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
