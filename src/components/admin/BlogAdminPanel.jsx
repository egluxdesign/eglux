// src/components/admin/BlogAdminPanel.jsx
// ============================================================================
// BlogAdminPanel — Create, edit, publish/delete blog posts
// v2: Rich text editor + cover image upload + tag chip input + save draft
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { friendlyErrorMessage } from '../../lib/errorMessage';
import RichTextEditor from '../ui/RichTextEditor';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Asia/Jakarta',
    }).format(new Date(iso)) + ' WIB';
  } catch { return iso; }
}

// ============================================================================
// Tag Input — chip-based, split by comma+space
// ============================================================================
const TagInput = ({ tags, onChange }) => {
  const [input, setInput] = useState('');

  const addTags = (text) => {
    // Split by comma, trim, filter empty, deduplicate
    const newTags = text
      .split(',')
      .map(t => t.trim())
      .filter(t => t && !tags.includes(t));
    if (newTags.length > 0) {
      onChange([...tags, ...newTags]);
    }
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault();
      addTags(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const handleBlur = () => {
    if (input.trim()) addTags(input);
  };

  const removeTag = (idx) => {
    onChange(tags.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 min-h-[40px] border border-gray-300 rounded-md cursor-text" onClick={() => document.getElementById('tag-input-field')?.focus()}>
      {tags.map((tag, idx) => (
        <span key={idx} className="inline-flex items-center gap-1 bg-eglux-accent text-eglux-secondary text-xs font-medium px-2 py-0.5 rounded-full">
          {tag}
          <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(idx); }} className="cursor-pointer border-none bg-transparent text-eglux-secondary hover:text-red-500">✕</button>
        </span>
      ))}
      <input
        id="tag-input-field"
        type="text"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          // Auto-split kalau ada koma
          if (e.target.value.includes(',')) {
            addTags(e.target.value);
          }
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={tags.length === 0 ? 'Ketik tag, pisahkan dengan koma...' : ''}
        className="flex-1 min-w-[100px] text-sm border-none outline-none bg-transparent"
      />
    </div>
  );
};

// ============================================================================
// Cover Image Upload
// ============================================================================
const CoverImageUpload = ({ url, onChange }) => {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) return;

      const formData = new FormData();
      formData.append('file', file);

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/upload-blog-media`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const result = await resp.json();
      if (result.success) {
        onChange(result.url);
      }
    } catch (err) {
      console.error('[CoverImage] Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {url ? (
        <div className="relative group">
          <img src={url} alt="Cover" className="w-full h-40 object-cover rounded-lg border border-gray-200" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center cursor-pointer border-none opacity-0 group-hover:opacity-100 transition-opacity"
          >✕</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full h-40 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-eglux-secondary hover:bg-eglux-accent/20 transition-colors bg-transparent"
        >
          {uploading ? (
            <div className="w-6 h-6 border-2 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              <span className="text-xs text-gray-500">Klik untuk upload cover image</span>
            </>
          )}
        </button>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
    </div>
  );
};

// ============================================================================
// Blog Editor (create/edit form)
// ============================================================================
const BlogEditor = ({ post, onClose, onSaved, showToast }) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: post?.title || '',
    excerpt: post?.excerpt || '',
    content: post?.content || '',
    cover_image_url: post?.cover_image_url || '',
    category: post?.category || 'Umum',
    tags: post?.tags || [],
    author_name: post?.author_name || 'EGLUX',
    is_published: post?.is_published || false,
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async (publish = null) => {
    const shouldPublish = publish !== null ? publish : form.is_published;
    if (!form.title.trim() || !form.content.trim()) {
      showToast?.('Judul dan konten wajib diisi', 'error');
      return;
    }
    setSaving(true);
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) { showToast?.('Sesi login habis', 'error'); return; }

      const payload = {
        title: form.title,
        excerpt: form.excerpt,
        content: form.content,
        cover_image_url: form.cover_image_url,
        category: form.category,
        tags: form.tags,
        author_name: form.author_name,
        is_published: shouldPublish,
      };

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-blog`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(post ? { action: 'update', post_id: post.id, ...payload } : { action: 'create', ...payload }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Failed to save');

      showToast?.(shouldPublish ? '✓ Artikel dipublish' : '✓ Artikel disimpan sebagai draft', 'success');
      onSaved?.();
    } catch (e) {
      showToast?.('Gagal: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[3000] flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-3xl w-full my-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-lg font-bold text-gray-900">{post ? 'Edit Artikel' : 'Buat Artikel Baru'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer border-none text-xl">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Judul Artikel <span className="text-red-500">*</span></label>
            <input type="text" value={form.title} onChange={e => update('title', e.target.value)}
              placeholder="Mis. Tips Merawat Panci Anti-Lengket"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" />
          </div>

          {/* Category + Author */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
              <input type="text" value={form.category} onChange={e => update('category', e.target.value)}
                placeholder="Umum"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
              <input type="text" value={form.author_name} onChange={e => update('author_name', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" />
            </div>
          </div>

          {/* Tags (chip input) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags <span className="text-gray-400">(pisahkan dengan koma)</span></label>
            <TagInput tags={form.tags} onChange={(tags) => update('tags', tags)} />
          </div>

          {/* Cover Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cover Image</label>
            <CoverImageUpload url={form.cover_image_url} onChange={(url) => update('cover_image_url', url)} />
          </div>

          {/* Excerpt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Excerpt <span className="text-gray-400">(ringkasan singkat)</span></label>
            <textarea value={form.excerpt} onChange={e => update('excerpt', e.target.value)}
              placeholder="Ringkasan artikel yang tampil di list blog..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md resize-none" />
          </div>

          {/* Content (Rich Text Editor) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Konten Artikel <span className="text-red-500">*</span></label>
            <RichTextEditor
              value={form.content}
              onChange={(html) => update('content', html)}
              placeholder="Tulis artikel di sini... Gunakan toolbar untuk styling, insert image, video, dll."
            />
          </div>
        </div>

        {/* Footer — 3 buttons: Batal, Simpan Draft, Publish */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">Batal</button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            {saving ? '⏳...' : 'Simpan Draft'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="px-6 py-2 text-sm font-bold text-white bg-eglux-primary rounded-md hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {saving ? '⏳...' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const BlogAdminPanel = ({ showToast }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingPost, setEditingPost] = useState(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) { setError('Sesi login habis'); return; }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-blog`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      });
      const result = await resp.json();
      if (result.success) setPosts(result.posts || []);
      else throw new Error(result.error);
    } catch (e) {
      setError(friendlyErrorMessage(e, 'Memuat artikel'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleDelete = async (postId) => {
    if (!confirm('Hapus artikel ini?')) return;
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      await fetch(`${SUPABASE_URL}/functions/v1/manage-blog`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', post_id: postId }),
      });
      showToast?.('✓ Artikel dihapus', 'success');
      fetchPosts();
    } catch (e) { showToast?.('Gagal: ' + e.message, 'error'); }
  };

  const handleTogglePublish = async (post) => {
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      await fetch(`${SUPABASE_URL}/functions/v1/manage-blog`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_publish', post_id: post.id, is_published: !post.is_published }),
      });
      showToast?.(post.is_published ? '✓ Artikel di-unpublish' : '✓ Artikel dipublish', 'success');
      fetchPosts();
    } catch (e) { showToast?.('Gagal: ' + e.message, 'error'); }
  };

  const handleEdit = (post) => { setEditingPost(post); setShowEditor(true); };
  const handleNew = () => { setEditingPost(null); setShowEditor(true); };
  const handleEditorClose = () => { setShowEditor(false); setEditingPost(null); };
  const handleEditorSaved = () => { setShowEditor(false); setEditingPost(null); fetchPosts(); };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{posts.length} artikel</p>
        <button onClick={handleNew} className="px-4 py-2 text-sm font-bold text-white bg-eglux-primary rounded-md hover:opacity-90 cursor-pointer">
          + Buat Artikel
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={fetchPosts} className="mt-2 text-xs text-red-700 font-semibold hover:underline">Coba lagi</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && posts.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <div className="text-4xl mb-3">📝</div>
          <p className="text-gray-700 font-medium mb-1">Belum ada artikel</p>
          <p className="text-sm text-gray-400 mb-5">Buat artikel pertama untuk blog EGLUX</p>
          <button onClick={handleNew} className="px-6 py-2.5 bg-eglux-primary text-white rounded-xl text-sm font-bold hover:opacity-90 cursor-pointer">+ Buat Artikel</button>
        </div>
      )}

      {/* Posts list */}
      {!loading && !error && posts.length > 0 && (
        <div className="space-y-3">
          {posts.map((post) => (
            <div key={post.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-bold text-gray-900 truncate">{post.title}</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-semibold ${post.is_published ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                    {post.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {post.category} · oleh {post.author_name} · {formatDate(post.published_at || post.created_at)}
                </p>
                {post.excerpt && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{post.excerpt}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => handleTogglePublish(post)}
                  className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${post.is_published ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${post.is_published ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                {/* ⭐ Text "Edit" (bukan icon pencil) */}
                <button onClick={() => handleEdit(post)} className="px-3 py-1.5 text-xs font-semibold text-eglux-secondary bg-white border border-eglux-secondary/30 rounded-md hover:bg-eglux-secondary hover:text-white transition-colors cursor-pointer">
                  Edit
                </button>
                <button onClick={() => handleDelete(post.id)} className="px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded cursor-pointer border-none bg-transparent">🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor modal */}
      {showEditor && (
        <BlogEditor
          post={editingPost}
          onClose={handleEditorClose}
          onSaved={handleEditorSaved}
          showToast={showToast}
        />
      )}
    </div>
  );
};

export default BlogAdminPanel;
