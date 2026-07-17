// src/utils/compressImage.js
//
// Compress & resize gambar di sisi browser SEBELUM di-upload ke server.
// Tujuannya: foto dari HP yang aslinya 3-8MB dikecilin jadi ~100-300KB
// tanpa kualitas visual yang keliatan turun drastis untuk foto produk.
//
// Cara pakai:
//   const compressedFile = await compressImage(originalFile);
//   // lalu upload compressedFile seperti biasa

export function compressImage(file, options = {}) {
  const {
    maxWidth = 1200,      // lebar maksimal (px) — cukup buat foto produk web
    maxHeight = 1200,
    quality = 0.8,        // 0-1, semakin rendah semakin kecil ukurannya
    outputType = 'image/webp', // webp jauh lebih kecil dari jpg/png di ukuran sama
  } = options;

  return new Promise((resolve, reject) => {
    // Kalau bukan gambar (misal GIF animasi), jangan dikompres — return apa adanya
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Hitung dimensi baru, jaga aspect ratio
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Gagal compress gambar'));
            return;
          }
          // Bungkus Blob jadi File lagi supaya nama file tetap ada
          const compressedFile = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, '.webp'),
            { type: outputType }
          );
          resolve(compressedFile);
        },
        outputType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Gagal load gambar untuk compress'));
    };

    img.src = objectUrl;
  });
}