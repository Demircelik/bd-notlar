import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { 
  Bold, Italic, Strikethrough, Heading1, Heading2, 
  List, ListOrdered, Quote, Code, Pin, Star, Trash2, 
  RotateCcw, RotateCw, Paperclip, CheckSquare, Plus, X, File, Bell,
  ArrowDownAZ, ArrowUpZA, ChevronDown, SlidersHorizontal, Archive, Download
} from 'lucide-react';
import { useNoteStore, toLocalDatetimeInput, fromLocalDatetimeInput } from '../../store/noteStore';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const getNodeText = (node: any): string => {
  if (!node) return '';
  if (node.text) return node.text;
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(getNodeText).join(' ');
  }
  return '';
};

function normalizeContent(bodyJson: string | null | undefined, bodyText: string | null | undefined): any {
  if (bodyJson && bodyJson.trim() !== '' && bodyJson !== '{}') {
    try {
      if (bodyJson.startsWith('{')) {
        const parsed = JSON.parse(bodyJson);
        if (parsed && parsed.type === 'doc' && Array.isArray(parsed.content)) {
          const newContent: any[] = [];
          for (const block of parsed.content) {
            if (block.type === 'paragraph' && block.content && block.content.length > 0) {
              const fullText = block.content.map((c: any) => c.text || '').join('');
              if (fullText.includes('\n')) {
                const lines = fullText.split('\n');
                for (const l of lines) {
                  if (l.trim()) {
                    newContent.push({
                      type: 'paragraph',
                      content: [{ type: 'text', text: l }]
                    });
                  }
                }
                continue;
              }
            }
            newContent.push(block);
          }
          parsed.content = newContent.length > 0 ? newContent : [{ type: 'paragraph' }];
          return parsed;
        }
      }
    } catch (e) { console.error(e); }
  }

  const textToSplit = bodyText || bodyJson || '';
  const lines = textToSplit.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return '<p></p>';
  return lines.map(l => `<p>${escapeHtml(l)}</p>`).join('');
}

export default function NoteEditor({ noteId }: { noteId: string }) {
  const { 
    notes, saveNoteContent, updateNoteField, 
    softDeleteNote, restoreNote, permanentDeleteNote, 
    categories, theme 
  } = useNoteStore();
  
  const note = notes.find((n) => n.id === noteId);

  const [isMetaOpen, setIsMetaOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subtasks, setSubtasks] = useState<any[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  
  const [isClosing, setIsClosing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLight = theme === 'light';

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: { depth: 100, newGroupDelay: 500 },
      }),
    ],
    editorProps: {
      attributes: {
        class: `outline-none border-none focus:outline-none focus:ring-0 text-sm leading-relaxed max-w-none min-h-[180px] tiptap-content ${isLight ? 'text-zinc-900' : 'text-zinc-200'}`,
      },
    },
    content: '',
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (!note) return;
      saveNoteContent(note.id, title, JSON.stringify(editor.getJSON()), editor.getText());
    }
  });

  const isInitializedRef = useRef(false);

  const loadNoteData = useCallback(() => {
    if (!editor || !note) return;
    if (isInitializedRef.current) return;
    
    isInitializedRef.current = true;
    setTitle(note.title || '');

    const content = normalizeContent(note.body_json, note.body_text);
    editor.commands.setContent(content);

    invoke('get_subtasks', { noteId: note.id }).then((res: any) => setSubtasks(res || [])).catch(() => {});
    invoke('get_attachments', { noteId: note.id }).then((res: any) => setAttachments(res || [])).catch(() => {});
  }, [editor, note]);

  useEffect(() => {
    if (note && editor) {
      loadNoteData();
    }
  }, [note, editor, loadNoteData]);

  if (isClosing) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center select-none ${isLight ? 'bg-zinc-50 text-zinc-500' : 'bg-zinc-900 text-zinc-400'}`}>
        <Trash2 size={28} className="mb-3 opacity-50 animate-pulse" />
        <span className="text-sm font-medium">Pencere kapatılıyor...</span>
      </div>
    );
  }

  if (!note || !editor) {
    return (
      <div className={`flex-1 flex items-center justify-center select-none text-sm ${isLight ? 'bg-zinc-50 text-zinc-500' : 'bg-zinc-900 text-zinc-600'}`}>
        Not bulunamadı. Veya silinmiş bir not açık kaldı.
      </div>
    );
  }

  const isTrash = !!note.deleted_at;
  const isArchived = !!note.archived_at;
  const isReminderActive = Boolean(note.reminder_at);
  const doneSubtasks = subtasks.filter(t => t.is_done).length;

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    saveNoteContent(note.id, val, JSON.stringify(editor.getJSON()), editor.getText());
  };

  const handleToggleBlockquote = () => {
    if (!editor) return;
    editor.chain().focus().toggleBlockquote().run();
    saveNoteContent(note.id, title, JSON.stringify(editor.getJSON()), editor.getText());
  };

  const handleToggleBulletList = () => {
    if (!editor) return;
    editor.chain().focus().toggleBulletList().run();
    saveNoteContent(note.id, title, JSON.stringify(editor.getJSON()), editor.getText());
  };

  const handleToggleOrderedList = () => {
    if (!editor) return;
    editor.chain().focus().toggleOrderedList().run();
    saveNoteContent(note.id, title, JSON.stringify(editor.getJSON()), editor.getText());
  };

  const handleToggleHeading = (level: 1 | 2) => {
    if (!editor) return;
    editor.chain().focus().toggleHeading({ level }).run();
    saveNoteContent(note.id, title, JSON.stringify(editor.getJSON()), editor.getText());
  };

  const handleSortContent = (order: 'asc' | 'desc') => {
    if (!editor) return;

    const json = editor.getJSON();
    if (!json || !json.content || json.content.length === 0) return;

    const cmp = (a: any, b: any) => {
      const textA = getNodeText(a).trim();
      const textB = getNodeText(b).trim();
      const res = textA.localeCompare(textB, 'tr-TR', { sensitivity: 'base', numeric: true });
      return order === 'asc' ? res : -res;
    };

    if (json.content.length === 1 && (json.content[0].type === 'bulletList' || json.content[0].type === 'orderedList')) {
      const listNode = json.content[0];
      const items = [...(listNode.content || [])];
      items.sort(cmp);
      listNode.content = items;
      editor.commands.setContent(json);
    } else {
      const blocks = [...json.content];
      blocks.sort(cmp);
      json.content = blocks;
      editor.commands.setContent(json);
    }
    saveNoteContent(note.id, title, JSON.stringify(editor.getJSON()), editor.getText());
  };

  const handleToggleReminder = () => {
    if (isReminderActive) {
      updateNoteField(note.id, 'reminder_at', null);
      updateNoteField(note.id, 'reminder_note', null);
    } else {
      const future = new Date(Date.now() + 10 * 60 * 1000);
      future.setSeconds(0, 0);
      updateNoteField(note.id, 'reminder_at', future.toISOString());
    }
  };

  const handleAddSubtask = async (e: any) => {
    if ((e.key && e.key !== 'Enter') || !newSubtask.trim()) return;
    try {
      const task = await invoke('add_subtask', { noteId: note.id, text: newSubtask.trim() });
      setSubtasks([...subtasks, task]);
    } catch {
      setSubtasks([...subtasks, { id: 'st_' + Date.now(), text: newSubtask.trim(), is_done: false }]);
    }
    setNewSubtask('');
  };

  const handleToggleSubtask = async (id: string, isDone: boolean) => {
    setSubtasks(subtasks.map(t => t.id === id ? { ...t, is_done: isDone } : t));
    try { await invoke('toggle_subtask', { id, isDone }); } catch (e) { console.error(e); }
  };

  const handleDeleteSubtask = async (id: string) => {
    setSubtasks(subtasks.filter(t => t.id !== id));
    try { await invoke('delete_subtask', { id }); } catch (e) { console.error(e); }
  };

  const handleAddAttachment = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ multiple: false });
      if (selected && typeof selected === 'string') {
        const att = await invoke('add_attachment', { noteId: note.id, filePath: selected });
        setAttachments([...attachments, att]);
        return;
      }
    } catch {
      fileInputRef.current?.click();
    }
  };

  const handleDownloadAttachment = async (filePath: string, fileName: string) => {
    try {
      const targetPath = await save({
        defaultPath: fileName,
      });
      
      if (targetPath) {
        await invoke('download_attachment', { sourcePath: filePath, targetPath: targetPath });
        alert('Dosya başarıyla indirildi!');
      }
    } catch (e) {
      alert('Dosya indirilemedi: ' + e);
    }
  };

  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachments([...attachments, {
        id: 'att_' + Date.now(),
        note_id: note.id,
        original_name: file.name,
        stored_path: file.name
      }]);
    }
  };

  const handleSoftDelete = async () => {
    if (isClosing) return;
    setIsClosing(true); 
    try {
      await softDeleteNote(note.id);
      await invoke('close_this_window');
    } catch (err) {
      console.error(err);
      setIsClosing(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (isClosing) return;
    setIsClosing(true);
    try {
      await permanentDeleteNote(note.id);
      await invoke('close_this_window');
    } catch (err) {
      console.error(err);
      setIsClosing(false);
    }
  };

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden relative transition-colors ${
      isLight ? 'bg-white text-zinc-900' : 'bg-zinc-900 text-zinc-100'
    }`}>
      <style>{`
        .tiptap-content h1 {
          font-size: 1.6rem !important;
          font-weight: 800 !important;
          line-height: 1.25 !important;
          margin-top: 0.7rem !important;
          margin-bottom: 0.35rem !important;
        }
        .tiptap-content h2 {
          font-size: 1.3rem !important;
          font-weight: 700 !important;
          line-height: 1.3 !important;
          margin-top: 0.6rem !important;
          margin-bottom: 0.3rem !important;
        }
        .tiptap-content ul {
          list-style-type: disc !important;
          padding-left: 1.5rem !important;
          margin: 0.3rem 0 !important;
        }
        .tiptap-content ol {
          list-style-type: decimal !important;
          padding-left: 1.5rem !important;
          margin: 0.3rem 0 !important;
        }
        .tiptap-content li {
          display: list-item !important;
          margin: 0.15rem 0 !important;
        }
        .tiptap-content blockquote {
          border-left: 4px solid #3b82f6 !important;
          padding-left: 1rem !important;
          margin: 0.4rem 0 !important;
          font-style: italic !important;
          opacity: 0.9 !important;
        }
        .tiptap-content pre {
          background-color: #18181b !important;
          color: #f4f4f5 !important;
          padding: 0.6rem 0.8rem !important;
          border-radius: 0.4rem !important;
          font-family: monospace !important;
          margin: 0.5rem 0 !important;
          border: 1px solid #27272a !important;
        }
        .tiptap-content code {
          background-color: rgba(120, 113, 108, 0.2) !important;
          padding: 0.1rem 0.3rem !important;
          border-radius: 0.25rem !important;
          font-family: monospace !important;
          font-size: 0.9em !important;
        }
        .tiptap-content p {
          margin: 0.2rem 0 !important;
          line-height: 1.5 !important;
        }
      `}</style>

      <input type="file" ref={fileInputRef} onChange={handleLocalFileChange} className="hidden" />

      {/* Üst Araç Çubuğu */}
      <div className={`border-b flex justify-between items-center px-4 py-1.5 backdrop-blur-md transition-colors ${
        isLight ? 'bg-zinc-50 border-zinc-300 text-zinc-700' : 'bg-zinc-950/70 border-zinc-800 text-zinc-300'
      }`}>
        <div className="flex items-center gap-1">
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().undo().run()} className={`p-1 rounded ${isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'}`} title="Geri Al"><RotateCcw size={14} /></button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().redo().run()} className={`p-1 rounded ${isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'}`} title="Yinele"><RotateCw size={14} /></button>
          <div className={`w-px h-3.5 mx-1 ${isLight ? 'bg-zinc-300' : 'bg-zinc-800'}`} />

          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()} className={`p-1 rounded ${editor.isActive('bold') ? 'bg-blue-600 text-white' : isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'}`} title="Kalın"><Bold size={14} /></button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-1 rounded ${editor.isActive('italic') ? 'bg-blue-600 text-white' : isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'}`} title="İtalik"><Italic size={14} /></button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleStrike().run()} className={`p-1 rounded ${editor.isActive('strike') ? 'bg-blue-600 text-white' : isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'}`} title="Üstü Çizili"><Strikethrough size={14} /></button>
          <div className={`w-px h-3.5 mx-1 ${isLight ? 'bg-zinc-300' : 'bg-zinc-800'}`} />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToggleHeading(1)} className={`p-1 rounded ${editor.isActive('heading', { level: 1 }) ? 'bg-blue-600 text-white' : isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'}`} title="Başlık 1"><Heading1 size={14} /></button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToggleHeading(2)} className={`p-1 rounded ${editor.isActive('heading', { level: 2 }) ? 'bg-blue-600 text-white' : isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'}`} title="Başlık 2"><Heading2 size={14} /></button>
          <div className={`w-px h-3.5 mx-1 ${isLight ? 'bg-zinc-300' : 'bg-zinc-800'}`} />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleToggleBulletList} className={`p-1 rounded ${editor.isActive('bulletList') ? 'bg-blue-600 text-white' : isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'}`} title="Madde Listesi"><List size={14} /></button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleToggleOrderedList} className={`p-1 rounded ${editor.isActive('orderedList') ? 'bg-blue-600 text-white' : isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'}`} title="Numaralı Liste"><ListOrdered size={14} /></button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleToggleBlockquote} className={`p-1 rounded ${editor.isActive('blockquote') ? 'bg-blue-600 text-white' : isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'}`} title="Alıntı"><Quote size={14} /></button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={`p-1 rounded ${editor.isActive('codeBlock') ? 'bg-blue-600 text-white' : isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'}`} title="Kod Bloğu"><Code size={14} /></button>
          
          <div className={`w-px h-3.5 mx-1 ${isLight ? 'bg-zinc-300' : 'bg-zinc-800'}`} />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleSortContent('asc')} className={`p-1 rounded flex items-center gap-0.5 ${isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'}`} title="A-Z Sırala"><ArrowDownAZ size={14} className="text-blue-500" /><span className="text-[10px] font-semibold">A-Z</span></button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleSortContent('desc')} className={`p-1 rounded flex items-center gap-0.5 ${isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'}`} title="Z-A Sırala"><ArrowUpZA size={14} className="text-blue-500" /><span className="text-[10px] font-semibold">Z-A</span></button>
        </div>

        <div className="flex items-center gap-1.5">
          {!isTrash ? (
            <>
              <div className={`flex items-center gap-1.5 mr-1 border px-2 py-0.5 rounded-full shadow-inner ${isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-900 border-zinc-800'}`}>
                <button type="button" onClick={() => updateNoteField(note.id, 'color', null)} className="w-3.5 h-3.5 rounded-full border border-zinc-400 hover:scale-110 flex items-center justify-center text-[8px]" title="Rengi Kaldır">✕</button>
                {['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'].map((c) => (
                  <button key={c} type="button" onClick={() => updateNoteField(note.id, 'color', c)} className={`w-3.5 h-3.5 rounded-full border border-zinc-400 hover:scale-110 transition-transform ${note.color === c ? 'ring-2 ring-white scale-110' : ''}`} style={{ backgroundColor: c }} />
                ))}
                <label className="relative w-3.5 h-3.5 rounded-full border border-zinc-400 hover:scale-125 transition-transform cursor-pointer flex items-center justify-center overflow-hidden bg-gradient-to-tr from-red-500 via-green-500 via-blue-500 to-pink-500 shadow-sm ml-0.5" title="Özel Renk Skalası">
                  <input type="color" value={note.color || '#3b82f6'} onChange={(e) => updateNoteField(note.id, 'color', e.target.value)} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
                </label>
              </div>

              <button type="button" onClick={() => updateNoteField(note.id, 'archived_at', isArchived ? null : new Date().toISOString())} className={`p-1 rounded ${isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'} ${isArchived ? 'text-purple-600 bg-purple-100' : 'text-zinc-500'}`} title="Arşiv"><Archive size={15} /></button>
              <button type="button" onClick={() => updateNoteField(note.id, 'is_pinned', (!note.is_pinned).toString())} className={`p-1 rounded ${isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'} ${note.is_pinned ? 'text-blue-600' : 'text-zinc-500'}`} title="Sabitle"><Pin size={15} fill={note.is_pinned ? 'currentColor' : 'none'} /></button>
              <button type="button" onClick={() => updateNoteField(note.id, 'is_favorite', (!note.is_favorite).toString())} className={`p-1 rounded ${isLight ? 'hover:bg-zinc-200' : 'hover:bg-zinc-800'} ${note.is_favorite ? 'text-yellow-500' : 'text-zinc-500'}`} title="Favori"><Star size={15} fill={note.is_favorite ? 'currentColor' : 'none'} /></button>
              
              <button type="button" onClick={handleSoftDelete} disabled={isClosing} className={`p-1 rounded text-zinc-500 hover:text-red-500 ${isLight ? 'hover:bg-red-50' : 'hover:bg-red-950/50'}`} title="Çöpe Taşı"><Trash2 size={15} /></button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => restoreNote(note.id)} disabled={isClosing} className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] px-2 py-1 rounded font-medium transition-colors">Geri Yükle</button>
              <button type="button" onClick={handlePermanentDelete} disabled={isClosing} className="bg-red-600 hover:bg-red-500 text-white text-[11px] px-2 py-1 rounded font-medium transition-colors">Kalıcı Sil</button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 w-full">
        {!isTrash && (
          <div className="mb-4">
            {!isMetaOpen ? (
              <div className="flex justify-end">
                <button type="button" onClick={() => setIsMetaOpen(true)} className={`flex items-center gap-1.5 border px-2.5 py-1 rounded-md text-[11px] font-medium shadow-sm ${isLight ? 'bg-zinc-100 border-zinc-300 text-zinc-700' : 'bg-zinc-950/80 border-zinc-800 text-zinc-400'}`}>
                  <SlidersHorizontal size={12} /><span>Not Detayları</span><ChevronDown size={13} className="text-amber-500" />
                </button>
              </div>
            ) : (
              <div className={`w-full border rounded-xl p-3 space-y-2.5 text-xs shadow-lg ${isLight ? 'bg-zinc-50 border-zinc-300 text-zinc-800' : 'bg-zinc-950/90 border-zinc-800 text-zinc-200'}`}>
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold">Durum:</span>
                    <select value={note.status_id} onChange={(e) => updateNoteField(note.id, 'status_id', e.target.value)} className={`border rounded px-1.5 py-0.5 outline-none ${isLight ? 'bg-white border-zinc-300' : 'bg-zinc-900 border-zinc-700 text-white'}`}>
                      <option value="todo">🟡 Bekliyor</option>
                      <option value="in_progress">🔵 Devam</option>
                      <option value="done">🟢 Bitti</option>
                      <option value="cancelled">⚪ İptal</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="font-semibold">Başlangıç:</span>
                    <input type="datetime-local" value={toLocalDatetimeInput(note.start_at || note.created_at)} onChange={(e) => updateNoteField(note.id, 'start_at', fromLocalDatetimeInput(e.target.value))} className={`border rounded px-1.5 py-0.5 outline-none ${isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-700 text-white'}`} />
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="font-semibold">Bitiş:</span>
                    <input 
                      type="datetime-local" 
                      value={note.due_at ? toLocalDatetimeInput(note.due_at) : ''} 
                      onChange={(e) => {
                        const val = e.target.value;
                        const parsed = val ? fromLocalDatetimeInput(val) : null;
                        updateNoteField(note.id, 'due_at', parsed);
                      }} 
                      className={`border rounded px-1.5 py-0.5 outline-none ${isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-700 text-white'}`} 
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="font-semibold">Kategori:</span>
                    <select value={note.category_id || ''} onChange={(e) => updateNoteField(note.id, 'category_id', e.target.value || null)} className={`border rounded px-1.5 py-0.5 outline-none font-medium cursor-pointer ${isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-700 text-white'}`}>
                      <option value="">Kategori Yok</option>
                      {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/40 gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap flex-1">
                    <button type="button" onClick={handleToggleReminder} className={`p-1 rounded border transition-all ${isReminderActive ? 'bg-amber-500/20 text-amber-500 border-amber-500' : 'bg-zinc-800 text-zinc-400'}`} title="Hatırlatıcı">
                      <Bell size={13} className={isReminderActive ? 'fill-amber-500 animate-pulse' : ''} />
                    </button>
                    <span className="font-semibold">Hatırlatıcı:</span>
                    {isReminderActive ? (
                      <>
                        <input type="datetime-local" value={toLocalDatetimeInput(note.reminder_at)} onChange={(e) => updateNoteField(note.id, 'reminder_at', fromLocalDatetimeInput(e.target.value))} className={`border rounded px-1.5 py-0.5 outline-none ${isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-700 text-white'}`} />
                        <input type="text" placeholder="Hatırlatma notu..." value={note.reminder_note || ''} onChange={(e) => updateNoteField(note.id, 'reminder_note', e.target.value || null)} className={`border rounded px-1.5 py-0.5 outline-none flex-1 max-w-xs ${isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-zinc-700 text-white'}`} />
                      </>
                    ) : (
                      <span className="text-[11px] text-zinc-500 italic">Kapalı</span>
                    )}
                  </div>
                  <button type="button" onClick={() => setIsMetaOpen(false)} className="bg-zinc-800 hover:bg-zinc-700 text-white px-2.5 py-0.5 rounded text-[11px] font-semibold shrink-0">Kapat</button>
                </div>
              </div>
            )}
          </div>
        )}

        <input
          type="text"
          disabled={isTrash}
          value={title}
          onChange={handleTitleChange}
          placeholder="Not Başlığı..."
          className={`w-full text-2xl font-black bg-transparent outline-none mb-4 border-none focus:ring-0 ${isLight ? 'text-zinc-900 placeholder-zinc-400' : 'text-white placeholder-zinc-700'}`}
        />

        <div className="min-h-[180px] mb-6 cursor-text">
          <EditorContent editor={editor} />
        </div>

        {!isTrash && (
          <div className="mt-6 pt-4 border-t border-zinc-800">
            <div className="flex items-center gap-2 font-semibold text-xs text-zinc-400 mb-2.5">
              <CheckSquare size={14} /> Alt Görevler ({doneSubtasks} / {subtasks.length})
            </div>
            <div className="space-y-1.5">
              {subtasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 group">
                  <input type="checkbox" checked={task.is_done} onChange={(e) => handleToggleSubtask(task.id, e.target.checked)} className="w-3.5 h-3.5 rounded bg-zinc-800 border-zinc-700 text-blue-600" />
                  <span className={`text-xs flex-1 ${task.is_done ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>{task.text}</span>
                  <button type="button" onClick={() => handleDeleteSubtask(task.id)} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400"><X size={12} /></button>
                </div>
              ))}
              <div className="flex items-center gap-2 mt-1.5">
                <Plus size={12} className="text-zinc-500" />
                <input type="text" value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)} onKeyDown={handleAddSubtask} placeholder="Yeni alt görev ekle... (Enter)" className="flex-1 bg-transparent text-xs outline-none text-zinc-200 placeholder-zinc-600" />
              </div>
            </div>
          </div>
        )}

        {!isTrash && (
          <div className="mt-6 pt-4 border-t border-zinc-800">
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-semibold text-xs text-zinc-400 flex items-center gap-1.5">
                <Paperclip size={13} /> Ekli Dosyalar
              </span>
              <button type="button" onClick={handleAddAttachment} className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white font-medium px-2.5 py-1 rounded shadow-sm flex items-center gap-1">
                <Plus size={12} /> Dosya Ekle
              </button>
            </div>
            {attachments.length === 0 ? (
              <div className="text-[11px] text-zinc-600 italic">Ekli dosya yok.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {attachments.map((file) => (
                  <div key={file.id} className="flex items-center justify-between p-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200">
                    <div className="flex items-center gap-2 truncate pr-1">
                      <File size={14} className="text-blue-400 shrink-0" />
                      <span className="truncate" title={file.original_name}>{file.original_name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadAttachment(file.stored_path, file.original_name)}
                      className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors shrink-0"
                      title="Dosyayı İndir"
                    >
                      <Download size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}