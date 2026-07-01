import { useState, useEffect } from 'react';

import HeaderProducts from '../components/layout/HeaderProducts';
import DuplicateNav   from '../components/layout/DuplicateNav';
import Footer         from '../components/layout/Footer';
import { useCartActions } from './CartPage';

import BlogHero   from '../components/sections/BlogPage/BlogHero';
import BlogList   from '../components/sections/BlogPage/BlogList';
import BlogDetail from '../components/sections/BlogPage/BlogDetail';

import { useBlogPosts } from '../hooks/useBlogPosts.js';
import '../assets/styles/blog.css';
import '../assets/styles/globals.css';

export default function BlogPage() {
  const { openCart } = useCartActions();
  const { posts, loading, error } = useBlogPosts();
  const [selectedPost, setSelectedPost] = useState(null);

  // Sync URL hash (#detail/<id>) ke state
  useEffect(() => {
    if (posts.length === 0) return;

    function handleHash() {
      const hash = window.location.hash;
      if (hash.startsWith('#detail/')) {
        const id   = hash.replace('#detail/', '');
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
      <HeaderProducts onCartOpen={openCart} />

      {!selectedPost && <BlogHero />}

      <DuplicateNav activePage="blog" />

      {selectedPost ? (
        <BlogDetail post={selectedPost} onBack={backToList} />
      ) : (
        <section className="blog-list">
          <div className="container">
            <BlogList
              posts={posts}
              loading={loading}
              error={error}
              onSelect={openDetail}
            />
          </div>
        </section>
      )}

      <Footer />
    </>
  );
}