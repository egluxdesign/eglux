import React from 'react';
import HeaderProducts from '../components/layout/HeaderProducts';
import DuplicateNav from '../components/layout/DuplicateNav';
import Footer from '../components/layout/Footer';
import PageHeader from '../components/sections/ContactPage/PageHeader';
import ContactSection from '../components/sections/ContactPage/ContactSection';
import FAQSection from '../components/sections/ContactPage/FAQSection';
import MapSection from '../components/sections/ContactPage/MapSection';

import '../assets/styles/contact.css';
import '../assets/styles/globals.css';

const Contact = () => {
  return (
    <>
      <HeaderProducts />
      <PageHeader />
      <DuplicateNav />
      <main>
        <ContactSection />
        <MapSection />
        <FAQSection />
      </main>
      <Footer />
    </>
  );
};

export default Contact;