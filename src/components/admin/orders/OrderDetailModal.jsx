// src/components/admin/orders/OrderDetailModal.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { X, Package, User, MapPin, Phone, Mail, CreditCard, ClipboardList, AlertTriangle, CheckCircle2 } from 'lucide-react';
import StatusBadge from './StatusBadge';

const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

const STATUS_FLOW = ['pending', 'confirmed', 'paid', 'shipped', 'cancelled'];

const OrderDetailModal = ({ orderId, onClose, onStatusUpdate }) => {
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(null);

  useEffect(() => {
    if (orderId) fetchOrderDetail();
  }, [orderId]);

  const fetchOrderDetail = async () => {
    setLoading(true);
    setLoadError(null);

    const [orderRes, itemsRes, paymentsRes] = await Promise.all([
      supabase.from('orders').select('*, customers(*)').eq('id', orderId).single(),
      supabase.from('order_items').select('*').eq('order_id', orderId),
      supabase.from('payments').select('*').eq('order_id', orderId).order('created_at', { ascending: false }),
    ]);

    if (orderRes.error || !orderRes.data) {
      setLoadError('Gagal memuat detail order. Order mungkin sudah dihapus atau ID tidak valid.');
      setLoading(false);
      return;
    }

    setOrder(orderRes.data);
    setItems(itemsRes.data || []);
    setPayments(paymentsRes.data || []);
    setLoading(false);
  };

  const handleStatusUpdate = async (newStatus) => {
    setUpdating(true);
    setUpdateError(null);
    const previousStatus = order.status;

    setOrder((prev) => ({ ...prev, status: newStatus }));

    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);

    if (error) {
      setOrder((prev) => ({ ...prev, status: previousStatus }));
      setUpdateError('Gagal update status. Coba lagi.');
    } else {
      onStatusUpdate?.(orderId, newStatus);
    }
    setUpdating(false);
  };

  const toWIB = (iso) =>
    iso
      ? new Date(iso).toLocaleString('id-ID', {
          timeZone: 'Asia/Jakarta',
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      : '-';

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
          ) : loadError ? (
            <div className="text-center py-10">
              <AlertTriangle className="w-10 h-10 text-red-300 mx-auto mb-3" />
              <p className="text-[0.9rem] text-red-500">{loadError}</p>
            </div>
          ) : !order ? null : (
            <div className="space-y-6">
              {updateError && (
                <div className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2.5 rounded-xl text-[0.8rem]">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {updateError}
                </div>
              )}

              {/* Status & Actions */}
              <div className="flex items-center justify-between flex-wrap gap-3 bg-[#f8f9fc] rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <StatusBadge status={order.status} />
                  <span className="text-[0.8rem] text-[#9ca3af]">{toWIB(order.created_at)}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {STATUS_FLOW.filter(s => s !== order.status).map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusUpdate(status)}
                      disabled={updating}
                      className="px-3 py-1.5 rounded-lg text-[0.75rem] font-medium border capitalize transition-all
                        bg-white text-[#6b7280] border-[#e8ecf4] hover:border-[#c9a96e] hover:text-[#c9a96e]
                        disabled:opacity-50"
                    >
                      {updating ? '...' : `Mark as ${status}`}
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
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-[0.75rem] text-[#9ca3af] mb-1">Payment Method</p>
                    <p className="text-[0.85rem] font-medium text-[#1a1d2b] capitalize">{order.payment_method || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[0.75rem] text-[#9ca3af] mb-1">Payment Status</p>
                    <p className="text-[0.85rem] font-medium text-[#1a1d2b] capitalize">{order.payment_status || 'N/A'}</p>
                  </div>
                </div>

                {/* Riwayat transaksi asli dari tabel payments (mis. Midtrans) */}
                {payments.length > 0 ? (
                  <div className="border-t border-[#f3f4f6] pt-3 space-y-2">
                    <p className="text-[0.75rem] text-[#9ca3af] mb-1">Payment History</p>
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-[#f8f9fc] rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {p.status === 'success' || p.status === 'paid' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-[0.8rem] font-medium text-[#1a1d2b] capitalize truncate">
                              {p.provider} — {p.status}
                            </p>
                            {p.provider_reference_id && (
                              <p className="text-[0.7rem] text-[#9ca3af] truncate">Ref: {p.provider_reference_id}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[0.8rem] font-semibold text-[#1a1d2b]">{rupiah(p.amount)}</p>
                          <p className="text-[0.7rem] text-[#9ca3af]">{toWIB(p.paid_at || p.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[0.75rem] text-[#9ca3af] border-t border-[#f3f4f6] pt-3">
                    No payment record yet.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderDetailModal;