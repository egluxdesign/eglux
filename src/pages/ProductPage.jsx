// src/pages/ProductPage.jsx
import { useState, useCallback } from 'react';
import { useCartActions }        from './CartPage';
import HeaderProducts            from '../components/layout/HeaderProducts';
import DuplicateNav              from '../components/layout/DuplicateNav';
import Footer                    from '../components/layout/Footer';
import ProductsSection           from '../components/sections/ProductPage/ProductsSection';
import ProductModal              from '../components/ui/ProductModal';

const ProductPage = () => {
  const { openCart, handleAddToCart, handleCheckoutNow } = useCartActions();
  const [modalProduct, setModalProduct] = useState(null);

  const openModal = useCallback((product) => {
    setModalProduct(product);
    document.body.style.overflow = 'hidden';
  }, []);

  const closeModal = useCallback(() => {
    setModalProduct(null);
    document.body.style.overflow = '';
  }, []);

  return (
    <>
      <HeaderProducts onCartOpen={openCart} />
      <div
        className="pt-[120px] pb-12 text-center"
        style={{ background: 'linear-gradient(135deg, #faf8f5 0%, #f5f0e8 100%)' }}
      >
        <div className="max-w-container mx-auto px-8">
          <h1 className="text-[3rem] md:text-[2rem] font-bold text-eglux-primary mb-2">
            Koleksi Produk
          </h1>
          <p className="text-[#666] text-[1.1rem]">
            Temukan produk rumah tangga berkualitas untuk kehidupan yang lebih baik
          </p>
        </div>
      </div>
      <main>
        <DuplicateNav />
        <ProductsSection onOpenModal={openModal} />
      </main>
      <Footer />
      {modalProduct && (
        <ProductModal
          product={modalProduct}
          onClose={closeModal}
          onAddToCart={handleAddToCart}
          onCheckoutNow={handleCheckoutNow}
        />
      )}
    </>
  );
};

export default ProductPage;