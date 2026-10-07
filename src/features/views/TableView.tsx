import React from 'react';
import { useNoteStore, useCentralFilteredNotes } from '../../store/noteStore';
import { Pin, Star, Bell, AlertCircle } from 'lucide-react';

export default function TableView() {
  const { categories, openEditor, updateNoteField, reorderNotes, theme } = useNoteStore();
  const activeNoteId = null;
  const filteredNotes = useCentralFilteredNotes();
  const isLight = theme === 'light';

  const getCategoryName = (id: string | null) => {
    if (!id) return '-';
    return categories.find((c) => c.id === id)?.name || '-';
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'in_progress': return '🔵 Devam';
      case 'done': return '🟢 Tamamlandı';
      case 'cancelled': return '⚪ İptal';
      default: return '🟡 Bekliyor';
    }
  };

  return (
    <div className={`h-full overflow-auto select-none ${isLight ? 'bg-zinc-50 text-zinc-800' : 'bg-zinc-950 text-zinc-200'}`}>
      <table className="w-full text-left text-xs border-collapse">
        <thead className={`sticky top-0 border-b z-10 shadow-sm ${isLight ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
          <tr>
            <th className="p-2.5 font-bold">Başlık</th>
            <th className="p-2.5 font-bold">Durum</th>
            <th className="p-2.5 font-bold">Kategori</th>
            <th className="p-2.5 font-bold">Başlangıç Tarihi</th>
            <th className="p-2.5 font-bold">Hatırlatıcı</th>
          </tr>
        </thead>
        <tbody className={`divide-y ${isLight ? 'divide-zinc-200' : 'divide-zinc-800/60'}`}>
          {filteredNotes.length === 0 ? (
            <tr>
              <td colSpan={5} className={`p-8 text-center ${isLight ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Not bulunamadı.
              </td>
            </tr>
          ) : (
            filteredNotes.map((n) => {
              const isActive = activeNoteId === n.id;
              const displayDate = n.start_at || n.created_at;
              return (
                <tr
                  key={n.id}
                  onClick={() => openEditor(n.id)}
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
                  className={`cursor-pointer transition-colors ${
                    isActive 
                      ? isLight ? 'bg-zinc-200 font-medium' : 'bg-zinc-800/90 font-medium' 
                      : isLight ? 'hover:bg-zinc-100' : 'hover:bg-zinc-900/60'
                  }`}
                  style={{
                    borderLeft: n.color ? `4px solid ${n.color}` : undefined
                  }}
                >
                  <td className="p-2.5 flex items-center gap-2 truncate max-w-[200px]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateNoteField(n.id, 'is_pinned', n.is_pinned ? 'false' : 'true');
                      }}
                      title={n.is_pinned ? 'Sabiti Kaldır' : 'Başa Sabitle'}
                      className="text-zinc-500 hover:text-blue-400 transition-colors shrink-0"
                    >
                      <Pin size={12} className={n.is_pinned ? 'text-blue-500' : 'text-zinc-600'} fill={n.is_pinned ? 'currentColor' : 'none'} />
                    </button>
                    {n.is_favorite && <Star size={12} className="text-yellow-500 shrink-0" fill="currentColor" />}
                    {n.priority === 4 && <AlertCircle size={12} className="text-red-500 shrink-0" />}
                    <span className={`truncate ${n.is_completed || n.status_id === 'done' ? 'line-through text-zinc-400' : isLight ? 'text-zinc-900' : 'text-zinc-100'}`}>
                      {n.title || 'İsimsiz Not'}
                    </span>
                  </td>
                  <td className={`p-2.5 ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>{getStatusText(n.status_id)}</td>
                  <td className={`p-2.5 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>{getCategoryName(n.category_id)}</td>
                  <td className={`p-2.5 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    {displayDate ? new Date(typeof displayDate === 'string' ? displayDate.replace(' ', 'T') : displayDate).toLocaleDateString('tr-TR') : '-'}
                  </td>
                  <td className="p-2.5">
                    {n.reminder_at ? (
                      <span className="text-amber-500 flex items-center gap-1 font-medium">
                        <Bell size={11} /> {new Date(n.reminder_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ) : (
                      <span className={isLight ? 'text-zinc-400' : 'text-zinc-600'}>-</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}