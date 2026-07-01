// src/components/admin/layout/AdminLayout.jsx
import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const AdminLayout = ({ children, activePage, onNavigate }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => { if (isMobile) setSidebarOpen(false); };

  return (
    <div className="min-h-screen bg-[#f8f9fc] flex">
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <Sidebar 
        isOpen={sidebarOpen} 
        isMobile={isMobile}
        activePage={activePage}
        onNavigate={(page) => { onNavigate(page); closeSidebar(); }}
      />

      {/* Main content */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${
        !isMobile && sidebarOpen ? 'ml-[260px]' : 'ml-0'
      }`}>
        <Topbar 
          onMenuToggle={toggleSidebar}
          isMobile={isMobile}
        />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;