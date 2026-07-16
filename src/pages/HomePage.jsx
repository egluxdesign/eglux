// src/pages/HomePage.jsx
// CartProvider & CartPage sudah di App.jsx — cukup pakai useCartActions().
import { useCartActions }  from './CartPage';
import HeaderProducts      from '../components/layout/HeaderProducts';
import SwiperContainer     from '../components/layout/SwiperContainer';
import DuplicateNav        from '../components/layout/DuplicateNav';
import Footer              from '../components/layout/Footer';
// import Hero                from '../components/sections/HomePage/Hero';
// import PromoBanners        from '../components/sections/HomePage/PromoBanners';
import Categories          from '../components/sections/HomePage/Categories';
import BestSellers         from '../components/sections/HomePage/BestSellers';
import NewArrivals         from '../components/sections/HomePage/NewArrivals';
import Features            from '../components/sections/HomePage/Features';

const HomePage = () => {
  const { openCart } = useCartActions();

  return (
    <>
      <HeaderProducts onCartOpen={openCart} />
      <SwiperContainer />

      <main>
        {/* <Hero /> */}
        <DuplicateNav />
        {/* <PromoBanners /> */}
        <Categories />
        <BestSellers />
        <NewArrivals />
        <Features />
      </main>

      <Footer />
    </>
  );
};

export default HomePage;