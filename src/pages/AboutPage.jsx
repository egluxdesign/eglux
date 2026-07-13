import React from 'react';
import { useCartActions }  from './CartPage';
import HeaderProducts from '../components/layout/HeaderProducts';
import DuplicateNav from '../components/layout/DuplicateNav';
import Footer from '../components/layout/Footer';
// import AboutHero from '../components/sections/AboutPage/AboutHero';
import AboutContent from '../components/sections/AboutPage/AboutContent';
import LeadershipCard from '../components/sections/AboutPage/LeadershipCard';
import TimeLineSection from '../components/sections/AboutPage/TimeLineSection';
import StatsSection from '../components/sections/AboutPage/StatsSection';

import '../assets/styles/about.css';
import '../assets/styles/globals.css';

const AboutPage = () => {
    const { openCart } = useCartActions();
  return (
    <>
      <HeaderProducts onCartOpen={openCart} />

      <main>
        {/* <AboutHero /> */}
        <DuplicateNav activePage="about" />
        <AboutContent />
        <StatsSection />
        <LeadershipCard />
      </main>

      <Footer />
    </>
  );
};

export default AboutPage;