// useDokuCheckout.js
// React hook untuk integrasi DOKU Checkout (modal mode + redirect fallback)
//
// Usage:
//   import { useDokuCheckout } from './useDokuCheckout';
//   const { checkout, loading, error } = useDokuCheckout({ mode: 'modal' });
//   await checkout({ order_id, amount, customer_name, customer_phone, line_items });
//
// Modes:
//   'modal'    — Load jokul-checkout-1.0.0.js, call loadJokulCheckout(url) → popup modal
//   'redirect' — window.location.href = payment.url → full-page redirect
//
// Required env (frontend):
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_ANON_KEY
//   VITE_DOKU_MODE=sandbox|production  (determines which JS to load)

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

const DOKU_JS_SANDBOX = "https://sandbox.doku.com/jokul-checkout-js/v1/jokul-checkout-1.0.0.js";
const DOKU_JS_PRODUCTION = "https://jokul.doku.com/jokul-checkout-js/v1/jokul-checkout-1.0.0.js";

let dokuJsPromise = null;

function loadDokuJs(isProduction) {
  if (typeof window === "undefined") return Promise.reject(new Error("window not available"));
  if (typeof window.loadJokulCheckout === "function") return Promise.resolve();
  if (dokuJsPromise) return dokuJsPromise;

  const src = isProduction ? DOKU_JS_PRODUCTION : DOKU_JS_SANDBOX;
  dokuJsPromise = new Promise((resolve, reject) => {
    // Remove any previous instance
    document.querySelectorAll('script[data-doku-checkout-js]').forEach((s) => s.remove());
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.setAttribute("data-doku-checkout-js", "true");
    script.onload = () => {
      if (typeof window.loadJokulCheckout === "function") {
        resolve();
      } else {
        reject(new Error("jokul-checkout-1.0.0.js loaded but loadJokulCheckout not defined"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load jokul-checkout-1.0.0.js"));
    document.head.appendChild(script);
  });
  return dokuJsPromise;
}

export function useDokuCheckout(options = {}) {
  const { mode = "modal" } = options;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paymentUrl, setPaymentUrl] = useState(null);
  const [invoiceNumber, setInvoiceNumber] = useState(null);
  const isProductionRef = useRef(false);

  // Determine production/sandbox from env (with safe fallback)
  useEffect(() => {
    const envFlag = (import.meta?.env?.VITE_DOKU_MODE || "").toLowerCase();
    isProductionRef.current = envFlag === "production";
  }, []);

  // Prefetch JS in modal mode (so popup is instant when clicked)
  useEffect(() => {
    if (mode === "modal") {
      loadDokuJs(isProductionRef.current).catch((e) => {
        console.warn("[DOKU] preload JS failed:", e);
      });
    }
  }, [mode]);

  const checkout = useCallback(
    async (payload) => {
      setLoading(true);
      setError(null);
      setPaymentUrl(null);
      setInvoiceNumber(null);

      try {
        // Call edge function via raw fetch (better error visibility)
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-doku-payment`;
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(payload),
        });

        const text = await resp.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Invalid response from create-doku-payment: ${text.slice(0, 300)}`);
        }

        if (!resp.ok || !data.success) {
          const errMsg = Array.isArray(data.error)
            ? data.error.join(", ")
            : data.error || `HTTP ${resp.status}`;
          console.error("[DOKU] create-doku-payment failed:", data);
          throw new Error(errMsg);
        }

        const { payment_url, invoice_number, token_id, expired_date } = data;
        setPaymentUrl(payment_url);
        setInvoiceNumber(invoice_number);

        if (mode === "redirect") {
          // Full-page redirect
          window.location.href = payment_url;
          return { payment_url, invoice_number, token_id, expired_date };
        }

        // Modal mode — load JS (cached) then open popup
        await loadDokuJs(isProductionRef.current);
        if (typeof window.loadJokulCheckout !== "function") {
          throw new Error("jokul-checkout-1.0.0.js not loaded — fallback to redirect");
        }

        // Open modal
        window.loadJokulCheckout(payment_url);
        return { payment_url, invoice_number, token_id, expired_date };
      } catch (e) {
        console.error("[DOKU] checkout error:", e);
        setError(e.message || String(e));
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [mode]
  );

  return { checkout, loading, error, paymentUrl, invoiceNumber };
}
