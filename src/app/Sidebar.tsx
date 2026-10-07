import React, { useState } from 'react';
import { 
  FileText, Star, Trash2, Plus, Calendar, AlertCircle, 
  Clock, CheckCircle2, Pin, X, Download, FileSpreadsheet, Upload, Archive, Sun, Moon, Info, ArrowLeft
} from 'lucide-react';
import { useNoteStore, SmartViewScope, getLocalDateString } from '../store/noteStore';
import { save, open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

// YASAL VE BİLGİLENDİRİCİ METİNLERİMİZ
const eulaText = `SON KULLANICI LİSANS SÖZLEŞMESİ (EULA)

ÖNEMLİ - LÜTFEN DİKKATLİCE OKUYUN: 
Bu Son Kullanıcı Lisans Sözleşmesi ("Sözleşme"), siz (gerçek veya tüzel kişi) ile yazılımın geliştiricisi ve hak sahibi Buğra Demirçelik arasında, "BD Notlar" yazılımı (bundan böyle "Ürün" veya "Yazılım" olarak anılacaktır) için akdedilmiş yasal ve bağlayıcı bir sözleşmedir.

Ürünü bilgisayarınıza kurarak, kopyalayarak, indirerek veya herhangi bir şekilde kullanarak bu Sözleşmenin tüm şartlarını kabul etmiş sayılırsınız.

1. FİKRİ MÜLKİYET HAKLARI
Bu Ürün telif hakları ve diğer fikri mülkiyet yasaları tarafından korunmaktadır. Ürün üzerindeki tüm mülkiyet, telif hakları ve fikri mülkiyet hakları Buğra Demirçelik'e aittir.

2. VERİ GİZLİLİĞİ
"BD Notlar" tamamen yerel cihazınızda çalışan (offline) bir uygulamadır. Oluşturduğunuz tüm notlar cihazınızda saklanır. Geliştirici verilerinize erişemez veya toplayamaz.

3. GARANTİ REDDİ (DISCLAIMER OF WARRANTY)
BU YAZILIM SİZE "OLDUĞU GİBİ" SUNULMAKTADIR. BUĞRA DEMİRÇELİK DİĞER TÜM GARANTİLERİ AÇIKÇA REDDEDER.

4. SORUMLULUĞUN SINIRLANDIRILMASI
YASALARIN İZİN VERDİĞİ AZAMİ ÖLÇÜDE, BUĞRA DEMİRÇELİK VERİ KAYBI VEYA YAZILIMIN KULLANILAMAMASINDAN KAYNAKLANAN ZARARLARDAN SORUMLU TUTULAMAZ.`;

const privacyText = `GİZLİLİK POLİTİKASI (PRIVACY POLICY)

Geliştirici olarak gizliliğinize en üst düzeyde saygı duyuyoruz. Çoğu modern uygulamanın aksine, "BD Notlar" hiçbir şekilde kişisel veri toplamaz, işlemez veya uzak sunuculara iletmez.

1. SIFIR VERİ POLİTİKASI
Uygulamayı nasıl kullandığınıza dair (telemetri) hiçbir istatistik toplanmaz. Notlarınız ve içerikleriniz tarafımızca ASLA görülmez.

2. VERİLERİN SAKLANMASI VE YEREL DEPOLAMA
Oluşturduğunuz tüm veriler yalnızca sizin cihazınızın yerel sabit diskinde saklanır. Hiçbir veri bulut ortamına (cloud) senkronize edilmez.

3. VERİ GÜVENLİĞİ VE YEDEKLEME
Verileriniz yalnızca kendi cihazınızda durduğu için, bu verilerin güvenliğinden ve yedeklenmesinden tamamen siz sorumlusunuz. Veri kaybını önlemek için düzenli aralıklarla dışa aktarma (Export) işlemi yapmanız tavsiye edilir.`;

const faqText = `SIKÇA SORULAN SORULAR (SSS)

S: BD Notlar nedir?
C: BD Notlar, tamamen çevrimdışı çalışan, hızlı ve güvenli bir masaüstü not alma uygulamasıdır.

S: İnternet bağlantısına ihtiyacım var mı?
C: Hayır. BD Notlar %100 çevrimdışı çalışacak şekilde tasarlanmıştır.

S: Notlarım nerede saklanıyor?
C: Tüm notlarınız bilgisayarınızda (işletim sisteminizin uygulama verileri alanında) yerel bir veritabanında saklanır. Dışarı aktarılmaz.

S: Bilgisayarıma format atarsam notlarım silinir mi?
C: Evet. Format atmadan önce uygulamanın ayarlarından JSON formatında dışa aktarım (Export) yaparak verilerinizi harici bir belleğe kaydetmelisiniz.

S: Hatırlatıcılar uygulama kapalıyken çalışır mı?
C: Evet! Windows'un yerleşik görev zamanlayıcısı ile entegre çalışır. Zamanı geldiğinde uygulama kapalı olsa da bildirim alırsınız.`;

export default function Sidebar() {
  const { 
    notes, categories, smartScope, setSmartScope, 
    selectedCategoryId, setSelectedCategoryId,
    createNote, addCategory, deleteCategory, emptyTrash, 
    updateNoteField, softDeleteNote, loadInitialData, theme, toggleTheme
  } = useNoteStore();

  const [newCatName, setNewCatName] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  
  // HAKKIMIZDA (ABOUT) PENCERESİNİN AÇIK/KAPALI DURUMU
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  
  // AKTİF METİN GÖRÜNÜMÜ DURUMU ('main', 'eula', 'privacy', 'faq')
  const [activeDocView, setActiveDocView] = useState<'main' | 'eula' | 'privacy' | 'faq'>('main');

  const activeNotes = notes.filter(n => !n.deleted_at && !n.archived_at);
  const todayStr = getLocalDateString(new Date());

  const counts = {
    all: activeNotes.length,
    today: activeNotes.filter(n => (n.start_at || n.due_at || n.created_at).substring(0, 10) === todayStr).length,
    overdue: activeNotes.filter(n => n.due_at && n.due_at.substring(0, 10) < todayStr && !n.is_completed && n.status_id !== 'done').length,
    uncompleted: activeNotes.filter(n => !n.is_completed && n.status_id !== 'done').length,
    completed: activeNotes.filter(n => n.is_completed || n.status_id === 'done').length,
    pinned: activeNotes.filter(n => n.is_pinned).length,
    favorites: activeNotes.filter(n => n.is_favorite).length,
    archive: notes.filter(n => n.archived_at && !n.deleted_at).length,
    trash: notes.filter(n => n.deleted_at).length
  };

  const handleExportCSV = async () => {
    try {
      const path = await save({ defaultPath: 'smart_notes.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
      if (path) {
        await invoke('export_csv', { filePath: path });
        alert('CSV başarıyla dışa aktarıldı!');
      }
    } catch (e) {
      alert('CSV aktarılamadı: ' + e);
    }
  };

  const handleExportJSON = async () => {
    try {
      const path = await save({ defaultPath: 'smart_notes_backup.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (path) {
        await invoke('export_json', { filePath: path });
        alert('JSON yedeği başarıyla oluşturuldu!');
      }
    } catch (e) {
      alert('JSON yedeklenemedi: ' + e);
    }
  };

  const handleExportExcel = async () => {
    try {
      const path = await save({ defaultPath: 'smart_notes.xlsx', filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
      if (path) {
        await invoke('export_excel', { filePath: path });
        alert('Excel (.xlsx) dosyası başarıyla dışa aktarıldı!');
      }
    } catch (e) {
      alert('Excel aktarılamadı: ' + e);
    }
  };

  const handleRestoreBackup = async () => {
    try {
      const selected = await open({ multiple: false, filters: [{ name: 'Yedek Dosyaları', extensions: ['json', 'csv'] }] });
      if (selected && typeof selected === 'string') {
        if (selected.endsWith('.json')) {
          await invoke('import_json_backup', { filePath: selected });
        } else if (selected.endsWith('.csv')) {
          await invoke('import_csv_backup', { filePath: selected });
        }
        await loadInitialData();
        alert('Yedek başarıyla geri yüklendi!');
      }
    } catch (e) {
      alert('Geri yükleme başarısız: ' + e);
    }
  };

  const handleDropOnSmartList = (scopeId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    const noteId = window.__DRAGGED_NOTE_ID__ || e.dataTransfer.getData('text/plain');
    if (!noteId) return;

    if (scopeId === 'favorites') {
      updateNoteField(noteId, 'is_favorite', 'true');
    } else if (scopeId === 'completed') {
      updateNoteField(noteId, 'status_id', 'done');
    } else if (scopeId === 'archive') {
      updateNoteField(noteId, 'archived_at', new Date().toISOString());
    } else if (scopeId === 'all' || scopeId === 'today' || scopeId === 'uncompleted') {
      updateNoteField(noteId, 'archived_at', null);
    } else if (scopeId === 'trash') {
      softDeleteNote(noteId);
    }
    window.__DRAGGED_NOTE_ID__ = null;
  };

  const handleDropOnCategory = (categoryId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    const noteId = window.__DRAGGED_NOTE_ID__ || e.dataTransfer.getData('text/plain');
    if (noteId) {
      updateNoteField(noteId, 'category_id', categoryId);
      updateNoteField(noteId, 'archived_at', null);
    }
    window.__DRAGGED_NOTE_ID__ = null;
  };

  const isLight = theme === 'light';

  return (
    <>
      <aside className={`w-64 border-r flex flex-col h-full select-none transition-colors ${
        isLight ? 'bg-zinc-100 border-zinc-300 text-zinc-800' : 'bg-zinc-950 border-zinc-800 text-zinc-300'
      }`}>
        <div className={`p-4 border-b ${isLight ? 'border-zinc-300' : 'border-zinc-800'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-11 h-11 rounded-lg bg-blue-600 flex items-center justify-center font-black text-white text-lg shadow-md shadow-blue-500/20">BD</div>
              <span className={`font-bold tracking-wide text-sm ${isLight ? 'text-zinc-900' : 'text-white'}`}>BD Notlar</span>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={toggleTheme} 
                className={`p-1.5 rounded transition-colors ${isLight ? 'text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                title={isLight ? 'Koyu Temaya Geç' : 'Açık Temaya Geç'}
              >
                {isLight ? <Moon size={16} /> : <Sun size={16} className="text-amber-400" />}
              </button>
              <button 
                onClick={() => { setIsAboutOpen(true); setActiveDocView('main'); }} 
                className={`p-1.5 rounded transition-colors ${isLight ? 'text-zinc-600 hover:bg-zinc-200' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`} 
                title="Hakkımızda"
              >
                <Info size={16} />
              </button>
            </div>
          </div>

          <button
            onClick={() => createNote(selectedCategoryId)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-3 rounded-lg shadow-sm transition-all text-xs"
          >
            <Plus size={16} /> Yeni Not Ekle
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-5 text-xs">
          <div className="space-y-0.5">
            <div className="px-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Akıllı Listeler</div>
            {[
              { id: 'all', label: 'Tüm Notlar', icon: FileText, count: counts.all, color: 'text-blue-500' },
              { id: 'today', label: 'Bugün', icon: Calendar, count: counts.today, color: 'text-amber-500' },
              { id: 'overdue', label: 'Gecikenler', icon: AlertCircle, count: counts.overdue, color: 'text-red-500' },
              { id: 'uncompleted', label: 'Tamamlanmamış', icon: Clock, count: counts.uncompleted, color: 'text-indigo-500' },
              { id: 'completed', label: 'Tamamlananlar', icon: CheckCircle2, count: counts.completed, color: 'text-emerald-500' },
              { id: 'pinned', label: 'Sabitlenenler', icon: Pin, count: counts.pinned, color: 'text-blue-500' },
              { id: 'favorites', label: 'Favoriler', icon: Star, count: counts.favorites, color: 'text-yellow-500' },
              { id: 'archive', label: 'Arşiv', icon: Archive, count: counts.archive, color: 'text-purple-500' },
              { id: 'trash', label: 'Çöp Kutusu', icon: Trash2, count: counts.trash, color: 'text-zinc-500' },
            ].map((item) => {
              const isDropActive = dragOverTarget === `smart_${item.id}`;
              const isSelected = smartScope === item.id && !selectedCategoryId;
              return (
                <div
                  key={item.id}
                  onClick={() => setSmartScope(item.id as SmartViewScope)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverTarget !== `smart_${item.id}`) setDragOverTarget(`smart_${item.id}`);
                  }}
                  onDragLeave={() => {
                    setDragOverTarget(null);
                  }}
                  onDrop={(e) => handleDropOnSmartList(item.id, e)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-all ${
                    isDropActive
                      ? 'bg-purple-950/60 border border-purple-500 text-white scale-[1.03] shadow-md'
                      : isSelected
                      ? isLight ? 'bg-zinc-200 text-zinc-900 font-semibold' : 'bg-zinc-800 text-white font-medium'
                      : isLight ? 'hover:bg-zinc-200/70 text-zinc-600 hover:text-zinc-900' : 'hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate pointer-events-none">
                    <item.icon size={14} className={item.color} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded shrink-0 pointer-events-none ${isLight ? 'bg-zinc-200 text-zinc-600' : 'bg-zinc-900 text-zinc-500'}`}>{item.count}</span>
                </div>
              );
            })}
          </div>

          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Kategoriler</span>
              <button 
                onClick={() => setShowCatInput(!showCatInput)} 
                className={`p-0.5 rounded ${isLight ? 'text-zinc-600 hover:bg-zinc-200' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                title="Yeni Kategori Ekle"
              >
                <Plus size={13} />
              </button>
            </div>

            {showCatInput && (
              <form 
                onSubmit={async (e) => { 
                  e.preventDefault(); 
                  if (newCatName.trim()) { 
                    await addCategory(newCatName.trim()); 
                    setNewCatName(''); 
                    setShowCatInput(false); 
                  } 
                }} 
                className="mb-2 px-1 flex gap-1"
              >
                <input
                  type="text"
                  autoFocus
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Kategori adı..."
                  className={`w-full border rounded px-2 py-1 text-xs outline-none ${isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-700 text-white'}`}
                />
                <button type="submit" className="bg-blue-600 px-2 rounded text-white text-[10px] font-bold">Ekle</button>
              </form>
            )}

            <div className="space-y-0.5">
              {categories.map((c) => {
                const count = activeNotes.filter(n => n.category_id === c.id).length;
                const isSelected = selectedCategoryId === c.id;
                const isDropActive = dragOverTarget === `cat_${c.id}`;

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCategoryId(c.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverTarget !== `cat_${c.id}`) setDragOverTarget(`cat_${c.id}`);
                    }}
                    onDragLeave={() => {
                      setDragOverTarget(null);
                    }}
                    onDrop={(e) => handleDropOnCategory(c.id, e)}
                    className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-all ${
                      isDropActive
                        ? 'bg-blue-600/40 border border-blue-400 text-white scale-[1.03]'
                        : isSelected
                        ? isLight ? 'bg-zinc-200 text-zinc-900 font-semibold' : 'bg-zinc-800 text-white font-medium'
                        : isLight ? 'text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                    }`}
                    title="Notu bu kategoriye atamak için üzerine bırakın"
                  >
                    <div className="flex items-center gap-2 truncate pointer-events-none">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color || '#3b82f6' }} />
                      <span className="truncate">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-zinc-500 group-hover:hidden pointer-events-none">{count}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteCategory(c.id); }}
                        className="hidden group-hover:block text-zinc-500 hover:text-red-400 p-0.5"
                        title="Kategoriyi Sil"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={`p-3 border-t flex flex-col gap-2 ${isLight ? 'border-zinc-300' : 'border-zinc-800'}`}>
          <button onClick={handleExportExcel} className="w-full flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white py-1.5 rounded text-[11px] font-bold shadow-sm">
            <FileSpreadsheet size={13} /> Excel'e Aktar (.xlsx)
          </button>
          <div className="flex gap-1.5">
            <button onClick={handleExportJSON} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] border ${isLight ? 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-200' : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'}`}>
              <Download size={13} className="text-blue-500" /> JSON Yedek
            </button>
            <button onClick={handleExportCSV} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] border ${isLight ? 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-200' : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'}`}>
              <FileSpreadsheet size={13} className="text-amber-500" /> CSV Yedek
            </button>
          </div>
          <button onClick={handleRestoreBackup} className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] border font-medium ${isLight ? 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-200' : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'}`}>
            <Upload size={13} className="text-indigo-500" /> Yedeği Geri Yükle
          </button>

          {smartScope === 'trash' && counts.trash > 0 && (
            <button
              onClick={emptyTrash}
              className="w-full flex items-center justify-center gap-1.5 bg-red-950/60 hover:bg-red-900 text-red-300 py-1.5 rounded text-[11px] font-semibold border border-red-800/40"
            >
              <Trash2 size={13} /> Çöpü Tamamen Boşalt
            </button>
          )}
        </div>
      </aside>

      {/* MODAL EKRANI */}
      {isAboutOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full border rounded-lg shadow-2xl flex flex-col relative overflow-hidden font-sans transition-all duration-300 ${
            activeDocView === 'main' ? 'max-w-[360px]' : 'max-w-[650px]'
          } ${isLight ? 'bg-zinc-50 border-zinc-300' : 'bg-[#1e1e1e] border-zinc-700'}`}>
            
            {/* Üst Bar */}
            <div className={`flex justify-between items-center p-3 border-b ${isLight ? 'border-zinc-300' : 'border-zinc-800'}`}>
              {activeDocView !== 'main' ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => setActiveDocView('main')} className={`transition-colors ${isLight ? 'text-zinc-500 hover:text-zinc-900' : 'text-zinc-400 hover:text-white'}`}>
                    <ArrowLeft size={16} />
                  </button>
                  <span className={`text-xs font-semibold ${isLight ? 'text-zinc-800' : 'text-zinc-300'}`}>
                    {activeDocView === 'eula' ? 'SKLA (EULA)' : activeDocView === 'privacy' ? 'Gizlilik Politikası' : 'SSS'}
                  </span>
                </div>
              ) : (
                <span className={`text-xs font-semibold ${isLight ? 'text-zinc-800' : 'text-zinc-300'}`}>BD Notlar Hakkında</span>
              )}
              
              <button onClick={() => { setIsAboutOpen(false); setActiveDocView('main'); }} className={`transition-colors ${isLight ? 'text-zinc-500 hover:text-zinc-900' : 'text-zinc-400 hover:text-white'}`}>
                <X size={16} />
              </button>
            </div>

            {/* DİNAMİK İÇERİK BÖLÜMÜ (Scrollbar'lar gizlendi) */}
            <div 
              className={`p-6 flex flex-col ${
                activeDocView === 'main' ? 'h-auto overflow-hidden' : 'h-[500px] max-h-[70vh] overflow-y-auto'
              }`}
              style={{
                /* Kaydırma çubuğunu gizlemek için */
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              {/* Chrome/Safari kaydırma çubuğu gizleme kuralı */}
              <style>{`
                div::-webkit-scrollbar { display: none; }
              `}</style>
              
              {activeDocView === 'main' && (
                <div className="flex flex-col items-center w-full">
                  {/* BD Logosu */}
                  <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white text-4xl font-black shadow-[0_0_20px_rgba(37,99,235,0.4)] border border-blue-400 mb-5 mt-2">
                    BD
                  </div>

                  {/* İsim ve Sürüm */}
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className={`text-2xl font-bold tracking-wide ${isLight ? 'text-zinc-900' : 'text-white'}`}>BD Notlar</h2>
                    <span className="bg-[#d4af37] text-black text-[9px] font-bold px-1.5 py-0.5 rounded-sm">PRO</span>
                  </div>
                  <p className="text-zinc-500 text-xs mb-6">v1.0.0</p>

                  {/* Geliştirici ve İletişim */}
                  <h3 className="text-amber-500 text-sm font-semibold mb-3">Geliştirici & İletişim :</h3>
                  <div className={`text-xs text-center space-y-1.5 mb-2 ${isLight ? 'text-zinc-700' : 'text-zinc-400'}`}>
                    <p>Baş Geliştirici: Buğra Demirçelik</p>
                    <p>Arayüz Tasarımı: BD Studio</p>
                    <p className="pt-2">
                      İletişim:{' '}
                      <a href="mailto:bugrademircelik@gmail.com" className={`font-medium transition-colors hover:underline ${isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300'}`}>
                        bugrademircelik@gmail.com
                      </a>
                    </p>
                  </div>

                  {/* Alt Bilgiler ve Butonlar */}
                  <div className={`text-center w-full mt-6 pt-4 border-t ${isLight ? 'border-zinc-300' : 'border-zinc-800/50'}`}>
                    <p className="text-zinc-500 text-[11px] mb-3">
                      © Buğra Demirçelik. Tüm hakları saklıdır.
                    </p>
                    <div className={`flex justify-center items-center gap-2 text-[11px] ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      <button onClick={() => setActiveDocView('eula')} className={`hover:underline transition-colors ${isLight ? 'hover:text-blue-600' : 'hover:text-blue-400'}`}>SKLA (EULA)</button>
                      <span className={`${isLight ? 'text-zinc-400' : 'text-zinc-700'}`}>|</span>
                      <button onClick={() => setActiveDocView('privacy')} className={`hover:underline transition-colors ${isLight ? 'hover:text-blue-600' : 'hover:text-blue-400'}`}>Gizlilik Politikası</button>
                      <span className={`${isLight ? 'text-zinc-400' : 'text-zinc-700'}`}>|</span>
                      <button onClick={() => setActiveDocView('faq')} className={`hover:underline transition-colors ${isLight ? 'hover:text-blue-600' : 'hover:text-blue-400'}`}>SSS</button>
                    </div>
                  </div>
                </div>
              )}

              {/* EULA (SKLA) İÇERİĞİ */}
              {activeDocView === 'eula' && (
                <div className={`text-xs whitespace-pre-wrap leading-relaxed pb-4 ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                  {eulaText}
                </div>
              )}

              {/* GİZLİLİK POLİTİKASI İÇERİĞİ */}
              {activeDocView === 'privacy' && (
                <div className={`text-xs whitespace-pre-wrap leading-relaxed pb-4 ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                  {privacyText}
                </div>
              )}

              {/* SSS İÇERİĞİ */}
              {activeDocView === 'faq' && (
                <div className={`text-xs whitespace-pre-wrap leading-relaxed pb-4 ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                  {faqText}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}