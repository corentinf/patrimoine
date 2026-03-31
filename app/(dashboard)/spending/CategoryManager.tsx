'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCategory, updateCategory } from './actions';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_income: boolean;
}

interface CategoryManagerProps {
  categories: Category[];
  onClose: () => void;
}

const COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308',
  '#84CC16', '#22C55E', '#14B8A6', '#06B6D4',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7',
  '#EC4899', '#F43F5E', '#78716C', '#9CA3AF',
];

const EMPTY_FORM = { name: '', icon: '✨', color: '#6366F1' };

export default function CategoryManager({ categories, onClose }: CategoryManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // null = list view, 'new' = create form, category id = edit form
  const [editing, setEditing] = useState<'new' | string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setEditing('new');
  }

  function openEdit(cat: Category) {
    setForm({ name: cat.name, icon: cat.icon || '✨', color: cat.color || '#6366F1' });
    setError(null);
    setEditing(cat.id);
  }

  function handleSave() {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (!form.icon.trim()) { setError('Emoji is required.'); return; }
    setError(null);

    startTransition(async () => {
      try {
        if (editing === 'new') {
          await createCategory(form);
        } else if (editing) {
          await updateCategory(editing, form);
        }
        router.refresh();
        setEditing(null);
      } catch (e: any) {
        setError(e.message ?? 'Something went wrong.');
      }
    });
  }

  const isEditing = editing !== null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-sand-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              {isEditing && (
                <button
                  onClick={() => setEditing(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-sand-100 text-ink-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <h3 className="font-semibold text-ink-800">
                {editing === 'new' ? 'New category' : editing ? 'Edit category' : 'Categories'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-sand-100 text-ink-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {!isEditing ? (
              /* ── List view ── */
              <div className="divide-y divide-sand-100">
                {categories.map((cat) => (
                  <div key={cat.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="text-xl w-8 text-center">{cat.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-700">{cat.name}</p>
                      {cat.is_income && (
                        <p className="text-xs text-accent-green">Income</p>
                      )}
                    </div>
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <button
                      onClick={() => openEdit(cat)}
                      className="text-xs text-ink-400 hover:text-ink-700 transition-colors px-2 py-1 rounded hover:bg-sand-100"
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              /* ── Create / Edit form ── */
              <div className="px-5 py-5 space-y-5">
                {/* Emoji + preview */}
                <div>
                  <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">
                    Emoji
                  </label>
                  <div className="flex items-center gap-3">
                    <span
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                      style={{ backgroundColor: form.color + '20' }}
                    >
                      {form.icon || '?'}
                    </span>
                    <input
                      type="text"
                      value={form.icon}
                      onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                      placeholder="Paste or type an emoji"
                      className="flex-1 px-3 py-2 border border-sand-200 rounded-xl text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-sand-300"
                    />
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Coffee & Tea"
                    className="w-full px-3 py-2 border border-sand-200 rounded-xl text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-sand-300"
                  />
                </div>

                {/* Color */}
                <div>
                  <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">
                    Color
                  </label>
                  <div className="grid grid-cols-8 gap-2">
                    {COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setForm((f) => ({ ...f, color }))}
                        className="w-8 h-8 rounded-lg transition-transform hover:scale-110 focus:outline-none"
                        style={{ backgroundColor: color }}
                        title={color}
                      >
                        {form.color === color && (
                          <svg className="w-4 h-4 text-white mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-accent-red">{error}</p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-sand-100 flex-shrink-0 flex items-center justify-between gap-3">
            {!isEditing ? (
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2 bg-ink-800 text-white rounded-xl text-sm font-medium hover:bg-ink-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New category
              </button>
            ) : (
              <>
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 border border-sand-200 text-ink-500 rounded-xl text-sm font-medium hover:bg-sand-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-ink-800 text-white rounded-xl text-sm font-medium hover:bg-ink-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? 'Saving…' : 'Save category'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
