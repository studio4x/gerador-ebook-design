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

  // Helper matching functions
  const findValue = (keyRegex: RegExp): string | null => {
    for (const line of lines) {
      const match = line.match(keyRegex);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  };

  // 1. Density Mode (Visual Layout Option)
  const densityVal = findValue(/(?:Modo de Distribuição|Densidade|densityMode|Density):\s*(compacto|confortável|premium|compact|comfortable|premium)/i);
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
  const tocVal = findValue(/(?:Gerar Sumário|Sumário|TOC|generateToc):\s*(sim|não|true|false)/i);
  if (tocVal) {
    const norm = tocVal.toLowerCase();
    result.generateToc = norm.includes('sim') || norm.includes('true');
  }

  // 3. Theme Colors (Visual Design Options)
  const primaryColorMatch = markdown.match(/(?:Cor Primária|Menta Escura|Petróleo|Primary Color|primaryColor)[:\s]*#([A-Fa-f0-9]{6})/i);
  if (primaryColorMatch && primaryColorMatch[1]) {
    result.primaryColor = `#${primaryColorMatch[1]}`;
  } else {
    const hex = findValue(/(?:primary-color|cor-primaria|cor-marca)[:\s]*(#[A-Fa-f0-9]{6})/i);
    if (hex) result.primaryColor = hex;
  }

  const secondaryColorMatch = markdown.match(/(?:Cor Secundária|Terracota|Secondary Color|secondaryColor)[:\s]*#([A-Fa-f0-9]{6})/i);
  if (secondaryColorMatch && secondaryColorMatch[1]) {
    result.secondaryColor = `#${secondaryColorMatch[1]}`;
  }

  const accentColorMatch = markdown.match(/(?:Cor de Destaque|Azul Sereno|Accent Color|accentColor)[:\s]*#([A-Fa-f0-9]{6})/i);
  if (accentColorMatch && accentColorMatch[1]) {
    result.accentColor = `#${accentColorMatch[1]}`;
  }

  const backgroundColorMatch = markdown.match(/(?:Cor de Fundo|Background Color|backgroundColor)[:\s]*#([A-Fa-f0-9]{6})/i);
  if (backgroundColorMatch && backgroundColorMatch[1]) {
    result.backgroundColor = `#${backgroundColorMatch[1]}`;
  }

  const textColorMatch = markdown.match(/(?:Cor do Texto|Text Color|textColor)[:\s]*#([A-Fa-f0-9]{6})/i);
  if (textColorMatch && textColorMatch[1]) {
    result.textColor = `#${textColorMatch[1]}`;
  }

  // 4. Typography / Fonts (Visual Styles)
  const fontBodyMatch = findValue(/(?:Fonte Secundária|Fonte do Texto|Tipografia Corpo|fontFamily):\s*(.*)/i);
  if (fontBodyMatch) {
    result.fontFamily = fontBodyMatch;
  }

  const fontDisplayMatch = findValue(/(?:Fonte Primária|Fonte de Exibição|Tipografia Títulos|fontDisplay):\s*(.*)/i);
  if (fontDisplayMatch) {
    result.fontDisplay = fontDisplayMatch;
  }

  // 5. Border of page (Visual Decoration)
  const borderMatch = findValue(/(?:Borda da Página|Bordas|pageBorder):\s*(sim|não|true|false)/i);
  if (borderMatch) {
    result.pageBorder = borderMatch.toLowerCase().includes('sim') || borderMatch.toLowerCase().includes('true');
  }

  // 6. Header Text from Visual Configuration/Layout Handoff
  const headerTxt = findValue(/(?:\*\*Cabeçalho\*\*|\*\*Texto do Cabeçalho\*\*|Cabeçalho|Header|Header\s*Text):\s*(?:["']?)([^"'\n]+)(?:["']?)/i);
  if (headerTxt) {
    result.headerText = headerTxt.replace(/^["']|["']$/g, '');
  }

  // 6b. Descriptive Header option (Inserts active chapter name into page headers)
  const descriptiveHead = findValue(/(?:Cabeçalho Descritivo|Descritivo|Descriptive Header|Chapter Header|Cabecalho Descritivo):\s*(sim|não|true|false)/i);
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
  const footerTxt = findValue(/(?:\*\*Rodapé\*\*|\*\*Texto do Rodapé\*\*|Rodapé|Footer|Footer\s*Text):\s*(?:["']?)([^"'\n]+)(?:["']?)/i);
  if (footerTxt) {
    result.footerText = footerTxt.replace(/^["']|["']$/g, '');
  }

  // 8. Header Alignment (left/center/right)
  const headerAlign = findValue(/(?:Alinhamento do Cabeçalho|Alinhamento Cabeçalho|Header Alignment|Header Align|headerStyle):\s*(esquerda|centro|direita|left|center|right)/i);
  if (headerAlign) {
    const norm = headerAlign.toLowerCase();
    if (norm.includes('esquerda') || norm.includes('left')) result.headerStyle = 'left';
    else if (norm.includes('centro') || norm.includes('center')) result.headerStyle = 'center';
    else if (norm.includes('direita') || norm.includes('right')) result.headerStyle = 'right';
  }

  // 9. Footer Alignment (left/center/right)
  const footerAlign = findValue(/(?:Alinhamento do Rodapé|Alinhamento Rodapé|Footer Alignment|Footer Align|footerStyle):\s*(esquerda|centro|direita|left|center|right)/i);
  if (footerAlign) {
    const norm = footerAlign.toLowerCase();
    if (norm.includes('esquerda') || norm.includes('left')) result.footerStyle = 'left';
    else if (norm.includes('centro') || norm.includes('center')) result.footerStyle = 'center';
    else if (norm.includes('direita') || norm.includes('right')) result.footerStyle = 'right';
  }

  // 10. Page Number Alignment (left/center/right)
  const pgStyle = findValue(/(?:Numeração de Página|Numeração de páginas|Numeração|Page Numbering|pageNumberStyle):\s*(esquerda|centro|direita|left|center|right)/i);
  if (pgStyle) {
    const norm = pgStyle.toLowerCase();
    if (norm.includes('esquerda') || norm.includes('left')) result.pageNumberStyle = 'left';
    else if (norm.includes('centro') || norm.includes('center')) result.pageNumberStyle = 'center';
    else if (norm.includes('direita') || norm.includes('right')) result.pageNumberStyle = 'right';
  }

  // NO LONGER parsing content variables (title, subtitle, brand, author bio, warning, ctaText)
  // because the user requested that all content MUST come from the content files.

  return result;
}
