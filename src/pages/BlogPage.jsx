// src/pages/BlogPage.jsx
// ============================================================================
// BlogPage — Display blog articles from Supabase DB (blog_posts table)
// ============================================================================
// Changes from old version:
//   - Fetch dari Supabase DB (sebelumnya dari Google Apps Script)
//   - Header pakai forceScrolled (sama seperti /orders, /track)
//   - Top padding pt-24 supaya gak ketutup header
//   - List view + Detail view (hash-based routing)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import { useCartActions } from './CartPage';
import { supabase } from '../lib/supabaseClient';
import { friendlyErrorMessage } from '../lib/errorMessage';

// ── Helpers ──
function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
    }).format(new Date(iso));
  } catch { return iso; }
}

function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

const BlogPage = () => {
  const { openCart } = useCartActions();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);

  // ── Fetch published blog posts from DB ──
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, content, cover_image_url, category, tags, author_name, published_at, created_at')
        .eq('is_published', true)
        .order('published_at', { ascending: false, nullsFirst: false });

      if (fetchErr) throw fetchErr;
      setPosts(data || []);
    } catch (e) {
      setError(friendlyErrorMessage(e, 'Memuat artikel'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // ── Hash-based routing: #detail/<id> ──
  useEffect(() => {
    if (posts.length === 0) return;

    function handleHash() {
      const hash = window.location.hash;
      if (hash.startsWith('#detail/')) {
        const id = hash.replace('#detail/', '');
        const post = posts.find((p) => String(p.id) === id);
        if (post) setSelectedPost(post);
      } else {
        setSelectedPost(null);
      }
    }

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [posts]);

  function openDetail(post) {
    window.location.hash = `detail/${post.id}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setSelectedPost(post);
  }

  function backToList() {
    window.location.hash = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setSelectedPost(null);
  }

  return (
    <>
      {/* ⭐ forceScrolled — header selalu putih (gak ada hero section di page ini) */}
      <HeaderProducts onCartOpen={openCart} forceScrolled />

      {/* === DETAIL VIEW === */}
      {selectedPost && (
        <article className="max-w-3xl mx-auto px-4 md:px-6 pt-24 md:pt-28 pb-12">
          {/* Back button */}
          <button
            onClick={backToList}
            className="flex items-center gap-1.5 text-sm text-eglux-secondary font-semibold hover:underline cursor-pointer bg-transparent border-none mb-6"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Kembali ke Blog
          </button>

          {/* Cover image */}
          {selectedPost.cover_image_url && (
            <img
              src={selectedPost.cover_image_url}
              alt={selectedPost.title}
              className="w-full h-48 md:h-72 object-cover rounded-xl mb-6"
            />
          )}

          {/* Article header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-eglux-accent text-eglux-secondary text-[0.7rem] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full">
                {selectedPost.category || 'Umum'}
              </span>
              <span className="text-xs text-gray-400">{formatDate(selectedPost.published_at || selectedPost.created_at)}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-eglux-primary leading-tight mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
              {selectedPost.title}
            </h1>
            <p className="text-sm text-gray-500">oleh {selectedPost.author_name || 'EGLUX'}</p>
            {selectedPost.tags && selectedPost.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {selectedPost.tags.map((tag, idx) => (
                  <span key={idx} className="text-[0.7rem] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">#{tag}</span>
                ))}
              </div>
            )}
          </div>

          {/* Article content (HTML) */}
          <div
            className="prose prose-sm md:prose-base max-w-none text-gray-700 leading-relaxed
              [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-eglux-primary [&_h2]:mt-6 [&_h2]:mb-3
              [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-eglux-primary [&_h3]:mt-5 [&_h3]:mb-2
              [&_p]:mb-4 [&_p]:leading-relaxed
              [&_img]:rounded-xl [&_img]:my-4
              [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4
              [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4
              [&_blockquote]:border-l-4 [&_blockquote]:border-eglux-secondary [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600
              [&_a]:text-eglux-secondary [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: selectedPost.content }}
          />

          {/* Share / back */}
          <div className="border-t border-gray-200 mt-8 pt-6 flex items-center justify-between">
            <button
              onClick={backToList}
              className="flex items-center gap-1.5 text-sm text-eglux-secondary font-semibold hover:underline cursor-pointer bg-transparent border-none"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Kembali ke Blog
            </button>
          </div>
        </article>
      )}

      {/* === LIST VIEW === */}
      {!selectedPost && (
        <section className="max-w-5xl mx-auto px-4 md:px-6 pt-24 md:pt-28 pb-12">
          {/* Page header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-eglux-primary mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
              Blog EGLUX
            </h1>
            <p className="text-sm text-gray-500">Tips, inspirasi, dan informasi produk rumah tangga berkualitas</p>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <button onClick={fetchPosts} className="mt-2 text-xs text-red-700 font-semibold hover:underline">Coba lagi</button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && posts.length === 0 && (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">📝</div>
              <p className="text-gray-500 font-medium mb-1">Belum ada artikel</p>
              <p className="text-sm text-gray-400">Artikel blog akan muncul di sini setelah dipublish oleh admin.</p>
              <Link to="/" className="inline-block mt-5 px-6 py-2.5 bg-eglux-primary text-white rounded-xl text-sm font-bold hover:opacity-90">
                Kembali ke Beranda
              </Link>
            </div>
          )}

          {/* Posts grid */}
          {!loading && !error && posts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post) => (
                <article
                  key={post.id}
                  onClick={() => openDetail(post)}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden cursor-pointer hover:shadow-lg hover:border-eglux-secondary/30 transition-all group"
                >
                  {/* Cover image */}
                  {post.cover_image_url ? (
                    <div className="aspect-[16/10] overflow-hidden bg-gray-100">
                      <img
                        src={post.cover_image_url}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="aspect-[16/10] bg-eglux-accent flex items-center justify-center">
                      <span className="text-3xl">📝</span>
                    </div>
                  )}

                  {/* Content */}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-eglux-accent text-eglux-secondary text-[0.6rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">
                        {post.category || 'Umum'}
                      </span>
                      <span className="text-[0.7rem] text-gray-400">{formatDate(post.published_at || post.created_at)}</span>
                    </div>
                    <h2 className="text-sm font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-eglux-secondary transition-colors">
                      {post.title}
                    </h2>
                    <p className="text-xs text-gray-500 line-clamp-2 mb-3">
                      {post.excerpt || stripHtml(post.content).slice(0, 120) + '...'}
                    </p>
                    <p className="text-[0.7rem] text-gray-400">oleh {post.author_name || 'EGLUX'}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <Footer />
    </>
  );
};

export default BlogPage;
