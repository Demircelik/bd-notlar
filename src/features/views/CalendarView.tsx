import React from 'react';
import { useNoteStore } from '../../store/noteStore';

export default function CalendarView() {
  const notes = useNoteStore((s) => s.notes);
  const openEditor = useNoteStore((s) => s.openEditor);
  const theme = useNoteStore((s) => s.theme);
  const isLight = theme === 'light';

  const notesWithDates = notes.filter((n) => n.due_at);

  return (
    <div className={`h-full overflow-y-auto p-6 ${isLight ? 'bg-zinc-50' : 'bg-zinc-950'}`}>
      <h3 className={`text-sm font-bold mb-4 uppercase tracking-wider ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>Takvim — Planlanan Notlar</h3>
      <div className="grid grid-cols-3 gap-4">
        {notesWithDates.map((n) => (
          <div
            key={n.id}
            onClick={() => openEditor(n.id)}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              isLight 
                ? 'bg-white border-zinc-200 hover:border-blue-500 shadow-sm' 
                : 'bg-zinc-900 border-zinc-800 hover:border-blue-500'
            }`}
          >
            <div className={`text-xs font-bold mb-1 ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>{n.due_at?.substring(0, 10)}</div>
            <div className={`font-semibold text-sm ${isLight ? 'text-zinc-900' : 'text-zinc-200'}`}>{n.title || 'Başlıksız Not'}</div>
          </div>
        ))}
        {notesWithDates.length === 0 && (
          <div className={`col-span-3 text-center py-12 text-sm ${isLight ? 'text-zinc-500' : 'text-zinc-600'}`}>
            Tarih atanmış herhangi bir not bulunmuyor. Not düzenleyicisinden bitiş tarihi ekleyebilirsiniz.
          </div>
        )}
      </div>
    </div>
  );
}