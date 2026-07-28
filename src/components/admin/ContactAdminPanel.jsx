// src/components/admin/ContactAdminPanel.jsx
// ============================================================================
// ContactAdminPanel — Edit Contact page (info, map, FAQ)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const ContactAdminPanel = ({ showToast }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState({
    address: '',
    phone: '',
    email: '',
    operating_hours: '',
    map_embed_url: '',
    faq: [],
  });

  const fetchContent = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-contact`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get' }),
      });
      const result = await resp.json();
      if (result.success && result.content) {
        const c = result.content;
        const parseJSON = (val) => {
          if (!val) return [];
          if (Array.isArray(val)) return val;
          try { return JSON.parse(val); } catch { return []; }
        };
        setContent({
          address: c.address || '',
          phone: c.phone || '',
          email: c.email || '',
          operating_hours: c.operating_hours || '',
          map_embed_url: c.map_embed_url || '',
          faq: parseJSON(c.faq),
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

  // FAQ helpers
  const addFaq = () => update('faq', [...content.faq, { question: '', answer: '' }]);
  const updateFaq = (idx, field, value) => {
    const next = [...content.faq];
    next[idx] = { ...next[idx], [field]: value };
    update('faq', next);
  };
  const removeFaq = (idx) => update('faq', content.faq.filter((_, i) => i !== idx));

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) { showToast?.('Sesi login habis', 'error'); return; }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-contact`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', ...content }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error);

      showToast?.('✓ Konten Contact page disimpan', 'success');
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
      {/* === Contact Info === */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Informasi Kontak</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
          <textarea value={content.address} onChange={e => update('address', e.target.value)} rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telepon / WhatsApp</label>
            <input type="text" value={content.phone} onChange={e => update('phone', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="text" value={content.email} onChange={e => update('email', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Jam Operasional</label>
          <input type="text" value={content.operating_hours} onChange={e => update('operating_hours', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" />
        </div>
      </section>

      {/* === Map Embed === */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Google Maps Embed</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Map Embed URL <span className="text-gray-400">(src dari iframe Google Maps)</span></label>
          <textarea value={content.map_embed_url} onChange={e => update('map_embed_url', e.target.value)} rows={3}
            placeholder="https://www.google.com/maps/embed?pb=..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md resize-none font-mono text-xs" />
          <p className="text-xs text-gray-400 mt-1">
            Buka Google Maps → cari lokasi → Share → Embed a map → copy bagian <code>src="..."</code> → paste URL-nya di sini.
          </p>
        </div>
        {content.map_embed_url && (
          <div className="mt-2">
            <p className="text-xs text-gray-500 mb-1">Preview:</p>
            <iframe src={content.map_embed_url} width="100%" height="200" style={{ border: 0 }}
              className="rounded-lg" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
        )}
      </section>

      {/* === FAQ === */}
      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">FAQ</h3>
          <button type="button" onClick={addFaq} className="text-xs font-semibold text-eglux-secondary hover:underline cursor-pointer border-none bg-transparent">+ Tambah FAQ</button>
        </div>
        <div className="space-y-3">
          {content.faq.map((item, idx) => (
            <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">FAQ #{idx + 1}</span>
                <button type="button" onClick={() => removeFaq(idx)} className="w-6 h-6 text-xs text-red-500 hover:bg-red-50 rounded cursor-pointer border-none bg-transparent">✕</button>
              </div>
              <input type="text" value={item.question || ''} onChange={e => updateFaq(idx, 'question', e.target.value)}
                placeholder="Pertanyaan"
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded" />
              <textarea value={item.answer || ''} onChange={e => updateFaq(idx, 'answer', e.target.value)}
                placeholder="Jawaban" rows={3}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded resize-none" />
            </div>
          ))}
          {content.faq.length === 0 && <p className="text-xs text-gray-400 italic">Belum ada FAQ. Klik "+ Tambah FAQ" untuk menambah.</p>}
        </div>
      </section>

      {/* === Save === */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-5 px-5 py-3 flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2.5 text-sm font-bold text-white bg-eglux-primary rounded-md hover:opacity-90 disabled:opacity-50 cursor-pointer">
          {saving ? '⏳ Menyimpan...' : '💾 Simpan Perubahan'}
        </button>
      </div>
    </div>
  );
};

export default ContactAdminPanel;
