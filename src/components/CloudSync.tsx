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
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

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
    setCurrentCloudProject(null);
    showToast("Você saiu da conta.", "info");
  };

  const findProjectByNormalizedTitle = async (normalizedTitle: string, excludeId?: string): Promise<CloudProject | null> => {
    if (!user) return null;
    try {
      const q = query(
        collection(db, "ebooks"),
        where("userId", "==", user.uid),
        where("normalizedTitle", "==", normalizedTitle)
      );
      const snap = await getDocs(q);
      let found: CloudProject | null = null;
      snap.forEach(d => {
        if (!excludeId || d.id !== excludeId) {
          found = { id: d.id, ...d.data() } as CloudProject;
        }
      });
      return found;
    } catch (err) {
      console.error("Erro ao pesquisar por nome normalizado", err);
      return null;
    }
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
      setCloudProjects(projs);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, "ebooks");
    }
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

    try {
      const displayTitle = (currentProjectName || settings.title || "Ebook").trim();
      const normalizedTitle = normalizeProjectTitle(displayTitle);
      let projectId = currentProjectId || `${user.uid}_${normalizedTitle}`;

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
        handleFirestoreError(err, OperationType.WRITE, `ebooks/${currentProjectId || 'new'}`);
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
  }, [blocks, settings, user]);

  const loadFromCloud = async (projectId: string) => {
    try {
      const d = await getDoc(doc(db, "ebooks", projectId));
      if (d.exists()) {
        const data = d.data() as CloudProject;
        if (data.settings && data.blocks) {
          setSettings(JSON.parse(data.settings));
          setBlocks(JSON.parse(data.blocks));
          setCurrentCloudProject(projectId, data.title || "Ebook", data.version || 1);
          showToast("Projeto carregado com sucesso!", "success");
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

  const saveProjectTitle = async (proj: CloudProject, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user) return;

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

    const nextVersion = (proj.version || 0) + 1;

    try {
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
            {syncStatus === 'Salvo' ? '✓ ' : ''}{syncStatus}
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
            
            <div className="p-6 overflow-y-auto flex-1 bg-gray-50/30">
              <div className="mb-6 flex flex-col items-center justify-center p-6 bg-blue-50/50 rounded-xl border border-blue-100/50">
                <p className="text-sm text-blue-800 mb-3 text-center opacity-80">
                  Logado como <strong>{user?.email}</strong>
                </p>
                <button
                  onClick={() => saveToCloud(false)}
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
                
                {cloudProjects.map(proj => {
                  const isEditing = editingProjectId === proj.id;
                  return (
                    <div key={proj.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white border border-gray-200 rounded-lg p-4 hover:border-[#245C5A] hover:shadow-sm transition-all group gap-2">
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
                            onClick={(ev) => saveProjectTitle(proj, ev)}
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
                            Atualizado em: {proj.updatedAt?.toDate ? proj.updatedAt.toDate().toLocaleString('pt-BR') : 'recente'}
                          </p>
                        </div>
                      )}

                      {!isEditing && (
                        <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto justify-end mt-2 sm:mt-0">
                          <button
                            onClick={() => loadFromCloud(proj.id)}
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
                            onClick={(ev) => deleteCloudProject(proj, ev)}
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
