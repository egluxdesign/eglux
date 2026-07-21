// src/pages/PrivacyPage.jsx
import React from 'react';
import { useCartActions } from './CartPage';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import PrivacyContent from '../components/sections/PrivacyPage/PrivacyContent';

const PrivacyPage = () => {
  const { openCart } = useCartActions();
  return (
    <>
      <HeaderProducts onCartOpen={openCart} />
      <main>
        <PrivacyContent />
      </main>
      <Footer />
    </>
  );
};

export default PrivacyPage;