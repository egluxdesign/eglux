// src/pages/TermsPage.jsx
import React from 'react';
import { useCartActions } from './CartPage';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import TermsContent from '../components/sections/TermsPage/TermsContent';

const TermsPage = () => {
  const { openCart } = useCartActions();
  return (
    <>
      <HeaderProducts onCartOpen={openCart} />
      <main>
        <TermsContent />
      </main>
      <Footer />
    </>
  );
};

export default TermsPage;