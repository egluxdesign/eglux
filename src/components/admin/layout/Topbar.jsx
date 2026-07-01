// src/components/admin/layout/Topbar.jsx
import { useState } from 'react';
import { Menu, Search, LogOut, User } from 'lucide-react';
import NotificationDropdown from './NotificationDropdown';

const Topbar = ({ onMenuToggle, isMobile }) => {
  const [showProfile, setShowProfile] = useState(false);

  return (
    <header className="h-16 bg-white border-b border-[#e8ecf4] flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Left */}
      <div className="flex items-center gap-4">
        {isMobile && (
          <button 
            onClick={onMenuToggle}
            className="p-2 hover:bg-[#f8f9fc] rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5 text-[#1a1d2b]" />
          </button>
        )}
        
        {/* Search bar */}
        <div className="hidden md:flex items-center bg-[#f8f9fc] rounded-xl px-4 py-2.5 w-[320px]">
          <Search className="w-4 h-4 text-[#9ca3af] mr-3" />
          <input 
            type="text" 
            placeholder="Search orders, products..."
            className="bg-transparent text-[0.85rem] text-[#1a1d2b] placeholder-[#9ca3af] outline-none w-full"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Notification Dropdown */}
        <NotificationDropdown />

        {/* Profile */}
        <div className="relative">
          <button 
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-3 pl-3 pr-2 py-1.5 hover:bg-[#f8f9fc] rounded-xl transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-[#c9a96e]/15 flex items-center justify-center">
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
              <button className="w-full flex items-center gap-3 px-4 py-2.5 text-[0.85rem] text-[#6b7280] hover:bg-[#f8f9fc] transition-colors">
                <User className="w-4 h-4" />
                Profile
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-2.5 text-[0.85rem] text-red-500 hover:bg-red-50 transition-colors">
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