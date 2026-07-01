// src/components/admin/customers/CustomersPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import CustomersTable from './CustomersTable';
import CustomerDetailModal from './CustomerDetailModal';
import { Users, Search } from 'lucide-react';

const CustomersPage = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailCustomer, setDetailCustomer] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

  const fetchCustomers = useCallback(async () => {
    setLoading(true);

    // Fetch customers with order aggregation
    const { data: customersData } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    let result = customersData || [];

    // Fetch orders to calculate stats per customer
    const { data: ordersData } = await supabase
      .from('orders')
      .select('id, customer_id, total_amount, status, created_at');

    const orders = ordersData || [];

    // Enrich customer data with order stats
    result = result.map(customer => {
      const customerOrders = orders.filter(o => o.customer_id === customer.id);
      return {
        ...customer,
        order_count: customerOrders.length,
        total_spent: customerOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0),
        last_order: customerOrders.length > 0 
          ? customerOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].created_at
          : null,
      };
    });

    // Client-side search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      let valA = a[sortConfig.key] || 0;
      let valB = b[sortConfig.key] || 0;

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (sortConfig.direction === 'asc') {
        return valA > valB ? 1 : -1;
      }
      return valA < valB ? 1 : -1;
    });

    setCustomers(result);
    setLoading(false);
  }, [searchQuery, sortConfig]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const totalCustomers = customers.length;
  const totalRevenue = customers.reduce((sum, c) => sum + (c.total_spent || 0), 0);

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.5rem] font-bold text-[#1a1d2b]">Customers</h1>
          <p className="text-[0.85rem] text-[#9ca3af] mt-1">
            Manage your customer base
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-[#e8ecf4]">
            <Users className="w-5 h-5 text-[#c9a96e]" />
            <div>
              <span className="text-[0.9rem] font-bold text-[#1a1d2b]">{totalCustomers}</span>
              <span className="text-[0.75rem] text-[#9ca3af] ml-1">customers</span>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100">
            <span className="text-[0.8rem] font-medium text-emerald-600">{rupiah(totalRevenue)}</span>
            <span className="text-[0.75rem] text-emerald-400">total revenue</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-[#e8ecf4] p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.85rem]
                       text-[#1a1d2b] outline-none focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20
                       transition-all placeholder-[#9ca3af]"
          />
        </div>
      </div>

      {/* Table */}
      <CustomersTable
        customers={customers}
        loading={loading}
        onViewDetail={setDetailCustomer}
        sortConfig={sortConfig}
        onSort={handleSort}
      />

      {/* Detail Modal */}
      {detailCustomer && (
        <CustomerDetailModal
          customer={detailCustomer}
          onClose={() => setDetailCustomer(null)}
        />
      )}
    </div>
  );
};

const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');

export default CustomersPage;