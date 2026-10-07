import React from 'react';
import { useNoteStore, useCentralFilteredNotes } from '../../store/noteStore';
import { Pin, Star, Bell, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';

function getCleanSnippet(bodyText?: string, bodyJson?: string): string {
  if (bodyText && !bodyText.trim().startsWith('{') && !bodyText.trim().startsWith('<')) {
    return bodyText.trim();
  }
  if (bodyJson && bodyJson.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(bodyJson);
      const extract = (node: any): string => {
        if (!node) return '';
        if (node.text) return node.text;
        if (node.content && Array.isArray(node.content)) {
          return node.content.map(extract).join(' ');
        }
        return '';
      };
      const text = extract(parsed).trim();
      if (text) return text;
    } catch (e) { console.error(e); }
  }
  if (bodyText) {
    return bodyText.replace(/<[^>]*>/g, '').trim();
  }
  return 'İçerik yok.';
}

export default function ListView() {
  const {
    openEditor, 
    selectedNoteIds,
    theme,
    categories,
    toggleSelectNote,
    reorderNotes,
    moveNoteStep,
    updateNoteField
  } = useNoteStore();

  const activeNoteId = null; 
  const filteredNotes = useCentralFilteredNotes();
  const isLight = theme === 'light';

  const getCategoryName = (id: string | null) => {
    if (!id) return null;
    return categories.find(c => c.id === id)?.name || null;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_progress':
        return <span className="bg-blue-950/80 text-blue-300 border border-blue-800 text-[10px] px-2 py-0.5 rounded font-medium">Devam</span>;
      case 'done':
        return <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-800 text-[10px] px-2 py-0.5 rounded font-medium">Bitti</span>;
      case 'cancelled':
        return <span className="bg-zinc-800 text-zinc-300 text-[10px] px-2 py-0.5 rounded font-medium">İptal</span>;
      default:
        return <span className="bg-amber-950/80 text-amber-300 border border-amber-800 text-[10px] px-2 py-0.5 rounded font-medium">Bekliyor</span>;
    }
  };

  return (
    <div 
      className={`h-full overflow-y-auto p-4 space-y-2.5 select-none transition-colors ${
        isLight ? 'bg-zinc-50' : 'bg-zinc-950'
      }`}
      style={{
        scrollbarWidth: 'none', // Firefox için kaydırma çubuğunu gizle
        msOverflowStyle: 'none', // IE ve Edge için kaydırma çubuğunu gizle
      }}
    >
      <style>{`
        /* Chrome, Safari ve Opera için kaydırma çubuğunu gizle */
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {filteredNotes.length === 0 ? (
        <div className="text-center py-20 text-zinc-500 text-xs italic">
          Gösterilecek not bulunamadı.
        </div>
      ) : (
        filteredNotes.map((n) => {
          const isActive = activeNoteId === n.id;
          const isSelected = selectedNoteIds.has(n.id);
          const catName = getCategoryName(n.category_id);
          const dateStr = new Date(n.start_at || n.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const snippet = getCleanSnippet(n.body_text, n.body_json);

          return (
            <div
              key={n.id}
              onClick={() => openEditor(n.id)}
              onMouseDown={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey) {
                  toggleSelectNote(n.id, true);
                }
              }}
              draggable
              onDragStart={(e) => {
                window.__DRAGGED_NOTE_ID__ = n.id;
                e.dataTransfer.setData('text/plain', n.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const sourceId = window.__DRAGGED_NOTE_ID__ || e.dataTransfer.getData('text/plain');
                if (sourceId && sourceId !== n.id) {
                  reorderNotes(sourceId, n.id);
                }
                window.__DRAGGED_NOTE_ID__ = null;
              }}
              className={`group relative p-3.5 rounded-xl cursor-pointer transition-all border shadow-sm ${
                isActive 
                  ? isLight ? 'bg-zinc-200 border-blue-500 shadow-md ring-1 ring-blue-400' : 'bg-zinc-800/90 border-blue-500 shadow-md ring-1 ring-blue-500/50'
                  : isSelected 
                  ? 'bg-blue-950/30 border-blue-600'
                  : isLight 
                  ? 'bg-white border-zinc-200 hover:border-zinc-300' 
                  : 'bg-zinc-900/80 border-zinc-800/80 hover:border-zinc-700'
              }`}
              style={{
                borderLeft: n.color ? `5px solid ${n.color}` : undefined
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 truncate">
                  <span title="Sürükleyip Taşı"><GripVertical size={13} className="text-zinc-600 group-hover:text-zinc-400 shrink-0 cursor-grab active:cursor-grabbing" /></span>

                  {/* Pin Butonu */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateNoteField(n.id, 'is_pinned', !n.is_pinned);
                    }}
                    title={n.is_pinned ? 'Sabiti Kaldır' : 'Başa Sabitle'}
                    className="text-zinc-500 hover:text-blue-400 transition-colors shrink-0"
                  >
                    <Pin size={13} className={n.is_pinned ? 'text-blue-500' : 'text-zinc-600'} fill={n.is_pinned ? 'currentColor' : 'none'} />
                  </button>

                  {n.is_favorite && <Star size={12} className="text-yellow-500 shrink-0" fill="currentColor" />}
                  
                  <span className={`font-bold text-xs truncate ${n.is_completed || n.status_id === 'done' ? 'line-through text-zinc-400' : isLight ? 'text-zinc-900' : 'text-zinc-100'}`}>
                    {n.title || 'İsimsiz Not'}
                  </span>
                </div>
                <span className={`text-[10px] shrink-0 ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>{dateStr}</span>
              </div>

              <div className={`text-[11px] line-clamp-2 mb-2 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                {snippet}
              </div>

              <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800/40 mt-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {getStatusBadge(n.status_id)}
                  {catName && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1 ${
                      isLight ? 'bg-zinc-200 text-zinc-700' : 'bg-zinc-800 text-zinc-300'
                    }`}>
                      📁 {catName}
                    </span>
                  )}
                  {n.reminder_at && (
                    <span className="text-amber-500 text-[10px] flex items-center gap-0.5 font-medium">
                      <Bell size={10} /> 
                      {new Date(n.reminder_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                {!n.is_pinned && (
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveNoteStep(n.id, 'up'); }}
                      className={`p-1 rounded ${isLight ? 'hover:bg-zinc-300 text-zinc-600' : 'hover:bg-zinc-800 text-zinc-400'}`}
                      title="Yukarı Taşı"
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveNoteStep(n.id, 'down'); }}
                      className={`p-1 rounded ${isLight ? 'hover:bg-zinc-300 text-zinc-600' : 'hover:bg-zinc-800 text-zinc-400'}`}
                      title="Aşağı Taşı"
                    >
                      <ChevronDown size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}