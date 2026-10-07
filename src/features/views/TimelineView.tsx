import React from 'react';
import { useNoteStore, useCentralFilteredNotes } from '../../store/noteStore';
import { Pin } from 'lucide-react';

export default function TimelineView() {
  const { openEditor, categories, theme, updateNoteField, reorderNotes } = useNoteStore();
  const activeNoteId = null;
  const filteredNotes = useCentralFilteredNotes();
  const isLight = theme === 'light';

  return (
    <div className={`h-full overflow-y-auto select-none ${isLight ? 'bg-zinc-50' : 'bg-zinc-950'}`}>
      <table className="w-full text-left text-xs border-collapse">
        <thead className={`sticky top-0 border-b ${isLight ? 'bg-zinc-100 border-zinc-300 text-zinc-700' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
          <tr>
            <th className="p-2.5 font-semibold">Başlık</th>
            <th className="p-2.5 font-semibold">Durum</th>
            <th className="p-2.5 font-semibold">Kategori</th>
            <th className="p-2.5 font-semibold">Başlangıç Tarihi</th>
          </tr>
        </thead>
        <tbody className={`divide-y ${isLight ? 'divide-zinc-200 text-zinc-800' : 'divide-zinc-800/60 text-zinc-300'}`}>
          {filteredNotes.length === 0 ? (
            <tr>
              <td colSpan={4} className="p-8 text-center text-zinc-500">
                Not bulunamadı.
              </td>
            </tr>
          ) : (
            filteredNotes.map((n) => {
              const isActive = activeNoteId === n.id;
              const cat = categories.find(c => c.id === n.category_id);
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
                    isActive ? (isLight ? 'bg-blue-100/60' : 'bg-blue-950/40') : (isLight ? 'hover:bg-zinc-100' : 'hover:bg-zinc-900/50')
                  }`}
                >
                  <td className="p-2.5 font-bold truncate max-w-[120px] flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateNoteField(n.id, 'is_pinned', n.is_pinned ? 'false' : 'true');
                      }}
                      title={n.is_pinned ? 'Sabiti Kaldır' : 'Başa Sabitle'}
                      className="text-zinc-500 hover:text-blue-400 transition-colors shrink-0"
                    >
                      <Pin size={11} className={n.is_pinned ? 'text-blue-400' : 'text-zinc-600'} fill={n.is_pinned ? 'currentColor' : 'none'} />
                    </button>
                    <span className="truncate">{n.title || 'İsimsiz Not'}</span>
                  </td>
                  <td className="p-2.5">{n.status_id || '-'}</td>
                  <td className="p-2.5">{cat?.name || '-'}</td>
                  <td className="p-2.5 text-[10px] text-zinc-500">
                    {displayDate ? new Date(typeof displayDate === 'string' ? displayDate.replace(' ', 'T') : displayDate).toLocaleDateString('tr-TR') : '-'}
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