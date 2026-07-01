import BlogCard from './BlogCard';

function SkeletonGrid() {
  return (
    <div className="skeleton-grid">
      {[0, 1, 2].map((i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton-image" />
          <div className="skeleton-text">
            <div className="skeleton-line short" />
            <div className="skeleton-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BlogList({ posts, loading, error, onSelect }) {
  if (loading) return <SkeletonGrid />;

  if (error) {
    return (
      <div className="error-state">
        <h3>Gagal memuat artikel</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📝</div>
        <h3>Belum ada artikel</h3>
        <p>Tambahkan data di Google Sheet untuk menampilkan artikel.</p>
      </div>
    );
  }

  return (
    <div className="list-grid">
      {posts.map((post) => (
        <BlogCard key={post.id} post={post} onClick={() => onSelect(post)} />
      ))}
    </div>
  );
}