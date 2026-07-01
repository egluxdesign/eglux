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

const Sidebar = ({ isOpen, isMobile, activePage, onNavigate }) => {
  return (
    <aside 
      className={`fixed top-0 left-0 h-full bg-[#1a1d2b] z-50 transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        w-[260px] flex flex-col`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-white/10">
        <Store className="w-6 h-6 text-[#c9a96e] mr-3" />
        <div>
          <h1 className="text-white font-bold text-[1rem] tracking-tight">EGLUX</h1>
          <p className="text-[0.65rem] text-white/50 uppercase tracking-wider">Admin Panel</p>
        </div>
        {isMobile && (
          <button 
            onClick={() => onNavigate(activePage)}
            className="ml-auto text-white/50 hover:text-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[0.85rem] font-medium
                transition-all duration-200 group
                ${isActive 
                  ? 'bg-[#c9a96e]/15 text-[#c9a96e]' 
                  : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
            >
              <Icon className={`w-[18px] h-[18px] transition-colors
                ${isActive ? 'text-[#c9a96e]' : 'text-white/40 group-hover:text-white/70'}`} 
              />
              {item.label}
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#c9a96e]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom info */}
      <div className="p-4 border-t border-white/10">
        <div className="bg-white/5 rounded-xl p-3">
          <p className="text-[0.7rem] text-white/40 uppercase tracking-wider mb-1">Version</p>
          <p className="text-[0.8rem] text-white/70 font-medium">Eglux Admin v2.0</p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;