import React, { useState, useEffect } from "react";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, where } from "firebase/firestore";
import { Cloud, LogIn, LogOut, Save, DownloadCloud, Loader2 } from "lucide-react";
import { ProjectSettings, ContentBlock } from "../types";

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
  const [cloudProjects, setCloudProjects] = useState<any[]>([]);

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
    showToast("Você saiu da conta.", "info");
  };

  const loadCloudProjects = async () => {
    if (!user) return;
    try {
      const q = query(collection(db, "ebooks"), where("userId", "==", user.uid));
      const snap = await getDocs(q);
      const projs: any[] = [];
      snap.forEach(d => {
        projs.push({ id: d.id, ...d.data() });
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

  const saveToCloud = async () => {
    if (!user) return;
    if (blocks.length === 0) {
      showToast("Adicione conteúdo antes de salvar na nuvem.", "error");
      return;
    }
    
    setIsSyncing(true);
    
    // Create a safe default ID for the user's project
    const safeTitle = (settings.title || 'untitled').toLowerCase().replace(/[^a-z0-9]/g, '-');
    const projectId = `${user.uid}_${safeTitle}`;
    
    try {
      const docRef = doc(db, "ebooks", projectId);
      let exists = false;
      
      try {
        const docSnap = await getDoc(docRef);
        exists = docSnap.exists();
      } catch (e: any) {
        // If getDoc fails due to permission errors (which happens if the doc doesn't exist
        // or belongs to someone else), we assume it doesn't exist yet and we try to create it.
        exists = false;
      }

      if (exists) {
        await setDoc(docRef, {
          userId: user.uid,
          title: settings.title || "Ebook",
          blocks: JSON.stringify(blocks),
          settings: JSON.stringify(settings),
          updatedAt: serverTimestamp()
        }, { merge: true });
      } else {
        await setDoc(docRef, {
          userId: user.uid,
          title: settings.title || "Ebook",
          blocks: JSON.stringify(blocks),
          settings: JSON.stringify(settings),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      showToast("Projeto salvo na nuvem com sucesso!", "success");
      loadCloudProjects();
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, `ebooks/${projectId}`);
      } catch (e: any) {
        showToast("Erro ao salvar: " + e.message, "error");
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const loadFromCloud = async (projectId: string) => {
    try {
      const d = await getDoc(doc(db, "ebooks", projectId));
      if (d.exists()) {
        const data = d.data();
        if (data.settings && data.blocks) {
          setSettings(JSON.parse(data.settings));
          setBlocks(JSON.parse(data.blocks));
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

  return (
    <>
      <div className="flex items-center gap-2">
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
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-6 flex flex-col items-center justify-center p-6 bg-blue-50/50 rounded-xl border border-blue-100/50">
                <p className="text-sm text-blue-800 mb-3 text-center opacity-80">
                  Logado como <strong>{user?.email}</strong>
                </p>
                <button
                  onClick={saveToCloud}
                  disabled={isSyncing}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#245C5A] text-white rounded-lg font-bold hover:bg-[#1b4342] shadow-sm disabled:opacity-50 transition-colors"
                >
                  {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Salvar Projeto Atual na Nuvem
                </button>
              </div>

              <h3 className="font-bold text-gray-900 mb-4 px-1">Meus projetos salvos:</h3>
              
              <div className="space-y-3">
                {cloudProjects.length === 0 && (
                  <div className="text-center py-8 text-gray-400 italic">
                    Nenhum projeto salvo na nuvem ainda.
                  </div>
                )}
                
                {cloudProjects.map(proj => (
                  <div key={proj.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white border border-gray-200 rounded-lg p-4 hover:border-[#245C5A] hover:shadow-sm transition-all group">
                    <div className="mb-3 sm:mb-0">
                      <h4 className="font-bold text-gray-900 line-clamp-1">{proj.title}</h4>
                      <p className="text-xs text-gray-500 mt-1">Atualizado em: {proj.updatedAt?.toDate ? proj.updatedAt.toDate().toLocaleString('pt-BR') : 'recente'}</p>
                    </div>
                    <button
                      onClick={() => loadFromCloud(proj.id)}
                      className="flex border border-gray-200 items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-[#E6F4EA] hover:text-[#137333] hover:border-[#A3E5B7] text-gray-700 text-sm font-medium rounded-md transition-colors w-full sm:w-auto justify-center shrink-0"
                    >
                      <DownloadCloud size={16} /> Carregar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
