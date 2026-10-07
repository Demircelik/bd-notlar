import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

declare global {
  interface Window {
    __DRAGGED_NOTE_ID__?: string | null;
  }
}

export interface Note {
  id: string;
  title: string;
  body_json: string;
  body_text: string;
  created_at: string;
  updated_at: string;
  start_at: string | null;
  due_at: string | null;
  reminder_at: string | null;
  reminder_note: string | null;
  category_id: string | null;
  status_id: 'todo' | 'in_progress' | 'done' | 'cancelled';
  priority: number;
  color: string | null;
  is_pinned: boolean;
  is_favorite: boolean;
  is_completed: boolean;
  manual_order: number;
  custom_fields: Record<string, any>;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface Category {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

export type SmartViewScope = 
  | 'all' 
  | 'today' 
  | 'overdue' 
  | 'uncompleted' 
  | 'completed' 
  | 'pinned' 
  | 'favorites' 
  | 'archive' 
  | 'trash';

export interface SortCriterion {
  field: 'title' | 'created_at' | 'updated_at' | 'due_at' | 'start_at' | 'status_id' | 'manual_order';
  asc: boolean;
}

export const getLocalDateString = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const toLocalDatetimeInput = (isoStr: string | null | undefined): string => {
  if (!isoStr) return '';
  const d = new Date(typeof isoStr === 'string' ? isoStr.replace(' ', 'T') : isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export const fromLocalDatetimeInput = (val: string): string | null => {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  d.setSeconds(0, 0);
  return d.toISOString();
};

export const checkAndUpdateOverdueStatus = (note: Note): Note => {
  if (note.due_at && note.status_id !== 'done' && note.status_id !== 'cancelled') {
    const rawDue = typeof note.due_at === 'string' ? note.due_at.replace(' ', 'T') : note.due_at;
    const dueTime = new Date(rawDue).getTime();
    if (!isNaN(dueTime) && dueTime < Date.now()) {
      if (note.status_id !== 'todo') {
        return { ...note, status_id: 'todo', is_completed: false };
      }
    }
  }
  return note;
};

interface NoteState {
  notes: Note[];
  categories: Category[];
  selectedNoteIds: Set<string>;
  theme: 'dark' | 'light';
  
  smartScope: SmartViewScope;
  selectedCategoryId: string | null;
  searchQuery: string;
  sortCriteria: SortCriterion[];

  openEditor: (id: string) => Promise<void>;
  toggleTheme: () => void;
  loadInitialData: () => Promise<void>;

  toggleSelectNote: (id: string, isMulti: boolean) => void;
  clearSelection: () => void;
  
  setSmartScope: (scope: SmartViewScope) => void;
  setSelectedCategoryId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSortCriteria: (criteria: SortCriterion[]) => void;

  createNote: (categoryId?: string | null) => Promise<string>;
  saveNoteContent: (id: string, title: string, bodyJson: string, bodyText: string) => Promise<void>;
  updateNoteField: (id: string, field: string, value: any) => Promise<void>;
  updateStatus: (id: string, status: 'todo' | 'in_progress' | 'done' | 'cancelled') => Promise<void>;
  reorderNotes: (sourceId: string, targetId: string) => Promise<void>;
  moveNoteStep: (id: string, direction: 'up' | 'down') => Promise<void>;
  
  softDeleteNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  permanentDeleteNote: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  
  addCategory: (name: string, color?: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  categories: [],
  selectedNoteIds: new Set(),
  theme: (localStorage.getItem('smart_notes_theme') as 'dark' | 'light') || 'dark',

  smartScope: 'today',
  selectedCategoryId: null,
  searchQuery: '',
  sortCriteria: [{ field: 'manual_order', asc: true }],

  openEditor: async (id: string) => {
    try {
      await invoke('open_note_window', { id });
    } catch {
      const cleanLabel = `note_${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      window.open(`index.html?noteId=${encodeURIComponent(id)}`, cleanLabel, 'width=760,height=780');
    }
  },

  toggleTheme: () => set((state) => {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('smart_notes_theme', nextTheme);
    return { theme: nextTheme };
  }),

  loadInitialData: async () => {
    try {
      const [notesData, catsData] = await Promise.all([
        invoke<Note[]>('query_notes'),
        invoke<Category[]>('get_categories')
      ]);
      const processed = notesData.map(checkAndUpdateOverdueStatus);
      set({ notes: processed, categories: catsData });
    } catch (e) {
      console.error("Veriler yüklenirken hata:", e);
    }
  },

  toggleSelectNote: (id, isMulti) => set((s) => {
    const next = new Set(isMulti ? s.selectedNoteIds : []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selectedNoteIds: next };
  }),

  clearSelection: () => set({ selectedNoteIds: new Set() }),

  setSmartScope: (scope) => set({ smartScope: scope, selectedCategoryId: null, selectedNoteIds: new Set() }),
  setSelectedCategoryId: (id) => set({ selectedCategoryId: id, smartScope: 'all', selectedNoteIds: new Set() }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortCriteria: (criteria) => set({ sortCriteria: criteria }),

  createNote: async (categoryId) => {
    const now = new Date();
    now.setSeconds(0, 0);
    const nowIso = now.toISOString();

    try {
      const newNote = await invoke<Note>('create_note', { 
        title: 'Yeni Not', 
        categoryId: categoryId || null,
        startAt: nowIso
      });
      const processed = checkAndUpdateOverdueStatus(newNote);
      set((s) => ({ notes: [processed, ...s.notes] }));
      await get().openEditor(newNote.id);
      return newNote.id;
    } catch {
      const localId = 'note_' + Date.now();
      const mockNote: Note = {
        id: localId, title: 'Yeni Not', body_json: '', body_text: '',
        created_at: nowIso, updated_at: nowIso,
        start_at: nowIso,
        due_at: null, reminder_at: null, reminder_note: null,
        category_id: categoryId || null, status_id: 'todo', priority: 2,
        color: null, is_pinned: false, is_favorite: false, is_completed: false,
        manual_order: Date.now(), custom_fields: {}, archived_at: null, deleted_at: null
      };
      set((s) => ({ notes: [mockNote, ...s.notes] }));
      await get().openEditor(localId);
      return localId;
    }
  },

  saveNoteContent: async (id, title, bodyJson, bodyText) => {
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? checkAndUpdateOverdueStatus({ ...n, title, body_json: bodyJson, body_text: bodyText, updated_at: new Date().toISOString() }) : n))
    }));
    try {
      await invoke('update_note', { id, title, bodyJson, bodyText });
    } catch (e) { console.error(e); }
  },

  updateNoteField: async (id, field, value) => {
    let parsedValue = value;
    if (field === 'is_pinned' || field === 'is_favorite' || field === 'is_completed') {
      parsedValue = value === true || value === 'true' || value === '1' || value === 1;
    }

    // Değişiklikten ÖNCEKİ durum: not zaten tamamlanmış/iptal edilmiş miydi?
    const before = get().notes.find((n) => n.id === id);
    const wasFinished =
      !!before &&
      (before.is_completed === true ||
        before.status_id === 'done' ||
        before.status_id === 'cancelled');

    set((s) => ({
      notes: s.notes.map((n) => {
        if (n.id !== id) return n;

        const updated = { ...n };

        if (field === 'is_pinned') {
          updated.is_pinned = parsedValue;
        } else if (field === 'is_favorite') {
          updated.is_favorite = parsedValue;
        } else if (field === 'is_completed') {
          updated.is_completed = parsedValue;
          if (parsedValue) {
            updated.status_id = 'done';
          } else if (updated.status_id === 'done') {
            updated.status_id = 'todo';
          }
        } else if (field === 'status_id') {
          updated.status_id = value as any;
          updated.is_completed = value === 'done';
        } else if (field === 'due_at' || field === 'start_at') {
          (updated as any)[field] = parsedValue;
          // Tamamlanmış veya iptal edilmiş bir notun tarihi güncellenirse otomatik aktif (todo) duruma döner
          if (updated.is_completed || updated.status_id === 'done' || updated.status_id === 'cancelled') {
            updated.is_completed = false;
            updated.status_id = 'todo';
          }
        } else if (field === 'category_id') {
          updated.category_id = value;
          updated.archived_at = null;
        } else if (field === 'archived_at') {
          updated.archived_at = value;
        } else {
          (updated as any)[field] = parsedValue;
        }

        if (['category_id', 'status_id', 'is_favorite', 'is_completed'].includes(field)) {
          updated.archived_at = null;
        }

        return checkAndUpdateOverdueStatus(updated);
      })
    }));

    try {
      let backendVal = value;
      if (typeof parsedValue === 'boolean') {
        backendVal = parsedValue ? 'true' : 'false';
      }
      await invoke('update_note_field', { id, field, value: backendVal !== null && backendVal !== undefined ? String(backendVal) : null });

      const currentNote = get().notes.find(n => n.id === id);
      if (currentNote) {
        if (field === 'is_completed') {
          await invoke('update_note_field', { id, field: 'status_id', value: currentNote.status_id });
        } else if (field === 'status_id') {
          await invoke('update_note_field', { id, field: 'is_completed', value: currentNote.is_completed ? 'true' : 'false' });
        } else if (field === 'due_at' || field === 'start_at') {
          // Sadece tamamlanmış/iptal bir not tarih değişikliğiyle yeniden aktif (todo) olduysa backend'e bildir.
          // Backend is_completed=false gelince due_at'i NULL yaptığı için, önce durumu sıfırlayıp ardından tarihi TEKRAR yazıyoruz.
          if (wasFinished && !currentNote.is_completed && currentNote.status_id === 'todo') {
            await invoke('update_note_field', { id, field: 'is_completed', value: 'false' });
            await invoke('update_note_field', { id, field: 'status_id', value: 'todo' });
            const dateVal = (currentNote as any)[field];
            await invoke('update_note_field', { id, field, value: dateVal !== null && dateVal !== undefined ? String(dateVal) : null });
          }
        }
      }

      if (['category_id', 'status_id', 'is_favorite', 'is_completed'].includes(field)) {
        await invoke('update_note_field', { id, field: 'archived_at', value: null });
      }
    } catch (e) {
      console.error('Alan güncellenemedi:', e);
    }
  },

  updateStatus: async (id, status) => {
    await get().updateNoteField(id, 'status_id', status);
  },

  reorderNotes: async (sourceId, targetId) => {
    if (sourceId === targetId) return;
    const { notes } = get();

    const sourceIndex = notes.findIndex(n => n.id === sourceId);
    const targetIndex = notes.findIndex(n => n.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const newNotes = [...notes];
    const [moved] = newNotes.splice(sourceIndex, 1);
    const newTargetIndex = newNotes.findIndex(n => n.id === targetId);
    newNotes.splice(newTargetIndex, 0, moved);

    const updatedNotes = newNotes.map((n, idx) => ({
      ...n,
      manual_order: (idx + 1) * 10
    }));

    set({
      notes: updatedNotes,
      sortCriteria: [{ field: 'manual_order', asc: true }]
    });

    try {
      await invoke('reorder_notes', { orderedIds: updatedNotes.map(n => n.id) });
    } catch (e) {
      console.error('Sıralama kaydedilemedi:', e);
    }
  },

  moveNoteStep: async (id, direction) => {
    const { notes } = get();
    const unpinned = notes
      .filter(n => !n.is_pinned && !n.deleted_at && !n.archived_at)
      .sort((a, b) => a.manual_order - b.manual_order);

    const currIdx = unpinned.findIndex(n => n.id === id);
    if (currIdx === -1) return;
    const targetIdx = direction === 'up' ? currIdx - 1 : currIdx + 1;
    if (targetIdx < 0 || targetIdx >= unpinned.length) return;

    const targetNote = unpinned[targetIdx];
    await get().reorderNotes(id, targetNote.id);
  },

  softDeleteNote: async (id) => {
    set((s) => ({
      notes: s.notes.map(n => n.id === id ? { ...n, deleted_at: new Date().toISOString() } : n)
    }));
    try { await invoke('soft_delete_note', { id }); } catch (e) { console.error(e); }
  },

  restoreNote: async (id) => {
    set((s) => ({
      notes: s.notes.map(n => n.id === id ? { ...n, deleted_at: null, archived_at: null } : n)
    }));
    try { await invoke('restore_note', { id }); } catch (e) { console.error(e); }
  },

  permanentDeleteNote: async (id) => {
    set((s) => ({
      notes: s.notes.filter(n => n.id !== id)
    }));
    try { await invoke('permanent_delete_note', { id }); } catch (e) { console.error(e); }
  },

  emptyTrash: async () => {
    set((s) => ({
      notes: s.notes.filter(n => !n.deleted_at)
    }));
    try { await invoke('empty_trash'); } catch (e) { console.error(e); }
  },

  addCategory: async (name, color) => {
    const newId = 'cat_' + Date.now();
    const newCat = { id: newId, name, color: color || '#3b82f6', icon: 'Folder' };
    set((s) => ({ categories: [...s.categories, newCat] }));
    try {
      const res = await invoke<Category>('add_category', { name, color: color || '#3b82f6', icon: 'Folder' });
      set((s) => ({ categories: s.categories.map(c => c.id === newId ? res : c) }));
    } catch (e) { console.error(e); }
  },

  deleteCategory: async (id) => {
    set((s) => ({
      categories: s.categories.filter(c => c.id !== id),
      notes: s.notes.map(n => n.category_id === id ? { ...n, category_id: null } : n),
      selectedCategoryId: s.selectedCategoryId === id ? null : s.selectedCategoryId
    }));
    try { await invoke('delete_category', { id }); } catch (e) { console.error(e); }
  }
}));

export function useCentralFilteredNotes() {
  const { notes, smartScope, selectedCategoryId, searchQuery, sortCriteria } = useNoteStore();
  const todayStr = getLocalDateString(new Date());

  const processedNotes = notes.map(checkAndUpdateOverdueStatus);

  return processedNotes.filter((n) => {
    if (smartScope === 'trash') return !!n.deleted_at;
    if (n.deleted_at) return false;

    if (smartScope === 'archive') return !!n.archived_at;
    if (n.archived_at) return false;

    const isDone = n.is_completed === true || n.is_completed === (1 as any) || n.status_id === 'done' || n.status_id === 'cancelled';

    if (smartScope === 'completed') {
      if (!isDone) return false;
    } else if (smartScope === 'uncompleted') {
      if (isDone) return false;
    } else if (smartScope === 'favorites') {
      if (!n.is_favorite && n.is_favorite !== (1 as any)) return false;
    } else if (smartScope === 'pinned') {
      if (!n.is_pinned && n.is_pinned !== (1 as any)) return false;
    } else if (smartScope === 'today') {
      const noteDate = getLocalDateString(new Date(typeof n.start_at === 'string' ? n.start_at.replace(' ', 'T') : (n.start_at || n.due_at || n.created_at)));
      if (noteDate !== todayStr) return false;
    } else if (smartScope === 'overdue') {
      if (!n.due_at || isDone) return false;
      const rawDue = typeof n.due_at === 'string' ? n.due_at.replace(' ', 'T') : n.due_at;
      const dueTime = new Date(rawDue).getTime();
      if (isNaN(dueTime)) return false;
      if (dueTime >= Date.now()) return false;
    }

    if (selectedCategoryId && n.category_id !== selectedCategoryId) return false;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchTitle = (n.title || '').toLowerCase().includes(q);
      const matchBody = (n.body_text || '').toLowerCase().includes(q);
      if (!matchTitle && !matchBody) return false;
    }

    return true;
  }).sort((a, b) => {
    const pinA = a.is_pinned === true || a.is_pinned === (1 as any) || a.is_pinned === ('true' as any);
    const pinB = b.is_pinned === true || b.is_pinned === (1 as any) || b.is_pinned === ('true' as any);

    if (pinA !== pinB) return pinA ? -1 : 1;

    const sort = sortCriteria[0] || { field: 'manual_order', asc: true };

    if (sort.field === 'manual_order') {
      if (a.manual_order !== b.manual_order) {
        return (a.manual_order - b.manual_order) * (sort.asc ? 1 : -1);
      }
    }

    if (sort.field === 'title') {
      const titleA = (a.title || '').trim();
      const titleB = (b.title || '').trim();

      if (titleA === '' && titleB !== '') return 1;
      if (titleB === '' && titleA !== '') return -1;
      
      if (titleA !== '' && titleB !== '') {
        const cmp = titleA.localeCompare(titleB, 'tr-TR', { sensitivity: 'base' });
        if (cmp !== 0) return sort.asc ? cmp : -cmp;
      }
    } 
    else if (sort.field === 'created_at' || sort.field === 'start_at' || sort.field === 'due_at' || sort.field === 'updated_at') {
      const rawA = a[sort.field];
      const rawB = b[sort.field];
      const timeA = rawA ? new Date(typeof rawA === 'string' ? rawA.replace(' ', 'T') : rawA).getTime() : Infinity;
      const timeB = rawB ? new Date(typeof rawB === 'string' ? rawB.replace(' ', 'T') : rawB).getTime() : Infinity;
      if (timeA !== timeB) return sort.asc ? timeA - timeB : timeB - timeA;
    }

    if (a.manual_order !== b.manual_order) {
      return a.manual_order - b.manual_order;
    }
    return new Date(typeof b.created_at === 'string' ? b.created_at.replace(' ', 'T') : b.created_at).getTime() - new Date(typeof a.created_at === 'string' ? a.created_at.replace(' ', 'T') : a.created_at).getTime();
  });
}