// src/components/admin/customers/CustomerDetailModal.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { X, User, Phone, Mail, MapPin, ShoppingBag, Calendar, ArrowUpRight } from 'lucide-react';
import StatusBadge from '../orders/StatusBadge';

const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');

const CustomerDetailModal = ({ customer, onClose }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (customer) fetchCustomerOrders();
  }, [customer]);

  const fetchCustomerOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false });
    setOrders(data || []);
    setLoading(false);
  };

  const toWIB = (iso) =>
    new Date(iso).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  if (!customer) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8ecf4]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#c9a96e]/10 flex items-center justify-center">
              <User className="w-5 h-5 text-[#c9a96e]" />
            </div>
            <div>
              <h2 className="text-[1.1rem] font-bold text-[#1a1d2b]">{customer.name || 'Unknown'}</h2>
              <p className="text-[0.75rem] text-[#9ca3af]">Customer since {new Date(customer.created_at).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#f8f9fc] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-[#f8f9fc] rounded-xl p-4 text-center">
              <ShoppingBag className="w-5 h-5 text-[#c9a96e] mx-auto mb-2" />
              <p className="text-[1.25rem] font-bold text-[#1a1d2b]">{customer.order_count || 0}</p>
              <p className="text-[0.75rem] text-[#9ca3af]">Total Orders</p>
            </div>
            <div className="bg-[#f8f9fc] rounded-xl p-4 text-center">
              <ArrowUpRight className="w-5 h-5 text-emerald-500 mx-auto mb-2" />
              <p className="text-[1.25rem] font-bold text-[#1a1d2b]">{rupiah(customer.total_spent || 0)}</p>
              <p className="text-[0.75rem] text-[#9ca3af]">Total Spent</p>
            </div>
            <div className="bg-[#f8f9fc] rounded-xl p-4 text-center">
              <Calendar className="w-5 h-5 text-blue-500 mx-auto mb-2" />
              <p className="text-[1.25rem] font-bold text-[#1a1d2b]">{orders.filter(o => o.status === 'pending').length}</p>
              <p className="text-[0.75rem] text-[#9ca3af]">Pending</p>
            </div>
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="border border-[#e8ecf4] rounded-xl p-4">
              <h3 className="text-[0.85rem] font-semibold text-[#1a1d2b] mb-3">Contact Information</h3>
              <div className="space-y-2">
                {customer.phone && (
                  <div className="flex items-center gap-2 text-[0.85rem] text-[#6b7280]">
                    <Phone className="w-4 h-4 text-[#c9a96e]" />
                    {customer.phone}
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center gap-2 text-[0.85rem] text-[#6b7280]">
                    <Mail className="w-4 h-4 text-[#c9a96e]" />
                    {customer.email}
                  </div>
                )}
                {customer.address && (
                  <div className="flex items-start gap-2 text-[0.85rem] text-[#6b7280]">
                    <MapPin className="w-4 h-4 text-[#c9a96e] mt-0.5" />
                    {customer.address}
                  </div>
                )}
              </div>
            </div>

            <div className="border border-[#e8ecf4] rounded-xl p-4">
              <h3 className="text-[0.85rem] font-semibold text-[#1a1d2b] mb-3">Order Summary</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-[0.85rem]">
                  <span className="text-[#6b7280]">Completed</span>
                  <span className="font-medium text-emerald-600">{orders.filter(o => o.status === 'paid' || o.status === 'shipped').length}</span>
                </div>
                <div className="flex justify-between text-[0.85rem]">
                  <span className="text-[#6b7280]">Pending</span>
                  <span className="font-medium text-amber-600">{orders.filter(o => o.status === 'pending').length}</span>
                </div>
                <div className="flex justify-between text-[0.85rem]">
                  <span className="text-[#6b7280]">Cancelled</span>
                  <span className="font-medium text-red-600">{orders.filter(o => o.status === 'cancelled').length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Order History */}
          <div className="border border-[#e8ecf4] rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-[#f8f9fc] border-b border-[#e8ecf4]">
              <h3 className="text-[0.9rem] font-semibold text-[#1a1d2b]">Order History</h3>
            </div>

            {loading ? (
              <div className="p-6 space-y-3 animate-pulse">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-100 rounded-lg" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="p-8 text-center">
                <ShoppingBag className="w-10 h-10 text-[#e8ecf4] mx-auto mb-2" />
                <p className="text-[0.85rem] text-[#9ca3af]">No orders yet</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f3f4f6]">
                {orders.map((order) => (
                  <div key={order.id} className="px-4 py-3 flex items-center justify-between hover:bg-[#f8f9fc] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#c9a96e]/10 flex items-center justify-center">
                        <ShoppingBag className="w-4 h-4 text-[#c9a96e]" />
                      </div>
                      <div>
                        <p className="text-[0.85rem] font-medium text-[#1a1d2b]">Order #{order.id.slice(0, 8)}</p>
                        <p className="text-[0.75rem] text-[#9ca3af]">{toWIB(order.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[0.85rem] font-semibold text-[#1a1d2b]">{rupiah(order.total_amount)}</span>
                      <StatusBadge status={order.status} size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerDetailModal;