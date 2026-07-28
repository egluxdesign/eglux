// src/pages/TicketsPage.jsx
// ============================================================================
// TicketsPage — Full page wrapper untuk TicketModal
// Route: /tickets
// ============================================================================

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import { useCartActions } from './CartPage';
import TicketModal from '../components/ui/TicketModal';

const TicketsPage = () => {
  const { openCart } = useCartActions();
  const [searchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(true);

  // Kalau ada ?order=<id> di URL, modal terbuka dengan order context
  const orderId = searchParams.get('order');

  const handleClose = () => {
    setModalOpen(false);
    // Navigate back ke page sebelumnya (atau ke /orders)
    window.history.back();
  };

  return (
    <>
      <HeaderProducts onCartOpen={openCart} forceScrolled />

      {/* TicketModal — render sebagai full screen overlay */}
      <TicketModal
        isOpen={modalOpen}
        onClose={handleClose}
        orderId={orderId}
      />

      <Footer />
    </>
  );
};

export default TicketsPage;
