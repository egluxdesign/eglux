// src/components/admin/HomepageContentPanel.jsx
// ============================================================================
// HomepageContentPanel — Admin panel untuk manage homepage banners + categories
// ============================================================================
//
// Features:
//   - Banner CRUD: upload image, set title/subtitle/CTA, active toggle, reorder, delete
//   - Category CRUD: upload image, set name/filter_value, active toggle, reorder, delete
//   - Image upload via upload-homepage-image edge function
//   - CRUD via manage-homepage-content edge function
//
// Dipakai sebagai tab di AdminProductsPage.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Helpers ──
const getSessionToken = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
};

// ── Icons ──
const IconUpload = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);
const IconTrash = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const IconArrowUp = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);
const IconArrowDown = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
  </svg>
);

// ============================================================================
// HomepageContentPanel — main component
// ============================================================================
const HomepageContentPanel = ({ showToast }) => {
  const [banners, setBanners] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('banners'); // 'banners' | 'categories'
  const [uploading, setUploading] = useState(false);

  // ── Fetch all content ──
  const fetchContent = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getSessionToken();
      if (!token) { showToast?.('Sesi login habis', 'error'); return; }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-homepage-content`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await resp.json();
      if (data.success) {
        setBanners(data.banners || []);
        setCategories(data.categories || []);
      }
    } catch (e) {
      console.error('[HomepageContentPanel] fetch error:', e);
      showToast?.('Gagal memuat data: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  // ── Upload image ──
  const uploadImage = async (file, type) => {
    setUploading(true);
    try {
      const token = await getSessionToken();
      if (!token) { showToast?.('Sesi login habis', 'error'); return null; }

      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/upload-homepage-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd,
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || 'Upload gagal');
      return data.url;
    } catch (e) {
      showToast?.('Upload gagal: ' + e.message, 'error');
      return null;
    } finally {
      setUploading(false);
    }
  };

  // ── API call helper ──
  const apiCall = async (body) => {
    try {
      const token = await getSessionToken();
      if (!token) { showToast?.('Sesi login habis', 'error'); return null; }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-homepage-content`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || 'Operasi gagal');
      return data;
    } catch (e) {
      showToast?.(e.message, 'error');
      return null;
    }
  };

  // ── Banner handlers ──
  const handleAddBanner = async (imageUrl) => {
    const result = await apiCall({
      action: 'create_banner',
      image_url: imageUrl,
      title: '', subtitle: '', cta_text: '', cta_link_type: 'none', cta_link_value: '',
      is_active: true,
    });
    if (result) {
      setBanners((prev) => [...prev, result.banner]);
      showToast?.('Banner ditambahkan', 'success');
    }
  };

  const handleUpdateBanner = async (id, fields) => {
    const result = await apiCall({ action: 'update_banner', id, ...fields });
    if (result) {
      setBanners((prev) => prev.map((b) => b.id === id ? result.banner : b));
    }
  };

  const handleDeleteBanner = async (id) => {
    if (!confirm('Hapus banner ini?')) return;
    const result = await apiCall({ action: 'delete_banner', id });
    if (result) {
      setBanners((prev) => prev.filter((b) => b.id !== id));
      showToast?.('Banner dihapus', 'success');
    }
  };

  const handleReorderBanner = async (index, direction) => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= banners.length) return;
    const reordered = [...banners];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    // Update positions
    const items = reordered.map((b, i) => ({ id: b.id, position: i }));
    setBanners(reordered.map((b, i) => ({ ...b, position: i })));
    await apiCall({ action: 'reorder_banners', items });
  };

  // ── Category handlers ──
  const handleAddCategory = async (imageUrl, name, filterValue) => {
    const result = await apiCall({
      action: 'create_category',
      name, image_url: imageUrl, filter_value: filterValue,
      is_active: true,
    });
    if (result) {
      setCategories((prev) => [...prev, result.category]);
      showToast?.('Kategori ditambahkan', 'success');
    }
  };

  const handleUpdateCategory = async (id, fields) => {
    const result = await apiCall({ action: 'update_category', id, ...fields });
    if (result) {
      setCategories((prev) => prev.map((c) => c.id === id ? result.category : c));
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!confirm('Hapus kategori ini?')) return;
    const result = await apiCall({ action: 'delete_category', id });
    if (result) {
      setCategories((prev) => prev.filter((c) => c.id !== id));
      showToast?.('Kategori dihapus', 'success');
    }
  };

  const handleReorderCategory = async (index, direction) => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= categories.length) return;
    const reordered = [...categories];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    const items = reordered.map((c, i) => ({ id: c.id, position: i }));
    setCategories(reordered.map((c, i) => ({ ...c, position: i })));
    await apiCall({ action: 'reorder_categories', items });
  };

  // ========================================================================
  // RENDER
  // ========================================================================
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Tab switcher ── */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('banners')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${
            activeTab === 'banners' ? 'border-eglux-primary text-eglux-primary' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          📸 Banner / Swiper ({banners.length})
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${
            activeTab === 'categories' ? 'border-eglux-primary text-eglux-primary' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          🏷 Kategori Carousel ({categories.length})
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          BANNERS TAB
          ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'banners' && (
        <div className="space-y-4">

          {/* Upload new banner */}
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
            <label className="cursor-pointer inline-flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-eglux-accent flex items-center justify-center text-eglux-secondary">
                <IconUpload />
              </div>
              <span className="text-sm font-medium text-gray-600">
                {uploading ? '⏳ Mengupload...' : 'Upload Banner Baru'}
              </span>
              <span className="text-xs text-gray-400">JPG/PNG/WebP, max 5MB</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = await uploadImage(file, 'banner');
                    if (url) await handleAddBanner(url);
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {/* Banner list */}
          {banners.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">Belum ada banner. Upload banner pertama di atas.</p>
          ) : (
            <div className="space-y-4">
              {banners.map((banner, idx) => (
                <BannerCard
                  key={banner.id}
                  banner={banner}
                  index={idx}
                  total={banners.length}
                  uploading={uploading}
                  onUpdate={handleUpdateBanner}
                  onDelete={handleDeleteBanner}
                  onReorder={handleReorderBanner}
                  onUploadNewImage={async (file) => {
                    const url = await uploadImage(file, 'banner');
                    if (url) await handleUpdateBanner(banner.id, { image_url: url });
                    return url;
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          CATEGORIES TAB
          ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'categories' && (
        <div className="space-y-4">

          {/* Upload new category */}
          <CategoryUploader
            uploading={uploading}
            onUpload={uploadImage}
            onAdd={handleAddCategory}
          />

          {/* Category list */}
          {categories.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">Belum ada kategori. Tambahkan kategori pertama di atas.</p>
          ) : (
            <div className="space-y-4">
              {categories.map((cat, idx) => (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  index={idx}
                  total={categories.length}
                  uploading={uploading}
                  onUpdate={handleUpdateCategory}
                  onDelete={handleDeleteCategory}
                  onReorder={handleReorderCategory}
                  onUploadNewImage={async (file) => {
                    const url = await uploadImage(file, 'category');
                    if (url) await handleUpdateCategory(cat.id, { image_url: url });
                    return url;
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// BannerCard — single banner editor
// ============================================================================
const BannerCard = ({ banner, index, total, uploading, onUpdate, onDelete, onReorder, onUploadNewImage }) => {
  const [editing, setEditing] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Preview image + actions */}
      <div className="flex gap-4 p-4">
        <div className="relative w-32 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
          <img src={banner.image_url} alt="" className="w-full h-full object-cover" />
          <span className="absolute top-1 left-1 bg-black/60 text-white text-[0.6rem] px-1.5 py-0.5 rounded">
            #{index + 1}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {banner.title || '(Tanpa judul)'}
          </p>
          <p className="text-xs text-gray-400 truncate">
            {banner.subtitle || '(Tanpa subtitle)'}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              CTA: {banner.cta_link_type}
            </span>
            {banner.cta_link_value && (
              <span className="text-[0.65rem] text-gray-400 truncate">
                → {banner.cta_link_value}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1 flex-shrink-0">
          {/* Reorder */}
          <button
            onClick={() => onReorder(index, 'up')}
            disabled={index === 0}
            className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-30"
          >
            <IconArrowUp />
          </button>
          <button
            onClick={() => onReorder(index, 'down')}
            disabled={index === total - 1}
            className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-30"
          >
            <IconArrowDown />
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
        <button
          onClick={() => setEditing(!editing)}
          className="text-xs px-3 py-1.5 text-eglux-secondary border border-eglux-secondary/30 rounded-lg hover:bg-eglux-secondary/5 cursor-pointer"
        >
          {editing ? '▲ Tutup' : '✎ Edit Detail'}
        </button>

        <label className="text-xs px-3 py-1.5 text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 cursor-pointer">
          {uploading ? '⏳' : '🖼 Ganti Gambar'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await onUploadNewImage(file);
              e.target.value = '';
            }}
          />
        </label>

        {/* Active toggle */}
        <button
          onClick={() => onUpdate(banner.id, { is_active: !banner.is_active })}
          className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${
            banner.is_active
              ? 'bg-green-50 text-green-600 border-green-200'
              : 'bg-gray-100 text-gray-400 border-gray-200'
          }`}
        >
          {banner.is_active ? '● Active' : '○ Inactive'}
        </button>

        <button
          onClick={() => onDelete(banner.id)}
          className="ml-auto text-xs px-3 py-1.5 text-red-500 border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer flex items-center gap-1"
        >
          <IconTrash /> Hapus
        </button>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="px-4 py-4 border-t border-gray-100 space-y-3 bg-white">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Judul</label>
            <input
              type="text"
              defaultValue={banner.title || ''}
              onBlur={(e) => onUpdate(banner.id, { title: e.target.value })}
              placeholder="mis. Koleksi Dapur Premium"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Subtitle</label>
            <input
              type="text"
              defaultValue={banner.subtitle || ''}
              onBlur={(e) => onUpdate(banner.id, { subtitle: e.target.value })}
              placeholder="mis. Diskon hingga 30%"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tombol CTA</label>
              <input
                type="text"
                defaultValue={banner.cta_text || ''}
                onBlur={(e) => onUpdate(banner.id, { cta_text: e.target.value })}
                placeholder="mis. Belanja Sekarang"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tipe Link</label>
              <select
                defaultValue={banner.cta_link_type}
                onChange={(e) => onUpdate(banner.id, { cta_link_type: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary cursor-pointer"
              >
                <option value="none">— Tidak ada link —</option>
                <option value="filter">Filter Produk</option>
                <option value="product">Buka Produk</option>
                <option value="url">URL External</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Nilai Link
              <span className="text-gray-400 ml-1 font-normal">
                (filter: kitchen/storage/homedecor/bathroom/bestseller/produkbaru · product: UUID · url: https://...)
              </span>
            </label>
            <input
              type="text"
              defaultValue={banner.cta_link_value || ''}
              onBlur={(e) => onUpdate(banner.id, { cta_link_value: e.target.value })}
              placeholder="mis. kitchen"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// CategoryCard — single category editor
// ============================================================================
const CategoryCard = ({ category, index, total, uploading, onUpdate, onDelete, onReorder, onUploadNewImage }) => (
  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
    <div className="flex gap-4 p-4">
      <div className="relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
        <img src={category.image_url} alt="" className="w-full h-full object-cover" />
        <span className="absolute top-1 left-1 bg-black/60 text-white text-[0.6rem] px-1.5 py-0.5 rounded">
          #{index + 1}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <input
          type="text"
          defaultValue={category.name}
          onBlur={(e) => onUpdate(category.id, { name: e.target.value })}
          placeholder="Nama kategori"
          className="w-full px-2 py-1 text-sm font-semibold text-gray-900 border border-transparent rounded hover:border-gray-200 focus:border-eglux-secondary outline-none"
        />
        <input
          type="text"
          defaultValue={category.filter_value}
          onBlur={(e) => onUpdate(category.id, { filter_value: e.target.value })}
          placeholder="filter value (mis. kitchen)"
          className="w-full px-2 py-1 mt-1 text-xs text-gray-500 border border-transparent rounded hover:border-gray-200 focus:border-eglux-secondary outline-none"
        />
        <p className="text-[0.65rem] text-gray-400 mt-1">Klik gambar di homepage → filter produk by nilai ini</p>
      </div>

      <div className="flex flex-col gap-1 flex-shrink-0">
        <button
          onClick={() => onReorder(index, 'up')}
          disabled={index === 0}
          className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-30"
        >
          <IconArrowUp />
        </button>
        <button
          onClick={() => onReorder(index, 'down')}
          disabled={index === total - 1}
          className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-30"
        >
          <IconArrowDown />
        </button>
      </div>
    </div>

    <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
      <label className="text-xs px-3 py-1.5 text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 cursor-pointer">
        {uploading ? '⏳' : '🖼 Ganti Gambar'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={uploading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await onUploadNewImage(file);
            e.target.value = '';
          }}
        />
      </label>

      <button
        onClick={() => onUpdate(category.id, { is_active: !category.is_active })}
        className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${
          category.is_active
            ? 'bg-green-50 text-green-600 border-green-200'
            : 'bg-gray-100 text-gray-400 border-gray-200'
        }`}
      >
        {category.is_active ? '● Active' : '○ Inactive'}
      </button>

      <button
        onClick={() => onDelete(category.id)}
        className="ml-auto text-xs px-3 py-1.5 text-red-500 border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer flex items-center gap-1"
      >
        <IconTrash /> Hapus
      </button>
    </div>
  </div>
);

// ============================================================================
// CategoryUploader — upload new category with name + filter
// ============================================================================
const CategoryUploader = ({ uploading, onUpload, onAdd }) => {
  const [name, setName] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');

  const handleSubmit = async () => {
    if (!file || !name || !filterValue) return;
    const url = await onUpload(file, 'category');
    if (url) {
      await onAdd(url, name, filterValue);
      setName('');
      setFilterValue('');
      setFile(null);
      setPreview('');
    }
  };

  return (
    <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-6">
      <p className="text-sm font-semibold text-gray-700 mb-4">+ Tambah Kategori Baru</p>
      <div className="flex gap-4">
        {/* Image preview / upload */}
        <div className="flex-shrink-0">
          {preview ? (
            <div className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-gray-200">
              <img src={preview} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => { setFile(null); setPreview(''); }}
                className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[0.6rem] cursor-pointer border-none"
              >✕</button>
            </div>
          ) : (
            <label className="block w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 cursor-pointer hover:border-blue-400 flex flex-col items-center justify-center bg-white">
              <span className="text-xl text-gray-300">+</span>
              <span className="text-[0.6rem] text-gray-400 mt-1">Upload</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setFile(f); setPreview(URL.createObjectURL(f)); }
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>

        {/* Name + filter inputs */}
        <div className="flex-1 space-y-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama kategori (mis. Kitchen)"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
          />
          <input
            type="text"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            placeholder="Filter value (mis. kitchen)"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
          />
          <p className="text-[0.65rem] text-gray-400">
            Filter value harus match dengan kategori produk: kitchen, storage, homedecor, bathroom
          </p>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!file || !name || !filterValue || uploading}
        className="mt-4 px-5 py-2 text-sm font-semibold text-white bg-eglux-primary rounded-lg hover:opacity-90 cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? '⏳ Menyimpan...' : '+ Tambah Kategori'}
      </button>
    </div>
  );
};

export default HomepageContentPanel;
