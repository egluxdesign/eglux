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
      <HeaderProducts onCartOpen={openCart} />

      <main>
        <OrdersList />
      </main>

      <Footer />
    </>
  );
};

export default OrdersPage;