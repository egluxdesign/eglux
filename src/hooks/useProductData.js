// src/hooks/useProductData.js
import { useState, useEffect } from 'react';
import { FALLBACK_VARIANTS } from '../data/products';

const GAS_URL = import.meta.env.VITE_GAS_URL_PRODUCT; // ✅ dari .env

export const getFallbackVariants = (productName) => {
  const lower = productName.toLowerCase();
  for (const [key, list] of Object.entries(FALLBACK_VARIANTS)) {
    if (lower.includes(key)) return list.map((v) => ({ name: v, price: null }));
  }
  return FALLBACK_VARIANTS['default'].map((v) => ({ name: v, price: null }));
};

const useProductData = () => {
  const [gasData,   setGasData]   = useState({});
  const [gasLoaded, setGasLoaded] = useState(false);

  useEffect(() => {
    if (!GAS_URL) return; // belum dikonfigurasi — pakai fallback
    const load = async () => {
      try {
        const res  = await fetch(GAS_URL);
        const json = await res.json();
        if (json.status === 'ok') {
          setGasData(json.data);
          setGasLoaded(true);
        }
      } catch {
        console.warn('GAS tidak terhubung, menggunakan mode fallback.');
      }
    };
    load();
  }, []);

  const getVariants = (productName) => {
    if (gasLoaded && gasData[productName]) return gasData[productName].variants;
    return getFallbackVariants(productName);
  };

  return { getVariants, gasLoaded };
};

export default useProductData;