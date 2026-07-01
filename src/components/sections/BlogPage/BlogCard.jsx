// src/components/sections/BlogPage/BlogCard.jsx
import { useBlogMedia } from '../../../hooks/useBlogMedia';

export default function BlogCard({ post, onClick }) {
  const { coverPhoto, loading } = useBlogMedia(post.slug);

  return (
    <div className="blog-preview-card" onClick={onClick}>
      <div className="preview-image">
        {!loading && coverPhoto ? (
          <img
            src={coverPhoto}
            alt={post.title}
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <span>🖼️</span>
        )}
      </div>
      <div className="preview-content">
        <div className="preview-meta">
          <span className="meta-date">{post.date ?? ''}</span>
          {post.time && <span>{post.time}</span>}
        </div>
        <div className="preview-title">{post.title}</div>
      </div>
    </div>
  );
}