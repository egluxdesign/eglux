// src/components/admin/payments/PaymentDetailModal.jsx
import { X, CreditCard, User, ShoppingBag, Clock, Code } from 'lucide-react';

const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

const toWIB = (iso) =>
  iso
    ? new Date(iso).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '-';

const PaymentDetailModal = ({ payment, onClose }) => {
  if (!payment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8ecf4]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#c9a96e]/10 rounded-xl flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-[#c9a96e]" />
            </div>
            <div>
              <h2 className="text-[1.1rem] font-bold text-[#1a1d2b]">Payment Detail</h2>
              <p className="text-[0.75rem] text-[#9ca3af]">ID: {payment.id.slice(0, 8)}...</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#f8f9fc] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          {/* Customer & Order */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-[#e8ecf4] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-[#c9a96e]" />
                <h3 className="text-[0.8rem] font-semibold text-[#1a1d2b]">Customer</h3>
              </div>
              <p className="text-[0.85rem] text-[#1a1d2b]">{payment.orders?.customers?.name || 'Unknown'}</p>
              <p className="text-[0.75rem] text-[#9ca3af]">{payment.orders?.customers?.phone || '-'}</p>
            </div>
            <div className="border border-[#e8ecf4] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingBag className="w-4 h-4 text-[#c9a96e]" />
                <h3 className="text-[0.8rem] font-semibold text-[#1a1d2b]">Order</h3>
              </div>
              <p className="text-[0.8rem] font-mono text-[#1a1d2b]">#{payment.order_id?.slice(0, 8) || 'N/A'}</p>
            </div>
          </div>

          {/* Amount & timing */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#f8f9fc] rounded-xl p-4">
              <p className="text-[0.75rem] text-[#9ca3af] mb-1">Amount</p>
              <p className="text-[1.1rem] font-bold text-[#1a1d2b]">{rupiah(payment.amount)}</p>
            </div>
            <div className="bg-[#f8f9fc] rounded-xl p-4">
              <p className="text-[0.75rem] text-[#9ca3af] mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Paid At
              </p>
              <p className="text-[0.85rem] font-medium text-[#1a1d2b]">{toWIB(payment.paid_at)}</p>
            </div>
          </div>

          {/* Provider info */}
          <div className="border border-[#e8ecf4] rounded-xl p-4">
            <h3 className="text-[0.8rem] font-semibold text-[#1a1d2b] mb-3">Provider Info</h3>
            <div className="grid grid-cols-2 gap-3 text-[0.85rem]">
              <div>
                <p className="text-[0.75rem] text-[#9ca3af]">Provider</p>
                <p className="text-[#1a1d2b] capitalize">{payment.provider}</p>
              </div>
              <div>
                <p className="text-[0.75rem] text-[#9ca3af]">Payment Type</p>
                <p className="text-[#1a1d2b] capitalize">{payment.raw_payload?.payment_type?.replace(/_/g, ' ') || '-'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[0.75rem] text-[#9ca3af]">Reference ID (transaction_id)</p>
                <p className="text-[#1a1d2b] font-mono text-[0.8rem] break-all">{payment.provider_reference_id || '-'}</p>
              </div>
            </div>
          </div>

          {/* Raw payload */}
          <div className="border border-[#e8ecf4] rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-[#f8f9fc] border-b border-[#e8ecf4] flex items-center gap-2">
              <Code className="w-4 h-4 text-[#c9a96e]" />
              <h3 className="text-[0.8rem] font-semibold text-[#1a1d2b]">Raw Payload (dari Midtrans)</h3>
            </div>
            <pre className="p-4 text-[0.75rem] text-[#6b7280] overflow-auto max-h-[240px] bg-[#fafbfc]">
{JSON.stringify(payment.raw_payload, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentDetailModal;