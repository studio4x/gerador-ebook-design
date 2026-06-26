import React, { useState, useRef, useEffect } from "react";
import { FolderOpen, Plus, Pencil, Trash2, ChevronDown, Check, X, FileText, Calendar } from "lucide-react";
import { LocalProject } from "../types";

interface ProjectManagerProps {
  projectsList: LocalProject[];
  currentProjectId: string;
  onSwitchProject: (id: string) => void;
  onCreateProject: (title: string) => void;
  onRenameProject: (id: string, newTitle: string) => void;
  onDeleteProject: (id: string) => void;
}

export function ProjectManager({
  projectsList,
  currentProjectId,
  onSwitchProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
}: ProjectManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeProject = projectsList.find((p) => p.id === currentProjectId) || projectsList[0];

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
        setEditingId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjectTitle.trim()) {
      onCreateProject(newProjectTitle.trim());
      setNewProjectTitle("");
      setIsCreating(false);
      setIsOpen(false);
    }
  };

  const handleRenameSubmit = (id: string) => {
    if (editingTitle.trim()) {
      onRenameProject(id, editingTitle.trim());
      setEditingId(null);
      setEditingTitle("");
    }
  };

  return (
    <div className="relative" ref={dropdownRef} id="project-manager-dropdown">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 transition-all shadow-2xs cursor-pointer max-w-[200px] sm:max-w-[280px]"
        title="Gerenciar e trocar de e-books"
      >
        <FolderOpen size={14} className="text-[#245C5A] shrink-0" />
        <span className="truncate text-left flex-1">
          {activeProject?.title || "Selecionar E-book"}
        </span>
        <ChevronDown size={12} className={`text-gray-400 transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-72 sm:w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-[999] p-2 animate-in fade-in slide-in-from-top-1 duration-150">
          
          {/* Header & Create Trigger */}
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-100 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Meus E-books</span>
            {!isCreating && (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-1 text-[11px] font-bold text-[#245C5A] hover:text-[#1b4342] bg-[#245C5A]/5 hover:bg-[#245C5A]/10 px-2 py-1 rounded transition-colors"
              >
                <Plus size={11} /> Novo
              </button>
            )}
          </div>

          {/* Inline Create Input Form */}
          {isCreating && (
            <form onSubmit={handleCreateSubmit} className="px-2 py-1.5 bg-gray-50 rounded-lg border border-gray-200 mb-2 animate-in slide-in-from-top-1 duration-100">
              <input
                type="text"
                placeholder="Título do novo e-book..."
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-[#245C5A] focus:border-[#245C5A] bg-white text-gray-800 font-semibold outline-none"
                autoFocus
              />
              <div className="flex justify-end gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setNewProjectTitle("");
                  }}
                  className="px-2 py-1 text-[10px] font-bold text-gray-500 hover:bg-gray-200 rounded"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newProjectTitle.trim()}
                  className="px-2.5 py-1 text-[10px] font-bold text-white bg-[#245C5A] hover:bg-[#1b4342] rounded disabled:opacity-50"
                >
                  Criar
                </button>
              </div>
            </form>
          )}

          {/* Projects List */}
          <div className="max-h-64 overflow-y-auto space-y-1 pr-0.5">
            {projectsList.map((proj) => {
              const isActive = proj.id === currentProjectId;
              const isEditing = editingId === proj.id;

              return (
                <div
                  key={proj.id}
                  className={`group flex items-center justify-between rounded-lg p-1.5 transition-all ${
                    isActive ? "bg-[#245C5A]/5 border border-[#245C5A]/10" : "hover:bg-gray-50 border border-transparent"
                  }`}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-1.5 w-full px-1">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="flex-1 px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-[#245C5A] focus:border-[#245C5A] font-semibold outline-none bg-white text-gray-800"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameSubmit(proj.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button
                        onClick={() => handleRenameSubmit(proj.id)}
                        className="p-1 text-green-600 hover:bg-green-50 rounded shrink-0"
                        title="Confirmar"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded shrink-0"
                        title="Cancelar"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Project info/select trigger */}
                      <button
                        onClick={() => {
                          onSwitchProject(proj.id);
                          setIsOpen(false);
                        }}
                        className="flex-1 min-w-0 text-left flex items-start gap-2 px-1.5 py-0.5"
                      >
                        <FileText size={14} className={`mt-0.5 shrink-0 ${isActive ? "text-[#245C5A]" : "text-gray-400"}`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-bold truncate ${isActive ? "text-[#245C5A]" : "text-gray-700"}`}>
                            {proj.title}
                          </p>
                          <span className="text-[9px] text-gray-400 flex items-center gap-1 mt-0.5">
                            <Calendar size={9} /> {proj.updatedAt || "Recente"}
                          </span>
                        </div>
                      </button>

                      {/* Hover controls */}
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity pl-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(proj.id);
                            setEditingTitle(proj.title);
                          }}
                          className="p-1 text-gray-400 hover:text-[#245C5A] hover:bg-gray-100 rounded"
                          title="Renomear e-book"
                        >
                          <Pencil size={11} />
                        </button>
                        {projectsList.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteProject(proj.id);
                            }}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Excluir e-book localmente"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          
        </div>
      )}
    </div>
  );
}
