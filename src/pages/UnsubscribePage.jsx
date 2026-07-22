// src/pages/UnsubscribePage.jsx
// ============================================================================
// UnsubscribePage — Halaman untuk unsubscribe newsletter
// ============================================================================
// URL: /unsubscribe?token=<subscriber_id>&email=<email>
// User klik "Unsubscribe" link di email → landing page ini → confirm → done
// ============================================================================

import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import { supabase } from '../lib/supabaseClient';

const UnsubscribePage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Auto-confirm kalau token + email ada di URL
    if (!token || !email) return;

    const doUnsubscribe = async () => {
      setStatus('loading');
      try {
        const { data, error } = await supabase.functions.invoke('unsubscribe-newsletter', {
          body: { token, email },
        });

        if (error) throw new Error(error.message);
        if (!data?.success) throw new Error(data?.error || 'Gagal unsubscribe');

        setStatus('success');
        setMessage(data.message);
      } catch (e) {
        setStatus('error');
        setMessage(e.message?.includes('Failed to fetch')
          ? 'Gagal terhubung ke server. Coba lagi.'
          : e.message);
      }
    };

    doUnsubscribe();
  }, [token, email]);

  return (
    <>
      <HeaderProducts />

      <div className="max-w-lg mx-auto px-4 py-16 md:py-24 text-center">
        {status === 'idle' && (
          <>
            <div className="text-5xl mb-4">📧</div>
            <h1 className="text-2xl font-bold text-eglux-primary mb-3">Unsubscribe Newsletter</h1>
            <p className="text-gray-500 mb-6">
              Link unsubscribe tidak valid. Pastikan kamu membuka link dari email newsletter EGLUX.
            </p>
          </>
        )}

        {status === 'loading' && (
          <>
            <div className="flex justify-center mb-4">
              <div className="w-10 h-10 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-eglux-primary mb-2">Memproses...</h1>
            <p className="text-gray-500">Sedang unsubscribe email kamu</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-5xl mb-4">✓</div>
            <h1 className="text-2xl font-bold text-eglux-primary mb-3">Berhasil Unsubscribe</h1>
            <p className="text-gray-500 mb-2">{message}</p>
            <p className="text-sm text-gray-400 mb-8">
              Email <strong className="text-gray-600">{email}</strong> tidak akan menerima newsletter EGLUX lagi.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link
                to="/products"
                className="inline-block px-6 py-2.5 bg-eglux-primary text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Tetap Belanja
              </Link>
              <a
                href="mailto:support@eglux.co.id?subject=Unsubscribe Feedback"
                className="inline-block px-6 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Beri Feedback
              </a>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-5xl mb-4">⚠</div>
            <h1 className="text-2xl font-bold text-red-500 mb-3">Gagal Unsubscribe</h1>
            <p className="text-gray-500 mb-6">{message}</p>
            <Link
              to="/"
              className="inline-block px-6 py-2.5 bg-eglux-primary text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Kembali ke Beranda
            </Link>
          </>
        )}
      </div>

      <Footer />
    </>
  );
};

export default UnsubscribePage;
