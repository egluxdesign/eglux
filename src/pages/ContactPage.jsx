// src/pages/ContactPage.jsx
// ============================================================================
// Contact Page — Info+Map (1 section, 2 column) + FAQ
// Header pakai forceScrolled
// ============================================================================

import React from 'react';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import { useCartActions } from './CartPage';
import ContactSection from '../components/sections/ContactPage/ContactSection';
import FAQSection from '../components/sections/ContactPage/FAQSection';

import '/src/assets/styles/contact.css';
import '/src/assets/styles/globals.css';

const Contact = () => {
  const { openCart } = useCartActions();

  return (
    <>
      <HeaderProducts onCartOpen={openCart} forceScrolled />

      <main style={{ paddingTop: '5rem' }}>
        {/* ContactSection — Info kontak (kiri) + Map (kanan), 2 column */}
        <ContactSection />
        <FAQSection />
      </main>

      <Footer />
    </>
  );
};

export default Contact;
