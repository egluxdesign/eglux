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