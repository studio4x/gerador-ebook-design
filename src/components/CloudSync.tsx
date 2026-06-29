import React, { useEffect, useState } from "react";
import { auth, isCloudSyncEnabled, signInWithGoogle } from "../lib/firebase";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { Cloud, LogIn, LogOut, Save, DownloadCloud, Loader2, Trash2, Pencil, Check, X } from "lucide-react";
import { ContentBlock, ProjectSettings } from "../types";
import {
  deleteCloudProject as apiDeleteCloudProject,
  isCloudServerApiAvailable,
  isServerApiUnavailableError,
  listCloudProjects,
  loadCloudProject,
  renameCloudProject,
  saveCloudProject,
} from "../lib/cloud-sync-api";

type CloudProject = {
  id: string;
  user_id: string;
  title: string;
  normalized_title: string;
  blocks: ContentBlock[] | string;
  settings: ProjectSettings | string;
  version: number;
  created_at?: string;
  updated_at?: string;
};

const normalizeProjectTitle = (title: string): string => {
  const cleaned = (title || "Ebook")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
  return cleaned || "ebook";
};

export function CloudSync({
  settings,
  blocks,
  setSettings,
  setBlocks,
  showToast,
}: {
  settings: ProjectSettings;
  blocks: ContentBlock[];
  setSettings: (s: ProjectSettings) => void;
  setBlocks: (b: ContentBlock[]) => void;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}) {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const cloudSyncEnabled = isCloudSyncEnabled();
  const [showModal, setShowModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"Salvando..." | "Salvo" | "">("");
  const [cloudProjects, setCloudProjects] = useState<CloudProject[]>([]);
  const [serverApiAvailable, setServerApiAvailable] = useState<boolean>(() => cloudSyncEnabled && isCloudServerApiAvailable());
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectTitle, setEditingProjectTitle] = useState("");

  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => localStorage.getItem("ebook_cloud_current_project_id"));
  const [currentProjectName, setCurrentProjectName] = useState<string>(() => localStorage.getItem("ebook_cloud_current_project_name") || "");
  const [currentProjectVersion, setCurrentProjectVersion] = useState<number>(() => {
    const stored = localStorage.getItem("ebook_cloud_current_project_version");
    return stored ? Number(stored) || 0 : 0;
  });

  const setCurrentCloudProject = (projectId: string | null, title = "", version = 0) => {
    setCurrentProjectId(projectId);
    setCurrentProjectName(title);
    setCurrentProjectVersion(version);

    if (projectId) {
      localStorage.setItem("ebook_cloud_current_project_id", projectId);
      localStorage.setItem("ebook_cloud_current_project_name", title);
      localStorage.setItem("ebook_cloud_current_project_version", String(version));
    } else {
      localStorage.removeItem("ebook_cloud_current_project_id");
      localStorage.removeItem("ebook_cloud_current_project_name");
      localStorage.removeItem("ebook_cloud_current_project_version");
    }
  };

  useEffect(() => {
    if (!cloudSyncEnabled) return;

    let active = true;

    auth.getSession().then(({ data: { session } }) => {
      if (active) setUser(session?.user ?? null);
    });

    const { data: { subscription } } = auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [cloudSyncEnabled]);

  const loadCloudProjects = async () => {
    if (!cloudSyncEnabled || !user || !serverApiAvailable) return;
    try {
      setCloudProjects(await listCloudProjects(user.id));
      setServerApiAvailable(true);
    } catch (err) {
      if (isServerApiUnavailableError(err)) {
        setServerApiAvailable(false);
        setShowModal(false);
        showToast("Sincronização em nuvem indisponível nesta implantação.", "info");
        return;
      }
      showToast("Erro ao carregar projetos da nuvem.", "error");
    }
  };

  const findProjectByNormalizedTitle = async (normalizedTitle: string, excludeId?: string): Promise<CloudProject | null> => {
    if (!cloudSyncEnabled || !user || !serverApiAvailable) return null;
    try {
      const projects = await listCloudProjects(user.id);
      return projects.find((project) => project.normalized_title === normalizedTitle && project.id !== excludeId) || null;
    } catch (err) {
      if (isServerApiUnavailableError(err)) {
        setServerApiAvailable(false);
      }
      return null;
    }
  };

  const handleLogin = async () => {
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (err: any) {
      showToast("Erro ao fazer login: " + (err?.message || err), "error");
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    setCurrentCloudProject(null);
    showToast("Você saiu da conta.", "info");
  };

  const saveToCloud = async (silent = false) => {
    if (!cloudSyncEnabled || !user) return;
    if (!serverApiAvailable) {
      if (!silent) {
        showToast("Sincronização em nuvem indisponível nesta implantação.", "info");
      }
      return;
    }
    if (blocks.length === 0) {
      if (!silent) showToast("Adicione conteúdo antes de salvar na nuvem.", "error");
      return;
    }

    setIsSyncing(true);
    if (silent) setSyncStatus("Salvando...");

    try {
      const displayTitle = (currentProjectName || settings.title || "Ebook").trim();
      const normalizedTitle = normalizeProjectTitle(displayTitle);
      let projectId = currentProjectId || `${user.id}_${normalizedTitle}`;

      if (!currentProjectId) {
        const duplicate = await findProjectByNormalizedTitle(normalizedTitle);
        if (duplicate) projectId = duplicate.id;
      }

      const existing = await loadCloudProject(user.id, projectId).catch(() => null);
      const nextVersion = Math.max(existing?.version || 0, currentProjectVersion || 0) + 1;

      const saved = await saveCloudProject({
        userId: user.id,
        email: user.email,
        projectId,
        title: displayTitle,
        normalizedTitle,
        blocks,
        settings,
        version: nextVersion,
      });

      setCurrentCloudProject(saved.id, saved.title, saved.version);

      if (!silent) {
        showToast(`Projeto salvo na nuvem com sucesso! Versão v${saved.version}.`, "success");
        await loadCloudProjects();
      } else {
        setSyncStatus("Salvo");
        setTimeout(() => setSyncStatus(""), 3000);
      }
    } catch (err: any) {
      if (isServerApiUnavailableError(err)) {
        setServerApiAvailable(false);
        setSyncStatus("");
        if (!silent) {
          showToast("Sincronização em nuvem indisponível nesta implantação.", "info");
        }
        return;
      }
      if (!silent) {
        showToast("Erro ao salvar: " + (err?.message || err), "error");
      }
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (!cloudSyncEnabled || !user || !serverApiAvailable || blocks.length === 0) return;
    const timer = setTimeout(() => {
      void saveToCloud(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [blocks, settings, user, serverApiAvailable]);

  const loadFromCloud = async (projectId: string) => {
    try {
      const data = user ? await loadCloudProject(user.id, projectId) : null;
      if (!data) {
        showToast("Projeto não encontrado na nuvem.", "error");
        return;
      }

      const parsedSettings = typeof data.settings === "string" ? JSON.parse(data.settings) : data.settings;
      const parsedBlocks = typeof data.blocks === "string" ? JSON.parse(data.blocks) : data.blocks;

      setSettings(parsedSettings);
      setBlocks(parsedBlocks);
      setCurrentCloudProject(projectId, data.title || "Ebook", data.version || 1);
      showToast("Projeto carregado com sucesso!", "success");
      setShowModal(false);
    } catch (err: any) {
      if (isServerApiUnavailableError(err)) {
        setServerApiAvailable(false);
        setShowModal(false);
        showToast("Sincronização em nuvem indisponível nesta implantação.", "info");
        return;
      }
      showToast("Erro ao carregar: " + (err?.message || err), "error");
    }
  };

  const saveProjectTitle = async (proj: CloudProject) => {
    if (!cloudSyncEnabled || !user) return;

    const nextTitle = editingProjectTitle.trim();
    if (!nextTitle) {
      showToast("Informe um nome válido para o projeto.", "error");
      return;
    }

    const normalizedTitle = normalizeProjectTitle(nextTitle);
    const duplicate = await findProjectByNormalizedTitle(normalizedTitle, proj.id);
    if (duplicate) {
      showToast("Já existe outro projeto salvo com esse nome.", "error");
      return;
    }

    try {
      const saved = await renameCloudProject({
        userId: user.id,
        projectId: proj.id,
        title: nextTitle,
        normalizedTitle,
      });

      if (currentProjectId === proj.id) {
        setCurrentCloudProject(saved.id, saved.title, saved.version);
      }

      setEditingProjectId(null);
      setEditingProjectTitle("");
      showToast(`Projeto renomeado com sucesso! Versão v${saved.version}.`, "success");
      await loadCloudProjects();
    } catch (err: any) {
      if (isServerApiUnavailableError(err)) {
        setServerApiAvailable(false);
        setShowModal(false);
        showToast("Sincronização em nuvem indisponível nesta implantação.", "info");
        return;
      }
      showToast("Erro ao renomear: " + (err?.message || err), "error");
    }
  };

  const deleteCloudProject = async (proj: CloudProject, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = confirm(`Excluir o projeto "${proj.title || "Ebook"}" da nuvem? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    try {
      await apiDeleteCloudProject({ userId: user!.id, projectId: proj.id });
      if (currentProjectId === proj.id) {
        setCurrentCloudProject(null);
      }
      showToast("Projeto excluído da nuvem com sucesso.", "success");
      await loadCloudProjects();
    } catch (err: any) {
      if (isServerApiUnavailableError(err)) {
        setServerApiAvailable(false);
        setShowModal(false);
        showToast("Sincronização em nuvem indisponível nesta implantação.", "info");
        return;
      }
      showToast("Erro ao excluir: " + (err?.message || err), "error");
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {syncStatus && (
          <span className={`text-[10px] font-medium mr-2 hidden sm:block ${syncStatus === "Salvo" ? "text-green-600" : "text-gray-400"}`}>
            {syncStatus === "Salvo" ? "✓ " : ""}
            {syncStatus}
          </span>
        )}

        {!cloudSyncEnabled ? (
          <button
            disabled
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-500 bg-white border border-gray-200 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Sincronização em nuvem desativada nesta implantação"
          >
            <Cloud size={13} /> Nuvem indisponível
          </button>
        ) : !user ? (
          <button
            onClick={handleLogin}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-md transition-colors"
          >
            <LogIn size={13} /> Entrar
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!serverApiAvailable) {
                  showToast("Sincronização em nuvem indisponível nesta implantação.", "info");
                  return;
                }
                setShowModal(true);
                void loadCloudProjects();
              }}
              disabled={!serverApiAvailable}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0A66C2] hover:bg-[#004182] rounded-md transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#0A66C2]"
            >
              <Cloud size={13} /> Nuvem
            </button>
            <button
              onClick={handleLogout}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="Sair da conta"
            >
              <LogOut size={13} />
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-xl font-display font-bold text-gray-900 flex items-center gap-2">
                <Cloud className="text-[#245C5A]" /> Nuvem de Projetos
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-gray-50/30">
              <div className="mb-6 flex flex-col items-center justify-center p-6 bg-blue-50/50 rounded-xl border border-blue-100/50">
                <p className="text-sm text-blue-800 mb-3 text-center opacity-80">
                  Logado como <strong>{user?.email}</strong>
                </p>
                <button
                  onClick={() => void saveToCloud(false)}
                  disabled={isSyncing}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#245C5A] text-white rounded-lg font-bold hover:bg-[#1b4342] shadow-sm disabled:opacity-50 transition-colors"
                >
                  {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Salvar Projeto Atual na Nuvem {currentProjectVersion > 0 ? `(v${currentProjectVersion})` : ""}
                </button>
              </div>

              <h3 className="font-bold text-gray-900 mb-4 px-1">Meus projetos salvos:</h3>
              <div className="space-y-3">
                {cloudProjects.length === 0 && (
                  <div className="text-center py-8 text-gray-400 italic">
                    Nenhum projeto salvo na nuvem ainda.
                  </div>
                )}

                {cloudProjects.map((proj) => {
                  const isEditing = editingProjectId === proj.id;
                  return (
                    <div
                      key={proj.id}
                      className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white border border-gray-200 rounded-lg p-4 hover:border-[#245C5A] hover:shadow-sm transition-all group gap-2"
                    >
                      {isEditing ? (
                        <div className="flex-1 flex items-center gap-2 w-full">
                          <input
                            type="text"
                            value={editingProjectTitle}
                            onChange={(ev) => setEditingProjectTitle(ev.target.value)}
                            className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-[#245C5A] focus:border-[#245C5A] outline-none w-full font-bold"
                            autoFocus
                            onClick={(ev) => ev.stopPropagation()}
                          />
                          <button
                            onClick={() => void saveProjectTitle(proj)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded border border-transparent hover:border-green-200 shrink-0"
                            title="Confirmar alteração"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setEditingProjectId(null);
                            }}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-transparent hover:border-red-200 shrink-0"
                            title="Cancelar"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-bold text-gray-900 truncate max-w-full" title={proj.title}>
                              {proj.title}
                            </h4>
                            {currentProjectId === proj.id && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold text-green-700 bg-green-50 border border-green-200 rounded shrink-0">
                                Atual
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded shrink-0">
                              v{proj.version || 1}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            Atualizado em: {proj.updated_at ? new Date(proj.updated_at).toLocaleString("pt-BR") : "recente"}
                          </p>
                        </div>
                      )}

                      {!isEditing && (
                        <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto justify-end mt-2 sm:mt-0">
                          <button
                            onClick={() => void loadFromCloud(proj.id)}
                            className="flex border border-gray-200 items-center gap-1 px-2.5 py-1.5 bg-gray-50 hover:bg-[#E6F4EA] hover:text-[#137333] hover:border-[#A3E5B7] text-gray-700 text-xs font-semibold rounded-md transition-colors h-8"
                            title="Carregar projeto"
                          >
                            <DownloadCloud size={14} /> Carregar
                          </button>
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setEditingProjectId(proj.id);
                              setEditingProjectTitle(proj.title || "");
                            }}
                            className="p-1.5 text-gray-500 hover:text-[#245C5A] hover:bg-gray-100 border border-gray-200 rounded-md h-8 w-8 flex items-center justify-center transition-all"
                            title="Renomear projeto"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={(ev) => void deleteCloudProject(proj, ev)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 border border-gray-200 rounded-md h-8 w-8 flex items-center justify-center transition-all"
                            title="Excluir projeto da nuvem"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
