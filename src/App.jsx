import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import CartPage from './pages/CartPage';
import HomePage from './pages/HomePage';
import ProductPage from './pages/ProductPage';
import BlogPage from './pages/BlogPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import AffiliatePage from './pages/AffiliatePage';
import AdminPage from './pages/AdminPage';

const App = () => (
  <BrowserRouter>
    <CartProvider>
      <CartPage>
        <Routes>
          <Route path="/"         element={<HomePage />} />
          <Route path="/products" element={<ProductPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/affiliate" element={<AffiliatePage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </CartPage>
    </CartProvider>
  </BrowserRouter>
);

export default App;