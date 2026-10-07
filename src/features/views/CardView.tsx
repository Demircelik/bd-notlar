import React from 'react';
import { useNoteStore, useCentralFilteredNotes } from '../../store/noteStore';
import { Pin } from 'lucide-react';

export default function CardView() {
  const { openEditor, categories, theme, updateNoteField, reorderNotes } = useNoteStore();
  const activeNoteId = null;
  const filteredNotes = useCentralFilteredNotes();
  const isLight = theme === 'light';

  return (
    <div className={`h-full overflow-y-auto p-3 grid grid-cols-2 gap-2.5 auto-rows-max select-none ${isLight ? 'bg-zinc-50' : 'bg-zinc-950'}`}>
      {filteredNotes.map((n) => {
        const isActive = activeNoteId === n.id;
        const cat = categories.find(c => c.id === n.category_id);
        const displayDate = n.start_at || n.created_at;

        return (
          <div
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
            className={`p-3 rounded-xl cursor-pointer border flex flex-col justify-between transition-all group h-fit ${
              isActive 
                ? 'border-blue-500 ring-1 ring-blue-500' 
                : isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-zinc-800'
            }`}
            style={{ borderLeft: n.color ? `4px solid ${n.color}` : undefined }}
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className={`font-bold text-xs truncate ${isLight ? 'text-zinc-900' : 'text-white'}`}>{n.title || 'İsimsiz Not'}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateNoteField(n.id, 'is_pinned', n.is_pinned ? 'false' : 'true');
                  }}
                  title={n.is_pinned ? 'Sabiti Kaldır' : 'Başa Sabitle'}
                  className="text-zinc-500 hover:text-blue-400 transition-colors"
                >
                  <Pin size={12} className={n.is_pinned ? 'text-blue-500' : 'text-zinc-500'} fill={n.is_pinned ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className={`text-[11px] line-clamp-3 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                {n.body_text || 'İçerik yok.'}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 mt-2 border-t border-zinc-800/40 text-[10px]">
              {cat && <span className="text-blue-400">{cat.name}</span>}
              <span className="text-zinc-500">{displayDate ? new Date(typeof displayDate === 'string' ? displayDate.replace(' ', 'T') : displayDate).toLocaleDateString('tr-TR') : ''}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}