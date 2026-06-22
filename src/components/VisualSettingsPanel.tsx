import React, { useState } from 'react';
import { ProjectSettings } from '../types';

interface VisualSettingsPanelProps {
  settings: ProjectSettings;
  setSettings: React.Dispatch<React.SetStateAction<ProjectSettings>>;
  onApply: () => void;
  onRestoreDefault: () => void;
}

export function VisualSettingsPanel({ settings, setSettings, onApply, onRestoreDefault }: VisualSettingsPanelProps) {
  // Local state to hold edits before applying
  const [localSettings, setLocalSettings] = useState<ProjectSettings>(settings);

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
            <Field label="Densidade Visual">
              <select className="w-full border-gray-300 rounded-md text-sm" value={localSettings.densityMode || 'comfortable'} onChange={e => handleChange('densityMode', e.target.value)}>
                <option value="compact">Compacto</option>
                <option value="comfortable">Confortável</option>
                <option value="premium">Premium</option>
              </select>
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
                 <input type="text" placeholder="Ex: © 2026 Conexão Seres" className="w-full border-gray-300 rounded-md text-sm" value={localSettings.footerText || ''} onChange={e => handleChange('footerText', e.target.value)} />
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
          </div>
        </section>

      </div>

      {/* 7. Ações */}
      <div className="pt-4 border-t border-gray-100 flex flex-wrap gap-3 mt-auto shrink-0 bg-white">
        <button 
          onClick={() => {
            setSettings(localSettings);
            onApply();
          }}
          className="bg-[#245C5A] hover:bg-[#1b4342] text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors flex-1 min-w-[200px]"
        >
          Salvar e Aplicar ao Preview
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
