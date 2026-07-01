// src/components/sections/BlogPage/BlogDetail.jsx
import { useBlogMedia } from '../../../hooks/useBlogMedia';

export default function BlogDetail({ post, onBack }) {
  if (!post) return null;

  const { coverPhoto, galleryPhotos, videoUrl, loading: mediaLoading } = useBlogMedia(post.slug);

  const paragraphs = post.content
    ? String(post.content).split('\n').filter((p) => p.trim())
    : [];

  return (
    <section className="blog-detail">
      <div className="container">
        <button className="back-btn" onClick={onBack}>
          ← Kembali ke Blog
        </button>

        <article className="article-full">

          {/* Header */}
          <div className="article-header">
            <div className="article-meta">
              <span className="meta-date">📅 {post.date ?? ''}</span>
              {post.time && <span>🕐 {post.time}</span>}
              <span>👤 {post.author ?? 'Tim Eglux'}</span>
            </div>
            <h2>{post.title}</h2>
          </div>

          {/* Cover photo */}
          {!mediaLoading && coverPhoto && (
            <div className="article-cover">
              <img
                src={coverPhoto}
                alt={post.title}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.parentElement.textContent = '🖼️ Gagal memuat gambar';
                }}
              />
            </div>
          )}

          {/* Konten artikel */}
          {paragraphs.length > 0 && (
            <div className="article-body">
              {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          )}

          {/* Media Grid: Video (kiri) + Gallery (kanan) */}
          {(videoUrl || galleryPhotos.length > 0) && !mediaLoading && (
            <div className="article-media-grid">

              {/* Video — kolom kiri, span 3 baris */}
              {videoUrl && (
                <div className="video-player">
                  <video
                    src={videoUrl}
                    controls
                    preload="metadata"
                    title={`Video: ${post.title}`}
                  />
                </div>
              )}

              {/* Gallery — kolom kanan, 3 foto stacked */}
              {galleryPhotos.length > 0 && (
                <div className="article-gallery">
                  {galleryPhotos.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Foto ${i + 2}`}
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ))}
                </div>
              )}

            </div>
          )}

        </article>
      </div>
    </section>
  );
}