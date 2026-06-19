import React, { useEffect } from 'react';
import { ProjectSettings } from '../types';
import { BookOpen } from 'lucide-react';

interface EbookPreviewProps {
  settings: ProjectSettings;
  contentPages: string[];
}

interface TocEntry {
  title: string;
  pageNumber: number;
  isChapter: boolean;
  domId: string;
}

export function EbookPreview({ settings, contentPages }: EbookPreviewProps) {
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

  const hasNoData = !settings.title && !settings.brand && contentPages.length === 0;

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

  // Determine page presence dynamically to calculate exact page offsets
  const hasCapa = !!(settings.title || settings.professionalName);
  const hasRosto = !!(settings.title || settings.subtitle || settings.supportPhrase);
  const hasAviso = !!settings.educationalWarning;
  const hasSumario = settings.generateToc !== false;

  let currentPageCount = 1;
  const capaPageNum = hasCapa ? currentPageCount++ : 0;
  const rostoPageNum = hasRosto ? currentPageCount++ : 0;
  const avisoPageNum = hasAviso ? currentPageCount++ : 0;
  const sumarioPageNum = hasSumario ? currentPageCount++ : 0;
  
  const contentStartPageNum = currentPageCount;

  // Extract chapters / principal headings from parsed HTML of the content pages, memoized for performance
  const tocEntries = React.useMemo<TocEntry[]>(() => {
    const parser = new DOMParser();
    const entries: TocEntry[] = [];

    contentPages.forEach((pageHtml, index) => {
      const pageNum = contentStartPageNum + index;
      const pageDoc = parser.parseFromString(pageHtml, 'text/html');

      // Check if it's a chapter opener
      const chapterOpener = pageDoc.querySelector('.chapter-opener');
      if (chapterOpener) {
        const numText = chapterOpener.querySelector('.chapter-number')?.textContent?.trim() || '';
        const titleText = chapterOpener.querySelector('h1')?.textContent?.trim() || '';
        entries.push({
          title: `Capítulo ${numText.padStart(2, '0')}: ${titleText || 'Introdução'}`,
          pageNumber: pageNum,
          isChapter: true,
          domId: `content-page-${index}`
        });
      } else {
        // Look for other prominent main headings (H1)
        const h1Headings = pageDoc.querySelectorAll('h1');
        let foundH1 = false;
        h1Headings.forEach((h1) => {
          // Prevent listing secondary boxes content in Table of Contents
          const isExcluded = h1.closest('.box-reflexao') || 
                             h1.closest('.box-cuidado') || 
                             h1.closest('.box-informativo');
          if (!isExcluded) {
            const text = h1.textContent?.trim() || '';
            if (text && text.length > 2) {
              entries.push({
                title: text,
                pageNumber: pageNum,
                isChapter: true,
                domId: `content-page-${index}`
              });
              foundH1 = true;
            }
          }
        });

        // If no prominent H1 on this page, look for primary H2 elements
        if (!foundH1) {
          const h2Headings = pageDoc.querySelectorAll('h2');
          h2Headings.forEach((h2) => {
            const isExcluded = h2.closest('.box-reflexao') || 
                               h2.closest('.box-cuidado') || 
                               h2.closest('.box-informativo');
            if (!isExcluded) {
              const text = h2.textContent?.trim() || '';
              if (text && text.length > 2) {
                entries.push({
                  title: text,
                  pageNumber: pageNum,
                  isChapter: false,
                  domId: `content-page-${index}`
                });
              }
            }
          });
        }
      }
    });

    return entries;
  }, [contentPages, contentStartPageNum]);

  const ctaPageNum = contentStartPageNum + contentPages.length;
  const finalPageNum = ctaPageNum + (settings.ctaText ? 1 : 0);

  const customStyles = {
    '--color-brand-petroleo': settings.primaryColor || '#245C5A',
    '--color-brand-terracota': settings.secondaryColor || '#C9826B',
    '--color-brand-azul': settings.accentColor || '#6F8F9A',
    '--color-brand-areia': settings.backgroundColor || '#F4EFE7',
    '--color-brand-offwhite': settings.backgroundColor || '#FAF8F4',
    '--font-sans': settings.fontFamily ? `${settings.fontFamily}, sans-serif` : 'Inter, sans-serif',
    '--font-display': settings.fontDisplay ? `${settings.fontDisplay}, sans-serif` : 'Poppins, sans-serif',
    border: settings.pageBorder ? '1px solid #C9D8D5' : undefined,
  } as React.CSSProperties;

  const renderHeader = (isCoverOrFirstPage: boolean) => {
    if (isCoverOrFirstPage) return null;
    const headerTextVal = settings.headerText || `${settings.brand || 'Conexão Seres'} | ${settings.shortTitle || settings.title || 'Livro Digital'}`;
    const alignment = settings.headerStyle || 'left';
    let alignmentClass = 'text-left';
    if (alignment === 'center') alignmentClass = 'text-center';
    else if (alignment === 'right') alignmentClass = 'text-right';

    return (
      <div className={`text-[9pt] text-[#6F8F9A] opacity-80 border-b border-[#C9D8D5] pb-2 mb-6 header-print shrink-0 ${alignmentClass}`}>
        <span>{headerTextVal}</span>
      </div>
    );
  };

  const renderFooter = (pageNum: number, isCoverOrFirstPage: boolean) => {
    if (isCoverOrFirstPage) return null;
    const footerTextVal = settings.footerText || `${settings.brand || 'Conexão Seres'} | ${settings.shortTitle || settings.title || 'Livro Digital'}`;
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
      <div className={`text-[10pt] text-[#6F8F9A] flex ${justifyClass} items-end border-t border-[#C9D8D5] pt-4 mt-8 footer-print shrink-0`}>
         <span className={`${textOrder} ${footerTextAlignClass} flex-grow md:flex-grow-0`}>{footerTextVal}</span>
         <span className={`font-medium text-sm ${numOrder} ${pageNumAlignClass}`}>{pageNum}</span>
      </div>
    );
  };

  return (
    <div 
      className="ebook-preview-container w-full max-w-4xl mx-auto"
      style={customStyles}
    >
      {/* CAPA */}
      {hasCapa && (
      <section id="capa-page" className="page flex flex-col justify-center relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#F4EFE7] rounded-bl-full opacity-50 -z-10"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#FAF8F4] rounded-tr-full opacity-50 -z-10"></div>
        
        <div className="mb-12">
          {settings.materialType && (
            <span className="inline-block bg-[#245C5A] text-white px-3 py-1 rounded-full text-xs uppercase tracking-wider font-semibold mb-4">
              {settings.materialType}
            </span>
          )}
          <h1 className="text-5xl md:text-6xl font-display text-[#245C5A] font-bold leading-tight mb-4 animate-fade-in">
            {settings.title}
          </h1>
          <h2 className="text-2xl text-[#6F8F9A] font-sans font-medium max-w-2xl">
            {settings.subtitle}
          </h2>
        </div>

        <div className="mt-auto">
          <div className="w-16 h-1 bg-[#C9826B] mb-6"></div>
          <p className="font-bold text-[#2F3437] text-lg uppercase tracking-wide">{settings.professionalName}</p>
          <p className="text-[#6F8F9A]">{settings.professionalTitle}</p>
          <p className="text-[#6F8F9A] text-sm">{settings.professionalReg}</p>
        </div>
        
        {settings.brand && (
          <div className="absolute bottom-10 right-10 flex items-center gap-2">
              <span className="text-[#245C5A] font-display font-semibold text-xl tracking-tight">{settings.brand}</span>
          </div>
        )}
      </section>
      )}

      {/* PÁGINA DE ROSTO */}
      {hasRosto && (
      <section id="rosto-page" className="page flex flex-col items-center justify-center text-center">
         <h1 className="text-4xl font-display text-[#245C5A] font-bold mb-4">{settings.title}</h1>
         <h2 className="text-xl text-[#6F8F9A] mb-8">{settings.subtitle}</h2>
         <p className="max-w-md mx-auto italic text-[#2F3437] mb-12">{settings.supportPhrase}</p>
         
         <div className="mt-12">
            <p className="font-bold text-[#2F3437]">{settings.professionalName}</p>
            <p className="text-[#6F8F9A]">{settings.professionalTitle}</p>
            <p className="text-[#6F8F9A] text-sm">{settings.professionalReg}</p>
         </div>
      </section>
      )}

      {/* AVISO EDUCATIVO INICIAL */}
      {hasAviso && (
      <section id="aviso-page" className="page flex flex-col justify-between scroll-mt-6">
         {renderHeader(false)}
         
         <div className="box-cuidado w-full max-w-2xl mx-auto my-auto text-left">
             <h3 className="text-2xl font-display font-semibold mb-4">⚠️ Aviso Importante</h3>
             {settings.educationalWarning.split('\n\n').map((paragraph, i) => (
                 <p key={i} className="mb-4 last:mb-0 text-[#2F3437]">{paragraph}</p>
             ))}
         </div>

         {renderFooter(avisoPageNum, false)}
      </section>
      )}

      {/* SUMÁRIO AUTOGERADO */}
      {hasSumario && (
      <section id="sumario" className="page flex flex-col justify-between scroll-mt-6 relative">
         <div className="absolute top-0 right-0 w-48 h-48 bg-[#F4EFE7] rounded-bl-full opacity-30 -z-10"></div>
         
         {renderHeader(false)}
         
         <div className="flex-grow">
            <div className="mb-8 text-left border-b border-[#FAF8F4] pb-6">
              <span className="text-xs font-bold uppercase tracking-widest text-[#6F8F9A] block mb-1">Índice Geral</span>
              <h1 className="text-4xl font-display font-bold text-[#245C5A] tracking-tight">Sumário</h1>
              <div className="w-12 h-1 bg-[#C9826B] mt-3"></div>
            </div>
            
            <div className="max-w-3xl mt-6">
              <ul className="space-y-4">
                {tocEntries.map((entry, idx) => (
                  <li key={`${entry.domId}-${idx}`}>
                    <a 
                      href={`#${entry.domId}`}
                      onClick={(e) => {
                        e.preventDefault();
                        const el = document.getElementById(entry.domId);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                      className="group flex items-baseline justify-between hover:text-[#C9826B] transition-colors duration-150 py-1"
                    >
                      <span className={`text-left line-clamp-1 pr-2 transition-colors duration-150 ${
                        entry.isChapter 
                         ? 'font-display font-bold text-[#245C5A] text-base group-hover:text-[#C9826B]' 
                         : 'font-sans text-sm text-[#5C6466] pl-6 group-hover:text-[#C9826B]'
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

         {renderFooter(sumarioPageNum, false)}
      </section>
      )}

      {/* CONTEÚDO DINÂMICO (PAGINADO E SEPARADO POR PÁGINAS A4) */}
      {contentPages.map((pageHtml, index) => {
        const pageNum = contentStartPageNum + index;
        return (
          <section key={`content-page-${index}`} id={`content-page-${index}`} className="page flex flex-col justify-between scroll-mt-6">
             {renderHeader(false)}
             <div 
               className="ebook-content flex-grow"
               dangerouslySetInnerHTML={{ __html: pageHtml }}
             />
             {renderFooter(pageNum, false)}
          </section>
        );
      })}

      {/* CTA & FECHAMENTO */}
      {settings.ctaText && (
      <section id="cta-page" className="page flex flex-col justify-between bg-[#F4EFE7] scroll-mt-6">
         {renderHeader(false)}
         <div className="max-w-2xl mx-auto my-auto flex-grow flex flex-col justify-center">
             <h2 className="text-3xl font-display font-bold text-[#245C5A] mb-6">Um convite</h2>
             <div className="box-informativo bg-white">
                 {settings.ctaText.split('\n\n').map((paragraph, i) => (
                     <p key={i} className="mb-4 last:mb-0 text-[#2F3437]">{paragraph}</p>
                 ))}
             </div>
             
             {(settings.whatsapp || settings.schedulingUrl) && (
                 <a href={settings.schedulingUrl || settings.whatsapp} target="_blank" rel="noreferrer" className="inline-block mt-8 bg-[#245C5A] text-white px-8 py-4 rounded-lg font-bold hover:bg-[#1b4342] transition-colors no-print w-fit">
                     {settings.ctaButtonText || 'Saiba Mais'}
                 </a>
             )}
             {(settings.schedulingUrl || settings.whatsapp) && (
               <p className="mt-4 text-sm text-[#6F8F9A] hidden print:block">
                   Para agendamentos e mais informações, acesse: <br/>
                   <strong>{settings.schedulingUrl || settings.whatsapp}</strong>
               </p>
             )}
         </div>

         {renderFooter(ctaPageNum, false)}
      </section>
      )}

      {/* PÁGINA INSTITUCIONAL FINAL */}
      {(settings.brand || settings.professionalName || settings.website || settings.whatsapp || settings.email) && (
      <section id="final-page" className="page flex flex-col justify-between scroll-mt-6">
          {renderHeader(false)}
          <div className="mt-10 mb-auto">
              <h1 className="text-2xl font-display font-bold text-[#245C5A] mb-2">{settings.brand}</h1>
              {settings.brand && <p className="text-[#6F8F9A] mb-12">Clínica de Terapia Ocupacional</p>}

              <div className="mb-8">
                  <p className="font-bold text-[#2F3437]">{settings.professionalName}</p>
                  <p className="text-[#2F3437]">{settings.professionalTitle}</p>
                  <p className="text-[#6F8F9A] text-sm">{settings.professionalReg}</p>
              </div>

              <div className="space-y-2 text-[#2F3437]">
                  {settings.website && <p><strong>Site:</strong> {settings.website}</p>}
                  {settings.instagram && <p><strong>Instagram:</strong> {settings.instagram}</p>}
                  {settings.email && <p><strong>E-mail:</strong> {settings.email}</p>}
                  {settings.whatsapp && <p className="no-print"><strong>WhatsApp:</strong> <a href={settings.whatsapp} className="text-[#245C5A] underline">{settings.whatsapp}</a></p>}
                  {settings.whatsapp && <p className="hidden print:block"><strong>WhatsApp:</strong> {settings.whatsapp}</p>}
                  {settings.contactAddress && <p className="mt-4 max-w-md"><strong className="block">Endereço:</strong> {settings.contactAddress}</p>}
              </div>
          </div>
          
          {renderFooter(finalPageNum, false)}
      </section>
      )}
    </div>
  );
}
