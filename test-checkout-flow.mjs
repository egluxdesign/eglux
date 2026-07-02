// test-checkout-flow.mjs
// Run: node test-checkout-flow.mjs

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing env variables. Pastikan .env ada:');
  console.error('   VITE_SUPABASE_URL=');
  console.error('   VITE_SUPABASE_ANON_KEY=');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runTests() {
  console.log('🧪 MEMULAI TEST CHECKOUT FLOW\n');

  // Step 1: Ambil varian untuk test
  console.log('1️⃣ Mengambil sample varian...');
  
  // FIX: Cek error dan data terpisah
  // Ganti query di test
  const { data: variants, error: vError } = await supabase
    .from('product_variants')
    .select('id, sku, stock, name')  // ← ga perlu join
    .limit(3);

  console.log('   Raw data:', variants);
  console.log('   Raw error:', vError);

  if (vError) {
    console.error('❌ Query error:', vError.message);
    return;
  }

  if (!variants || variants.length === 0) {
    console.error('❌ Tidak ada varian di database. Pastikan:');
    console.error('   - Table product_variants punya data');
    console.error('   - RLS policy "Anyone can view variants" aktif');
    console.error('   - Foreign key ke products valid');
    return;
  }

  const testVariant = variants[0];
  console.log(`   ✅ Varian test: ${testVariant.sku} (stok: ${testVariant.stock})`);

  // Step 2: Set stok test = 10
  console.log('\n2️⃣ Set stok test = 10...');
  await supabaseAdmin
    .from('product_variants')
    .update({ stock: 10 })
    .eq('id', testVariant.id);

  // Step 3: Test A - Order sukses (quantity 2)
  console.log('\n3️⃣ TEST A: Order sukses (qty: 2)...');
  const orderA = await createTestOrder(testVariant.id, 2);
  
  if (!orderA.success) {
    console.error('   ❌ Gagal buat order:', orderA.error);
    return;
  }

  console.log(`   ✅ Order created: ${orderA.orderId}`);

  // Panggil Edge Function
  const resultA = await callDeductStock(orderA.orderId);
  console.log(`   📤 Edge Function response:`, JSON.stringify(resultA, null, 2));

  // Cek stok berkurang
  const { data: afterA } = await supabase
    .from('product_variants')
    .select('stock')
    .eq('id', testVariant.id)
    .single();

  console.log(`   📊 Stok setelah: ${afterA.stock} (harusnya: 8)`);
  const testAPass = afterA.stock === 8 && resultA.success;
  console.log(`   ${testAPass ? '✅ TEST A PASS' : '❌ TEST A FAIL'}`);

  // Step 4: Test B - Order gagal stok habis (quantity 20)
  console.log('\n4️⃣ TEST B: Order gagal stok habis (qty: 20)...');
  const orderB = await createTestOrder(testVariant.id, 20);
  
  if (!orderB.success) {
    console.error('   ❌ Gagal buat order:', orderB.error);
    return;
  }

  const resultB = await callDeductStock(orderB.orderId);
  console.log(`   📤 Edge Function response:`, JSON.stringify(resultB, null, 2));

  // Cek order status = cancelled
  const { data: orderBData } = await supabase
    .from('orders')
    .select('status, cancel_reason')
    .eq('id', orderB.orderId)
    .single();

  console.log(`   📊 Order status: ${orderBData.status} (harusnya: cancelled)`);
  const testBPass = orderBData.status === 'cancelled' && !resultB.success;
  console.log(`   ${testBPass ? '✅ TEST B PASS' : '❌ TEST B FAIL'}`);

  // Step 5: Cleanup - reset stok
  console.log('\n5️⃣ Cleanup: Reset stok...');
  await supabaseAdmin
    .from('product_variants')
    .update({ stock: testVariant.stock })
    .eq('id', testVariant.id);

  // Cleanup test orders
  await supabaseAdmin.from('orders').delete().in('id', [orderA.orderId, orderB.orderId]);
  console.log('   ✅ Cleanup selesai');

  // Summary
  console.log('\n📋 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Test A (Sukses):  ${testAPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Test B (Gagal):   ${testBPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

async function createTestOrder(variantId, quantity) {
  const total = 100000 * quantity;

  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      status: 'pending',
      payment_method: 'transfer',
      payment_status: 'pending',
      total_amount: total,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  await supabase.from('order_items').insert({
    order_id: order.id,
    variant_id: variantId,
    quantity: quantity,
    price_at_time: 100000,
    created_at: new Date().toISOString()
  });

  return { success: true, orderId: order.id };
}

async function callDeductStock(orderId) {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/deduct-stock`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ order_id: orderId })
    });

    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

runTests();