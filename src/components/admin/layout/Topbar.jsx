// src/components/admin/layout/Topbar.jsx
import { useState, useEffect, useRef } from 'react';
import { Menu, Search, X, LogOut, User } from 'lucide-react';
import NotificationDropdown from './NotificationDropdown';
import SearchBar from './SearchBar';

const Topbar = ({ onMenuToggle, isMobile, onLogout, onNavigate }) => {
  const [showProfile, setShowProfile] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfile(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setShowProfile(false);
    await onLogout?.();
  };

  const handleNavigate = (page) => {
    setMobileSearchOpen(false);
    onNavigate?.(page);
  };

  return (
    <header className="h-16 bg-white border-b border-[#e8ecf4] flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30 relative">
      {/* Mobile search overlay — full width, ganti seluruh isi topbar sementara */}
      {mobileSearchOpen && (
        <div className="absolute inset-0 bg-white flex items-center gap-2 px-4 z-40 md:hidden">
          <SearchBar onNavigate={handleNavigate} variant="mobile" autoFocus />
          <button
            onClick={() => setMobileSearchOpen(false)}
            className="p-2 hover:bg-[#f8f9fc] rounded-lg transition-colors flex-shrink-0"
            aria-label="Close search"
          >
            <X className="w-5 h-5 text-[#1a1d2b]" />
          </button>
        </div>
      )}

      {/* Left */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        {isMobile && (
          <button 
            onClick={onMenuToggle}
            className="p-2 hover:bg-[#f8f9fc] rounded-lg transition-colors flex-shrink-0"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5 text-[#1a1d2b]" />
          </button>
        )}

        {/* Search bar — desktop/tablet */}
        <SearchBar onNavigate={onNavigate} variant="desktop" />
      </div>

      {/* Right */}
      <div className="flex items-center gap-1 sm:gap-3">
        {/* Search trigger — mobile only */}
        <button
          onClick={() => setMobileSearchOpen(true)}
          className="p-2 hover:bg-[#f8f9fc] rounded-lg transition-colors md:hidden"
          aria-label="Search"
        >
          <Search className="w-5 h-5 text-[#1a1d2b]" />
        </button>

        {/* Notification Dropdown */}
        <NotificationDropdown onNavigate={onNavigate} />

        {/* Profile */}
        <div className="relative" ref={profileRef}>
          <button 
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-2 sm:gap-3 pl-1 sm:pl-3 pr-1 sm:pr-2 py-1.5 hover:bg-[#f8f9fc] rounded-xl transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-[#c9a96e]/15 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-[#c9a96e]" />
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-[0.8rem] font-semibold text-[#1a1d2b]">Admin</p>
              <p className="text-[0.7rem] text-[#9ca3af]">admin@eglux.id</p>
            </div>
          </button>

          {/* Profile Dropdown */}
          {showProfile && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-[#e8ecf4] py-2 z-50">
              <button
                onClick={() => { setShowProfile(false); onNavigate?.('profile'); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[0.85rem] text-[#6b7280] hover:bg-[#f8f9fc] transition-colors"
              >
                <User className="w-4 h-4" />
                Profile
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[0.85rem] text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;