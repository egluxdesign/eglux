// src/pages/OrdersPage.jsx
import React from 'react';
import { useCartActions } from './CartPage';
import HeaderProducts from '../components/layout/HeaderProducts';
import OrdersList from '../components/sections/OrdersPage/OrdersList';

const OrdersPage = () => {
  const { openCart } = useCartActions();
  return (
    <div className="section-full-mobile w-full">
      {/* Wrapper ini yang bikin behavior beda mobile vs desktop.
          Mobile: dikunci 100dvh (Header+main = 1 layar penuh, Footer discroll).
          Desktop: jadi display:contents (transparan), Header+main+Footer
          sejajar langsung di dalam .section-full-mobile yang 100dvh. */}
      <div className="mobile-viewport-group">
        {/* ⭐ forceScrolled — header selalu putih, gak transparan */}
        <HeaderProducts onCartOpen={openCart} forceScrolled />
 
        <main className="section-mobile">
          <OrdersList />
        </main>
      </div>
    </div>
  );
};

export default OrdersPage;