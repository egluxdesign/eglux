// src/components/admin/orders/OrderDetailModal.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { X, Package, User, MapPin, Phone, Mail, Calendar, CreditCard, Truck, ClipboardList } from 'lucide-react';
import StatusBadge from './StatusBadge';

const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');

const STATUS_FLOW = ['pending', 'confirmed', 'paid', 'shipped', 'cancelled'];

const OrderDetailModal = ({ orderId, onClose, onStatusUpdate }) => {
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (orderId) fetchOrderDetail();
  }, [orderId]);

  const fetchOrderDetail = async () => {
    setLoading(true);

    const { data: orderData } = await supabase
      .from('orders')
      .select('*, customers(*)')
      .eq('id', orderId)
      .single();

    const { data: itemsData } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    setOrder(orderData);
    setItems(itemsData || []);
    setLoading(false);
  };

  const handleStatusUpdate = async (newStatus) => {
    setUpdating(true);
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
    setOrder({ ...order, status: newStatus });
    onStatusUpdate?.(orderId, newStatus);
    setUpdating(false);
  };

  const toWIB = (iso) =>
    new Date(iso).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  if (!orderId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8ecf4]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#c9a96e]/10 rounded-xl flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-[#c9a96e]" />
            </div>
            <div>
              <h2 className="text-[1.1rem] font-bold text-[#1a1d2b]">Order Detail</h2>
              <p className="text-[0.75rem] text-[#9ca3af]">ID: {orderId.slice(0, 8)}...</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#f8f9fc] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Status & Actions */}
              <div className="flex items-center justify-between bg-[#f8f9fc] rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <StatusBadge status={order.status} />
                  <span className="text-[0.8rem] text-[#9ca3af]">{toWIB(order.created_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {STATUS_FLOW.filter(s => s !== order.status).map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusUpdate(status)}
                      disabled={updating}
                      className={`px-3 py-1.5 rounded-lg text-[0.75rem] font-medium border transition-all
                        ${order.status === status 
                          ? 'bg-[#c9a96e] text-white border-[#c9a96e]' 
                          : 'bg-white text-[#6b7280] border-[#e8ecf4] hover:border-[#c9a96e] hover:text-[#c9a96e]'
                        } disabled:opacity-50`}
                    >
                      {updating ? '...' : status}
                    </button>
                  ))}
                </div>
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-[#e8ecf4] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="w-4 h-4 text-[#c9a96e]" />
                    <h3 className="text-[0.85rem] font-semibold text-[#1a1d2b]">Customer</h3>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[0.85rem] text-[#1a1d2b] font-medium">{order.customers?.name || 'N/A'}</p>
                    <div className="flex items-center gap-2 text-[0.8rem] text-[#6b7280]">
                      <Phone className="w-3.5 h-3.5" />
                      {order.customers?.phone || 'N/A'}
                    </div>
                    <div className="flex items-center gap-2 text-[0.8rem] text-[#6b7280]">
                      <Mail className="w-3.5 h-3.5" />
                      {order.customers?.email || 'N/A'}
                    </div>
                  </div>
                </div>

                <div className="border border-[#e8ecf4] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-[#c9a96e]" />
                    <h3 className="text-[0.85rem] font-semibold text-[#1a1d2b]">Shipping Address</h3>
                  </div>
                  <p className="text-[0.85rem] text-[#6b7280] leading-relaxed">{order.shipping_address || 'N/A'}</p>
                </div>
              </div>

              {/* Order Items */}
              <div className="border border-[#e8ecf4] rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-[#f8f9fc] border-b border-[#e8ecf4] flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#c9a96e]" />
                  <h3 className="text-[0.85rem] font-semibold text-[#1a1d2b]">Order Items</h3>
                  <span className="ml-auto text-[0.75rem] text-[#9ca3af]">{items.length} item(s)</span>
                </div>
                <div className="divide-y divide-[#f3f4f6]">
                  {items.map((item) => (
                    <div key={item.id} className="px-4 py-3 flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#f8f9fc] rounded-lg flex items-center justify-center flex-shrink-0">
                        <Package className="w-5 h-5 text-[#c9a96e]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[0.85rem] font-medium text-[#1a1d2b] truncate">
                          {item.product_name_snapshot}
                        </p>
                        {item.variant_name_snapshot && (
                          <p className="text-[0.75rem] text-[#9ca3af]">{item.variant_name_snapshot}</p>
                        )}
                      </div>
                      <span className="text-[0.8rem] text-[#6b7280]">× {item.quantity}</span>
                      <span className="text-[0.85rem] font-semibold text-[#1a1d2b] whitespace-nowrap">
                        {rupiah(item.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 bg-[#f8f9fc] border-t border-[#e8ecf4]">
                  <div className="flex justify-between items-center">
                    <span className="text-[0.85rem] font-semibold text-[#1a1d2b]">Total Amount</span>
                    <span className="text-[1.1rem] font-bold text-[#c9a96e]">{rupiah(order.total_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {order.notes && (
                <div className="border border-[#e8ecf4] rounded-xl p-4">
                  <h3 className="text-[0.85rem] font-semibold text-[#1a1d2b] mb-2">Notes</h3>
                  <p className="text-[0.85rem] text-[#6b7280]">{order.notes}</p>
                </div>
              )}

              {/* Payment Info */}
              <div className="border border-[#e8ecf4] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard className="w-4 h-4 text-[#c9a96e]" />
                  <h3 className="text-[0.85rem] font-semibold text-[#1a1d2b]">Payment Information</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[0.75rem] text-[#9ca3af] mb-1">Payment Method</p>
                    <p className="text-[0.85rem] font-medium text-[#1a1d2b]">{order.payment_method || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[0.75rem] text-[#9ca3af] mb-1">Payment Status</p>
                    <p className="text-[0.85rem] font-medium text-[#1a1d2b]">{order.payment_status || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderDetailModal;