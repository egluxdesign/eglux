// src/components/admin/orders/OrdersPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import OrderFilters from './OrderFilters';
import OrdersTable from './OrdersTable';
import OrderDetailModal from './OrderDetailModal';
import { ShoppingBag, AlertTriangle } from 'lucide-react';

const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [detailOrderId, setDetailOrderId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

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

    const { data, error } = await query;

    if (error) {
      setFetchError('Gagal memuat data order. Coba refresh.');
      setOrders([]);
      setLoading(false);
      return;
    }

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
    setActionError(null);
    const previous = orders.find(o => o.id === orderId)?.status;

    // Optimistic update
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));

    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);

    if (error) {
      // Revert kalau gagal
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: previous } : o));
      setActionError('Gagal update status order. Coba lagi.');
    }
  };

  const handleBulkStatusChange = async (newStatus) => {
    setActionError(null);
    const targetIds = [...selectedOrders];
    const previousStatuses = new Map(orders.filter(o => targetIds.includes(o.id)).map(o => [o.id, o.status]));

    setOrders(prev => prev.map(o => targetIds.includes(o.id) ? { ...o, status: newStatus } : o));
    setSelectedOrders([]);

    const { error } = await supabase.from('orders').update({ status: newStatus }).in('id', targetIds);

    if (error) {
      setOrders(prev => prev.map(o => 
        targetIds.includes(o.id) ? { ...o, status: previousStatuses.get(o.id) } : o
      ));
      setActionError('Gagal update status untuk order yang dipilih. Coba lagi.');
    }
  };

  // Escape field buat CSV: bungkus kutip dua dan escape kutip dua di dalamnya
  const csvField = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const handleExport = () => {
    const csv = [
      ['Order ID', 'Customer', 'Phone', 'Date', 'Amount', 'Status', 'Payment Status', 'Address'].join(','),
      ...orders.map(o => [
        csvField(o.id),
        csvField(o.customers?.name || ''),
        csvField(o.customers?.phone || ''),
        csvField(new Date(o.created_at).toISOString()),
        o.total_amount,
        csvField(o.status),
        csvField(o.payment_status),
        csvField(o.shipping_address || '')
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

  // Key ini berubah tiap filter/search/sort berubah -> dipakai OrdersTable buat reset ke halaman 1
  const filterResetKey = `${statusFilter}|${searchQuery}|${dateRange.start}|${dateRange.end}|${sortConfig.key}|${sortConfig.direction}`;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
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

      {(fetchError || actionError) && (
        <div className="flex items-center gap-3 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-[0.85rem]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {fetchError || actionError}
        </div>
      )}

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
        resetKey={filterResetKey}
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