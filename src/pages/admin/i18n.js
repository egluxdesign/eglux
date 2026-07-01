// src/pages/admin/i18n.js
export const LANGUAGES = [
  { code: 'id', label: 'ID' },
  { code: 'en', label: 'EN' },
  { code: 'zh', label: '中文' },
];

export const T = {
  // ── Nav ──────────────────────────────────────────────────────
  nav_overview:   { id: 'Overview',   en: 'Overview',   zh: '概览'     },
  nav_orders:     { id: 'Orders',     en: 'Orders',     zh: '订单'     },
  nav_products:   { id: 'Products',   en: 'Products',   zh: '商品'     },
  nav_customers:  { id: 'Customers',  en: 'Customers',  zh: '客户'     },
  nav_payments:   { id: 'Payments',   en: 'Payments',   zh: '付款'     },
  nav_settings:   { id: 'Settings',   en: 'Settings',   zh: '设置'     },
  nav_main:       { id: 'MENU',       en: 'MENU',       zh: '菜单'     },
  nav_data:       { id: 'DATA',       en: 'DATA',       zh: '数据'     },
  nav_system:     { id: 'SISTEM',     en: 'SYSTEM',     zh: '系统'     },

  // ── Auth ─────────────────────────────────────────────────────
  login_title:    { id: 'Masuk ke Admin',     en: 'Admin Login',        zh: '管理员登录'  },
  login_sub:      { id: 'Kelola toko EGLUX',  en: 'Manage EGLUX store', zh: '管理 EGLUX 商店' },
  login_email:    { id: 'Email',              en: 'Email',              zh: '邮箱'       },
  login_password: { id: 'Password',           en: 'Password',           zh: '密码'       },
  login_btn:      { id: 'Masuk',              en: 'Sign in',            zh: '登录'       },
  login_loading:  { id: 'Memuat...',          en: 'Loading...',         zh: '加载中...'  },
  login_error:    { id: 'Email atau password salah.', en: 'Wrong email or password.', zh: '邮箱或密码错误。' },

  // ── Topbar ───────────────────────────────────────────────────
  logout:         { id: 'Keluar',     en: 'Logout',     zh: '退出'     },
  admin_label:    { id: 'Admin',      en: 'Admin',      zh: '管理员'   },

  // ── Overview ─────────────────────────────────────────────────
  overview_title:        { id: 'Overview',              en: 'Overview',             zh: '概览'         },
  total_orders:          { id: 'Total Order',           en: 'Total Orders',         zh: '总订单'       },
  revenue:               { id: 'Revenue',               en: 'Revenue',              zh: '总收入'       },
  total_customers:       { id: 'Customers',             en: 'Customers',            zh: '客户'         },
  pending_orders:        { id: 'Perlu Tindakan',        en: 'Needs Action',         zh: '待处理'       },
  recent_orders:         { id: 'Order terbaru',         en: 'Recent orders',        zh: '最新订单'     },
  view_all:              { id: 'Lihat semua →',         en: 'View all →',           zh: '查看全部 →'   },
  orders_7days:          { id: 'Order 7 hari terakhir', en: 'Orders last 7 days',   zh: '近7天订单'    },
  sales_by_category:     { id: 'Penjualan per kategori',en: 'Sales by category',    zh: '按类别销售'   },
  this_month:            { id: 'bulan ini',             en: 'this month',           zh: '本月'         },
  new_today:             { id: 'baru hari ini',         en: 'new today',            zh: '今日新增'     },
  needs_action:          { id: 'perlu tindakan',        en: 'needs action',         zh: '待处理'       },

  // ── Orders ───────────────────────────────────────────────────
  orders_title:          { id: 'Orders',                en: 'Orders',               zh: '订单管理'     },
  order_id:              { id: 'ID Order',              en: 'Order ID',             zh: '订单号'       },
  customer:              { id: 'Customer',              en: 'Customer',             zh: '客户'         },
  date:                  { id: 'Tanggal',               en: 'Date',                 zh: '日期'         },
  total:                 { id: 'Total',                 en: 'Total',                zh: '总计'         },
  status:                { id: 'Status',                en: 'Status',               zh: '状态'         },
  payment:               { id: 'Pembayaran',            en: 'Payment',              zh: '付款'         },
  action:                { id: 'Aksi',                  en: 'Action',               zh: '操作'         },
  all_status:            { id: 'Semua Status',          en: 'All Status',           zh: '全部状态'     },
  search_order:          { id: 'Cari order...',         en: 'Search orders...',     zh: '搜索订单...'  },
  no_orders:             { id: 'Belum ada order.',      en: 'No orders yet.',       zh: '暂无订单。'   },
  update_status:         { id: 'Update status',         en: 'Update status',        zh: '更新状态'     },
  order_detail:          { id: 'Detail Order',          en: 'Order Detail',         zh: '订单详情'     },
  shipping_address:      { id: 'Alamat pengiriman',     en: 'Shipping address',     zh: '收货地址'     },
  notes:                 { id: 'Catatan',               en: 'Notes',                zh: '备注'         },
  items:                 { id: 'Item',                  en: 'Items',                zh: '商品'         },
  close:                 { id: 'Tutup',                 en: 'Close',                zh: '关闭'         },
  save:                  { id: 'Simpan',                en: 'Save',                 zh: '保存'         },
  saving:                { id: 'Menyimpan...',          en: 'Saving...',            zh: '保存中...'    },

  // ── Products ─────────────────────────────────────────────────
  products_title:        { id: 'Products',              en: 'Products',             zh: '商品管理'     },
  add_product:           { id: 'Tambah Produk',         en: 'Add Product',          zh: '添加商品'     },
  product_name:          { id: 'Nama Produk',           en: 'Product Name',         zh: '商品名称'     },
  category:              { id: 'Kategori',              en: 'Category',             zh: '类别'         },
  price:                 { id: 'Harga',                 en: 'Price',                zh: '价格'         },
  badge:                 { id: 'Badge',                 en: 'Badge',                zh: '标签'         },
  active:                { id: 'Aktif',                 en: 'Active',               zh: '在售'         },
  inactive:              { id: 'Nonaktif',              en: 'Inactive',             zh: '下架'         },
  edit:                  { id: 'Edit',                  en: 'Edit',                 zh: '编辑'         },
  delete:                { id: 'Hapus',                 en: 'Delete',               zh: '删除'         },
  search_product:        { id: 'Cari produk...',        en: 'Search products...',   zh: '搜索商品...'  },
  no_products:           { id: 'Belum ada produk.',     en: 'No products yet.',     zh: '暂无商品。'   },
  confirm_delete:        { id: 'Hapus produk ini?',     en: 'Delete this product?', zh: '确认删除此商品？' },

  // ── Customers ────────────────────────────────────────────────
  customers_title:       { id: 'Customers',             en: 'Customers',            zh: '客户管理'     },
  phone:                 { id: 'No. HP',                en: 'Phone',                zh: '电话'         },
  address:               { id: 'Alamat',                en: 'Address',              zh: '地址'         },
  order_count:           { id: 'Total Order',           en: 'Orders',               zh: '订单数'       },
  total_spent:           { id: 'Total Belanja',         en: 'Total Spent',          zh: '总消费'       },
  joined:                { id: 'Bergabung',             en: 'Joined',               zh: '加入时间'     },
  search_customer:       { id: 'Cari customer...',      en: 'Search customers...',  zh: '搜索客户...'  },
  no_customers:          { id: 'Belum ada customer.',   en: 'No customers yet.',    zh: '暂无客户。'   },
  order_history:         { id: 'Histori Order',         en: 'Order History',        zh: '订单历史'     },

  // ── Payments ─────────────────────────────────────────────────
  payments_title:        { id: 'Payments',              en: 'Payments',             zh: '付款管理'     },
  payment_method:        { id: 'Metode',                en: 'Method',               zh: '付款方式'     },
  payment_status:        { id: 'Status Bayar',          en: 'Payment Status',       zh: '付款状态'     },
  paid_at:               { id: 'Waktu Bayar',           en: 'Paid At',              zh: '付款时间'     },
  unpaid:                { id: 'Belum Bayar',           en: 'Unpaid',               zh: '未付款'       },
  paid:                  { id: 'Lunas',                 en: 'Paid',                 zh: '已付款'       },
  failed:                { id: 'Gagal',                 en: 'Failed',               zh: '失败'         },
  whatsapp_manual:       { id: 'WhatsApp',              en: 'WhatsApp',             zh: 'WhatsApp'     },
  mark_paid:             { id: 'Tandai Lunas',          en: 'Mark as Paid',         zh: '标记为已付款' },

  // ── Settings ─────────────────────────────────────────────────
  settings_title:        { id: 'Settings',              en: 'Settings',             zh: '系统设置'     },
  store_info:            { id: 'Informasi Toko',        en: 'Store Info',           zh: '店铺信息'     },
  store_name:            { id: 'Nama Toko',             en: 'Store Name',           zh: '店铺名称'     },
  wa_number:             { id: 'Nomor WhatsApp Admin',  en: 'Admin WhatsApp',       zh: '管理员WhatsApp' },
  shipping_options:      { id: 'Opsi Pengiriman',       en: 'Shipping Options',     zh: '配送方式'     },
  language_setting:      { id: 'Bahasa Default',        en: 'Default Language',     zh: '默认语言'     },
  save_settings:         { id: 'Simpan Pengaturan',     en: 'Save Settings',        zh: '保存设置'     },
  settings_saved:        { id: 'Pengaturan tersimpan ✓', en: 'Settings saved ✓',   zh: '设置已保存 ✓' },

  // ── Status labels ─────────────────────────────────────────────
  s_pending:   { id: 'Pending',    en: 'Pending',    zh: '待处理' },
  s_confirmed: { id: 'Dikonfirmasi', en: 'Confirmed', zh: '已确认' },
  s_paid:      { id: 'Lunas',      en: 'Paid',       zh: '已付款' },
  s_shipped:   { id: 'Dikirim',    en: 'Shipped',    zh: '已发货' },
  s_cancelled: { id: 'Dibatalkan', en: 'Cancelled',  zh: '已取消' },

  // ── Common ────────────────────────────────────────────────────
  loading:     { id: 'Memuat...',   en: 'Loading...',  zh: '加载中...' },
  error_load:  { id: 'Gagal memuat data.', en: 'Failed to load data.', zh: '加载失败。' },
  retry:       { id: 'Coba lagi',   en: 'Retry',       zh: '重试'      },
  empty:       { id: 'Tidak ada data.', en: 'No data.', zh: '暂无数据。' },
  cancel:      { id: 'Batal',       en: 'Cancel',      zh: '取消'      },
  confirm:     { id: 'Konfirmasi',  en: 'Confirm',     zh: '确认'      },
  search:      { id: 'Cari',        en: 'Search',      zh: '搜索'      },
  filter:      { id: 'Filter',      en: 'Filter',      zh: '筛选'      },
  all:         { id: 'Semua',       en: 'All',         zh: '全部'      },
  name:        { id: 'Nama',        en: 'Name',        zh: '名称'      },
  description: { id: 'Deskripsi',   en: 'Description', zh: '描述'      },
};

// Helper: ambil teks sesuai bahasa aktif
export const t = (lang, key) => T[key]?.[lang] ?? T[key]?.['id'] ?? key;