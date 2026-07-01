// src/hooks/useBlogMedia.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const BUCKET_NAME = 'blog-media';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.avi'];

function isVideo(filename) {
  const lower = filename.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function getPublicUrl(slug, filename) {
  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(`${slug}/${filename}`);
  return data.publicUrl;
}

/**
 * Fetch & kategorikan media (cover, gallery, video) dari folder {slug}
 * berdasarkan prefix nama file:
 *   - "cover*"  -> coverPhoto
 *   - "photo*"  -> galleryPhotos
 *   - .mp4/.mov/.webm -> video
 */
export function useBlogMedia(slug) {
  const [media, setMedia]     = useState({ coverPhoto: null, galleryPhotos: [], videoUrl: null });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadMedia() {
      setLoading(true);
      setError(null);

      try {
        const { data: files, error: listError } = await supabase.storage
          .from(BUCKET_NAME)
          .list(slug, { sortBy: { column: 'name', order: 'asc' } });

        if (listError) throw listError;

        if (!isMounted) return;

        if (!files || files.length === 0) {
          setMedia({ coverPhoto: null, galleryPhotos: [], videoUrl: null });
          setLoading(false);
          return;
        }

        let coverPhoto = null;
        const galleryPhotos = [];
        let videoUrl = null;

        for (const file of files) {
          const name = file.name;
          if (!name) continue;

          if (isVideo(name)) {
            videoUrl = getPublicUrl(slug, name);
            continue;
          }

          const lowerName = name.toLowerCase();
          if (lowerName.startsWith('cover')) {
            coverPhoto = getPublicUrl(slug, name);
          } else {
            galleryPhotos.push(getPublicUrl(slug, name));
          }
        }

        // Fallback: kalau tidak ada file dengan prefix "cover",
        // pakai foto pertama di galeri sebagai cover
        if (!coverPhoto && galleryPhotos.length > 0) {
          coverPhoto = galleryPhotos.shift();
        }

        setMedia({ coverPhoto, galleryPhotos, videoUrl });
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Gagal memuat media');
          setMedia({ coverPhoto: null, galleryPhotos: [], videoUrl: null });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadMedia();

    return () => { isMounted = false; };
  }, [slug]);

  return { ...media, loading, error };
}