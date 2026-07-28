// src/components/admin/AboutAdminPanel.jsx
// ============================================================================
// AboutAdminPanel — Edit About page content (hero, content, stats, leadership, timeline)
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { friendlyErrorMessage } from '../../lib/errorMessage';
import RichTextEditor from '../ui/RichTextEditor';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ============================================================================
// ImageUpload — Upload image via browser to Supabase Storage (blog-media bucket)
// ============================================================================
const ImageUpload = ({ url, onChange, label = 'Foto', height = 'h-32' }) => {
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
      console.error('[ImageUpload] failed:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {url ? (
        <div className="relative group">
          <img src={url} alt={label} className={`w-full ${height} object-cover rounded-lg border border-gray-200`} />
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
          className={`w-full ${height} border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-eglux-secondary hover:bg-eglux-accent/20 transition-colors bg-transparent`}
        >
          {uploading ? (
            <div className="w-5 h-5 border-2 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <svg className="w-6 h-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              <span className="text-[0.7rem] text-gray-500">Upload {label}</span>
            </>
          )}
        </button>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
    </div>
  );
};

// ── Reusable array editor (for stats, leadership, timeline) ──
const ArrayEditor = ({ label, items, onChange, fields, renderItem }) => {
  const update = (idx, field, value) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  };
  const add = () => onChange([...items, fields]);
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
  const moveUp = (idx) => { if (idx === 0) return; const next = [...items]; [next[idx-1], next[idx]] = [next[idx], next[idx-1]]; onChange(next); };
  const moveDown = (idx) => { if (idx === items.length - 1) return; const next = [...items]; [next[idx], next[idx+1]] = [next[idx+1], next[idx]]; onChange(next); };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <button type="button" onClick={add} className="text-xs font-semibold text-eglux-secondary hover:underline cursor-pointer border-none bg-transparent">+ Tambah</button>
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">#{idx + 1}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => moveUp(idx)} disabled={idx === 0} className="w-6 h-6 text-xs text-gray-500 hover:bg-gray-200 rounded cursor-pointer border-none bg-transparent disabled:opacity-30">↑</button>
              <button type="button" onClick={() => moveDown(idx)} disabled={idx === items.length - 1} className="w-6 h-6 text-xs text-gray-500 hover:bg-gray-200 rounded cursor-pointer border-none bg-transparent disabled:opacity-30">↓</button>
              <button type="button" onClick={() => remove(idx)} className="w-6 h-6 text-xs text-red-500 hover:bg-red-50 rounded cursor-pointer border-none bg-transparent">✕</button>
            </div>
          </div>
          {renderItem(item, (field, value) => update(idx, field, value))}
        </div>
      ))}
      {items.length === 0 && <p className="text-xs text-gray-400 italic">Belum ada data. Klik "+ Tambah" untuk menambah.</p>}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const AboutAdminPanel = ({ showToast }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState({
    hero_title: 'Tentang EGLUX',
    hero_subtitle: 'Produk Rumah Tangga & Dapur Berkualitas',
    hero_image_url: '',
    content_html: '<p>Selamat datang di EGLUX.</p>',
    stats: [],
    leadership: [],
    timeline: [],
  });

  const fetchContent = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-about`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get' }),
      });
      const result = await resp.json();
      if (result.success && result.content) {
        const c = result.content;
        // Parse JSONB fields
        const parseJSON = (val) => {
          if (!val) return [];
          if (Array.isArray(val)) return val;
          try { return JSON.parse(val); } catch { return []; }
        };
        setContent({
          hero_title: c.hero_title || '',
          hero_subtitle: c.hero_subtitle || '',
          hero_image_url: c.hero_image_url || '',
          content_html: c.content_html || '',
          stats: parseJSON(c.stats),
          leadership: parseJSON(c.leadership),
          timeline: parseJSON(c.timeline),
        });
      }
    } catch (e) {
      showToast?.('Gagal memuat: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  const update = (field, value) => setContent(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) { showToast?.('Sesi login habis', 'error'); return; }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-about`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', ...content }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error);

      showToast?.('✓ Konten About page disimpan', 'success');
      // ⭐ Re-fetch dari DB supaya data ter-verifikasi tersimpan + UI ter-update
      await fetchContent();
    } catch (e) {
      showToast?.('Gagal: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* === Hero Section === */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Hero Section</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Judul Hero</label>
          <input type="text" value={content.hero_title} onChange={e => update('hero_title', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle Hero</label>
          <input type="text" value={content.hero_subtitle} onChange={e => update('hero_subtitle', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gambar Hero</label>
          <ImageUpload url={content.hero_image_url} onChange={(url) => update('hero_image_url', url)} label="Hero Image" height="h-32" />
        </div>
      </section>

      {/* === Content (Rich Text) === */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Konten About</h3>
        <RichTextEditor value={content.content_html} onChange={(html) => update('content_html', html)}
          placeholder="Tulis konten about page di sini..." />
      </section>

      {/* === Stats === */}
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Statistics</h3>
        <ArrayEditor
          label="Stat Items"
          items={content.stats}
          onChange={(stats) => update('stats', stats)}
          fields={{ label: '', value: '' }}
          renderItem={(item, update) => (
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={item.label || ''} onChange={e => update('label', e.target.value)}
                placeholder="Label (mis. Produk Terjual)"
                className="px-2 py-1.5 text-xs border border-gray-300 rounded" />
              <input type="text" value={item.value || ''} onChange={e => update('value', e.target.value)}
                placeholder="Value (mis. 10rb+)"
                className="px-2 py-1.5 text-xs border border-gray-300 rounded" />
            </div>
          )}
        />
      </section>

      {/* === Leadership === */}
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Leadership Team</h3>
        <ArrayEditor
          label="Team Members"
          items={content.leadership}
          onChange={(leadership) => update('leadership', leadership)}
          fields={{ name: '', role: '', photo_url: '', visi: '', misi: [], social_url: '' }}
          renderItem={(item, update) => (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={item.name || ''} onChange={e => update('name', e.target.value)}
                  placeholder="Nama"
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded" />
                <input type="text" value={item.role || ''} onChange={e => update('role', e.target.value)}
                  placeholder="Jabatan (mis. Brand Owner)"
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded" />
              </div>
              <ImageUpload url={item.photo_url || ''} onChange={(url) => update('photo_url', url)} label="Foto" height="h-24" />
              <div>
                <label className="text-[0.7rem] text-gray-500">Visi</label>
                <textarea value={item.visi || ''} onChange={e => update('visi', e.target.value)}
                  placeholder="Visi..."
                  rows={2}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded resize-none" />
              </div>
              <div>
                <label className="text-[0.7rem] text-gray-500">Misi <span className="text-gray-400">(1 per baris)</span></label>
                <textarea
                  value={Array.isArray(item.misi) ? item.misi.join('\n') : (item.misi || '')}
                  onChange={e => update('misi', e.target.value.split('\n').filter(Boolean))}
                  placeholder="Misi 1&#10;Misi 2&#10;Misi 3"
                  rows={4}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded resize-none" />
              </div>
              <div>
                <label className="text-[0.7rem] text-gray-500">URL Media Sosial <span className="text-gray-400">(Instagram, dll)</span></label>
                <input type="text" value={item.social_url || ''} onChange={e => update('social_url', e.target.value)}
                  placeholder="https://instagram.com/eglux_id"
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded" />
              </div>
            </div>
          )}
        />
      </section>

      {/* === Timeline === */}
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Timeline</h3>
        <ArrayEditor
          label="Timeline Events"
          items={content.timeline}
          onChange={(timeline) => update('timeline', timeline)}
          fields={{ year: '', title: '', description: '' }}
          renderItem={(item, update) => (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <input type="text" value={item.year || ''} onChange={e => update('year', e.target.value)}
                  placeholder="Tahun (mis. 2024)"
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded" />
                <input type="text" value={item.title || ''} onChange={e => update('title', e.target.value)}
                  placeholder="Judul milestone"
                  className="col-span-2 px-2 py-1.5 text-xs border border-gray-300 rounded" />
              </div>
              <textarea value={item.description || ''} onChange={e => update('description', e.target.value)}
                placeholder="Deskripsi..."
                rows={2}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded resize-none" />
            </div>
          )}
        />
      </section>

      {/* === Save Button (sticky bottom) === */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-5 px-5 py-3 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 text-sm font-bold text-white bg-eglux-primary rounded-md hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {saving ? '⏳ Menyimpan...' : '💾 Simpan Perubahan'}
        </button>
      </div>
    </div>
  );
};

export default AboutAdminPanel;
