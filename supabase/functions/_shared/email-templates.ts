// supabase/functions/_shared/email-templates.ts
// ============================================================================
// Email Templates — HTML email templates untuk EGLUX notifications via Resend
// ============================================================================
//
// Templates:
//   - paymentSuccessEmail(order)      → Payment berhasil
//   - paymentPendingEmail(order)      → Menunggu pembayaran
//   - shippingUpdateEmail(order)      → Pesanan dikirim
//   - orderExpiredEmail(order)        → Pesanan expired
//
// Design: EGLUX brand colors (gold #9a7d4a, cream #f7f3ed, near-black #1a1a1a)
// ============================================================================

export interface OrderEmailData {
  orderId: string;
  orderShortId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  totalAmount: number;
  subtotal: number;
  shippingCost: number;
  taxAmount?: number;
  voucherDiscount?: number;
  voucherCode?: string;
  items: Array<{
    name: string;
    variantName?: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  paymentMethod?: string;
  shippingAddress?: string;
  shippingCity?: string;
  shippingPostalCode?: string;
  courierCode?: string;
  courierService?: string;
  trackingNumber?: string;
  biteshipWaybillUrl?: string;
  storefrontUrl?: string;
}

const rupiah = (n: number | undefined): string => {
  if (!n) return 'Rp 0';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
};

// ============================================================================
// Base layout — wrapper HTML untuk semua email
// ============================================================================
function baseLayout(content: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f7f3ed;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;color:#1a1a1a;line-height:1.6;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${title}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f3ed;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);max-width:600px;width:100%;">

          <!-- Header with logo -->
          <tr>
            <td style="background-color:#cba659;padding:24px 32px;text-align:center;">
              <img src="https://mbuwpjxpxvnsxjusrnlk.supabase.co/storage/v1/object/public/logo/Eglux-Logo-White.svg" alt="EGLUX" width="140" style="display:inline-block;height:auto;" />
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:40px 32px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;background-color:#f7f3ed;border-top:1px solid #e8e4df;text-align:center;">
              <p style="margin:0;font-size:12px;color:#8a8a8a;">
                Email ini dikirim otomatis oleh sistem EGLUX. Mohon jangan balas email ini.
              </p>
              <p style="margin:8px 0 0;font-size:12px;color:#8a8a8a;">
                &copy; ${new Date().getFullYear()} EGLUX. All rights reserved.
              </p>
              <p style="margin:4px 0 0;font-size:12px;">
                <a href="mailto:contact@eglux.co.id" style="color:#9a7d4a;text-decoration:none;">contact@eglux.co.id</a>
                &middot;
                <a href="https://eglux.co.id" style="color:#9a7d4a;text-decoration:none;">eglux.co.id</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ============================================================================
// Helper: Order items table
// ============================================================================
function itemsTable(items: OrderEmailData['items']): string {
  if (!items || items.length === 0) return '';
  const rows = items.map(item => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #e8e4df;">
        <p style="margin:0;font-weight:600;font-size:14px;color:#1a1a1a;">${item.name}</p>
        ${item.variantName ? `<p style="margin:2px 0 0;font-size:12px;color:#8a8a8a;">${item.variantName}</p>` : ''}
        <p style="margin:4px 0 0;font-size:12px;color:#8a8a8a;">${item.quantity}× ${rupiah(item.unitPrice)}</p>
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #e8e4df;text-align:right;vertical-align:top;font-weight:600;font-size:14px;color:#1a1a1a;">
        ${rupiah(item.subtotal)}
      </td>
    </tr>
  `).join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <thead>
        <tr>
          <th style="padding:8px 0;border-bottom:2px solid #1a1a1a;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8a8a8a;">Produk</th>
          <th style="padding:8px 0;border-bottom:2px solid #1a1a1a;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8a8a8a;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

// ============================================================================
// Helper: Payment breakdown
// ============================================================================
function paymentBreakdown(data: OrderEmailData): string {
  const lines: string[] = [];
  lines.push(`<tr><td style="padding:6px 0;font-size:14px;color:#3a3944;">Subtotal Produk</td><td style="padding:6px 0;text-align:right;font-size:14px;color:#3a3944;">${rupiah(data.subtotal)}</td></tr>`);

  if (data.taxAmount && data.taxAmount > 0) {
    lines.push(`<tr><td style="padding:6px 0;font-size:14px;color:#3a3944;">Biaya Admin &amp; Tax</td><td style="padding:6px 0;text-align:right;font-size:14px;color:#3a3944;">${rupiah(data.taxAmount)}</td></tr>`);
  }

  if (data.voucherDiscount && data.voucherDiscount > 0) {
    lines.push(`<tr><td style="padding:6px 0;font-size:14px;color:#16a34a;">🎟️ Voucher${data.voucherCode ? ` (${data.voucherCode})` : ''}</td><td style="padding:6px 0;text-align:right;font-size:14px;color:#16a34a;font-weight:600;">− ${rupiah(data.voucherDiscount)}</td></tr>`);
  }

  if (data.shippingCost > 0) {
    const courier = data.courierCode ? ` (${data.courierCode}${data.courierService ? ` ${data.courierService}` : ''})` : '';
    lines.push(`<tr><td style="padding:6px 0;font-size:14px;color:#3a3944;">Ongkir${courier}</td><td style="padding:6px 0;text-align:right;font-size:14px;color:#3a3944;">${rupiah(data.shippingCost)}</td></tr>`);
  }

  lines.push(`<tr><td style="padding:16px 0 8px;border-top:2px solid #1a1a1a;font-weight:700;font-size:16px;color:#1a1a1a;">Total Pembayaran</td><td style="padding:16px 0 8px;border-top:2px solid #1a1a1a;text-align:right;font-weight:700;font-size:18px;color:#9a7d4a;">${rupiah(data.totalAmount)}</td></tr>`);

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
      ${lines.join('')}
    </table>
  `;
}

// ============================================================================
// Helper: CTA button
// ============================================================================
function ctaButton(text: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
      <tr>
        <td style="background-color:#9a7d4a;border-radius:8px;">
          <a href="${url}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.5px;">
            ${text}
          </a>
        </td>
      </tr>
    </table>
  `;
}

// ============================================================================
// TEMPLATE 1: Payment Success
// ============================================================================
export function paymentSuccessEmail(data: OrderEmailData): { subject: string; html: string } {
  const storefrontUrl = data.storefrontUrl || 'https://eglux.vercel.app';
  const content = `
    <div style="text-align:center;">
      <!-- Success icon -->
      <div style="width:64px;height:64px;background-color:#dcfce7;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
        <span style="font-size:32px;color:#16a34a;font-weight:bold;">✓</span>
      </div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1a1a1a;">Pembayaran Berhasil!</h1>
      <p style="margin:0 0 4px;font-size:14px;color:#8a8a8a;">Terima kasih, pembayaran Anda telah kami terima.</p>
      <p style="margin:0;font-size:14px;color:#8a8a8a;">Pesanan Anda sedang kami proses.</p>
    </div>

    <!-- Order info -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;background-color:#f7f3ed;border-radius:8px;padding:16px;">
      <tr>
        <td style="padding:4px 16px;font-size:13px;color:#8a8a8a;">No. Pesanan</td>
        <td style="padding:4px 16px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;">#${data.orderShortId}</td>
      </tr>
      <tr>
        <td style="padding:4px 16px;font-size:13px;color:#8a8a8a;">Pembeli</td>
        <td style="padding:4px 16px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;">${data.customerName}</td>
      </tr>
      ${data.paymentMethod ? `<tr><td style="padding:4px 16px;font-size:13px;color:#8a8a8a;">Metode Bayar</td><td style="padding:4px 16px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;">${data.paymentMethod}</td></tr>` : ''}
    </table>

    <!-- Items -->
    <h2 style="margin:24px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#8a8a8a;font-weight:600;">Rincian Pesanan</h2>
    ${itemsTable(data.items)}

    <!-- Payment breakdown -->
    ${paymentBreakdown(data)}

    <!-- Shipping address (if available) -->
    ${data.shippingAddress ? `
      <h2 style="margin:24px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#8a8a8a;font-weight:600;">Alamat Pengiriman</h2>
      <p style="margin:0;padding:12px 16px;background-color:#f7f3ed;border-radius:8px;font-size:14px;color:#3a3944;line-height:1.6;">
        <strong>${data.customerName}</strong><br>
        ${data.shippingAddress}<br>
        ${[data.shippingCity, data.shippingPostalCode].filter(Boolean).join(', ')}
      </p>
    ` : ''}

    <!-- CTA -->
    ${ctaButton('Lacak Pesanan', `${storefrontUrl}/orders?order=${data.orderId}`)}

    <p style="margin:24px 0 0;font-size:13px;color:#8a8a8a;text-align:center;">
      Punya pertanyaan? Balas email ini atau hubungi <a href="mailto:contact@eglux.co.id" style="color:#9a7d4a;">contact@eglux.co.id</a>
    </p>
  `;

  return {
    subject: `✅ Pembayaran Berhasil — Pesanan #${data.orderShortId}`,
    html: baseLayout(content, 'Pembayaran Berhasil'),
  };
}

// ============================================================================
// TEMPLATE 2: Payment Pending (menunggu bayar)
// ============================================================================
export function paymentPendingEmail(data: OrderEmailData): { subject: string; html: string } {
  const storefrontUrl = data.storefrontUrl || 'https://eglux.vercel.app';
  const content = `
    <div style="text-align:center;">
      <div style="width:64px;height:64px;background-color:#fef3c7;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
        <span style="font-size:32px;">⏳</span>
      </div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1a1a1a;">Menunggu Pembayaran</h1>
      <p style="margin:0 0 4px;font-size:14px;color:#8a8a8a;">Selesaikan pembayaran dalam 24 jam.</p>
      <p style="margin:0;font-size:14px;color:#8a8a8a;">Pesanan akan otomatis dibatalkan jika tidak dibayar.</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;background-color:#f7f3ed;border-radius:8px;padding:16px;">
      <tr>
        <td style="padding:4px 16px;font-size:13px;color:#8a8a8a;">No. Pesanan</td>
        <td style="padding:4px 16px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;">#${data.orderShortId}</td>
      </tr>
      <tr>
        <td style="padding:4px 16px;font-size:13px;color:#8a8a8a;">Total Pembayaran</td>
        <td style="padding:4px 16px;font-size:16px;font-weight:700;color:#9a7d4a;text-align:right;">${rupiah(data.totalAmount)}</td>
      </tr>
    </table>

    ${ctaButton('Bayar Sekarang', `${storefrontUrl}/orders`)}

    <p style="margin:24px 0 0;font-size:13px;color:#8a8a8a;text-align:center;">
      Klik tombol di atas untuk melihat instruksi pembayaran.<br>
      Atau login ke akun Anda di <a href="${storefrontUrl}" style="color:#9a7d4a;">eglux.id</a> → Pesanan Saya.
    </p>
  `;

  return {
    subject: `⏳ Menunggu Pembayaran — Pesanan #${data.orderShortId}`,
    html: baseLayout(content, 'Menunggu Pembayaran'),
  };
}

// ============================================================================
// TEMPLATE 3: Shipping Update (pesanan dikirim)
// ============================================================================
export function shippingUpdateEmail(data: OrderEmailData): { subject: string; html: string } {
  const storefrontUrl = data.storefrontUrl || 'https://eglux.vercel.app';
  const trackUrl = data.biteshipWaybillUrl || `${storefrontUrl}/track?order=${data.orderId}`;
  const content = `
    <div style="text-align:center;">
      <div style="width:64px;height:64px;background-color:#f3e8ff;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
        <span style="font-size:32px;">📦</span>
      </div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1a1a1a;">Pesanan Dikirim!</h1>
      <p style="margin:0;font-size:14px;color:#8a8a8a;">Paket Anda sedang dalam perjalanan.</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;background-color:#f7f3ed;border-radius:8px;padding:16px;">
      <tr>
        <td style="padding:4px 16px;font-size:13px;color:#8a8a8a;">No. Pesanan</td>
        <td style="padding:4px 16px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;">#${data.orderShortId}</td>
      </tr>
      ${data.courierCode ? `<tr><td style="padding:4px 16px;font-size:13px;color:#8a8a8a;">Kurir</td><td style="padding:4px 16px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;text-transform:uppercase;">${data.courierCode}${data.courierService ? ` · ${data.courierService}` : ''}</td></tr>` : ''}
      ${data.trackingNumber ? `<tr><td style="padding:4px 16px;font-size:13px;color:#8a8a8a;">No. Resi</td><td style="padding:4px 16px;font-size:13px;font-family:monospace;font-weight:600;color:#9a7d4a;text-align:right;">${data.trackingNumber}</td></tr>` : ''}
    </table>

    ${ctaButton('Lacak Paket', trackUrl)}

    <p style="margin:24px 0 0;font-size:13px;color:#8a8a8a;text-align:center;">
      Klik tombol di atas untuk melacak paket Anda secara real-time.
    </p>
  `;

  return {
    subject: `📦 Pesanan Dikirim — #${data.orderShortId}${data.trackingNumber ? ` · Resi: ${data.trackingNumber}` : ''}`,
    html: baseLayout(content, 'Pesanan Dikirim'),
  };
}

// ============================================================================
// TEMPLATE 4: Order Expired
// ============================================================================
export function orderExpiredEmail(data: OrderEmailData): { subject: string; html: string } {
  const storefrontUrl = data.storefrontUrl || 'https://eglux.vercel.app';
  const content = `
    <div style="text-align:center;">
      <div style="width:64px;height:64px;background-color:#fee2e2;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
        <span style="font-size:32px;">⏰</span>
      </div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1a1a1a;">Pesanan Kadaluwarsa</h1>
      <p style="margin:0 0 4px;font-size:14px;color:#8a8a8a;">Pesanan Anda telah dibatalkan karena melewati batas waktu pembayaran (24 jam).</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;background-color:#f7f3ed;border-radius:8px;padding:16px;">
      <tr>
        <td style="padding:4px 16px;font-size:13px;color:#8a8a8a;">No. Pesanan</td>
        <td style="padding:4px 16px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;">#${data.orderShortId}</td>
      </tr>
      <tr>
        <td style="padding:4px 16px;font-size:13px;color:#8a8a8a;">Total</td>
        <td style="padding:4px 16px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;">${rupiah(data.totalAmount)}</td>
      </tr>
    </table>

    <p style="margin:0 0 24px;font-size:14px;color:#3a3944;text-align:center;">
      Ingin membeli produk yang sama? Buat pesanan baru di EGLUX.
    </p>

    ${ctaButton('Belanja Lagi', `${storefrontUrl}/products`)}

    <p style="margin:24px 0 0;font-size:13px;color:#8a8a8a;text-align:center;">
      Punya pertanyaan? Hubungi <a href="mailto:hello@eglux.id" style="color:#9a7d4a;">hello@eglux.id</a>
    </p>
  `;

  return {
    subject: `⏰ Pesanan Kadaluwarsa — #${data.orderShortId}`,
    html: baseLayout(content, 'Pesanan Kadaluwarsa'),
  };
}
