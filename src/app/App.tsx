import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import ListView from '../features/views/ListView';
import CardView from '../features/views/CardView';
import TableView from '../features/views/TableView';
import CalendarView from '../features/views/CalendarView';
import TimelineView from '../features/views/TimelineView';
import NoteEditor from '../features/editor/NoteEditor';
import { useNoteStore } from '../store/noteStore';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { 
  Search, ArrowUpDown, List as ListIcon, LayoutGrid, 
  Table as TableIcon, Calendar, GitCommit 
} from 'lucide-react';

export default function App() {
  const store = useNoteStore();
  const { loadInitialData, searchQuery, setSearchQuery, theme, sortCriteria, setSortCriteria } = store;
  const [activeTab, setActiveTab] = useState<'list' | 'grid' | 'table' | 'calendar' | 'timeline'>('list');
  
  const isAsc = sortCriteria[0]?.asc ?? true;
  const isLight = theme === 'light';

  const urlParams = new URLSearchParams(window.location.search);
  const singleNoteId = urlParams.get('noteId');

  const handleQuickNewNote = async () => {
    try {
      try {
        const win = getCurrentWindow();
        await win.show();
        await win.setFocus();
      } catch (e) {}
      await useNoteStore.getState().createNote(null);
    } catch (err) {
      console.error("Hızlı yeni not oluşturulamadı:", err);
    }
  };

  // --- KLAVYE KISAYOLLARI (CTRL + 1, 2, 3, 4, 5) ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
        return;
      }

      if (e.ctrlKey) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveTab('list');
        } else if (e.key === '2') {
          e.preventDefault();
          setActiveTab('grid');
        } else if (e.key === '3') {
          e.preventDefault();
          setActiveTab('table');
        } else if (e.key === '4') {
          e.preventDefault();
          setActiveTab('calendar');
        } else if (e.key === '5') {
          e.preventDefault();
          setActiveTab('timeline');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  // ------------------------------------------------

  useEffect(() => {
    const initApp = async () => {
      await loadInitialData();
      if (!singleNoteId) {
        try {
          const win = getCurrentWindow();
          await win.setSize(new LogicalSize(640, 830));
        } catch {}
      }
      requestAnimationFrame(() => {
        invoke('editor_ready').catch(async () => {
          try {
            const win = getCurrentWindow();
            await win.show();
            await win.setFocus();
          } catch {}
        });
      });
    };

    initApp();

    let unlistenPromise: Promise<() => void> | null = null;
    if (!singleNoteId) {
      unlistenPromise = listen("tray-new-note", () => {
        handleQuickNewNote();
      });
    }

    const onFocus = () => loadInitialData();
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      if (unlistenPromise) unlistenPromise.then((unlistenFn) => unlistenFn());
    };
  }, [singleNoteId]);

  // --- BİLDİRİM İZNİ KONTROLÜ (Bildirimler Rust backend tarafından atılır) ---
  useEffect(() => {
    if (singleNoteId) return;
    const checkPermissions = async () => {
      try {
        let hasPermission = await isPermissionGranted();
        if (!hasPermission) await requestPermission();
      } catch (error) {
        console.error("Bildirim izni hatası:", error);
      }
    };
    checkPermissions();
  }, [singleNoteId]);

  if (singleNoteId) {
    return (
      <div className={`h-screen w-screen overflow-hidden flex flex-col font-sans ${isLight ? 'bg-white text-zinc-900' : 'bg-zinc-900 text-zinc-100'}`}>
        <NoteEditor noteId={singleNoteId} />
      </div>
    );
  }

  const renderActiveView = () => {
    switch (activeTab) {
      case 'list': return <ListView />;
      case 'grid': return <CardView />;
      case 'table': return <TableView />;
      case 'calendar': return <CalendarView />;
      case 'timeline': return <TimelineView />;
      default: return <ListView />;
    }
  };

  return (
    <div className={`flex h-screen w-full overflow-hidden select-none font-sans ${isLight ? 'bg-zinc-50 text-zinc-900' : 'bg-zinc-950 text-zinc-100'}`}>
      <Sidebar />
      <main className="w-[384px] flex-shrink-0 flex flex-col h-full border-l border-zinc-800/40 overflow-hidden">
        <div className={`p-3 border-b space-y-2.5 ${isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900/60 border-zinc-800'}`}>
          <div className="flex items-center gap-2">
            <div className={`flex-1 flex items-center gap-2 border px-3 py-1.5 rounded-lg ${isLight ? 'bg-zinc-100 border-zinc-300 text-zinc-800' : 'bg-zinc-950 border-zinc-800 text-zinc-200'}`}>
              <Search size={15} className="text-zinc-500 shrink-0" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Başlık veya içerikte ara... (Ctrl+F)" className="w-full bg-transparent text-xs outline-none placeholder-zinc-500" />
            </div>
            
            {/* Sıralama Yönü Butonu (Başlangıç Tarihine Göre) */}
            <button 
              type="button"
              onClick={() => setSortCriteria([{ field: 'start_at', asc: !isAsc }])} 
              title={isAsc ? 'Artan Sıralama (Eskiden Yeniye)' : 'Azalan Sıralama (Yeniden Eskiye)'}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${isLight ? 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-100' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'}`}
            >
              <ArrowUpDown size={15} />
            </button>
          </div>

          {/* Görünüm Sekmeleri Butonları ve Kısayolları */}
          <div className={`flex items-center gap-1 border p-1 rounded-lg w-fit ${isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-950 border-zinc-800'}`}>
            <button type="button" onClick={() => setActiveTab('list')} title="Liste Görünümü (Ctrl+1)" className={`p-1.5 rounded-md transition-colors cursor-pointer ${activeTab === 'list' ? (isLight ? 'bg-white text-zinc-900 shadow-sm' : 'bg-zinc-800 text-white') : 'text-zinc-500 hover:text-zinc-300'}`}><ListIcon size={14} /></button>
            <button type="button" onClick={() => setActiveTab('grid')} title="Kart Görünümü (Ctrl+2)" className={`p-1.5 rounded-md transition-colors cursor-pointer ${activeTab === 'grid' ? (isLight ? 'bg-white text-zinc-900 shadow-sm' : 'bg-zinc-800 text-white') : 'text-zinc-500 hover:text-zinc-300'}`}><LayoutGrid size={14} /></button>
            <button type="button" onClick={() => setActiveTab('table')} title="Tablo Görünümü (Ctrl+3)" className={`p-1.5 rounded-md transition-colors cursor-pointer ${activeTab === 'table' ? (isLight ? 'bg-white text-zinc-900 shadow-sm' : 'bg-zinc-800 text-white') : 'text-zinc-500 hover:text-zinc-300'}`}><TableIcon size={14} /></button>
            <button type="button" onClick={() => setActiveTab('calendar')} title="Takvim Görünümü (Ctrl+4)" className={`p-1.5 rounded-md transition-colors cursor-pointer ${activeTab === 'calendar' ? (isLight ? 'bg-white text-zinc-900 shadow-sm' : 'bg-zinc-800 text-white') : 'text-zinc-500 hover:text-zinc-300'}`}><Calendar size={14} /></button>
            <button type="button" onClick={() => setActiveTab('timeline')} title="Timeline Görünümü (Ctrl+5)" className={`p-1.5 rounded-md transition-colors cursor-pointer ${activeTab === 'timeline' ? (isLight ? 'bg-white text-zinc-900 shadow-sm' : 'bg-zinc-800 text-white') : 'text-zinc-500 hover:text-zinc-300'}`}><GitCommit size={14} /></button>
          </div>
        </div>
        
        {/* Aktif Görünüm */}
        <div className="flex-1 overflow-hidden">
          {renderActiveView()}
        </div>
      </main>
    </div>
  );
}