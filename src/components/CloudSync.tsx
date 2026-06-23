import React, { useState, useEffect } from "react";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, where, deleteDoc } from "firebase/firestore";
import { Cloud, LogIn, LogOut, Save, DownloadCloud, Loader2, Trash2, Pencil, Check, X } from "lucide-react";
import { ProjectSettings, ContentBlock } from "../types";

type CloudProject = {
  id: string;
  userId?: string;
  title?: string;
  normalizedTitle?: string;
  blocks?: string;
  settings?: string;
  version?: number;
  createdAt?: any;
  updatedAt?: any;
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

const getProjectDateLabel = (dateValue: any): string => {
  if (dateValue?.toDate) {
    return dateValue.toDate().toLocaleString("pt-BR");
  }
  return "recente";
};

export function CloudSync({ 
  settings, 
  blocks, 
  setSettings, 
  setBlocks,
  showToast 
}: { 
  settings: ProjectSettings;
  blocks: ContentBlock[];
  setSettings: (s: ProjectSettings) => void;
  setBlocks: (b: ContentBlock[]) => void;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [cloudProjects, setCloudProjects] = useState<CloudProject[]>([]);
  const [syncStatus, setSyncStatus] = useState<"Salvando..." | "Salvo" | "">("");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => localStorage.getItem("ebook_cloud_current_project_id"));
  const [currentProjectName, setCurrentProjectName] = useState<string>(() => localStorage.getItem("ebook_cloud_current_project_name") || "");
  const [currentProjectVersion, setCurrentProjectVersion] = useState<number>(() => {
    const stored = localStorage.getItem("ebook_cloud_current_project_version");
    return stored ? Number(stored) || 0 : 0;
  });
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectTitle, setEditingProjectTitle] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setCurrentProjectId(null);
        setCurrentProjectName("");
        setCurrentProjectVersion(0);
        localStorage.removeItem("ebook_cloud_current_project_id");
        localStorage.removeItem("ebook_cloud_current_project_name");
        localStorage.removeItem("ebook_cloud_current_project_version");
      }
    });
    return () => unsub();
  }, []);

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

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      showToast("Logado com sucesso!", "success");
    } catch (err: any) {
      showToast("Erro ao fazer login: " + err.message, "error");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    showToast("Você saiu da conta.", "info");
  };

  const loadCloudProjects = async () => {
    if (!user) return;
    try {
      const q = query(collection(db, "ebooks"), where("userId", "==", user.uid));
      const snap = await getDocs(q);
      const projs: CloudProject[] = [];
      snap.forEach(d => {
        projs.push({ id: d.id, ...d.data() } as CloudProject);
      });
      projs.sort((a, b) => {
        const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
        const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
        return bTime - aTime;
      });
      setCloudProjects(projs);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, "ebooks");
    }
  };

  const findProjectByNormalizedTitle = async (normalizedTitle: string, ignoreId?: string | null): Promise<CloudProject | null> => {
    if (!user) return null;
    const q = query(
      collection(db, "ebooks"),
      where("userId", "==", user.uid),
      where("normalizedTitle", "==", normalizedTitle)
    );
    const snap = await getDocs(q);
    let found: CloudProject | null = null;
    snap.forEach(d => {
      if (!found && d.id !== ignoreId) {
        found = { id: d.id, ...d.data() } as CloudProject;
      }
    });
    return found;
  };

  const handleOpenModal = () => {
    setShowModal(true);
    if (user) {
      loadCloudProjects();
    }
  };

  const saveToCloud = async (silent = false) => {
    if (!user) return;
    if (blocks.length === 0) {
      if (!silent) showToast("Adicione conteúdo antes de salvar na nuvem.", "error");
      return;
    }
    
    setIsSyncing(true);
    if (silent) setSyncStatus("Salvando...");
    
    const displayTitle = (currentProjectName || settings.title || "Ebook").trim();
    const normalizedTitle = normalizeProjectTitle(displayTitle);
    let projectId = currentProjectId || `${user.uid}_${normalizedTitle}`;
    
    try {
      if (!currentProjectId) {
        const duplicate = await findProjectByNormalizedTitle(normalizedTitle);
        if (duplicate) {
          projectId = duplicate.id;
        }
      }

      const docRef = doc(db, "ebooks", projectId);
      const docSnap = await getDoc(docRef);
      const existingData = docSnap.exists() ? docSnap.data() as CloudProject : null;
      const nextVersion = (existingData?.version || currentProjectVersion || 0) + 1;

      await setDoc(docRef, {
        userId: user.uid,
        title: displayTitle,
        normalizedTitle,
        version: nextVersion,
        blocks: JSON.stringify(blocks),
        settings: JSON.stringify(settings),
        createdAt: existingData?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      setCurrentCloudProject(projectId, displayTitle, nextVersion);
      
      if (!silent) {
        showToast(`Projeto salvo na nuvem com sucesso! Versão v${nextVersion}.`, "success");
        loadCloudProjects();
      } else {
        setSyncStatus("Salvo");
        setTimeout(() => setSyncStatus(""), 3000);
      }
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, `ebooks/${projectId}`);
      } catch (e: any) {
        if (!silent) showToast("Erro ao salvar: " + e.message, "error");
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Auto-save logic
  useEffect(() => {
    if (!user || blocks.length === 0) return;
    
    const timer = setTimeout(() => {
      saveToCloud(true);
    }, 5000);
    
    return () => clearTimeout(timer);
  }, [blocks, settings, user, currentProjectId, currentProjectName]);

  const loadFromCloud = async (projectId: string) => {
    try {
      const d = await getDoc(doc(db, "ebooks", projectId));
      if (d.exists()) {
        const data = d.data() as CloudProject;
        if (data.settings && data.blocks) {
          setSettings(JSON.parse(data.settings));
          setBlocks(JSON.parse(data.blocks));
          setCurrentCloudProject(projectId, data.title || "Ebook", data.version || 1);
          showToast(`Projeto carregado com sucesso! Versão v${data.version || 1}.`, "success");
          setShowModal(false);
        }
      } else {
        showToast("Projeto não encontrado na nuvem.", "error");
      }
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.GET, `ebooks/${projectId}`);
      } catch (e: any) {
        showToast("Erro ao carregar: " + e.message, "error");
      }
    }
  };

  const startEditingProjectTitle = (proj: CloudProject, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProjectId(proj.id);
    setEditingProjectTitle(proj.title || "Ebook");
  };

  const cancelEditingProjectTitle = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingProjectId(null);
    setEditingProjectTitle("");
  };

  const saveProjectTitle = async (proj: CloudProject, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user) return;

    const nextTitle = editingProjectTitle.trim();
    if (!nextTitle) {
      showToast("Informe um nome válido para o projeto.", "error");
      return;
    }

    const normalizedTitle = normalizeProjectTitle(nextTitle);
    try {
      const duplicate = await findProjectByNormalizedTitle(normalizedTitle, proj.id);
      if (duplicate) {
        showToast("Já existe outro projeto salvo com esse nome.", "error");
        return;
      }

      const nextVersion = (proj.version || 0) + 1;
      await setDoc(doc(db, "ebooks", proj.id), {
        title: nextTitle,
        normalizedTitle,
        version: nextVersion,
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (currentProjectId === proj.id) {
        setCurrentCloudProject(proj.id, nextTitle, nextVersion);
      }

      setEditingProjectId(null);
      setEditingProjectTitle("");
      showToast(`Projeto renomeado com sucesso! Versão v${nextVersion}.`, "success");
      loadCloudProjects();
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, `ebooks/${proj.id}`);
      } catch (e: any) {
        showToast("Erro ao renomear: " + e.message, "error");
      }
    }
  };

  const deleteCloudProject = async (proj: CloudProject, e: React.MouseEvent) => {
    e.stopPropagation();

    const confirmed = confirm(`Excluir o projeto "${proj.title || "Ebook"}" da nuvem? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "ebooks", proj.id));
      if (currentProjectId === proj.id) {
        setCurrentCloudProject(null);
      }
      showToast("Projeto excluído da nuvem com sucesso.", "success");
      loadCloudProjects();
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.DELETE, `ebooks/${proj.id}`);
      } catch (e: any) {
        showToast("Erro ao excluir: " + e.message, "error");
      }
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {syncStatus && (
          <span className={`text-[10px] font-medium mr-2 hidden sm:block ${syncStatus === 'Salvo' ? 'text-green-600' : 'text-gray-400'}`}>
            {syncStatus === 'Salvo' ? `✓ Salvo v${currentProjectVersion || 1}` : syncStatus}
          </span>
        )}
        {!user ? (
          <button
            onClick={handleLogin}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-md transition-colors"
          >
            <LogIn size={13} /> Entrar
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {currentProjectId && (
              <span className="hidden lg:inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-[10px] font-mono text-gray-500 border border-gray-200 max-w-[180px] truncate" title={currentProjectName || "Projeto atual"}>
                v{currentProjectVersion || 1} · {currentProjectName || "Projeto atual"}
              </span>
            )}
            <button
              onClick={handleOpenModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0A66C2] hover:bg-[#004182] rounded-md transition-colors shadow-xs"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-xl font-display font-bold text-gray-900 flex items-center gap-2">
                <Cloud className="text-[#245C5A]" /> Nuvem de Projetos
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-6 flex flex-col items-center justify-center p-6 bg-blue-50/50 rounded-xl border border-blue-100/50">
                <p className="text-sm text-blue-800 mb-1 text-center opacity-80">
                  Logado como <strong>{user?.email}</strong>
                </p>
                {currentProjectId && (
                  <p className="text-xs text-blue-700 mb-3 text-center opacity-70">
                    Projeto atual: <strong>{currentProjectName || settings.title || "Ebook"}</strong> · v{currentProjectVersion || 1}
                  </p>
                )}
                <button
                  onClick={() => saveToCloud(false)}
                  disabled={isSyncing}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#245C5A] text-white rounded-lg font-bold hover:bg-[#1b4342] shadow-sm disabled:opacity-50 transition-colors"
                >
                  {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {currentProjectId ? "Salvar Nova Versão" : "Salvar Projeto Atual na Nuvem"}
                </button>
              </div>

              <div className="flex items-center justify-between mb-4 px-1">
                <h3 className="font-bold text-gray-900">Meus projetos salvos:</h3>
                <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {cloudProjects.length} projeto{cloudProjects.length === 1 ? "" : "s"}
                </span>
              </div>
              
              <div className="space-y-3">
                {cloudProjects.length === 0 && (
                  <div className="text-center py-8 text-gray-400 italic">
                    Nenhum projeto salvo na nuvem ainda.
                  </div>
                )}
                
                {cloudProjects.map(proj => {
                  const isCurrent = proj.id === currentProjectId;
                  const isEditing = editingProjectId === proj.id;
                  return (
                    <div key={proj.id} className={`flex flex-col gap-3 bg-white border rounded-lg p-4 hover:border-[#245C5A] hover:shadow-sm transition-all group ${isCurrent ? "border-[#245C5A] bg-[#F4EFE7]/30" : "border-gray-200"}`}>
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <input
                                value={editingProjectTitle}
                                onChange={(e) => setEditingProjectTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveProjectTitle(proj);
                                  if (e.key === "Escape") cancelEditingProjectTitle();
                                }}
                                className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#245C5A]/30"
                                autoFocus
                              />
                              <button onClick={(e) => saveProjectTitle(proj, e)} className="p-1.5 rounded-md text-green-700 hover:bg-green-50" title="Salvar nome">
                                <Check size={16} />
                              </button>
                              <button onClick={cancelEditingProjectTitle} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100" title="Cancelar">
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 min-w-0">
                              <h4 className="font-bold text-gray-900 truncate">{proj.title || "Ebook"}</h4>
                              {isCurrent && (
                                <span className="text-[9px] bg-[#245C5A] text-white px-1.5 py-0.5 rounded font-mono uppercase font-bold shrink-0">
                                  Atual
                                </span>
                              )}
                            </div>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            v{proj.version || 1} · Atualizado em: {getProjectDateLabel(proj.updatedAt)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <button
                            onClick={() => loadFromCloud(proj.id)}
                            className="flex border border-gray-200 items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-[#E6F4EA] hover:text-[#137333] hover:border-[#A3E5B7] text-gray-700 text-sm font-medium rounded-md transition-colors flex-1 sm:flex-none justify-center shrink-0"
                          >
                            <DownloadCloud size={16} /> Carregar
                          </button>
                          <button
                            onClick={(e) => startEditingProjectTitle(proj, e)}
                            className="p-2 border border-gray-200 rounded-md text-gray-500 hover:text-[#245C5A] hover:bg-[#F4EFE7] transition-colors"
                            title="Editar nome do projeto"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={(e) => deleteCloudProject(proj, e)}
                            className="p-2 border border-red-100 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                            title="Excluir projeto da nuvem"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
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
