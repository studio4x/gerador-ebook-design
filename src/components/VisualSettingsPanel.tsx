import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { ProjectSettings } from '../types';
import { PAGE_FORMATS } from '../utils/printProfile';

interface VisualSettingsPanelProps {
  settings: ProjectSettings;
  setSettings: React.Dispatch<React.SetStateAction<ProjectSettings>>;
  onApply: (newSettings?: ProjectSettings) => void;
  onRestoreDefault: () => void;
}

// Client-side image compression helper to optimize Base64 size while preserving high quality
// This prevents QuotaExceededError in localStorage and stays safe under the 1MB Firestore document limit
const compressImage = (file: File, maxWidth = 1600, maxHeight = 2000, quality = 0.9): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        
        // Maintain aspect ratio
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string); // fallback
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        
        // Compress to optimized JPEG format
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => {
        reject(err);
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = (err) => {
      reject(err);
    };
    reader.readAsDataURL(file);
  });
};

export function VisualSettingsPanel({ settings, setSettings, onApply, onRestoreDefault }: VisualSettingsPanelProps) {
  // Local state to hold edits before applying
  const [localSettings, setLocalSettings] = useState<ProjectSettings>(settings);
  const [isCompressing, setIsCompressing] = useState(false);

  // Sync when settings prop changes externally
  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = (key: keyof ProjectSettings, value: any) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleColorChange = (key: keyof ProjectSettings, value: string) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleDownloadMarkdown = () => {
    const mdContent = `# ESPECIFICAÇÕES DE LAYOUT (HANDOFF)

Este arquivo foi gerado automaticamente com as configurações visuais e metadados personalizados do e-book.
Você pode carregar este arquivo de volta na aba "Definições Visuais" para restaurar o design.

## Opções Visuais de Layout
- Modo de Distribuição: ${localSettings.densityMode || 'comfortable'}
- Formato do Material: ${PAGE_FORMATS.find((item) => item.id === (localSettings.pageFormat || 'a4'))?.label || 'A4 vertical'}
- Gerar Sumário: ${localSettings.generateToc !== false ? 'sim' : 'não'}
- Borda da Página: ${localSettings.pageBorder ? 'sim' : 'não'}
- Cabeçalho: ${localSettings.headerText || ''}
- Cabeçalho Descritivo: ${localSettings.descriptiveHeader ? 'sim' : 'não'}
- Rodapé: ${localSettings.footerText || ''}
- Alinhamento do Cabeçalho: ${localSettings.headerStyle || 'left'}
- Alinhamento do Rodapé: ${localSettings.footerStyle || 'left'}
- Numeração de Página: ${localSettings.pageNumberStyle || 'right'}

## Cores do Tema
| Elemento | Cor Hexadecimal |
| :--- | :--- |
| Cor Primária | ${localSettings.primaryColor || '#245C5A'} |
| Cor Secundária | ${localSettings.secondaryColor || '#C9826B'} |
| Cor de Destaque | ${localSettings.accentColor || '#6F8F9A'} |
| Cor de Fundo | ${localSettings.backgroundColor || '#FAF8F4'} |
| Cor do Texto | ${localSettings.textColor || '#2F3437'} |

## Tipografia do Tema
- Fonte Primária (Tipografia Títulos): ${localSettings.fontDisplay || 'Poppins'}
- Fonte Secundária (Tipografia Corpo): ${localSettings.fontFamily || 'Inter'}

## Metadados do E-book
- Marca: ${localSettings.brand || ''}
- Autor: ${localSettings.professionalName || ''}
- Título Profissional: ${localSettings.professionalTitle || ''}
- Registro: ${localSettings.professionalReg || ''}
- Site: ${localSettings.website || ''}
- Instagram: ${localSettings.instagram || ''}
- E-mail: ${localSettings.email || ''}
- WhatsApp: ${localSettings.whatsapp || ''}
- URL Agendamento: ${localSettings.schedulingUrl || ''}
- Endereço: ${localSettings.contactAddress || ''}
- Ano da Edição: ${localSettings.editionYear || ''}
- ISBN: ${localSettings.isbn || ''}
- Etiqueta da Capa: ${localSettings.coverBadgeText || 'E-book educativo'}
${localSettings.coverImageUrl ? `- Imagem de Capa: ${localSettings.coverImageUrl}\n` : ''}
`;

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileName = `especificacoes-visuais-${(localSettings.title || 'ebook').toLowerCase().replace(/\s+/g, '-')}.md`;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-[calc(100vh-120px)] min-h-[600px]">
      <div className="flex-1 overflow-y-auto pr-2 space-y-8 pb-8">
        
        {/* 1. Cores */}
        <section>
          <h3 className="text-sm font-bold text-[#245C5A] uppercase tracking-wider mb-4 border-b pb-2">1. Cores</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ColorField label="Cor Primária" value={localSettings.primaryColor || '#245C5A'} onChange={(v) => handleColorChange('primaryColor', v)} />
            <ColorField label="Cor Secundária" value={localSettings.secondaryColor || '#C9826B'} onChange={(v) => handleColorChange('secondaryColor', v)} />
            <ColorField label="Cor de Destaque" value={localSettings.accentColor || '#6F8F9A'} onChange={(v) => handleColorChange('accentColor', v)} />
            <ColorField label="Cor de Fundo" value={localSettings.backgroundColor || '#FAF8F4'} onChange={(v) => handleColorChange('backgroundColor', v)} />
            <ColorField label="Cor do Texto" value={localSettings.textColor || '#2F3437'} onChange={(v) => handleColorChange('textColor', v)} />
          </div>
        </section>

        {/* 2. Tipografia */}
        <section>
          <h3 className="text-sm font-bold text-[#245C5A] uppercase tracking-wider mb-4 border-b pb-2">2. Tipografia</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Fonte dos Títulos (Display)">
              <input type="text" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.fontDisplay || 'Poppins'} onChange={e => handleChange('fontDisplay', e.target.value)} />
            </Field>
            <Field label="Fonte do Corpo">
              <input type="text" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.fontFamily || 'Inter'} onChange={e => handleChange('fontFamily', e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-gray-400 mt-2">Dica: Use nomes do Google Fonts como "Inter", "Lora", "Merriweather".</p>
        </section>

        {/* 3. Layout da página */}
        <section>
          <h3 className="text-sm font-bold text-[#245C5A] uppercase tracking-wider mb-4 border-b pb-2">3. Layout da página</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Formato Final do PDF">
              <select className="w-full border-gray-300 rounded-md text-sm" value={localSettings.pageFormat || 'a4'} onChange={e => handleChange('pageFormat', e.target.value)}>
                {PAGE_FORMATS.map((format) => (
                  <option key={format.id} value={format.id}>
                    {format.label} ({format.widthCmLabel})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Densidade Visual">
              <select className="w-full border-gray-300 rounded-md text-sm" value={localSettings.densityMode || 'comfortable'} onChange={e => handleChange('densityMode', e.target.value)}>
                <option value="compact">Compacto</option>
                <option value="comfortable">Confortável</option>
                <option value="premium">Premium</option>
              </select>
            </Field>
            <Field label="Etiqueta da Capa">
              <input type="text" placeholder="Ex: E-book educativo" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.coverBadgeText !== undefined ? localSettings.coverBadgeText : 'E-book educativo'} onChange={e => handleChange('coverBadgeText', e.target.value)} />
            </Field>
            <Field label="Imagem de Capa (Substitui capa padrão)">
              <div className="flex flex-col gap-2">
                {localSettings.coverImageUrl ? (
                  <div className="relative border border-gray-200 rounded-lg p-2 flex items-center gap-3 bg-gray-50">
                    <img 
                      src={localSettings.coverImageUrl} 
                      alt="Cover Preview" 
                      className="w-12 h-16 object-cover rounded shadow-xs" 
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 truncate">Imagem carregada</p>
                      <button
                        type="button"
                        onClick={() => handleChange('coverImageUrl', undefined)}
                        className="text-red-500 hover:text-red-700 text-xs font-bold mt-1"
                      >
                        Remover Imagem
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 transition-colors cursor-pointer relative h-[72px]">
                    {isCompressing ? (
                      <div className="flex flex-col items-center justify-center gap-1">
                        <svg className="animate-spin h-5 w-5 text-[#245C5A]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-[10px] font-medium text-gray-500">Otimizando imagem...</span>
                      </div>
                    ) : (
                      <>
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setIsCompressing(true);
                              try {
                                const compressedUrl = await compressImage(file, 1600, 2000, 0.9);
                                handleChange('coverImageUrl', compressedUrl);
                              } catch (err) {
                                console.error("Erro ao otimizar imagem:", err);
                                // Fallback to normal read if compression fails
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  handleChange('coverImageUrl', reader.result as string);
                                };
                                reader.readAsDataURL(file);
                              } finally {
                                setIsCompressing(false);
                              }
                            }
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <svg className="w-5 h-5 text-gray-400 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                        <span className="text-[11px] font-medium text-gray-600">Upload de Capa Completa</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Borda de Página">
              <div className="flex items-center h-full">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input type="checkbox" className="rounded text-[#245C5A] border-gray-300" checked={localSettings.pageBorder || false} onChange={e => handleChange('pageBorder', e.target.checked)} />
                  Mostrar borda
                </label>
              </div>
            </Field>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            O PDF final é híbrido: continua bom para leitura digital, mas já sai com formato físico real e margens seguras para impressão.
          </p>
        </section>

        {/* 4. Cabeçalho e rodapé */}
        <section>
          <h3 className="text-sm font-bold text-[#245C5A] uppercase tracking-wider mb-4 border-b pb-2">4. Cabeçalho e Rodapé</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
            <div className="space-y-4">
               <Field label="Texto do Cabeçalho">
                 <input type="text" placeholder="Ex: Livro Digital" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.headerText || ''} onChange={e => handleChange('headerText', e.target.value)} />
               </Field>
               <Field label="Alinhamento do Cabeçalho">
                  <select className="w-full border-gray-300 rounded-md text-sm" value={localSettings.headerStyle || 'left'} onChange={e => handleChange('headerStyle', e.target.value)}>
                    <option value="left">Esquerda</option>
                    <option value="center">Centro</option>
                    <option value="right">Direita</option>
                  </select>
               </Field>
               <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input type="checkbox" className="rounded text-[#245C5A] border-gray-300" checked={localSettings.descriptiveHeader || false} onChange={e => handleChange('descriptiveHeader', e.target.checked)} />
                  Mostrar título do capítulo no cabeçalho
                </label>
            </div>
            
            <div className="space-y-4">
              <Field label="Texto do Rodapé">
                 <input type="text" placeholder="Ex: © 2026 Sua Marca" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.footerText || ''} onChange={e => handleChange('footerText', e.target.value)} />
               </Field>
               <Field label="Alinhamento do Rodapé">
                  <select className="w-full border-gray-300 rounded-md text-sm" value={localSettings.footerStyle || 'left'} onChange={e => handleChange('footerStyle', e.target.value)}>
                    <option value="left">Esquerda</option>
                    <option value="center">Centro</option>
                    <option value="right">Direita</option>
                  </select>
               </Field>
            </div>
          </div>
        </section>

        {/* 5. Sumário e numeração */}
        <section>
          <h3 className="text-sm font-bold text-[#245C5A] uppercase tracking-wider mb-4 border-b pb-2">5. Sumário e Numeração</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <Field label="Estilo de Numeração de Página">
                <select className="w-full border-gray-300 rounded-md text-sm" value={localSettings.pageNumberStyle || 'right'} onChange={e => handleChange('pageNumberStyle', e.target.value)}>
                  <option value="left">Esquerda</option>
                  <option value="center">Centro</option>
                  <option value="right">Direita</option>
                </select>
             </Field>
             <Field label="Sumário">
                <div className="flex items-center h-full">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input type="checkbox" className="rounded text-[#245C5A] border-gray-300" checked={localSettings.generateToc !== false} onChange={e => handleChange('generateToc', e.target.checked)} />
                    Gerar sumário automaticamente
                  </label>
                </div>
             </Field>
          </div>
        </section>

        {/* 6. Informações exibidas no e-book */}
        <section>
          <h3 className="text-sm font-bold text-[#245C5A] uppercase tracking-wider mb-4 border-b pb-2">6. Informações exibidas no E-book</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <Field label="Marca / Identidade"><input type="text" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.brand || ''} onChange={e => handleChange('brand', e.target.value)} /></Field>
             <Field label="Autor(a) / Nome Profissional"><input type="text" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.professionalName || ''} onChange={e => handleChange('professionalName', e.target.value)} /></Field>
             <Field label="Título Profissional"><input type="text" placeholder="Ex: Psicólogo Clínico" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.professionalTitle || ''} onChange={e => handleChange('professionalTitle', e.target.value)} /></Field>
             <Field label="Conselho / Registro"><input type="text" placeholder="Ex: CRP: 123456" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.professionalReg || ''} onChange={e => handleChange('professionalReg', e.target.value)} /></Field>
             <Field label="Site Oficial"><input type="text" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.website || ''} onChange={e => handleChange('website', e.target.value)} /></Field>
             <Field label="Instagram"><input type="text" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.instagram || ''} onChange={e => handleChange('instagram', e.target.value)} /></Field>
             <Field label="E-mail de Contato"><input type="text" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.email || ''} onChange={e => handleChange('email', e.target.value)} /></Field>
             <Field label="WhatsApp (Link)"><input type="text" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.whatsapp || ''} onChange={e => handleChange('whatsapp', e.target.value)} /></Field>
             <Field label="URL de Agendamento"><input type="text" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.schedulingUrl || ''} onChange={e => handleChange('schedulingUrl', e.target.value)} /></Field>
             <Field label="Endereço Físico / Contato"><input type="text" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.contactAddress || ''} onChange={e => handleChange('contactAddress', e.target.value)} /></Field>
             <Field label="Ano da Edição"><input type="text" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.editionYear || ''} onChange={e => handleChange('editionYear', e.target.value)} /></Field>
             <Field label="ISBN (opcional)"><input type="text" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.isbn || ''} onChange={e => handleChange('isbn', e.target.value)} /></Field>
          </div>
        </section>

      </div>

      {/* 7. Ações */}
      <div className="pt-4 border-t border-gray-100 flex flex-wrap gap-3 mt-auto shrink-0 bg-white">
        <button 
          onClick={() => {
            setSettings(localSettings);
            onApply(localSettings);
          }}
          className="bg-[#245C5A] hover:bg-[#1b4342] text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors flex-1 min-w-[200px]"
        >
          Salvar e Aplicar ao Preview
        </button>
        <button 
          onClick={handleDownloadMarkdown}
          className="bg-[#F4EFE7] hover:bg-[#ebdcc3] text-[#245C5A] border border-[#C9D8D5] px-5 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 flex-1 min-w-[200px]"
        >
          <Download size={16} />
          Baixar Especificações (.md)
        </button>
        <button 
          onClick={onRestoreDefault}
          className="bg-white border text-red-600 border-red-200 hover:bg-red-50 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors flex-1 min-w-[150px]"
        >
          Restaurar Padrões
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) {
  const [hex, setHex] = useState(value);

  React.useEffect(() => {
    setHex(value);
  }, [value]);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHex(val);
    if (/^#([0-9A-F]{3}){1,2}$/i.test(val)) {
      onChange(val);
    }
  };

  return (
    <Field label={label}>
      <div className="flex gap-2 items-center">
        <input 
          type="color" 
          value={/^#([0-9A-F]{3}){1,2}$/i.test(hex) ? hex : '#000000'}
          onChange={e => {
            setHex(e.target.value);
            onChange(e.target.value);
          }}
          className="w-10 h-10 border-0 p-0 rounded-md overflow-hidden cursor-pointer shrink-0" 
        />
        <input 
          type="text" 
          value={hex}
          onChange={handleHexChange}
          onBlur={() => {
             // on blur, format properly if missing #
             let formatted = hex.trim();
             if (formatted && !formatted.startsWith('#')) formatted = '#' + formatted;
             if (/^#([0-9A-F]{3}){1,2}$/i.test(formatted)) {
                setHex(formatted);
                onChange(formatted);
             } else {
                setHex(value); // revert to valid if invalid
             }
          }}
          className="flex-1 border-gray-300 rounded-md text-sm font-mono uppercase" 
        />
      </div>
    </Field>
  );
}
