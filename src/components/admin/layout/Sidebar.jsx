// src/components/admin/layout/Sidebar.jsx
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  CreditCard, 
  BarChart3,
  Settings,
  ChevronLeft,
  Store
} from 'lucide-react';

const MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const Sidebar = ({ isOpen, isMobile, collapsed, activePage, onNavigate, onClose, onToggleCollapse }) => {
  // Di mobile, sidebar selalu full width (drawer) dan collapse gak berlaku.
  // Di desktop, sidebar selalu "terbuka" tapi lebarnya toggle antara rail (icon-only) dan full.
  const showLabel = isMobile || !collapsed;

  return (
    <aside 
      className={`fixed top-0 left-0 h-full bg-[#1a1d2b] z-50 flex flex-col
        transition-all duration-300 ease-in-out
        ${isMobile ? (isOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'}
        ${isMobile ? 'w-[260px]' : (collapsed ? 'w-[76px]' : 'w-[260px]')}`}
    >
      {/* Logo + collapse toggle */}
      <div className={`h-16 flex items-center border-b border-white/10 ${showLabel ? 'px-6' : 'justify-center px-0'}`}>
        <Store className={`w-6 h-6 text-[#c9a96e] flex-shrink-0 ${showLabel ? 'mr-3' : ''}`} />
        {showLabel && (
          <div className="min-w-0">
            <h1 className="text-white font-bold text-[1rem] tracking-tight truncate">EGLUX</h1>
            <p className="text-[0.65rem] text-white/50 uppercase tracking-wider truncate">Admin Panel</p>
          </div>
        )}

        {/* Mobile: tombol close drawer */}
        {isMobile && (
          <button 
            onClick={onClose}
            className="ml-auto text-white/50 hover:text-white flex-shrink-0"
            aria-label="Close sidebar"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {/* Desktop: tombol collapse/expand, selalu ada baik di mode rail maupun full */}
        {!isMobile && showLabel && (
          <button
            onClick={onToggleCollapse}
            className="ml-auto text-white/50 hover:text-white flex-shrink-0"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Desktop rail: tombol expand ditaruh di bawah logo biar tetap kejangkau saat collapsed */}
      {!isMobile && !showLabel && (
        <div className="flex justify-center py-2 border-b border-white/10">
          <button
            onClick={onToggleCollapse}
            className="text-white/50 hover:text-white"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <ChevronLeft className="w-5 h-5 rotate-180" />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={!showLabel ? item.label : undefined}
              className={`w-full flex items-center gap-3 py-3 rounded-xl text-[0.85rem] font-medium
                transition-all duration-200 group
                ${showLabel ? 'px-4' : 'px-0 justify-center'}
                ${isActive 
                  ? 'bg-[#c9a96e]/15 text-[#c9a96e]' 
                  : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
            >
              <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors
                ${isActive ? 'text-[#c9a96e]' : 'text-white/40 group-hover:text-white/70'}`} 
              />
              {showLabel && <span className="truncate">{item.label}</span>}
              {isActive && showLabel && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#c9a96e] flex-shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom info — disembunyikan saat collapsed biar rail tetap ramping */}
      {showLabel && (
        <div className="p-4 border-t border-white/10">
          <div className="bg-white/5 rounded-xl p-3">
            <p className="text-[0.7rem] text-white/40 uppercase tracking-wider mb-1">Version</p>
            <p className="text-[0.8rem] text-white/70 font-medium">Eglux Admin v2.0</p>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;