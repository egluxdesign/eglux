import React from 'react';
import { useCartActions }  from './CartPage';
import HeaderProducts from "../components/layout/HeaderProducts";
import Footer from "../components/layout/Footer";
import DuplicateNav from "../components/layout/DuplicateNav";

import AffiliateHero from "../components/sections/AffiliatePage/AffiliateHero";
import HowItWorks from "../components/sections/AffiliatePage/HowItWorks";
import BenefitsSection from "../components/sections/AffiliatePage/BenefitsSection";
import CommissionSection from "../components/sections/AffiliatePage/CommissionSection";
import JoinSection from "../components/sections/AffiliatePage/JoinSection";
import FAQSection from "../components/sections/AffiliatePage/FAQSection";

import '../assets/styles/affiliate.css';
import '../assets/styles/globals.css';

export default function AffiliatePage() {
  const { openCart } = useCartActions();
  return (
    <>
      <HeaderProducts onCartOpen={openCart} />
      
      {/* Primary Nav — biasanya di dalam HeaderProducts, tapi kalau terpisah: */}
      {/* <PrimaryNav activeLink="affiliate" /> */}

      <main>
        <AffiliateHero />
        
        {/* Countries Footer (tagline bar) */}
        <div
          style={{
            background: "#cba65a",
            padding: "1rem 2rem",
            textAlign: "center",
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <p
            style={{
              color: "#ffffff",
              fontSize: "0.7rem",
              letterSpacing: "2px",
              textTransform: "uppercase",
              wordSpacing: "8px",
              margin: 0,
            }}
          >
            Jadikan Jaringan Anda Sumber Penghasilan Bersama Eglux
          </p>
        </div>

        <DuplicateNav activeLink="affiliate" />
        
        <HowItWorks />
        <BenefitsSection />
        <CommissionSection />
        <JoinSection />
        <FAQSection />
      </main>

      <Footer />
    </>
  );
}