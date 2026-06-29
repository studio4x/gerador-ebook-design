import { ProjectSettings } from '../types';

export interface LayoutRevision {
  id: string;
  filename: string;
  uploadedAt: string;
  settings: ProjectSettings;
  rawContent: string;
}

export function parseHandoffMarkdown(markdown: string): Partial<ProjectSettings> {
  const result: Partial<ProjectSettings> = {};

  const lines = markdown.split('\n');
  const getSection = (heading: string): string => {
    const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = markdown.match(new RegExp(`##\\s+${escapedHeading}[\\s\\S]*?(?=\\n##\\s+|$)`, 'i'));
    return match ? match[0] : markdown;
  };
  const layoutSection = getSection('Opções Visuais de Layout');
  const metadataSection = getSection('Metadados do E-book');
  const cleanValue = (value: string | null): string | null => {
    if (!value) return null;
    const normalized = value.replace(/\*\*/g, '').trim();
    if (!normalized) return null;
    if (/^[*:]+$/.test(normalized)) return null;
    if (/seusite\.com\.br|@seu\.instagram|Seu Registro/i.test(normalized)) return null;
    if (/wa\.me\/5511999999999/i.test(normalized)) return null;
    if (/contato@seusite\.com\.br/i.test(normalized)) return null;
    return normalized;
  };

  // Helper matching functions
  const findValue = (keyRegex: RegExp, sourceLines: string[] = lines): string | null => {
    for (const line of sourceLines) {
      const match = line.match(keyRegex);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  };
  const layoutLines = layoutSection.split('\n');
  const metadataLines = metadataSection.split('\n');

  // 1. Density Mode (Visual Layout Option)
  const densityVal = findValue(/(?:Modo de Distribuição|Densidade|densityMode|Density):\s*(compacto|confortável|premium|compact|comfortable|premium)/i, layoutLines);
  if (densityVal) {
    const norm = densityVal.toLowerCase();
    if (norm.includes('compacto') || norm.includes('compact')) {
      result.densityMode = 'compact';
    } else if (norm.includes('premium')) {
      result.densityMode = 'premium';
    } else {
      result.densityMode = 'comfortable';
    }
  }

  // 2. Generate TOC / Table of Contents (Visual Page Option)
  const tocVal = findValue(/(?:Gerar Sumário|Sumário|TOC|generateToc):\s*(sim|não|true|false)/i, layoutLines);
  if (tocVal) {
    const norm = tocVal.toLowerCase();
    result.generateToc = norm.includes('sim') || norm.includes('true');
  }

  const formatVal = findValue(/(?:Formato do Material|Formato|Page Format|pageFormat):\s*(A4|16\s*x\s*23|11,?5\s*x\s*18|20\s*x\s*20)/i, layoutLines);
  if (formatVal) {
    const normalized = formatVal.toLowerCase().replace(/\s+/g, '');
    if (normalized.includes('16x23')) {
      result.pageFormat = '16x23';
    } else if (normalized.includes('11,5x18') || normalized.includes('11.5x18') || normalized.includes('11,5x18')) {
      result.pageFormat = '11_5x18';
    } else if (normalized.includes('20x20')) {
      result.pageFormat = '20x20';
    } else {
      result.pageFormat = 'a4';
    }
  }

  // 3. Theme Colors (Visual Design Options)
  const primaryColorMatch = markdown.match(/(?:Cor Primária|Menta Escura|Petróleo|Primary Color|primaryColor)[:\|\s]*#([A-Fa-f0-9]{6})/i);
  if (primaryColorMatch && primaryColorMatch[1]) {
    result.primaryColor = `#${primaryColorMatch[1]}`;
  } else {
    // If not found, try to find a color in the table row
    const hexMatch = markdown.match(/\|[^|]*(?:Verde petróleo|Menta Escura|Prim[áa]ria)[^|]*\|[^|]*#([A-Fa-f0-9]{6})[^|]*\|/i);
    const hex = hexMatch ? `#${hexMatch[1]}` : findValue(/(?:primary-color|cor-primaria|cor-marca)[:\s]*(#[A-Fa-f0-9]{6})/i);
    if (hex) result.primaryColor = hex;
  }

  const secondaryColorMatch = markdown.match(/\|[^|]*(?:Azul acinzentado|Secund[áa]ria)[^|]*\|[^|]*#([A-Fa-f0-9]{6})[^|]*\|/i) || markdown.match(/(?:Cor Secundária|Terracota|Secondary Color|secondaryColor)[:\|\s]*#([A-Fa-f0-9]{6})/i);
  if (secondaryColorMatch && secondaryColorMatch[1]) {
    result.secondaryColor = `#${secondaryColorMatch[1]}`;
  }

  const accentColorMatch = markdown.match(/\|[^|]*(?:Terracota|Destaque)[^|]*\|[^|]*#([A-Fa-f0-9]{6})[^|]*\|/i) || markdown.match(/(?:Cor de Destaque|Azul Sereno|Accent Color|accentColor)[:\|\s]*#([A-Fa-f0-9]{6})/i);
  if (accentColorMatch && accentColorMatch[1]) {
    result.accentColor = `#${accentColorMatch[1]}`;
  }

  const backgroundColorMatch = markdown.match(/\|[^|]*(?:Off-white|Fundo principal)[^|]*\|[^|]*#([A-Fa-f0-9]{6})[^|]*\|/i) || markdown.match(/(?:Cor de Fundo|Background Color|backgroundColor)[:\|\s]*#([A-Fa-f0-9]{6})/i);
  if (backgroundColorMatch && backgroundColorMatch[1]) {
    result.backgroundColor = `#${backgroundColorMatch[1]}`;
  }

  const textColorMatch = markdown.match(/\|[^|]*(?:Cinza grafite|Texto principal)[^|]*\|[^|]*#([A-Fa-f0-9]{6})[^|]*\|/i) || markdown.match(/(?:Cor do Texto|Text Color|textColor)[:\|\s]*#([A-Fa-f0-9]{6})/i);
  if (textColorMatch && textColorMatch[1]) {
    result.textColor = `#${textColorMatch[1]}`;
  }

  // 4. Typography / Fonts (Visual Styles)
  const fontBodyMatch = markdown.match(/(?:Texto principal|Tipografia Corpo|fontFamily)[:\s]*([a-zA-Z\s]+?)(?:\r?\n|\|)/i) || findValue(/(?:Fonte Secundária|Fonte do Texto|Tipografia Corpo|fontFamily):\s*(.*)/i);
  if (fontBodyMatch) {
    const val = typeof fontBodyMatch === 'object' && fontBodyMatch !== null && 1 in fontBodyMatch ? fontBodyMatch[1] : fontBodyMatch;
    if (typeof val === 'string') {
        result.fontFamily = val.replace(/Regular|Medium|SemiBold|Bold/gi, '').trim().replace(/\*\*/g, '');
    }
  }

  const fontDisplayMatch = markdown.match(/(?:Títulos e aberturas|Títulos|Tipografia Títulos|fontDisplay)[:\s]*([a-zA-Z\s]+?)(?:\r?\n|\|)/i) || findValue(/(?:Fonte Primária|Fonte de Exibição|Tipografia Títulos|fontDisplay):\s*(.*)/i);
  if (fontDisplayMatch) {
    const val = typeof fontDisplayMatch === 'object' && fontDisplayMatch !== null && 1 in fontDisplayMatch ? fontDisplayMatch[1] : fontDisplayMatch;
    if (typeof val === 'string') {
        result.fontDisplay = val.replace(/Regular|Medium|SemiBold|Bold/gi, '').trim().replace(/\*\*/g, '');
    }
  }

  // 5. Border of page (Visual Decoration)
  const borderMatch = findValue(/(?:Borda da Página|Bordas|pageBorder):\s*(sim|não|true|false)/i, layoutLines);
  if (borderMatch) {
    result.pageBorder = borderMatch.toLowerCase().includes('sim') || borderMatch.toLowerCase().includes('true');
  }

  // 6. Header Text from Visual Configuration/Layout Handoff
  const headerTxt = findValue(/(?:\*\*Cabeçalho\*\*|\*\*Texto do Cabeçalho\*\*|Cabeçalho|Header|Header\s*Text):\s*(?:["']?)([^"'\n]+)(?:["']?)/i, layoutLines);
  if (headerTxt && !headerTxt.toLowerCase().includes('inter') && !headerTxt.toLowerCase().includes('poppins') && !headerTxt.toLowerCase().includes('sans')) {
    result.headerText = headerTxt.replace(/^["']|["']$/g, '').trim().replace(/^\*\*|\*\*$/g, '');
  }

  // 6b. Descriptive Header option (Inserts active chapter name into page headers)
  const descriptiveHead = findValue(/(?:Cabeçalho Descritivo|Descritivo|Descriptive Header|Chapter Header|Cabecalho Descritivo):\s*(sim|não|true|false)/i, layoutLines);
  if (descriptiveHead) {
    const norm = descriptiveHead.toLowerCase();
    result.descriptiveHeader = norm.includes('sim') || norm.includes('true');
  } else {
    const lowercaseMarkdown = markdown.toLowerCase();
    if (
      lowercaseMarkdown.includes('cabeçalho descritivo') ||
      lowercaseMarkdown.includes('cabeçalho com capítulo') ||
      lowercaseMarkdown.includes('nome do capítulo no cabeçalho') ||
      lowercaseMarkdown.includes('nome do capitulo no cabecalho') ||
      lowercaseMarkdown.includes('capítulo no cabeçalho') ||
      lowercaseMarkdown.includes('capitulo no cabecalho')
    ) {
      result.descriptiveHeader = true;
    }
  }

  // 7. Footer Text from Visual Configuration/Layout Handoff
  const footerTxt = findValue(/(?:\*\*Rodapé\*\*|\*\*Texto do Rodapé\*\*|Rodapé|Footer|Footer\s*Text):\s*(?:["']?)([^"'\n]+)(?:["']?)/i, layoutLines);
  if (
    footerTxt &&
    !footerTxt.toLowerCase().includes('inter') &&
    !footerTxt.toLowerCase().includes('poppins') &&
    !footerTxt.toLowerCase().includes('sans') &&
    !/m[ií]nimo\s*\d+[,.]?\d*\s*pt/i.test(footerTxt)
  ) {
    result.footerText = footerTxt.replace(/^["']|["']$/g, '').trim().replace(/^\*\*|\*\*$/g, '');
  }

  // 8. Header Alignment (left/center/right)
  const headerAlign = findValue(/(?:Alinhamento do Cabeçalho|Alinhamento Cabeçalho|Header Alignment|Header Align|headerStyle):\s*(esquerda|centro|direita|left|center|right)/i, layoutLines);
  if (headerAlign) {
    const norm = headerAlign.toLowerCase();
    if (norm.includes('esquerda') || norm.includes('left')) result.headerStyle = 'left';
    else if (norm.includes('centro') || norm.includes('center')) result.headerStyle = 'center';
    else if (norm.includes('direita') || norm.includes('right')) result.headerStyle = 'right';
  }

  // 9. Footer Alignment (left/center/right)
  const footerAlign = findValue(/(?:Alinhamento do Rodapé|Alinhamento Rodapé|Footer Alignment|Footer Align|footerStyle):\s*(esquerda|centro|direita|left|center|right)/i, layoutLines);
  if (footerAlign) {
    const norm = footerAlign.toLowerCase();
    if (norm.includes('esquerda') || norm.includes('left')) result.footerStyle = 'left';
    else if (norm.includes('centro') || norm.includes('center')) result.footerStyle = 'center';
    else if (norm.includes('direita') || norm.includes('right')) result.footerStyle = 'right';
  }

  // 10. Page Number Alignment (left/center/right)
  const pgStyle = findValue(/(?:Numeração de Página|Numeração de páginas|Numeração|Page Numbering|pageNumberStyle):\s*(esquerda|centro|direita|left|center|right)/i, layoutLines);
  if (pgStyle) {
    const norm = pgStyle.toLowerCase();
    if (norm.includes('esquerda') || norm.includes('left')) result.pageNumberStyle = 'left';
    else if (norm.includes('centro') || norm.includes('center')) result.pageNumberStyle = 'center';
    else if (norm.includes('direita') || norm.includes('right')) result.pageNumberStyle = 'right';
  }

  const metadataValue = (label: string): string | null => {
    return findValue(new RegExp(`(?:${label}):\\s*(.*)`, 'i'), metadataLines);
  };

  const brand = cleanValue(metadataValue('Marca'));
  if (brand) result.brand = brand;

  const author = cleanValue(metadataValue('Autor'));
  if (author) result.professionalName = author;

  const titleProfessional = cleanValue(metadataValue('T[ií]tulo Profissional'));
  if (titleProfessional) result.professionalTitle = titleProfessional;

  const professionalReg = cleanValue(metadataValue('Registro'));
  if (professionalReg) result.professionalReg = professionalReg;

  const website = cleanValue(metadataValue('Site'));
  if (website) result.website = website;

  const instagram = cleanValue(metadataValue('Instagram'));
  if (instagram) result.instagram = instagram;

  const email = cleanValue(metadataValue('E-mail'));
  if (email) result.email = email;

  const whatsapp = cleanValue(metadataValue('WhatsApp'));
  if (whatsapp) result.whatsapp = whatsapp;

  const schedulingUrl = cleanValue(metadataValue('URL Agendamento'));
  if (schedulingUrl) result.schedulingUrl = schedulingUrl;

  const address = cleanValue(metadataValue('Endereço'));
  if (address) result.contactAddress = address;

  const coverBadgeText = cleanValue(metadataValue('Etiqueta da Capa'));
  if (coverBadgeText) result.coverBadgeText = coverBadgeText;

  const coverImageUrl = cleanValue(metadataValue('Imagem de Capa'));
  if (coverImageUrl) result.coverImageUrl = coverImageUrl;

  const editionYear = cleanValue(metadataValue('Ano da Edição')) || findValue(/(?:Ano|editionYear):\s*(\d{4})/i, metadataLines);
  if (editionYear) {
    result.editionYear = editionYear;
  }

  const isbn = findValue(/(?:ISBN):\s*([0-9Xx\- ]{10,20})/i, metadataLines);
  if (isbn) {
    result.isbn = isbn;
  }

  return result;
}
