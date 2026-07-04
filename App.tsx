
import React, { useState, useEffect } from 'react';
import { FileUploader } from './components/FileUploader';
import { LoginPage } from './components/LoginPage';
import { ResultTable } from './components/ResultTable';
import { extractDocumentData } from './services/geminiService';
import {
  deleteInvoices,
  getAuthStatus,
  getInvoices,
  importRows,
  login,
  logout,
  permanentlyDeleteInvoices,
  restoreInvoices,
  updateInvoiceField,
} from './services/api';
import { FileMetadata, ExtractionStatus, RegistryRow } from './types';

type AuthUser = { name: string };

const App: React.FC = () => {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [db, setDb] = useState<RegistryRow[]>([]);
  const [trash, setTrash] = useState<RegistryRow[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [processingFiles, setProcessingFiles] = useState<FileMetadata[]>([]);
  const [status, setStatus] = useState<ExtractionStatus>(ExtractionStatus.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getAuthStatus()
      .then((state) => {
        if (cancelled) return;
        setAuthUser(state.authenticated ? state.user : null);
      })
      .catch(() => {
        if (!cancelled) setAuthUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsAuthLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;

    getInvoices()
      .then((state) => {
        if (cancelled) return;
        setDb(state.data);
        setTrash(state.trash);
      })
      .catch((error) => {
        if (!cancelled) setErrorMsg(`Ошибка загрузки реестра: ${error.message}`);
      });

    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const handleLogin = async (username: string, password: string) => {
    const state = await login(username, password);
    if (!state.authenticated || !state.user) throw new Error('Не удалось войти');
    setAuthUser(state.user);
  };

  const handleLogout = async () => {
    await logout();
    setAuthUser(null);
    setDb([]);
    setTrash([]);
    setProcessingFiles([]);
    setIsUploadModalOpen(false);
    setErrorMsg(null);
  };

  const handleFilesSelect = (newFiles: FileMetadata[]) => {
    setProcessingFiles(prev => [...prev, ...newFiles]);
  };

  const processFile = async (file: FileMetadata) => {
    setProcessingFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'processing' } : f));
    try {
      const data = await extractDocumentData(file.base64, file.type, "", 'registry');
      if (data && data.registry && Array.isArray(data.registry)) {
        const now = new Date().toISOString();
        const newRows: RegistryRow[] = data.registry.map((row: any) => {
          const existingIdx = db.findIndex(ex => 
            ex.Контрагент === row.Контрагент && 
            ex.Примечание === row.Примечание
          );

          if (existingIdx !== -1) {
             if (!window.confirm(`Счет "${row.Контрагент}" (${row.Примечание}) уже существует. Заменить данные?`)) return null;
             // Replacement logic is handled below
          }
          
          return {
            ...row,
            dbId: Math.random().toString(36).substring(2, 11),
            "Статус": 'Не начат',
            "Дата оплаты": '',
            "Дата загрузки": now,
            "Дата изменения": now,
            "Заявитель": 'Система',
            _fileId: file.id,
            _fileName: file.name,
            Товары: row.Товары || []
          };
        }).filter(Boolean) as RegistryRow[];
        
        if (newRows.length > 0) {
          const state = await importRows(newRows);
          setDb(state.data);
          setTrash(state.trash);
        }
      }
      setProcessingFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'completed' } : f));
    } catch (e: any) {
      console.error("Processing error:", e);
      setProcessingFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'error' } : f));
      
      const errorMessage = e.message || JSON.stringify(e);
      if (errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("quota")) {
        setErrorMsg("Лимит запросов Gemini исчерпан. Проверьте серверный GEMINI_API_KEY или смените ключ в .env.");
      } else if (errorMessage.includes("Requested entity was not found")) {
        setErrorMsg("Ошибка авторизации Gemini. Обновите GEMINI_API_KEY на сервере.");
      } else {
        setErrorMsg(`Ошибка: ${errorMessage}`);
      }
      throw e; // Rethrow to stop Promise.allSettled if needed, though allSettled continues
    }
  };

  const handleProcessAll = async () => {
    setStatus(ExtractionStatus.LOADING);
    setErrorMsg(null);
    const pending = processingFiles.filter(f => f.status === 'pending' || f.status === 'error');
    if (pending.length === 0) {
      setStatus(ExtractionStatus.IDLE);
      return;
    }
    
    const results = await Promise.allSettled(pending.map(file => processFile(file)));
    
    const hasError = results.some(r => r.status === 'rejected');
    if (hasError) {
      setStatus(ExtractionStatus.ERROR);
    } else {
      setStatus(ExtractionStatus.SUCCESS);
      setTimeout(() => {
        setProcessingFiles([]);
        setIsUploadModalOpen(false);
        setStatus(ExtractionStatus.IDLE);
      }, 1500);
    }
  };

  const handleDeleteRows = async (ids: string[]) => {
    try {
      const state = await deleteInvoices(ids);
      setDb(state.data);
      setTrash(state.trash);
    } catch (error: any) {
      setErrorMsg(`Ошибка удаления: ${error.message}`);
    }
  };

  const handleRestoreRows = async (ids: string[]) => {
    try {
      const state = await restoreInvoices(ids);
      setDb(state.data);
      setTrash(state.trash);
    } catch (error: any) {
      setErrorMsg(`Ошибка восстановления: ${error.message}`);
    }
  };

  const handlePermanentDelete = async (ids: string[]) => {
    if (window.confirm(`Вы уверены, что хотите окончательно удалить эти записи (${ids.length})? Это действие нельзя отменить.`)) {
      try {
        const state = await permanentlyDeleteInvoices(ids);
        setDb(state.data);
        setTrash(state.trash);
      } catch (error: any) {
        setErrorMsg(`Ошибка окончательного удаления: ${error.message}`);
      }
    }
  };

  const handleUpdateRow = async (dbId: string, field: string, value: any) => {
    setDb(prev => prev.map(row => row.dbId === dbId ? { ...row, [field]: value, "Дата изменения": new Date().toISOString() } : row));
    try {
      const updated = await updateInvoiceField(dbId, field, value);
      setDb(prev => prev.map(row => row.dbId === dbId ? updated : row));
    } catch (error: any) {
      setErrorMsg(`Ошибка сохранения: ${error.message}`);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans text-sm font-semibold text-slate-500">
        Загрузка...
      </div>
    );
  }

  if (!authUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b h-20 flex items-center justify-between px-8 sticky top-0 z-40 shadow-sm border-slate-200">
        <div className="flex items-center gap-4">
          <div className="h-12 w-32 flex items-center">
            <img src="/ab-systems-logo.png" alt="A&B Systems" className="max-h-10 w-auto object-contain" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold text-slate-950 leading-none">A&amp;B Systems Construction Company</h1>
            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mt-1">Реестр счетов на оплату</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <div className="flex flex-col leading-none">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Вошел</span>
              <span className="mt-1 text-xs font-semibold text-slate-800">{authUser.name}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="px-5 py-3 border border-slate-200 bg-white text-slate-600 text-xs font-semibold uppercase tracking-wide rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-all"
          >
            Выйти
          </button>
          <button 
            onClick={() => setIsUploadModalOpen(true)} 
            className="px-8 py-3.5 bg-blue-700 text-white text-xs font-semibold uppercase tracking-wide rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-800 active:scale-95 transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            Загрузить счет
          </button>
        </div>
      </header>
      <main className="flex-1 p-8">
        <ResultTable 
          data={db} 
          trash={trash}
          onUpdateRow={handleUpdateRow}
          onDeleteRows={handleDeleteRows}
          onRestoreRows={handleRestoreRows}
          onPermanentDelete={handlePermanentDelete}
        />
      </main>

      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in duration-500">
            <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Добавление документов</h3>
              <button onClick={() => setIsUploadModalOpen(false)} className="p-3 hover:bg-slate-200 rounded-2xl transition-all text-slate-500">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {errorMsg && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl">
                  <p className="text-xs font-bold text-red-600 mb-3">{errorMsg}</p>
                  <button 
                    onClick={() => setErrorMsg(null)}
                    className="text-[10px] font-black uppercase bg-red-600 text-white px-4 py-2 rounded-xl"
                  >
                    Закрыть
                  </button>
                </div>
              )}
              <FileUploader onFilesSelect={handleFilesSelect} isLoading={status === ExtractionStatus.LOADING} />
              {processingFiles.length > 0 && (
                <div className="mt-8 space-y-3">
                  {processingFiles.map((f) => (
                    <div key={f.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <div className="flex items-center gap-4 overflow-hidden">
                         <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-md border border-slate-100">
                            {f.status === 'completed' ? (
                              <svg className="w-6 h-6 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg>
                            ) : f.status === 'processing' ? (
                              <div className="w-5 h-5 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            ) : f.status === 'error' ? (
                              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            ) : (
                              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            )}
                         </div>
                         <div className="truncate flex flex-col">
                           <p className="text-xs font-black text-slate-800 truncate">{f.name}</p>
                           <p className="text-[9px] font-bold text-slate-400">{(f.size / 1024).toFixed(0)} KB</p>
                         </div>
                      </div>
                      <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${f.status === 'pending' ? 'bg-slate-100 text-slate-400' : f.status === 'processing' ? 'bg-indigo-50 text-indigo-600 animate-pulse' : f.status === 'completed' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                        {f.status === 'pending' ? 'В очереди' : f.status === 'processing' ? 'Анализ...' : f.status === 'completed' ? 'Готово' : 'Ошибка'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-10 py-8 border-t border-slate-100 bg-slate-50 flex gap-4">
              <button onClick={() => { setProcessingFiles([]); setIsUploadModalOpen(false); setErrorMsg(null); }} className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-slate-400 hover:bg-slate-200 rounded-2xl transition-all">Отмена</button>
              <button 
                disabled={processingFiles.length === 0 || status === ExtractionStatus.LOADING} 
                onClick={handleProcessAll} 
                className="flex-[2] py-4 bg-indigo-600 text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl shadow-2xl shadow-indigo-100 disabled:bg-slate-200 transition-all active:scale-95"
              >
                {status === ExtractionStatus.LOADING ? 'Распознавание...' : 'Начать импорт'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
