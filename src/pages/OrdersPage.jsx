// src/pages/OrdersPage.jsx
import React from 'react';
import { useCartActions } from './CartPage';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import OrdersList from '../components/sections/OrdersPage/OrdersList';

const OrdersPage = () => {
  const { openCart } = useCartActions();
  return (
    <>
      {/* ⭐ forceScrolled — header selalu putih, gak transparan */}
      <HeaderProducts onCartOpen={openCart} forceScrolled />

      <main>
        <OrdersList />
      </main>

      <Footer />
    </>
  );
};

export default OrdersPage;