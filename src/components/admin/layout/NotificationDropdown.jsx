// src/components/admin/layout/NotificationDropdown.jsx
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { Bell, ShoppingBag, AlertTriangle, CreditCard, Clock } from 'lucide-react';

const TYPE_STYLE = {
  order: { icon: ShoppingBag, color: 'text-blue-500', bg: 'bg-blue-50' },
  stock: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
  payment: { icon: CreditCard, color: 'text-emerald-500', bg: 'bg-emerald-50' },
};

const NotificationDropdown = ({ onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const dropdownRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    fetchNotifications();

    // Realtime: notifikasi baru (dari trigger order/stock) langsung muncul tanpa refresh
    const channel = supabase
      .channel('notifications-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          setNotifications((prev) => [payload.new, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchNotifications = async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (fetchError) {
      setError('Gagal memuat notifikasi.');
      setLoading(false);
      return;
    }

    setNotifications(data || []);
    setLoading(false);
  };

  const markAsRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
  };

  const handleNotifClick = (notif) => {
    markAsRead(notif.id);
    setIsOpen(false);
    if (notif.type === 'stock') onNavigate?.('products');
    else if (notif.type === 'payment') onNavigate?.('payments');
    else onNavigate?.('orders');
  };

  const goToOrders = () => {
    setIsOpen(false);
    onNavigate?.('orders');
  };

  const getTimeAgo = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-[#f8f9fc] rounded-xl transition-colors"
      >
        <Bell className="w-5 h-5 text-[#6b7280]" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[0.65rem] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[380px] bg-white rounded-2xl shadow-xl border border-[#e8ecf4] overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#e8ecf4]">
            <h3 className="text-[0.9rem] font-bold text-[#1a1d2b]">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[0.75rem] text-[#c9a96e] font-medium hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Content */}
          <div className="max-h-[400px] overflow-auto">
            {error ? (
              <div className="p-6 text-center">
                <AlertTriangle className="w-8 h-8 text-red-300 mx-auto mb-2" />
                <p className="text-[0.8rem] text-red-500">{error}</p>
              </div>
            ) : loading ? (
              <div className="p-6 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-8 h-8 bg-gray-200 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-200 rounded w-3/4" />
                      <div className="h-2 bg-gray-200 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-10 h-10 text-[#e8ecf4] mx-auto mb-3" />
                <p className="text-[0.85rem] text-[#9ca3af]">No notifications yet</p>
                <p className="text-[0.75rem] text-[#d1d5db] mt-1">New orders and alerts will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f3f4f6]">
                {notifications.map((notif) => {
                  const style = TYPE_STYLE[notif.type] || TYPE_STYLE.order;
                  const Icon = style.icon;
                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleNotifClick(notif)}
                      className={`flex gap-3 px-5 py-3 cursor-pointer hover:bg-[#f8f9fc] transition-colors ${
                        !notif.is_read ? 'bg-[#c9a96e]/5' : ''
                      }`}
                    >
                      <div className={`w-8 h-8 ${style.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-4 h-4 ${style.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[0.8rem] font-semibold text-[#1a1d2b]">{notif.title}</p>
                          {!notif.is_read && (
                            <div className="w-1.5 h-1.5 rounded-full bg-[#c9a96e]" />
                          )}
                        </div>
                        <p className="text-[0.75rem] text-[#6b7280] mt-0.5 truncate">{notif.message}</p>
                        <p className="text-[0.7rem] text-[#9ca3af] mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {getTimeAgo(notif.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[#e8ecf4] bg-[#f8f9fc]">
            <button
              onClick={goToOrders}
              className="w-full text-center text-[0.8rem] text-[#6b7280] hover:text-[#1a1d2b] transition-colors"
            >
              View all activity
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;