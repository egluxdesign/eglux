// src/components/admin/orders/OrdersPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import OrderFilters from './OrderFilters';
import OrdersTable from './OrdersTable';
import OrderDetailModal from './OrderDetailModal';
import { ShoppingBag } from 'lucide-react';

const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [detailOrderId, setDetailOrderId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('orders')
      .select('*, customers(name, phone, email)')
      .order(sortConfig.key === 'customers.name' ? 'created_at' : sortConfig.key, { 
        ascending: sortConfig.direction === 'asc' 
      });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (dateRange.start) {
      query = query.gte('created_at', dateRange.start + 'T00:00:00');
    }
    if (dateRange.end) {
      query = query.lte('created_at', dateRange.end + 'T23:59:59');
    }

    const { data } = await query;
    let result = data || [];

    // Client-side search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(o => 
        o.customers?.name?.toLowerCase().includes(q) ||
        o.customers?.phone?.includes(q) ||
        o.id.toLowerCase().includes(q)
      );
    }

    // Client-side sort for customer name
    if (sortConfig.key === 'customers.name') {
      result.sort((a, b) => {
        const nameA = (a.customers?.name || '').toLowerCase();
        const nameB = (b.customers?.name || '').toLowerCase();
        return sortConfig.direction === 'asc' 
          ? nameA.localeCompare(nameB) 
          : nameB.localeCompare(nameA);
      });
    }

    setOrders(result);
    setSelectedOrders([]);
    setLoading(false);
  }, [statusFilter, searchQuery, dateRange, sortConfig]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleSelectOrder = (id, checked) => {
    setSelectedOrders(prev => 
      checked ? [...prev, id] : prev.filter(oid => oid !== id)
    );
  };

  const handleSelectAll = (ids, checked) => {
    setSelectedOrders(prev => 
      checked 
        ? [...new Set([...prev, ...ids])]
        : prev.filter(id => !ids.includes(id))
    );
  };

  const handleStatusChange = async (orderId, newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
  };

  const handleBulkStatusChange = async (newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).in('id', selectedOrders);
    setOrders(prev => prev.map(o => selectedOrders.includes(o.id) ? { ...o, status: newStatus } : o));
    setSelectedOrders([]);
  };

  const handleExport = () => {
    const csv = [
      ['Order ID', 'Customer', 'Phone', 'Date', 'Amount', 'Status', 'Address'].join(','),
      ...orders.map(o => [
        o.id,
        `"${o.customers?.name || ''}"`,
        o.customers?.phone || '',
        new Date(o.created_at).toISOString(),
        o.total_amount,
        o.status,
        `"${o.shipping_address || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.5rem] font-bold text-[#1a1d2b]">Orders</h1>
          <p className="text-[0.85rem] text-[#9ca3af] mt-1">
            Manage and track all customer orders
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-[#e8ecf4]">
          <ShoppingBag className="w-5 h-5 text-[#c9a96e]" />
          <span className="text-[0.9rem] font-bold text-[#1a1d2b]">{orders.length}</span>
          <span className="text-[0.8rem] text-[#9ca3af]">total orders</span>
        </div>
      </div>

      {/* Filters */}
      <OrderFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onRefresh={fetchOrders}
        selectedCount={selectedOrders.length}
        onBulkStatusChange={handleBulkStatusChange}
        onExport={handleExport}
      />

      {/* Table */}
      <OrdersTable
        orders={orders}
        loading={loading}
        selectedOrders={selectedOrders}
        onSelectOrder={handleSelectOrder}
        onSelectAll={handleSelectAll}
        onViewDetail={setDetailOrderId}
        onStatusChange={handleStatusChange}
        sortConfig={sortConfig}
        onSort={handleSort}
      />

      {/* Detail Modal */}
      {detailOrderId && (
        <OrderDetailModal
          orderId={detailOrderId}
          onClose={() => setDetailOrderId(null)}
          onStatusUpdate={(id, status) => {
            setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
          }}
        />
      )}
    </div>
  );
};

export default OrdersPage;