// src/components/admin/layout/AdminLayout.jsx
import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const COLLAPSE_STORAGE_KEY = 'eglux_admin_sidebar_collapsed';

const AdminLayout = ({ children, activePage, onNavigate, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
      if (window.innerWidth >= 1024) setSidebarOpen(true);
      else setSidebarOpen(false);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const closeSidebar = () => { if (isMobile) setSidebarOpen(false); };

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors (private browsing, etc.)
      }
      return next;
    });
  };

  const desktopMargin = collapsed ? 'lg:ml-[76px]' : 'lg:ml-[260px]';

  return (
    <div className="min-h-screen bg-[#f8f9fc] flex">
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <Sidebar 
        isOpen={sidebarOpen} 
        isMobile={isMobile}
        collapsed={collapsed}
        activePage={activePage}
        onNavigate={(page) => { onNavigate(page); closeSidebar(); }}
        onClose={closeSidebar}
        onToggleCollapse={toggleCollapse}
      />

      {/* Main content */}
      <div className={`flex-1 flex flex-col min-h-screen w-full transition-all duration-300 ml-0 ${desktopMargin}`}>
        <Topbar 
          onMenuToggle={toggleSidebar}
          isMobile={isMobile}
          onLogout={onLogout}
          onNavigate={onNavigate}
        />
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;